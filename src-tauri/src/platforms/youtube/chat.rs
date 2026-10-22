//! YouTube live chat: InnerTube polling without a key, the Data API with one, and live video lookup.

use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};
use tauri::AppHandle;

use crate::chat::{
    chat_status_gen, delete_message, delete_user, emit_alert, emit_chat_gen, emit_modes, emit_pin,
    emit_poll, next_id, now_ms, parse_amount, rich_text_frags, text_frag, Alert, ChatBadge,
    ChatFragment, ChatMessage, Poll, PollOption,
};
use crate::http_client as ureq;
use crate::i18n::{Locale, Msg};

/// YouTube has no threaded replies; viewers answer each other with a mention.
pub(crate) fn youtube_reply_text(author: &str, text: &str) -> String {
    let author = author.trim();
    if author.is_empty() {
        return text.to_string();
    }
    let handle = author.strip_prefix('@').unwrap_or(author);
    format!("@{handle} {text}")
}

/// Live video each YouTube chat source is reading, keyed by the configured channel value.
static YT_LIVE_VIDEOS: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();

fn remember_youtube_video(channel: &str, video_id: &str) {
    let mut videos = YT_LIVE_VIDEOS.get_or_init(Default::default).lock().unwrap();
    if videos.len() >= 32 && !videos.contains_key(channel.trim()) {
        videos.clear();
    }
    videos.insert(channel.trim().to_string(), video_id.to_string());
}

/// The live video last resolved for a YouTube chat source, if any.
pub(crate) fn youtube_live_video(channel: &str) -> Option<String> {
    YT_LIVE_VIDEOS
        .get()?
        .lock()
        .unwrap()
        .get(channel.trim())
        .cloned()
}

fn extract_video_id(input: &str) -> String {
    let s = input.trim();
    if let Some(i) = s.find("v=") {
        return s[i + 2..]
            .split(['&', '#'])
            .next()
            .unwrap_or("")
            .to_string();
    }
    for marker in ["youtu.be/", "/live/", "/shorts/", "/embed/"] {
        if let Some(i) = s.find(marker) {
            return s[i + marker.len()..]
                .split(['?', '&', '#', '/'])
                .next()
                .unwrap_or("")
                .to_string();
        }
    }
    s.to_string()
}

const BROWSER_UA: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

pub(crate) enum LiveResolve {
    Video(String),
    NotLive,
    ScrapeFailed,
}

fn direct_video_id(s: &str) -> Option<String> {
    let s = s.trim();
    if s.contains("watch?v=")
        || s.contains("youtu.be/")
        || s.contains("/shorts/")
        || s.contains("/embed/")
        || (s.contains("/live/") && !s.trim_end_matches('/').ends_with("/live"))
    {
        let v = extract_video_id(s);
        return (!v.is_empty()).then_some(v);
    }

    if !s.contains('/')
        && !s.starts_with('@')
        && s.len() == 11
        && s.bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
    {
        return Some(s.to_string());
    }
    None
}

fn youtube_live_url(input: &str) -> Option<String> {
    let s = input.trim().trim_end_matches('/');
    const BASE: &str = "https://www.youtube.com";
    for marker in ["/channel/", "/@", "/c/", "/user/"] {
        if let Some(i) = s.find(marker) {
            let seg = s[i + marker.len()..].split('/').next().unwrap_or("");
            if seg.is_empty() {
                return None;
            }
            return Some(format!("{BASE}/{}{seg}/live", &marker[1..]));
        }
    }
    if let Some(h) = s.strip_prefix('@') {
        return (!h.is_empty()).then(|| format!("{BASE}/@{h}/live"));
    }
    if s.starts_with("UC") && s.len() == 24 {
        return Some(format!("{BASE}/channel/{s}/live"));
    }
    if !s.is_empty() && !s.contains('/') && !s.contains('.') {
        return Some(format!("{BASE}/@{s}/live"));
    }
    None
}

