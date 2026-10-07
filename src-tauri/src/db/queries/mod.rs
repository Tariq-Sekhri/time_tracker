pub mod week;
pub mod statistics;

pub use week::{get_week, get_week_for_app_filter};
pub use statistics::{get_week_statistics, get_day_statistics, get_total_statistics, get_statistics_bounds, get_trend_statistics};

// The pre-optimization database had no active-row indexes. Keep its table-scan
// access path in benchmark fixtures instead of letting new indexes alter the baseline.
#[cfg(test)]
pub async fn legacy_full_history_logs() -> Result<Vec<crate::db::tables::log::Log>, crate::db::Error> {
    let mut perf = crate::perf::Perf::new("db_get_logs_baseline");
    let pool = crate::db::get_pool().await?;
    perf.stage("pool");
    let logs = sqlx::query_as::<_, crate::db::tables::log::Log>(
        "SELECT id, device_uuid, app, timestamp, duration, is_deleted FROM logs NOT INDEXED WHERE is_deleted = 0",
    ).fetch_all(&pool).await?;
    perf.stage("query");
    perf.note("rows", logs.len());
    perf.done();
    Ok(logs)
}
