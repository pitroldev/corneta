//! Category suggestions for the stream info card, merged across the signed-in platforms.

use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

pub const SUGGESTIONS: usize = 8;
const MAX_QUERY_CHARS: usize = 100;
/// Typing, erasing and retyping the same word must not repeat requests.
const CACHE_TTL: Duration = Duration::from_secs(5 * 60);
const CACHE_ENTRIES: usize = 64;

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CategorySuggestion {
    pub name: String,
    /// Platforms whose search returned this exact name.
    pub platforms: Vec<&'static str>,
}

/// The lookup key for a query, or None when it is too short to search.
pub fn cache_key(query: &str) -> Option<String> {
    let collapsed = query.split_whitespace().collect::<Vec<_>>().join(" ");
    let chars = collapsed.chars().count();
    (2..=MAX_QUERY_CHARS)
        .contains(&chars)
        .then(|| collapsed.to_lowercase())
}

/// Signing in or out of a platform changes what the same words find.
pub fn search_key(signed_in: &[&str], query_key: &str) -> String {
    format!("{}|{query_key}", signed_in.join(","))
}

/// Category names from a Twitch or Kick `data` array, best match first.
pub fn names_in_data(v: &Value) -> Vec<String> {
    let mut names: Vec<String> = Vec::new();
    for item in v
        .get("data")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        let Some(name) = item.get("name").and_then(Value::as_str).map(str::trim) else {
            continue;
        };
        if name.is_empty() || name.chars().count() > MAX_QUERY_CHARS {
            continue;
        }
        if !names.iter().any(|seen| seen.eq_ignore_ascii_case(name)) {
            names.push(name.to_string());
        }
        if names.len() == SUGGESTIONS {
            break;
        }
    }
    names
}

/// Interleave each platform's ranking so no platform buries the other's best matches; the
/// same name from several platforms becomes one suggestion that lists them all.
pub fn merge(results: &[(&'static str, Vec<String>)]) -> Vec<CategorySuggestion> {
    let mut merged: Vec<CategorySuggestion> = Vec::new();
    let deepest = results
        .iter()
        .map(|(_, names)| names.len())
        .max()
        .unwrap_or(0);
    for rank in 0..deepest {
        for (platform, names) in results {
            let Some(name) = names.get(rank) else {
                continue;
            };
            if let Some(found) = merged
                .iter_mut()
                .find(|s| s.name.to_lowercase() == name.to_lowercase())
            {
                if !found.platforms.contains(platform) {
                    found.platforms.push(platform);
                }
            } else if merged.len() < SUGGESTIONS {
                merged.push(CategorySuggestion {
                    name: name.clone(),
                    platforms: vec![platform],
                });
            }
        }
    }
    merged
}

type Cache = HashMap<String, (Instant, Vec<CategorySuggestion>)>;

static CACHE: Mutex<Option<Cache>> = Mutex::new(None);

pub fn cached(key: &str) -> Option<Vec<CategorySuggestion>> {
    let cache = CACHE
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    let (at, suggestions) = cache.as_ref()?.get(key)?;
    (at.elapsed() < CACHE_TTL).then(|| suggestions.clone())
}

pub fn remember(key: String, suggestions: Vec<CategorySuggestion>) {
    let mut cache = CACHE
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    let map = cache.get_or_insert_with(HashMap::new);
    map.retain(|_, (at, _)| at.elapsed() < CACHE_TTL);
    if map.len() >= CACHE_ENTRIES {
        map.clear();
    }
    map.insert(key, (Instant::now(), suggestions));
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn a_query_is_searched_only_between_two_and_a_hundred_characters() {
        assert_eq!(
            cache_key("  Just   Chatting "),
            Some("just chatting".into())
        );
        assert_eq!(cache_key("a"), None);
        assert_eq!(cache_key("   "), None);
        assert_eq!(cache_key(&"x".repeat(101)), None);
        assert_eq!(cache_key("FC"), Some("fc".into()));
    }

    #[test]
    fn the_same_words_under_other_accounts_are_another_search() {
        let both = search_key(&["twitch", "kick"], "valorant");
        assert_ne!(both, search_key(&["twitch"], "valorant"));
        assert_ne!(both, search_key(&["twitch", "kick"], "minecraft"));
        assert_eq!(both, search_key(&["twitch", "kick"], "valorant"));
    }

    #[test]
    fn names_come_in_ranking_order_without_blanks_or_repeats() {
        let v = json!({ "data": [
            { "id": "1", "name": "VALORANT" },
            { "id": "2", "name": "  " },
            { "id": "3", "name": "valorant" },
            { "id": "4" },
            { "id": "5", "name": "Valheim" },
        ] });
        assert_eq!(names_in_data(&v), ["VALORANT", "Valheim"]);
        assert!(names_in_data(&json!({ "error": "Unauthorized" })).is_empty());
        let many = json!({ "data": (0..20).map(|i| json!({ "name": format!("Game {i}") })).collect::<Vec<_>>() });
        assert_eq!(names_in_data(&many).len(), SUGGESTIONS);
    }

    #[test]
    fn merged_suggestions_interleave_platforms_and_join_the_same_name() {
        let merged = merge(&[
            (
                "twitch",
                vec![
                    "Just Chatting".into(),
                    "Justice".into(),
                    "Just Dance".into(),
                ],
            ),
            ("kick", vec!["just chatting".into(), "Just Cause 3".into()]),
        ]);
        let names: Vec<&str> = merged.iter().map(|s| s.name.as_str()).collect();
        assert_eq!(
            names,
            ["Just Chatting", "Justice", "Just Cause 3", "Just Dance"]
        );
        assert_eq!(merged[0].platforms, ["twitch", "kick"]);
        assert_eq!(merged[2].platforms, ["kick"]);
        assert!(merge(&[]).is_empty());
    }

    #[test]
    fn merging_stops_at_the_suggestion_limit_but_still_credits_known_names() {
        let twitch: Vec<String> = (0..SUGGESTIONS).map(|i| format!("Game {i}")).collect();
        let mut kick: Vec<String> = (0..SUGGESTIONS).map(|i| format!("Other {i}")).collect();
        kick.push("game 0".into());
        let merged = merge(&[("twitch", twitch), ("kick", kick)]);
        assert_eq!(merged.len(), SUGGESTIONS);
        assert_eq!(merged[0].name, "Game 0");
        assert_eq!(merged[0].platforms, ["twitch", "kick"]);
    }
}