fn live_video_from_html(html: &str) -> Option<String> {
    if !(html.contains("\"isLive\":true") || html.contains("\"isLiveNow\":true")) {
        return None;
    }
    let grab = |start: usize| -> Option<String> {
        let id: String = html[start..]
            .chars()
            .take_while(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-')
            .collect();
        (id.len() == 11).then_some(id)
    };

    if let Some(i) = html.find("rel=\"canonical\"") {
        if let Some(j) = html[i..].find("watch?v=") {
            if j < 220 {
                if let Some(id) = grab(i + j + 8) {
                    return Some(id);
                }
            }
        }
    }

    html.find("\"videoId\":\"").and_then(|i| grab(i + 11))
}

fn scrape_live(url: &str) -> LiveResolve {
    let body = match ureq::get(url)
        .set("User-Agent", BROWSER_UA)
        .set("Accept-Language", "en-US,en;q=0.9")
        .timeout(Duration::from_secs(8))
        .call()
    {
        Ok(r) => r.into_string().unwrap_or_default(),
        Err(_) => return LiveResolve::ScrapeFailed,
    };
    if let Some(vid) = live_video_from_html(&body) {
        return LiveResolve::Video(vid);
    }

    if body.contains("ytInitialData") || body.contains("\"videoId\"") {
        LiveResolve::NotLive
    } else {
        LiveResolve::ScrapeFailed
    }
}

/// A handle maps to the same channel for the whole session; a miss is retried after a while.
const CHANNEL_MISS_TTL: Duration = Duration::from_secs(6 * 3600);

/// search.list costs 100 units, so each channel is searched at most this often.
const LIVE_SEARCH_EVERY: Duration = Duration::from_secs(10 * 60);

const LOOKUP_CACHE_CAP: usize = 64;

type LookupCache<T> = Mutex<HashMap<String, (Instant, Option<T>)>>;

static YT_CHANNEL_IDS: OnceLock<LookupCache<String>> = OnceLock::new();

static YT_LIVE_SEARCHES: OnceLock<Mutex<HashMap<String, Instant>>> = OnceLock::new();

/// A cached answer still valid at `now`: hits last the session, misses expire after `miss_ttl`.
fn cached_answer<T: Clone>(
    entry: Option<&(Instant, Option<T>)>,
    miss_ttl: Duration,
    now: Instant,
) -> Option<Option<T>> {
    match entry {
        Some((_, Some(hit))) => Some(Some(hit.clone())),
        Some((at, None)) if now.saturating_duration_since(*at) < miss_ttl => Some(None),
        _ => None,
    }
}

fn due(last: Option<&Instant>, every: Duration, now: Instant) -> bool {
    last.is_none_or(|at| now.saturating_duration_since(*at) >= every)
}

fn channel_id_of(input: &str, api_key: &str) -> Option<String> {
    let s = input.trim();
    if let Some(i) = s.find("/channel/") {
        let id = s[i + 9..].split('/').next().unwrap_or("");
        if id.starts_with("UC") {
            return Some(id.to_string());
        }
    }
    if s.starts_with("UC") && s.len() == 24 {
        return Some(s.to_string());
    }
    let handle = if let Some(h) = s.strip_prefix('@') {
        h.to_string()
    } else if let Some(i) = s.find("/@") {
        s[i + 2..].split('/').next().unwrap_or("").to_string()
    } else if !s.contains('/') && !s.contains('.') {
        s.to_string()
    } else {
        return None;
    };
    if handle.is_empty() || api_key.trim().is_empty() {
        return None;
    }
    let cache_key = handle.to_lowercase();
    let cache = YT_CHANNEL_IDS.get_or_init(Default::default);
    if let Some(answer) = cached_answer(
        cache.lock().unwrap().get(&cache_key),
        CHANNEL_MISS_TTL,
        Instant::now(),
    ) {
        return answer;
    }
    let url = format!(
        "https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=@{handle}&key={api_key}"
    );
    // Failed requests are not cached; only an answer from YouTube is.
    let body = ureq::get(&url)
        .timeout(Duration::from_secs(6))
        .call()
        .ok()?
        .into_string()
        .ok()?;
    let v: Value = serde_json::from_str(&body).ok()?;
    let id = v
        .pointer("/items/0/id")
        .and_then(|x| x.as_str())
        .map(String::from);
    let mut ids = cache.lock().unwrap();
    if ids.len() >= LOOKUP_CACHE_CAP {
        ids.clear();
    }
    ids.insert(cache_key, (Instant::now(), id.clone()));
    id
}

// Reserve quota-consuming search.list for page-resolution failures, not offline channels.
fn search_live_video_id(channel_id: &str, api_key: &str) -> Option<String> {
    if api_key.trim().is_empty() {
        return None;
    }
    {
        let now = Instant::now();
        let mut searches = YT_LIVE_SEARCHES
            .get_or_init(Default::default)
            .lock()
            .unwrap();
        if !due(searches.get(channel_id), LIVE_SEARCH_EVERY, now) {
            return None;
        }
        if searches.len() >= LOOKUP_CACHE_CAP {
            searches.clear();
        }
        searches.insert(channel_id.to_string(), now);
    }
    let url = format!(
        "https://www.googleapis.com/youtube/v3/search?part=id&channelId={channel_id}&eventType=live&type=video&key={api_key}"
    );
    let body = ureq::get(&url)
        .timeout(Duration::from_secs(8))
        .call()
        .ok()?
        .into_string()
        .ok()?;
    let v: Value = serde_json::from_str(&body).ok()?;
    v.pointer("/items/0/id/videoId")
        .and_then(|x| x.as_str())
        .map(String::from)
}

pub fn check_youtube_key(key: &str) -> Result<String, String> {
    let key = key.trim();
    if key.is_empty() {
        return Err(Msg::YoutubeKeyPasteFirst.now());
    }
    // Keep the existing provider response locale; changing it also changes raw API error copy.

    let url =
        format!("https://www.googleapis.com/youtube/v3/i18nLanguages?part=snippet&hl=pt&key={key}");
    match ureq::get(&url).timeout(Duration::from_secs(10)).call() {
        Ok(_) => Ok(Msg::YoutubeKeyValid.now()),
        Err(ureq::Error::Status(code, r)) => {
            let body = r.into_string().unwrap_or_default();
            let v: Value = serde_json::from_str(&body).unwrap_or(Value::Null);
            let reason = v
                .pointer("/error/errors/0/reason")
                .and_then(|x| x.as_str())
                .unwrap_or("");
            let status = v
                .pointer("/error/status")
                .and_then(|x| x.as_str())
                .unwrap_or("");
            let msg = v
                .pointer("/error/message")
                .and_then(|x| x.as_str())
                .unwrap_or("");
            Err(match reason {
                "keyInvalid" | "badRequest" => Msg::YoutubeKeyInvalid.now(),
                "accessNotConfigured" => Msg::YoutubeKeyApiNotEnabled.now(),
                "ipRefererBlocked" | "forbidden" => Msg::YoutubeKeyRestricted.now(),
                // Exhausted quota still proves the key is valid.
                "quotaExceeded" | "dailyLimitExceeded" | "rateLimitExceeded" => {
                    return Ok(Msg::YoutubeKeyValidQuotaMaxed.now())
                }
                _ if status == "PERMISSION_DENIED" => Msg::YoutubeKeyApiNotEnabled.now(),
                _ if !msg.is_empty() => Msg::YoutubeKeyApiError { code, msg }.now(),
                _ => Msg::YoutubeKeyApiStatus { code }.now(),
            })
        }
        Err(_) => Err(Msg::YoutubeKeyNoConnection.now()),
    }
}

pub(crate) fn resolve_youtube_video(input: &str, api_key: &str) -> LiveResolve {
    if let Some(vid) = direct_video_id(input) {
        return LiveResolve::Video(vid);
    }
    let Some(url) = youtube_live_url(input) else {
        return LiveResolve::NotLive;
    };
    match scrape_live(&url) {
        LiveResolve::Video(v) => LiveResolve::Video(v),
        LiveResolve::NotLive => LiveResolve::NotLive,
        LiveResolve::ScrapeFailed => {
            if let Some(cid) = channel_id_of(input, api_key) {
                if let Some(v) = search_live_video_id(&cid, api_key) {
                    return LiveResolve::Video(v);
                }
            }
            LiveResolve::NotLive
        }
    }
}

fn get_live_chat_id(api_key: &str, video_id: &str) -> Option<String> {
    let url = format!(
        "https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id={video_id}&key={api_key}"
    );
    let body = ureq::get(&url)
        .timeout(Duration::from_secs(8))
        .call()
        .ok()?
        .into_string()
        .ok()?;
    let json: Value = serde_json::from_str(&body).ok()?;
    json.pointer("/items/0/liveStreamingDetails/activeLiveChatId")
        .and_then(|v| v.as_str())
        .map(String::from)
}

fn yt_author(item: &Value, locale: Locale) -> String {
    item.pointer("/authorDetails/displayName")
        .and_then(|v| v.as_str())
        .map(String::from)
        .unwrap_or_else(|| Msg::ChatUnknownUser.text(locale))
}

/// Identity and clock for one parsed YouTube item; tests inject fixed values.
struct YtStamp {
    id: String,
    ts: u64,
}

impl YtStamp {
    fn now() -> Self {
        Self {
            id: next_id(),
            ts: now_ms(),
        }
    }
}

/// What one YouTube item means, decided without side effects.
#[derive(Debug)]
enum YtEvent {
    Chat(ChatMessage),
    Alert(Alert),
    DeleteMessage(String),
    DeleteUser {
        author: String,
        author_id: Option<String>,
        seconds: Option<u64>,
    },
    /// A banner (pinned message, question) and the action ID that later removes it.
    Pin {
        action_id: String,
        message: ChatMessage,
    },
    Unpin(String),
    Poll(Poll),
    PollClosed(String),
    Modes(Value),
}

fn yt_alert(stamp: YtStamp, source: &str, kind: &str, user: String) -> Alert {
    Alert {
        id: stamp.id,
        platform: "youtube".into(),
        source: source.to_string(),
        kind: kind.into(),
        user,
        ts: stamp.ts,
        ..Default::default()
    }
}

/// Per-connection state: the banner and poll on screen, and Data API items already shown.
#[derive(Default)]
struct YtFeed {
    pin: Option<String>,
    poll: Option<String>,
    seen: std::collections::HashSet<String>,
}

fn dispatch_yt(app: &AppHandle, gen: u64, source: &str, feed: &mut YtFeed, event: YtEvent) {
    match event {
        YtEvent::Chat(message) => emit_chat_gen(app, gen, message),
        YtEvent::Alert(alert) => emit_alert(app, alert),
        YtEvent::DeleteMessage(id) => delete_message(app, "youtube", &id),
        YtEvent::DeleteUser {
            author,
            author_id,
            seconds,
        } => delete_user(
            app,
            "youtube",
            source,
            &author,
            author_id.as_deref(),
            seconds,
        ),
        YtEvent::Pin { action_id, message } => {
            feed.pin = Some(action_id);
            emit_pin(app, gen, "youtube", source, Some(message));
        }
        YtEvent::Unpin(action_id) => {
            if feed.pin.as_deref() == Some(action_id.as_str()) {
                feed.pin = None;
                emit_pin(app, gen, "youtube", source, None);
            }
        }
        YtEvent::Poll(poll) => {
            feed.poll = Some(poll.id.clone());
            emit_poll(app, gen, "youtube", source, Some(poll));
        }
        YtEvent::PollClosed(id) => {
            if feed.poll.as_deref() == Some(id.as_str()) || id.is_empty() {
                feed.poll = None;
                emit_poll(app, gen, "youtube", source, None);
            }
        }
        YtEvent::Modes(modes) => emit_modes(app, gen, "youtube", source, modes),
    }
}

/// Classic text (`runs` or `simpleText`) and view-model text (`content`).
fn yt_plain(text: Option<&Value>) -> String {
    let Some(text) = text else {
        return String::new();
    };
    if let Some(content) = text.get("content").and_then(Value::as_str) {
        return content.trim().to_string();
    }
    if let Some(simple) = text.get("simpleText").and_then(Value::as_str) {
        return simple.to_string();
    }
    text.get("runs")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|run| {
            run.get("text")
                .and_then(Value::as_str)
                .or_else(|| run.pointer("/emoji/emojiId").and_then(Value::as_str))
        })
        .collect()
}

/// Thumbnails come as `thumbnails` or `sources`, sometimes protocol-relative; the largest wins.
fn yt_image(image: Option<&Value>) -> Option<String> {
    let image = image?;
    let list = image
        .get("thumbnails")
        .or_else(|| image.get("sources"))?
        .as_array()?;
    let best = list
        .iter()
        .filter_map(|t| {
            let url = t.get("url")?.as_str()?;
            Some((t.get("width").and_then(Value::as_u64).unwrap_or(0), url))
        })
        .max_by_key(|(width, _)| *width)
        .or_else(|| list.last().and_then(|t| Some((0, t.get("url")?.as_str()?))))?
        .1;
    let url = match best.strip_prefix("//") {
        Some(rest) => format!("https://{rest}"),
        None => best.to_string(),
    };
    url.starts_with("https://").then_some(url)
}

