use super::export::{self, ExportContext};
use super::import::{self, UNREGISTERED_IMPORT_DEVICE_UUID};
use super::*;
use crate::db::queries::week::TimeBlockSettings;
use crate::db::tables::{
    app_group, cat_regex, category, device, log, manual_project, manual_time_block, skipped_app,
};
use sqlx::sqlite::SqlitePoolOptions;
use sqlx::SqlitePool;

const SETTINGS: TimeBlockSettings = TimeBlockSettings {
    min_log_duration: 1,
    max_attach_distance: 400,
    lookahead_window: 500,
    min_duration: 300,
};

async fn pool() -> SqlitePool {
    // One connection: every in-memory connection is its own database.
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    sqlx::query("CREATE TABLE app_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
        .execute(&pool)
        .await
        .unwrap();
    log::create_table(&pool).await.unwrap();
    device::create_table(&pool).await.unwrap();
    category::create_table(&pool).await.unwrap();
    cat_regex::create_table(&pool).await.unwrap();
    app_group::create_table(&pool).await.unwrap();
    skipped_app::create_table(&pool).await.unwrap();
    manual_project::create_table(&pool).await.unwrap();
    manual_time_block::create_table(&pool).await.unwrap();
    for (category, pattern) in [("Miscellaneous", ".*"), ("Coding", "Code"), ("Browsing", "Vivaldi")] {
        sqlx::query("INSERT INTO category_regex (cat_id, regex) SELECT id, ?2 FROM category WHERE name = ?1")
            .bind(category)
            .bind(pattern)
            .execute(&pool)
            .await
            .unwrap();
    }
    pool
}

async fn exec(pool: &SqlitePool, sql: &'static str) {
    sqlx::query(sql).execute(pool).await.unwrap();
}

async fn count(pool: &SqlitePool, table: &str) -> i64 {
    sqlx::query_scalar(sqlx::AssertSqlSafe(format!("SELECT COUNT(*) FROM {table}")))
        .fetch_one(pool)
        .await
        .unwrap()
}

fn entry(title: &str, path: &[&str], start_time: i64, end_time: i64) -> ImportManualEntry {
    ImportManualEntry {
        title: title.into(),
        notes: None,
        category_path: path.iter().map(|part| part.to_string()).collect(),
        start_time,
        end_time,
    }
}

fn import_log(device_uuid: &str, id: i64, app: &str) -> ImportActivityLog {
    ImportActivityLog { device_uuid: device_uuid.into(), id, app: app.into(), timestamp: 1000 + id, duration: 5 }
}

fn scope(include: ExportInclude) -> ExportScope {
    ExportScope {
        range_start: 0,
        range_end: 1_000_000,
        device_uuids: None,
        activity_categories: None,
        manual_category_ids: None,
        include,
    }
}

fn include_all() -> ExportInclude {
    ExportInclude {
        manual_entries: true,
        activity_sessions: true,
        activity_logs: true,
        devices: true,
        activity_categories: true,
        manual_categories: true,
        app_groups: true,
        skipped_apps: true,
    }
}

async fn run_export(pool: &SqlitePool, scope: &ExportScope) -> ExportDataset {
    let context = ExportContext { settings: &SETTINGS, app_version: "1.0.0".into(), generated_at: 42 };
    export::export(pool, scope, &context).await.unwrap()
}

#[test]
fn contract_field_names_and_enums_match_the_typescript_types() {
    let request: ImportRequest = serde_json::from_value(serde_json::json!({
        "dry_run": true, "duplicate_strategy": "import", "create_missing_categories": false,
        "manual_entries": [{"title": "A", "notes": null, "category_path": ["X", "Y"], "start_time": 1, "end_time": 2}],
        "manual_categories": [{"name": "X", "color": null, "parent_name": null}],
        "activity_categories": [{"name": "C", "color": "#fff", "priority": 3, "is_visible": true, "in_stats": false, "rules": ["a"]}],
        "app_groups": [{"name": "G", "regex": "g"}], "skipped_apps": ["s"],
        "devices": [{"uuid": "u", "name": "n"}],
        "activity_logs": [{"device_uuid": "u", "id": 1, "app": "a", "timestamp": 1, "duration": 1}]
    }))
    .unwrap();
    assert_eq!(request.duplicate_strategy, DuplicateStrategy::Import);
    assert!(!request.create_missing_categories);
    let report = serde_json::to_value(ImportReport::default()).unwrap();
    let mut keys: Vec<_> = report.as_object().unwrap().keys().cloned().collect();
    keys.sort();
    assert_eq!(
        keys,
        [
            "activity_categories_created", "activity_logs_duplicate", "activity_logs_imported", "app_groups_added",
            "category_rules_added", "devices_added", "dry_run", "duplicate_indices", "manual_categories_created",
            "manual_entries_duplicate", "manual_entries_imported", "manual_entries_invalid", "skipped_apps_added",
        ]
    );
    let scope: ExportScope = serde_json::from_value(serde_json::json!({
        "range_start": 0, "range_end": 10, "device_uuids": null, "activity_categories": ["Coding"],
        "manual_category_ids": [null, 4], "include": include_all()
    }))
    .unwrap();
    assert_eq!(scope.manual_category_ids, Some(vec![None, Some(4)]));
}

#[tokio::test]
async fn duplicates_match_existing_entries_and_earlier_rows_in_the_same_file() {
    let pool = pool().await;
    exec(&pool, "INSERT INTO manual_time_blocks (title, start_time, end_time, created_at, updated_at) VALUES ('Planning', 100, 200, 1, 1)").await;
    let mut request = ImportRequest {
        dry_run: false,
        create_missing_categories: true,
        manual_entries: vec![
            entry("  PLANNING ", &[], 100, 200),
            entry("New", &[], 300, 400),
            entry("new", &[], 300, 400),
            entry("Backwards", &[], 500, 400),
            entry(&"x".repeat(201), &[], 500, 600),
            entry("", &[], 700, 800),
        ],
        ..Default::default()
    };
    request.dry_run = true;
    request.duplicate_strategy = DuplicateStrategy::Import;
    let report = import::import(&pool, &request, 9).await.unwrap();
    assert_eq!((report.manual_entries_imported, report.manual_entries_duplicate), (4, 2));
    assert_eq!(report.duplicate_indices, vec![0, 2]);

    request.dry_run = false;
    request.duplicate_strategy = DuplicateStrategy::Skip;
    let report = import::import(&pool, &request, 9).await.unwrap();
    assert_eq!((report.manual_entries_imported, report.manual_entries_duplicate), (2, 2));
    assert_eq!(report.duplicate_indices, vec![0, 2]);
    assert_eq!(report.manual_entries_invalid.iter().map(|issue| issue.index).collect::<Vec<_>>(), vec![3, 4]);
    assert!(report.manual_entries_invalid[0].message.contains("End time"));
    let titles: Vec<String> = sqlx::query_scalar("SELECT title FROM manual_time_blocks ORDER BY start_time")
        .fetch_all(&pool)
        .await
        .unwrap();
    assert_eq!(titles, vec!["Planning", "New", "Unnamed"]);
    // Imported entries are plain local entries, like ones added by hand.
    let pending: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM manual_time_blocks WHERE session_id IS NOT NULL OR pending_upload != 0")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(pending, 0);

    // Re-importing the same file finds everything already present.
    let report = import::import(&pool, &request, 9).await.unwrap();
    assert_eq!((report.manual_entries_imported, report.manual_entries_duplicate), (0, 4));
}

#[tokio::test]
async fn category_paths_match_case_insensitively_and_respect_depth() {
    let pool = pool().await;
    exec(&pool, "INSERT INTO manual_projects (id, name, parent_id) VALUES (1, 'Client', NULL), (2, 'Project', 1)").await;
    let request = ImportRequest {
        dry_run: false,
        create_missing_categories: true,
        manual_categories: vec![
            ImportManualCategory { name: "Legs".into(), color: Some("#123456".into()), parent_name: Some("Gym".into()), priority: 0, rules: Vec::new() },
            ImportManualCategory { name: "Gym".into(), color: Some("#AABBCC".into()), parent_name: None, priority: 0, rules: Vec::new() },
            ImportManualCategory { name: "client".into(), color: Some("#000000".into()), parent_name: None, priority: 0, rules: Vec::new() },
            ImportManualCategory { name: "Uncategorized".into(), color: Some("#000000".into()), parent_name: None, priority: 0, rules: Vec::new() },
        ],
        manual_entries: vec![
            entry("a", &[" client ", "PROJECT"], 100, 200),
            entry("b", &["Client", "New Sub"], 200, 300),
            entry("c", &["A", "B", "C"], 300, 400),
            entry("d", &["uncategorized"], 400, 500),
            entry("e", &["Bad › Name"], 500, 600),
            entry("f", &["gym", "legs"], 600, 700),
            entry("g", &[], 700, 800),
        ],
        ..Default::default()
    };
    let report = import::import(&pool, &request, 9).await.unwrap();
    assert_eq!(report.manual_categories_created, vec!["Gym", "Gym › Legs", "Client › New Sub"]);
    assert_eq!(report.manual_entries_invalid.iter().map(|issue| issue.index).collect::<Vec<_>>(), vec![2, 4]);
    assert_eq!(report.manual_entries_imported, 5);
    let rows: Vec<(String, Option<i64>)> = sqlx::query_as("SELECT title, project_id FROM manual_time_blocks ORDER BY start_time")
        .fetch_all(&pool)
        .await
        .unwrap();
    let new_sub: i64 = sqlx::query_scalar("SELECT id FROM manual_projects WHERE name = 'New Sub' AND parent_id = 1")
        .fetch_one(&pool)
        .await
        .unwrap();
    let legs: i64 = sqlx::query_scalar("SELECT p.id FROM manual_projects p JOIN manual_projects g ON g.id = p.parent_id WHERE g.name = 'Gym' AND p.name = 'Legs'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(
        rows,
        vec![("a".into(), Some(2)), ("b".into(), Some(new_sub)), ("d".into(), None), ("f".into(), Some(legs)), ("g".into(), None)]
    );
    // Colors apply only to categories this import created.
    let categories = manual_project::categories_for_pool(&pool).await.unwrap();
    let color = |name: &str| categories.iter().find(|category| category.name == name).unwrap().color.clone();
    assert_eq!(color("Gym"), "#aabbcc");
    assert_eq!(color("Legs"), "#123456");
    assert_ne!(color("Client"), "#000000");
    assert_ne!(color("Uncategorized"), "#000000");
    assert_eq!(count(&pool, "manual_projects").await, 5);

    // Without creation, unknown categories fall back to Uncategorized.
    let request = ImportRequest {
        dry_run: false,
        create_missing_categories: false,
        manual_entries: vec![entry("h", &["Unknown"], 900, 1000), entry("i", &["Client", "Missing"], 1000, 1100), entry("j", &["CLIENT"], 1100, 1200)],
        ..Default::default()
    };
    let report = import::import(&pool, &request, 9).await.unwrap();
    assert!(report.manual_categories_created.is_empty());
    let projects: Vec<Option<i64>> = sqlx::query_scalar("SELECT project_id FROM manual_time_blocks WHERE start_time >= 900 ORDER BY start_time")
        .fetch_all(&pool)
        .await
        .unwrap();
    assert_eq!(projects, vec![None, None, Some(1)]);
    assert_eq!(count(&pool, "manual_projects").await, 5);
}

fn everything_request() -> ImportRequest {
    ImportRequest {
        dry_run: true,
        create_missing_categories: true,
        manual_entries: vec![entry("Work", &["New", "Child"], 100, 200)],
        manual_categories: vec![ImportManualCategory { name: "Other".into(), color: Some("#ffffff".into()), parent_name: None, priority: 0, rules: Vec::new() }],
        activity_categories: vec![
            ExportActivityCategory {
                parent_name: None,
                name: "coding".into(),
                color: None,
                priority: 1,
                is_visible: true,
                in_stats: true,
                rules: vec!["Code".into(), "Rider".into(), "Rider".into()],
            },
            ExportActivityCategory {
                parent_name: None,
                name: "Design".into(),
                color: Some("#ff0000".into()),
                priority: 650,
                is_visible: false,
                in_stats: true,
                rules: vec!["Figma".into()],
            },
        ],
        app_groups: vec![
            ExportAppGroup { name: "Editors".into(), regex: "Code|Rider".into() },
        ],
        skipped_apps: vec!["^Secret$".into()],
        devices: vec![ImportDevice { uuid: "phone".into(), name: "Phone".into() }],
        activity_logs: vec![import_log("phone", 1, "Code"), import_log("phone", 2, "Figma")],
        ..Default::default()
    }
}

async fn snapshot(pool: &SqlitePool) -> Vec<i64> {
    let mut counts = Vec::new();
    for table in ["manual_time_blocks", "manual_projects", "category", "category_regex", "app_groups", "skipped_apps", "devices", "logs", "app_metadata"] {
        counts.push(count(pool, table).await);
    }
    counts
}

#[tokio::test]
async fn dry_run_reports_the_real_import_without_writing() {
    let pool = pool().await;
    let request = everything_request();
    let before = snapshot(&pool).await;
    let dry = import::import(&pool, &request, 9).await.unwrap();
    assert_eq!(snapshot(&pool).await, before);
    assert!(dry.dry_run);
    assert_eq!(dry.manual_entries_imported, 1);
    assert_eq!(dry.manual_categories_created, vec!["Other", "New", "New › Child"]);
    assert_eq!(dry.activity_categories_created, vec!["Design"]);
    assert_eq!(dry.category_rules_added, 2); // Rider and Figma; Code already exists.
    assert_eq!((dry.app_groups_added, dry.skipped_apps_added, dry.devices_added), (1, 1, 1));
    assert_eq!((dry.activity_logs_imported, dry.activity_logs_duplicate), (2, 0));

    let real = import::import(&pool, &ImportRequest { dry_run: false, ..request }, 9).await.unwrap();
    assert_eq!(ImportReport { dry_run: true, ..real }, dry);
    assert_ne!(snapshot(&pool).await, before);
    let design: (i32, Option<String>, bool) = sqlx::query_as("SELECT priority, color, is_visible FROM category WHERE name = 'Design'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(design, (650, Some("#ff0000".into()), false));
}

#[tokio::test]
async fn malformed_metadata_is_rejected_in_preview_and_real_import_without_writing() {
    let pool = pool().await;
    let before = snapshot(&pool).await;
    for dry_run in [true, false] {
        for case in 0..8 {
            let mut request = everything_request();
            request.dry_run = dry_run;
            let expected = match case {
                0 => {
                    request.activity_categories[0].rules.push("(".into());
                    "Activity category \"coding\", rule 4"
                }
                1 => {
                    request.app_groups[0].regex = "[".into();
                    "App group \"Editors\""
                }
                2 => {
                    request.skipped_apps.push("(?".into());
                    "Skipped apps rule 2"
                }
                3 => {
                    request.activity_categories[0].name = "  ".into();
                    "Activity categories row 1: category name is empty"
                }
                4 => {
                    request.app_groups[0].name = "".into();
                    "App groups row 1: group name is empty"
                }
                5 => {
                    request.manual_categories[0].name = "".into();
                    "Manual categories row 1"
                }
                6 => {
                    request.skipped_apps.push("  ".into());
                    "Skipped apps rule 2: the regex pattern is empty"
                }
                _ => {
                    request.app_groups[0].regex = "".into();
                    "App group \"Editors\": the regex pattern is empty"
                }
            };
            let error = import::import(&pool, &request, 9).await.unwrap_err();
            assert!(error.to_string().contains(expected), "case {case}, dry_run={dry_run}: {error}");
            assert_eq!(snapshot(&pool).await, before, "case {case}, dry_run={dry_run}");
        }
    }
}

#[tokio::test]
async fn activity_logs_are_inserted_or_ignored_by_device_and_id() {
    let pool = pool().await;
    exec(&pool, "INSERT INTO devices (uuid, name, kind, token, is_tracking, is_active) VALUES ('desk', 'Desk', 'local', 'token', 1, 1)").await;
    exec(&pool, "INSERT INTO logs (id, device_uuid, app, timestamp, duration) VALUES (1, 'desk', 'Code', 10, 5)").await;
    exec(&pool, "INSERT INTO logs (id, device_uuid, app, timestamp, duration, is_deleted) VALUES (2, 'desk', 'Gone', 10, 5, 1)").await;
    let mut logs = vec![
        import_log("desk", 1, "Code"),
        import_log("desk", 2, "Gone"),
        import_log("desk", 3, "Code"),
        import_log("desk", 3, "Code"),
        import_log("phone", 1, "Code"),
        import_log(log::PENDING_LOCAL_DEVICE_UUID, 1, "Code"),
        import_log("", 9, "No device"),
    ];
    logs.extend((0..2500).map(|id| import_log("bulk", id, "Bulk")));
    let request = ImportRequest {
        dry_run: false,
        devices: vec![ImportDevice { uuid: "desk".into(), name: "Renamed".into() }, ImportDevice { uuid: "phone".into(), name: "Phone".into() }],
        activity_logs: logs,
        ..Default::default()
    };
    let report = import::import(&pool, &request, 9).await.unwrap();
    assert_eq!((report.activity_logs_imported, report.activity_logs_duplicate), (2503, 3));
    assert_eq!(report.devices_added, 3);
    // The deleted log stays deleted and the existing device is untouched.
    let deleted: bool = sqlx::query_scalar("SELECT is_deleted FROM logs WHERE device_uuid = 'desk' AND id = 2").fetch_one(&pool).await.unwrap();
    assert!(deleted);
    let desk: (String, String, bool) = sqlx::query_as("SELECT name, kind, is_tracking FROM devices WHERE uuid = 'desk'").fetch_one(&pool).await.unwrap();
    assert_eq!(desk, ("Desk".into(), "local".into(), true));
    let added: Vec<(String, String, String, Option<String>, bool, bool, bool, bool)> = sqlx::query_as(
        "SELECT uuid, name, kind, token, is_tracking, is_active, in_cal, in_stats FROM devices WHERE uuid != 'desk' ORDER BY uuid",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(
        added,
        vec![
            ("bulk".into(), "bulk".into(), "remote".into(), None, false, false, true, true),
            (UNREGISTERED_IMPORT_DEVICE_UUID.into(), "Imported device".into(), "remote".into(), None, false, false, true, true),
            ("phone".into(), "Phone".into(), "remote".into(), None, false, false, true, true),
        ]
    );
    let pending: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM logs WHERE device_uuid = ?1")
        .bind(log::PENDING_LOCAL_DEVICE_UUID)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(pending, 0);
}

async fn seed_activity(pool: &SqlitePool) {
    exec(pool, "INSERT INTO devices (uuid, name, kind, token, in_cal, in_stats) VALUES ('desk', 'Desk', 'local', 'token', 1, 1), ('phone', 'Phone', 'remote', NULL, 1, 0)").await;
    exec(pool, "INSERT INTO app_groups (name, regex) VALUES ('Editor', 'Code')").await;
    exec(pool, "INSERT INTO skipped_apps (regex) VALUES ('^Secret$')").await;
    // Desk: 10 minutes of coding; pending-local logs belong to the desk too.
    exec(pool, "INSERT INTO logs (id, device_uuid, app, timestamp, duration) VALUES
        (1, 'desk', 'Code - a.rs', 1000, 200), (2, 'desk', 'Code - b.rs', 1200, 100),
        (3, 'desk', 'Secret', 1300, 50), (4, 'desk', 'Vivaldi', 5000, 400)").await;
    exec(pool, "INSERT INTO logs (id, device_uuid, app, timestamp, duration) VALUES (1, '__pending_local__', 'Code - c.rs', 1300, 300)").await;
    // Phone: the same time span, which must stay a separate session.
    exec(pool, "INSERT INTO logs (id, device_uuid, app, timestamp, duration) VALUES (1, 'phone', 'Vivaldi', 1000, 600)").await;
    exec(pool, "INSERT INTO logs (id, device_uuid, app, timestamp, duration, is_deleted) VALUES (2, 'phone', 'Vivaldi', 2000, 600, 1)").await;
    // Outside the range.
    exec(pool, "INSERT INTO logs (id, device_uuid, app, timestamp, duration) VALUES (3, 'phone', 'Vivaldi', 2000000, 600)").await;
}

#[tokio::test]
async fn sessions_are_built_per_device_with_app_groups() {
    let pool = pool().await;
    seed_activity(&pool).await;
    let dataset = run_export(&pool, &scope(include_all())).await;
    let sessions: Vec<_> = dataset
        .activity_sessions
        .iter()
        .map(|s| (s.device_name.as_str(), s.category.as_str(), s.start_time, s.end_time, s.duration, s.active_duration))
        .collect();
    assert_eq!(
        sessions,
        vec![
            ("Desk", "Coding", 1000, 1600, 600, 600),
            ("Phone", "Browsing", 1000, 1600, 600, 600),
            ("Desk", "Browsing", 5000, 5400, 400, 400),
        ]
    );
    let desk = &dataset.activity_sessions[0];
    assert_eq!(desk.device_uuid, "desk");
    assert_eq!(desk.apps, vec![ExportSessionApp { app: "Editor".into(), duration: 600 }]);
    assert_eq!(desk.category_color.as_deref(), Some("#1100ff"));
    assert_eq!(dataset.app_version, "1.0.0");
    assert_eq!(dataset.generated_at, 42);
}

#[tokio::test]
async fn export_filters_devices_categories_and_manual_categories() {
    let pool = pool().await;
    seed_activity(&pool).await;
    exec(&pool, "INSERT INTO manual_projects (id, name, parent_id) VALUES (1, 'Client', NULL), (2, 'Project', 1)").await;
    exec(&pool, "INSERT INTO app_metadata (key, value) VALUES ('manual_category_color:1', '#fb7185')").await;
    exec(&pool, "INSERT INTO manual_time_blocks (title, notes, project_id, start_time, end_time, created_at, updated_at) VALUES
        ('Loose', NULL, NULL, 300, 400, 1, 2), ('Parent', 'n', 1, 100, 200, 1, 2), ('Child', NULL, 2, 200, 260, 1, 2),
        ('Late', NULL, NULL, 1000000, 1000100, 1, 2)").await;

    let all = run_export(&pool, &scope(include_all())).await;
    let log_keys: Vec<_> = all.activity_logs.iter().map(|l| (l.device_uuid.as_str(), l.id, l.timestamp)).collect();
    assert_eq!(log_keys, vec![("desk", 1, 1000), ("phone", 1, 1000), ("desk", 2, 1200), (log::PENDING_LOCAL_DEVICE_UUID, 1, 1300), ("desk", 4, 5000)]);
    let first = &all.activity_logs[0];
    assert_eq!((first.app_group.as_deref(), first.category.as_str(), first.device_name.as_str()), (Some("Editor"), "Coding", "Desk"));
    assert_eq!(all.activity_logs[1].app_group, None);
    assert_eq!(all.devices.iter().map(|d| (d.uuid.as_str(), d.kind.as_str(), d.in_stats)).collect::<Vec<_>>(), vec![("desk", "local", true), ("phone", "remote", false)]);
    assert_eq!(all.skipped_apps, vec!["^Secret$"]);
    assert_eq!(all.app_groups, vec![ExportAppGroup { name: "Editor".into(), regex: "Code".into() }]);
    let coding = all.activity_categories.iter().find(|c| c.name == "Coding").unwrap();
    assert_eq!(coding.rules, vec!["Code"]);
    assert_eq!(all.activity_categories[0].name, "Social"); // Highest priority first.
    assert_eq!(all.manual_categories[0].id, None);
    let project = all.manual_categories.iter().find(|c| c.name == "Project").unwrap();
    assert_eq!((project.parent_name.as_deref(), project.color.as_str()), (Some("Client"), "#fb7185"));

    let manual: Vec<_> = all.manual_entries.iter().map(|e| (e.title.as_str(), e.category.as_str(), e.parent_category.as_deref(), e.duration)).collect();
    assert_eq!(manual, vec![("Parent", "Client", None, 100), ("Child", "Project", Some("Client"), 60), ("Loose", "Uncategorized", None, 100)]);

    let mut filtered = scope(include_all());
    filtered.device_uuids = Some(vec!["phone".into()]);
    let phone = run_export(&pool, &filtered).await;
    assert!(phone.activity_logs.iter().all(|l| l.device_uuid == "phone"));
    assert_eq!(phone.activity_sessions.len(), 1);
    assert_eq!(phone.activity_sessions[0].device_name, "Phone");

    filtered.device_uuids = None;
    filtered.activity_categories = Some(vec!["Coding".into()]);
    filtered.manual_category_ids = Some(vec![None]);
    let coding = run_export(&pool, &filtered).await;
    assert_eq!(coding.activity_logs.len(), 3);
    assert!(coding.activity_logs.iter().all(|l| l.category == "Coding"));
    assert_eq!(coding.activity_sessions.iter().map(|s| s.category.as_str()).collect::<Vec<_>>(), vec!["Coding"]);
    assert_eq!(coding.manual_entries.iter().map(|e| e.title.as_str()).collect::<Vec<_>>(), vec!["Loose"]);

    // Selecting a parent does not select its subcategories.
    filtered.manual_category_ids = Some(vec![Some(1)]);
    let parent = run_export(&pool, &filtered).await;
    assert_eq!(parent.manual_entries.iter().map(|e| e.title.as_str()).collect::<Vec<_>>(), vec!["Parent"]);
    assert_eq!(parent.manual_entries[0].category_color, "#fb7185");

    let nothing = run_export(&pool, &scope(ExportInclude::default())).await;
    assert!(nothing.manual_entries.is_empty() && nothing.activity_sessions.is_empty() && nothing.activity_logs.is_empty());
    assert!(nothing.devices.is_empty() && nothing.activity_categories.is_empty() && nothing.manual_categories.is_empty());
    assert!(nothing.app_groups.is_empty() && nothing.skipped_apps.is_empty());

    let options = export::filter_options(&pool).await.unwrap();
    assert_eq!((options.data_start, options.data_end), (Some(100), Some(2000600)));
    assert_eq!(options.devices.len(), 2);
    assert_eq!(options.activity_categories[0].name, "Social");
    assert_eq!(options.manual_categories.len(), 3);
}

#[tokio::test]
async fn exported_data_round_trips_into_an_empty_database() {
    let source = pool().await;
    seed_activity(&source).await;
    exec(&source, "INSERT INTO manual_projects (id, name, parent_id) VALUES (1, 'Client', NULL), (2, 'Project', 1)").await;
    exec(&source, "INSERT INTO manual_time_blocks (title, project_id, start_time, end_time, created_at, updated_at) VALUES ('Child', 2, 200, 260, 1, 2)").await;
    exec(&source, "UPDATE manual_projects SET priority = 7 WHERE id = 2").await;
    exec(&source, "INSERT INTO category_regex (manual_project_id, regex) VALUES (2, 'Essay')").await;
    exec(&source, "INSERT INTO category (name, priority, parent_id) SELECT 'Rust', 5, id FROM category WHERE name = 'Coding'").await;
    exec(&source, "INSERT INTO category (name, priority, parent_id) SELECT 'Rust', 5, id FROM category WHERE name = 'Browsing'").await;
    exec(&source, "INSERT INTO category_regex (cat_id, regex) SELECT c.id, 'cargo' FROM category c JOIN category p ON p.id = c.parent_id WHERE p.name = 'Coding'").await;
    let dataset = run_export(&source, &scope(include_all())).await;
    let request = ImportRequest {
        dry_run: false,
        create_missing_categories: true,
        manual_entries: dataset
            .manual_entries
            .iter()
            .map(|e| ImportManualEntry {
                title: e.title.clone(),
                notes: e.notes.clone(),
                category_path: e.parent_category.iter().cloned().chain(std::iter::once(e.category.clone())).collect(),
                start_time: e.start_time,
                end_time: e.end_time,
            })
            .collect(),
        manual_categories: dataset
            .manual_categories
            .iter()
            .map(|c| ImportManualCategory { name: c.name.clone(), color: Some(c.color.clone()), parent_name: c.parent_name.clone(), priority: c.priority, rules: c.rules.clone() })
            .collect(),
        activity_categories: dataset.activity_categories.clone(),
        app_groups: dataset.app_groups.clone(),
        skipped_apps: dataset.skipped_apps.clone(),
        devices: dataset.devices.iter().map(|d| ImportDevice { uuid: d.uuid.clone(), name: d.name.clone() }).collect(),
        activity_logs: dataset
            .activity_logs
            .iter()
            .map(|l| ImportActivityLog { device_uuid: l.device_uuid.clone(), id: l.id, app: l.app.clone(), timestamp: l.timestamp, duration: l.duration })
            .collect(),
        ..Default::default()
    };
    let target = pool().await;
    let report = import::import(&target, &request, 9).await.unwrap();
    assert_eq!(report.manual_categories_created, vec!["Client", "Client › Project"]);
    assert_eq!(report.manual_entries_imported, 1);
    assert_eq!(report.activity_logs_imported, dataset.activity_logs.len() as u64);
    let manual_rule: (String, i32) = sqlx::query_as("SELECT r.regex, p.priority FROM category_regex r JOIN manual_projects p ON p.id = r.manual_project_id WHERE p.name = 'Project'")
        .fetch_one(&target).await.unwrap();
    assert_eq!(manual_rule, ("Essay".into(), 7));
    let auto_rule: String = sqlx::query_scalar("SELECT p.name FROM category_regex r JOIN category c ON c.id = r.cat_id JOIN category p ON p.id = c.parent_id WHERE r.regex = 'cargo'")
        .fetch_one(&target).await.unwrap();
    assert_eq!(auto_rule, "Coding");
    let same_named_subcategories: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM category WHERE name = 'Rust'").fetch_one(&target).await.unwrap();
    assert_eq!(same_named_subcategories, 2);
    // A second import of the same file changes nothing.
    let again = import::import(&target, &request, 9).await.unwrap();
    assert_eq!(again.category_rules_added, 0);
    let categories_after_reimport: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM category WHERE name = 'Rust'").fetch_one(&target).await.unwrap();
    assert_eq!(categories_after_reimport, 2);
    assert_eq!((again.manual_entries_imported, again.activity_logs_imported, again.devices_added), (0, 0, 0));
    assert_eq!(again.activity_logs_duplicate, dataset.activity_logs.len() as u64);
}

#[test]
fn export_paths_are_decoded_and_must_be_absolute() {
    let encoded = urlencoding::encode(if cfg!(windows) { r"C:\Users\me\My Exports\time ›.json" } else { "/home/me/My Exports/time ›.json" });
    let path = export_path(&encoded).unwrap();
    assert!(path.ends_with("time ›.json"));
    assert!(export_path("relative.json").is_err());
    assert!(export_path("").is_err());
    assert!(check_import_size(MAX_IMPORT_FILE_BYTES).is_ok());
    assert!(check_import_size(MAX_IMPORT_FILE_BYTES + 1).is_err());
    assert_eq!(body_bytes(&tauri::ipc::InvokeBody::Json(serde_json::json!([1, 2, 255]))).unwrap().as_ref(), &[1, 2, 255]);
}

#[test]
fn saving_replaces_the_file_without_leaving_temporary_files() {
    let dir = std::env::temp_dir().join(format!("tt-export-test-{}", uuid::Uuid::new_v4().simple()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("export.json");
    write_file_replacing(&path, b"first").unwrap();
    write_file_replacing(&path, b"second").unwrap();
    assert_eq!(std::fs::read(&path).unwrap(), b"second");
    assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 1);
    assert!(write_file_replacing(&dir.join("missing").join("x.json"), b"x").is_err());
    std::fs::remove_dir_all(&dir).unwrap();
}

#[tokio::test]
async fn import_snapshot_preserves_data_and_limits_retention() {
    let dir = std::env::temp_dir().join(format!("tt-import-snapshot-test-{}", uuid::Uuid::new_v4().simple()));
    std::fs::create_dir_all(&dir).unwrap();
    // SQLITE_OPEN_MEMORY also applies to VACUUM's attached output database, so
    // use a real WAL source to exercise the runtime backup behavior.
    let pool = SqlitePoolOptions::new().max_connections(1)
        .connect_with(sqlx::sqlite::SqliteConnectOptions::new().filename(dir.join("source.db"))
            .create_if_missing(true).journal_mode(sqlx::sqlite::SqliteJournalMode::Wal))
        .await.unwrap();
    manual_time_block::create_table(&pool).await.unwrap();
    exec(&pool, "INSERT INTO manual_time_blocks (title, start_time, end_time, created_at, updated_at) VALUES ('Before import', 10, 20, 1, 1)").await;
    let path = dir.join("snapshot.db");
    snapshot_before_import(&pool, &path).await.unwrap();
    exec(&pool, "DELETE FROM manual_time_blocks").await;
    let snapshot = SqlitePoolOptions::new().max_connections(1)
        .connect_with(sqlx::sqlite::SqliteConnectOptions::new().filename(&path).read_only(true))
        .await.unwrap();
    assert_eq!(count(&snapshot, "manual_time_blocks").await, 1);
    snapshot.close().await;
    for index in 0..7 {
        std::fs::write(dir.join(format!("safety_2026-10-23_00-00-0{index}_pre_import.db")), b"backup").unwrap();
    }
    std::fs::write(dir.join("daily_2026-10-23.db"), b"daily").unwrap();
    prune_import_backups(&dir).await.unwrap();
    assert!(!dir.join("safety_2026-10-23_00-00-00_pre_import.db").exists());
    assert!(!dir.join("safety_2026-10-23_00-00-01_pre_import.db").exists());
    assert!(dir.join("safety_2026-10-23_00-00-02_pre_import.db").exists());
    assert!(dir.join("daily_2026-10-23.db").exists());
    pool.close().await;
    std::fs::remove_dir_all(dir).unwrap();
}

#[tokio::test]
async fn export_rejects_invalid_range_and_finds_long_overlapping_log_end() {
    let pool = pool().await;
    let mut range = scope(include_all());
    range.range_end = range.range_start;
    let context = ExportContext { settings: &SETTINGS, app_version: "1".into(), generated_at: 1 };
    assert!(export::export(&pool, &range, &context).await.is_err());
    exec(&pool, "INSERT INTO logs (id, device_uuid, app, timestamp, duration) VALUES (1, 'device', 'Long', 10, 10000), (2, 'device', 'Short', 20, 1)").await;
    assert_eq!(export::filter_options(&pool).await.unwrap().data_end, Some(10010));
}

#[tokio::test]
async fn import_rejects_dates_that_would_overflow_later_exports() {
    let pool = pool().await;
    let request = ImportRequest {
        dry_run: false,
        manual_entries: vec![entry("Overflow", &[], i64::MIN, i64::MAX)],
        activity_logs: vec![ImportActivityLog {
            device_uuid: "device".into(), id: 1, app: "Overflow".into(), timestamp: i64::MAX, duration: 1,
        }],
        ..Default::default()
    };
    let report = import::import(&pool, &request, 1).await.unwrap();
    assert_eq!(report.manual_entries_invalid.len(), 1);
    assert_eq!(report.manual_entries_imported, 0);
    assert_eq!(report.activity_logs_imported, 0);
    assert_eq!(count(&pool, "logs").await, 0);
}
