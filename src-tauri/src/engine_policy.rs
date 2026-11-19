use crate::engine::{EngineSnapshot, PlatformCheck, PlatformCheckState, TargetStatus};
use crate::i18n::{Locale, Msg};
use crate::platforms::provider::PlatformReading;
use std::path::Path;

pub(crate) fn fmt_mbps(kbps: u32) -> String {
    if kbps >= 1000 {
        format!("{:.1} Mbps", kbps as f64 / 1000.0)
    } else {
        format!("{kbps} kbps")
    }
}

pub(crate) fn quality_of(snap: &EngineSnapshot) -> &'static str {
    match snap.state.as_str() {
        "stopped" => "idle",
        "error" => "bad",
        "starting" => "warn",
        _ => {
            let mut bad = false;
            let mut warn = false;
            for st in snap.targets.values() {
                match st.state.as_str() {
                    "error" | "signal-lost" => bad = true,
                    "reconnecting" | "connecting" | "waiting" | "brb" => warn = true,
                    _ => {}
                }
            }
            if bad {
                "bad"
            } else if warn {
                "warn"
            } else {
                "good"
            }
        }
    }
}

pub(crate) fn tray_tooltip(snap: &EngineSnapshot, locale: Locale) -> String {
    if snap.state == "stopped" {
        return Msg::TrayTooltipIdle.text(locale);
    }
    let header = match snap.state.as_str() {
        "starting" => Msg::TrayTooltipStarting,
        "error" => Msg::TrayTooltipError,
        _ => Msg::TrayTooltipLive {
            n: snap.targets.len(),
        },
    }
    .text(locale);
    let mut items: Vec<&TargetStatus> = snap.targets.values().collect();
    items.sort_by(|a, b| a.name.cmp(&b.name));
    let mut lines = vec![header];
    for st in items {
        let (mark, detail) = match st.state.as_str() {
            "live" => ("✓", fmt_mbps(st.bitrate_kbps)),
            "reconnecting" => ("⚠", Msg::TrayTargetReconnecting.text(locale)),
            "error" => ("✕", Msg::TrayTargetError.text(locale)),
            "signal-lost" => ("✕", Msg::TrayTargetSignalLost.text(locale)),
            "paused" => ("⏸", Msg::TrayTargetPaused.text(locale)),
            "waiting" => ("◌", Msg::TrayTargetWaiting.text(locale)),
            "brb" => ("◷", Msg::TrayTargetBrb.text(locale)),
            _ => ("…", Msg::TrayTargetConnecting.text(locale)),
        };
        lines.push(format!("{mark} {} · {detail}", st.name));
    }
    lines.join("\n")
}

pub(crate) fn parse_kv(line: &str, key: &str) -> Option<f64> {
    let idx = line.find(key)?;
    let rest = line[idx + key.len()..].trim_start();
    let num: String = rest
        .chars()
        .take_while(|c| c.is_ascii_digit() || *c == '.')
        .collect();
    num.parse().ok()
}

/// FFmpeg prefixes lines with heap addresses (`[tls @ 0x55d4c403a0c0]`) and echoes destination
/// URLs, which embed the stream key. Neither is a reason: a "403" inside them would park a
/// transient failure as a refused key.
fn error_reason_words(low: &str) -> String {
    let mut words: Vec<&str> = Vec::new();
    let mut tokens = low.split_whitespace().peekable();
    while let Some(token) = tokens.next() {
        if token == "@" {
            let address = tokens.peek().map(|next| {
                let hex = next.trim_end_matches(']');
                let hex = hex.strip_prefix("0x").unwrap_or(hex);
                !hex.is_empty() && hex.bytes().all(|b| b.is_ascii_hexdigit())
            });
            if address == Some(true) {
                tokens.next();
                continue;
            }
        }
        words.push(if token.contains("://") {
            "<url>"
        } else {
            token
        });
    }
    words.join(" ")
}

pub(crate) fn friendly_error(low: &str, locale: Locale) -> (&'static str, String) {
    let text = error_reason_words(low);
    let has = |needle: &str| text.contains(needle);
    let status = |code: &str| {
        text.split_whitespace()
            .any(|word| word.trim_matches(|c: char| !c.is_ascii_alphanumeric()) == code)
    };
    if status("401")
        || status("403")
        || status("404")
        || has("forbidden")
        || has("unauthorized")
        || has("not authorized")
        || has("rejected")
        || has("auth")
        || has("badname")
        || has("publish denied")
        || has("publish.denied")
        || has("invalid stream")
        || has("invalid key")
        || has("stream key")
    {
        ("error", Msg::TargetErrorDestinationRefused.text(locale))
    } else if has("connection refused")
        || has("cannot open")
        || has("failed to connect")
        || has("connection to <url> failed")
        // FFmpeg 7 reports a failed output open this way; "Error opening output files: Encoder
        // not found" is a local encoder problem, not a connection one.
        || (has("error opening output") && has("i/o error"))
        || has("failed to resolve hostname")
        || has("no such host")
        || has("no route")
        || has("network is unreachable")
        || has("name or service not known")
    {
        ("reconnecting", Msg::TargetErrorNoConnection.text(locale))
    } else if has("broken pipe")
        || has("connection reset")
        || has("end of file")
        || has("unexpected eof")
        || has("timed out")
        || has("i/o error")
        || has("input/output error")
        || has("error in the pull function")
        || has("error in the push function")
        || has("error writing trailer")
        // Windows builds print unmapped Winsock codes: WSAECONNABORTED and WSAECONNRESET.
        || has("error number -10053")
        || has("error number -10054")
    {
        (
            "reconnecting",
            Msg::TargetErrorConnectionDropped.text(locale),
        )
    } else {
        ("reconnecting", Msg::TargetErrorShaky.text(locale))
    }
}

/// What one FFmpeg output line means for its target, decided before taking the engine lock.
#[derive(Debug, PartialEq)]
pub(crate) enum TargetLine {
    /// Progress output: the target is sending.
    Stats {
        fps: Option<u32>,
        bitrate_kbps: Option<u32>,
        dropped: Option<u32>,
    },
    /// An error-looking line, lowercased for classification.
    Error(String),
    /// Neither progress nor a known error keyword; it changes no state.
    Ignore,
}

pub(crate) fn classify_target_line(line: &str) -> TargetLine {
    if line.contains("frame=") || line.contains("bitrate=") {
        return TargetLine::Stats {
            fps: parse_kv(line, "fps=").map(|v| v as u32),
            bitrate_kbps: parse_kv(line, "bitrate=").map(|v| v as u32),
            dropped: parse_kv(line, "drop=").map(|v| v as u32),
        };
    }
    const ERR_KEYS: [&str; 8] = [
        "error",
        "failed",
        "connection refused",
        "broken pipe",
        "unable to",
        "connection reset",
        "i/o error",
        "end of file",
    ];
    let low = line.to_lowercase();
    if low.contains("failed to parse temporal unit")
        || low.contains("failed to read unit")
        || low.contains("failed to read packet")
        || low.contains("invalid data found when processing input")
    {
        return TargetLine::Ignore;
    }
    if ERR_KEYS.iter().any(|k| low.contains(k)) {
        TargetLine::Error(low)
    } else {
        TargetLine::Ignore
    }
}