/// YouTube wraps outbound links in a redirect; the target sits in its `q` parameter.
fn yt_link_target(run: &Value) -> Option<String> {
    let url = run
        .pointer("/navigationEndpoint/urlEndpoint/url")
        .or_else(|| run.pointer("/navigationEndpoint/commandMetadata/webCommandMetadata/url"))?
        .as_str()?;
    let url = if url.starts_with('/') {
        format!("https://www.youtube.com{url}")
    } else {
        url.to_string()
    };
    if url.contains("youtube.com/redirect") {
        let query = url.split_once('?')?.1;
        let target = query
            .split('&')
            .find_map(|kv| kv.strip_prefix("q="))
            .map(percent_decode)?;
        return (target.starts_with("https://") || target.starts_with("http://")).then_some(target);
    }
    url.starts_with("https://").then_some(url)
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let hex = |b: u8| (b as char).to_digit(16).map(|d| d as u8);
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' if i + 2 < bytes.len() => match (hex(bytes[i + 1]), hex(bytes[i + 2])) {
                (Some(hi), Some(lo)) => {
                    out.push(hi * 16 + lo);
                    i += 3;
                }
                _ => {
                    out.push(b'%');
                    i += 1;
                }
            },
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b => {
                out.push(b);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn yt_message_fragments(message: &Value) -> (String, Vec<ChatFragment>) {
    let mut text = String::new();
    let mut frags = vec![];
    if let Some(runs) = message.get("runs").and_then(Value::as_array) {
        for run in runs {
            if let Some(t) = run.get("text").and_then(Value::as_str) {
                text.push_str(t);
                match yt_link_target(run) {
                    Some(url) => frags.push(ChatFragment {
                        kind: "link".into(),
                        text: Some(t.to_string()),
                        url: Some(url),
                        ..Default::default()
                    }),
                    None => frags.extend(rich_text_frags(t)),
                }
            } else if let Some(emoji) = run.get("emoji") {
                // Channel emoji IDs look like "UC…/id"; standard ones are the emoji itself.
                let custom = emoji.get("isCustomEmoji").and_then(Value::as_bool) == Some(true)
                    || emoji
                        .get("emojiId")
                        .and_then(Value::as_str)
                        .is_some_and(|id| id.contains('/'));
                // Standard emoji keep their character; channel emojis use their shortcut or label.
                let label = if custom {
                    [
                        "/shortcuts/0",
                        "/searchTerms/0",
                        "/image/accessibility/accessibilityData/label",
                        "/emojiId",
                    ]
                    .iter()
                    .find_map(|path| emoji.pointer(path).and_then(Value::as_str))
                } else {
                    [
                        "/emojiId",
                        "/image/accessibility/accessibilityData/label",
                        "/shortcuts/0",
                        "/searchTerms/0",
                    ]
                    .iter()
                    .find_map(|path| emoji.pointer(path).and_then(Value::as_str))
                }
                .unwrap_or("");
                text.push_str(label);
                match yt_image(emoji.get("image")) {
                    Some(url) => frags.push(ChatFragment {
                        kind: "emote".into(),
                        text: Some(label.to_string()),
                        url: Some(url),
                        ..Default::default()
                    }),
                    None => frags.push(text_frag(label)),
                }
            }
        }
    } else if let Some(s) = message
        .get("simpleText")
        .or_else(|| message.get("content"))
        .and_then(Value::as_str)
    {
        text.push_str(s);
        frags.extend(rich_text_frags(s));
    }
    (text, frags)
}

fn yt_innertube_badges(renderer: &Value, locale: Locale) -> Vec<ChatBadge> {
    let mut out = vec![];
    for b in renderer
        .get("authorBadges")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        let Some(r) = b.get("liveChatAuthorBadgeRenderer") else {
            continue;
        };
        let title = r.get("tooltip").and_then(Value::as_str).map(String::from);
        let badge = |label: String, kind: &str, url: Option<String>| ChatBadge {
            label,
            kind: kind.into(),
            url,
            title: title.clone(),
        };
        match r.pointer("/icon/iconType").and_then(Value::as_str) {
            Some("OWNER") => out.push(badge("HOST".into(), "broadcaster", None)),
            Some("MODERATOR") => out.push(badge("MOD".into(), "moderator", None)),
            Some("VERIFIED") => out.push(badge("✓".into(), "verified", None)),
            _ => {
                if let Some(url) = yt_image(r.get("customThumbnail")) {
                    out.push(badge(
                        Msg::ChatBadgeMember.text(locale),
                        "subscriber",
                        Some(url),
                    ));
                }
            }
        }
    }
    // Top fans leaderboard rank, such as "#1".
    if let Some(rank) = renderer
        .pointer("/beforeContentButtons/0/buttonViewModel/title")
        .or_else(|| renderer.pointer("/leaderboardBadge/buttonViewModel/title"))
        .and_then(Value::as_str)
        .filter(|r| r.starts_with('#'))
    {
        out.insert(
            0,
            ChatBadge {
                label: rank.to_string(),
                kind: "rank".into(),
                ..Default::default()
            },
        );
    }
    out
}

fn handle_innertube_action(
    app: &AppHandle,
    source: &str,
    action: &Value,
    gen: u64,
    feed: &mut YtFeed,
    backlog: bool,
) {
    if let Some(event) =
        parse_innertube_action(source, action, YtStamp::now(), crate::i18n::locale())
    {
        // The first page replays recent chat; only what is still on screen (pins, polls) counts.
        if backlog
            && !matches!(
                event,
                YtEvent::Pin { .. } | YtEvent::Unpin(_) | YtEvent::Poll(_) | YtEvent::PollClosed(_)
            )
        {
            return;
        }
        dispatch_yt(app, gen, source, feed, event);
    }
}

fn yt_poll(renderer: &Value) -> Option<Poll> {
    let id = renderer
        .get("liveChatPollId")
        .and_then(Value::as_str)?
        .to_string();
    let question = yt_plain(renderer.pointer("/header/pollHeaderRenderer/pollQuestion"));
    let options = renderer
        .get("choices")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .map(|choice| PollOption {
            label: yt_plain(choice.get("text")),
            votes: None,
            percent: choice
                .get("voteRatio")
                .and_then(Value::as_f64)
                .map(|r| (r * 100.0).clamp(0.0, 100.0))
                .or_else(|| {
                    yt_plain(choice.get("votePercentage"))
                        .trim_end_matches('%')
                        .trim()
                        .replace(',', ".")
                        .parse()
                        .ok()
                }),
        })
        .collect();
    Some(Poll {
        id,
        kind: "poll".into(),
        question,
        options,
        total: None,
        ended: false,
    })
}

fn parse_innertube_action(
    source: &str,
    action: &Value,
    stamp: YtStamp,
    locale: Locale,
) -> Option<YtEvent> {
    for path in [
        "/markChatItemAsDeletedAction/targetItemId",
        "/removeChatItemAction/targetItemId",
    ] {
        if let Some(id) = action.pointer(path).and_then(Value::as_str) {
            return Some(YtEvent::DeleteMessage(id.to_string()));
        }
    }
    for path in [
        "/markChatItemsByAuthorAsDeletedAction/externalChannelId",
        "/removeChatItemByAuthorAction/externalChannelId",
    ] {
        if let Some(id) = action.pointer(path).and_then(Value::as_str) {
            return Some(YtEvent::DeleteUser {
                author: String::new(),
                author_id: Some(id.to_string()),
                seconds: None,
            });
        }
    }
    if let Some(banner) =
        action.pointer("/addBannerToLiveChatCommand/bannerRenderer/liveChatBannerRenderer")
    {
        return yt_banner(source, banner, stamp, locale);
    }
    if let Some(id) = action
        .pointer("/removeBannerForLiveChatCommand/targetActionId")
        .and_then(Value::as_str)
    {
        return Some(YtEvent::Unpin(id.to_string()));
    }
    if let Some(poll) = action
        .pointer("/showLiveChatActionPanelAction/panelToShow/liveChatActionPanelRenderer/contents/pollRenderer")
        .or_else(|| action.pointer("/updateLiveChatPollAction/pollToUpdate/pollRenderer"))
    {
        return yt_poll(poll).map(YtEvent::Poll);
    }
    if let Some(close) = action.get("closeLiveChatActionPanelAction") {
        return Some(YtEvent::PollClosed(
            close
                .get("targetPanelId")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string(),
        ));
    }
    // A placeholder slot filled later is handled as the item that replaces it.
    let item = action
        .pointer("/addChatItemAction/item")
        .or_else(|| action.pointer("/replaceChatItemAction/replacementItem"))?;
    yt_item(source, item, stamp, locale)
}

fn author_of(r: &Value, locale: Locale) -> String {
    let name = yt_plain(r.get("authorName"));
    if name.is_empty() {
        Msg::ChatUnknownUser.text(locale)
    } else {
        name
    }
}

fn yt_text_message(r: &Value, stamp: YtStamp, source: &str, locale: Locale) -> Option<ChatMessage> {
    let (text, fragments) = yt_message_fragments(r.get("message").unwrap_or(&Value::Null));
    if fragments.is_empty() {
        return None;
    }
    Some(ChatMessage {
        id: stamp.id,
        platform: "youtube".into(),
        source: source.to_string(),
        author: author_of(r, locale),
        author_id: r
            .get("authorExternalChannelId")
            .and_then(Value::as_str)
            .map(String::from),
        native_id: r.get("id").and_then(Value::as_str).map(String::from),
        fragments,
        badges: yt_innertube_badges(r, locale),
        text,
        ts: stamp.ts,
        ..Default::default()
    })
}

fn yt_system(source: &str, stamp: YtStamp, author: String, text: String) -> Option<YtEvent> {
    let text = text.trim().to_string();
    (!text.is_empty()).then(|| {
        YtEvent::Chat(ChatMessage {
            id: stamp.id,
            platform: "youtube".into(),
            source: source.to_string(),
            author,
            fragments: rich_text_frags(&text),
            text,
            ts: stamp.ts,
            system: true,
            ..Default::default()
        })
    })
}

