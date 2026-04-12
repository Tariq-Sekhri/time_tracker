INSERT OR IGNORE INTO category (name, priority, color) VALUES ('Hidden', 100, '#475569');

UPDATE category_regex
SET cat_id = (SELECT id FROM category WHERE name = 'Reading' LIMIT 1)
WHERE cat_id IN (SELECT id FROM category WHERE name = 'Learning');

DELETE FROM category WHERE name = 'Learning';
