//! YouTube live chat: InnerTube polling without a key, the Data API with one, and live video lookup.

use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};
use tauri::AppHandle;

use crate::chat::{
    chat_status_gen, delete_message, delete_user, emit_alert, emit_chat_gen, next_id, now_ms,
    parse_amount, text_frag, Alert, ChatBadge, ChatFragment, ChatMessage,
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
    DeleteUser(String),
}

fn yt_alert(stamp: YtStamp, source: &str, kind: &str, user: String) -> Alert {
    Alert {
        id: stamp.id,
        platform: "youtube".into(),
        source: source.to_string(),
        kind: kind.into(),
        user,
        amount: None,
        currency: None,
        tier: None,
        message: None,
        fragments: Vec::new(),
        ts: stamp.ts,
    }
}

fn dispatch_yt(app: &AppHandle, gen: u64, source: &str, event: YtEvent) {
    match event {
        YtEvent::Chat(message) => emit_chat_gen(app, gen, message),
        YtEvent::Alert(alert) => emit_alert(app, alert),
        YtEvent::DeleteMessage(id) => delete_message(app, "youtube", &id),
        YtEvent::DeleteUser(author) => delete_user(app, "youtube", source, &author),
    }
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
fn innertube_bootstrap(video_id: &str) -> Option<(String, String, String)> {
    let url = format!("https://www.youtube.com/live_chat?is_popout=1&v={video_id}");
    let html = ureq::get(&url)
        .set("User-Agent", BROWSER_UA)
        .set("Accept-Language", "en-US,en;q=0.9")
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
        "context": { "client": { "clientName": "WEB", "clientVersion": version } },
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

fn yt_message_fragments(message: &Value) -> (String, Vec<ChatFragment>) {
    let mut text = String::new();
    let mut frags = vec![];
    if let Some(runs) = message.get("runs").and_then(|r| r.as_array()) {
        for run in runs {
            if let Some(t) = run.get("text").and_then(|x| x.as_str()) {
                text.push_str(t);
                frags.push(text_frag(t));
            } else if let Some(emoji) = run.get("emoji") {
                // Channel emojis often have no shortcut; fall back to their search term or label.
                let label = [
                    "/shortcuts/0",
                    "/searchTerms/0",
                    "/image/accessibility/accessibilityData/label",
                    "/emojiId",
                ]
                .iter()
                .find_map(|path| emoji.pointer(path).and_then(|x| x.as_str()))
                .unwrap_or("");
                text.push_str(label);
                match emoji
                    .pointer("/image/thumbnails/0/url")
                    .and_then(|x| x.as_str())
                {
                    Some(u) => frags.push(ChatFragment {
                        kind: "emote".into(),
                        text: Some(label.to_string()),
                        url: Some(u.to_string()),
                    }),
                    None => frags.push(text_frag(label)),
                }
            }
        }
    } else if let Some(s) = message.get("simpleText").and_then(|x| x.as_str()) {
        text.push_str(s);
        frags.push(text_frag(s));
    }
    (text, frags)
}

fn yt_innertube_badges(renderer: &Value, locale: Locale) -> Vec<ChatBadge> {
    let mut out = vec![];
    if let Some(badges) = renderer.get("authorBadges").and_then(|b| b.as_array()) {
        for b in badges {
            let r = b.get("liveChatAuthorBadgeRenderer");
            match r
                .and_then(|x| x.pointer("/icon/iconType"))
                .and_then(|x| x.as_str())
            {
                Some("OWNER") => out.push(ChatBadge {
                    label: "HOST".into(),
                    kind: "broadcaster".into(),
                }),
                Some("MODERATOR") => out.push(ChatBadge {
                    label: "MOD".into(),
                    kind: "moderator".into(),
                }),
                Some("VERIFIED") => out.push(ChatBadge {
                    label: "✓".into(),
                    kind: "verified".into(),
                }),
                _ if r.and_then(|x| x.get("customThumbnail")).is_some() => out.push(ChatBadge {
                    label: Msg::ChatBadgeMember.text(locale),
                    kind: "subscriber".into(),
                }),
                _ => {}
            }
        }
    }
    out
}

fn handle_innertube_action(app: &AppHandle, source: &str, action: &Value, gen: u64) {
    if let Some(event) =
        parse_innertube_action(source, action, YtStamp::now(), crate::i18n::locale())
    {
        dispatch_yt(app, gen, source, event);
    }
}

fn parse_innertube_action(
    source: &str,
    action: &Value,
    stamp: YtStamp,
    locale: Locale,
) -> Option<YtEvent> {
    if let Some(id) = action
        .pointer("/markChatItemAsDeletedAction/targetItemId")
        .and_then(|v| v.as_str())
    {
        return Some(YtEvent::DeleteMessage(id.to_string()));
    }
    let item = action.pointer("/addChatItemAction/item")?;
    let author_of = |r: &Value| {
        r.pointer("/authorName/simpleText")
            .and_then(|v| v.as_str())
            .map(String::from)
            .unwrap_or_else(|| Msg::ChatUnknownUser.text(locale))
    };

    if let Some(r) = item.get("liveChatTextMessageRenderer") {
        let (text, fragments) = yt_message_fragments(r.get("message").unwrap_or(&Value::Null));
        if fragments.is_empty() {
            return None;
        }
        return Some(YtEvent::Chat(ChatMessage {
            id: stamp.id,
            platform: "youtube".into(),
            source: source.to_string(),
            author: author_of(r),
            author_id: r
                .get("authorExternalChannelId")
                .and_then(|v| v.as_str())
                .map(String::from),
            native_id: r.get("id").and_then(|v| v.as_str()).map(String::from),
            color: None,
            fragments,
            badges: yt_innertube_badges(r, locale),
            text,
            ts: stamp.ts,
        }));
    }

    // Super Chats and Super Stickers share the paid-message amount text.
    for (renderer, sticker) in [
        ("liveChatPaidMessageRenderer", false),
        ("liveChatPaidStickerRenderer", true),
    ] {
        let Some(r) = item.get(renderer) else {
            continue;
        };
        let amount_text = r
            .pointer("/purchaseAmountText/simpleText")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let (msg, _) = if sticker {
            (String::new(), Vec::new())
        } else {
            yt_message_fragments(r.get("message").unwrap_or(&Value::Null))
        };
        let display = if msg.is_empty() {
            amount_text.to_string()
        } else {
            format!("{amount_text} — {msg}")
        };
        return Some(YtEvent::Alert(Alert {
            amount: parse_amount(amount_text),
            message: Some(display),
            ..yt_alert(stamp, source, "superchat", author_of(r))
        }));
    }

    if let Some(r) = item.get("liveChatMembershipItemRenderer") {
        return Some(YtEvent::Alert(yt_alert(
            stamp,
            source,
            "member",
            author_of(r),
        )));
    }

    if let Some(r) = item.get("liveChatSponsorshipsGiftPurchaseAnnouncementRenderer") {
        let author = r
            .pointer("/header/liveChatSponsorshipsHeaderRenderer")
            .map(&author_of)
            .unwrap_or_else(|| Msg::ChatUnknownUser.text(locale));
        return Some(YtEvent::Alert(yt_alert(stamp, source, "subgift", author)));
    }
    None
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
        if !first {
            if let Some(actions) = lcc.get("actions").and_then(|a| a.as_array()) {
                for action in actions {
                    handle_innertube_action(app, source, action, gen);
                }
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

/// True means the connection succeeded at least once, allowing the supervisor to reset backoff.
fn parse_dataapi_item(
    source: &str,
    item: &Value,
    stamp: YtStamp,
    locale: Locale,
) -> Option<YtEvent> {
    let text_at = |path: &str| {
        item.pointer(path)
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(String::from)
    };
    let micros_at = |path: &str| {
        item.pointer(path)
            .and_then(|v| v.as_str())
            .and_then(|s| s.parse::<f64>().ok())
            .map(|m| m / 1_000_000.0)
    };
    let count_at = |path: &str| {
        item.pointer(path)
            .and_then(|v| v.as_u64())
            .map(|n| n as f64)
    };
    let kind = item
        .pointer("/snippet/type")
        .and_then(|v| v.as_str())
        .unwrap_or("textMessageEvent");
    match kind {
        "messageDeletedEvent" => {
            text_at("/snippet/messageDeletedDetails/deletedMessageId").map(YtEvent::DeleteMessage)
        }
        "userBannedEvent" => text_at("/snippet/userBannedDetails/bannedUserDetails/displayName")
            .map(YtEvent::DeleteUser),
        "superChatEvent" => Some(YtEvent::Alert(Alert {
            amount: micros_at("/snippet/superChatDetails/amountMicros"),
            currency: text_at("/snippet/superChatDetails/currency"),
            message: text_at("/snippet/superChatDetails/userComment"),
            ..yt_alert(stamp, source, "superchat", yt_author(item, locale))
        })),
        "superStickerEvent" => Some(YtEvent::Alert(Alert {
            amount: micros_at("/snippet/superStickerDetails/amountMicros"),
            currency: text_at("/snippet/superStickerDetails/currency"),
            ..yt_alert(stamp, source, "superchat", yt_author(item, locale))
        })),
        "newSponsorEvent" => Some(YtEvent::Alert(Alert {
            tier: text_at("/snippet/newSponsorDetails/memberLevelName"),
            ..yt_alert(stamp, source, "member", yt_author(item, locale))
        })),
        "memberMilestoneChatEvent" => Some(YtEvent::Alert(Alert {
            amount: count_at("/snippet/memberMilestoneChatDetails/memberMonth"),
            tier: text_at("/snippet/memberMilestoneChatDetails/memberLevelName"),
            message: text_at("/snippet/memberMilestoneChatDetails/userComment"),
            ..yt_alert(stamp, source, "member", yt_author(item, locale))
        })),
        "membershipGiftingEvent" => Some(YtEvent::Alert(Alert {
            amount: count_at("/snippet/membershipGiftingDetails/giftMembershipsCount"),
            tier: text_at("/snippet/membershipGiftingDetails/giftMembershipsLevelName"),
            ..yt_alert(stamp, source, "subgift", yt_author(item, locale))
        })),
        // Other event types (chat ended, gift received, mode changes) are not chat lines.
        "textMessageEvent" => {
            let text = text_at("/snippet/displayMessage")?;
            let flag = |k: &str| {
                item.pointer(&format!("/authorDetails/{k}"))
                    .and_then(|v| v.as_bool())
                    == Some(true)
            };
            let mut badges = vec![];
            if flag("isChatOwner") {
                badges.push(ChatBadge {
                    label: "HOST".into(),
                    kind: "broadcaster".into(),
                });
            }
            if flag("isChatModerator") {
                badges.push(ChatBadge {
                    label: "MOD".into(),
                    kind: "moderator".into(),
                });
            }
            if flag("isChatSponsor") {
                badges.push(ChatBadge {
                    label: Msg::ChatBadgeMember.text(locale),
                    kind: "subscriber".into(),
                });
            }
            Some(YtEvent::Chat(ChatMessage {
                id: stamp.id,
                platform: "youtube".into(),
                source: source.to_string(),
                author: yt_author(item, locale),
                author_id: text_at("/authorDetails/channelId")
                    .or_else(|| text_at("/snippet/authorChannelId")),
                native_id: item.get("id").and_then(|v| v.as_str()).map(String::from),
                color: None,
                fragments: vec![text_frag(&text)],
                badges,
                text,
                ts: stamp.ts,
            }))
        }
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

        if !first {
            if let Some(items) = json.get("items").and_then(|v| v.as_array()) {
                let locale = crate::i18n::locale();
                for item in items {
                    if let Some(event) = parse_dataapi_item(source, item, YtStamp::now(), locale) {
                        dispatch_yt(&app, gen, source, event);
                    }
                }
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
        assert_eq!(chat_alert.message.as_deref(), Some("R$ 10,00 — valeu"));
        let sticker = alert(innertube(json!({ "addChatItemAction": { "item": {
            "liveChatPaidStickerRenderer": {
                "authorName": { "simpleText": "Caio" },
                "purchaseAmountText": { "simpleText": "R$ 5,00" }
            }
        } } })));
        assert_eq!(sticker.kind, "superchat");
        assert_eq!(sticker.message.as_deref(), Some("R$ 5,00"));
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
                "userBannedDetails": { "bannedUserDetails": { "displayName": "Ivo" } } } })),
            Some(YtEvent::DeleteUser(name)) if name == "Ivo"
        ));
        // These used to reach the feed as chat lines.
        for kind in [
            "chatEndedEvent",
            "giftMembershipReceivedEvent",
            "sponsorOnlyModeStartedEvent",
        ] {
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