fn yt_banner(source: &str, banner: &Value, stamp: YtStamp, locale: Locale) -> Option<YtEvent> {
    let action_id = banner
        .get("actionId")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let contents = banner.get("contents")?;
    if let Some(r) = contents.get("liveChatTextMessageRenderer") {
        let mut message = yt_text_message(r, stamp, source, locale)?;
        message.highlight = Some("pinned".into());
        message.note = Some(yt_plain(
            banner.pointer("/header/liveChatBannerHeaderRenderer/text"),
        ))
        .filter(|n| !n.is_empty());
        return Some(YtEvent::Pin { action_id, message });
    }
    if let Some(r) = contents.get("liveChatCallForQuestionsRenderer") {
        let (text, fragments) =
            yt_message_fragments(r.get("questionMessage").unwrap_or(&Value::Null));
        let message = ChatMessage {
            id: stamp.id,
            platform: "youtube".into(),
            source: source.to_string(),
            author: yt_plain(r.get("creatorAuthorName")),
            fragments,
            text,
            ts: stamp.ts,
            highlight: Some("pinned".into()),
            note: Some(yt_plain(r.get("featureLabel"))).filter(|n| !n.is_empty()),
            ..Default::default()
        };
        return Some(YtEvent::Pin { action_id, message });
    }
    if let Some(r) = contents.get("liveChatBannerRedirectRenderer") {
        let text = yt_plain(r.get("bannerMessage"));
        // An incoming raid names the channel whose viewers arrived.
        if r.pointer("/inlineActionButton/buttonRenderer/command/urlEndpoint")
            .is_some()
            || r.pointer("/inlineActionButton/buttonRenderer/navigationEndpoint/urlEndpoint")
                .is_some()
        {
            let raider = r
                .pointer("/bannerMessage/runs")
                .and_then(Value::as_array)
                .and_then(|runs| {
                    runs.iter()
                        .find(|run| run.get("bold").and_then(Value::as_bool) == Some(true))
                })
                .and_then(|run| run.get("text").and_then(Value::as_str))
                .unwrap_or("")
                .trim()
                .to_string();
            if !raider.is_empty() {
                return Some(YtEvent::Alert(Alert {
                    message: Some(text),
                    ..yt_alert(stamp, source, "raid", raider)
                }));
            }
        }
        return yt_system(source, stamp, String::new(), text);
    }
    if let Some(r) = contents.get("liveChatBannerChatSummaryRenderer") {
        return yt_system(source, stamp, String::new(), yt_plain(r.get("chatSummary")));
    }
    None
}

/// Amount text is localized ("R$ 10,00", "$5.00", "€2,50"); the symbol hints the currency.
fn yt_currency(amount_text: &str) -> Option<String> {
    let t = amount_text.trim();
    let code = [
        ("R$", "BRL"),
        ("US$", "USD"),
        ("CA$", "CAD"),
        ("A$", "AUD"),
        ("MX$", "MXN"),
        ("NZ$", "NZD"),
        ("€", "EUR"),
        ("£", "GBP"),
        ("¥", "JPY"),
        ("₩", "KRW"),
        ("₹", "INR"),
        ("₱", "PHP"),
        ("$", "USD"),
    ]
    .iter()
    .find(|(symbol, _)| t.starts_with(symbol) || t.ends_with(symbol))
    .map(|(_, code)| code.to_string());
    code.or_else(|| {
        let letters: String = t.chars().take_while(|c| c.is_ascii_uppercase()).collect();
        (letters.len() == 3).then_some(letters)
    })
}

fn yt_item(source: &str, item: &Value, stamp: YtStamp, locale: Locale) -> Option<YtEvent> {
    if let Some(r) = item.get("liveChatTextMessageRenderer") {
        return yt_text_message(r, stamp, source, locale).map(YtEvent::Chat);
    }
    if let Some(r) = item.get("liveChatPaidMessageRenderer") {
        let amount_text = yt_plain(r.get("purchaseAmountText"));
        let (message, fragments) = yt_message_fragments(r.get("message").unwrap_or(&Value::Null));
        return Some(YtEvent::Alert(Alert {
            amount: parse_amount(&amount_text),
            currency: yt_currency(&amount_text),
            message: Some(message).filter(|m| !m.is_empty()),
            fragments,
            title: Some(amount_text).filter(|a| !a.is_empty()),
            ..yt_alert(stamp, source, "superchat", author_of(r, locale))
        }));
    }
    if let Some(r) = item.get("liveChatPaidStickerRenderer") {
        let amount_text = yt_plain(r.get("purchaseAmountText"));
        return Some(YtEvent::Alert(Alert {
            amount: parse_amount(&amount_text),
            currency: yt_currency(&amount_text),
            image: yt_image(r.get("sticker")),
            title: r
                .pointer("/sticker/accessibility/accessibilityData/label")
                .and_then(Value::as_str)
                .map(String::from)
                .or(Some(amount_text).filter(|a| !a.is_empty())),
            ..yt_alert(stamp, source, "superchat", author_of(r, locale))
        }));
    }
    if let Some(r) = item.get("liveChatMembershipItemRenderer") {
        let (message, fragments) = yt_message_fragments(r.get("message").unwrap_or(&Value::Null));
        let headline = yt_plain(r.get("headerPrimaryText"));
        // A milestone ("Member for 27 months") carries the months; a new member, the level.
        let months: Option<f64> = (!headline.is_empty())
            .then(|| {
                headline
                    .split(|c: char| !c.is_ascii_digit())
                    .find(|n| !n.is_empty())
                    .and_then(|n| n.parse().ok())
            })
            .flatten();
        let subtext = r.get("headerSubtext");
        let level = subtext
            .and_then(|s| s.get("runs"))
            .and_then(Value::as_array)
            .filter(|runs| runs.len() >= 3)
            .and_then(|runs| runs[1].get("text").and_then(Value::as_str))
            .map(String::from)
            .or_else(|| Some(yt_plain(subtext)).filter(|s| !s.is_empty()));
        return Some(YtEvent::Alert(Alert {
            amount: months,
            tier: level,
            message: Some(message).filter(|m| !m.is_empty()),
            fragments,
            title: Some(if headline.is_empty() {
                yt_plain(subtext)
            } else {
                headline
            })
            .filter(|t| !t.is_empty()),
            ..yt_alert(stamp, source, "member", author_of(r, locale))
        }));
    }
    if let Some(r) = item.get("liveChatSponsorshipsGiftPurchaseAnnouncementRenderer") {
        let header = r.pointer("/header/liveChatSponsorshipsHeaderRenderer");
        let author = header
            .map(|h| author_of(h, locale))
            .unwrap_or_else(|| Msg::ChatUnknownUser.text(locale));
        let primary = header.and_then(|h| h.get("primaryText"));
        let count = primary
            .and_then(|p| p.get("runs"))
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(|run| run.get("text").and_then(Value::as_str))
            .find_map(|t| t.trim().parse::<f64>().ok());
        return Some(YtEvent::Alert(Alert {
            amount: count.or(Some(1.0)),
            message: Some(yt_plain(primary)).filter(|t| !t.is_empty()),
            image: header.and_then(|h| yt_image(h.get("image"))),
            ..yt_alert(stamp, source, "subgift", author)
        }));
    }
    // The recipient side of a gift; the purchase was already counted.
    if let Some(r) = item.get("liveChatSponsorshipsGiftRedemptionAnnouncementRenderer") {
        let author = author_of(r, locale);
        let text = format!("{author} {}", yt_plain(r.get("message")));
        return yt_system(source, stamp, author, text);
    }
    if let Some(r) = item.get("giftMessageViewModel") {
        let user = yt_plain(r.get("authorName"));
        let text = yt_plain(r.get("text"));
        return Some(YtEvent::Alert(Alert {
            title: r
                .get("giftImageA11yLabel")
                .and_then(Value::as_str)
                .and_then(|label| label.rsplit(", ").next())
                .map(String::from),
            message: Some(text).filter(|t| !t.is_empty()),
            image: yt_image(r.get("giftImage")),
            ..yt_alert(
                stamp,
                source,
                "gift",
                if user.is_empty() {
                    Msg::ChatUnknownUser.text(locale)
                } else {
                    user
                },
            )
        }));
    }
    if let Some(r) = item.get("liveChatModeChangeMessageRenderer") {
        let text = [yt_plain(r.get("text")), yt_plain(r.get("subtext"))]
            .into_iter()
            .filter(|t| !t.is_empty())
            .collect::<Vec<_>>()
            .join(" — ");
        return yt_system(source, stamp, String::new(), text);
    }
    // Poll results; the welcome and privacy reminders are not chat.
    if let Some(r) = item.get("liveChatViewerEngagementMessageRenderer") {
        if r.pointer("/icon/iconType").and_then(Value::as_str) == Some("POLL") {
            return yt_system(source, stamp, String::new(), yt_plain(r.get("message")));
        }
        return None;
    }
    None
}

/// Super Sticker art by sticker ID, from the CSV the Data API documents.
fn sticker_url(sticker_id: &str) -> Option<String> {
    static STICKERS: OnceLock<HashMap<String, String>> = OnceLock::new();
    STICKERS
        .get_or_init(|| {
            ureq::get("https://youtube.googleapis.com/super_stickers/sticker_ids_to_urls.csv")
                .timeout(Duration::from_secs(8))
                .call()
                .ok()
                .and_then(|r| r.into_string().ok())
                .map(|csv| {
                    csv.lines()
                        .filter_map(|line| {
                            let (id, url) = line.split_once(',')?;
                            let url = url.trim().trim_matches('"');
                            let url = match url.strip_prefix("//") {
                                Some(rest) => format!("https://{rest}"),
                                None => url.to_string(),
                            };
                            url.starts_with("https://")
                                .then(|| (id.trim().trim_matches('"').to_string(), url))
                        })
                        .collect()
                })
                .unwrap_or_default()
        })
        .get(sticker_id)
        .cloned()
}

