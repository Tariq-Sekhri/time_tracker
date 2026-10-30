use super::{
    ActivityCategoryOption, ExportActivityCategory, ExportActivityLog, ExportActivitySession,
    ExportAppGroup, ExportDataset, ExportDevice, ExportFilterOptions, ExportManualCategory,
    ExportManualEntry, ExportScope, ExportSessionApp,
};
use crate::db::queries::category_match::{build_regex_table, derive_category, FALLBACK_CATEGORY};
use crate::db::queries::week::{get_time_blocks_with, transform_time_blocks, TimeBlockSettings};
use crate::db::tables::app_group::{build_app_group_matchers, resolve_app_group, AppGroup};
use crate::db::tables::cat_regex::CategoryRegex;
use crate::db::tables::category::Category;
use crate::db::tables::device::local_device_name;
use crate::db::tables::log::{Log, PENDING_LOCAL_DEVICE_UUID};
use crate::db::tables::manual_project::categories_for_pool;
use crate::db::Error;
use regex::Regex;
use sqlx::SqlitePool;
use std::collections::{BTreeMap, HashMap, HashSet};

pub(crate) struct ExportContext<'a> {
    pub settings: &'a TimeBlockSettings,
    pub app_version: String,
    pub generated_at: i64,
}

const UNCATEGORIZED: &str = "Uncategorized";

pub(super) struct DeviceDirectory {
    pub devices: Vec<ExportDevice>,
    names: HashMap<String, String>,
    /// Device that owns logs stored without a registered uuid, as in `get_local_log_device_uuid`.
    local_uuid: Option<String>,
}

impl DeviceDirectory {
    /// Logs recorded before registration (pending/NULL uuid) belong to the local device.
    fn resolve(&self, uuid: Option<&str>) -> String {
        match uuid {
            Some(uuid) if !uuid.is_empty() && uuid != PENDING_LOCAL_DEVICE_UUID => uuid.to_string(),
            _ => self
                .local_uuid
                .clone()
                .unwrap_or_else(|| PENDING_LOCAL_DEVICE_UUID.to_string()),
        }
    }

    fn name(&self, uuid: &str) -> String {
        match self.names.get(uuid) {
            Some(name) => name.clone(),
            None if uuid == PENDING_LOCAL_DEVICE_UUID => local_device_name(),
            None => uuid.to_string(),
        }
    }
}

pub(super) async fn load_devices(pool: &SqlitePool) -> Result<DeviceDirectory, Error> {
    let rows: Vec<(String, String, String, Option<String>, bool, bool)> = sqlx::query_as(
        "SELECT uuid, name, kind, token, in_cal, in_stats FROM devices ORDER BY rowid",
    )
    .fetch_all(pool)
    .await?;
    let registered_local = rows
        .iter()
        .find(|row| row.2 == "local" && row.3.is_some())
        .map(|row| row.0.clone());
    let local_uuid = match registered_local {
        Some(uuid) => Some(uuid),
        None => {
            let has_pending: bool = sqlx::query_scalar(
                "SELECT EXISTS (SELECT 1 FROM logs WHERE device_uuid = ?1 AND is_deleted = 0 LIMIT 1)",
            )
            .bind(PENDING_LOCAL_DEVICE_UUID)
            .fetch_one(pool)
            .await?;
            has_pending.then(|| PENDING_LOCAL_DEVICE_UUID.to_string())
        }
    };
    let mut devices: Vec<ExportDevice> = rows
        .into_iter()
        .map(|(uuid, name, kind, _, in_cal, in_stats)| ExportDevice {
            uuid,
            name,
            kind: if kind == "local" { "local" } else { "remote" }.to_string(),
            in_cal,
            in_stats,
        })
        .collect();
    // Activity recorded before this device registered still needs a device to filter by.
    if local_uuid.as_deref() == Some(PENDING_LOCAL_DEVICE_UUID)
        && !devices.iter().any(|device| device.uuid == PENDING_LOCAL_DEVICE_UUID)
    {
        devices.push(ExportDevice {
            uuid: PENDING_LOCAL_DEVICE_UUID.to_string(),
            name: local_device_name(),
            kind: "local".to_string(),
            in_cal: true,
            in_stats: true,
        });
    }
    let names = devices
        .iter()
        .map(|device| (device.uuid.clone(), device.name.clone()))
        .collect();
    Ok(DeviceDirectory { devices, names, local_uuid })
}

