use sqlx::{SqlitePool, Row};
use crate::db::Error;
use crate::db::backup;

#[derive(Debug, Clone)]
struct ExpectedColumn {
    name: &'static str,
    sql_type: &'static str,
    not_null: bool,
    default_value: Option<&'static str>,
}

#[derive(Debug, Clone)]
struct ExpectedTable {
    name: &'static str,
    columns: Vec<ExpectedColumn>,
}

#[derive(Debug)]
struct ActualColumn {
    name: String,
    sql_type: String,
    not_null: bool,
    default_value: Option<String>,
}

fn get_expected_tables() -> Vec<ExpectedTable> {
    vec![
        ExpectedTable {
            name: "logs",
            columns: vec![
                ExpectedColumn { name: "id", sql_type: "INTEGER", not_null: true, default_value: None },
                ExpectedColumn { name: "app", sql_type: "TEXT", not_null: true, default_value: None },
                ExpectedColumn { name: "timestamp", sql_type: "INTEGER", not_null: true, default_value: None },
                ExpectedColumn { name: "duration", sql_type: "INTEGER", not_null: true, default_value: Some("0") },
            ],
        },
        ExpectedTable {
            name: "category",
            columns: vec![
                ExpectedColumn { name: "id", sql_type: "INTEGER", not_null: true, default_value: None },
                ExpectedColumn { name: "name", sql_type: "TEXT", not_null: true, default_value: None },
                ExpectedColumn { name: "priority", sql_type: "INTEGER", not_null: false, default_value: None },
                ExpectedColumn { name: "color", sql_type: "TEXT", not_null: false, default_value: None },
            ],
        },
        ExpectedTable {
            name: "category_regex",
            columns: vec![
                ExpectedColumn { name: "id", sql_type: "INTEGER", not_null: true, default_value: None },
                ExpectedColumn { name: "cat_id", sql_type: "INTEGER", not_null: true, default_value: None },
                ExpectedColumn { name: "regex", sql_type: "TEXT", not_null: true, default_value: None },
            ],
        },
        ExpectedTable {
            name: "skipped_apps",
            columns: vec![
                ExpectedColumn { name: "id", sql_type: "INTEGER", not_null: true, default_value: None },
                ExpectedColumn { name: "regex", sql_type: "TEXT", not_null: true, default_value: None },
            ],
        },
        ExpectedTable {
            name: "google_calendar",
            columns: vec![
                ExpectedColumn { name: "id", sql_type: "INTEGER", not_null: true, default_value: None },
                ExpectedColumn { name: "name", sql_type: "TEXT", not_null: true, default_value: None },
                ExpectedColumn { name: "color", sql_type: "TEXT", not_null: true, default_value: None },
                ExpectedColumn { name: "defaultcolor", sql_type: "TEXT", not_null: true, default_value: None },
                ExpectedColumn { name: "url", sql_type: "TEXT", not_null: true, default_value: None },
            ],
        },
    ]
}

async fn get_table_schema(pool: &SqlitePool, table_name: &str) -> Result<Vec<ActualColumn>, sqlx::Error> {
    let query = format!("PRAGMA table_info({})", table_name);
    let rows = sqlx::query(&query).fetch_all(pool).await?;
    
    let columns = rows.iter().map(|row| {
        ActualColumn {
            name: row.get(1),
            sql_type: row.get(2),
            not_null: row.get::<i32, _>(3) != 0,
            default_value: row.try_get(4).ok(),
        }
    }).collect();
    
    Ok(columns)
}

async fn table_exists(pool: &SqlitePool, table_name: &str) -> Result<bool, sqlx::Error> {
    let count: i64 = sqlx::query_scalar!(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
        table_name
    )
    .fetch_one(pool)
    .await?;
    
    Ok(count > 0)
}

async fn table_has_data(pool: &SqlitePool, table_name: &str) -> Result<bool, sqlx::Error> {
    let query = format!("SELECT COUNT(*) FROM {}", table_name);
    let count: i32 = sqlx::query_scalar(&query)
        .fetch_one(pool)
        .await?;
    
    Ok(count > 0)
}

