use crate::db;
use crate::db::Error;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

#[derive(Debug, Serialize, FromRow, Deserialize)]
pub struct CategoryRegex {
    pub id: i32,
    pub cat_id: i32,
    pub regex: String,
}
#[derive(Debug, Serialize, Deserialize)]
pub struct NewCategoryRegex {
    cat_id: i32,
    regex: String,
}

pub async fn create_table(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS category_regex (
    id       INTEGER
        primary key autoincrement,
    cat_id   INTEGER not null,
    regex    TEXT    not null
);",
    )
    .execute(pool)
    .await?;

    Ok(())
}

const DEFAULT_REGEX_SEED_VERSION: &str = "default_regex_seed_initialized_v2";
const DEFAULT_REGEXES: &[(&str, &str, &str)] = &[
    ("social_anydesk", "Social", "AnyDesk"),
    ("social_discord", "Social", "Discord"),
    ("social_whatsapp", "Social", "WhatsApp"),
    ("social_telegram", "Social", "Telegram"),
    ("social_slack", "Social", "Slack"),
    ("social_teams", "Social", "Microsoft Teams"),
    ("social_zoom", "Social", "Zoom"),
    ("social_skype", "Social", "Skype"),
    ("social_messenger", "Social", "Messenger"),
    ("watching_s1", "Watching", "S1"),
    ("watching_steelseries_gg", "Watching", "SteelSeries GG"),
    ("watching_twitch", "Watching", "Twitch"),
    ("watching_voidflix", "Watching", "VoidFlix"),
    ("watching_watch", "Watching", "Watch"),
    ("watching_youtube", "Watching", "YouTube"),
    ("watching_netflix", "Watching", "Netflix"),
    ("watching_prime_video", "Watching", "Prime Video"),
    ("watching_disney_plus", "Watching", "Disney+"),
    ("watching_hulu", "Watching", "Hulu"),
    ("watching_hbo_max", "Watching", "HBO Max"),
    ("watching_vlc", "Watching", "VLC"),
    ("gaming_among_us", "Gaming", "Among Us"),
    ("gaming_deadlock", "Gaming", "Deadlock"),
    ("gaming_fortnite", "Gaming", "Fortnite"),
    ("gaming_fragpunk", "Gaming", "FragPunk"),
    ("gaming_freeways", "Gaming", "Freeways"),
    ("gaming_highguard", "Gaming", "Highguard"),
    ("gaming_spiderman2", "Gaming", "Marvel's Spider-Man 2 v1.526.0.0"),
    ("gaming_midnight_murder_club", "Gaming", "Midnight Murder Club"),
    ("gaming_minecraft", "Gaming", "Minecraft"),
    ("gaming_overwatch", "Gaming", "Overwatch"),
    ("gaming_prison_life", "Gaming", "Prison Life"),
    ("gaming_pummel_party", "Gaming", "Pummel Party"),
    ("gaming_roblox", "Gaming", "Roblox"),
    ("gaming_split_fiction", "Gaming", "Split Fiction"),
    ("gaming_the_finals", "Gaming", "THE FINALS"),
    ("gaming_tf2", "Gaming", "Team Fortress 2 - Direct3D 9 - 64 Bit"),
    ("gaming_trackmania", "Gaming", "Trackmania"),
    ("gaming_valorant", "Gaming", "VALORANT"),
    ("gaming_rocket_league", "Gaming", r"^Rocket League \(64-bit, DX11, Cooked\)$"),
    ("gaming_steam", "Gaming", "Steam"),
    ("gaming_epic_games", "Gaming", "Epic Games"),
    ("gaming_battlenet", "Gaming", "Battle.net"),
    ("gaming_riot_client", "Gaming", "Riot Client"),
    ("gaming_gog_galaxy", "Gaming", "GOG Galaxy"),
    ("gaming_ea_app", "Gaming", "EA app"),
    ("gaming_ubisoft_connect", "Gaming", "Ubisoft Connect"),
    ("coding_admin_powershell", "Coding", "Administrator: Windows PowerShell"),
    ("coding_cursor", "Coding", "Cursor"),
    ("coding_github_desktop", "Coding", "GitHub Desktop"),
    ("coding_vscode", "Coding", "Visual Studio Code"),
    ("coding_cmd", "Coding", "cmd.exe"),
    ("coding_terminal", "Coding", "Terminal"),
    ("coding_windows_powershell", "Coding", "Windows PowerShell"),
    ("coding_intellij", "Coding", "IntelliJ"),
    ("coding_pycharm", "Coding", "PyCharm"),
    ("coding_webstorm", "Coding", "WebStorm"),
    ("coding_rider", "Coding", "Rider"),
    ("coding_phpstorm", "Coding", "PhpStorm"),
    ("coding_goland", "Coding", "GoLand"),
    ("coding_clion", "Coding", "CLion"),
    ("coding_neovim", "Coding", "Neovim"),
    ("coding_sublime_text", "Coding", "Sublime Text"),
    ("coding_postman", "Coding", "Postman"),
    ("coding_dbeaver", "Coding", "DBeaver"),
    ("coding_android_studio", "Coding", "Android Studio"),
    ("coding_xcode", "Coding", "Xcode"),
    ("learning_coursera", "Learning", "Coursera"),
    ("learning_udemy", "Learning", "Udemy"),
    ("learning_duolingo", "Learning", "Duolingo"),
    ("learning_khan_academy", "Learning", "Khan Academy"),
    ("learning_edx", "Learning", "edX"),
    ("learning_skillshare", "Learning", "Skillshare"),
    ("learning_pluralsight", "Learning", "Pluralsight"),
    ("learning_udacity", "Learning", "Udacity"),
    ("learning_freecodecamp", "Learning", "freeCodeCamp"),
    ("learning_leetcode", "Learning", "LeetCode"),
    ("learning_geeksforgeeks", "Learning", "GeeksforGeeks"),
    ("reading_kindle", "Reading", "Kindle"),
    ("reading_adobe_acrobat", "Reading", "Adobe Acrobat"),
    ("reading_pdf_title", "Reading", " - PDF"),
    ("reading_pdf_ext", "Reading", r"\.pdf"),
    ("reading_google_docs", "Reading", "Google Docs"),
    ("reading_notion", "Reading", "Notion"),
    ("reading_medium", "Reading", "Medium"),
    ("reading_substack", "Reading", "Substack"),
    ("reading_wikipedia", "Reading", "Wikipedia"),
    ("reading_microsoft_word", "Reading", "Microsoft Word"),
    ("music_spotify", "Music", "Spotify"),
    ("music_youtube_music", "Music", "YouTube Music"),
    ("music_itunes", "Music", "iTunes"),
    ("music_apple_music", "Music", "Apple Music"),
    ("music_soundcloud", "Music", "SoundCloud"),
    ("music_tidal", "Music", "Tidal"),
    ("music_deezer", "Music", "Deezer"),
    ("music_amazon_music", "Music", "Amazon Music"),
    ("music_pandora", "Music", "Pandora"),
    ("music_bandcamp", "Music", "Bandcamp"),
    ("music_vlc", "Music", "VLC"),
    ("music_winamp", "Music", "Winamp"),
    ("browsing_vivaldi", "Browsing", "Vivaldi"),
    ("browsing_chrome", "Browsing", "Chrome"),
    ("browsing_firefox", "Browsing", "Firefox"),
    ("browsing_edge", "Browsing", "Microsoft Edge"),
    ("browsing_brave", "Browsing", "Brave"),
    ("browsing_safari", "Browsing", "Safari"),
    ("browsing_opera", "Browsing", "Opera"),
    ("browsing_arc", "Browsing", "Arc"),
    ("browsing_duckduckgo", "Browsing", "DuckDuckGo"),
    ("browsing_floorp", "Browsing", "Floorp"),
    ("browsing_waterfox", "Browsing", "Waterfox"),
];

