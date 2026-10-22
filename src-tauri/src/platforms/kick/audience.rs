//! Live viewers and followers from Kick's public channel endpoint.

use serde_json::Value;

use std::time::Duration;

use crate::chat::ChannelCounts;
use crate::config::ChatSource;
use crate::http_client as ureq;
use crate::platforms::provider::AudienceReader;

fn kick_counts(slug: &str) -> ChannelCounts {
    let slug = slug.trim().trim_start_matches('@').to_lowercase();
    if slug.is_empty() {
        return ChannelCounts::default();
    }
    let url = format!("https://kick.com/api/v2/channels/{slug}");
    let Some(body) = ureq::get(&url)
        .set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36")
        .set("Accept", "application/json")
        .timeout(Duration::from_secs(6))
        .call()
        .ok()
        .and_then(|r| r.into_string().ok())
    else {
        return ChannelCounts::default();
    };
    let Ok(v) = serde_json::from_str::<Value>(&body) else {
        return ChannelCounts::default();
    };
    let followers = v.get("followers_count").and_then(|x| x.as_u64());
    if followers.is_none() {
        log::debug!("kick: missing followers_count in channel response");
    }
    ChannelCounts {
        viewers: v
            .pointer("/livestream/viewer_count")
            .and_then(|x| x.as_u64()),
        followers,
        ..Default::default()
    }
}

pub(super) struct Reader;

impl AudienceReader for Reader {
    fn read(&mut self, source: &ChatSource) -> Option<ChannelCounts> {
        Some(kick_counts(&source.value))
    }
}
