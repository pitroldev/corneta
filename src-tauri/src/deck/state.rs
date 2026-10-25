//! What the phone sees: one JSON state built from the engine, config, audience and OBS.

use serde::Serialize;
use serde_json::{json, Map, Value};

use crate::config::AppConfig;
use crate::engine::EngineSnapshot;
use crate::obs::LinkState;

#[derive(Clone, Debug, Serialize)]
pub struct Mark {
    /// Milliseconds since the live started.
    pub at: u64,
    pub label: String,
}

/// The live the phone is following, kept after it ends so the summary can be shown.
#[derive(Clone, Debug, Default)]
pub struct Session {
    pub started_at: Option<u128>,
    pub ended_at: Option<u128>,
    pub marks: Vec<Mark>,
    pub peak: u64,
}

impl Session {
    /// Follows engine transitions; true when a live began or ended.
    pub fn observe(&mut self, snapshot: Option<&EngineSnapshot>, now: u128) -> bool {
        let state = snapshot.map(|s| s.state.as_str()).unwrap_or("stopped");
        let started = snapshot.and_then(|s| s.started_at);
        match (state, started) {
            ("live", Some(at)) if self.started_at != Some(at) => {
                *self = Session {
                    started_at: Some(at),
                    ..Session::default()
                };
                true
            }
            ("stopped" | "error", _) if self.started_at.is_some() && self.ended_at.is_none() => {
                self.ended_at = Some(now);
                true
            }
            _ => false,
        }
    }

    pub fn mark(&mut self, now: u128, label: &str) {
        if let (Some(start), None) = (self.started_at, self.ended_at) {
            self.marks.push(Mark {
                at: now.saturating_sub(start) as u64,
                label: label.chars().take(80).collect(),
            });
        }
    }

    pub fn audience(&mut self, total: u64) {
        if self.started_at.is_some() && self.ended_at.is_none() {
            self.peak = self.peak.max(total);
        }
    }
}

pub struct Input<'a> {
    pub cfg: &'a AppConfig,
    pub snapshot: Option<&'a EngineSnapshot>,
    pub viewers: Option<&'a Value>,
    pub obs: &'a LinkState,
    pub session: &'a Session,
    /// Enabled targets that have both a server URL and a stream key, and all enabled targets.
    pub ready: (usize, usize),
    pub pc: &'a str,
    /// The PC clock, so the phone can count live time even when its own clock is off.
    pub now: u128,
}

pub fn build(input: &Input) -> Value {
    let cfg = input.cfg;
    let s = &cfg.settings;
    let snap = input.snapshot;
    let engine_state = snap.map(|x| x.state.as_str()).unwrap_or("stopped");
    let targets: Vec<Value> = cfg
        .targets
        .iter()
        .filter(|t| t.enabled)
        .map(|t| {
            let status = snap.and_then(|x| x.targets.get(&t.id));
            json!({
                "id": t.id,
                "platform": t.platform_id,
                "name": t.name,
                "state": status.map(|x| x.state.as_str()).unwrap_or("off"),
                "bitrateKbps": status.map(|x| x.bitrate_kbps).unwrap_or(0),
                "fps": status.map(|x| x.fps).unwrap_or(0),
                "dropped": status.map(|x| x.dropped_frames).unwrap_or(0),
            })
        })
        .collect();
    let signal_lost = snap.is_some_and(|x| x.targets.values().any(|t| t.state == "signal-lost"));
    let guardian = s.guardian_enabled
        && s.guardian_watchlist
            .iter()
            .any(|t| t.trim().chars().count() >= 3);
    let chat_platforms: Vec<&str> = {
        let mut list: Vec<&str> = s
            .chat_sources
            .iter()
            .filter(|c| c.enabled)
            .map(|c| c.platform.as_str())
            .collect();
        list.sort_unstable();
        list.dedup();
        list
    };
    json!({
        "type": "state",
        "handles": handles(cfg),
        "lang": s.language,
        "pc": input.pc,
        "now": input.now,
        "live": {
            "state": engine_state,
            "startedAt": snap.and_then(|x| x.started_at),
            "forcedBrb": snap.is_some_and(|x| x.forced_brb),
            "brbArmed": s.brb_enabled || guardian,
            "blackScreen": snap.is_some_and(|x| x.black_screen),
            "signalLost": signal_lost,
            "ingestLive": snap.is_some_and(|x| x.ingest_live),
            "message": snap.and_then(|x| x.message.clone()),
        },
        "targets": targets,
        "viewers": viewers(input.viewers),
        "machine": {
            "cpu": snap.and_then(|x| x.cpu),
            "gpu": snap.and_then(|x| x.gpu),
        },
        "obs": input.obs,
        "ready": { "platforms": input.ready.0, "total": input.ready.1 },
        "protections": {
            "brb": s.brb_enabled,
            "autoBitrate": s.auto_bitrate,
            "blackScreen": s.black_screen_alert,
            "guardian": guardian,
        },
        "title": s.stream_title,
        "layout": s.deck_layout,
        "combos": s.deck_combos,
        "chatPlatforms": chat_platforms,
        "session": {
            "startedAt": input.session.started_at,
            "endedAt": input.session.ended_at,
            "marks": input.session.marks,
            "peak": input.session.peak,
        },
    })
}