#[derive(Debug, PartialEq)]
pub(crate) enum TargetErrorUpdate {
    /// Keep the stronger signal-lost state.
    Keep,
    /// Missing input is not an output failure: the target waits for OBS.
    Waiting,
    /// A destination failure; `park` stops reconnecting after a refused key or authorization.
    Failed {
        state: &'static str,
        message: String,
        park: bool,
    },
}

pub(crate) fn target_error_update(
    low: &str,
    has_signal: bool,
    current: &str,
    locale: Locale,
) -> TargetErrorUpdate {
    if !has_signal {
        return if current == "signal-lost" {
            TargetErrorUpdate::Keep
        } else {
            TargetErrorUpdate::Waiting
        };
    }
    let (state, message) = friendly_error(low, locale);
    TargetErrorUpdate::Failed {
        state,
        message,
        park: state == "error",
    }
}

/// Keep FFmpeg failure context while redacting stream keys and RTMP URLs.
pub(crate) fn safe_ffmpeg_diagnostic(line: &str, stream_key: &str) -> Option<String> {
    const ERROR_MARKERS: [&str; 12] = [
        "error",
        "failed",
        "refused",
        "forbidden",
        "unauthorized",
        "denied",
        "badname",
        "broken pipe",
        "connection reset",
        "unable to",
        "timed out",
        "end of file",
    ];
    let low = line.to_ascii_lowercase();
    if line.contains("frame=") || !ERROR_MARKERS.iter().any(|marker| low.contains(marker)) {
        return None;
    }

    let mut safe = if stream_key.is_empty() {
        line.trim().to_string()
    } else {
        line.trim().replace(stream_key, "<stream-key>")
    };

    // Opening errors echo the full URL; retain the surrounding TLS, DNS, or server failure reason.
    loop {
        let lower = safe.to_ascii_lowercase();
        let start = [lower.find("rtmp://"), lower.find("rtmps://")]
            .into_iter()
            .flatten()
            .min();
        let Some(start) = start else { break };
        let end = safe[start..]
            .char_indices()
            .find_map(|(offset, ch)| {
                (offset > 0 && (ch.is_whitespace() || matches!(ch, '\'' | '"' | ']' | ')')))
                    .then_some(start + offset)
            })
            .unwrap_or(safe.len());
        safe.replace_range(start..end, "<rtmp-url>");
    }

    if safe.chars().count() > 600 {
        safe = safe.chars().take(600).collect();
        safe.push('…');
    }
    Some(safe)
}

pub(crate) fn is_brb_slate_path(p: &Path) -> bool {
    p.file_stem()
        .and_then(|s| s.to_str())
        .map(|s| s.eq_ignore_ascii_case("brb-slate"))
        .unwrap_or(false)
}

pub(crate) fn brb_slate_is_video(p: &Path) -> bool {
    matches!(
        p.extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_ascii_lowercase())
            .as_deref(),
        Some("mp4" | "mov" | "mkv" | "webm" | "m4v")
    )
}

pub(crate) fn parse_mediamtx_paths(
    body: &str,
    ingest_name: &str,
    program_name: &str,
) -> (bool, u64, bool) {
    let v: serde_json::Value = match serde_json::from_str(body) {
        Ok(v) => v,
        Err(_) => return (false, 0, false),
    };
    let mut ingest_ready = false;
    let mut bytes = 0u64;
    let mut prog_ready = false;
    if let Some(arr) = v.get("items").and_then(|i| i.as_array()) {
        for p in arr {
            let name = p.get("name").and_then(|n| n.as_str()).unwrap_or("");
            // Accept current MediaMTX fields and deprecated aliases for sidecar compatibility.
            let ready = p
                .get("online")
                .and_then(|r| r.as_bool())
                .or_else(|| p.get("ready").and_then(|r| r.as_bool()))
                == Some(true);
            if name == ingest_name {
                ingest_ready = ready;
                bytes = p
                    .get("inboundBytes")
                    .and_then(|b| b.as_u64())
                    .or_else(|| p.get("bytesReceived").and_then(|b| b.as_u64()))
                    .unwrap_or(0);
            } else if name == program_name {
                prog_ready = ready;
            }
        }
    }
    (ingest_ready, bytes, prog_ready)
}

pub(crate) fn parse_mediamtx_path_codec(
    body: &str,
    path_name: &str,
) -> Option<crate::platforms::VideoCodec> {
    let v: serde_json::Value = serde_json::from_str(body).ok()?;
    let arr = v.get("items")?.as_array()?;
    for p in arr {
        if p.get("name").and_then(|n| n.as_str()) != Some(path_name) {
            continue;
        }
        let tracks = p.get("tracks").and_then(|t| t.as_array())?;
        for track in tracks {
            if let Some(codec) = track
                .as_str()
                .and_then(crate::platforms::VideoCodec::from_mediamtx_track)
            {
                return Some(codec);
            }
        }
    }
    None
}

/// Returns the local port MediaMTX could not bind, or `fallback_port` when the line omits it.
/// Matches the `listen <net> <addr>: bind:` shape because Windows may localize the OS text after it.
pub(crate) fn mediamtx_port_conflict(line: &str, fallback_port: u16) -> Option<u16> {
    let low = line.to_ascii_lowercase();
    let listener = low
        .split("listen ")
        .nth(1)
        .filter(|rest| rest.contains(": bind:"));
    if listener.is_none() && !low.contains("address already in use") {
        return None;
    }
    let port = listener
        .and_then(|rest| rest.split_whitespace().nth(1))
        .and_then(|address| address.trim_end_matches(':').rsplit_once(':'))
        .and_then(|(_, port)| port.parse::<u16>().ok());
    Some(port.unwrap_or(fallback_port))
}

/// Restarts a crashed helper with growing waits; a quiet stretch since the last crash earns it back.
#[derive(Debug, Clone)]
pub(crate) struct RestartBudget {
    max_attempts: u32,
    quiet_ms: u64,
    attempts: u32,
    last_failure_ms: Option<u64>,
}

impl RestartBudget {
    pub(crate) const fn new(max_attempts: u32, quiet_ms: u64) -> Self {
        Self {
            max_attempts,
            quiet_ms,
            attempts: 0,
            last_failure_ms: None,
        }
    }

    /// The wait before restarting after a crash at `now_ms`, or None once the budget is spent.
    pub(crate) fn next_delay(&mut self, now_ms: u64) -> Option<u64> {
        if self
            .last_failure_ms
            .is_some_and(|last| now_ms.saturating_sub(last) >= self.quiet_ms)
        {
            self.attempts = 0;
        }
        self.last_failure_ms = Some(now_ms);
        if self.attempts >= self.max_attempts {
            return None;
        }
        let delay = 500u64 << self.attempts.min(3);
        self.attempts += 1;
        Some(delay)
    }