pub async fn validate_and_repair_database(pool: &SqlitePool) -> Result<ValidationResult, Error> {
    let expected_tables = get_expected_tables();
    let mut result = ValidationResult::default();
    let mut needs_changes = false;
    
    for expected in &expected_tables {
        if !table_exists(pool, expected.name).await? {
            result.missing_tables.push(expected.name.to_string());
            needs_changes = true;
        } else {
            let actual_columns = get_table_schema(pool, expected.name).await?;
            
            for expected_col in &expected.columns {
                if !actual_columns.iter().any(|c| c.name == expected_col.name) {
                    result.missing_columns.push(format!("{}.{}", expected.name, expected_col.name));
                    needs_changes = true;
                }
            }
        }
    }
    
    if needs_changes {
        if let Ok(path) = backup::create_safety_backup("schema_validation") {
            result.backup_created = Some(path.to_string_lossy().to_string());
        }
    }
    
    for expected in &expected_tables {
        if !table_exists(pool, expected.name).await? {
            create_table_safe(pool, expected).await?;
            result.tables_created.push(expected.name.to_string());
        } else {
            let actual_columns = get_table_schema(pool, expected.name).await?;
            
            for expected_col in &expected.columns {
                if !actual_columns.iter().any(|c| c.name == expected_col.name) {
                    add_column_safe(pool, expected.name, expected_col).await?;
                    result.columns_added.push(format!("{}.{}", expected.name, expected_col.name));
                }
            }
            
            for actual_col in &actual_columns {
                if !expected.columns.iter().any(|c| c.name == actual_col.name) {
                    result.extra_columns.push(format!("{}.{}", expected.name, actual_col.name));
                }
            }
        }
    }
    
    ensure_default_data(pool).await?;
    
    Ok(result)
}

async fn create_table_safe(pool: &SqlitePool, table: &ExpectedTable) -> Result<(), Error> {
    use crate::db::tables;
    
    match table.name {
        "logs" => tables::log::create_table(pool).await?,
        "category" => tables::category::create_table(pool).await?,
        "category_regex" => tables::cat_regex::create_table(pool).await?,
        "skipped_apps" => tables::skipped_app::create_table(pool).await?,
        "google_calendar" => tables::google_calendar::create_table(pool).await?,
        _ => {
            return Err(Error::Db(format!("Unknown table: {}", table.name)));
        }
    }
    
    Ok(())
}

async fn add_column_safe(pool: &SqlitePool, table_name: &str, column: &ExpectedColumn) -> Result<(), Error> {
    let mut sql = format!(
        "ALTER TABLE {} ADD COLUMN {} {}",
        table_name,
        column.name,
        column.sql_type
    );
    
    if column.not_null {
        let default = column.default_value.unwrap_or_else(|| {
            match column.sql_type {
                "INTEGER" => "0",
                "TEXT" => "''",
                _ => "NULL",
            }
        });
        sql.push_str(&format!(" NOT NULL DEFAULT {}", default));
    } else if let Some(default) = column.default_value {
        sql.push_str(&format!(" DEFAULT {}", default));
    }
    
    sqlx::query(&sql)
        .execute(pool)
        .await
        .map_err(|e| Error::Db(format!("Failed to add column {}.{}: {}", table_name, column.name, e)))?;
    
    Ok(())
}

async fn ensure_default_data(pool: &SqlitePool) -> Result<(), Error> {
    let misc_id: Option<i32> = sqlx::query_scalar!(
        "SELECT id as \"id!: i32\" FROM category WHERE name = 'Miscellaneous'"
    )
    .fetch_optional(pool)
    .await?;
    
    if let Some(id) = misc_id {
        let regex_count: i64 = sqlx::query_scalar!(
            "SELECT COUNT(*) FROM category_regex WHERE cat_id = ?1 AND regex = '.*'",
            id
        )
        .fetch_one(pool)
        .await?;
        
        if regex_count == 0 {
            sqlx::query!(
                "INSERT INTO category_regex (cat_id, regex) VALUES (?1, ?2)",
                id,
                ".*"
            )
            .execute(pool)
            .await?;
        }
    }
    
    Ok(())
}

#[derive(Debug, Default)]
pub struct ValidationResult {
    pub backup_created: Option<String>,
    pub missing_tables: Vec<String>,
    pub tables_created: Vec<String>,
    pub missing_columns: Vec<String>,
    pub columns_added: Vec<String>,
    pub extra_columns: Vec<String>,
}

impl ValidationResult {
    pub fn has_changes(&self) -> bool {
        !self.tables_created.is_empty() || !self.columns_added.is_empty()
    }
    
    pub fn summary(&self) -> String {
        let mut parts = Vec::new();
        
        if let Some(backup) = &self.backup_created {
            parts.push(format!("Backup created: {}", backup));
        }
        
        if !self.tables_created.is_empty() {
            parts.push(format!("Tables created: {}", self.tables_created.join(", ")));
        }
        
        if !self.columns_added.is_empty() {
            parts.push(format!("Columns added: {}", self.columns_added.join(", ")));
        }
        
        if !self.extra_columns.is_empty() {
            parts.push(format!("Extra columns (preserved): {}", self.extra_columns.join(", ")));
        }
        
        if parts.is_empty() {
            "No changes needed".to_string()
        } else {
            parts.join("\n")
        }
    }
}
