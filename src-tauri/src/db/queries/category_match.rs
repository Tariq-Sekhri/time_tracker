use crate::db::error::Error;
use crate::db::tables::cat_regex::CategoryRegex;
use crate::db::tables::category::Category;
use regex::Regex;
use std::cmp::Reverse;
use std::collections::HashMap;

pub(crate) const FALLBACK_CATEGORY: &str = "Miscellaneous";

/// Sort key shared by auto and manual rules: a subcategory competes inside its
/// parent's slot, so it can never outrank another top-level category, and it
/// runs before the parent's own rules so it can claim titles from them.
pub(crate) type RuleOrder = (Reverse<i32>, bool, Reverse<i32>);

pub(crate) fn rule_order(parent_priority: Option<i32>, own_priority: i32) -> RuleOrder {
    match parent_priority {
        Some(parent) => (Reverse(parent), false, Reverse(own_priority)),
        None => (Reverse(own_priority), true, Reverse(0)),
    }
}

#[derive(Clone)]
pub(crate) struct CachedCategoryRegex {
    pub(crate) regex: Regex,
    /// Always the top-level category, so rollups and filters are unaffected.
    pub(crate) category: String,
    pub(crate) subcategory: Option<String>,
    pub(crate) rule_id: i32,
}

pub(crate) fn build_regex_table(
    categories: &[Category],
    cat_regex: &[CategoryRegex],
) -> Result<Vec<CachedCategoryRegex>, Error> {
    let category_map: HashMap<i32, &Category> =
        categories.iter().map(|cat| (cat.id, cat)).collect();

    let mut table = cat_regex
        .iter()
        .map(|reg| {
            let cat = category_map
                .get(&reg.cat_id)
                .ok_or_else(|| anyhow::anyhow!("Category not found"))?;
            let parent = cat.parent_id.and_then(|id| category_map.get(&id));
            let order = rule_order(parent.map(|parent| parent.priority), cat.priority);
            let matcher = CachedCategoryRegex {
                regex: Regex::new(&reg.regex)?,
                category: parent.map_or(&cat.name, |parent| &parent.name).clone(),
                subcategory: parent.map(|_| cat.name.clone()),
                rule_id: reg.id,
            };
            Ok((order, matcher))
        })
        .collect::<Result<Vec<_>, Error>>()?;

    table.sort_by_key(|(order, _)| *order);
    Ok(table.into_iter().map(|(_, matcher)| matcher).collect())
}

pub(crate) fn find_match<'a>(app: &str, table: &'a [CachedCategoryRegex]) -> Option<&'a CachedCategoryRegex> {
    table.iter().find(|rule| rule.regex.is_match(app))
}

pub(crate) fn derive_category(app: &str, table: &[CachedCategoryRegex]) -> String {
    find_match(app, table).map_or(FALLBACK_CATEGORY, |rule| rule.category.as_str()).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn category(id: i32, name: &str, priority: i32, parent_id: Option<i32>) -> Category {
        Category {id, name: name.into(), priority, color: None, regex_enabled: true, is_visible: true, in_stats: true, is_collapsed: false, parent_id}
    }

    fn rule(id: i32, cat_id: i32, pattern: &str) -> CategoryRegex {
        CategoryRegex {id, cat_id, regex: pattern.into()}
    }

    #[test]
    fn subcategories_win_inside_their_parent_but_never_outrank_another_category() {
        let categories = [
            category(1, "Social", 700, None),
            category(2, "Coding", 400, None),
            category(3, "Rust", 9000, Some(2)),
            category(4, "Python", 100, Some(2)),
        ];
        let table = build_regex_table(&categories, &[
            rule(1, 2, "Editor"),
            rule(2, 3, "Editor.*rs"),
            rule(3, 4, "Editor.*"),
            rule(4, 1, "Discord"),
        ]).unwrap();
        let matched = find_match("Editor main.rs", &table).unwrap();
        assert_eq!((matched.category.as_str(), matched.subcategory.as_deref()), ("Coding", Some("Rust")));
        assert_eq!(find_match("Editor app.py", &table).unwrap().subcategory.as_deref(), Some("Python"));
        // A huge subcategory priority must not beat a higher top-level category.
        let matched = find_match("Discord Editor main.rs", &table).unwrap();
        assert_eq!((matched.category.as_str(), matched.subcategory.as_deref()), ("Social", None));
        assert_eq!(derive_category("Unmatched", &table), FALLBACK_CATEGORY);
    }

    #[test]
    fn a_subcategory_rule_pulls_titles_away_from_the_parents_own_rules() {
        let categories = [category(1, "School", 10, None), category(2, "Homework", 0, Some(1))];
        let table = build_regex_table(&categories, &[rule(1, 1, "Docs"), rule(2, 2, "Docs - Essay")]).unwrap();
        assert_eq!(find_match("Docs - Essay", &table).unwrap().subcategory.as_deref(), Some("Homework"));
        assert_eq!(find_match("Docs - Notes", &table).unwrap().subcategory, None);
    }
}
