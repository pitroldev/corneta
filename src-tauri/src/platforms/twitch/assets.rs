//! Images a Twitch channel's chat needs: third-party emotes, badge art and cheermotes.

use serde_json::Value;
use std::collections::HashMap;
use std::time::Duration;

use crate::chat::{text_frag, ChatFragment};
use crate::http_client as ureq;
use crate::platforms::emotes::{fetch_global_thirdparty, fetch_twitch_channel, ThirdParty};

pub(crate) struct BadgeArt {
    pub url: String,
    pub title: String,
}

struct CheerTier {
    min_bits: u64,
    url: String,
    color: Option<String>,
}

/// The signed-in account's token and the app's client ID; Helix art needs both.
pub(crate) struct Helix {
    pub token: String,
    pub client_id: String,
}

#[derive(Default)]
pub(crate) struct ChannelAssets {
    pub thirdparty: ThirdParty,
    /// "set/version" to its image and title.
    badges: HashMap<String, BadgeArt>,
    /// Lowercase prefix to its tiers, lowest first.
    cheermotes: HashMap<String, Vec<CheerTier>>,
}

// Without the cheermote list only the default prefix is recognized, with Twitch's public art.
const DEFAULT_CHEER_TIERS: [u64; 7] = [1, 100, 500, 1000, 5000, 10000, 100000];

impl ChannelAssets {
    pub fn global(helix: Option<&Helix>) -> Self {
        let mut assets = ChannelAssets {
            thirdparty: fetch_global_thirdparty(),
            ..Default::default()
        };
        if let Some(helix) = helix {
            if let Some(v) = helix_get(helix, "chat/badges/global") {
                assets.add_badges(&v);
            }
            if let Some(v) = helix_get(helix, "bits/cheermotes") {
                assets.add_cheermotes(&v);
            }
        }
        assets
    }

    pub fn load_channel(&mut self, room_id: &str, helix: Option<&Helix>) {
        fetch_twitch_channel(room_id, &mut self.thirdparty);
        if !room_id.bytes().all(|b| b.is_ascii_digit()) {
            return;
        }
        if let Some(helix) = helix {
            if let Some(v) = helix_get(helix, &format!("chat/badges?broadcaster_id={room_id}")) {
                self.add_badges(&v);
            }
            if let Some(v) = helix_get(helix, &format!("bits/cheermotes?broadcaster_id={room_id}"))
            {
                self.add_cheermotes(&v);
            }
        }
    }

    pub fn badge(&self, set: &str, version: &str) -> Option<&BadgeArt> {
        self.badges.get(&format!("{set}/{version}"))
    }

