use super::{DuplicateStrategy, ImportActivityLog, ImportReport, ImportRequest, ImportRowIssue};
use crate::db::tables::log::PENDING_LOCAL_DEVICE_UUID;
use crate::db::tables::manual_project::PATH_SEPARATOR;
use crate::db::Error;
use regex::Regex;
use sqlx::{QueryBuilder, Sqlite, SqliteConnection, SqlitePool};
use std::collections::{HashMap, HashSet};

/// Logs exported from a device that never registered carry the pending-local
/// marker. Importing them under that marker would make them this device's own
/// activity (and upload them as such), so they get their own device instead.
pub(super) const UNREGISTERED_IMPORT_DEVICE_UUID: &str = "imported-unregistered-device";
const UNREGISTERED_IMPORT_DEVICE_NAME: &str = "Imported device";
const LOG_INSERT_CHUNK: usize = 1000;
const MAX_TITLE_CHARS: usize = 200;
const MAX_CATEGORY_NAME_CHARS: usize = 100;

/// Everything runs in one transaction; a dry run rolls it back, so the report
/// is computed by exactly the same code that performs a real import.
pub(crate) async fn import(pool: &SqlitePool, request: &ImportRequest, now: i64) -> Result<ImportReport, Error> {
    validate_metadata(request)?;
    let mut report = ImportReport { dry_run: request.dry_run, ..Default::default() };
    let mut tx = pool.begin().await?;
    import_devices(&mut tx, request, &mut report).await?;
    import_activity_categories(&mut tx, request, &mut report).await?;
    import_app_groups(&mut tx, request, &mut report).await?;
    import_skipped_apps(&mut tx, request, &mut report).await?;
    let mut manual_categories = ManualCategoryIndex::load(&mut tx).await?;
    import_manual_categories(&mut tx, request, &mut manual_categories, &mut report).await?;
    import_manual_entries(&mut tx, request, &mut manual_categories, now, &mut report).await?;
    import_activity_logs(&mut tx, &request.activity_logs, &mut report).await?;
    if request.dry_run {
        tx.rollback().await?;
    } else {
        tx.commit().await?;
    }
    Ok(report)
}

fn fold(name: &str) -> String {
    name.trim().to_lowercase()
}

fn import_device_uuid(uuid: &str) -> &str {
    let uuid = uuid.trim();
    if uuid == PENDING_LOCAL_DEVICE_UUID {
        UNREGISTERED_IMPORT_DEVICE_UUID
    } else {
        uuid
    }
}

async fn insert_remote_device(conn: &mut SqliteConnection, uuid: &str, name: &str) -> Result<u64, Error> {
    Ok(sqlx::query(
        "INSERT OR IGNORE INTO devices (uuid, name, kind, token, is_tracking, last_sync_id, is_active, in_cal, in_stats)
         VALUES (?1, ?2, 'remote', NULL, 0, 0, 0, 1, 1)",
    )
    .bind(uuid)
    .bind(name)
    .execute(&mut *conn)
    .await?
    .rows_affected())
}

/// Adds devices the file knows about, plus any device only referenced by its
/// logs. Existing devices are never modified.
async fn import_devices(conn: &mut SqliteConnection, request: &ImportRequest, report: &mut ImportReport) -> Result<(), Error> {
    let mut known: HashSet<String> = sqlx::query_scalar::<_, String>("SELECT uuid FROM devices")
        .fetch_all(&mut *conn)
        .await?
        .into_iter()
        .collect();
    let mut names: HashMap<&str, &str> = HashMap::new();
    for device in &request.devices {
        let name = device.name.trim();
        if !name.is_empty() {
            names.entry(import_device_uuid(&device.uuid)).or_insert(name);
        }
    }
    let referenced = request
        .devices
        .iter()
        .map(|device| import_device_uuid(&device.uuid))
        .chain(request.activity_logs.iter().map(|log| import_device_uuid(&log.device_uuid)));
    for uuid in referenced {
        if uuid.is_empty() || known.contains(uuid) {
            continue;
        }
        let name = names.get(uuid).copied().unwrap_or(if uuid == UNREGISTERED_IMPORT_DEVICE_UUID {
            UNREGISTERED_IMPORT_DEVICE_NAME
        } else {
            uuid
        });
        report.devices_added += insert_remote_device(conn, uuid, name).await?;
        known.insert(uuid.to_string());
    }
    Ok(())
}