pub async fn ensure_default_regexes(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    let initialized: Option<String> =
        sqlx::query_scalar("SELECT value FROM app_metadata WHERE key = ?1")
            .bind(DEFAULT_REGEX_SEED_VERSION)
            .fetch_optional(pool)
            .await?;

    if initialized.is_none() {
        let non_misc_regex_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM category_regex cr
             JOIN category c ON c.id = cr.cat_id
             WHERE NOT (c.name = ?1 AND cr.regex = ?2)",
        )
        .bind("Miscellaneous")
        .bind(".*")
        .fetch_one(pool)
        .await?;

        let is_fresh = non_misc_regex_count == 0;
        if is_fresh {
            for (seed_key, category_name, regex) in DEFAULT_REGEXES {
                apply_default_regex_seed(pool, seed_key, category_name, regex).await?;
            }
        } else {
            for (seed_key, _, _) in DEFAULT_REGEXES {
                mark_seed_as_applied(pool, seed_key).await?;
            }
        }

        sqlx::query("INSERT OR REPLACE INTO app_metadata (key, value) VALUES (?1, ?2)")
            .bind(DEFAULT_REGEX_SEED_VERSION)
            .bind("1")
            .execute(pool)
            .await?;
    }

    let misc = sqlx::query!("SELECT id FROM category WHERE name = 'Miscellaneous'")
        .fetch_optional(pool)
        .await?;
    if let Some(m) = misc {
        sqlx::query(
            "INSERT INTO category_regex (cat_id, regex)
             SELECT ?1, ?2
             WHERE NOT EXISTS (
                 SELECT 1 FROM category_regex WHERE cat_id = ?1 AND regex = ?2
             )",
        )
        .bind(m.id)
        .bind(".*")
        .execute(pool)
        .await?;
    }

    for (seed_key, category_name, regex) in DEFAULT_REGEXES {
        apply_default_regex_seed(pool, seed_key, category_name, regex).await?;
    }

    Ok(())
}

