//! Third-party emotes (BTTV, FFZ, 7TV) that viewers' extensions draw over every platform's chat.

use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use crate::chat::{text_frag, ChatFragment};
use crate::http_client as ureq;

/// Emote code to image, plus the codes drawn over the previous emote (7TV zero-width).
#[derive(Clone, Debug, Default)]
pub(crate) struct ThirdParty {
    pub urls: HashMap<String, String>,
    pub overlay: HashSet<String>,
}

impl ThirdParty {
    fn extend(&mut self, other: ThirdParty) {
        self.urls.extend(other.urls);
        self.overlay.extend(other.overlay);
    }
}

pub(crate) fn fetch_json(url: &str) -> Option<Value> {
    let body = ureq::get(url)
        .set("User-Agent", "Corneta/1.0")
        .timeout(Duration::from_secs(5))
        .call()
        .ok()?
        .into_string()
        .ok()?;
    serde_json::from_str(&body).ok()
}

fn add_bttv(v: &Value, set: &mut ThirdParty) {
    for e in v.as_array().into_iter().flatten() {
        if let (Some(code), Some(id)) = (
            e.get("code").and_then(Value::as_str),
            e.get("id").and_then(Value::as_str),
        ) {
            set.urls.insert(
                code.to_string(),
                format!("https://cdn.betterttv.net/emote/{id}/2x"),
            );
        }
    }
}

fn add_ffz(v: &Value, set: &mut ThirdParty) {
    let Some(sets) = v.get("sets").and_then(Value::as_object) else {
        return;
    };
    for emotes in sets.values().filter_map(|s| s.get("emoticons")?.as_array()) {
        for e in emotes {
            let name = e.get("name").and_then(Value::as_str);
            let pick = e
                .get("urls")
                .and_then(|u| u.get("2").or_else(|| u.get("4")).or_else(|| u.get("1")))
                .and_then(Value::as_str);
            if let (Some(name), Some(u)) = (name, pick) {
                let full = match u.strip_prefix("//") {
                    Some(rest) => format!("https://{rest}"),
                    None => u.to_string(),
                };
                set.urls.insert(name.to_string(), full);
            }
        }
    }
}

// 7TV marks zero-width emotes with bit 0 of the set entry flags or bit 8 of the emote's own.
const SEVENTV_ZERO_WIDTH: u64 = 1;
const SEVENTV_DATA_ZERO_WIDTH: u64 = 1 << 8;

fn add_7tv(emotes: &Value, set: &mut ThirdParty) {
    for e in emotes.as_array().into_iter().flatten() {
        if let (Some(name), Some(id)) = (
            e.get("name").and_then(Value::as_str),
            e.get("id").and_then(Value::as_str),
        ) {
            set.urls.insert(
                name.to_string(),
                format!("https://cdn.7tv.app/emote/{id}/2x.webp"),
            );
            let flags = e.get("flags").and_then(Value::as_u64).unwrap_or(0);
            let data_flags = e
                .pointer("/data/flags")
                .and_then(Value::as_u64)
                .unwrap_or(0);
            if flags & SEVENTV_ZERO_WIDTH != 0 || data_flags & SEVENTV_DATA_ZERO_WIDTH != 0 {
                set.overlay.insert(name.to_string());
            }
        }
    }
}

// Share global emote fetches across reconnects; failed empty responses must not populate this cache.
type ThirdPartyCache = Mutex<Option<(Instant, ThirdParty)>>;

static GLOBAL_3P: OnceLock<ThirdPartyCache> = OnceLock::new();

pub(crate) fn fetch_global_thirdparty() -> ThirdParty {
    let cache = GLOBAL_3P.get_or_init(|| Mutex::new(None));
    if let Ok(guard) = cache.lock() {
        if let Some((at, set)) = guard.as_ref() {
            if at.elapsed() < Duration::from_secs(3600) {
                return set.clone();
            }
        }
    }
    let mut set = ThirdParty::default();
    if let Some(v) = fetch_json("https://api.betterttv.net/3/cached/emotes/global") {
        add_bttv(&v, &mut set);
    }
    if let Some(v) = fetch_json("https://api.frankerfacez.com/v1/set/global") {
        add_ffz(&v, &mut set);
    }
    if let Some(v) = fetch_json("https://7tv.io/v3/emote-sets/global") {
        add_7tv(v.get("emotes").unwrap_or(&Value::Null), &mut set);
    }
    // A temporary network failure must not suppress emotes for the entire TTL.
    if !set.urls.is_empty() {
        if let Ok(mut guard) = cache.lock() {
            *guard = Some((Instant::now(), set.clone()));
        }
    }
    set
}