/// Metadata has no per-row rejection report. Reject the request up front rather
/// than reporting success after silently dropping selected rules or categories.
fn validate_metadata(request: &ImportRequest) -> Result<(), Error> {
    let pattern = |value: &str, section: &str| -> Result<(), Error> {
        if value.trim().is_empty() {
            return Err(anyhow::anyhow!("{section}: the regex pattern is empty. Correct the export file and try again.").into());
        }
        Regex::new(value)
            .map_err(|error| anyhow::anyhow!("{section}: invalid regex ({error}). Correct the export file and try again."))?;
        Ok(())
    };
    for (index, category) in request.activity_categories.iter().enumerate() {
        if category.name.trim().is_empty() {
            return Err(anyhow::anyhow!("Activity categories row {}: category name is empty.", index + 1).into());
        }
        for (rule_index, rule) in category.rules.iter().enumerate() {
            pattern(rule, &format!("Activity category \"{}\", rule {}", category.name.trim(), rule_index + 1))?;
        }
    }
    for (index, group) in request.app_groups.iter().enumerate() {
        if group.name.trim().is_empty() {
            return Err(anyhow::anyhow!("App groups row {}: group name is empty.", index + 1).into());
        }
        pattern(group.regex.trim(), &format!("App group \"{}\"", group.name.trim()))?;
    }
    for (index, rule) in request.skipped_apps.iter().enumerate() {
        pattern(rule, &format!("Skipped apps rule {}", index + 1))?;
    }
    for (index, category) in request.manual_categories.iter().enumerate() {
        if let Some(problem) = category_name_problem(category.name.trim()) {
            return Err(anyhow::anyhow!("Manual categories row {}: {problem}", index + 1).into());
        }
        if let Some(parent) = category.parent_name.as_deref().map(str::trim).filter(|name| !name.is_empty()) {
            if let Some(problem) = category_name_problem(parent) {
                return Err(anyhow::anyhow!("Manual categories row {}, parent: {problem}", index + 1).into());
            }
        }
    }
    Ok(())
}

/// Merged by name: existing categories keep their settings and only gain missing rules.
async fn import_activity_categories(conn: &mut SqliteConnection, request: &ImportRequest, report: &mut ImportReport) -> Result<(), Error> {
    if request.activity_categories.is_empty() {
        return Ok(());
    }
    let mut ids: HashMap<String, i64> = sqlx::query_as::<_, (i64, String)>("SELECT id, name FROM category")
        .fetch_all(&mut *conn)
        .await?
        .into_iter()
        .map(|(id, name)| (fold(&name), id))
        .collect();
    let mut rules: HashSet<(i64, String)> = sqlx::query_as::<_, (i64, String)>("SELECT cat_id, regex FROM category_regex")
        .fetch_all(&mut *conn)
        .await?
        .into_iter()
        .collect();
    for category in &request.activity_categories {
        let name = category.name.trim();
        let id = match ids.get(&fold(name)) {
            Some(id) => *id,
            None => {
                let id = sqlx::query(
                    "INSERT INTO category (name, priority, color, regex_enabled, is_visible, in_stats)
                     VALUES (?1, ?2, ?3, 1, ?4, ?5)",
                )
                .bind(name)
                .bind(category.priority)
                .bind(category.color.as_deref().map(str::trim).filter(|color| !color.is_empty()))
                .bind(category.is_visible)
                .bind(category.in_stats)
                .execute(&mut *conn)
                .await?
                .last_insert_rowid();
                ids.insert(fold(name), id);
                report.activity_categories_created.push(name.to_string());
                id
            }
        };
        for rule in &category.rules {
            if !rules.insert((id, rule.clone())) {
                continue;
            }
            sqlx::query("INSERT INTO category_regex (cat_id, regex) VALUES (?1, ?2)")
                .bind(id)
                .bind(rule)
                .execute(&mut *conn)
                .await?;
            report.category_rules_added += 1;
        }
    }
    Ok(())
}

