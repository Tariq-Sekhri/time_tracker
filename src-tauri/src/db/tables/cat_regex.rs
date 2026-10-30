use crate::db;
use crate::db::queries::category_match::{build_regex_table, find_match, rule_order, FALLBACK_CATEGORY};
use crate::db::Error;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqliteConnection, SqlitePool};

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

/// One entry of the single rule list: exactly one of the two targets is set.
#[derive(Debug, Serialize, FromRow, Deserialize)]
pub struct CategoryRule {
    pub id: i32,
    pub cat_id: Option<i32>,
    pub manual_project_id: Option<i64>,
    pub regex: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NewCategoryRule {
    pub cat_id: Option<i32>,
    pub manual_project_id: Option<i64>,
    pub regex: String,
}

#[derive(Debug, Serialize)]
pub struct MatchingCategoryRule {
    pub rule: Option<CategoryRegex>,
    pub category_name: String,
    pub subcategory: Option<String>,
}

fn matching_rule(app: &str, categories: &[super::category::Category], rules: Vec<CategoryRegex>) -> Result<MatchingCategoryRule, Error> {
    // The calendar and statistics both choose the first match after a stable priority sort.
    let table = build_regex_table(categories, &rules)?;
    Ok(match find_match(app, &table) {
        Some(matched) => MatchingCategoryRule {
            category_name: matched.category.clone(),
            subcategory: matched.subcategory.clone(),
            rule: rules.into_iter().find(|rule| rule.id == matched.rule_id),
        },
        None => MatchingCategoryRule {rule: None, category_name: FALLBACK_CATEGORY.into(), subcategory: None},
    })
}

#[tauri::command]
pub async fn get_matching_category_rule(app_name: String) -> Result<MatchingCategoryRule, Error> {
    matching_rule(&app_name, &super::category::get_categories().await?, get_cat_regex().await?)
}

#[cfg(test)]
mod matching_rule_tests {
    use super::*;
    fn category(id: i32, priority: i32) -> super::super::category::Category {
        super::super::category::Category {id, name: format!("Category {id}"), priority, color: None, regex_enabled: true, is_visible: true, in_stats: true, is_collapsed: false, parent_id: None}
    }
    fn rule(id: i32, cat_id: i32, pattern: &str) -> CategoryRegex {CategoryRegex {id, cat_id, regex: pattern.into()}}
    #[test]
    fn identifies_the_calendar_winner_by_priority_stable_ties_and_rust_regex_syntax() {
        let categories = [category(1, 500), category(2, 400)];
        let result = matching_rule("Windows Explorer", &categories, vec![rule(10, 2, "^Windows Explorer$"), rule(20, 1, "(?i)windows")]).unwrap();
        assert_eq!(result.rule.unwrap().id, 20);
        let result = matching_rule("Windows Explorer", &[category(1, 500), category(2, 500)], vec![rule(10, 2, "Explorer"), rule(20, 1, "Windows")]).unwrap();
        assert_eq!(result.rule.unwrap().id, 10);
        assert!(matching_rule("No match", &categories, vec![rule(10, 1, "Windows")]).unwrap().rule.is_none());
    }
}

pub async fn create_table(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS category_regex (
    id                INTEGER
        primary key autoincrement,
    cat_id            INTEGER,
    manual_project_id INTEGER,
    regex             TEXT    not null,
    CHECK ((cat_id IS NULL) <> (manual_project_id IS NULL))
);",
    )
    .execute(pool)
    .await?;

    Ok(())
}

