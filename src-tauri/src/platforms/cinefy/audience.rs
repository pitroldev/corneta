use chrono::{DateTime, SecondsFormat, Utc};
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::io::Read;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

const API_URL: &str = "https://api.cinefy.gg";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(4);
const MAX_BODY_BYTES: usize = 256 * 1024;
const MAX_SAFE_VIEWERS: u64 = 9_007_199_254_740_991;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum AudienceStatus {
    Live,
    Offline,
    Unavailable,
    Embedded,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum AudienceOrigin {
    Twitch,
    Youtube,
    Kick,
    External,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AudienceSnapshot {
    pub viewers: Option<u64>,
    pub embedded_viewers: Option<u64>,
    pub live: bool,
    pub audience_status: AudienceStatus,
    pub audience_origin: Option<AudienceOrigin>,
    pub title: Option<String>,
    pub started_at: Option<String>,
}

impl Default for AudienceSnapshot {
    fn default() -> Self {
        Self {
            viewers: None,
            embedded_viewers: None,
            live: false,
            audience_status: AudienceStatus::Unavailable,
            audience_origin: None,
            title: None,
            started_at: None,
        }
    }
}

pub(crate) fn normalize_slug(input: &str) -> Option<String> {
    if input.len() > 1_024 {
        return None;
    }
    if let Some((scheme, _)) = input.trim().split_once("://") {
        if !scheme.eq_ignore_ascii_case("https") && !scheme.eq_ignore_ascii_case("http") {
            return None;
        }
    }
    let slug = super::adapter::normalize_slug(input)?;
    (!matches!(
        slug.as_str(),
        "." | ".." | "creators" | "login" | "media" | "search" | "shorts" | "watch"
    ))
    .then_some(slug)
}

fn parse_audience(value: &Value, slug: &str) -> AudienceSnapshot {
    let profile_matches = value.get("id").and_then(Value::as_str).is_some_and(|id| {
        !id.is_empty()
            && id.len() <= 128
            && id
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_'))
    }) && value
        .get("slug")
        .and_then(Value::as_str)
        .is_some_and(|profile_slug| profile_slug.eq_ignore_ascii_case(slug));
    if !profile_matches {
        return AudienceSnapshot::default();
    }
    let Some(video) = value.get("liveStreamVideo") else {
        return AudienceSnapshot::default();
    };
    if video.is_null() {
        return AudienceSnapshot {
            viewers: Some(0),
            audience_status: AudienceStatus::Offline,
            ..AudienceSnapshot::default()
        };
    }
    let Some(stream) = video.get("liveStream").filter(|stream| stream.is_object()) else {
        return AudienceSnapshot::default();
    };
    if video.get("status").and_then(Value::as_str) != Some("active")
        || stream.get("status").and_then(Value::as_str) != Some("live")
        || !matches!(
            stream.get("visibility").and_then(Value::as_str),
            Some("public" | "trusted")
        )
    {
        return AudienceSnapshot::default();
    }
    let mut snapshot = AudienceSnapshot {
        live: true,
        title: video
            .get("title")
            .and_then(Value::as_str)
            .map(|title| {
                title
                    .trim()
                    .chars()
                    .filter(|c| !c.is_control())
                    .take(256)
                    .collect()
            })
            .filter(|title: &String| !title.is_empty()),
        started_at: stream
            .get("startedAt")
            .and_then(Value::as_str)
            .filter(|value| value.len() <= 64)
            .and_then(|value| DateTime::parse_from_rfc3339(value).ok())
            .map(|value| {
                value
                    .with_timezone(&Utc)
                    .to_rfc3339_opts(SecondsFormat::Secs, true)
            }),
        ..AudienceSnapshot::default()
    };
    let reported_viewers = stream
        .get("viewerCount")
        .and_then(Value::as_u64)
        .filter(|count| *count <= MAX_SAFE_VIEWERS);
    match stream.get("isEmbed").and_then(Value::as_bool) {
        Some(true) => {
            snapshot.audience_status = AudienceStatus::Embedded;
            snapshot.embedded_viewers = reported_viewers;
            snapshot.audience_origin = Some(match stream.get("platform").and_then(Value::as_str) {
                Some("twitch") => AudienceOrigin::Twitch,
                Some("youtube") => AudienceOrigin::Youtube,
                Some("kick") => AudienceOrigin::Kick,
                _ => AudienceOrigin::External,
            });
        }
        Some(false) => {
            snapshot.viewers = reported_viewers;
            if snapshot.viewers.is_some() {
                snapshot.audience_status = AudienceStatus::Live;
            }
        }
        None => {}
    }
    snapshot
}

fn bounded_json(reader: impl Read) -> Option<Value> {
    let mut bytes = Vec::with_capacity(4_096);
    reader
        .take((MAX_BODY_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .ok()?;
    if bytes.len() > MAX_BODY_BYTES {
        return None;
    }
    serde_json::from_slice(&bytes).ok()
}

fn fetch_profile(agent: &ureq3::Agent, slug: &str, running: &AtomicBool) -> Option<Value> {
    if !running.load(Ordering::Acquire) {
        return None;
    }
    let response = agent
        .get(format!("{API_URL}/v1/user/{slug}"))
        .header("Accept", "application/json")
        .header("User-Agent", "Corneta/1")
        .call()
        .ok()?;
    if response.status().as_u16() != 200 || !running.load(Ordering::Acquire) {
        return None;
    }
    let value = bounded_json(response.into_body().into_reader())?;
    running.load(Ordering::Acquire).then_some(value)
}

struct CacheEntry {
    snapshot: AudienceSnapshot,
    failures: usize,
    next_poll: Duration,
    cycle: Option<u64>,
}

pub(crate) struct AudiencePoller {
    entries: HashMap<String, CacheEntry>,
    agent: ureq3::Agent,
    started: Instant,
    cycle: u64,
}

impl AudiencePoller {
    pub(crate) fn new<'a>(sources: impl IntoIterator<Item = &'a str>) -> Self {
        let entries = sources
            .into_iter()
            .filter_map(normalize_slug)
            .map(|slug| {
                (
                    slug,
                    CacheEntry {
                        snapshot: AudienceSnapshot::default(),
                        failures: 0,
                        next_poll: Duration::ZERO,
                        cycle: None,
                    },
                )
            })
            .collect();
        let config = ureq3::Agent::config_builder()
            .timeout_global(Some(REQUEST_TIMEOUT))
            // Public metadata must not redirect into a different origin or private network.
            .max_redirects(0)
            .http_status_as_error(false)
            .build();
        Self {
            entries,
            agent: ureq3::Agent::new_with_config(config),
            started: Instant::now(),
            cycle: 0,
        }
    }

    /// Call once before iterating configured sources, including duplicate channel aliases.
    pub(crate) fn begin_cycle(&mut self) {
        self.cycle = self.cycle.wrapping_add(1);
    }

    pub(crate) fn poll(&mut self, input: &str, running: &AtomicBool) -> AudienceSnapshot {
        let agent = self.agent.clone();
        self.poll_with(input, running, self.started.elapsed(), |slug, running| {
            fetch_profile(&agent, slug, running)
        })
    }

    fn poll_with(
        &mut self,
        input: &str,
        running: &AtomicBool,
        now: Duration,
        fetch: impl FnOnce(&str, &AtomicBool) -> Option<Value>,
    ) -> AudienceSnapshot {
        if !running.load(Ordering::Acquire) {
            return AudienceSnapshot::default();
        }
        let Some(slug) = normalize_slug(input) else {
            return AudienceSnapshot::default();
        };
        let Some(entry) = self.entries.get_mut(&slug) else {
            return AudienceSnapshot::default();
        };
        if entry.cycle == Some(self.cycle) || now < entry.next_poll {
            entry.cycle = Some(self.cycle);
            return entry.snapshot.clone();
        }
        let response = fetch(&slug, running);
        if !running.load(Ordering::Acquire) {
            return AudienceSnapshot::default();
        }
        let snapshot = response
            .as_ref()
            .map(|value| parse_audience(value, &slug))
            .unwrap_or_default();
        let delay = if snapshot.audience_status == AudienceStatus::Unavailable {
            let delay = [30, 60, 120, 300][entry.failures.min(3)];
            entry.failures = (entry.failures + 1).min(3);
            delay
        } else {
            entry.failures = 0;
            30
        };
        entry.next_poll = now.saturating_add(Duration::from_secs(delay));
        entry.cycle = Some(self.cycle);
        entry.snapshot = snapshot.clone();
        snapshot
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::io::Cursor;

    fn profile() -> Value {
        json!({
            "id": "synthetic-channel-id",
            "slug": "example",
            "liveStreamVideo": {
                "id": "synthetic-video-id",
                "title": "Synthetic live",
                "status": "active",
                "liveStream": {
                    "isEmbed": false,
                    "platform": "cinefy",
                    "status": "live",
                    "visibility": "public",
                    "viewerCount": 42,
                    "startedAt": "2026-09-09T16:00:00-03:00"
                }
            }
        })
    }

    #[test]
    fn native_live_requires_explicit_non_embed_and_accepts_zero() {
        for count in [0, 42, MAX_SAFE_VIEWERS] {
            let mut value = profile();
            value["liveStreamVideo"]["liveStream"]["viewerCount"] = json!(count);
            let snapshot = parse_audience(&value, "example");
            assert_eq!(snapshot.viewers, Some(count));
            assert!(snapshot.live);
            assert_eq!(snapshot.audience_status, AudienceStatus::Live);
            assert_eq!(snapshot.audience_origin, None);
            assert_eq!(snapshot.embedded_viewers, None);
            assert_eq!(snapshot.title.as_deref(), Some("Synthetic live"));
            assert_eq!(snapshot.started_at.as_deref(), Some("2026-09-09T19:00:00Z"));
        }
    }

    #[test]
    fn trusted_native_streams_expose_public_audience_metadata_including_zero() {
        for count in [0, 42] {
            let mut value = profile();
            value["liveStreamVideo"]["liveStream"]["visibility"] = json!("trusted");
            value["liveStreamVideo"]["liveStream"]["viewerCount"] = json!(count);
            let snapshot = parse_audience(&value, "example");
            assert_eq!(snapshot.viewers, Some(count));
            assert_eq!(snapshot.embedded_viewers, None);
            assert_eq!(snapshot.audience_status, AudienceStatus::Live);
            assert!(snapshot.live);
        }
    }

    #[test]
    fn embedded_audience_never_counts_as_cinefy_viewers() {
        for (platform, origin) in [
            (json!("twitch"), AudienceOrigin::Twitch),
            (json!("youtube"), AudienceOrigin::Youtube),
            (json!("kick"), AudienceOrigin::Kick),
            (json!("unknown-provider"), AudienceOrigin::External),
            (Value::Null, AudienceOrigin::External),
        ] {
            let mut value = profile();
            value["liveStreamVideo"]["liveStream"]["isEmbed"] = json!(true);
            value["liveStreamVideo"]["liveStream"]["platform"] = platform;
            value["liveStreamVideo"]["liveStream"]["viewerCount"] = json!(1115);
            let snapshot = parse_audience(&value, "example");
            assert_eq!(snapshot.viewers, None);
            assert_eq!(snapshot.embedded_viewers, Some(1115));
            assert!(snapshot.live);
            assert_eq!(snapshot.audience_status, AudienceStatus::Embedded);
            assert_eq!(snapshot.audience_origin, Some(origin));
        }
    }

    #[test]
    fn embedded_counts_accept_safe_zero_but_reject_malformed_values() {
        for count in [0, MAX_SAFE_VIEWERS] {
            let mut value = profile();
            value["liveStreamVideo"]["liveStream"]["isEmbed"] = json!(true);
            value["liveStreamVideo"]["liveStream"]["viewerCount"] = json!(count);
            let snapshot = parse_audience(&value, "example");
            assert_eq!(snapshot.viewers, None);
            assert_eq!(snapshot.embedded_viewers, Some(count));
        }
        for count in [
            Value::Null,
            json!(-1),
            json!(1.5),
            json!("1115"),
            json!(true),
            json!(MAX_SAFE_VIEWERS + 1),
            json!(u64::MAX),
        ] {
            let mut value = profile();
            value["liveStreamVideo"]["liveStream"]["isEmbed"] = json!(true);
            value["liveStreamVideo"]["liveStream"]["viewerCount"] = count;
            let snapshot = parse_audience(&value, "example");
            assert_eq!(snapshot.viewers, None);
            assert_eq!(snapshot.embedded_viewers, None);
            assert_eq!(snapshot.audience_status, AudienceStatus::Embedded);
            assert!(snapshot.live);
        }
    }

    #[test]
    fn explicit_offline_is_measured_zero_not_an_unavailable_live() {
        let mut value = profile();
        value["liveStreamVideo"] = Value::Null;
        let snapshot = parse_audience(&value, "example");
        assert_eq!(snapshot.viewers, Some(0));
        assert!(!snapshot.live);
        assert_eq!(snapshot.audience_status, AudienceStatus::Offline);
        assert_eq!(snapshot.embedded_viewers, None);
        assert!(snapshot.title.is_none());
        assert!(snapshot.started_at.is_none());
    }

    #[test]
    fn missing_or_mismatched_profile_cannot_claim_offline() {
        for value in [
            Value::Null,
            json!([]),
            json!({}),
            json!({"liveStreamVideo": null}),
            json!({"id": "channel", "slug": "other", "liveStreamVideo": null}),
            json!({"id": "channel", "slug": "example"}),
            json!({"id": "channel/path", "slug": "example", "liveStreamVideo": null}),
        ] {
            assert_eq!(
                parse_audience(&value, "example"),
                AudienceSnapshot::default()
            );
        }
    }

    #[test]
    fn unknown_liveness_visibility_or_video_state_is_unavailable() {
        for (pointer, replacement) in [
            ("/liveStreamVideo", json!(false)),
            ("/liveStreamVideo/status", Value::Null),
            ("/liveStreamVideo/status", json!("ended")),
            ("/liveStreamVideo/liveStream", Value::Null),
            ("/liveStreamVideo/liveStream/status", json!("offline")),
            ("/liveStreamVideo/liveStream/status", Value::Null),
            ("/liveStreamVideo/liveStream/visibility", json!("private")),
            ("/liveStreamVideo/liveStream/visibility", json!("unlisted")),
            ("/liveStreamVideo/liveStream/visibility", json!("unknown")),
            ("/liveStreamVideo/liveStream/visibility", Value::Null),
        ] {
            let mut value = profile();
            *value.pointer_mut(pointer).unwrap() = replacement;
            assert_eq!(
                parse_audience(&value, "example"),
                AudienceSnapshot::default()
            );
        }
    }

    #[test]
    fn missing_or_non_boolean_embed_marker_never_infers_native_audience() {
        for marker in [Value::Null, json!(0), json!("false"), json!({})] {
            let mut value = profile();
            value["liveStreamVideo"]["liveStream"]["isEmbed"] = marker;
            let snapshot = parse_audience(&value, "example");
            assert_eq!(snapshot.viewers, None);
            assert_eq!(snapshot.audience_status, AudienceStatus::Unavailable);
            assert!(snapshot.live);
        }
        let mut value = profile();
        value["liveStreamVideo"]["liveStream"]
            .as_object_mut()
            .unwrap()
            .remove("isEmbed");
        assert_eq!(parse_audience(&value, "example").viewers, None);
    }

    #[test]
    fn malformed_or_unsafe_counts_do_not_become_zero() {
        for count in [
            Value::Null,
            json!(-1),
            json!(1.5),
            json!("42"),
            json!(true),
            json!(MAX_SAFE_VIEWERS + 1),
            json!(u64::MAX),
        ] {
            let mut value = profile();
            value["liveStreamVideo"]["liveStream"]["viewerCount"] = count;
            let snapshot = parse_audience(&value, "example");
            assert_eq!(snapshot.viewers, None);
            assert!(snapshot.live);
            assert_eq!(snapshot.audience_status, AudienceStatus::Unavailable);
        }
    }

    #[test]
    fn optional_metadata_is_bounded_and_never_replaces_audience_fields() {
        let mut value = profile();
        value["liveStreamVideo"]["title"] = json!(format!("\0{}\n", "é".repeat(400)));
        value["liveStreamVideo"]["liveStream"]["startedAt"] = json!("not-a-timestamp");
        value["lastQuarter"] = json!({"views": 99999});
        value["email"] = json!("synthetic@example.invalid");
        let snapshot = parse_audience(&value, "example");
        assert_eq!(snapshot.title.unwrap().chars().count(), 256);
        assert!(snapshot.started_at.is_none());
        let serialized = serde_json::to_value(parse_audience(&value, "example")).unwrap();
        assert_eq!(serialized.as_object().unwrap().len(), 7);
        assert_eq!(serialized["viewers"], 42);
        assert_eq!(serialized["audienceStatus"], "live");
        assert!(serialized.get("startedAt").is_some());
        assert!(serialized.get("views").is_none());
        assert!(serialized.get("lastQuarter").is_none());
        assert!(serialized.get("email").is_none());
    }

    #[test]
    fn slugs_accept_channel_aliases_without_allowing_url_or_path_injection() {
        for input in [
            "example",
            "@Example",
            "https://cinefy.gg/example",
            "https://cinefy.gg/example/live",
            "https://www.cinefy.gg/popout/example/chat?type=overlay",
        ] {
            assert_eq!(normalize_slug(input).as_deref(), Some("example"));
        }
        for input in [
            "",
            ".",
            "..",
            "../other",
            "%2e%2e",
            "a%2Fb",
            "a&other=true",
            "watch",
            "https://example.invalid/channel",
            "https://cinefy.gg@127.0.0.1/channel",
            "https://cinefy.gg/../other",
            "https://cinefy.gg/channel%2Fother",
            "https://cinefy.gg/watch",
            "file://cinefy.gg/example",
            "ftp://cinefy.gg/example",
        ] {
            assert!(
                normalize_slug(input).is_none(),
                "unsafe channel input: {input}"
            );
        }
        assert!(normalize_slug(&"a".repeat(65)).is_none());
        assert!(normalize_slug(&format!("example?{}", "a".repeat(1_024))).is_none());
    }

    #[test]
    fn body_reader_limits_consumption_to_one_over_the_cap() {
        let mut bytes = b"{}".to_vec();
        bytes.resize(MAX_BODY_BYTES, b' ');
        assert_eq!(bounded_json(Cursor::new(&bytes)), Some(json!({})));
        bytes.extend_from_slice(&[b' '; 16]);
        let mut reader = Cursor::new(bytes);
        assert!(bounded_json(&mut reader).is_none());
        assert_eq!(reader.position(), (MAX_BODY_BYTES + 1) as u64);
        assert!(bounded_json(Cursor::new(b"not-json")).is_none());
    }

    #[test]
    fn collector_agent_has_a_short_timeout_and_never_follows_redirects() {
        let poller = AudiencePoller::new(["example"]);
        assert_eq!(
            poller.agent.config().timeouts().global,
            Some(REQUEST_TIMEOUT)
        );
        assert_eq!(poller.agent.config().max_redirects(), 0);
        assert!(fetch_profile(&poller.agent, "example", &AtomicBool::new(false)).is_none());
    }

    #[test]
    fn aliases_share_one_cache_entry_and_one_fetch_per_cycle() {
        let running = AtomicBool::new(true);
        let mut poller = AudiencePoller::new(["@Example", "example", "https://cinefy.gg/example"]);
        assert_eq!(poller.entries.len(), 1);
        let mut calls = 0;
        for (input, now) in [("example", 0), ("@Example", 45)] {
            let snapshot =
                poller.poll_with(input, &running, Duration::from_secs(now), |slug, _| {
                    assert_eq!(slug, "example");
                    calls += 1;
                    Some(profile())
                });
            assert_eq!(snapshot.viewers, Some(42));
        }
        assert_eq!(calls, 1);
        poller.begin_cycle();
        poller.poll_with("example", &running, Duration::from_secs(45), |_, _| {
            calls += 1;
            Some(profile())
        });
        assert_eq!(calls, 2);
        poller.begin_cycle();
        poller.poll_with("example", &running, Duration::from_secs(46), |_, _| {
            panic!("a successful sample remains cached for thirty seconds")
        });
    }

    #[test]
    fn polling_unconfigured_channels_never_grows_the_cache_or_fetches() {
        let mut poller = AudiencePoller::new(["example", "../invalid"]);
        for index in 0..100 {
            let snapshot = poller.poll_with(
                &format!("other-{index}"),
                &AtomicBool::new(true),
                Duration::ZERO,
                |_, _| panic!("unconfigured sources cannot trigger a request"),
            );
            assert_eq!(snapshot, AudienceSnapshot::default());
        }
        assert_eq!(poller.entries.len(), 1);
    }

    #[test]
    fn failures_back_off_at_thirty_sixty_one_twenty_and_three_hundred_seconds() {
        let running = AtomicBool::new(true);
        let mut poller = AudiencePoller::new(["example"]);
        let mut calls = 0;
        for (now, expected_calls) in [
            (0, 1),
            (29, 1),
            (30, 2),
            (89, 2),
            (90, 3),
            (209, 3),
            (210, 4),
            (509, 4),
            (510, 5),
            (809, 5),
            (810, 6),
        ] {
            poller.begin_cycle();
            let snapshot =
                poller.poll_with("example", &running, Duration::from_secs(now), |_, _| {
                    calls += 1;
                    None
                });
            assert_eq!(snapshot.audience_status, AudienceStatus::Unavailable);
            assert_eq!(calls, expected_calls);
        }
    }

    #[test]
    fn recovery_resets_backoff_and_failed_samples_never_reuse_live_counts() {
        let running = AtomicBool::new(true);
        let mut poller = AudiencePoller::new(["example"]);
        for now in [0, 30] {
            poller.begin_cycle();
            poller.poll_with("example", &running, Duration::from_secs(now), |_, _| None);
        }
        poller.begin_cycle();
        let recovered = poller.poll_with("example", &running, Duration::from_secs(90), |_, _| {
            Some(profile())
        });
        assert_eq!(recovered.viewers, Some(42));
        poller.begin_cycle();
        let failed = poller.poll_with("example", &running, Duration::from_secs(120), |_, _| {
            Some(json!({}))
        });
        assert_eq!(failed.viewers, None);
        assert_eq!(failed.audience_status, AudienceStatus::Unavailable);
        assert_eq!(
            poller.entries["example"].next_poll,
            Duration::from_secs(150)
        );
    }

    #[test]
    fn cancellation_before_or_during_fetch_does_not_publish_or_cache_a_result() {
        let running = AtomicBool::new(false);
        let mut poller = AudiencePoller::new(["example"]);
        assert_eq!(
            poller.poll_with("example", &running, Duration::ZERO, |_, _| {
                panic!("shutdown must prevent a new request")
            }),
            AudienceSnapshot::default()
        );
        running.store(true, Ordering::Release);
        let cancelled = poller.poll_with("example", &running, Duration::ZERO, |_, running| {
            running.store(false, Ordering::Release);
            Some(profile())
        });
        assert_eq!(cancelled, AudienceSnapshot::default());
        assert_eq!(poller.entries["example"].cycle, None);
        assert_eq!(poller.entries["example"].failures, 0);
        running.store(true, Ordering::Release);
        let resumed = poller.poll_with("example", &running, Duration::ZERO, |_, _| Some(profile()));
        assert_eq!(resumed.viewers, Some(42));
    }
}