async fn import_app_groups(conn: &mut SqliteConnection, request: &ImportRequest, report: &mut ImportReport) -> Result<(), Error> {
    for group in &request.app_groups {
        // Same normalization as app_group::validate.
        let (name, pattern) = (group.name.trim(), group.regex.trim());
        // Patterns are unique, so a group with the same pattern is never duplicated.
        report.app_groups_added += sqlx::query("INSERT OR IGNORE INTO app_groups (name, regex) VALUES (?1, ?2)")
            .bind(name)
            .bind(pattern)
            .execute(&mut *conn)
            .await?
            .rows_affected();
    }
    Ok(())
}

/// Only the rule is added; unlike the settings screen, importing never deletes
/// existing activity that matches it.
async fn import_skipped_apps(conn: &mut SqliteConnection, request: &ImportRequest, report: &mut ImportReport) -> Result<(), Error> {
    for pattern in &request.skipped_apps {
        report.skipped_apps_added += sqlx::query("INSERT OR IGNORE INTO skipped_apps (regex) VALUES (?1)")
            .bind(pattern)
            .execute(&mut *conn)
            .await?
            .rows_affected();
    }
    Ok(())
}

/// Mirrors manual_project::validate_name without logging every rejected row as a backend error.
fn category_name_problem(name: &str) -> Option<String> {
    let count = name.chars().count();
    if count == 0 || count > MAX_CATEGORY_NAME_CHARS {
        return Some(format!("Category name \"{name}\" must be between 1 and {MAX_CATEGORY_NAME_CHARS} characters"));
    }
    if name.contains('›') {
        return Some(format!("Category name \"{name}\" cannot contain ›"));
    }
    None
}

fn valid_hex_color(color: &str) -> bool {
    color.len() == 7 && color.starts_with('#') && color[1..].bytes().all(|c| c.is_ascii_hexdigit())
}

/// Manual categories keyed case-insensitively by (parent, name), with at most
/// one level of nesting like the categories screen enforces.
pub(super) struct ManualCategoryIndex {
    top_level: HashMap<String, i64>,
    children: HashMap<(i64, String), i64>,
    names: HashMap<i64, String>,
    created: HashSet<i64>,
}

enum Resolved {
    Category(Option<i64>),
    Invalid(String),
}

impl ManualCategoryIndex {
    async fn load(conn: &mut SqliteConnection) -> Result<Self, Error> {
        let rows: Vec<(i64, String, Option<i64>)> =
            sqlx::query_as("SELECT id, name, parent_id FROM manual_projects ORDER BY id")
                .fetch_all(&mut *conn)
                .await?;
        let mut index = Self {
            top_level: HashMap::new(),
            children: HashMap::new(),
            names: HashMap::new(),
            created: HashSet::new(),
        };
        for (id, name, parent_id) in rows {
            match parent_id {
                None => {
                    index.top_level.entry(fold(&name)).or_insert(id);
                }
                Some(parent_id) => {
                    index.children.entry((parent_id, fold(&name))).or_insert(id);
                }
            }
            index.names.insert(id, name);
        }
        Ok(index)
    }

    async fn find_or_create(
        &mut self,
        conn: &mut SqliteConnection,
        name: &str,
        parent_id: Option<i64>,
        create: bool,
        report: &mut ImportReport,
    ) -> Result<Resolved, Error> {
        let key = fold(name);
        let existing = match parent_id {
            None => self.top_level.get(&key),
            Some(parent_id) => self.children.get(&(parent_id, key.clone())),
        };
        if let Some(id) = existing {
            return Ok(Resolved::Category(Some(*id)));
        }
        if !create {
            return Ok(Resolved::Category(None));
        }
        if let Some(problem) = category_name_problem(name) {
            return Ok(Resolved::Invalid(problem));
        }
        let inserted = sqlx::query("INSERT OR IGNORE INTO manual_projects (name, parent_id) VALUES (?1, ?2)")
            .bind(name)
            .bind(parent_id)
            .execute(&mut *conn)
            .await?
            .rows_affected();
        let id: i64 = sqlx::query_scalar("SELECT id FROM manual_projects WHERE name = ?1 AND parent_id IS ?2")
            .bind(name)
            .bind(parent_id)
            .fetch_one(&mut *conn)
            .await?;
        if inserted > 0 {
            self.created.insert(id);
            report.manual_categories_created.push(match parent_id.and_then(|parent| self.names.get(&parent)) {
                Some(parent) => format!("{parent}{PATH_SEPARATOR}{name}"),
                None => name.to_string(),
            });
        }
        match parent_id {
            None => self.top_level.insert(key, id),
            Some(parent_id) => self.children.insert((parent_id, key), id),
        };
        self.names.entry(id).or_insert_with(|| name.to_string());
        Ok(Resolved::Category(Some(id)))
    }