async fn load_categories(pool: &SqlitePool) -> Result<(Vec<Category>, Vec<CategoryRegex>), Error> {
    let categories = sqlx::query_as::<_, Category>(
        "SELECT id, name, priority, color, regex_enabled, is_visible, in_stats, is_collapsed, parent_id
         FROM category ORDER BY priority DESC",
    )
    .fetch_all(pool)
    .await?;
    let rules = sqlx::query_as::<_, CategoryRegex>(
        "SELECT id, cat_id, regex FROM category_regex WHERE cat_id IS NOT NULL ORDER BY id",
    )
    .fetch_all(pool)
    .await?;
    Ok((categories, rules))
}

async fn load_manual_categories(pool: &SqlitePool) -> Result<Vec<ExportManualCategory>, Error> {
    let categories = categories_for_pool(pool).await?;
    let names: HashMap<i64, String> = categories
        .iter()
        .filter_map(|category| category.id.map(|id| (id, category.name.clone())))
        .collect();
    let mut rules: HashMap<i64, Vec<String>> = HashMap::new();
    for (project_id, regex) in sqlx::query_as::<_, (i64, String)>(
        "SELECT manual_project_id, regex FROM category_regex WHERE manual_project_id IS NOT NULL ORDER BY id",
    )
    .fetch_all(pool)
    .await?
    {
        rules.entry(project_id).or_default().push(regex);
    }
    Ok(categories
        .into_iter()
        .map(|category| ExportManualCategory {
            rules: category.id.and_then(|id| rules.remove(&id)).unwrap_or_default(),
            priority: category.priority,
            parent_name: category.parent_id.and_then(|id| names.get(&id).cloned()),
            id: category.id,
            name: category.name,
            color: category.color,
            parent_id: category.parent_id,
        })
        .collect())
}

pub(crate) async fn filter_options(pool: &SqlitePool) -> Result<ExportFilterOptions, Error> {
    let devices = load_devices(pool).await?.devices;
    let activity_categories =
        sqlx::query_as::<_, (String, Option<String>)>("SELECT name, color FROM category WHERE parent_id IS NULL ORDER BY priority DESC")
            .fetch_all(pool)
            .await?
            .into_iter()
            .map(|(name, color)| ActivityCategoryOption { name, color })
            .collect();
    let manual_categories = load_manual_categories(pool).await?;
    // Both lookups can use the active-timestamp index instead of scanning every log.
    let log_start: Option<i64> =
        sqlx::query_scalar("SELECT MIN(timestamp) FROM logs WHERE is_deleted = 0")
            .fetch_one(pool)
            .await?;
    let log_end: Option<i64> = sqlx::query_scalar(
        "SELECT MAX(timestamp + duration) FROM logs WHERE is_deleted = 0",
    )
    .fetch_one(pool)
    .await?;
    let (manual_start, manual_end): (Option<i64>, Option<i64>) =
        sqlx::query_as("SELECT MIN(start_time), MAX(end_time) FROM manual_time_blocks")
            .fetch_one(pool)
            .await?;
    let earliest = [log_start, manual_start].into_iter().flatten().min();
    let latest = [log_end, manual_end].into_iter().flatten().max();
    Ok(ExportFilterOptions {
        devices,
        activity_categories,
        manual_categories,
        data_start: earliest,
        data_end: latest,
    })
}

/// Per-title facts shared by every log with that exact title, so a long range
/// runs the category, app-group and skipped-app regexes once per title.
struct TitleInfo {
    skipped: bool,
    category: String,
    app_group: Option<String>,
}