    fn add_badges(&mut self, v: &Value) {
        for set in v
            .get("data")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            let Some(set_id) = set.get("set_id").and_then(Value::as_str) else {
                continue;
            };
            for version in set
                .get("versions")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
            {
                let (Some(id), Some(url)) = (
                    version.get("id").and_then(Value::as_str),
                    version
                        .get("image_url_2x")
                        .or_else(|| version.get("image_url_1x"))
                        .and_then(Value::as_str),
                ) else {
                    continue;
                };
                self.badges.insert(
                    format!("{set_id}/{id}"),
                    BadgeArt {
                        url: url.to_string(),
                        title: version
                            .get("title")
                            .and_then(Value::as_str)
                            .unwrap_or(set_id)
                            .to_string(),
                    },
                );
            }
        }
    }

    fn add_cheermotes(&mut self, v: &Value) {
        for cheer in v
            .get("data")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            let Some(prefix) = cheer.get("prefix").and_then(Value::as_str) else {
                continue;
            };
            let mut tiers: Vec<CheerTier> = cheer
                .get("tiers")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .filter_map(|tier| {
                    Some(CheerTier {
                        min_bits: tier.get("min_bits")?.as_u64()?,
                        url: tier
                            .pointer("/images/dark/animated/2")
                            .or_else(|| tier.pointer("/images/dark/static/2"))?
                            .as_str()?
                            .to_string(),
                        color: tier.get("color").and_then(Value::as_str).map(String::from),
                    })
                })
                .collect();
            tiers.sort_by_key(|t| t.min_bits);
            if !tiers.is_empty() {
                self.cheermotes.insert(prefix.to_lowercase(), tiers);
            }
        }
    }

    /// Words like `Cheer100` become cheer fragments with the tier's art.
    pub fn cheer_fragments(&self, frags: Vec<ChatFragment>) -> Vec<ChatFragment> {
        let mut out = Vec::new();
        for f in frags {
            if f.kind != "text" {
                out.push(f);
                continue;
            }
            let text = f.text.unwrap_or_default();
            let mut buf = String::new();
            for word in text.split_inclusive(' ') {
                let bare = word.trim_end_matches(' ');
                match self.cheer(bare) {
                    Some(cheer) => {
                        if !buf.is_empty() {
                            out.push(text_frag(&buf));
                            buf.clear();
                        }
                        out.push(cheer);
                        if word.ends_with(' ') {
                            buf.push(' ');
                        }
                    }
                    None => buf.push_str(word),
                }
            }
            if !buf.is_empty() {
                out.push(text_frag(&buf));
            }
        }
        out
    }

    fn cheer(&self, word: &str) -> Option<ChatFragment> {
        let split = word.find(|c: char| c.is_ascii_digit())?;
        let (prefix, digits) = word.split_at(split);
        if prefix.is_empty() || !prefix.chars().all(|c| c.is_ascii_alphabetic()) {
            return None;
        }
        let amount: u64 = digits.parse().ok().filter(|n| *n > 0)?;
        let prefix = prefix.to_lowercase();
        let (url, color) = match self.cheermotes.get(&prefix) {
            Some(tiers) => {
                let tier = tiers.iter().rev().find(|t| t.min_bits <= amount)?;
                (tier.url.clone(), tier.color.clone())
            }
            None if self.cheermotes.is_empty() && prefix == "cheer" => {
                let tier = DEFAULT_CHEER_TIERS
                    .iter()
                    .rev()
                    .find(|t| **t <= amount)
                    .copied()
                    .unwrap_or(1);
                (
                    format!(
                        "https://d3aqoihi2n8ty8.cloudfront.net/actions/cheer/dark/animated/{tier}/2.gif"
                    ),
                    None,
                )
            }
            None => return None,
        };
        Some(ChatFragment {
            kind: "cheer".into(),
            text: Some(word.to_string()),
            url: Some(url),
            amount: Some(amount),
            color,
            ..Default::default()
        })
    }
}

fn helix_get(helix: &Helix, path: &str) -> Option<Value> {
    let body = ureq::get(format!("https://api.twitch.tv/helix/{path}"))
        .set("Authorization", &format!("Bearer {}", helix.token))
        .set("Client-Id", &helix.client_id)
        .timeout(Duration::from_secs(6))
        .call()
        .ok()?
        .into_string()
        .ok()?;
    serde_json::from_str(&body).ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn cheers_use_the_highest_tier_reached_and_ignore_other_words() {
        let mut assets = ChannelAssets::default();
        assets.add_cheermotes(&json!({ "data": [{ "prefix": "Corgo", "tiers": [
            { "min_bits": 1, "color": "#979797", "images": { "dark": { "animated": { "2": "https://x/1.gif" } } } },
            { "min_bits": 100, "color": "#9c3ee8", "images": { "dark": { "animated": { "2": "https://x/100.gif" } } } }
        ] }] }));
        let frags = assets.cheer_fragments(vec![text_frag("Corgo250 boa cheer10 abc123")]);
        let cheers: Vec<(&str, Option<u64>)> = frags
            .iter()
            .filter(|f| f.kind == "cheer")
            .map(|f| (f.url.as_deref().unwrap_or(""), f.amount))
            .collect();
        assert_eq!(cheers, [("https://x/100.gif", Some(250))]);
    }

    #[test]
    fn without_a_list_only_the_default_prefix_is_a_cheer() {
        let frags = ChannelAssets::default().cheer_fragments(vec![text_frag("cheer500 Kappa100")]);
        assert_eq!(frags[0].kind, "cheer");
        assert!(frags[0].url.as_deref().unwrap().ends_with("/500/2.gif"));
        assert!(frags.iter().skip(1).all(|f| f.kind == "text"));
    }

    #[test]
    fn badges_keep_their_title_and_art() {
        let mut assets = ChannelAssets::default();
        assets.add_badges(&json!({ "data": [{ "set_id": "subscriber", "versions": [
            { "id": "12", "image_url_1x": "https://b/1", "image_url_2x": "https://b/2", "title": "1-Year Subscriber" }
        ] }] }));
        let art = assets.badge("subscriber", "12").unwrap();
        assert_eq!(
            (art.url.as_str(), art.title.as_str()),
            ("https://b/2", "1-Year Subscriber")
        );
    }
}