// InnerTube is an undocumented browser endpoint and may change independently of the Data API.

// Parse only the JSON value after marker, ignoring trailing JavaScript.
fn json_after(html: &str, marker: &str) -> Option<Value> {
    let i = html.find(marker)? + marker.len();
    serde_json::Deserializer::from_str(&html[i..])
        .into_iter::<Value>()
        .next()?
        .ok()
}

fn find_between(s: &str, start: &str, end: &str) -> Option<String> {
    let i = s.find(start)? + start.len();
    let j = s[i..].find(end)?;
    Some(s[i..i + j].to_string())
}

fn continuation_token(c: &Value) -> Option<String> {
    for path in [
        "/invalidationContinuationData/continuation",
        "/timedContinuationData/continuation",
        "/reloadContinuationData/continuation",
    ] {
        if let Some(s) = c.pointer(path).and_then(|v| v.as_str()) {
            return Some(s.to_string());
        }
    }
    None
}

/// Returns the public browser API key, client version, and initial continuation.
/// YouTube writes its own chat notices (mode changes, pins, poll results) in the requested language.
fn youtube_language() -> (&'static str, &'static str) {
    match crate::i18n::locale() {
        Locale::PtBr => ("pt-BR", "pt-BR,pt;q=0.9"),
        Locale::En => ("en", "en-US,en;q=0.9"),
    }
}

fn innertube_bootstrap(video_id: &str) -> Option<(String, String, String)> {
    let url = format!("https://www.youtube.com/live_chat?is_popout=1&v={video_id}");
    let html = ureq::get(&url)
        .set("User-Agent", BROWSER_UA)
        .set("Accept-Language", youtube_language().1)
        .timeout(Duration::from_secs(8))
        .call()
        .ok()?
        .into_string()
        .ok()?;
    let key = find_between(&html, "\"INNERTUBE_API_KEY\":\"", "\"")?;
    let version = find_between(&html, "\"INNERTUBE_CONTEXT_CLIENT_VERSION\":\"", "\"")
        .or_else(|| find_between(&html, "\"clientVersion\":\"", "\""))?;
    let yt = json_after(&html, "ytInitialData = ")
        .or_else(|| json_after(&html, "window[\"ytInitialData\"] = "))?;
    let cont = yt
        .pointer("/contents/liveChatRenderer/continuations")?
        .as_array()?
        .iter()
        .find_map(continuation_token)?;
    Some((key, version, cont))
}

fn innertube_poll(key: &str, version: &str, cont: &str) -> Option<Value> {
    let url = format!(
        "https://www.youtube.com/youtubei/v1/live_chat/get_live_chat?key={key}&prettyPrint=false"
    );
    let body = json!({
        "context": { "client": { "clientName": "WEB", "clientVersion": version, "hl": youtube_language().0 } },
        "continuation": cont,
    });
    let txt = ureq::post(&url)
        .set("User-Agent", BROWSER_UA)
        .set("Content-Type", "application/json")
        .timeout(Duration::from_secs(10))
        .send_string(&body.to_string())
        .ok()?
        .into_string()
        .ok()?;
    let v: Value = serde_json::from_str(&txt).ok()?;
    v.pointer("/continuationContents/liveChatContinuation")
        .cloned()
}

/// False permits a Data API fallback only when InnerTube could not initialize.
fn youtube_innertube(
    video_id: &str,
    source: &str,
    running: &Arc<AtomicBool>,
    app: &AppHandle,
    gen: u64,
) -> bool {
    let Some((key, version, mut cont)) = innertube_bootstrap(video_id) else {
        return false;
    };
    log::info!("youtube chat: InnerTube connected");
    chat_status_gen(app, gen, "youtube", source, "connected");
    let mut feed = YtFeed::default();
    let mut first = true;
    let mut errors = 0u32;
    while running.load(Ordering::Relaxed) {
        let lcc = match innertube_poll(&key, &version, &cont) {
            Some(v) => {
                errors = 0;
                v
            }
            None => {
                errors += 1;
                if errors >= 3 {
                    break;
                }
                thread::sleep(Duration::from_secs(4));
                continue;
            }
        };
        if let Some(actions) = lcc.get("actions").and_then(|a| a.as_array()) {
            for action in actions {
                handle_innertube_action(app, source, action, gen, &mut feed, first);
            }
        }
        first = false;
        let Some(next) = lcc.pointer("/continuations/0").and_then(continuation_token) else {
            break;
        };
        cont = next;
        let timeout = lcc
            .pointer("/continuations/0/invalidationContinuationData/timeoutMs")
            .or_else(|| lcc.pointer("/continuations/0/timedContinuationData/timeoutMs"))
            .and_then(|v| v.as_u64())
            .unwrap_or(2000)
            .clamp(1000, 5000);
        let mut slept = 0u64;
        while running.load(Ordering::Relaxed) && slept < timeout {
            thread::sleep(Duration::from_millis(200));
            slept += 200;
        }
    }
    chat_status_gen(app, gen, "youtube", source, "disconnected");
    true
}

/// True means the connection succeeded at least once, allowing the supervisor to reset backoff.
pub(crate) fn run_youtube(
    api_key: &str,
    channel: &str,
    source: &str,
    running: Arc<AtomicBool>,
    app: AppHandle,
    gen: u64,
) -> bool {
    let vid = match resolve_youtube_video(channel, api_key) {
        LiveResolve::Video(v) => v,
        _ => {
            chat_status_gen(&app, gen, "youtube", source, "waiting");
            return false;
        }
    };
    remember_youtube_video(channel, &vid);

    if youtube_innertube(&vid, source, &running, &app, gen) {
        return true;
    }

    if api_key.trim().is_empty() {
        chat_status_gen(&app, gen, "youtube", source, "waiting");
        return false;
    }
    youtube_dataapi(api_key, &vid, source, running, app, gen)
}