/// Older databases required `cat_id`, which manual rules leave empty.
pub async fn ensure_schema(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    let cat_id_required: Option<bool> = sqlx::query_scalar("SELECT \"notnull\" FROM pragma_table_info('category_regex') WHERE name = 'cat_id'")
        .fetch_optional(pool).await?;
    if cat_id_required == Some(true) {
        let mut transaction = pool.begin().await?;
        sqlx::query("ALTER TABLE category_regex RENAME TO category_regex_legacy").execute(&mut *transaction).await?;
        sqlx::query(
            "CREATE TABLE category_regex (
                id                INTEGER PRIMARY KEY AUTOINCREMENT,
                cat_id            INTEGER,
                manual_project_id INTEGER,
                regex             TEXT NOT NULL,
                CHECK ((cat_id IS NULL) <> (manual_project_id IS NULL))
            )",
        ).execute(&mut *transaction).await?;
        sqlx::query("INSERT INTO category_regex (id, cat_id, regex) SELECT id, cat_id, regex FROM category_regex_legacy")
            .execute(&mut *transaction).await?;
        sqlx::query("DROP TABLE category_regex_legacy").execute(&mut *transaction).await?;
        transaction.commit().await?;
    }
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
    (
        "watching_season",
        "Watching",
        r"(?i)\bS(?:0[1-9]|[1-9]\d?)\b|Season\s+(?:0[1-9]|[1-9]\d?)\b",
    ),
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
    ("gaming_hi_fi_rush", "Gaming", "Hi-Fi RUSH"),
    (
        "gaming_minecraft_multiplayer",
        "Gaming",
        "Minecraft 1.21.11 - Multiplayer (3rd-party Server)",
    ),
    ("gaming_battlenet_window", "Gaming", r"^Battle\.net$"),
    ("gaming_call_of_duty", "Gaming", r"^Call of Duty®$"),
    ("gaming_multimc", "Gaming", r"^New Instance - MultiMC 5$"),
    ("gaming_ninjabrain_bot", "Gaming", r"^Ninjabrain Bot$"),
    ("gaming_thefinals_exact", "Gaming", r"^THEFINALS$"),
    ("gaming_xbox", "Gaming", r"^Xbox$"),
    ("gaming_wardogs", "Gaming", r"(?i)^Wardogs$"),
    ("gaming_ark_survival_ascended", "Gaming", r"(?i)^ArkAscended$"),
    ("gaming_farfarwest", "Gaming", r"(?i)^FarFarWest$"),
    ("gaming_chameleon", "Gaming", r"(?i)^Chameleon(?: - Meccha Chameleon)?$"),
    ("gaming_counter_strike_2", "Gaming", r"(?i)^Counter-Strike 2(?: - cs2\.exe)?$"),
    ("gaming_dark_and_darker", "Gaming", r"(?i)^Dark and Darker$"),
    ("gaming_space_marine_2", "Gaming", r"(?i)^Warhammer 40,000: Space Marine 2\b"),
    ("gaming_left_4_dead_2", "Gaming", r"(?i)^Left 4 Dead 2(?: - Direct3D 9)?$"),
    ("gaming_jump_space", "Gaming", r"(?i)^Jump Space$"),
    ("gaming_warframe", "Gaming", r"(?i)^Warframe$"),
    ("gaming_brawlhalla", "Gaming", r"(?i)^Brawlhalla$"),
    ("gaming_house_flipper", "Gaming", r"(?i)^House Flipper(?: Game)?$"),
    ("gaming_for_honor", "Gaming", r"(?i)^For Honor(?:\x{00AE})?(?: - ForHonor)?$"),
    ("gaming_skate", "Gaming", r"(?i)^skate\.$"),
    ("gaming_openguessr", "Gaming", r"(?i)^OpenGuessr(?: - .*)?$"),
    ("gaming_linkedin_games", "Gaming", r"(?i)^(?:Queens|Tango|Zip|Patches|Mini Sudoku|Games) \| LinkedIn - (?:Vivaldi|Google Chrome|Microsoft Edge)$"),
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
    ("learning_coursera", "Reading", "Coursera"),
    ("learning_udemy", "Reading", "Udemy"),
    ("learning_duolingo", "Reading", "Duolingo"),
    ("learning_khan_academy", "Reading", "Khan Academy"),
    ("learning_edx", "Reading", "edX"),
    ("learning_skillshare", "Reading", "Skillshare"),
    ("learning_pluralsight", "Reading", "Pluralsight"),
    ("learning_udacity", "Reading", "Udacity"),
    ("learning_freecodecamp", "Reading", "freeCodeCamp"),
    ("learning_leetcode", "Reading", "LeetCode"),
    ("learning_geeksforgeeks", "Reading", "GeeksforGeeks"),
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
             WHERE c.parent_id IS NULL AND NOT (c.name = ?1 AND cr.regex = ?2)",
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
            for (seed_key, category_name, regex) in DEFAULT_REGEXES {
                let exists: Option<i64> = sqlx::query_scalar(
                    "SELECT 1
                     FROM category_regex cr
                     JOIN category c ON c.id = cr.cat_id
                     WHERE c.name = ?1 AND c.parent_id IS NULL AND cr.regex = ?2
                     LIMIT 1",
                )
                .bind(category_name)
                .bind(regex)
                .fetch_optional(pool)
                .await?;
                if exists.is_some() {
                    mark_seed_as_applied(pool, seed_key).await?;
                }
            }
        }

        sqlx::query("INSERT OR REPLACE INTO app_metadata (key, value) VALUES (?1, ?2)")
            .bind(DEFAULT_REGEX_SEED_VERSION)
            .bind("1")
            .execute(pool)
            .await?;
    }

    let misc: Option<i32> = sqlx::query_scalar("SELECT id FROM category WHERE name = 'Miscellaneous' AND parent_id IS NULL")
        .fetch_optional(pool)
        .await?;
    if let Some(misc_id) = misc {
        sqlx::query(
            "INSERT INTO category_regex (cat_id, regex)
             SELECT ?1, ?2
             WHERE NOT EXISTS (
                 SELECT 1 FROM category_regex WHERE cat_id = ?1 AND regex = ?2
             )",
        )
        .bind(misc_id)
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
    let deleted = is_seed_deleted(pool, seed_key).await?;
    if deleted {
        return Ok(());
    }

    let applied = is_seed_applied(pool, seed_key).await?;
    if applied {
        return Ok(());
    }

    let cat_id: Option<i32> = sqlx::query_scalar("SELECT id FROM category WHERE name = ?1 AND parent_id IS NULL")
        .bind(category_name)
        .fetch_optional(pool)
        .await?;

    if let Some(cat_id) = cat_id {
        sqlx::query(
            "INSERT INTO category_regex (cat_id, regex)
             SELECT ?1, ?2
             WHERE NOT EXISTS (
                 SELECT 1 FROM category_regex WHERE cat_id = ?1 AND regex = ?2
             )",
        )
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

async fn is_seed_deleted(pool: &SqlitePool, seed_key: &str) -> Result<bool, sqlx::Error> {
    let key = format!("default_regex_deleted_{}", seed_key);
    let value: Option<String> = sqlx::query_scalar("SELECT value FROM app_metadata WHERE key = ?1")
        .bind(key)
        .fetch_optional(pool)
        .await?;
    Ok(value.is_some())
}

async fn mark_seed_as_deleted(pool: &SqlitePool, seed_key: &str) -> Result<(), sqlx::Error> {
    let key = format!("default_regex_deleted_{}", seed_key);
    sqlx::query("INSERT OR REPLACE INTO app_metadata (key, value) VALUES (?1, ?2)")
        .bind(key)
        .bind("1")
        .execute(pool)
        .await?;
    Ok(())
}

fn find_seed_key(category_name: &str, regex: &str) -> Option<&'static str> {
    for (seed_key, cat, pattern) in DEFAULT_REGEXES {
        if *cat == category_name && *pattern == regex {
            return Some(*seed_key);
        }
    }
    None
}
/// A rule belongs to exactly one target. Auto rules sort tracked windows when
/// they are read; manual rules file Uncategorized manual entries when they are
/// saved. The two lists never compete with each other.
fn validate_target_shape(cat_id: Option<i32>, manual_project_id: Option<i64>, regex: &str) -> Result<(), Error> {
    if regex.trim().is_empty() {
        return Err(anyhow::anyhow!("Pattern cannot be empty").into());
    }
    regex::Regex::new(regex).map_err(anyhow::Error::new)?;
    if cat_id.is_some() == manual_project_id.is_some() {
        return Err(anyhow::anyhow!("Choose one category for this rule").into());
    }
    Ok(())
}

async fn validate_rule(pool: &SqlitePool, cat_id: Option<i32>, manual_project_id: Option<i64>, regex: &str) -> Result<(), Error> {
    validate_target_shape(cat_id, manual_project_id, regex)?;
    if let Some(cat_id) = cat_id {
        let exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM category WHERE id = ?1").bind(cat_id).fetch_one(pool).await?;
        if exists == 0 {
            return Err(anyhow::anyhow!("Category with id {} does not exist", cat_id).into());
        }
    }
    super::manual_project::validate_project_id(pool, manual_project_id).await
}

async fn insert_rule(pool: &SqlitePool, rule: &NewCategoryRule) -> Result<i64, Error> {
    validate_rule(pool, rule.cat_id, rule.manual_project_id, &rule.regex).await?;
    let result = sqlx::query("INSERT INTO category_regex (cat_id, manual_project_id, regex) VALUES (?1, ?2, ?3)")
        .bind(rule.cat_id)
        .bind(rule.manual_project_id)
        .bind(&rule.regex)
        .execute(pool)
        .await?;
    Ok(result.last_insert_rowid())
}

async fn top_level_name(pool: &SqlitePool, cat_id: Option<i32>) -> Result<Option<String>, Error> {
    let Some(cat_id) = cat_id else { return Ok(None) };
    Ok(sqlx::query_scalar("SELECT name FROM category WHERE id = ?1 AND parent_id IS NULL")
        .bind(cat_id)
        .fetch_optional(pool)
        .await?)
}

async fn find_rule(pool: &SqlitePool, id: i32) -> Result<Option<CategoryRule>, Error> {
    Ok(sqlx::query_as::<_, CategoryRule>("SELECT id, cat_id, manual_project_id, regex FROM category_regex WHERE id = ?1")
        .bind(id)
        .fetch_optional(pool)
        .await?)
}

async fn update_rule(pool: &SqlitePool, rule: &CategoryRule) -> Result<(), Error> {
    validate_rule(pool, rule.cat_id, rule.manual_project_id, &rule.regex).await?;
    let current = find_rule(pool, rule.id).await?
        .ok_or_else(|| anyhow::anyhow!("Regex pattern with id {} does not exist", rule.id))?;
    if let Some(name) = top_level_name(pool, current.cat_id).await? {
        if name == FALLBACK_CATEGORY && current.regex == ".*" {
            return Err(anyhow::anyhow!("The catch-all pattern (.*) for Miscellaneous cannot be edited.").into());
        }
        if let Some(seed_key) = find_seed_key(&name, &current.regex) {
            if current.cat_id != rule.cat_id || current.regex != rule.regex {
                mark_seed_as_deleted(pool, seed_key).await?;
            }
        }
    }
    sqlx::query("UPDATE category_regex SET cat_id = ?1, manual_project_id = ?2, regex = ?3 WHERE id = ?4")
        .bind(rule.cat_id)
        .bind(rule.manual_project_id)
        .bind(&rule.regex)
        .bind(rule.id)
        .execute(pool)
        .await?;
    Ok(())
}

async fn manual_matchers(conn: &mut SqliteConnection) -> Result<Vec<(regex::Regex, i64)>, Error> {
    let rows = sqlx::query_as::<_, (String, i64, i32, Option<i32>)>(
        "SELECT r.regex, p.id, p.priority, parent.priority
         FROM category_regex r
         JOIN manual_projects p ON p.id = r.manual_project_id
         LEFT JOIN manual_projects parent ON parent.id = p.parent_id
         ORDER BY r.id",
    )
    .fetch_all(&mut *conn)
    .await?;
    let mut ordered: Vec<_> = rows.into_iter().map(|(pattern, id, priority, parent)| (rule_order(parent, priority), pattern, id)).collect();
    ordered.sort_by_key(|(order, _, _)| *order);
    // A bad stored pattern must never stop time from being saved.
    Ok(ordered.into_iter().filter_map(|(_, pattern, id)| {
        crate::logger::Log::result("Invalid manual category rule", regex::Regex::new(&pattern)).ok().map(|regex| (regex, id))
    }).collect())
}

fn first_manual_match(title: &str, matchers: &[(regex::Regex, i64)]) -> Option<i64> {
    let title = title.trim();
    if title.is_empty() {
        return None;
    }
    matchers.iter().find(|(regex, _)| regex.is_match(title)).map(|(_, id)| *id)
}

pub(crate) async fn manual_project_for_title(conn: &mut SqliteConnection, title: &str) -> Result<Option<i64>, Error> {
    Ok(first_manual_match(title, &manual_matchers(conn).await?))
}

async fn apply_rules_to_uncategorized(pool: &SqlitePool, now: i64) -> Result<u64, Error> {
    let mut transaction = pool.begin().await?;
    let matchers = manual_matchers(&mut transaction).await?;
    let entries = sqlx::query_as::<_, (i64, String)>("SELECT id, title FROM manual_time_blocks WHERE project_id IS NULL")
        .fetch_all(&mut *transaction)
        .await?;
    let mut updated = 0;
    for (id, title) in entries {
        if let Some(project_id) = first_manual_match(&title, &matchers) {
            updated += sqlx::query("UPDATE manual_time_blocks SET project_id = ?1, updated_at = ?2 WHERE id = ?3")
                .bind(project_id)
                .bind(now)
                .bind(id)
                .execute(&mut *transaction)
                .await?
                .rows_affected();
        }
    }
    transaction.commit().await?;
    Ok(updated)
}

#[tauri::command]
pub async fn get_category_rules() -> Result<Vec<CategoryRule>, Error> {
    let pool = db::get_pool().await?;
    Ok(sqlx::query_as::<_, CategoryRule>("SELECT id, cat_id, manual_project_id, regex FROM category_regex ORDER BY id")
        .fetch_all(&pool)
        .await?)
}

#[tauri::command]
pub async fn insert_category_rule(rule: NewCategoryRule) -> Result<i64, Error> {
    let pool = db::get_pool().await?;
    insert_rule(&pool, &rule).await
}

#[tauri::command]
pub async fn update_category_rule(rule: CategoryRule) -> Result<(), Error> {
    let pool = db::get_pool().await?;
    update_rule(&pool, &rule).await
}

#[tauri::command]
pub async fn match_manual_rule(title: String) -> Result<Option<i64>, Error> {
    let pool = db::get_pool().await?;
    manual_project_for_title(&mut *pool.acquire().await?, &title).await
}

#[tauri::command]
pub async fn apply_manual_rules() -> Result<u64, Error> {
    let pool = db::get_pool().await?;
    let updated = apply_rules_to_uncategorized(&pool, chrono::Utc::now().timestamp()).await?;
    crate::manual_sync::entries_changed_locally();
    Ok(updated)
}

#[tauri::command]
pub async fn insert_cat_regex(new_category_regex: NewCategoryRegex) -> Result<i64, Error> {
    let pool = db::get_pool().await?;
    insert_rule(&pool, &NewCategoryRule {cat_id: Some(new_category_regex.cat_id), manual_project_id: None, regex: new_category_regex.regex}).await
}

#[tauri::command]
pub async fn update_cat_regex_by_id(cat_regex: CategoryRegex) -> Result<(), Error> {
    let pool = db::get_pool().await?;
    update_rule(&pool, &CategoryRule {id: cat_regex.id, cat_id: Some(cat_regex.cat_id), manual_project_id: None, regex: cat_regex.regex}).await
}

#[tauri::command]
pub async fn get_cat_regex_by_id(id: i32) -> Result<CategoryRegex, Error> {
    let pool = db::get_pool().await?;
    let regex = sqlx::query_as::<_, CategoryRegex>("SELECT id, cat_id, regex FROM category_regex WHERE id = ?1 AND cat_id IS NOT NULL")
        .bind(id)
        .fetch_one(&pool)
        .await?;
    Ok(regex)
}

#[tauri::command]
pub async fn get_cat_regex() -> Result<Vec<CategoryRegex>, Error> {
    let pool = db::get_pool().await?;
    let regex = sqlx::query_as::<_, CategoryRegex>("SELECT id, cat_id, regex FROM category_regex WHERE cat_id IS NOT NULL")
        .fetch_all(&pool)
        .await?;
    Ok(regex)
}

#[tauri::command]
pub async fn delete_cat_regex_by_id(id: i32) -> Result<(), Error> {
    let pool = db::get_pool().await?;
    if let Some(rule) = find_rule(&pool, id).await? {
        if let Some(name) = top_level_name(&pool, rule.cat_id).await? {
            if name == FALLBACK_CATEGORY && rule.regex == ".*" {
                return Err(anyhow::anyhow!("The catch-all pattern (.*) for Miscellaneous cannot be deleted.").into());
            }
            if let Some(seed_key) = find_seed_key(&name, &rule.regex) {
                mark_seed_as_deleted(&pool, seed_key).await?;
            }
        }
    }
    sqlx::query("DELETE FROM category_regex WHERE id = ?1")
        .bind(id)
        .execute(&pool)
        .await?;
    Ok(())
}

#[cfg(test)]
mod rule_tests {
    use super::*;

    async fn test_pool() -> SqlitePool {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::query("CREATE TABLE app_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)").execute(&pool).await.unwrap();
        super::super::category::create_table(&pool).await.unwrap();
        super::super::manual_project::create_table(&pool).await.unwrap();
        super::super::manual_time_block::create_table(&pool).await.unwrap();
        create_table(&pool).await.unwrap();
        sqlx::query("INSERT INTO manual_projects (id, name, parent_id, priority) VALUES (1, 'School', NULL, 10), (2, 'Homework', 1, 0), (3, 'Work', NULL, 5)")
            .execute(&pool).await.unwrap();
        pool
    }

    fn manual(project_id: i64, regex: &str) -> NewCategoryRule {
        NewCategoryRule {cat_id: None, manual_project_id: Some(project_id), regex: regex.into()}
    }

    async fn title_match(pool: &SqlitePool, title: &str) -> Option<i64> {
        manual_project_for_title(&mut *pool.acquire().await.unwrap(), title).await.unwrap()
    }

    #[tokio::test]
    async fn legacy_required_cat_id_is_rebuilt_without_losing_rules() {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::query("CREATE TABLE category_regex (id INTEGER PRIMARY KEY AUTOINCREMENT, cat_id INTEGER NOT NULL, regex TEXT NOT NULL)").execute(&pool).await.unwrap();
        sqlx::query("ALTER TABLE category_regex ADD COLUMN manual_project_id INTEGER").execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO category_regex (id, cat_id, regex) VALUES (5, 2, 'Code')").execute(&pool).await.unwrap();
        ensure_schema(&pool).await.unwrap();
        ensure_schema(&pool).await.unwrap();
        let row: (i32, Option<i32>, Option<i64>, String) = sqlx::query_as("SELECT id, cat_id, manual_project_id, regex FROM category_regex").fetch_one(&pool).await.unwrap();
        assert_eq!(row, (5, Some(2), None, "Code".into()));
        sqlx::query("INSERT INTO category_regex (manual_project_id, regex) VALUES (1, 'x')").execute(&pool).await.unwrap();
        assert!(sqlx::query("INSERT INTO category_regex (cat_id, manual_project_id, regex) VALUES (1, 1, 'x')").execute(&pool).await.is_err());
        assert!(sqlx::query("INSERT INTO category_regex (regex) VALUES ('x')").execute(&pool).await.is_err());
    }

    #[tokio::test]
    async fn rules_need_exactly_one_real_target_and_a_valid_pattern() {
        let pool = test_pool().await;
        assert!(insert_rule(&pool, &NewCategoryRule {cat_id: Some(1), manual_project_id: Some(1), regex: "x".into()}).await.is_err());
        assert!(insert_rule(&pool, &NewCategoryRule {cat_id: None, manual_project_id: None, regex: "x".into()}).await.is_err());
        assert!(insert_rule(&pool, &manual(99, "x")).await.is_err());
        assert!(insert_rule(&pool, &manual(1, "  ")).await.is_err());
        assert!(insert_rule(&pool, &manual(1, "(")).await.is_err());
        let id = insert_rule(&pool, &manual(1, "Essay")).await.unwrap() as i32;
        let category: i32 = sqlx::query_scalar("SELECT id FROM category WHERE name = 'Coding'").fetch_one(&pool).await.unwrap();
        // One rule list: a rule can move between auto and manual targets.
        update_rule(&pool, &CategoryRule {id, cat_id: Some(category), manual_project_id: None, regex: "Essay".into()}).await.unwrap();
        assert_eq!(title_match(&pool, "Essay").await, None);
    }

    #[tokio::test]
    async fn manual_rules_follow_priority_and_ignore_blank_titles_and_bad_patterns() {
        let pool = test_pool().await;
        insert_rule(&pool, &manual(3, "Essay")).await.unwrap();
        insert_rule(&pool, &manual(1, "Essay")).await.unwrap();
        insert_rule(&pool, &manual(2, "Essay draft")).await.unwrap();
        sqlx::query("INSERT INTO category_regex (manual_project_id, regex) VALUES (3, '(')").execute(&pool).await.unwrap();
        insert_rule(&pool, &manual(3, ".*")).await.unwrap();
        assert_eq!(title_match(&pool, "Essay").await, Some(1));
        assert_eq!(title_match(&pool, "Essay draft").await, Some(2));
        assert_eq!(title_match(&pool, "Standup").await, Some(3));
        assert_eq!(title_match(&pool, "   ").await, None);
    }

    #[tokio::test]
    async fn applying_rules_only_touches_uncategorized_entries() {
        let pool = test_pool().await;
        insert_rule(&pool, &manual(1, "Essay")).await.unwrap();
        sqlx::query("INSERT INTO manual_time_blocks (title, project_id, start_time, end_time, created_at, updated_at) VALUES ('Essay', NULL, 1, 2, 1, 1), ('Essay', 3, 3, 4, 1, 1), ('Other', NULL, 5, 6, 1, 1)")
            .execute(&pool).await.unwrap();
        assert_eq!(apply_rules_to_uncategorized(&pool, 50).await.unwrap(), 1);
        let rows: Vec<(Option<i64>, i64)> = sqlx::query_as("SELECT project_id, updated_at FROM manual_time_blocks ORDER BY id").fetch_all(&pool).await.unwrap();
        assert_eq!(rows, vec![(Some(1), 50), (Some(3), 1), (None, 1)]);
    }
}
