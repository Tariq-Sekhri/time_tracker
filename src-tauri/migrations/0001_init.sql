CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  duration INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS category (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  priority INTEGER,
  color TEXT
);

CREATE TABLE IF NOT EXISTS category_regex (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cat_id INTEGER NOT NULL,
  regex TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS skipped_apps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  regex TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS google_oauth (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE IF NOT EXISTS google_calendar_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  google_calendar_id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  account_email TEXT NOT NULL,
  FOREIGN KEY (account_email) REFERENCES google_oauth(email) ON DELETE CASCADE
);

INSERT OR IGNORE INTO category (name, priority, color) VALUES ('Miscellaneous', 0, '#9c9c9c');
INSERT OR IGNORE INTO category (name, priority, color) VALUES ('Browsing', 200, '#ff7300');
INSERT OR IGNORE INTO category (name, priority, color) VALUES ('Music', 250, '#ec4899');
INSERT OR IGNORE INTO category (name, priority, color) VALUES ('Reading', 300, '#a855f7');
INSERT OR IGNORE INTO category (name, priority, color) VALUES ('Learning', 380, '#eab308');
INSERT OR IGNORE INTO category (name, priority, color) VALUES ('Coding', 400, '#1100ff');
INSERT OR IGNORE INTO category (name, priority, color) VALUES ('Gaming', 500, '#2eff89');
INSERT OR IGNORE INTO category (name, priority, color) VALUES ('Watching', 600, '#fff700');
INSERT OR IGNORE INTO category (name, priority, color) VALUES ('Social', 700, '#5662f6');

INSERT INTO category_regex (cat_id, regex)
SELECT id, '.*' FROM category WHERE name = 'Miscellaneous'
AND NOT EXISTS (
  SELECT 1 FROM category_regex
  WHERE cat_id = (SELECT id FROM category WHERE name = 'Miscellaneous') AND regex = '.*'
);

INSERT OR IGNORE INTO skipped_apps (regex) VALUES ('^$');
INSERT OR IGNORE INTO skipped_apps (regex) VALUES ('^Windows Default Lock Screen$');
INSERT OR IGNORE INTO skipped_apps (regex) VALUES ('^Task View$');
INSERT OR IGNORE INTO skipped_apps (regex) VALUES ('^Search$');
INSERT OR IGNORE INTO skipped_apps (regex) VALUES ('^Task Switching$');
INSERT OR IGNORE INTO skipped_apps (regex) VALUES ('^System tray overflow window\.$');
INSERT OR IGNORE INTO skipped_apps (regex) VALUES ('^Program Manager$');