/// A Twitch channel's BTTV, FFZ and 7TV emotes, by numeric room ID.
pub(crate) fn fetch_twitch_channel(room_id: &str, set: &mut ThirdParty) {
    if !room_id.bytes().all(|b| b.is_ascii_digit()) {
        return;
    }
    if let Some(v) = fetch_json(&format!(
        "https://api.betterttv.net/3/cached/users/twitch/{room_id}"
    )) {
        add_bttv(v.get("channelEmotes").unwrap_or(&Value::Null), set);
        add_bttv(v.get("sharedEmotes").unwrap_or(&Value::Null), set);
    }
    if let Some(v) = fetch_json(&format!(
        "https://api.frankerfacez.com/v1/room/id/{room_id}"
    )) {
        add_ffz(&v, set);
    }
    set.extend(fetch_7tv_user("twitch", room_id));
}

/// A channel's 7TV set on another platform, such as "kick" with the numeric user ID.
pub(crate) fn fetch_7tv_user(platform: &str, id: &str) -> ThirdParty {
    let mut set = ThirdParty::default();
    if id.is_empty()
        || !id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
    {
        return set;
    }
    if let Some(v) = fetch_json(&format!("https://7tv.io/v3/users/{platform}/{id}")) {
        add_7tv(
            v.pointer("/emote_set/emotes").unwrap_or(&Value::Null),
            &mut set,
        );
    }
    set
}

/// Replaces whole words that are third-party emote codes; only plain text is touched.
pub(crate) fn apply_thirdparty(frags: Vec<ChatFragment>, emotes: &ThirdParty) -> Vec<ChatFragment> {
    if emotes.urls.is_empty() {
        return frags;
    }
    let mut out = vec![];
    for f in frags {
        if f.kind != "text" {
            out.push(f);
            continue;
        }
        let text = f.text.unwrap_or_default();
        let mut buf = String::new();
        for word in text.split_inclusive(' ') {
            let bare = word.trim_end_matches(' ');
            if let Some(url) = emotes.urls.get(bare) {
                if !buf.is_empty() {
                    out.push(text_frag(&buf));
                    buf.clear();
                }
                out.push(ChatFragment {
                    kind: "emote".into(),
                    text: Some(bare.to_string()),
                    url: Some(url.clone()),
                    overlay: emotes.overlay.contains(bare),
                    ..Default::default()
                });
                if word.ends_with(' ') {
                    buf.push(' ');
                }
            } else {
                buf.push_str(word);
            }
        }
        if !buf.is_empty() {
            out.push(text_frag(&buf));
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seventv_zero_width_emotes_are_marked_as_overlays() {
        let mut set = ThirdParty::default();
        add_7tv(
            &serde_json::json!([
                { "name": "RainTime", "id": "a", "flags": 1 },
                { "name": "Plain", "id": "b", "flags": 0, "data": { "flags": 0 } },
                { "name": "Hat", "id": "c", "data": { "flags": 256 } }
            ]),
            &mut set,
        );
        let frags = apply_thirdparty(vec![text_frag("Plain RainTime Hat")], &set);
        let overlay: Vec<bool> = frags
            .iter()
            .filter(|f| f.kind == "emote")
            .map(|f| f.overlay)
            .collect();
        assert_eq!(overlay, [false, true, true]);
    }

    #[test]
    fn channel_ids_are_checked_before_they_reach_a_url() {
        let mut set = ThirdParty::default();
        fetch_twitch_channel("1/../x", &mut set);
        assert!(set.urls.is_empty());
        assert!(fetch_7tv_user("kick", "a/b").urls.is_empty());
    }
}