    /// True for the first crash of an episode, so each episode is reported once.
    pub(crate) fn episode_started(&self) -> bool {
        self.attempts == 1
    }
}

/// Platforms take a few seconds to list a new live, so an earlier "not live" is not news.
pub(crate) const PLATFORM_CONFIRM_GRACE_MS: u64 = 45_000;
const PLATFORM_FIRST_CHECK_MS: u64 = 20_000;
const PLATFORM_UNSETTLED_CHECK_MS: u64 = 40_000;

/// What the destination row shows for a platform reading, or None while it is too early to tell.
pub(crate) fn platform_check(reading: &PlatformReading, flowing_ms: u64) -> Option<PlatformCheck> {
    let state = if reading.live {
        PlatformCheckState::Confirmed
    } else if flowing_ms >= PLATFORM_CONFIRM_GRACE_MS {
        PlatformCheckState::NotLive
    } else {
        return None;
    };
    Some(PlatformCheck {
        state,
        health: reading.health,
        issues: reading.issues.clone(),
    })
}

/// Whether to ask the platform again, counting only the time the destination has been flowing.
/// Until a verdict is shown it asks sooner; afterwards it keeps the platform's own interval, which
/// spares platforms whose API calls cost quota.
pub(crate) fn platform_check_due(
    flowing_ms: u64,
    last_check_flowing_ms: Option<u64>,
    settled: bool,
    interval_ms: u64,
) -> bool {
    match last_check_flowing_ms {
        None => flowing_ms >= PLATFORM_FIRST_CHECK_MS,
        Some(last) => {
            let every = if settled {
                interval_ms
            } else {
                interval_ms.min(PLATFORM_UNSETTLED_CHECK_MS)
            };
            flowing_ms.saturating_sub(last) >= every
        }
    }
}

/// Work started for one live, such as a child's failure, may act only while that live still runs.
pub(crate) fn is_current_live(live: bool, current_generation: u64, generation: u64) -> bool {
    live && current_generation == generation
}

/// How long a destination may stop writing before its connection counts as dead. A blocked
/// socket can hold FFmpeg for minutes while it keeps printing stats with the same size.
pub(crate) const TARGET_STALL_MS: u64 = 15_000;
/// How long a new output may take to write its first bytes, including the wait for OBS's first
/// keyframe. A server that accepts the TCP connection but never answers the RTMP handshake would
/// otherwise hold it forever, since FFmpeg sets no timeout there.
pub(crate) const TARGET_OPEN_MS: u64 = 25_000;

/// Sustained output growth needed before a restart counts as a mid-stream interruption rather than
/// a startup failure.
pub(crate) const HEALTHY_RUN_MS: u64 = 30_000;

/// Follows the bytes a destination's FFmpeg reports as written in its stats lines.
#[derive(Debug)]
pub(crate) struct ProgressWatch {
    started_ms: u64,
    written_kb: Option<f64>,
    first_growth_ms: Option<u64>,
    last_growth_ms: Option<u64>,
}

impl ProgressWatch {
    pub(crate) fn new(started_ms: u64) -> Self {
        Self {
            started_ms,
            written_kb: None,
            first_growth_ms: None,
            last_growth_ms: None,
        }
    }

    pub(crate) fn on_stats(&mut self, written_kb: Option<f64>, now_ms: u64) {
        let Some(kb) = written_kb.filter(|kb| *kb > 0.0) else {
            return;
        };
        if self.written_kb.is_none_or(|last| kb > last) {
            if self.stalled(now_ms) {
                self.first_growth_ms = None;
            }
            self.first_growth_ms.get_or_insert(now_ms);
            self.written_kb = Some(kb);
            self.last_growth_ms = Some(now_ms);
        }
    }

    pub(crate) fn stalled(&self, now_ms: u64) -> bool {
        match self.last_growth_ms {
            Some(at) => now_ms.saturating_sub(at) >= TARGET_STALL_MS,
            None => now_ms.saturating_sub(self.started_ms) >= TARGET_OPEN_MS,
        }
    }

    pub(crate) fn wrote_any(&self) -> bool {
        self.written_kb.is_some()
    }

    pub(crate) fn healthy_run(&self) -> bool {
        matches!(
            (self.first_growth_ms, self.last_growth_ms),
            (Some(first), Some(last)) if last.saturating_sub(first) >= HEALTHY_RUN_MS
        )
    }
}

/// FFmpeg's own `speed=` averages since the process started, so an hour into a live a network
/// drop barely moves it. This measures the media time written over the last few seconds.
#[derive(Debug, Default)]
pub(crate) struct SpeedWindow {
    samples: std::collections::VecDeque<(u64, f64)>,
}

impl SpeedWindow {
    const SPAN_MS: u64 = 6_000;
    const MIN_SPAN_MS: u64 = 3_000;

    /// The recent speed, once the window covers enough time to be steady.
    pub(crate) fn on_stats(&mut self, media_secs: Option<f64>, now_ms: u64) -> Option<f64> {
        let media_secs = media_secs?;
        if self
            .samples
            .back()
            .is_some_and(|(_, last)| media_secs < *last)
        {
            self.samples.clear();
        }
        self.samples.push_back((now_ms, media_secs));
        while self.samples.len() > 2 && now_ms.saturating_sub(self.samples[1].0) >= Self::SPAN_MS {
            self.samples.pop_front();
        }
        let (first_ms, first_secs) = *self.samples.front()?;
        let wall_ms = now_ms.saturating_sub(first_ms);
        if wall_ms < Self::MIN_SPAN_MS {
            return None;
        }
        Some((media_secs - first_secs) * 1000.0 / wall_ms as f64)
    }
}

/// The media time a stats line reports as written (`time=HH:MM:SS.cc`), in seconds.
pub(crate) fn stats_media_secs(line: &str) -> Option<f64> {
    if !matches!(classify_target_line(line), TargetLine::Stats { .. }) {
        return None;
    }
    let rest = &line[line.find("time=")? + 5..];
    let clock = rest.split_whitespace().next()?;
    let mut parts = clock.split(':');
    let hours: f64 = parts.next()?.parse().ok()?;
    let minutes: f64 = parts.next()?.parse().ok()?;
    let seconds: f64 = parts.next()?.parse().ok()?;
    if parts.next().is_some() || hours < 0.0 {
        return None;
    }
    Some(hours * 3600.0 + minutes * 60.0 + seconds)
}

/// The output size a stats line reports, in kB.
pub(crate) fn stats_written_kb(line: &str) -> Option<f64> {
    if matches!(classify_target_line(line), TargetLine::Stats { .. }) {
        parse_kv(line, "size=")
    } else {
        None
    }
}

/// The video codec an FFmpeg command line encodes with, or `copy`.
pub(crate) fn video_codec(args: &[String]) -> Option<&str> {
    let start = args
        .iter()
        .position(|arg| arg == "-i")
        .map_or(0, |index| index + 2);
    args.get(start..)
        .unwrap_or(args)
        .windows(2)
        .find(|pair| pair[0] == "-c:v")
        .map(|pair| pair[1].as_str())
}