    /// [] is Uncategorized, ["Client"] a category, ["Client", "Project"] a subcategory.
    async fn resolve(
        &mut self,
        conn: &mut SqliteConnection,
        path: &[String],
        create: bool,
        report: &mut ImportReport,
    ) -> Result<Resolved, Error> {
        let parts: Vec<&str> = path.iter().map(|part| part.trim()).filter(|part| !part.is_empty()).collect();
        if parts.len() > 2 {
            return Ok(Resolved::Invalid(format!(
                "Category \"{}\" is nested too deeply; only a category and one subcategory are supported",
                parts.join(PATH_SEPARATOR)
            )));
        }
        let Some(first) = parts.first() else {
            return Ok(Resolved::Category(None));
        };
        // Exports label entries without a category "Uncategorized".
        if parts.len() == 1 && first.eq_ignore_ascii_case("Uncategorized") && !self.top_level.contains_key(&fold(first)) {
            return Ok(Resolved::Category(None));
        }
        let parent = match self.find_or_create(conn, first, None, create, report).await? {
            Resolved::Category(Some(id)) => id,
            other => return Ok(other),
        };
        match parts.get(1) {
            None => Ok(Resolved::Category(Some(parent))),
            Some(child) => self.find_or_create(conn, child, Some(parent), create, report).await,
        }
    }
}

async fn import_manual_categories(
    conn: &mut SqliteConnection,
    request: &ImportRequest,
    index: &mut ManualCategoryIndex,
    report: &mut ImportReport,
) -> Result<(), Error> {
    // Parents first so their own colors apply before subcategories reference them.
    let mut categories: Vec<_> = request.manual_categories.iter().collect();
    categories.sort_by_key(|category| category.parent_name.as_deref().is_some_and(|parent| !parent.trim().is_empty()));
    for category in categories {
        let path: Vec<String> = category.parent_name.iter().chain(std::iter::once(&category.name)).cloned().collect();
        let id = match index.resolve(conn, &path, true, report).await? {
            Resolved::Category(Some(id)) => id,
            Resolved::Category(None) => continue,
            Resolved::Invalid(problem) => {
                crate::logger::Log::warn(format!("Import skipped a manual category: {problem}"));
                continue;
            }
        };
        let Some(color) = category.color.as_deref().map(str::trim).filter(|color| valid_hex_color(color)) else {
            continue;
        };
        if index.created.contains(&id) {
            sqlx::query("INSERT OR REPLACE INTO app_metadata (key, value) VALUES (?1, ?2)")
                .bind(format!("manual_category_color:{id}"))
                .bind(color.to_ascii_lowercase())
                .execute(&mut *conn)
                .await?;
        }
    }
    Ok(())
}

/// Mirrors manual_time_block::validate without logging every rejected row as a backend error.
fn validate_entry(title: &str, notes: Option<&str>, start_time: i64, end_time: i64) -> Result<(String, Option<String>), String> {
    let title = title.trim();
    let title = if title.is_empty() { "Unnamed" } else { title };
    if title.chars().count() > MAX_TITLE_CHARS {
        return Err(format!("Title must be {MAX_TITLE_CHARS} characters or fewer"));
    }
    if end_time <= start_time {
        return Err("End time must be after start time".to_string());
    }
    if end_time.checked_sub(start_time).is_none()
        || chrono::DateTime::from_timestamp(start_time, 0).is_none()
        || chrono::DateTime::from_timestamp(end_time, 0).is_none()
    {
        return Err("Entry dates are outside the supported range".to_string());
    }
    let notes = notes.map(str::trim).filter(|notes| !notes.is_empty()).map(str::to_string);
    Ok((title.to_string(), notes))
}

type EntryKey = (i64, i64, String);

fn entry_key(start_time: i64, end_time: i64, title: &str) -> EntryKey {
    (start_time, end_time, title.trim().to_lowercase())
}