pub(crate) async fn export(
    pool: &SqlitePool,
    scope: &ExportScope,
    context: &ExportContext<'_>,
) -> Result<ExportDataset, Error> {
    if scope.range_end <= scope.range_start {
        return Err(anyhow::anyhow!("Range end must be after range start").into());
    }
    let include = &scope.include;
    let mut dataset = ExportDataset {
        generated_at: context.generated_at,
        app_version: context.app_version.clone(),
        range_start: scope.range_start,
        range_end: scope.range_end,
        manual_entries: Vec::new(),
        activity_sessions: Vec::new(),
        activity_logs: Vec::new(),
        devices: Vec::new(),
        activity_categories: Vec::new(),
        manual_categories: Vec::new(),
        app_groups: Vec::new(),
        skipped_apps: Vec::new(),
    };

    let needs_activity = include.activity_sessions || include.activity_logs;
    let devices = if needs_activity || include.devices {
        Some(load_devices(pool).await?)
    } else {
        None
    };
    let categories = if needs_activity || include.activity_categories {
        Some(load_categories(pool).await?)
    } else {
        None
    };
    let app_groups = if needs_activity || include.app_groups {
        sqlx::query_as::<_, AppGroup>("SELECT id, name, regex FROM app_groups ORDER BY id")
            .fetch_all(pool)
            .await?
    } else {
        Vec::new()
    };
    let skipped_apps: Vec<String> = if needs_activity || include.skipped_apps {
        sqlx::query_scalar("SELECT regex FROM skipped_apps ORDER BY regex")
            .fetch_all(pool)
            .await?
    } else {
        Vec::new()
    };
    let manual_categories = if include.manual_entries || include.manual_categories {
        load_manual_categories(pool).await?
    } else {
        Vec::new()
    };

    if include.manual_entries {
        dataset.manual_entries = export_manual_entries(pool, scope, &manual_categories).await?;
    }

    if needs_activity {
        let (Some(devices), Some((categories, rules))) = (&devices, &categories) else {
            unreachable!("activity exports load devices and categories");
        };
        let (sessions, logs) =
            export_activity(pool, scope, context.settings, devices, categories, rules, &app_groups, &skipped_apps)
                .await?;
        dataset.activity_sessions = sessions;
        dataset.activity_logs = logs;
    }

    if include.devices {
        dataset.devices = devices.map(|devices| devices.devices).unwrap_or_default();
    }
    if include.activity_categories {
        if let Some((categories, rules)) = &categories {
            let mut rules_by_category: HashMap<i32, Vec<String>> = HashMap::new();
            for rule in rules {
                rules_by_category.entry(rule.cat_id).or_default().push(rule.regex.clone());
            }
            let names: HashMap<i32, &String> = categories.iter().map(|category| (category.id, &category.name)).collect();
            dataset.activity_categories = categories
                .iter()
                .map(|category| ExportActivityCategory {
                    parent_name: category.parent_id.and_then(|id| names.get(&id).map(|name| (*name).clone())),
                    name: category.name.clone(),
                    color: category.color.clone(),
                    priority: category.priority,
                    is_visible: category.is_visible,
                    in_stats: category.in_stats,
                    rules: rules_by_category.remove(&category.id).unwrap_or_default(),
                })
                .collect();
        }
    }
    if include.manual_categories {
        dataset.manual_categories = manual_categories;
    }
    if include.app_groups {
        dataset.app_groups = app_groups
            .into_iter()
            .map(|group| ExportAppGroup { name: group.name, regex: group.regex })
            .collect();
    }
    if include.skipped_apps {
        dataset.skipped_apps = skipped_apps;
    }
    Ok(dataset)
}

async fn export_manual_entries(
    pool: &SqlitePool,
    scope: &ExportScope,
    categories: &[ExportManualCategory],
) -> Result<Vec<ExportManualEntry>, Error> {
    type Row = (i64, String, Option<String>, Option<i64>, i64, i64, i64, i64);
    let rows: Vec<Row> = sqlx::query_as(
        "SELECT id, title, notes, project_id, start_time, end_time, created_at, updated_at
         FROM manual_time_blocks
         WHERE start_time >= ?1 AND start_time < ?2
         ORDER BY start_time, id",
    )
    .bind(scope.range_start)
    .bind(scope.range_end)
    .fetch_all(pool)
    .await?;
    let by_id: HashMap<Option<i64>, &ExportManualCategory> =
        categories.iter().map(|category| (category.id, category)).collect();
    let wanted: Option<HashSet<Option<i64>>> = scope
        .manual_category_ids
        .as_ref()
        .map(|ids| ids.iter().copied().collect());
    let mut entries = Vec::new();
    for (id, title, notes, project_id, start_time, end_time, created_at, updated_at) in rows {
        // An entry whose project vanished is shown as Uncategorized everywhere else.
        let category_id = project_id.filter(|id| by_id.contains_key(&Some(*id)));
        if wanted.as_ref().is_some_and(|wanted| !wanted.contains(&category_id)) {
            continue;
        }
        let category = by_id.get(&category_id);
        entries.push(ExportManualEntry {
            id,
            title,
            notes,
            category_id,
            category: category
                .map(|category| category.name.clone())
                .unwrap_or_else(|| UNCATEGORIZED.to_string()),
            parent_category: category.and_then(|category| category.parent_name.clone()),
            category_color: category
                .map(|category| category.color.clone())
                .unwrap_or_default(),
            start_time,
            end_time,
            duration: end_time - start_time,
            created_at,
            updated_at,
        });
    }
    Ok(entries)
}