/// GPU encoders can vanish mid-live (driver reset, session limit); libx264 only needs the CPU.
pub(crate) fn is_hardware_video_codec(codec: &str) -> bool {
    ["_nvenc", "_qsv", "_amf", "_videotoolbox"]
        .iter()
        .any(|suffix| codec.ends_with(suffix))
}

/// Whether a lowercased FFmpeg line comes from the encoder itself and reports a failure. The codec
/// logs as `[h264_nvenc @` (`[enc:h264_nvenc @` since FFmpeg 7.1); the output stream's
/// `[vost#0:0/h264_nvenc @` prefix also carries muxer and network errors, so it does not count.
pub(crate) fn hardware_encoder_failed(low: &str, codec: &str) -> bool {
    const FAILURE: [&str; 8] = [
        "error",
        "failed",
        "cannot",
        "could not",
        "not supported",
        "unsupported",
        "no capable",
        "out of memory",
    ];
    let from_encoder =
        low.contains(&format!("[{codec} @")) || low.contains(&format!("[enc:{codec} @"));
    from_encoder && FAILURE.iter().any(|word| low.contains(word))
}

pub(crate) fn is_loopback_host(host: &str) -> bool {
    host.eq_ignore_ascii_case("localhost")
        || host
            .trim_start_matches('[')
            .trim_end_matches(']')
            .parse::<std::net::IpAddr>()
            .is_ok_and(|ip| ip.is_loopback())
}