async fn apply_default_regex_seed(
    pool: &SqlitePool,
    seed_key: &str,
    category_name: &str,
    regex: &str,
) -> Result<(), sqlx::Error> {
    let applied = is_seed_applied(pool, seed_key).await?;
    if applied {
        return Ok(());
    }

    let cat_id: Option<i32> = sqlx::query_scalar("SELECT id FROM category WHERE name = ?1")
        .bind(category_name)
        .fetch_optional(pool)
        .await?;

    if let Some(cat_id) = cat_id {
        sqlx::query("INSERT OR IGNORE INTO category_regex (cat_id, regex) VALUES (?1, ?2)")
            .bind(cat_id)
            .bind(regex)
            .execute(pool)
            .await?;
    }

    mark_seed_as_applied(pool, seed_key).await?;
    Ok(())
}

async fn is_seed_applied(pool: &SqlitePool, seed_key: &str) -> Result<bool, sqlx::Error> {
    let key = format!("default_regex_applied_{}", seed_key);
    let value: Option<String> = sqlx::query_scalar("SELECT value FROM app_metadata WHERE key = ?1")
        .bind(key)
        .fetch_optional(pool)
        .await?;
    Ok(value.is_some())
}

async fn mark_seed_as_applied(pool: &SqlitePool, seed_key: &str) -> Result<(), sqlx::Error> {
    let key = format!("default_regex_applied_{}", seed_key);
    sqlx::query("INSERT OR REPLACE INTO app_metadata (key, value) VALUES (?1, ?2)")
        .bind(key)
        .bind("1")
        .execute(pool)
        .await?;
    Ok(())
}
#[tauri::command]
pub async fn insert_cat_regex(new_category_regex: NewCategoryRegex) -> Result<i64, Error> {
    let pool = db::get_pool().await?;
    let result = sqlx::query!(
        "INSERT INTO category_regex (cat_id, regex) VALUES (?1, ?2)",
        new_category_regex.cat_id,
        new_category_regex.regex
    )
    .execute(&pool)
    .await?;
    Ok(result.last_insert_rowid())
}

