//! Live viewers from the Data API, read with the user's key or, sparingly, with the login.

use serde_json::Value;
use std::collections::HashMap;
use std::time::{Duration, Instant};
use tauri::AppHandle;

use super::chat::{resolve_youtube_video, LiveResolve};
use crate::chat::ChannelCounts;
use crate::config::ChatSource;
use crate::http_client as ureq;
use crate::platforms::provider::AudienceReader;

/// The official project's quota is shared by every user, so login-based readings are spaced out.
const SHARED_QUOTA_VIEWERS_EVERY: Duration = Duration::from_secs(120);

#[derive(Debug, PartialEq)]
struct YtLiveDetails {
    live: bool,
    /// Channel owners can hide the count while the video stays live.
    viewers: Option<u64>,
}

fn parse_live_details(v: &Value) -> YtLiveDetails {
    let details = v.pointer("/items/0/liveStreamingDetails");
    let live = details
        .is_some_and(|d| d.get("actualStartTime").is_some() && d.get("actualEndTime").is_none());
    let viewers = details
        .and_then(|d| d.get("concurrentViewers"))
        .and_then(|n| {
            n.as_str()
                .and_then(|s| s.parse().ok())
                .or_else(|| n.as_u64())
        })
        .filter(|_| live);
    YtLiveDetails { live, viewers }
}

enum YtAuth {
    /// The user's own Data API key and quota.
    Key(String),
    /// The login token, billed to the Corneta project's shared quota.
    Bearer(String),
}

fn yt_live_details(auth: &YtAuth, vid: &str) -> Option<YtLiveDetails> {
    let url =
        format!("https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id={vid}");
    let request = match auth {
        YtAuth::Key(key) => ureq::get(format!("{url}&key={key}")),
        YtAuth::Bearer(token) => ureq::get(&url).set("Authorization", &format!("Bearer {token}")),
    };
    let body = request
        .timeout(Duration::from_secs(6))
        .call()
        .ok()?
        .into_string()
        .ok()?;
    serde_json::from_str::<Value>(&body)
        .ok()
        .map(|v| parse_live_details(&v))
}

#[derive(Default)]
struct YtViewerCache {
    /// Resolved live video per channel, so polls do not scrape the channel page again.
    videos: HashMap<String, String>,
    readings: HashMap<String, (Instant, Option<u64>)>,
}

fn youtube_viewers(
    app: &AppHandle,
    api_key: &str,
    channel: &str,
    cache: &mut YtViewerCache,
) -> Option<u64> {
    let auth = if api_key.trim().is_empty() {
        YtAuth::Bearer(super::account::youtube_token(app)?)
    } else {
        YtAuth::Key(api_key.trim().to_string())
    };
    let every = match auth {
        YtAuth::Key(_) => Duration::ZERO,
        YtAuth::Bearer(_) => SHARED_QUOTA_VIEWERS_EVERY,
    };
    let now = Instant::now();
    if let Some((at, viewers)) = cache.readings.get(channel) {
        if now.saturating_duration_since(*at) < every {
            return *viewers;
        }
    }
    let vid = match cache.videos.get(channel) {
        Some(vid) => vid.clone(),
        None => match resolve_youtube_video(channel, api_key) {
            LiveResolve::Video(vid) => vid,
            _ => {
                cache.readings.remove(channel);
                return None;
            }
        },
    };
    let viewers = match yt_live_details(&auth, &vid) {
        // A hidden count keeps the video: it is still live and must not be resolved again.
        Some(details) if details.live => {
            cache.videos.insert(channel.to_string(), vid);
            details.viewers
        }
        Some(_) => {
            cache.videos.remove(channel);
            None
        }
        None => None,
    };
    cache.readings.insert(channel.to_string(), (now, viewers));
    viewers
}

pub(super) struct Reader {
    app: AppHandle,
    api_key: String,
    cache: YtViewerCache,
}

impl Reader {
    pub(super) fn new(app: AppHandle, api_key: String) -> Self {
        Self {
            app,
            api_key,
            cache: YtViewerCache::default(),
        }
    }
}

impl AudienceReader for Reader {
    // Rounded YouTube subscriber counts cannot reliably measure per-stream gains.
    fn read(&mut self, source: &ChatSource) -> Option<ChannelCounts> {
        Some(ChannelCounts {
            viewers: youtube_viewers(&self.app, &self.api_key, &source.value, &mut self.cache),
            ..Default::default()
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn hidden_youtube_counts_keep_the_live_video() {
        let details =
            |d: Value| parse_live_details(&json!({ "items": [{ "liveStreamingDetails": d }] }));
        assert_eq!(
            details(
                json!({ "actualStartTime": "2026-10-19T10:00:00Z", "concurrentViewers": "1234" })
            ),
            YtLiveDetails {
                live: true,
                viewers: Some(1234)
            }
        );
        assert_eq!(
            details(json!({ "actualStartTime": "2026-10-19T10:00:00Z" })),
            YtLiveDetails {
                live: true,
                viewers: None
            },
            "a hidden count is not an ended live"
        );
        assert_eq!(
            details(json!({
                "actualStartTime": "2026-10-19T10:00:00Z",
                "actualEndTime": "2026-10-19T12:00:00Z",
                "concurrentViewers": "50"
            })),
            YtLiveDetails {
                live: false,
                viewers: None
            }
        );
        assert_eq!(
            details(json!({ "scheduledStartTime": "2026-10-19T10:00:00Z" })),
            YtLiveDetails {
                live: false,
                viewers: None
            }
        );
        assert_eq!(
            parse_live_details(&json!({ "items": [] })),
            YtLiveDetails {
                live: false,
                viewers: None
            }
        );
    }
}