#[allow(clippy::too_many_arguments)]
async fn export_activity(
    pool: &SqlitePool,
    scope: &ExportScope,
    settings: &TimeBlockSettings,
    devices: &DeviceDirectory,
    categories: &[Category],
    rules: &[CategoryRegex],
    app_groups: &[AppGroup],
    skipped_apps: &[String],
) -> Result<(Vec<ExportActivitySession>, Vec<ExportActivityLog>), Error> {
    let include = &scope.include;
    let regexes = build_regex_table(categories, rules)?;
    let group_matchers = build_app_group_matchers(app_groups)?;
    let skipped: Vec<Regex> = skipped_apps
        .iter()
        .filter_map(|pattern| {
            crate::logger::Log::result("Invalid skipped-app regex", Regex::new(pattern)).ok()
        })
        .collect();
    let colors: HashMap<&str, Option<String>> = categories
        .iter()
        .map(|category| (category.name.as_str(), category.color.clone()))
        .collect();
    let device_filter: Option<HashSet<&str>> = scope
        .device_uuids
        .as_ref()
        .map(|uuids| uuids.iter().map(String::as_str).collect());
    let category_filter: Option<HashSet<&str>> = scope
        .activity_categories
        .as_ref()
        .map(|names| names.iter().map(String::as_str).collect());
    let category_selected =
        |category: &str| category_filter.as_ref().is_none_or(|names| names.contains(category));

    let logs = sqlx::query_as::<_, Log>(
        "SELECT id, device_uuid, app, timestamp, duration, is_deleted FROM logs
         WHERE is_deleted = 0 AND timestamp >= ?1 AND timestamp < ?2 ORDER BY rowid",
    )
    .bind(scope.range_start)
    .bind(scope.range_end)
    .fetch_all(pool)
    .await?;

    let mut titles: HashMap<String, TitleInfo> = HashMap::new();
    let mut exported_logs = Vec::new();
    let mut by_device: BTreeMap<String, Vec<Log>> = BTreeMap::new();
    for log in logs {
        if !titles.contains_key(&log.app) {
            let grouped = resolve_app_group(&log.app, &group_matchers);
            // resolve_app_group hands back the title itself when no group matches.
            let app_group = (!std::ptr::eq(grouped, log.app.as_str())).then(|| grouped.to_string());
            let info = TitleInfo {
                skipped: skipped.iter().any(|regex| regex.is_match(&log.app)),
                category: derive_category(&log.app, &regexes),
                app_group,
            };
            titles.insert(log.app.clone(), info);
        }
        let info = &titles[&log.app];
        if info.skipped {
            continue;
        }
        let device = devices.resolve(log.device_uuid.as_deref());
        if device_filter.as_ref().is_some_and(|uuids| !uuids.contains(device.as_str())) {
            continue;
        }
        if include.activity_logs && category_selected(&info.category) {
            exported_logs.push(ExportActivityLog {
                device_name: devices.name(&device),
                // Keep the original composite primary key. Pending-local log IDs
                // can overlap those of the registered local device; normalizing
                // both UUIDs would silently discard rows on a later import.
                device_uuid: log.device_uuid.clone().unwrap_or_else(|| PENDING_LOCAL_DEVICE_UUID.to_string()),
                id: log.id,
                app: log.app.clone(),
                app_group: info.app_group.clone(),
                category: info.category.clone(),
                timestamp: log.timestamp,
                duration: log.duration,
            });
        }
        if include.activity_sessions {
            by_device.entry(device).or_default().push(log);
        }
    }
    exported_logs.sort_by_key(|log| log.timestamp);

    let mut sessions = Vec::new();
    for (device, logs) in by_device {
        let category_of = |app: &str| -> Result<String, Error> {
            Ok(titles
                .get(app)
                .map(|info| info.category.clone())
                .unwrap_or_else(|| FALLBACK_CATEGORY.to_string()))
        };
        // Built per device with the calendar's own rules, then narrowed to the
        // chosen categories so block boundaries match what the calendar shows.
        let blocks = get_time_blocks_with(&logs, category_of, &group_matchers, settings)?;
        let device_name = devices.name(&device);
        for block in transform_time_blocks(blocks, settings)? {
            if !category_selected(&block.category) {
                continue;
            }
            let mut apps: Vec<ExportSessionApp> = block
                .apps
                .into_iter()
                .map(|app| ExportSessionApp { app: app.app, duration: app.total_duration })
                .collect();
            apps.sort_by(|a, b| b.duration.cmp(&a.duration).then_with(|| a.app.cmp(&b.app)));
            sessions.push(ExportActivitySession {
                device_uuid: device.clone(),
                device_name: device_name.clone(),
                category_color: colors.get(block.category.as_str()).cloned().flatten(),
                category: block.category,
                start_time: block.start_time,
                end_time: block.end_time,
                duration: block.end_time - block.start_time,
                active_duration: apps.iter().map(|app| app.duration).sum(),
                apps,
            });
        }
    }
    sessions.sort_by(|a, b| {
        a.start_time
            .cmp(&b.start_time)
            .then_with(|| a.device_uuid.cmp(&b.device_uuid))
    });
    Ok((sessions, exported_logs))
}