pub(crate) fn parse_ingest_hostport(ingest_url: &str) -> Result<(String, u16), String> {
    let after = ingest_url.split("://").nth(1).unwrap_or(ingest_url);
    let hostport = after.split('/').next().unwrap_or("");
    let (host, port) = match hostport.rsplit_once(':') {
        Some((h, p)) => (h.to_string(), p.parse::<u16>().unwrap_or(1935)),
        None => {
            let default = if ingest_url.starts_with("rtmps") {
                443
            } else {
                1935
            };
            (hostport.to_string(), default)
        }
    };
    if host.is_empty() {
        return Err("invalid ingest URL".into());
    }
    Ok((host, port))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn target(name: &str, state: &str, kbps: u32) -> TargetStatus {
        TargetStatus {
            target_id: name.into(),
            name: name.into(),
            platform_id: "twitch".into(),
            action: "copy".into(),
            reencoded: false,
            state: state.into(),
            bitrate_kbps: kbps,
            fps: 0,
            dropped_frames: 0,
            uptime_sec: 0.0,
            message: None,
            platform: None,
        }
    }
    fn snap(state: &str, targets: Vec<TargetStatus>) -> EngineSnapshot {
        let mut map = HashMap::new();
        for t in targets {
            map.insert(t.target_id.clone(), t);
        }
        EngineSnapshot {
            state: state.into(),
            started_at: None,
            ingest_live: state == "live",
            operation_id: None,
            error_id: None,
            error_code: None,
            targets: map,
            message: None,
            cpu: None,
            gpu: None,
            memory_pct: None,
            obs: None,
            forced_brb: false,
            black_screen: false,
            frozen_screen: false,
            silent_audio: false,
        }
    }

    #[test]
    fn fmt_mbps_threshold() {
        assert_eq!(fmt_mbps(999), "999 kbps");
        assert_eq!(fmt_mbps(1000), "1.0 Mbps");
        assert_eq!(fmt_mbps(6000), "6.0 Mbps");
    }

    #[test]
    fn quality_red_yellow_green() {
        assert_eq!(quality_of(&snap("stopped", vec![])), "idle");
        assert_eq!(quality_of(&snap("error", vec![])), "bad");
        assert_eq!(quality_of(&snap("starting", vec![])), "warn");
        assert_eq!(
            quality_of(&snap(
                "live",
                vec![target("a", "live", 6000), target("b", "error", 0)]
            )),
            "bad"
        );
        assert_eq!(
            quality_of(&snap(
                "live",
                vec![target("a", "live", 6000), target("b", "reconnecting", 0)]
            )),
            "warn"
        );
        assert_eq!(
            quality_of(&snap("live", vec![target("a", "live", 6000)])),
            "good"
        );
        assert_eq!(
            quality_of(&snap("live", vec![target("a", "signal-lost", 0)])),
            "bad"
        );
        for st in ["connecting", "waiting", "brb"] {
            assert_eq!(
                quality_of(&snap("live", vec![target("a", st, 0)])),
                "warn",
                "{st}"
            );
        }
    }

    #[test]
    fn tray_tooltip_lists_platforms() {
        let s = snap(
            "live",
            vec![target("YouTube", "live", 9000), target("Twitch", "brb", 0)],
        );
        let t = tray_tooltip(&s, Locale::PtBr);
        assert!(t.starts_with("Corneta · no ar (2)"));
        assert!(t.contains("✓ YouTube · 9.0 Mbps"));
        assert!(t.contains("◷ Twitch · JÁ VOLTO no ar"));
        assert_eq!(
            tray_tooltip(&snap("stopped", vec![]), Locale::PtBr),
            "Corneta"
        );
        let english = tray_tooltip(&s, Locale::En);
        assert!(english.starts_with("Corneta · live (2)"));
        assert!(english.contains("BE RIGHT BACK on air"));
    }

    #[test]
    fn target_lines_split_progress_errors_and_noise() {
        assert_eq!(
            classify_target_line(
                "frame= 120 fps= 60 q=-1.0 size=  1024kB bitrate=6000.5kbits/s drop=3"
            ),
            TargetLine::Stats {
                fps: Some(60),
                bitrate_kbps: Some(6000),
                dropped: Some(3),
            }
        );
        assert_eq!(
            classify_target_line("bitrate=N/A speed=1x"),
            TargetLine::Stats {
                fps: None,
                bitrate_kbps: None,
                dropped: None,
            }
        );
        for line in [
            "Error opening output",
            "Connection refused",
            "av_interleaved_write_frame(): Broken pipe",
            "Unable to open resource",
            "rtmp://x: I/O error",
            "End of file",
        ] {
            assert_eq!(
                classify_target_line(line),
                TargetLine::Error(line.to_lowercase()),
                "{line}"
            );
        }
        // Logged without a keyword the rule knows, so the target state does not change.
        for line in ["Press [q] to stop", "Operation timed out", "403 Forbidden"] {
            assert_eq!(classify_target_line(line), TargetLine::Ignore, "{line}");
        }
    }

    #[test]
    fn target_errors_wait_without_input_and_park_only_refused_destinations() {
        let update =
            |low, has_signal, current| target_error_update(low, has_signal, current, Locale::PtBr);
        assert_eq!(
            update("error: connection refused", false, "live"),
            TargetErrorUpdate::Waiting
        );
        assert_eq!(
            update("error: connection refused", false, "signal-lost"),
            TargetErrorUpdate::Keep
        );
        assert!(matches!(
            update("error: publish denied (auth)", true, "live"),
            TargetErrorUpdate::Failed {
                state: "error",
                park: true,
                ..
            }
        ));
        assert!(matches!(
            update("error: connection refused", true, "live"),
            TargetErrorUpdate::Failed {
                state: "reconnecting",
                park: false,
                ..
            }
        ));
    }

    #[test]
    fn friendly_error_classifies() {
        let friendly_error = |line| super::friendly_error(line, Locale::PtBr);
        assert_eq!(
            friendly_error("stream key rejected: 403 forbidden").0,
            "error"
        );
        assert_eq!(friendly_error("not authorized").0, "error");
        assert_eq!(friendly_error("connection refused").0, "reconnecting");
        assert_eq!(friendly_error("broken pipe").0, "reconnecting");
        assert_eq!(
            friendly_error("server error: netstream.publish.badname").0,
            "error"
        );
        assert_eq!(friendly_error("algo estranho").0, "reconnecting");
        assert!(friendly_error("auth failed").1.contains("Plataformas"));
        assert_eq!(
            friendly_error("connection refused").1,
            "Sem conexão com a plataforma — tentando de novo."
        );
        assert_eq!(
            friendly_error("broken pipe").1,
            "A conexão caiu — reconectando."
        );
        assert_eq!(
            friendly_error("algo estranho").1,
            "Instabilidade no envio — reconectando."
        );
    }

    #[test]
    fn error_classification_is_locale_independent_and_messages_are_translated() {
        for (line, state, english) in [
            ("403 forbidden", "error", "Address or key rejected"),
            (
                "connection refused",
                "reconnecting",
                "No connection to the platform",
            ),
            ("broken pipe", "reconnecting", "The connection dropped"),
            ("unknown failure", "reconnecting", "Something's shaky"),
        ] {
            let pt = friendly_error(line, Locale::PtBr);
            let en = friendly_error(line, Locale::En);
            assert_eq!(pt.0, state);
            assert_eq!(en.0, state);
            assert_ne!(pt.1, en.1);
            assert!(en.1.starts_with(english));
        }
        for (state, expected) in [
            ("reconnecting", "reconnecting"),
            ("error", "error"),
            ("signal-lost", "no signal from OBS"),
            ("paused", "paused"),
            ("waiting", "waiting for signal"),
            ("connecting", "connecting"),
        ] {
            assert!(
                tray_tooltip(&snap("live", vec![target("x", state, 0)]), Locale::En)
                    .contains(expected)
            );
        }
    }

    #[test]
    fn ffmpeg_diagnostic_keeps_reason_and_redacts_destination() {
        let safe = safe_ffmpeg_diagnostic(
            "[rtmp] Server error: BadName opening rtmps://host/app/secret-key",
            "secret-key",
        )
        .unwrap();
        assert!(safe.contains("BadName"));
        assert!(safe.contains("<rtmp-url>"));
        assert!(!safe.contains("host"));
        assert!(!safe.contains("secret-key"));
        assert!(safe_ffmpeg_diagnostic("frame=12 fps=30", "secret").is_none());
    }

    #[derive(Clone, Copy, Debug, PartialEq)]
    enum Category {
        Refused,
        NoConnection,
        Dropped,
        Shaky,
    }

    impl Category {
        fn expected(self, locale: Locale) -> (&'static str, String) {
            match self {
                Self::Refused => ("error", Msg::TargetErrorDestinationRefused.text(locale)),
                Self::NoConnection => ("reconnecting", Msg::TargetErrorNoConnection.text(locale)),
                Self::Dropped => (
                    "reconnecting",
                    Msg::TargetErrorConnectionDropped.text(locale),
                ),
                Self::Shaky => ("reconnecting", Msg::TargetErrorShaky.text(locale)),
            }
        }
    }

    struct Placeholders {
        addr: &'static str,
        url: &'static str,
        tcp: &'static str,
        host: &'static str,
        stream_name: &'static str,
    }

    const PLAIN: Placeholders = Placeholders {
        addr: "000001d2c4a0b1c0",
        url: "rtmp://live.example/app/live_sk_abc123",
        tcp: "tcp://live.example:1935",
        host: "live.example",
        stream_name: "live_sk_abc123",
    };

    // Heap addresses, hosts and keys may contain "403", "auth" or "rejected" by chance.
    const MISLEADING: Placeholders = Placeholders {
        addr: "0x55d4c403a0c0",
        url: "rtmps://auth.live.example/app/live_403_rejected_sk",
        tcp: "tcp://auth.live.example:1935",
        host: "fa7403c1b171.global-contribute.live-video.net",
        stream_name: "live_403_rejected_sk",
    };

    fn render(line: &str, p: &Placeholders) -> String {
        line.replace("{addr}", p.addr)
            .replace("{url}", p.url)
            .replace("{tcp}", p.tcp)
            .replace("{host}", p.host)
    }

    /// Lines as FFmpeg prints them, with placeholder addresses and destinations.
    const FFMPEG_LINES: &[(&str, Category)] = &[
        ("[rtmp @ {addr}] Server error: Authentication Failed", Category::Refused),
        ("[rtmp @ {addr}] Server error: authentication failed.", Category::Refused),
        ("[rtmp @ {addr}] Server error: NetStream.Publish.BadName", Category::Refused),
        ("[rtmp @ {addr}] Server error: NetStream.Publish.Denied", Category::Refused),
        ("[https @ {addr}] HTTP error 403 Forbidden", Category::Refused),
        (
            "[out#0/flv @ {addr}] Error opening output https://upload.live.example/ingest: Server returned 401 Unauthorized (authorization failed)",
            Category::Refused,
        ),
        ("Server returned 403 Forbidden (access denied)", Category::Refused),
        ("Server returned 404 Not Found", Category::Refused),
        (
            "[tcp @ {addr}] Connection to {tcp} failed: Connection refused",
            Category::NoConnection,
        ),
        (
            "[tcp @ {addr}] Connection to {tcp} failed: Error number -138 occurred",
            Category::NoConnection,
        ),
        (
            "[tcp @ {addr}] Connection to {tcp} failed: Network is unreachable",
            Category::NoConnection,
        ),
        (
            "[tcp @ {addr}] Failed to resolve hostname {host}: No such host is known. ",
            Category::NoConnection,
        ),
        (
            "[out#0/flv @ {addr}] Error opening output {url}: I/O error",
            Category::NoConnection,
        ),
        ("Error opening output files: I/O error", Category::NoConnection),
        ("[tls @ {addr}] Error in the pull function.", Category::Dropped),
        ("[tls @ {addr}] Error in the push function.", Category::Dropped),
        (
            "[tls @ {addr}] error:0A000126:SSL routines::unexpected eof while reading",
            Category::Dropped,
        ),
        ("{url}: I/O error", Category::Dropped),
        ("Input/output error", Category::Dropped),
        ("Broken pipe", Category::Dropped),
        ("av_interleaved_write_frame(): Broken pipe", Category::Dropped),
        ("av_interleaved_write_frame(): Connection reset by peer", Category::Dropped),
        ("av_interleaved_write_frame(): Error number -10054 occurred", Category::Dropped),
        ("[flv @ {addr}] Error writing trailer of {url}: Broken pipe", Category::Dropped),
        (
            "[out#0/flv @ {addr}] Error writing trailer: Error number -10053 occurred",
            Category::Dropped,
        ),
        ("[rtmp @ {addr}] Server error: Already publishing", Category::Shaky),
        ("[vost#0:0 @ {addr}] Unknown encoder 'h264_nvenc'", Category::Shaky),
        ("[vost#0:0 @ {addr}] Error selecting an encoder", Category::Shaky),
        ("Error opening output file {url}.", Category::Shaky),
        ("Error opening output files: Encoder not found", Category::Shaky),
        ("[h264_nvenc @ {addr}] Cannot load nvcuda.dll", Category::Shaky),
        (
            "[h264_nvenc @ {addr}] OpenEncodeSessionEx failed: unsupported device (2): (no details)",
            Category::Shaky,
        ),
        ("[h264_amf @ {addr}] AMF failed", Category::Shaky),
        (
            "[vost#0:0/h264_nvenc @ {addr}] Error while opening encoder - maybe incorrect parameters such as bit_rate, rate, width or height",
            Category::Shaky,
        ),
        (
            "Error while opening encoder for output stream #0:0 - maybe incorrect parameters such as bit_rate, rate, width or height",
            Category::Shaky,
        ),
        ("Conversion failed!", Category::Shaky),
        ("[udp @ {addr}] bind failed: Address already in use", Category::Shaky),
        ("Address already in use", Category::Shaky),
    ];

    #[test]
    fn real_ffmpeg_lines_map_to_their_friendly_category() {
        for (line, category) in FFMPEG_LINES {
            for placeholders in [&PLAIN, &MISLEADING] {
                let line = render(line, placeholders);
                for locale in Locale::ALL {
                    assert_eq!(
                        friendly_error(&line.to_lowercase(), locale),
                        category.expected(locale),
                        "{line:?} must map to {category:?}"
                    );
                }
            }
        }
    }

    /// Only a refused destination parks a target; local encoder failures must keep retrying so
    /// the supervisor can fall back from the GPU pipeline.
    #[test]
    fn only_destination_refusals_park_and_encoder_failures_keep_retrying() {
        for (line, category) in FFMPEG_LINES {
            for placeholders in [&PLAIN, &MISLEADING] {
                let line = render(line, placeholders);
                let TargetLine::Error(low) = classify_target_line(&line) else {
                    continue;
                };
                let parked = matches!(
                    target_error_update(&low, true, "live", Locale::En),
                    TargetErrorUpdate::Failed { park: true, .. }
                );
                assert_eq!(parked, *category == Category::Refused, "{line:?}");
            }
        }
        for line in [
            "[vost#0:0 @ 000001d2c4030a40] Unknown encoder 'h264_nvenc'",
            "[h264_nvenc @ 0x55d4c403a0c0] Cannot load nvcuda.dll",
            "Server returned 404 Not Found",
            "Address already in use",
        ] {
            assert_eq!(classify_target_line(line), TargetLine::Ignore, "{line:?}");
        }
    }

    #[test]
    fn ffmpeg_lines_never_echo_the_stream_key_or_its_destination() {
        for (line, _) in FFMPEG_LINES {
            for placeholders in [&PLAIN, &MISLEADING] {
                let line = render(line, placeholders);
                for locale in Locale::ALL {
                    let (_, message) = friendly_error(&line.to_lowercase(), locale);
                    assert!(!message.contains(placeholders.stream_name), "{line:?}");
                    assert!(!message.contains("://"), "{line:?}");
                }
                let Some(diagnostic) = safe_ffmpeg_diagnostic(&line, placeholders.stream_name)
                else {
                    continue;
                };
                assert!(
                    !diagnostic.contains(placeholders.stream_name),
                    "{diagnostic:?}"
                );
                assert!(!diagnostic.contains("/app/"), "{diagnostic:?}");
                assert!(!diagnostic.to_ascii_lowercase().contains("rtmp://"));
                assert!(!diagnostic.to_ascii_lowercase().contains("rtmps://"));
            }
        }
        // A key pasted into the URL leaves the vault key empty; the URL redaction still applies.
        let diagnostic = safe_ffmpeg_diagnostic(
            "[out#0/flv @ 000001d2c4a0b1c0] Error opening output RTMP://LIVE.EXAMPLE/app/live_sk_abc123: I/O error",
            "",
        )
        .unwrap();
        assert!(!diagnostic.contains("live_sk_abc123"), "{diagnostic:?}");
        assert!(diagnostic.contains("I/O error"), "{diagnostic:?}");
    }

    #[test]
    fn speed_window_follows_recent_progress_instead_of_the_average() {
        let mut window = SpeedWindow::default();
        // An hour at full speed, sampled every 500 ms.
        let mut now = 0u64;
        let mut media = 0.0;
        let mut speed = None;
        for _ in 0..7200 {
            now += 500;
            media += 0.5;
            speed = window.on_stats(Some(media), now);
        }
        assert!((speed.unwrap() - 1.0).abs() < 0.01);
        // The network stalls: media time stops while the clock runs.
        for _ in 0..8 {
            now += 500;
            speed = window.on_stats(Some(media), now);
        }
        assert!(speed.unwrap() < 0.6, "got {speed:?}");
        // FFmpeg's cumulative average would still read about 0.999.
        assert!(media / (now as f64 / 1000.0) > 0.99);
    }

    #[test]
    fn speed_window_waits_for_enough_span_and_restarts_with_a_new_process() {
        let mut window = SpeedWindow::default();
        assert_eq!(window.on_stats(Some(1.0), 1_000), None);
        assert_eq!(window.on_stats(Some(2.0), 2_000), None);
        assert_eq!(window.on_stats(None, 3_000), None);
        assert!((window.on_stats(Some(4.0), 4_000).unwrap() - 1.0).abs() < 1e-9);
        // A restarted FFmpeg counts media time from zero again.
        assert_eq!(window.on_stats(Some(0.5), 4_500), None);
    }

    #[test]
    fn stats_media_secs_reads_the_time_field_of_stats_lines_only() {
        let line = "frame= 1234 fps= 60 q=23.0 size=   10240kB time=01:02:03.50 bitrate=6000.0kbits/s speed=1x";
        assert_eq!(stats_media_secs(line), Some(3723.5));
        assert_eq!(
            stats_media_secs(
                "frame=    0 fps=0.0 q=0.0 size=       0kB time=N/A bitrate=N/A speed=N/A"
            ),
            None
        );
        assert_eq!(
            stats_media_secs("[flv @ 0x1] time=00:00:01.00 is not a stats line"),
            None
        );
    }

    #[test]
    fn parse_kv_reads_ffmpeg_stats() {
        assert_eq!(
            parse_kv("frame= 120 fps= 60 bitrate= 6000.5kbits/s", "fps="),
            Some(60.0)
        );
        assert_eq!(parse_kv("bitrate= 6000.5kbits/s", "bitrate="), Some(6000.5));
        assert_eq!(parse_kv("drop=5", "drop="), Some(5.0));
        assert_eq!(parse_kv("sem chave aqui", "fps="), None);
        assert_eq!(parse_kv("fps= abc", "fps="), None);
    }

    #[test]
    fn slate_path_predicates() {
        assert!(is_brb_slate_path(Path::new("/x/brb-slate.png")));
        assert!(is_brb_slate_path(Path::new("/x/BRB-SLATE.MP4")));
        assert!(!is_brb_slate_path(Path::new("/x/outra.png")));
        assert!(brb_slate_is_video(Path::new("/x/brb-slate.mp4")));
        assert!(brb_slate_is_video(Path::new("/x/brb-slate.MOV")));
        assert!(!brb_slate_is_video(Path::new("/x/brb-slate.png")));
    }

    #[test]
    fn mediamtx_paths_ready_and_bytes() {
        let body = r#"{"items":[
            {"name":"live/obs","ready":true,"bytesReceived":12345},
            {"name":"live/obs_program","ready":false}
        ]}"#;
        assert_eq!(
            parse_mediamtx_paths(body, "live/obs", "live/obs_program"),
            (true, 12345, false)
        );
        let current = r#"{"items":[
            {"name":"live/obs","online":true,"inboundBytes":67890},
            {"name":"live/obs_program","online":true}
        ]}"#;
        assert_eq!(
            parse_mediamtx_paths(current, "live/obs", "live/obs_program"),
            (true, 67890, true)
        );
        assert_eq!(
            parse_mediamtx_paths("nao é json", "live/obs", "live/obs_program"),
            (false, 0, false)
        );
        assert_eq!(
            parse_mediamtx_paths(r#"{"items":[]}"#, "live/obs", "live/obs_program"),
            (false, 0, false)
        );
        let prog = r#"{"items":[{"name":"live/obs_program","ready":true}]}"#;
        assert_eq!(
            parse_mediamtx_paths(prog, "live/obs", "live/obs_program"),
            (false, 0, true)
        );
    }

    #[test]
    fn mediamtx_port_conflicts_are_recognized_on_windows_and_unix() {
        // Lines captured from MediaMTX v1.19.3 on Windows and its Unix wording.
        let windows_in_use = "2026/11/15 03:13:42 ERR listen tcp 127.0.0.1:19351: bind: Only one usage of each socket address (protocol/network address/port) is normally permitted.";
        let windows_reserved = "2026/11/15 03:13:42 ERR listen tcp 127.0.0.1:9997: bind: An attempt was made to access a socket in a way forbidden by its access permissions.";
        let unix_in_use = "2026/11/15 03:13:42 ERR listen udp :8892: bind: address already in use";
        // Go falls back to the system language when Windows lacks the English message table.
        let localized = "2026/11/15 03:13:42 ERR listen tcp 127.0.0.1:1935: bind: Normalmente é permitida apenas uma utilização de cada endereço de soquete (protocolo/endereço de rede/porta).";
        let ipv6 = "2026/11/15 03:13:42 ERR listen tcp [::1]:1940: bind: Only one usage of each socket address (protocol/network address/port) is normally permitted.";
        assert_eq!(mediamtx_port_conflict(windows_in_use, 1935), Some(19351));
        assert_eq!(mediamtx_port_conflict(windows_reserved, 1935), Some(9997));
        assert_eq!(mediamtx_port_conflict(unix_in_use, 1935), Some(8892));
        assert_eq!(mediamtx_port_conflict(localized, 1940), Some(1935));
        assert_eq!(mediamtx_port_conflict(ipv6, 1935), Some(1940));
        assert_eq!(
            mediamtx_port_conflict("ERR bind: address already in use", 1940),
            Some(1940)
        );
        for unrelated in [
            "2026/11/15 03:12:36 INF [RTMP] started with listener on 127.0.0.1:19351 (TCP/RTMP)",
            "2026/11/15 03:12:36 WAR [MoQ] failed to save TLS key to auto.key: open auto.key: Access is denied.",
            "2026/11/15 03:16:11 ERR mapping value is not allowed in this context",
        ] {
            assert_eq!(mediamtx_port_conflict(unrelated, 1935), None, "{unrelated}");
        }
    }

    #[test]
    fn restart_waits_grow_until_the_budget_is_spent_and_a_quiet_stretch_resets_it() {
        let mut budget = RestartBudget::new(3, 120_000);
        assert_eq!(budget.next_delay(0), Some(500));
        assert!(budget.episode_started());
        assert_eq!(budget.next_delay(10_000), Some(1_000));
        assert!(!budget.episode_started());
        assert_eq!(budget.next_delay(20_000), Some(2_000));
        assert_eq!(budget.next_delay(30_000), None);
        // A crash long after the last one starts a new episode.
        assert_eq!(budget.next_delay(200_000), Some(500));
        assert!(budget.episode_started());

        let mut unlimited = RestartBudget::new(u32::MAX, 60_000);
        let waits: Vec<_> = (0..6).map(|i| unlimited.next_delay(i * 1_000)).collect();
        assert_eq!(
            waits,
            [500, 1_000, 2_000, 4_000, 4_000, 4_000].map(Some).to_vec()
        );
    }

    #[test]
    fn a_platform_reading_becomes_a_verdict_only_when_it_means_something() {
        use crate::platforms::provider::{IssueSeverity, PlatformHealth, PlatformIssue};
        let issue = PlatformIssue {
            kind: "bitrateLow".into(),
            severity: IssueSeverity::Warning,
        };
        let live = PlatformReading {
            live: true,
            health: Some(PlatformHealth::Ok),
            issues: vec![issue.clone()],
        };
        let check = platform_check(&live, 5_000).unwrap();
        assert_eq!(check.state, PlatformCheckState::Confirmed);
        assert_eq!(check.health, Some(PlatformHealth::Ok));
        assert_eq!(check.issues, vec![issue]);

        let offline = PlatformReading::default();
        assert_eq!(
            platform_check(&offline, PLATFORM_CONFIRM_GRACE_MS - 1),
            None
        );
        assert_eq!(
            platform_check(&offline, PLATFORM_CONFIRM_GRACE_MS).map(|c| c.state),
            Some(PlatformCheckState::NotLive)
        );
    }

    #[test]
    fn platform_checks_start_after_a_warm_up_and_slow_down_once_settled() {
        assert!(!platform_check_due(19_999, None, false, 300_000));
        assert!(platform_check_due(20_000, None, false, 300_000));
        // Before a verdict, a quota-priced platform is asked again after 40 s, not 5 min.
        assert!(!platform_check_due(59_999, Some(20_000), false, 300_000));
        assert!(platform_check_due(60_000, Some(20_000), false, 300_000));
        assert!(!platform_check_due(359_999, Some(60_000), true, 300_000));
        assert!(platform_check_due(360_000, Some(60_000), true, 300_000));
        // Free platforms keep their own shorter interval.
        assert!(platform_check_due(50_000, Some(20_000), true, 30_000));
    }

    #[test]
    fn a_destination_that_stops_writing_is_seen_as_stalled() {
        let mut watch = ProgressWatch::new(0);
        // Nothing written yet: opening the connection gets the longer allowance.
        watch.on_stats(None, 0);
        watch.on_stats(Some(0.0), 1_000);
        assert!(!watch.stalled(TARGET_OPEN_MS - 1));
        assert!(ProgressWatch::new(0).stalled(TARGET_OPEN_MS));

        watch.on_stats(Some(512.0), 2_000);
        watch.on_stats(Some(1_024.0), 3_000);
        assert!(!watch.stalled(3_000 + TARGET_STALL_MS - 1));
        // Stats keep coming with the same size while the socket is blocked.
        watch.on_stats(Some(1_024.0), 10_000);
        watch.on_stats(Some(1_024.0), 17_000);
        assert!(watch.stalled(3_000 + TARGET_STALL_MS));

        watch.on_stats(Some(1_100.0), 18_500);
        assert!(!watch.stalled(18_500 + TARGET_STALL_MS - 1));
        // Stats that stop altogether count the same way.
        assert!(watch.stalled(18_500 + TARGET_STALL_MS));
        assert!(watch.wrote_any());
        // The stall before 18_500 reset the streak; 30 s of steady growth restores it.
        assert!(!watch.healthy_run());
        watch.on_stats(Some(1_200.0), 30_000);
        watch.on_stats(Some(1_300.0), 42_000);
        watch.on_stats(Some(1_400.0), 18_500 + HEALTHY_RUN_MS);
        assert!(watch.healthy_run());
    }

    #[test]
    fn video_codec_skips_input_decoder_before_input_flag() {
        let args: Vec<String> = [
            "-hwaccel",
            "cuda",
            "-c:v",
            "h264_cuvid",
            "-i",
            "in",
            "-c:v",
            "h264_nvenc",
            "out",
        ]
        .map(String::from)
        .to_vec();
        assert_eq!(video_codec(&args), Some("h264_nvenc"));
    }

    #[test]
    fn hardware_encoder_failures_are_told_apart_from_network_ones() {
        let args: Vec<String> = ["-i", "in", "-c:v", "h264_nvenc", "-f", "flv", "out"]
            .map(String::from)
            .to_vec();
        let codec = video_codec(&args).unwrap();
        assert_eq!(codec, "h264_nvenc");
        assert!(is_hardware_video_codec(codec));
        assert!(!is_hardware_video_codec("libx264"));
        assert!(!is_hardware_video_codec("copy"));

        for line in [
            "[h264_nvenc @ 000001] openencodesessionex failed: out of memory (10): (no details)",
            "[h264_nvenc @ 000001] cannot load nvcuda.dll",
            "[h264_nvenc @ 000001] encodepicture failed!: unknown error (999)",
            "[vost#0:0/h264_nvenc @ 000001] [enc:h264_nvenc @ 000002] error while opening encoder - maybe incorrect parameters such as bit_rate, rate, width or height.",
        ] {
            assert!(hardware_encoder_failed(line, codec), "{line}");
        }
        for line in [
            "[tls @ 000001] error in the push function.",
            // Seen live: a dropped connection, reported under the output stream's encoder prefix.
            "[vost#0:0/h264_nvenc @ 000001] error submitting a packet to the muxer: error number -10053 occurred",
            "[out#0/flv @ 000001] error muxing a packet: generic error in an external library",
            "[h264_nvenc @ 000001] using deprecated pixel format",
            "frame= 120 fps= 60 q=21.0 size=  1024kib bitrate=6000.5kbits/s",
        ] {
            assert!(!hardware_encoder_failed(line, codec), "{line}");
        }
    }

    #[test]
    fn only_the_current_live_is_ended_by_a_child_failure() {
        assert!(is_current_live(true, 5, 5));
        // Stop followed by an immediate start: the old MediaMTX exits during the new live.
        assert!(!is_current_live(true, 6, 5));
        assert!(!is_current_live(false, 5, 5));
    }

    #[test]
    fn loopback_hosts_are_recognized() {
        for host in [
            "127.0.0.1",
            "localhost",
            "LOCALHOST",
            "::1",
            "[::1]",
            "127.0.0.2",
        ] {
            assert!(is_loopback_host(host), "{host}");
        }
        for host in ["0.0.0.0", "192.168.0.10", "::", "corneta.local", ""] {
            assert!(!is_loopback_host(host), "{host}");
        }
    }

    #[test]
    fn ingest_hostport_defaults() {
        assert_eq!(
            parse_ingest_hostport("rtmp://live.twitch.tv/app").unwrap(),
            ("live.twitch.tv".into(), 1935)
        );
        assert_eq!(
            parse_ingest_hostport("rtmps://x.live-video.net/app").unwrap(),
            ("x.live-video.net".into(), 443)
        );
        assert_eq!(
            parse_ingest_hostport("rtmp://host:1234/app").unwrap(),
            ("host".into(), 1234)
        );
        assert!(parse_ingest_hostport("rtmp:///app").is_err());
        assert_eq!(
            parse_ingest_hostport("rtmp://host:abc/app").unwrap(),
            ("host".into(), 1935)
        );
        assert_eq!(
            parse_ingest_hostport("rtmp://host:1234:5/app").unwrap(),
            ("host:1234".into(), 5)
        );
    }

    #[test]
    fn parses_mediamtx_path_video_codec_tracks() {
        use crate::platforms::VideoCodec;
        let body = r#"{
            "items": [
                {"name": "live/obs", "ready": true, "tracks": ["H265", "MPEG-4 Audio"]},
                {"name": "live/av1", "ready": true, "tracks": ["AV1", "MPEG-4 Audio"]},
                {"name": "live/h264", "ready": true, "tracks": ["H264"]}
            ]
        }"#;
        assert_eq!(
            parse_mediamtx_path_codec(body, "live/obs"),
            Some(VideoCodec::Hevc)
        );
        assert_eq!(
            parse_mediamtx_path_codec(body, "live/av1"),
            Some(VideoCodec::Av1)
        );
        assert_eq!(
            parse_mediamtx_path_codec(body, "live/h264"),
            Some(VideoCodec::H264)
        );
        assert_eq!(parse_mediamtx_path_codec(body, "live/missing"), None);
    }

    #[test]
    fn ignores_pre_keyframe_decoder_warnings_when_classifying_target_lines() {
        for line in [
            "[NULL @ 000001aec1d38bc0] Failed to read unit 2 (type 6): Invalid data found when processing input.",
            "[libdav1d @ 000001aec1d38bc0] Failed to parse temporal unit.",
            "[av1 @ 00000192158c8f80] Failed to read packet.",
            "[vist#0:0/av1 @ 00000192158c8c00] [dec:av1 @ 00000192135cb600] Error submitting packet to decoder: Invalid data found when processing input",
        ] {
            assert_eq!(classify_target_line(line), TargetLine::Ignore, "{line}");
        }
    }
}
