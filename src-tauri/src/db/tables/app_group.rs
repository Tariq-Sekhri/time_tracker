use crate::db;
use crate::db::Error;
use regex::Regex;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct AppGroup {
    pub id: i32,
    pub name: String,
    pub regex: String,
}

#[derive(Debug, Deserialize)]
pub struct NewAppGroup {
    pub name: String,
    pub regex: String,
}

#[derive(Debug, Clone)]
pub struct CachedAppGroup {
    name: String,
    regex: Regex,
    specificity: usize,
    id: i32,
}

fn validate(name: &str, pattern: &str) -> Result<(String, String), Error> {
    let name = name.trim();
    let pattern = pattern.trim();
    if name.is_empty() {
        return Err(anyhow::anyhow!("Group name cannot be empty").into());
    }
    if pattern.is_empty() {
        return Err(anyhow::anyhow!("Regex pattern cannot be empty").into());
    }
    Regex::new(pattern).map_err(|error| anyhow::anyhow!("Invalid regex: {error}"))?;
    Ok((name.to_string(), pattern.to_string()))
}

fn regex_specificity(pattern: &str) -> usize {
    pattern
        .chars()
        .filter(|character| character.is_alphanumeric())
        .count()
}

pub fn build_app_group_matchers(groups: &[AppGroup]) -> Result<Vec<CachedAppGroup>, Error> {
    let mut matchers = groups
        .iter()
        .map(|group| {
            Ok(CachedAppGroup {
                name: group.name.clone(),
                regex: Regex::new(&group.regex)?,
                specificity: regex_specificity(&group.regex),
                id: group.id,
            })
        })
        .collect::<Result<Vec<_>, regex::Error>>()?;

    matchers.sort_by(|left, right| {
        right
            .specificity
            .cmp(&left.specificity)
            .then(left.id.cmp(&right.id))
    });
    Ok(matchers)
}

pub fn resolve_app_group<'a>(app: &'a str, matchers: &'a [CachedAppGroup]) -> &'a str {
    matchers
        .iter()
        .find(|matcher| matcher.regex.is_match(app))
        .map(|matcher| matcher.name.as_str())
        .unwrap_or(app)
}

pub async fn create_table(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS app_groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            regex TEXT NOT NULL UNIQUE
        )",
    )
    .execute(pool)
    .await?;
    Ok(())
}

#[tauri::command]
pub async fn get_app_groups() -> Result<Vec<AppGroup>, Error> {
    let pool = db::get_pool().await?;
    Ok(
        sqlx::query_as::<_, AppGroup>("SELECT id, name, regex FROM app_groups ORDER BY id DESC")
            .fetch_all(&pool)
            .await?,
    )
}

#[tauri::command]
pub async fn insert_app_group(new_app_group: NewAppGroup) -> Result<i64, Error> {
    let (name, regex) = validate(&new_app_group.name, &new_app_group.regex)?;
    let pool = db::get_pool().await?;
    let result = sqlx::query("INSERT INTO app_groups (name, regex) VALUES (?1, ?2)")
        .bind(name)
        .bind(regex)
        .execute(&pool)
        .await?;
    Ok(result.last_insert_rowid())
}

#[tauri::command]
pub async fn update_app_group(app_group: AppGroup) -> Result<(), Error> {
    let (name, regex) = validate(&app_group.name, &app_group.regex)?;
    let pool = db::get_pool().await?;
    let result = sqlx::query("UPDATE app_groups SET name = ?1, regex = ?2 WHERE id = ?3")
        .bind(name)
        .bind(regex)
        .bind(app_group.id)
        .execute(&pool)
        .await?;
    if result.rows_affected() == 0 {
        return Err(anyhow::anyhow!("App group {} does not exist", app_group.id).into());
    }
    Ok(())
}

#[tauri::command]
pub async fn delete_app_group(id: i32) -> Result<(), Error> {
    let pool = db::get_pool().await?;
    sqlx::query("DELETE FROM app_groups WHERE id = ?1")
        .bind(id)
        .execute(&pool)
        .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_matching_titles_to_the_group_name() {
        let groups = vec![AppGroup {
            id: 1,
            name: "YouTube".into(),
            regex: "(?i)youtube".into(),
        }];
        let matchers = build_app_group_matchers(&groups).unwrap();
        assert_eq!(
            resolve_app_group("A video - YouTube - Vivaldi", &matchers),
            "YouTube"
        );
        assert_eq!(
            resolve_app_group("Visual Studio Code", &matchers),
            "Visual Studio Code"
        );
    }

    #[test]
    fn the_more_specific_matching_rule_wins() {
        let groups = vec![
            AppGroup {
                id: 1,
                name: "YouTube".into(),
                regex: "(?i)youtube".into(),
            },
            AppGroup {
                id: 2,
                name: "YouTube Music".into(),
                regex: "(?i)youtube music".into(),
            },
        ];
        let matchers = build_app_group_matchers(&groups).unwrap();
        assert_eq!(
            resolve_app_group("YouTube Music - Vivaldi", &matchers),
            "YouTube Music"
        );
    }
}