async fn import_manual_entries(
    conn: &mut SqliteConnection,
    request: &ImportRequest,
    categories: &mut ManualCategoryIndex,
    now: i64,
    report: &mut ImportReport,
) -> Result<(), Error> {
    let mut validated = Vec::with_capacity(request.manual_entries.len());
    for (index, entry) in request.manual_entries.iter().enumerate() {
        match validate_entry(&entry.title, entry.notes.as_deref(), entry.start_time, entry.end_time) {
            Ok(valid) => validated.push((index, entry, valid)),
            Err(message) => report.manual_entries_invalid.push(ImportRowIssue { index, message }),
        }
    }
    let Some(first_start) = validated.iter().map(|(_, entry, _)| entry.start_time).min() else {
        return Ok(());
    };
    let last_start = validated.iter().map(|(_, entry, _)| entry.start_time).max().unwrap_or(first_start);
    // One range query instead of a lookup per row.
    let mut seen: HashSet<EntryKey> = sqlx::query_as::<_, (i64, i64, String)>(
        "SELECT start_time, end_time, title FROM manual_time_blocks WHERE start_time >= ?1 AND start_time <= ?2",
    )
    .bind(first_start)
    .bind(last_start)
    .fetch_all(&mut *conn)
    .await?
    .into_iter()
    .map(|(start, end, title)| entry_key(start, end, &title))
    .collect();

    for (index, entry, (title, notes)) in validated {
        let key = entry_key(entry.start_time, entry.end_time, &title);
        let duplicate = seen.contains(&key);
        if duplicate && request.duplicate_strategy == DuplicateStrategy::Skip {
            report.manual_entries_duplicate += 1;
            report.duplicate_indices.push(index);
            continue;
        }
        let project_id = match categories
            .resolve(conn, &entry.category_path, request.create_missing_categories, report)
            .await?
        {
            Resolved::Category(id) => id,
            Resolved::Invalid(message) => {
                report.manual_entries_invalid.push(ImportRowIssue { index, message });
                continue;
            }
        };
        if duplicate {
            report.manual_entries_duplicate += 1;
            report.duplicate_indices.push(index);
        }
        // Same row shape as insert_manual_time_block: a local entry without a sync session.
        sqlx::query(
            "INSERT INTO manual_time_blocks (title, notes, start_time, end_time, created_at, updated_at, project_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?5, ?6)",
        )
        .bind(&title)
        .bind(notes)
        .bind(entry.start_time)
        .bind(entry.end_time)
        .bind(now)
        .bind(project_id)
        .execute(&mut *conn)
        .await?;
        seen.insert(key);
        report.manual_entries_imported += 1;
    }
    report.manual_entries_invalid.sort_by_key(|issue| issue.index);
    Ok(())
}

async fn import_activity_logs(conn: &mut SqliteConnection, logs: &[ImportActivityLog], report: &mut ImportReport) -> Result<(), Error> {
    let valid: Vec<&ImportActivityLog> = logs
        .iter()
        .filter(|log| {
            !log.device_uuid.trim().is_empty()
                && log.duration >= 0
                && chrono::DateTime::from_timestamp(log.timestamp, 0).is_some()
                && log.timestamp.checked_add(log.duration)
                    .is_some_and(|end| chrono::DateTime::from_timestamp(end, 0).is_some())
        })
        .collect();
    if valid.len() < logs.len() {
        crate::logger::Log::warn(format!("Import skipped {} unreadable activity log(s)", logs.len() - valid.len()));
    }
    let mut imported = 0;
    for chunk in valid.chunks(LOG_INSERT_CHUNK) {
        let mut query = QueryBuilder::<Sqlite>::new("INSERT OR IGNORE INTO logs (id, device_uuid, app, timestamp, duration, is_deleted) ");
        query.push_values(chunk, |mut row, log| {
            row.push_bind(log.id)
                .push_bind(import_device_uuid(&log.device_uuid))
                .push_bind(&log.app)
                .push_bind(log.timestamp)
                .push_bind(log.duration)
                .push_bind(0_i64);
        });
        imported += query.build().execute(&mut *conn).await?.rows_affected();
    }
    report.activity_logs_imported = imported;
    report.activity_logs_duplicate = valid.len() as u64 - imported;
    Ok(())
}
