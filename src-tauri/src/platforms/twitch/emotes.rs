//! Third-party emotes (BTTV, FFZ, 7TV) layered over Twitch's own, global and per channel.

use serde_json::Value;
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use crate::chat::{text_frag, ChatFragment};
use crate::http_client as ureq;

fn fetch_json(url: &str) -> Option<Value> {
    let body = ureq::get(url)
        .set("User-Agent", "Corneta/1.0")
        .timeout(Duration::from_secs(5))
        .call()
        .ok()?
        .into_string()
        .ok()?;
    serde_json::from_str(&body).ok()
}

fn add_bttv(v: &Value, map: &mut HashMap<String, String>) {
    if let Some(arr) = v.as_array() {
        for e in arr {
            if let (Some(code), Some(id)) = (
                e.get("code").and_then(|x| x.as_str()),
                e.get("id").and_then(|x| x.as_str()),
            ) {
                map.insert(
                    code.to_string(),
                    format!("https://cdn.betterttv.net/emote/{id}/2x"),
                );
            }
        }
    }
}

fn add_ffz(v: &Value, map: &mut HashMap<String, String>) {
    let Some(sets) = v.get("sets").and_then(|x| x.as_object()) else {
        return;
    };
    for set in sets.values() {
        let Some(emos) = set.get("emoticons").and_then(|x| x.as_array()) else {
            continue;
        };
        for e in emos {
            let name = e.get("name").and_then(|x| x.as_str());
            let urls = e.get("urls");
            let pick = urls
                .and_then(|u| u.get("2").or_else(|| u.get("4")).or_else(|| u.get("1")))
                .and_then(|x| x.as_str());
            if let (Some(name), Some(u)) = (name, pick) {
                let full = if let Some(rest) = u.strip_prefix("//") {
                    format!("https://{rest}")
                } else {
                    u.to_string()
                };
                map.insert(name.to_string(), full);
            }
        }
    }
}

fn add_7tv(emotes: &Value, map: &mut HashMap<String, String>) {
    if let Some(arr) = emotes.as_array() {
        for e in arr {
            if let (Some(name), Some(id)) = (
                e.get("name").and_then(|x| x.as_str()),
                e.get("id").and_then(|x| x.as_str()),
            ) {
                map.insert(
                    name.to_string(),
                    format!("https://cdn.7tv.app/emote/{id}/2x.webp"),
                );
            }
        }
    }
}

// Share global emote fetches across reconnects; failed empty responses must not populate this cache.
type ThirdPartyCache = Mutex<Option<(Instant, HashMap<String, String>)>>;

static GLOBAL_3P: OnceLock<ThirdPartyCache> = OnceLock::new();

pub(crate) fn fetch_global_thirdparty() -> HashMap<String, String> {
    let cache = GLOBAL_3P.get_or_init(|| Mutex::new(None));
    if let Ok(guard) = cache.lock() {
        if let Some((at, map)) = guard.as_ref() {
            if at.elapsed() < Duration::from_secs(3600) {
                return map.clone();
            }
        }
    }
    let mut map = HashMap::new();
    if let Some(v) = fetch_json("https://api.betterttv.net/3/cached/emotes/global") {
        add_bttv(&v, &mut map);
    }
    if let Some(v) = fetch_json("https://api.frankerfacez.com/v1/set/global") {
        add_ffz(&v, &mut map);
    }
    if let Some(v) = fetch_json("https://7tv.io/v3/emote-sets/global") {
        add_7tv(v.get("emotes").unwrap_or(&Value::Null), &mut map);
    }
    // A temporary network failure must not suppress emotes for the entire TTL.
    if !map.is_empty() {
        if let Ok(mut guard) = cache.lock() {
            *guard = Some((Instant::now(), map.clone()));
        }
    }
    map
}

pub(crate) fn fetch_channel_thirdparty(room_id: &str, map: &mut HashMap<String, String>) {
    if let Some(v) = fetch_json(&format!(
        "https://api.betterttv.net/3/cached/users/twitch/{room_id}"
    )) {
        add_bttv(v.get("channelEmotes").unwrap_or(&Value::Null), map);
        add_bttv(v.get("sharedEmotes").unwrap_or(&Value::Null), map);
    }
    if let Some(v) = fetch_json(&format!(
        "https://api.frankerfacez.com/v1/room/id/{room_id}"
    )) {
        add_ffz(&v, map);
    }
    if let Some(v) = fetch_json(&format!("https://7tv.io/v3/users/twitch/{room_id}")) {
        add_7tv(v.pointer("/emote_set/emotes").unwrap_or(&Value::Null), map);
    }
}

pub(crate) fn apply_thirdparty(
    frags: Vec<ChatFragment>,
    emotes: &HashMap<String, String>,
) -> Vec<ChatFragment> {
    if emotes.is_empty() {
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
            if let Some(url) = emotes.get(bare) {
                if !buf.is_empty() {
                    out.push(text_frag(&buf));
                    buf.clear();
                }
                out.push(ChatFragment {
                    kind: "emote".into(),
                    text: Some(bare.to_string()),
                    url: Some(url.clone()),
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
