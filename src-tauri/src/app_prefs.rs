use crate::db::get_pool;
use crate::db::tables::app_metadata_kv::{self, META_CALENDAR_VIEW_PREFS};
use crate::db::Error;

#[tauri::command]
pub async fn get_calendar_view_prefs() -> Result<Option<String>, Error> {
    let pool = get_pool().await?;
    Ok(app_metadata_kv::metadata_get(&pool, META_CALENDAR_VIEW_PREFS).await?)
}

#[tauri::command]
pub async fn set_calendar_view_prefs(json: String) -> Result<(), Error> {
    let pool = get_pool().await?;
    app_metadata_kv::metadata_set(&pool, META_CALENDAR_VIEW_PREFS, &json).await?;
    Ok(())
}