/// The streamer's names in chat, so the phone can flag messages that @mention them.
fn handles(cfg: &AppConfig) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for source in cfg.settings.chat_sources.iter().filter(|c| c.enabled) {
        let login = crate::platforms::chat_provider(&source.platform)
            .and_then(|provider| provider.mention_login(source));
        for name in login
            .into_iter()
            .chain(std::iter::once(source.name.as_str()))
        {
            let name = name.trim().trim_start_matches('@').to_lowercase();
            if name.chars().count() >= 3
                && !name.contains(char::is_whitespace)
                && !out.contains(&name)
            {
                out.push(name);
            }
        }
    }
    out
}

/// Viewers per platform, summing the channels a platform has in the chat sources.
fn viewers(sample: Option<&Value>) -> Value {
    let Some(sample) = sample else {
        return json!({ "total": null, "items": [] });
    };
    let mut per: Map<String, Value> = Map::new();
    for item in sample
        .get("items")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        let Some(platform) = item.get("platform").and_then(Value::as_str) else {
            continue;
        };
        let Some(count) = item.get("viewers").and_then(Value::as_u64) else {
            continue;
        };
        let slot = per.entry(platform.to_string()).or_insert(json!(0));
        *slot = json!(slot.as_u64().unwrap_or(0) + count);
    }
    json!({
        "total": sample.get("total").and_then(Value::as_u64),
        "items": per.into_iter().map(|(platform, viewers)| json!({ "platform": platform, "viewers": viewers })).collect::<Vec<_>>(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn snapshot(state: &str, started: Option<u128>) -> EngineSnapshot {
        let mut snap = EngineSnapshot::stopped();
        snap.state = state.into();
        snap.started_at = started;
        snap
    }

    #[test]
    fn a_session_starts_with_the_live_and_survives_its_end() {
        let mut session = Session::default();
        assert!(!session.observe(None, 0));
        assert!(session.observe(Some(&snapshot("live", Some(1_000))), 1_000));
        session.mark(61_000, "Fail");
        session.audience(120);
        session.audience(90);
        assert!(!session.observe(Some(&snapshot("live", Some(1_000))), 70_000));
        assert!(session.observe(Some(&snapshot("stopped", None)), 90_000));
        assert_eq!(session.ended_at, Some(90_000));
        assert_eq!(session.marks[0].at, 60_000);
        assert_eq!(session.peak, 120);
        session.mark(95_000, "late");
        session.audience(500);
        assert_eq!(
            session.marks.len(),
            1,
            "marks after the end belong to no live"
        );
        assert_eq!(session.peak, 120);
        assert!(session.observe(Some(&snapshot("live", Some(200_000))), 200_000));
        assert!(session.marks.is_empty());
    }

    #[test]
    fn viewers_are_summed_per_platform() {
        let sample = json!({ "total": 30, "items": [
            { "platform": "a", "viewers": 10 },
            { "platform": "a", "viewers": 5 },
            { "platform": "b", "viewers": 15 },
            { "platform": "c", "viewers": null },
        ]});
        let out = viewers(Some(&sample));
        assert_eq!(out["total"], 30);
        assert_eq!(
            out["items"],
            json!([{ "platform": "a", "viewers": 15 }, { "platform": "b", "viewers": 15 }])
        );
        assert_eq!(viewers(None)["total"], Value::Null);
    }

    #[test]
    fn handles_come_from_enabled_chat_logins_and_names() {
        let mut cfg = AppConfig::default();
        let source =
            |platform: &str, value: &str, name: &str, enabled: bool| crate::config::ChatSource {
                id: format!("{platform}-{value}"),
                platform: platform.into(),
                value: value.into(),
                name: name.into(),
                enabled,
                has_send_token: false,
            };
        cfg.settings.chat_sources = vec![
            source("twitch", "Petro_Live", "@Petro_Live", true),
            source("youtube", "UC123456", "Canal do Petro", true),
            source("kick", "petrokick", "", true),
            source("kick", "ghost", "", false),
        ];
        assert_eq!(handles(&cfg), vec!["petro_live", "petrokick"]);
    }

    #[test]
    fn the_state_carries_no_secrets() {
        let mut cfg = AppConfig::default();
        cfg.settings.obs_password = "obs-secret-fixture".into();
        cfg.settings.youtube_api_key = "yt-secret-fixture".into();
        let state = build(&Input {
            cfg: &cfg,
            snapshot: None,
            viewers: None,
            obs: &LinkState::default(),
            session: &Session::default(),
            ready: (0, 0),
            pc: "PC",
            now: 0,
        });
        let text = state.to_string();
        assert!(!text.contains("secret-fixture"));
        assert_eq!(state["live"]["state"], "stopped");
    }
}
