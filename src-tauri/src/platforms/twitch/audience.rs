//! Live viewers and followers from Twitch's public GraphQL endpoint.

use serde_json::{json, Value};

use std::time::Duration;

use crate::chat::ChannelCounts;
use crate::config::ChatSource;
use crate::http_client as ureq;
use crate::platforms::provider::AudienceReader;

fn twitch_counts(channel: &str) -> ChannelCounts {
    let ch = channel.trim().trim_start_matches('#').to_lowercase();
    if ch.is_empty() {
        return ChannelCounts::default();
    }
    let body = json!({
        "query": format!(
            "query {{ user(login: \"{ch}\") {{ followers {{ totalCount }} stream {{ viewersCount }} }} }}"
        )
    })
    .to_string();
    let Some(resp) = ureq::post("https://gql.twitch.tv/gql")
        .set("Client-Id", "kimne78kx3ncx6brgo4mv6wki5h1ko")
        .set("Content-Type", "application/json")
        .timeout(Duration::from_secs(6))
        .send_string(&body)
        .ok()
        .and_then(|r| r.into_string().ok())
    else {
        return ChannelCounts::default();
    };
    let Ok(v) = serde_json::from_str::<Value>(&resp) else {
        return ChannelCounts::default();
    };
    ChannelCounts {
        // Offline stream is null, but followers may still be available.
        viewers: v
            .pointer("/data/user/stream/viewersCount")
            .and_then(|x| x.as_u64()),
        followers: v
            .pointer("/data/user/followers/totalCount")
            .and_then(|x| x.as_u64()),
        ..Default::default()
    }
}

pub(super) struct Reader;

impl AudienceReader for Reader {
    fn read(&mut self, source: &ChatSource) -> Option<ChannelCounts> {
        Some(twitch_counts(&source.value))
    }
}