#[tauri::command]
pub async fn update_cat_regex_by_id(cat_regex: CategoryRegex) -> Result<(), Error> {
    let pool = db::get_pool().await?;
    
    let current = sqlx::query_as!(
        CategoryRegex,
        r#"SELECT id as "id!: i32", cat_id as "cat_id!: i32", regex FROM category_regex WHERE id = ?1"#,
        cat_regex.id
    )
    .fetch_optional(&pool)
    .await?;
    if let Some(ref row) = current {
        let cat_name: Option<String> = sqlx::query_scalar("SELECT name FROM category WHERE id = ?1")
            .bind(row.cat_id)
            .fetch_optional(&pool)
            .await?;
        if cat_name.as_deref() == Some("Miscellaneous") && row.regex == ".*" {
            return Err(anyhow::anyhow!("The catch-all pattern (.*) for Miscellaneous cannot be edited.").into());
        }
    }
    
    let category_exists: i64 = sqlx::query_scalar!(
        "SELECT COUNT(*) FROM category WHERE id = ?1",
        cat_regex.cat_id
    )
    .fetch_one(&pool)
    .await?;
    
    if category_exists == 0 {
        return Err(anyhow::anyhow!("Category with id {} does not exist", cat_regex.cat_id).into());
    }
    
    let regex_exists: i64 = sqlx::query_scalar!(
        "SELECT COUNT(*) FROM category_regex WHERE id = ?1",
        cat_regex.id
    )
    .fetch_one(&pool)
    .await?;
    
    if regex_exists == 0 {
        return Err(anyhow::anyhow!("Regex pattern with id {} does not exist", cat_regex.id).into());
    }
    
    sqlx::query!(
        "UPDATE category_regex SET cat_id = ?1, regex = ?2 WHERE id = ?3",
        cat_regex.cat_id,
        cat_regex.regex,
        cat_regex.id
    )
    .execute(&pool)
    .await?;
    Ok(())
}
#[tauri::command]
pub async fn get_cat_regex_by_id(id: i32) -> Result<CategoryRegex, Error> {
    let pool = db::get_pool().await?;
    let regex = sqlx::query_as!(
        CategoryRegex,
        r#"SELECT id as "id!: i32", cat_id as "cat_id!: i32", regex FROM category_regex WHERE id = ?1"#,
        id
    )
    .fetch_one(&pool)
    .await?;
    Ok(regex)
}
#[tauri::command]
pub async fn get_cat_regex() -> Result<Vec<CategoryRegex>, Error> {
    let pool = db::get_pool().await?;
    let regex = sqlx::query_as!(
        CategoryRegex,
        r#"SELECT id as "id!: i32", cat_id as "cat_id!: i32", regex FROM category_regex"#
    )
    .fetch_all(&pool)
    .await?;
    Ok(regex)
}
#[tauri::command]
pub async fn delete_cat_regex_by_id(id: i32) -> Result<(), Error> {
    let pool = db::get_pool().await?;
    let row = sqlx::query_as!(
        CategoryRegex,
        r#"SELECT id as "id!: i32", cat_id as "cat_id!: i32", regex FROM category_regex WHERE id = ?1"#,
        id
    )
    .fetch_optional(&pool)
    .await?;
    if let Some(ref r) = row {
        let cat_name: Option<String> = sqlx::query_scalar("SELECT name FROM category WHERE id = ?1")
            .bind(r.cat_id)
            .fetch_optional(&pool)
            .await?;
        if cat_name.as_deref() == Some("Miscellaneous") && r.regex == ".*" {
            return Err(anyhow::anyhow!("The catch-all pattern (.*) for Miscellaneous cannot be deleted.").into());
        }
    }
    sqlx::query!("DELETE FROM category_regex WHERE id = ?1", id)
        .execute(&pool)
        .await?;
    Ok(())
}