fn parse_dataapi_item(
    source: &str,
    item: &Value,
    stamp: YtStamp,
    locale: Locale,
) -> Option<YtEvent> {
    let text_at = |path: &str| {
        item.pointer(path)
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
            .map(String::from)
    };
    let micros_at = |path: &str| {
        item.pointer(path)
            .and_then(Value::as_str)
            .and_then(|s| s.parse::<f64>().ok())
            .map(|m| m / 1_000_000.0)
    };
    let count_at = |path: &str| {
        item.pointer(path).and_then(|v| {
            v.as_u64()
                .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
                .map(|n| n as f64)
        })
    };
    let with_comment = |alert: Alert, path: &str| {
        let comment = text_at(path);
        Alert {
            fragments: comment.as_deref().map(rich_text_frags).unwrap_or_default(),
            message: comment,
            ..alert
        }
    };
    let kind = item
        .pointer("/snippet/type")
        .and_then(Value::as_str)
        .unwrap_or("textMessageEvent");
    match kind {
        "messageDeletedEvent" => {
            text_at("/snippet/messageDeletedDetails/deletedMessageId").map(YtEvent::DeleteMessage)
        }
        "userBannedEvent" => Some(YtEvent::DeleteUser {
            author: text_at("/snippet/userBannedDetails/bannedUserDetails/displayName")
                .unwrap_or_default(),
            author_id: text_at("/snippet/userBannedDetails/bannedUserDetails/channelId"),
            seconds: count_at("/snippet/userBannedDetails/banDurationSeconds").map(|s| s as u64),
        })
        .filter(|e| !matches!(e, YtEvent::DeleteUser { author, author_id: None, .. } if author.is_empty())),
        "superChatEvent" => Some(YtEvent::Alert(with_comment(
            Alert {
                amount: micros_at("/snippet/superChatDetails/amountMicros"),
                currency: text_at("/snippet/superChatDetails/currency"),
                title: text_at("/snippet/superChatDetails/amountDisplayString"),
                ..yt_alert(stamp, source, "superchat", yt_author(item, locale))
            },
            "/snippet/superChatDetails/userComment",
        ))),
        "superStickerEvent" => Some(YtEvent::Alert(Alert {
            amount: micros_at("/snippet/superStickerDetails/amountMicros"),
            currency: text_at("/snippet/superStickerDetails/currency"),
            title: text_at("/snippet/superStickerDetails/superStickerMetadata/altText"),
            image: text_at("/snippet/superStickerDetails/superStickerMetadata/stickerId")
                .and_then(|id| sticker_url(&id)),
            ..yt_alert(stamp, source, "superchat", yt_author(item, locale))
        })),
        "newSponsorEvent" => Some(YtEvent::Alert(Alert {
            tier: text_at("/snippet/newSponsorDetails/memberLevelName"),
            ..yt_alert(stamp, source, "member", yt_author(item, locale))
        })),
        "memberMilestoneChatEvent" => Some(YtEvent::Alert(with_comment(
            Alert {
                amount: count_at("/snippet/memberMilestoneChatDetails/memberMonth"),
                tier: text_at("/snippet/memberMilestoneChatDetails/memberLevelName"),
                ..yt_alert(stamp, source, "member", yt_author(item, locale))
            },
            "/snippet/memberMilestoneChatDetails/userComment",
        ))),
        "membershipGiftingEvent" => Some(YtEvent::Alert(Alert {
            amount: count_at("/snippet/membershipGiftingDetails/giftMembershipsCount"),
            tier: text_at("/snippet/membershipGiftingDetails/giftMembershipsLevelName"),
            ..yt_alert(stamp, source, "subgift", yt_author(item, locale))
        })),
        // The purchase was already counted; the recipient only gets a line.
        "giftMembershipReceivedEvent" => {
            let author = yt_author(item, locale);
            let text = text_at("/snippet/displayMessage")
                .unwrap_or_else(|| Msg::ChatGiftReceived { user: &author }.text(locale));
            yt_system(source, stamp, author, text)
        }
        "giftEvent" => {
            let details = |name: &str| format!("/snippet/giftDetails/{name}");
            Some(YtEvent::Alert(Alert {
                amount: count_at(&details("jewelsAmount")),
                currency: Some("JEWELS".into()),
                title: text_at(&details("giftName")).or_else(|| text_at(&details("altText"))),
                image: text_at(&details("giftUrl")).filter(|u| u.starts_with("https://")),
                message: text_at("/snippet/displayMessage"),
                ..yt_alert(stamp, source, "gift", yt_author(item, locale))
            }))
        }
        "pollEvent" => {
            let id = item.get("id").and_then(Value::as_str)?.to_string();
            let status = text_at("/snippet/pollDetails/status")
                .or_else(|| text_at("/snippet/pollDetails/metadata/status"))
                .unwrap_or_default();
            let options: Vec<PollOption> = item
                .pointer("/snippet/pollDetails/metadata/options")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .map(|o| PollOption {
                    label: o
                        .get("optionText")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_string(),
                    votes: o.get("tally").and_then(|t| {
                        t.as_u64().or_else(|| t.as_str().and_then(|s| s.parse().ok()))
                    }),
                    percent: None,
                })
                .collect();
            let total = options.iter().map(|o| o.votes).sum::<Option<u64>>();
            Some(YtEvent::Poll(Poll {
                id,
                kind: "poll".into(),
                question: text_at("/snippet/pollDetails/metadata/questionText").unwrap_or_default(),
                options,
                total,
                ended: status == "closed",
            }))
        }
        "sponsorOnlyModeStartedEvent" => Some(YtEvent::Modes(json!({ "membersOnly": true }))),
        "sponsorOnlyModeEndedEvent" => Some(YtEvent::Modes(json!({ "membersOnly": false }))),
        "textMessageEvent" => {
            let text = text_at("/snippet/displayMessage")?;
            let flag = |k: &str| {
                item.pointer(&format!("/authorDetails/{k}"))
                    .and_then(Value::as_bool)
                    == Some(true)
            };
            let mut badges = vec![];
            for (on, label, kind) in [
                (flag("isChatOwner"), "HOST".to_string(), "broadcaster"),
                (flag("isChatModerator"), "MOD".to_string(), "moderator"),
                (flag("isChatSponsor"), Msg::ChatBadgeMember.text(locale), "subscriber"),
                (flag("isVerified"), "✓".to_string(), "verified"),
            ] {
                if on {
                    badges.push(ChatBadge {
                        label,
                        kind: kind.into(),
                        ..Default::default()
                    });
                }
            }
            Some(YtEvent::Chat(ChatMessage {
                id: stamp.id,
                platform: "youtube".into(),
                source: source.to_string(),
                author: yt_author(item, locale),
                author_id: text_at("/authorDetails/channelId")
                    .or_else(|| text_at("/snippet/authorChannelId")),
                native_id: item.get("id").and_then(Value::as_str).map(String::from),
                fragments: rich_text_frags(&text),
                badges,
                text,
                ts: stamp.ts,
                ..Default::default()
            }))
        }
        // Chat ended and tombstones are not chat lines.
        _ => None,
    }
}

fn youtube_dataapi(
    api_key: &str,
    vid: &str,
    source: &str,
    running: Arc<AtomicBool>,
    app: AppHandle,
    gen: u64,
) -> bool {
    let live_chat_id = match get_live_chat_id(api_key, vid) {
        Some(id) => id,
        None => {
            chat_status_gen(&app, gen, "youtube", source, "waiting");
            return false;
        }
    };
    log::info!("youtube chat: Data API connected");
    chat_status_gen(&app, gen, "youtube", source, "connected");

    let mut page_token: Option<String> = None;
    let mut feed = YtFeed::default();
    let mut first = true;
    let mut errors = 0u32;
    while running.load(Ordering::Relaxed) {
        let mut url = format!(
            "https://www.googleapis.com/youtube/v3/liveChat/messages?liveChatId={live_chat_id}&part=snippet,authorDetails&key={api_key}"
        );
        if let Some(tok) = &page_token {
            url.push_str(&format!("&pageToken={tok}"));
        }
        let json = match ureq::get(&url).timeout(Duration::from_secs(8)).call() {
            Ok(r) => {
                errors = 0;
                serde_json::from_str::<Value>(&r.into_string().unwrap_or_default())
                    .unwrap_or(Value::Null)
            }
            Err(_) => {
                errors += 1;

                if errors >= 3 {
                    break;
                }
                thread::sleep(Duration::from_secs(5));
                continue;
            }
        };
        page_token = json
            .get("nextPageToken")
            .and_then(|v| v.as_str())
            .map(String::from);
        let interval = json
            .get("pollingIntervalMillis")
            .and_then(|v| v.as_u64())
            .unwrap_or(5000)
            .max(2000);

        if let Some(items) = json.get("items").and_then(|v| v.as_array()) {
            let locale = crate::i18n::locale();
            for item in items {
                let Some(event) = parse_dataapi_item(source, item, YtStamp::now(), locale) else {
                    continue;
                };
                let lasting = matches!(event, YtEvent::Poll(_) | YtEvent::Modes(_));
                // The first page is history; gifts reuse their ID to update a combo.
                let repeated = item
                    .get("id")
                    .and_then(Value::as_str)
                    .is_some_and(|id| !feed.seen.insert(id.to_string()));
                if (first || repeated) && !lasting {
                    continue;
                }
                if feed.seen.len() > 5_000 {
                    feed.seen.clear();
                }
                dispatch_yt(&app, gen, source, &mut feed, event);
            }
        }
        first = false;

        let mut slept = 0u64;
        while running.load(Ordering::Relaxed) && slept < interval {
            thread::sleep(Duration::from_millis(200));
            slept += 200;
        }
    }
    chat_status_gen(&app, gen, "youtube", source, "disconnected");
    true
}

