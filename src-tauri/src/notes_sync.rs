use crate::db::tables::app_metadata_kv::META_NOTES_TEXT;
use crate::db::{get_pool, Error};
use crate::sync::{require_authenticated_success, sync_http_client, sync_server_url};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

const STATE: &str = "notes_sync_v1";
#[derive(Default, Serialize, Deserialize)]
struct State {
    server: String,
    revision: i64,
    text: String,
    operation_id: String,
}
#[derive(Deserialize)]
struct Snapshot {
    revision: i64,
    text: String,
}

pub async fn save(
    pool: &SqlitePool,
    text: &str,
    expected: Option<&str>,
) -> Result<String, sqlx::Error> {
    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
    let current: Option<String> = sqlx::query_scalar("SELECT value FROM app_metadata WHERE key=?")
        .bind(META_NOTES_TEXT)
        .fetch_optional(&mut *tx)
        .await?;
    let current = current.unwrap_or_default();
    let text = if expected.is_some_and(|expected| expected != current) && current != text {
        preserve(&current, text)
    } else {
        text.to_string()
    };
    sqlx::query("INSERT OR REPLACE INTO app_metadata(key,value) VALUES (?,?)")
        .bind(META_NOTES_TEXT)
        .bind(&text)
        .execute(&mut *tx)
        .await?;
    // Changing this marker also detects edits made while an HTTP request is in flight.
    sqlx::query("INSERT OR REPLACE INTO app_metadata(key,value) VALUES ('notes_edit_id',?)")
        .bind(uuid::Uuid::new_v4().to_string())
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(text)
}
fn preserve(current: &str, incoming: &str) -> String {
    const PREFIX: &str = "<!--time-tracker-rich-notes-->";
    fn html(value: &str) -> String {
        value
            .strip_prefix(PREFIX)
            .map(str::to_owned)
            .unwrap_or_else(|| {
                format!(
                    "<p>{}</p>",
                    value
                        .replace('&', "&amp;")
                        .replace('<', "&lt;")
                        .replace('>', "&gt;")
                        .replace('\n', "<br>")
                )
            })
    }
    if current.is_empty() {
        return incoming.into();
    }
    if incoming.is_empty() {
        return current.into();
    }
    format!(
        "{PREFIX}{}<h3>Preserved conflicting edit</h3>{}",
        html(current),
        html(incoming)
    )
}
pub async fn sync(device: &str, token: &str, server: &str) -> Result<(), Error> {
    let pool = get_pool().await?;
    sync_with_pool(&pool, device, token, server).await
}
async fn sync_with_pool(
    pool: &SqlitePool,
    device: &str,
    token: &str,
    server: &str,
) -> Result<(), Error> {
    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
    let raw: Option<String> = sqlx::query_scalar("SELECT value FROM app_metadata WHERE key=?")
        .bind(STATE)
        .fetch_optional(&mut *tx)
        .await?;
    let mut state = raw
        .as_deref()
        .map(serde_json::from_str::<State>)
        .transpose()?
        .unwrap_or_default();
    if state.server != server {
        state = State {
            server: server.into(),
            ..Default::default()
        };
    }
    let text: String = sqlx::query_scalar("SELECT value FROM app_metadata WHERE key=?")
        .bind(META_NOTES_TEXT)
        .fetch_optional(&mut *tx)
        .await?
        .unwrap_or_default();
    let edit: Option<String> =
        sqlx::query_scalar("SELECT value FROM app_metadata WHERE key='notes_edit_id'")
            .fetch_optional(&mut *tx)
            .await?;
    let dirty = text != state.text;
    if dirty {
        state.operation_id = edit.clone().unwrap_or_else(|| {
            if state.operation_id.is_empty() {
                uuid::Uuid::new_v4().to_string()
            } else {
                state.operation_id.clone()
            }
        });
    }
    sqlx::query("INSERT OR REPLACE INTO app_metadata(key,value) VALUES (?,?)")
        .bind(STATE)
        .bind(serde_json::to_string(&state)?)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    let url = sync_server_url(server, "notes");
    let request = if dirty {
        sync_http_client()?.post(url).bearer_auth(token).json(&serde_json::json!({"base_revision":state.revision,"operation_id":state.operation_id,"text":text}))
    } else {
        sync_http_client()?.get(url).bearer_auth(token)
    };
    let response = request.send().await?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Err(anyhow::anyhow!("Notes sync requires an updated Time Tracker server").into());
    }
    let snapshot = require_authenticated_success(response, device)
        .await?
        .json::<Snapshot>()
        .await?;
    apply(pool, server, &text, edit.as_deref(), snapshot).await?;
    Ok(())
}
async fn apply(
    pool: &SqlitePool,
    server: &str,
    sent: &str,
    edit: Option<&str>,
    snapshot: Snapshot,
) -> Result<(), Error> {
    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
    let current: Option<String> = sqlx::query_scalar("SELECT value FROM app_metadata WHERE key=?")
        .bind(META_NOTES_TEXT)
        .fetch_optional(&mut *tx)
        .await?;
    let current_edit: Option<String> =
        sqlx::query_scalar("SELECT value FROM app_metadata WHERE key='notes_edit_id'")
            .fetch_optional(&mut *tx)
            .await?;
    if current.as_deref().unwrap_or_default() == sent && current_edit.as_deref() == edit {
        let state = State {
            server: server.into(),
            revision: snapshot.revision,
            text: snapshot.text.clone(),
            operation_id: String::new(),
        };
        for (key, value) in [
            (META_NOTES_TEXT, snapshot.text),
            (STATE, serde_json::to_string(&state)?),
        ] {
            sqlx::query("INSERT OR REPLACE INTO app_metadata(key,value) VALUES (?,?)")
                .bind(key)
                .bind(value)
                .execute(&mut *tx)
                .await?;
        }
    }
    tx.commit().await?;
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::tables::app_metadata_kv::metadata_get;
    #[tokio::test]
    async fn response_cannot_overwrite_typing_and_migration_keeps_notes() {
        let p = SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::query("CREATE TABLE app_metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL)")
            .execute(&p)
            .await
            .unwrap();
        save(&p, "legacy notes", None).await.unwrap();
        let edit = metadata_get(&p, "notes_edit_id").await.unwrap();
        save(&p, "new typing", Some("legacy notes")).await.unwrap();
        apply(
            &p,
            "server",
            "legacy notes",
            edit.as_deref(),
            Snapshot {
                revision: 1,
                text: "remote notes".into(),
            },
        )
        .await
        .unwrap();
        assert_eq!(
            metadata_get(&p, META_NOTES_TEXT).await.unwrap().unwrap(),
            "new typing"
        );
        let edit = metadata_get(&p, "notes_edit_id").await.unwrap();
        apply(
            &p,
            "server",
            "new typing",
            edit.as_deref(),
            Snapshot {
                revision: 2,
                text: "merged notes".into(),
            },
        )
        .await
        .unwrap();
        assert_eq!(
            metadata_get(&p, META_NOTES_TEXT).await.unwrap().unwrap(),
            "merged notes"
        );
        let saved = save(&p, "typing in stale editor", Some("new typing"))
            .await
            .unwrap();
        assert!(saved.contains("merged notes") && saved.contains("typing in stale editor"));
    }
}