#[tauri::command]
pub async fn youtube_key_check(key: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || check_youtube_key(&key))
        .await
        .map_err(|e| format!("join: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn stamp() -> YtStamp {
        YtStamp {
            id: "fixed-id".into(),
            ts: 1_700_000_000_000,
        }
    }

    fn innertube(action: Value) -> Option<YtEvent> {
        parse_innertube_action("Canal", &action, stamp(), Locale::PtBr)
    }

    fn data_api(item: Value) -> Option<YtEvent> {
        parse_dataapi_item("Canal", &item, stamp(), Locale::PtBr)
    }

    fn chat(event: Option<YtEvent>) -> ChatMessage {
        match event {
            Some(YtEvent::Chat(message)) => message,
            other => panic!("expected a chat message, got {other:?}"),
        }
    }

    fn alert(event: Option<YtEvent>) -> Alert {
        match event {
            Some(YtEvent::Alert(alert)) => alert,
            other => panic!("expected an alert, got {other:?}"),
        }
    }

    #[test]
    fn innertube_text_messages_use_the_injected_identity_and_clock() {
        let message = chat(innertube(json!({ "addChatItemAction": { "item": {
            "liveChatTextMessageRenderer": {
                "id": "native-1",
                "authorName": { "simpleText": "Ana" },
                "message": { "runs": [{ "text": "oi " }, { "text": "galera" }] },
                "authorBadges": [{ "liveChatAuthorBadgeRenderer": { "icon": { "iconType": "MODERATOR" } } }]
            }
        } } })));
        assert_eq!(message.id, "fixed-id");
        assert_eq!(message.ts, 1_700_000_000_000);
        assert_eq!(message.source, "Canal");
        assert_eq!(message.author, "Ana");
        assert_eq!(message.native_id.as_deref(), Some("native-1"));
        assert_eq!(message.text, "oi galera");
        assert_eq!(message.badges[0].kind, "moderator");
    }

    #[test]
    fn innertube_keeps_emoji_only_messages_from_channel_emojis() {
        let message = chat(innertube(json!({ "addChatItemAction": { "item": {
            "liveChatTextMessageRenderer": {
                "message": { "runs": [{ "emoji": {
                    "emojiId": "UC/custom",
                    "searchTerms": ["corneta"],
                    "image": { "thumbnails": [{ "url": "https://yt3.example.invalid/e.png" }] }
                } }] }
            }
        } } })));
        assert_eq!(message.text, "corneta");
        assert_eq!(message.fragments[0].kind, "emote");
        // Without an author name the localized fallback is used, not a hard-coded "anon".
        assert_eq!(message.author, "alguém");
    }

    #[test]
    fn innertube_deletions_paid_items_and_memberships() {
        assert!(matches!(
            innertube(json!({ "markChatItemAsDeletedAction": { "targetItemId": "native-9" } })),
            Some(YtEvent::DeleteMessage(id)) if id == "native-9"
        ));
        let chat_alert = alert(innertube(json!({ "addChatItemAction": { "item": {
            "liveChatPaidMessageRenderer": {
                "authorName": { "simpleText": "Bia" },
                "purchaseAmountText": { "simpleText": "R$ 10,00" },
                "message": { "runs": [{ "text": "valeu" }] }
            }
        } } })));
        assert_eq!(chat_alert.kind, "superchat");
        assert_eq!(chat_alert.amount, Some(10.0));
        assert_eq!(chat_alert.currency.as_deref(), Some("BRL"));
        assert_eq!(chat_alert.message.as_deref(), Some("valeu"));
        assert_eq!(chat_alert.title.as_deref(), Some("R$ 10,00"));
        let sticker = alert(innertube(json!({ "addChatItemAction": { "item": {
            "liveChatPaidStickerRenderer": {
                "authorName": { "simpleText": "Caio" },
                "purchaseAmountText": { "simpleText": "R$ 5,00" }
            }
        } } })));
        assert_eq!(sticker.kind, "superchat");
        assert_eq!(sticker.title.as_deref(), Some("R$ 5,00"));
        let gift = alert(innertube(json!({ "addChatItemAction": { "item": {
            "liveChatSponsorshipsGiftPurchaseAnnouncementRenderer": {
                "header": { "liveChatSponsorshipsHeaderRenderer": { "authorName": { "simpleText": "Duda" } } }
            }
        } } })));
        assert_eq!(
            (gift.kind.as_str(), gift.user.as_str()),
            ("subgift", "Duda")
        );
        assert!(innertube(json!({ "addChatItemAction": { "item": { "liveChatViewerEngagementMessageRenderer": {} } } })).is_none());
    }

    #[test]
    fn data_api_text_messages_carry_role_badges() {
        let message = chat(data_api(json!({
            "id": "native-2",
            "snippet": { "type": "textMessageEvent", "displayMessage": "boa noite" },
            "authorDetails": { "displayName": "Eva", "isChatOwner": true, "isChatSponsor": true }
        })));
        assert_eq!(
            (message.author.as_str(), message.text.as_str()),
            ("Eva", "boa noite")
        );
        assert_eq!(message.native_id.as_deref(), Some("native-2"));
        let kinds: Vec<_> = message.badges.iter().map(|b| b.kind.as_str()).collect();
        assert_eq!(kinds, ["broadcaster", "subscriber"]);
        assert_eq!(message.badges[1].label, "MEMBRO");
    }

    #[test]
    fn data_api_paid_events_become_alerts() {
        let super_chat = alert(data_api(json!({
            "snippet": { "type": "superChatEvent", "superChatDetails": {
                "amountMicros": "25000000", "currency": "BRL", "userComment": "manda salve"
            } },
            "authorDetails": { "displayName": "Fê" }
        })));
        assert_eq!(super_chat.amount, Some(25.0));
        assert_eq!(super_chat.currency.as_deref(), Some("BRL"));
        assert_eq!(super_chat.message.as_deref(), Some("manda salve"));
        let sticker = alert(data_api(json!({
            "snippet": { "type": "superStickerEvent", "superStickerDetails": {
                "amountMicros": "5000000", "currency": "BRL"
            } },
            "authorDetails": { "displayName": "Gui" }
        })));
        assert_eq!(
            (sticker.kind.as_str(), sticker.amount),
            ("superchat", Some(5.0))
        );
        let gifts = alert(data_api(json!({
            "snippet": { "type": "membershipGiftingEvent", "membershipGiftingDetails": {
                "giftMembershipsCount": 5, "giftMembershipsLevelName": "Fã"
            } },
            "authorDetails": { "displayName": "Hugo" }
        })));
        assert_eq!((gifts.kind.as_str(), gifts.amount), ("subgift", Some(5.0)));
        assert_eq!(gifts.tier.as_deref(), Some("Fã"));
    }

    #[test]
    fn data_api_moderation_and_non_chat_events() {
        assert!(matches!(
            data_api(json!({ "snippet": { "type": "messageDeletedEvent",
                "messageDeletedDetails": { "deletedMessageId": "native-3" } } })),
            Some(YtEvent::DeleteMessage(id)) if id == "native-3"
        ));
        assert!(matches!(
            data_api(json!({ "snippet": { "type": "userBannedEvent",
                "userBannedDetails": { "banType": "temporary", "banDurationSeconds": 300,
                    "bannedUserDetails": { "displayName": "Ivo", "channelId": "UCivo" } } } })),
            Some(YtEvent::DeleteUser { author, author_id: Some(id), seconds: Some(300) })
                if author == "Ivo" && id == "UCivo"
        ));
        assert!(matches!(
            data_api(json!({ "snippet": { "type": "sponsorOnlyModeStartedEvent" } })),
            Some(YtEvent::Modes(modes)) if modes == json!({ "membersOnly": true })
        ));
        let received = chat(data_api(json!({
            "snippet": { "type": "giftMembershipReceivedEvent" },
            "authorDetails": { "displayName": "Lia" }
        })));
        assert!(received.system);
        // These used to reach the feed as chat lines.
        for kind in ["chatEndedEvent", "tombstone"] {
            assert!(
                data_api(
                    json!({ "snippet": { "type": kind, "displayMessage": "texto do sistema" } })
                )
                .is_none(),
                "{kind}"
            );
        }
        assert!(data_api(
            json!({ "snippet": { "type": "textMessageEvent", "displayMessage": "" } })
        )
        .is_none());
    }

    #[test]
    fn innertube_author_removals_banners_and_polls() {
        assert!(matches!(
            innertube(json!({ "removeChatItemByAuthorAction": { "externalChannelId": "UCx" } })),
            Some(YtEvent::DeleteUser { author_id: Some(id), .. }) if id == "UCx"
        ));
        assert!(matches!(
            innertube(json!({ "removeChatItemAction": { "targetItemId": "m1" } })),
            Some(YtEvent::DeleteMessage(id)) if id == "m1"
        ));
        let pinned = innertube(json!({ "addBannerToLiveChatCommand": { "bannerRenderer": {
            "liveChatBannerRenderer": {
                "actionId": "banner-1",
                "bannerType": "LIVE_CHAT_BANNER_TYPE_PINNED_MESSAGE",
                "header": { "liveChatBannerHeaderRenderer": { "text": { "runs": [{ "text": "Fixado por " }, { "text": "@Lu" }] } } },
                "contents": { "liveChatTextMessageRenderer": {
                    "id": "m2", "authorName": { "simpleText": "@Lu" },
                    "message": { "runs": [{ "text": "regras no link" }] }
                } }
            }
        } } }));
        match pinned {
            Some(YtEvent::Pin { action_id, message }) => {
                assert_eq!(action_id, "banner-1");
                assert_eq!(message.highlight.as_deref(), Some("pinned"));
                assert_eq!(message.note.as_deref(), Some("Fixado por @Lu"));
            }
            other => panic!("expected a pin, got {other:?}"),
        }
        assert!(matches!(
            innertube(json!({ "removeBannerForLiveChatCommand": { "targetActionId": "banner-1" } })),
            Some(YtEvent::Unpin(id)) if id == "banner-1"
        ));
        let poll = innertube(json!({ "showLiveChatActionPanelAction": { "panelToShow": {
            "liveChatActionPanelRenderer": { "contents": { "pollRenderer": {
                "liveChatPollId": "p1",
                "header": { "pollHeaderRenderer": { "pollQuestion": { "runs": [{ "text": "Qual jogo?" }] } } },
                "choices": [
                    { "text": { "runs": [{ "text": "A" }] }, "voteRatio": 0.7 },
                    { "text": { "runs": [{ "text": "B" }] }, "votePercentage": { "simpleText": "30%" } }
                ]
            } } }
        } } }));
        match poll {
            Some(YtEvent::Poll(poll)) => {
                assert_eq!(poll.question, "Qual jogo?");
                let percents: Vec<Option<f64>> = poll.options.iter().map(|o| o.percent).collect();
                assert_eq!(percents, [Some(70.0), Some(30.0)]);
            }
            other => panic!("expected a poll, got {other:?}"),
        }
        assert!(matches!(
            innertube(json!({ "closeLiveChatActionPanelAction": { "targetPanelId": "p1" } })),
            Some(YtEvent::PollClosed(id)) if id == "p1"
        ));
    }

    #[test]
    fn innertube_gifts_stickers_memberships_links_and_emoji() {
        let gift = alert(innertube(
            json!({ "addChatItemAction": { "item": { "giftMessageViewModel": {
            "id": "g1",
            "text": { "content": "sent Sparkles" },
            "authorName": { "content": "@fã " },
            "giftImage": { "sources": [{ "url": "//www.gstatic.com/sparkles.png", "width": 480 }] },
            "giftImageA11yLabel": "@fã sent a gift, Sparkles"
        } } } }),
        ));
        assert_eq!((gift.kind.as_str(), gift.user.as_str()), ("gift", "@fã"));
        assert_eq!(gift.title.as_deref(), Some("Sparkles"));
        assert_eq!(
            gift.image.as_deref(),
            Some("https://www.gstatic.com/sparkles.png")
        );

        let sticker = alert(innertube(
            json!({ "addChatItemAction": { "item": { "liveChatPaidStickerRenderer": {
            "authorName": { "simpleText": "Caio" },
            "purchaseAmountText": { "simpleText": "R$ 5,00" },
            "sticker": {
                "thumbnails": [{ "url": "//lh3.googleusercontent.com/a=s104", "width": 104 }, { "url": "//lh3.googleusercontent.com/a=s208", "width": 208 }],
                "accessibility": { "accessibilityData": { "label": "gato dançando" } }
            }
        } } } }),
        ));
        assert_eq!(
            sticker.image.as_deref(),
            Some("https://lh3.googleusercontent.com/a=s208")
        );
        assert_eq!(sticker.title.as_deref(), Some("gato dançando"));

        let milestone = alert(innertube(
            json!({ "addChatItemAction": { "item": { "liveChatMembershipItemRenderer": {
            "authorName": { "simpleText": "Dani" },
            "headerPrimaryText": { "runs": [{ "text": "Membro há " }, { "text": "27" }, { "text": " meses" }] },
            "headerSubtext": { "simpleText": "Corneteiro" },
            "message": { "runs": [{ "text": "bora" }] }
        } } } }),
        ));
        assert_eq!(
            (milestone.amount, milestone.tier.as_deref()),
            (Some(27.0), Some("Corneteiro"))
        );
        assert_eq!(milestone.message.as_deref(), Some("bora"));

        let message = chat(innertube(
            json!({ "addChatItemAction": { "item": { "liveChatTextMessageRenderer": {
            "authorName": { "simpleText": "@eva" },
            "authorBadges": [{ "liveChatAuthorBadgeRenderer": {
                "customThumbnail": { "thumbnails": [{ "url": "https://yt3.ggpht.com/m=s16", "width": 16 }, { "url": "https://yt3.ggpht.com/m=s32", "width": 32 }] },
                "tooltip": "Membro (6 meses)"
            } }],
            "message": { "runs": [
                { "text": "olha " },
                { "text": "corneta.live", "navigationEndpoint": { "urlEndpoint": { "url": "https://www.youtube.com/redirect?event=live_chat&q=https%3A%2F%2Fcorneta.live%2F" } } },
                { "emoji": { "emojiId": "😳", "shortcuts": [":flushed:"], "image": { "thumbnails": [{ "url": "https://fonts.gstatic.com/1f633/72.png" }] } } }
            ] }
        } } } }),
        ));
        assert_eq!(message.text, "olha corneta.live😳");
        let link = message.fragments.iter().find(|f| f.kind == "link").unwrap();
        assert_eq!(link.url.as_deref(), Some("https://corneta.live/"));
        assert_eq!(
            message.badges[0].url.as_deref(),
            Some("https://yt3.ggpht.com/m=s32")
        );
        assert_eq!(message.badges[0].title.as_deref(), Some("Membro (6 meses)"));
    }

    #[test]
    fn data_api_gifts_and_polls() {
        let gift = alert(data_api(json!({
            "id": "gift-1",
            "snippet": { "type": "giftEvent", "giftDetails": {
                "jewelsAmount": 50, "giftName": "Coroa", "giftUrl": "https://www.gstatic.com/coroa.png"
            } },
            "authorDetails": { "displayName": "Gil" }
        })));
        assert_eq!(
            (gift.kind.as_str(), gift.amount, gift.currency.as_deref()),
            ("gift", Some(50.0), Some("JEWELS"))
        );
        assert_eq!(gift.title.as_deref(), Some("Coroa"));
        match data_api(json!({
            "id": "poll-1",
            "snippet": { "type": "pollEvent", "pollDetails": {
                "status": "closed",
                "metadata": { "questionText": "Qual?", "options": [{ "optionText": "A", "tally": "3" }, { "optionText": "B", "tally": "1" }] }
            } }
        })) {
            Some(YtEvent::Poll(poll)) => {
                assert!(poll.ended);
                assert_eq!(poll.total, Some(4));
            }
            other => panic!("expected a poll, got {other:?}"),
        }
    }

    #[test]
    fn redirect_links_are_unwrapped_and_decoded_safely() {
        assert_eq!(percent_decode("a%20b%2Fc+d%zz%"), "a b/c d%zz%");
        assert_eq!(percent_decode("%C3%A9"), "é");
    }

    /// Run by hand with `CORNETA_LIVE_CHAT=1 cargo test --lib live_youtube -- --ignored --nocapture`;
    /// CI runs ignored tests too, and these depend on a third-party service.
    #[test]
    #[ignore = "talks to youtube.com"]
    fn live_youtube_actions_parse_into_events() {
        if std::env::var_os("CORNETA_LIVE_CHAT").is_none() {
            return;
        }
        crate::install_tls_provider();
        let channel = std::env::var("CORNETA_LIVE_YOUTUBE").unwrap_or_else(|_| "@LofiGirl".into());
        let LiveResolve::Video(video) = resolve_youtube_video(&channel, "") else {
            panic!("{channel} is not live");
        };
        let (key, version, mut cont) = innertube_bootstrap(&video).expect("innertube bootstrap");
        let (mut chats, mut alerts, mut pins, mut polls, mut other) = (0, 0, 0, 0, 0);
        for round in 0..6 {
            let lcc = innertube_poll(&key, &version, &cont).expect("innertube poll");
            for action in lcc
                .get("actions")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
            {
                match parse_innertube_action("Lofi", action, YtStamp::now(), Locale::PtBr) {
                    Some(YtEvent::Chat(m)) => {
                        chats += 1;
                        if m.system
                            || m.badges.iter().any(|b| b.url.is_some())
                            || m.fragments.iter().any(|f| f.kind != "text")
                        {
                            println!(
                                "chat system={} badges={:?} kinds={:?}",
                                m.system,
                                m.badges
                                    .iter()
                                    .map(|b| (b.kind.as_str(), b.url.is_some()))
                                    .collect::<Vec<_>>(),
                                m.fragments
                                    .iter()
                                    .map(|f| f.kind.as_str())
                                    .collect::<Vec<_>>()
                            );
                        }
                    }
                    Some(YtEvent::Alert(a)) => {
                        alerts += 1;
                        println!(
                            "alert {} {} {:?} {:?} {:?}",
                            a.kind, a.user, a.amount, a.currency, a.title
                        );
                    }
                    Some(YtEvent::Pin { message, .. }) => {
                        pins += 1;
                        println!("pin {:?}: {}", message.note, message.text);
                    }
                    Some(YtEvent::Poll(p)) => {
                        polls += 1;
                        println!("poll {}", p.question);
                    }
                    Some(_) => other += 1,
                    None => {}
                }
            }
            println!("round {round}: chats {chats} alerts {alerts} pins {pins} polls {polls} other {other}");
            let Some(next) = lcc.pointer("/continuations/0").and_then(continuation_token) else {
                break;
            };
            cont = next;
            std::thread::sleep(Duration::from_secs(3));
        }
        assert!(chats > 0);
    }

    #[test]
    fn quota_spending_lookups_are_remembered() {
        let start = Instant::now();
        let later = |secs: u64| start + Duration::from_secs(secs);
        let ttl = Duration::from_secs(60);
        let hit = (start, Some("UCaaaaaaaaaaaaaaaaaaaaaa".to_string()));
        let miss: (Instant, Option<String>) = (start, None);
        assert_eq!(
            cached_answer(Some(&hit), ttl, later(10_000)),
            Some(Some("UCaaaaaaaaaaaaaaaaaaaaaa".to_string()))
        );
        assert_eq!(cached_answer(Some(&miss), ttl, later(30)), Some(None));
        assert_eq!(cached_answer(Some(&miss), ttl, later(60)), None);
        assert_eq!(cached_answer::<String>(None, ttl, start), None);

        assert!(due(None, LIVE_SEARCH_EVERY, start));
        assert!(!due(Some(&start), LIVE_SEARCH_EVERY, later(599)));
        assert!(due(Some(&start), LIVE_SEARCH_EVERY, later(600)));
    }

    #[test]
    fn moderation_ids_come_from_each_youtube_feed() {
        let innertube_message = chat(innertube(json!({ "addChatItemAction": { "item": {
            "liveChatTextMessageRenderer": {
                "id": "native-3",
                "authorName": { "simpleText": "@ana" },
                "authorExternalChannelId": "UCaaaaaaaaaaaaaaaaaaaaaa",
                "message": { "runs": [{ "text": "oi" }] }
            }
        } } })));
        assert_eq!(
            innertube_message.author_id.as_deref(),
            Some("UCaaaaaaaaaaaaaaaaaaaaaa")
        );

        let data_api_message = chat(data_api(json!({
            "id": "native-4",
            "snippet": { "type": "textMessageEvent", "displayMessage": "oi" },
            "authorDetails": { "displayName": "Ana", "channelId": "UCbbbbbbbbbbbbbbbbbbbbbb" }
        })));
        assert_eq!(
            data_api_message.author_id.as_deref(),
            Some("UCbbbbbbbbbbbbbbbbbbbbbb")
        );
    }

    #[test]
    fn replies_mention_the_author_they_answer() {
        assert_eq!(youtube_reply_text("@ana", "valeu"), "@ana valeu");
        assert_eq!(youtube_reply_text("Ana Maria", "valeu"), "@Ana Maria valeu");
        assert_eq!(youtube_reply_text(" ", "valeu"), "valeu");
    }
}
