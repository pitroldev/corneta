//! Chat unificado multi-fonte: conecta em várias fontes (várias Twitch/YouTube/Kick)
//! e emite mensagens normalizadas (com emotes, badges, origem) + deleções, via eventos
//! `chat://message`, `chat://status` e `chat://delete`.
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};
use tungstenite::Message;

use crate::AppState;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ChatFragment {
    pub kind: String, // "text" | "emote"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ChatBadge {
    pub label: String,
    pub kind: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub id: String,
    pub platform: String, // "twitch" | "youtube" | "kick"
    pub source: String,   // rótulo da fonte (canal/slug) — distingue 2 da mesma plataforma
    pub author: String,
    /// ID nativo na plataforma (para casar deleções).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub native_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    pub text: String,
    pub fragments: Vec<ChatFragment>,
    pub badges: Vec<ChatBadge>,
    pub ts: u64,
}

#[derive(Default)]
pub struct ChatRuntime {
    pub running: Arc<AtomicBool>,
}

static MSG_ID: AtomicU64 = AtomicU64::new(1);
fn next_id() -> String {
    MSG_ID.fetch_add(1, Ordering::Relaxed).to_string()
}
/// Mensagens de chat desde a última amostra (o motor lê+zera a cada ~2s → taxa de chat).
pub static MSG_COUNT: AtomicU64 = AtomicU64::new(0);

/// Caminho do NDJSON da sessão em gravação (None se não estiver transmitindo).
fn session_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.state::<AppState>().engine.lock().ok()?.session_path.clone()
}
fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
fn text_frag(t: &str) -> ChatFragment {
    ChatFragment { kind: "text".into(), text: Some(t.to_string()), url: None }
}
fn frags_to_text(frags: &[ChatFragment]) -> String {
    frags.iter().filter_map(|f| f.text.clone()).collect::<Vec<_>>().join("")
}

fn emit_chat(app: &AppHandle, msg: ChatMessage) {
    MSG_COUNT.fetch_add(1, Ordering::Relaxed);
    let _ = app.emit("chat://message", msg);
}
fn chat_status(app: &AppHandle, platform: &str, source: &str, status: &str) {
    let _ = app.emit(
        "chat://status",
        json!({ "platform": platform, "source": source, "status": status }),
    );
}
fn delete_message(app: &AppHandle, platform: &str, native_id: &str) {
    let _ = app.emit(
        "chat://delete",
        json!({ "scope": "message", "platform": platform, "nativeId": native_id }),
    );
}
fn delete_user(app: &AppHandle, platform: &str, source: &str, author: &str) {
    let _ = app.emit(
        "chat://delete",
        json!({ "scope": "user", "platform": platform, "source": source, "author": author }),
    );
}
fn clear_source(app: &AppHandle, platform: &str, source: &str) {
    let _ = app.emit(
        "chat://delete",
        json!({ "scope": "all", "platform": platform, "source": source }),
    );
}

// ----------------------------- Alertas -----------------------------

/// Alerta de engajamento normalizado (sub, gift, bits, raid, membro, super chat…).
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Alert {
    pub id: String,
    pub platform: String, // twitch | youtube | kick
    pub source: String,
    pub kind: String, // sub|resub|subgift|bits|raid|member|superchat|tip|follow
    pub user: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub amount: Option<f64>, // bits, meses, nº de gifts, viewers, valor do donate
    #[serde(skip_serializing_if = "Option::is_none")]
    pub currency: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tier: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    pub ts: u64,
}

fn emit_alert(app: &AppHandle, alert: Alert) {
    if let Some(p) = session_path(app) {
        crate::session::record_alert(&p, &alert.platform, &alert.kind, &alert.user, alert.amount);
    }
    let _ = app.emit("alert://event", alert);
}

// ----------------------------- Controle ----------------------------

/// (Re)inicia o chat com base nas fontes configuradas.
pub fn start_chat(app: &AppHandle) {
    MSG_COUNT.store(0, Ordering::Relaxed);
    let s = crate::config::load(app).settings;
    let running = {
        let st = app.state::<AppState>();
        let mut chat = st.chat.lock().unwrap();
        chat.running.store(false, Ordering::Relaxed);
        let running = Arc::new(AtomicBool::new(true));
        chat.running = running.clone();
        running
    };
    let api_key = s.youtube_api_key.clone();

    for src in s
        .chat_sources
        .iter()
        .filter(|x| x.enabled && !x.value.trim().is_empty())
    {
        let label = if src.name.trim().is_empty() {
            src.value.clone()
        } else {
            src.name.clone()
        };
        let (app2, run2, value) = (app.clone(), running.clone(), src.value.clone());
        match src.platform.as_str() {
            "twitch" => {
                tauri::async_runtime::spawn_blocking(move || {
                    while run2.load(Ordering::Relaxed) {
                        run_twitch(&value, &label, run2.clone(), app2.clone());
                        reconnect_wait(&run2); // caiu/erro → tenta de novo em ~3s
                    }
                });
            }
            "kick" => {
                tauri::async_runtime::spawn_blocking(move || {
                    while run2.load(Ordering::Relaxed) {
                        run_kick(&value, &label, run2.clone(), app2.clone());
                        reconnect_wait(&run2);
                    }
                });
            }
            "youtube" => {
                // Sem guard de API key: o InnerTube lê o chat sem chave (igual Twitch).
                let key = api_key.clone();
                tauri::async_runtime::spawn_blocking(move || {
                    while run2.load(Ordering::Relaxed) {
                        run_youtube(&key, &value, &label, run2.clone(), app2.clone());
                        // ~20s entre tentativas: aguardando a live começar / re-resolver a nova
                        reconnect_for(&run2, 100);
                    }
                });
            }
            _ => {}
        }
    }

    // Contagem de viewers unificada (poll das mesmas fontes).
    let vsources: Vec<crate::config::ChatSource> = s
        .chat_sources
        .iter()
        .filter(|x| x.enabled && !x.value.trim().is_empty())
        .cloned()
        .collect();
    if !vsources.is_empty() {
        let (app_v, run_v, key_v) = (app.clone(), running.clone(), api_key.clone());
        tauri::async_runtime::spawn_blocking(move || run_viewers(vsources, key_v, run_v, app_v));
    }
}

pub fn stop_chat(app: &AppHandle) {
    let st = app.state::<AppState>();
    st.chat.lock().unwrap().running.store(false, Ordering::Relaxed);
}

/// Espera ~3s antes de reconectar, abortando cedo se o chat foi parado.
fn reconnect_wait(running: &AtomicBool) {
    reconnect_for(running, 15);
}
/// Espera `ticks`×200ms antes de tentar de novo, abortando cedo se o chat foi parado.
fn reconnect_for(running: &AtomicBool, ticks: u32) {
    for _ in 0..ticks {
        if !running.load(Ordering::Relaxed) {
            return;
        }
        thread::sleep(Duration::from_millis(200));
    }
}

// ----------------------------- Twitch ------------------------------

fn run_twitch(channel: &str, source: &str, running: Arc<AtomicBool>, app: AppHandle) {
    let ch = channel.trim().trim_start_matches('#').to_lowercase();
    if ch.is_empty() {
        return;
    }
    // TLS (wss://:443): a Twitch deixou de servir o IRC em texto puro na porta 80.
    let mut socket = match tungstenite::connect("wss://irc-ws.chat.twitch.tv:443") {
        Ok((s, _)) => s,
        Err(e) => {
            log::warn!("twitch chat ({source}): {e}");
            chat_status(&app, "twitch", source, "error");
            return;
        }
    };
    match socket.get_mut() {
        tungstenite::stream::MaybeTlsStream::Rustls(s) => {
            let _ = s.sock.set_read_timeout(Some(Duration::from_millis(400)));
        }
        tungstenite::stream::MaybeTlsStream::Plain(tcp) => {
            let _ = tcp.set_read_timeout(Some(Duration::from_millis(400)));
        }
        _ => {}
    }
    let _ = socket.send(Message::Text("CAP REQ :twitch.tv/tags twitch.tv/commands".into()));
    let _ = socket.send(Message::Text("PASS SCHMOOPIIE".into()));
    let _ = socket.send(Message::Text(format!("NICK justinfan{}", now_ms() % 100000)));
    let _ = socket.send(Message::Text(format!("JOIN #{ch}")));
    log::info!("twitch chat: conectado em #{ch}");
    chat_status(&app, "twitch", source, "connected");

    // Emotes de terceiros (BTTV/FFZ/7TV): globais já; do canal quando vier o room-id.
    // Síncrono de propósito: o emote precisa estar no mapa quando a mensagem é parseada
    // (senão renderiza como texto). Os emotes do canal carregam antes da 1ª mensagem.
    let mut emotes = fetch_global_thirdparty();
    let mut channel_emotes_done = false;

    while running.load(Ordering::Relaxed) {
        match socket.read() {
            Ok(Message::Text(t)) => {
                for line in t.split("\r\n").filter(|l| !l.is_empty()) {
                    if !channel_emotes_done {
                        if let Some(room_id) = tag_val(twitch_tags(line), "room-id") {
                            fetch_channel_thirdparty(&room_id, &mut emotes);
                            channel_emotes_done = true;
                        }
                    }
                    if line.starts_with("PING") {
                        let _ = socket.send(Message::Text("PONG :tmi.twitch.tv".into()));
                    } else if line.contains("PRIVMSG") {
                        // Bits (cheer) vêm na tag `bits` de um PRIVMSG → vira alerta.
                        if let Some(b) =
                            tag_val(twitch_tags(line), "bits").and_then(|v| v.parse::<f64>().ok())
                        {
                            if b > 0.0 {
                                emit_alert(
                                    &app,
                                    Alert {
                                        id: next_id(),
                                        platform: "twitch".into(),
                                        source: source.to_string(),
                                        kind: "bits".into(),
                                        user: tag_val(twitch_tags(line), "display-name")
                                            .unwrap_or_else(|| "alguém".into()),
                                        amount: Some(b),
                                        currency: None,
                                        tier: None,
                                        message: None,
                                        ts: now_ms(),
                                    },
                                );
                            }
                        }
                        if let Some(msg) = parse_privmsg(line, source, &emotes) {
                            emit_chat(&app, msg);
                        }
                    } else if line.contains("USERNOTICE") {
                        if let Some(alert) = parse_usernotice(line, source) {
                            emit_alert(&app, alert);
                        }
                    } else if line.contains("CLEARMSG") {
                        if let Some(id) = tag_val(twitch_tags(line), "target-msg-id") {
                            delete_message(&app, "twitch", &id);
                        }
                    } else if line.contains("CLEARCHAT") {
                        match clearchat_user(line) {
                            Some(u) => delete_user(&app, "twitch", source, &u),
                            None => clear_source(&app, "twitch", source),
                        }
                    }
                }
            }
            Ok(Message::Close(_)) => break,
            Ok(_) => {}
            Err(tungstenite::Error::Io(e))
                if matches!(e.kind(), std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut) =>
            {
                continue;
            }
            Err(_) => break,
        }
    }
    let _ = socket.close(None);
    chat_status(&app, "twitch", source, "disconnected");
}

fn twitch_tags(line: &str) -> &str {
    line.strip_prefix('@')
        .and_then(|s| s.split(' ').next())
        .unwrap_or("")
}
fn tag_val(tags: &str, key: &str) -> Option<String> {
    for kv in tags.split(';') {
        let mut it = kv.splitn(2, '=');
        if it.next() == Some(key) {
            let v = it.next().unwrap_or("");
            return (!v.is_empty()).then(|| v.to_string());
        }
    }
    None
}
fn clearchat_user(line: &str) -> Option<String> {
    let after = line.split("CLEARCHAT").nth(1)?;
    let idx = after.find(':')?;
    let u = after[idx + 1..].trim();
    (!u.is_empty()).then(|| u.to_string())
}

/// Inscrição/resub/gift/raid via USERNOTICE do IRC → alerta.
fn parse_usernotice(line: &str, source: &str) -> Option<Alert> {
    let tags = twitch_tags(line);
    let msg_id = tag_val(tags, "msg-id")?;
    let user = tag_val(tags, "display-name")
        .or_else(|| tag_val(tags, "login"))
        .unwrap_or_else(|| "alguém".into());
    let tier = tag_val(tags, "msg-param-sub-plan").map(|p| match p.as_str() {
        "Prime" => "Prime".into(),
        "1000" => "T1".into(),
        "2000" => "T2".into(),
        "3000" => "T3".into(),
        other => other.to_string(),
    });
    let (kind, amount) = match msg_id.as_str() {
        "sub" => ("sub", Some(1.0)),
        "resub" => (
            "resub",
            tag_val(tags, "msg-param-cumulative-months").and_then(|v| v.parse().ok()),
        ),
        "subgift" => ("subgift", Some(1.0)),
        "submysterygift" | "anonsubmysterygift" => (
            "subgift",
            tag_val(tags, "msg-param-mass-gift-count").and_then(|v| v.parse().ok()),
        ),
        "raid" => (
            "raid",
            tag_val(tags, "msg-param-viewerCount").and_then(|v| v.parse().ok()),
        ),
        _ => return None,
    };
    let message = if kind == "subgift" {
        tag_val(tags, "msg-param-recipient-display-name").map(|r| format!("🎁 para {r}"))
    } else {
        usernotice_text(line)
    };
    Some(Alert {
        id: next_id(),
        platform: "twitch".into(),
        source: source.to_string(),
        kind: kind.into(),
        user,
        amount,
        currency: None,
        tier,
        message,
        ts: now_ms(),
    })
}

/// Mensagem opcional que o usuário escreveu junto do USERNOTICE.
fn usernotice_text(line: &str) -> Option<String> {
    let idx = line.find("USERNOTICE")?;
    let after = &line[idx..];
    let mi = after.find(':')?;
    let t = after[mi + 1..].trim_end();
    (!t.is_empty()).then(|| t.to_string())
}

fn parse_privmsg(line: &str, source: &str, emotes: &HashMap<String, String>) -> Option<ChatMessage> {
    let (tags, rest) = if let Some(stripped) = line.strip_prefix('@') {
        let sp = stripped.find(' ')?;
        (&stripped[..sp], &stripped[sp + 1..])
    } else {
        ("", line)
    };
    let privmsg_idx = rest.find("PRIVMSG")?;
    let after = &rest[privmsg_idx..];
    let msg_idx = after.find(':')?;
    let text = after[msg_idx + 1..].trim_end().to_string();
    if text.is_empty() {
        return None;
    }

    let nick = rest
        .strip_prefix(':')
        .and_then(|r| r.split('!').next())
        .unwrap_or("anon")
        .to_string();

    let mut color = None;
    let mut display = nick;
    let mut emotes_tag = "";
    let mut badges_tag = "";
    let mut native_id = None;
    for kv in tags.split(';') {
        let mut it = kv.splitn(2, '=');
        let k = it.next().unwrap_or("");
        let v = it.next().unwrap_or("");
        match k {
            "color" if !v.is_empty() => color = Some(v.to_string()),
            "display-name" if !v.is_empty() => display = v.to_string(),
            "emotes" => emotes_tag = v,
            "badges" => badges_tag = v,
            "id" if !v.is_empty() => native_id = Some(v.to_string()),
            _ => {}
        }
    }

    Some(ChatMessage {
        id: next_id(),
        platform: "twitch".into(),
        source: source.to_string(),
        author: display,
        native_id,
        color,
        fragments: apply_thirdparty(twitch_fragments(&text, emotes_tag), emotes),
        badges: twitch_badges(badges_tag),
        text,
        ts: now_ms(),
    })
}

// --------------------- Emotes de terceiros (BTTV/FFZ/7TV) ----------------------

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

/// Array do BTTV (`[{ id, code }]`) → mapa nome→url.
fn add_bttv(v: &Value, map: &mut HashMap<String, String>) {
    if let Some(arr) = v.as_array() {
        for e in arr {
            if let (Some(code), Some(id)) = (
                e.get("code").and_then(|x| x.as_str()),
                e.get("id").and_then(|x| x.as_str()),
            ) {
                map.insert(code.to_string(), format!("https://cdn.betterttv.net/emote/{id}/2x"));
            }
        }
    }
}

/// Sets do FFZ (`{ sets: { id: { emoticons: [{ name, urls }] } } }`).
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

/// Emotes do 7TV (`[{ name, id }]`).
fn add_7tv(emotes: &Value, map: &mut HashMap<String, String>) {
    if let Some(arr) = emotes.as_array() {
        for e in arr {
            if let (Some(name), Some(id)) = (
                e.get("name").and_then(|x| x.as_str()),
                e.get("id").and_then(|x| x.as_str()),
            ) {
                map.insert(name.to_string(), format!("https://cdn.7tv.app/emote/{id}/2x.webp"));
            }
        }
    }
}

fn fetch_global_thirdparty() -> HashMap<String, String> {
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
    map
}

fn fetch_channel_thirdparty(room_id: &str, map: &mut HashMap<String, String>) {
    if let Some(v) = fetch_json(&format!("https://api.betterttv.net/3/cached/users/twitch/{room_id}")) {
        add_bttv(v.get("channelEmotes").unwrap_or(&Value::Null), map);
        add_bttv(v.get("sharedEmotes").unwrap_or(&Value::Null), map);
    }
    if let Some(v) = fetch_json(&format!("https://api.frankerfacez.com/v1/room/id/{room_id}")) {
        add_ffz(&v, map);
    }
    if let Some(v) = fetch_json(&format!("https://7tv.io/v3/users/twitch/{room_id}")) {
        add_7tv(v.pointer("/emote_set/emotes").unwrap_or(&Value::Null), map);
    }
}

/// Substitui palavras que batem com emotes de terceiros por fragmentos de imagem.
fn apply_thirdparty(frags: Vec<ChatFragment>, emotes: &HashMap<String, String>) -> Vec<ChatFragment> {
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

fn twitch_fragments(text: &str, emotes_tag: &str) -> Vec<ChatFragment> {
    if emotes_tag.is_empty() {
        return vec![text_frag(text)];
    }
    let mut ranges: Vec<(usize, usize, String)> = vec![];
    for part in emotes_tag.split('/') {
        let mut it = part.splitn(2, ':');
        let id = it.next().unwrap_or("");
        let positions = it.next().unwrap_or("");
        if id.is_empty() {
            continue;
        }
        for pos in positions.split(',') {
            let mut p = pos.splitn(2, '-');
            if let (Some(a), Some(b)) = (
                p.next().and_then(|x| x.parse::<usize>().ok()),
                p.next().and_then(|x| x.parse::<usize>().ok()),
            ) {
                ranges.push((a, b, id.to_string()));
            }
        }
    }
    if ranges.is_empty() {
        return vec![text_frag(text)];
    }
    ranges.sort_by_key(|r| r.0);

    let chars: Vec<char> = text.chars().collect();
    let n = chars.len();
    let mut frags = vec![];
    let mut cursor = 0usize;
    for (a, b, id) in ranges {
        if a >= n || a < cursor || b < a {
            continue;
        }
        if a > cursor {
            frags.push(text_frag(&chars[cursor..a].iter().collect::<String>()));
        }
        let end = (b + 1).min(n);
        frags.push(ChatFragment {
            kind: "emote".into(),
            text: Some(chars[a..end].iter().collect()),
            url: Some(format!(
                "https://static-cdn.jtvnw.net/emoticons/v2/{id}/default/dark/1.0"
            )),
        });
        cursor = end;
    }
    if cursor < n {
        frags.push(text_frag(&chars[cursor..].iter().collect::<String>()));
    }
    frags
}

fn twitch_badges(tag: &str) -> Vec<ChatBadge> {
    if tag.is_empty() {
        return vec![];
    }
    tag.split(',')
        .filter_map(|b| {
            let set = b.split('/').next().unwrap_or("");
            let (label, kind) = match set {
                "broadcaster" => ("HOST", "broadcaster"),
                "moderator" => ("MOD", "moderator"),
                "vip" => ("VIP", "vip"),
                "subscriber" => ("SUB", "subscriber"),
                "founder" => ("FND", "subscriber"),
                "premium" => ("PRIME", "premium"),
                "turbo" => ("TURBO", "premium"),
                "partner" => ("✓", "partner"),
                "staff" | "admin" | "global_mod" => ("STAFF", "staff"),
                "artist-badge" => ("ART", "artist"),
                _ => return None,
            };
            Some(ChatBadge { label: label.into(), kind: kind.into() })
        })
        .collect()
}

// ----------------------------- YouTube -----------------------------

fn extract_video_id(input: &str) -> String {
    let s = input.trim();
    if let Some(i) = s.find("v=") {
        return s[i + 2..].split(['&', '#']).next().unwrap_or("").to_string();
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

/// Resultado de resolver um canal → o vídeo ao vivo atual.
enum LiveResolve {
    Video(String),  // achou a live
    NotLive,        // canal existe mas não está ao vivo (ou entrada inválida)
    ScrapeFailed,   // não deu pra raspar a página (rede/HTML) → vale tentar o fallback
}

/// É uma referência direta de VÍDEO (URL/ID)? Devolve o ID. (Compatibilidade.)
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
    // ID cru de 11 chars (não-handle, não-channelId)
    if !s.contains('/')
        && !s.starts_with('@')
        && !(s.starts_with("UC") && s.len() == 24)
        && s.len() == 11
        && s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
    {
        return Some(s.to_string());
    }
    None
}

/// Monta a URL `.../live` do canal (handle / channel id / URL). None se não parecer canal.
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

/// Extrai o ID do vídeo AO VIVO do HTML da página `/live`. None se não estiver ao vivo agora.
fn live_video_from_html(html: &str) -> Option<String> {
    if !(html.contains("\"isLive\":true") || html.contains("\"isLiveNow\":true")) {
        return None; // não conecta em VOD/premiere/canal offline
    }
    let grab = |start: usize| -> Option<String> {
        let id: String = html[start..]
            .chars()
            .take_while(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-')
            .collect();
        (id.len() == 11).then_some(id)
    };
    // 1) <link rel="canonical" href=".../watch?v=VIDEOID"> (perto do marcador)
    if let Some(i) = html.find("rel=\"canonical\"") {
        if let Some(j) = html[i..].find("watch?v=") {
            if j < 220 {
                if let Some(id) = grab(i + j + 8) {
                    return Some(id);
                }
            }
        }
    }
    // 2) "videoId":"VIDEOID"
    html.find("\"videoId\":\"").and_then(|i| grab(i + 11))
}

/// Raspa a página `/live` do canal (grátis, sem quota).
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
    // página carregou: ou o canal não está ao vivo, ou o HTML mudou
    if body.contains("ytInitialData") || body.contains("\"videoId\"") {
        LiveResolve::NotLive
    } else {
        LiveResolve::ScrapeFailed
    }
}

/// channelId (UC...) — direto da entrada ou via channels.list?forHandle (1 unidade).
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
    let url = format!(
        "https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=@{handle}&key={api_key}"
    );
    let body = ureq::get(&url).timeout(Duration::from_secs(6)).call().ok()?.into_string().ok()?;
    let v: Value = serde_json::from_str(&body).ok()?;
    v.pointer("/items/0/id").and_then(|x| x.as_str()).map(String::from)
}

/// Fallback oficial: search.list (eventType=live). Custa 100 unidades — só quando o scrape falha.
fn search_live_video_id(channel_id: &str, api_key: &str) -> Option<String> {
    if api_key.trim().is_empty() {
        return None;
    }
    let url = format!(
        "https://www.googleapis.com/youtube/v3/search?part=id&channelId={channel_id}&eventType=live&type=video&key={api_key}"
    );
    let body = ureq::get(&url).timeout(Duration::from_secs(8)).call().ok()?.into_string().ok()?;
    let v: Value = serde_json::from_str(&body).ok()?;
    v.pointer("/items/0/id/videoId").and_then(|x| x.as_str()).map(String::from)
}

/// Resolve a entrada (CANAL ou vídeo) no ID do vídeo ao vivo atual.
/// Canal → scrape do `/live` (grátis); fallback `search.list` só se o scrape falhar.
fn resolve_youtube_video(input: &str, api_key: &str) -> LiveResolve {
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

fn yt_author(item: &Value) -> String {
    item.pointer("/authorDetails/displayName")
        .and_then(|v| v.as_str())
        .unwrap_or("alguém")
        .to_string()
}

#[allow(clippy::too_many_arguments)]
fn yt_alert(
    source: &str,
    kind: &str,
    user: String,
    amount: Option<f64>,
    currency: Option<String>,
    tier: Option<String>,
    message: Option<String>,
) -> Alert {
    Alert {
        id: next_id(),
        platform: "youtube".into(),
        source: source.to_string(),
        kind: kind.into(),
        user,
        amount,
        currency,
        tier,
        message,
        ts: now_ms(),
    }
}

// --------------------- YouTube via InnerTube (SEM API key) ---------------------
// Lê o live chat pela API interna do YouTube (a mesma do navegador) — sem chave,
// sem OAuth, sem quota. Ver docs/YOUTUBE-AUTO.md (§2.5).

/// Parseia o 1º objeto JSON logo após `marker` no HTML (ignora o resto do script).
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

/// Pega o continuation token de um objeto `continuations[i]` (vários formatos).
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

/// Busca a página `live_chat` e extrai (api_key pública, versão do client, 1º continuation).
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

/// POST no get_live_chat → devolve o `liveChatContinuation` (actions + próximo continuation).
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
    v.pointer("/continuationContents/liveChatContinuation").cloned()
}

/// `message.runs[]` (texto + emojis) → (texto puro, fragmentos).
fn yt_message_fragments(message: &Value) -> (String, Vec<ChatFragment>) {
    let mut text = String::new();
    let mut frags = vec![];
    if let Some(runs) = message.get("runs").and_then(|r| r.as_array()) {
        for run in runs {
            if let Some(t) = run.get("text").and_then(|x| x.as_str()) {
                text.push_str(t);
                frags.push(text_frag(t));
            } else if let Some(emoji) = run.get("emoji") {
                let label = emoji
                    .pointer("/shortcuts/0")
                    .and_then(|x| x.as_str())
                    .unwrap_or("");
                text.push_str(label);
                match emoji.pointer("/image/thumbnails/0/url").and_then(|x| x.as_str()) {
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

fn yt_innertube_badges(renderer: &Value) -> Vec<ChatBadge> {
    let mut out = vec![];
    if let Some(badges) = renderer.get("authorBadges").and_then(|b| b.as_array()) {
        for b in badges {
            let r = b.get("liveChatAuthorBadgeRenderer");
            match r.and_then(|x| x.pointer("/icon/iconType")).and_then(|x| x.as_str()) {
                Some("OWNER") => out.push(ChatBadge { label: "HOST".into(), kind: "broadcaster".into() }),
                Some("MODERATOR") => out.push(ChatBadge { label: "MOD".into(), kind: "moderator".into() }),
                Some("VERIFIED") => out.push(ChatBadge { label: "✓".into(), kind: "verified".into() }),
                _ if r.and_then(|x| x.get("customThumbnail")).is_some() => {
                    out.push(ChatBadge { label: "MEMBRO".into(), kind: "subscriber".into() })
                }
                _ => {}
            }
        }
    }
    out
}

/// Número a partir de um texto monetário localizado ("R$ 1.234,56" → 1234.56). Best-effort.
fn parse_amount(s: &str) -> Option<f64> {
    let kept: String = s
        .chars()
        .filter(|c| c.is_ascii_digit() || *c == '.' || *c == ',')
        .collect();
    if kept.is_empty() {
        return None;
    }
    let norm = match kept.rfind([',', '.']) {
        Some(p) => {
            let int: String = kept[..p].chars().filter(|c| c.is_ascii_digit()).collect();
            let frac: String = kept[p + 1..].chars().filter(|c| c.is_ascii_digit()).collect();
            format!("{int}.{frac}")
        }
        None => kept,
    };
    norm.parse::<f64>().ok()
}

/// Processa uma `action` do InnerTube → mensagem / super chat / membro / deleção.
fn handle_innertube_action(app: &AppHandle, source: &str, action: &Value) {
    if let Some(id) = action
        .pointer("/markChatItemAsDeletedAction/targetItemId")
        .and_then(|v| v.as_str())
    {
        delete_message(app, "youtube", id);
        return;
    }
    let Some(item) = action.pointer("/addChatItemAction/item") else {
        return;
    };
    // Mensagem normal
    if let Some(r) = item.get("liveChatTextMessageRenderer") {
        let (text, fragments) = yt_message_fragments(r.get("message").unwrap_or(&Value::Null));
        if text.is_empty() {
            return;
        }
        let author = r
            .pointer("/authorName/simpleText")
            .and_then(|v| v.as_str())
            .unwrap_or("anon")
            .to_string();
        emit_chat(
            app,
            ChatMessage {
                id: next_id(),
                platform: "youtube".into(),
                source: source.to_string(),
                author,
                native_id: r.get("id").and_then(|v| v.as_str()).map(String::from),
                color: None,
                fragments,
                badges: yt_innertube_badges(r),
                text,
                ts: now_ms(),
            },
        );
        return;
    }
    // Super chat
    if let Some(r) = item.get("liveChatPaidMessageRenderer") {
        let author = r
            .pointer("/authorName/simpleText")
            .and_then(|v| v.as_str())
            .unwrap_or("alguém")
            .to_string();
        let amount_text = r
            .pointer("/purchaseAmountText/simpleText")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let (msg, _) = yt_message_fragments(r.get("message").unwrap_or(&Value::Null));
        let display = if msg.is_empty() {
            amount_text.to_string()
        } else {
            format!("{amount_text} — {msg}")
        };
        emit_alert(
            app,
            yt_alert(source, "superchat", author, parse_amount(amount_text), None, None, Some(display)),
        );
        return;
    }
    // Novo membro
    if item.get("liveChatMembershipItemRenderer").is_some() {
        let author = item
            .pointer("/liveChatMembershipItemRenderer/authorName/simpleText")
            .and_then(|v| v.as_str())
            .unwrap_or("alguém")
            .to_string();
        emit_alert(app, yt_alert(source, "member", author, None, None, None, None));
        return;
    }
    // Presente de memberships
    if let Some(r) = item.get("liveChatSponsorshipsGiftPurchaseAnnouncementRenderer") {
        let author = r
            .pointer("/header/liveChatSponsorshipsHeaderRenderer/authorName/simpleText")
            .and_then(|v| v.as_str())
            .unwrap_or("alguém")
            .to_string();
        emit_alert(app, yt_alert(source, "subgift", author, None, None, None, None));
    }
}

/// Lê o chat via InnerTube (sem chave). Devolve `false` se não conseguiu inicializar.
fn youtube_innertube(
    video_id: &str,
    source: &str,
    running: &Arc<AtomicBool>,
    app: &AppHandle,
) -> bool {
    let Some((key, version, mut cont)) = innertube_bootstrap(video_id) else {
        return false;
    };
    log::info!("youtube chat: InnerTube conectado ({source}) — vídeo {video_id}");
    chat_status(app, "youtube", source, "connected");
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
                    break; // chat caiu/acabou → o supervisor re-resolve (live nova?)
                }
                thread::sleep(Duration::from_secs(4));
                continue;
            }
        };
        if !first {
            if let Some(actions) = lcc.get("actions").and_then(|a| a.as_array()) {
                for action in actions {
                    handle_innertube_action(app, source, action);
                }
            }
        }
        first = false;
        let Some(next) = lcc.pointer("/continuations/0").and_then(continuation_token) else {
            break; // sem continuation = a live acabou
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
    chat_status(app, "youtube", source, "disconnected");
    true
}

fn run_youtube(api_key: &str, channel: &str, source: &str, running: Arc<AtomicBool>, app: AppHandle) {
    // Resolve o CANAL → vídeo ao vivo atual (sem precisar colar o link toda vez).
    let vid = match resolve_youtube_video(channel, api_key) {
        LiveResolve::Video(v) => v,
        _ => {
            // canal ainda não está ao vivo (ou entrada inválida) → aguardando; o supervisor re-tenta
            chat_status(&app, "youtube", source, "waiting");
            return;
        }
    };
    // 1) InnerTube — SEM API key (igual Twitch). Primário.
    if youtube_innertube(&vid, source, &running, &app) {
        return;
    }
    // 2) Fallback Data API — só se o InnerTube não inicializar E houver chave.
    if api_key.trim().is_empty() {
        chat_status(&app, "youtube", source, "waiting");
        return;
    }
    youtube_dataapi(api_key, &vid, source, running, app);
}

/// Leitor via YouTube Data API v3 (precisa de API key). Fallback do InnerTube.
fn youtube_dataapi(api_key: &str, vid: &str, source: &str, running: Arc<AtomicBool>, app: AppHandle) {
    let live_chat_id = match get_live_chat_id(api_key, vid) {
        Some(id) => id,
        None => {
            chat_status(&app, "youtube", source, "waiting");
            return;
        }
    };
    log::info!("youtube chat: Data API conectado ({source})");
    chat_status(&app, "youtube", source, "connected");

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
                // Erros seguidos = a live provavelmente acabou → sai pra re-resolver (live nova?).
                if errors >= 3 {
                    break;
                }
                thread::sleep(Duration::from_secs(5));
                continue;
            }
        };
        page_token = json.get("nextPageToken").and_then(|v| v.as_str()).map(String::from);
        let interval = json
            .get("pollingIntervalMillis")
            .and_then(|v| v.as_u64())
            .unwrap_or(5000)
            .max(2000);

        if !first {
            if let Some(items) = json.get("items").and_then(|v| v.as_array()) {
                for item in items {
                    let kind = item
                        .pointer("/snippet/type")
                        .and_then(|v| v.as_str())
                        .unwrap_or("textMessageEvent");
                    match kind {
                        "messageDeletedEvent" => {
                            if let Some(id) = item
                                .pointer("/snippet/messageDeletedDetails/deletedMessageId")
                                .and_then(|v| v.as_str())
                            {
                                delete_message(&app, "youtube", id);
                            }
                        }
                        "userBannedEvent" => {
                            if let Some(name) = item
                                .pointer("/snippet/userBannedDetails/bannedUserDetails/displayName")
                                .and_then(|v| v.as_str())
                            {
                                delete_user(&app, "youtube", source, name);
                            }
                        }
                        "superChatEvent" => {
                            let amount = item
                                .pointer("/snippet/superChatDetails/amountMicros")
                                .and_then(|v| v.as_str())
                                .and_then(|s| s.parse::<f64>().ok())
                                .map(|m| m / 1_000_000.0);
                            emit_alert(
                                &app,
                                yt_alert(
                                    source,
                                    "superchat",
                                    yt_author(item),
                                    amount,
                                    item.pointer("/snippet/superChatDetails/currency")
                                        .and_then(|v| v.as_str())
                                        .map(String::from),
                                    None,
                                    item.pointer("/snippet/superChatDetails/userComment")
                                        .and_then(|v| v.as_str())
                                        .filter(|s| !s.is_empty())
                                        .map(String::from),
                                ),
                            );
                        }
                        "newSponsorEvent" => {
                            emit_alert(
                                &app,
                                yt_alert(
                                    source,
                                    "member",
                                    yt_author(item),
                                    None,
                                    None,
                                    item.pointer("/snippet/newSponsorDetails/memberLevelName")
                                        .and_then(|v| v.as_str())
                                        .map(String::from),
                                    None,
                                ),
                            );
                        }
                        "memberMilestoneChatEvent" => {
                            let months = item
                                .pointer("/snippet/memberMilestoneChatDetails/memberMonth")
                                .and_then(|v| v.as_u64())
                                .map(|m| m as f64);
                            emit_alert(
                                &app,
                                yt_alert(
                                    source,
                                    "member",
                                    yt_author(item),
                                    months,
                                    None,
                                    item.pointer("/snippet/memberMilestoneChatDetails/memberLevelName")
                                        .and_then(|v| v.as_str())
                                        .map(String::from),
                                    item.pointer("/snippet/memberMilestoneChatDetails/userComment")
                                        .and_then(|v| v.as_str())
                                        .filter(|s| !s.is_empty())
                                        .map(String::from),
                                ),
                            );
                        }
                        "membershipGiftingEvent" => {
                            let count = item
                                .pointer("/snippet/membershipGiftingDetails/giftMembershipsCount")
                                .and_then(|v| v.as_u64())
                                .map(|c| c as f64);
                            emit_alert(
                                &app,
                                yt_alert(
                                    source,
                                    "subgift",
                                    yt_author(item),
                                    count,
                                    None,
                                    item.pointer("/snippet/membershipGiftingDetails/giftMembershipsLevelName")
                                        .and_then(|v| v.as_str())
                                        .map(String::from),
                                    None,
                                ),
                            );
                        }
                        _ => {
                            let text = item
                                .pointer("/snippet/displayMessage")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string();
                            if text.is_empty() {
                                continue;
                            }
                            let author = item
                                .pointer("/authorDetails/displayName")
                                .and_then(|v| v.as_str())
                                .unwrap_or("anon")
                                .to_string();
                            let mut badges = vec![];
                            let flag = |k: &str| {
                                item.pointer(&format!("/authorDetails/{k}"))
                                    .and_then(|v| v.as_bool())
                                    == Some(true)
                            };
                            if flag("isChatOwner") {
                                badges.push(ChatBadge { label: "HOST".into(), kind: "broadcaster".into() });
                            }
                            if flag("isChatModerator") {
                                badges.push(ChatBadge { label: "MOD".into(), kind: "moderator".into() });
                            }
                            if flag("isChatSponsor") {
                                badges.push(ChatBadge { label: "MEMBRO".into(), kind: "subscriber".into() });
                            }
                            emit_chat(
                                &app,
                                ChatMessage {
                                    id: next_id(),
                                    platform: "youtube".into(),
                                    source: source.to_string(),
                                    author,
                                    native_id: item.get("id").and_then(|v| v.as_str()).map(String::from),
                                    color: None,
                                    fragments: vec![text_frag(&text)],
                                    badges,
                                    text,
                                    ts: now_ms(),
                                },
                            );
                        }
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
    chat_status(&app, "youtube", source, "disconnected");
}

// ------------------------------- Kick ------------------------------

/// Devolve (chatroom_id, channel_id). O chatroom carrega o chat; o channel, os alertas (subs).
fn get_kick_ids(slug: &str) -> Option<(u64, u64)> {
    let url = format!("https://kick.com/api/v2/channels/{slug}");
    let body = ureq::get(&url)
        .timeout(Duration::from_secs(6))
        .set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36")
        .set("Accept", "application/json")
        .call()
        .ok()?
        .into_string()
        .ok()?;
    let v: Value = serde_json::from_str(&body).ok()?;
    let chatroom = v.pointer("/chatroom/id").and_then(|x| x.as_u64())?;
    let channel = v.get("id").and_then(|x| x.as_u64()).unwrap_or(0);
    Some((chatroom, channel))
}

fn run_kick(slug: &str, source: &str, running: Arc<AtomicBool>, app: AppHandle) {
    let slug = slug.trim().trim_start_matches('@').to_lowercase();
    if slug.is_empty() {
        return;
    }
    let (chatroom_id, channel_id) = match get_kick_ids(&slug) {
        Some(ids) => ids,
        None => {
            log::warn!("kick chat ({source}): chatroom não resolvido (Cloudflare?)");
            chat_status(&app, "kick", source, "error");
            return;
        }
    };
    let url = "wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=corneta&version=1.0&flash=false";
    let mut socket = match tungstenite::connect(url) {
        Ok((s, _)) => s,
        Err(e) => {
            log::warn!("kick chat ({source}): pusher {e}");
            chat_status(&app, "kick", source, "error");
            return;
        }
    };
    if let tungstenite::stream::MaybeTlsStream::Rustls(s) = socket.get_mut() {
        let _ = s.sock.set_read_timeout(Some(Duration::from_millis(400)));
    }
    let _ = socket.send(Message::Text(format!(
        "{{\"event\":\"pusher:subscribe\",\"data\":{{\"auth\":\"\",\"channel\":\"chatrooms.{chatroom_id}.v2\"}}}}"
    )));
    // Canal de eventos (subs/gifts/host) — separado do chatroom.
    if channel_id != 0 {
        let _ = socket.send(Message::Text(format!(
            "{{\"event\":\"pusher:subscribe\",\"data\":{{\"auth\":\"\",\"channel\":\"channel.{channel_id}\"}}}}"
        )));
    }
    log::info!("kick chat: conectado em {slug} (chatroom {chatroom_id})");
    chat_status(&app, "kick", source, "connected");

    while running.load(Ordering::Relaxed) {
        match socket.read() {
            Ok(Message::Text(t)) => {
                if t.contains("pusher:ping") {
                    let _ = socket.send(Message::Text("{\"event\":\"pusher:pong\",\"data\":{}}".into()));
                } else if let Some(msg) = parse_kick(&t, source) {
                    emit_chat(&app, msg);
                } else if let Some(alert) = parse_kick_alert(&t, source) {
                    emit_alert(&app, alert);
                } else {
                    let _ = handle_kick_moderation(&t, source, &app);
                }
            }
            Ok(Message::Close(_)) => break,
            Ok(_) => {}
            Err(tungstenite::Error::Io(e))
                if matches!(e.kind(), std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut) =>
            {
                continue;
            }
            Err(_) => break,
        }
    }
    let _ = socket.close(None);
    chat_status(&app, "kick", source, "disconnected");
}

fn parse_kick(raw: &str, source: &str) -> Option<ChatMessage> {
    let v: Value = serde_json::from_str(raw).ok()?;
    if !v.get("event")?.as_str()?.ends_with("ChatMessageEvent") {
        return None;
    }
    let d: Value = serde_json::from_str(v.get("data")?.as_str()?).ok()?;
    let content = d.get("content")?.as_str()?.to_string();
    if content.is_empty() {
        return None;
    }
    let author = d
        .pointer("/sender/username")
        .and_then(|x| x.as_str())
        .unwrap_or("anon")
        .to_string();
    let color = d
        .pointer("/sender/identity/color")
        .and_then(|x| x.as_str())
        .filter(|c| !c.is_empty())
        .map(String::from);
    let fragments = kick_fragments(&content);
    Some(ChatMessage {
        id: next_id(),
        platform: "kick".into(),
        source: source.to_string(),
        author,
        native_id: d.get("id").and_then(|x| x.as_str()).map(String::from),
        color,
        text: frags_to_text(&fragments),
        badges: kick_badges(d.pointer("/sender/identity/badges")),
        fragments,
        ts: now_ms(),
    })
}

fn handle_kick_moderation(raw: &str, source: &str, app: &AppHandle) -> Option<()> {
    let v: Value = serde_json::from_str(raw).ok()?;
    let event = v.get("event")?.as_str()?;
    let d: Value = serde_json::from_str(v.get("data")?.as_str()?).ok()?;
    if event.ends_with("MessageDeletedEvent") {
        let id = d.pointer("/message/id").and_then(|x| x.as_str())?;
        delete_message(app, "kick", id);
    } else if event.ends_with("UserBannedEvent") {
        let u = d.pointer("/user/username").and_then(|x| x.as_str())?;
        delete_user(app, "kick", source, u);
    }
    Some(())
}

/// Subs/gifts/host do Kick (vêm no canal `channel.{id}`) → alerta.
fn parse_kick_alert(raw: &str, source: &str) -> Option<Alert> {
    let v: Value = serde_json::from_str(raw).ok()?;
    let event = v.get("event")?.as_str()?;
    let d: Value = serde_json::from_str(v.get("data")?.as_str()?).ok()?;
    let mk = |kind: &str, user: String, amount: Option<f64>| Alert {
        id: next_id(),
        platform: "kick".into(),
        source: source.to_string(),
        kind: kind.into(),
        user,
        amount,
        currency: None,
        tier: None,
        message: None,
        ts: now_ms(),
    };
    if event.ends_with("SubscriptionEvent") {
        let user = d.get("username").and_then(|x| x.as_str()).unwrap_or("alguém").to_string();
        Some(mk("sub", user, d.get("months").and_then(|x| x.as_u64()).map(|m| m as f64)))
    } else if event.ends_with("GiftedSubscriptionsEvent") {
        let user = d.get("gifter_username").and_then(|x| x.as_str()).unwrap_or("alguém").to_string();
        let count = d.get("gifted_usernames").and_then(|x| x.as_array()).map(|a| a.len() as f64);
        Some(mk("subgift", user, count))
    } else if event.ends_with("StreamHostEvent") {
        let user = d.get("host_username").and_then(|x| x.as_str()).unwrap_or("alguém").to_string();
        Some(mk("raid", user, d.get("number_viewers").and_then(|x| x.as_u64()).map(|m| m as f64)))
    } else {
        None
    }
}

fn kick_fragments(content: &str) -> Vec<ChatFragment> {
    let mut frags = vec![];
    let mut rest = content;
    while let Some(start) = rest.find("[emote:") {
        if start > 0 {
            frags.push(text_frag(&rest[..start]));
        }
        let after = &rest[start..];
        if let Some(end) = after.find(']') {
            let inner = &after[7..end];
            let mut it = inner.splitn(2, ':');
            let id = it.next().unwrap_or("");
            let name = it.next().unwrap_or("");
            if !id.is_empty() {
                frags.push(ChatFragment {
                    kind: "emote".into(),
                    text: Some(if name.is_empty() { id.to_string() } else { name.to_string() }),
                    url: Some(format!("https://files.kick.com/emotes/{id}/fullsize")),
                });
            }
            rest = &after[end + 1..];
        } else {
            frags.push(text_frag(after));
            rest = "";
            break;
        }
    }
    if !rest.is_empty() {
        frags.push(text_frag(rest));
    }
    if frags.is_empty() {
        frags.push(text_frag(content));
    }
    frags
}

// ----------------------- Viewers (contagem unificada) -----------------------

/// Viewers da Twitch via GQL público (sem login) — `null` se offline.
fn twitch_viewers(channel: &str) -> Option<u64> {
    let ch = channel.trim().trim_start_matches('#').to_lowercase();
    if ch.is_empty() {
        return None;
    }
    let body = json!({
        "query": format!("query {{ user(login: \"{ch}\") {{ stream {{ viewersCount }} }} }}")
    })
    .to_string();
    let resp = ureq::post("https://gql.twitch.tv/gql")
        .set("Client-Id", "kimne78kx3ncx6brgo4mv6wki5h1ko")
        .set("Content-Type", "application/json")
        .timeout(Duration::from_secs(6))
        .send_string(&body)
        .ok()?
        .into_string()
        .ok()?;
    let v: Value = serde_json::from_str(&resp).ok()?;
    v.pointer("/data/user/stream/viewersCount").and_then(|x| x.as_u64())
}

/// `concurrentViewers` de um vídeo já conhecido (chamada barata da Data API).
fn yt_concurrent(api_key: &str, vid: &str) -> Option<u64> {
    let url = format!(
        "https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id={vid}&key={api_key}"
    );
    let body = ureq::get(&url).timeout(Duration::from_secs(6)).call().ok()?.into_string().ok()?;
    let v: Value = serde_json::from_str(&body).ok()?;
    v.pointer("/items/0/liveStreamingDetails/concurrentViewers")
        .and_then(|x| x.as_str())
        .and_then(|s| s.parse::<u64>().ok())
}

/// Viewers do YouTube reusando o video_id resolvido entre polls (evita re-raspar a /live).
fn youtube_viewers(
    api_key: &str,
    channel: &str,
    cache: &mut std::collections::HashMap<String, String>,
) -> Option<u64> {
    if api_key.trim().is_empty() {
        return None;
    }
    if let Some(vid) = cache.get(channel) {
        if let Some(n) = yt_concurrent(api_key, vid) {
            return Some(n);
        }
        cache.remove(channel);
    }
    let vid = match resolve_youtube_video(channel, api_key) {
        LiveResolve::Video(v) => v,
        _ => return None,
    };
    let n = yt_concurrent(api_key, &vid);
    if n.is_some() {
        cache.insert(channel.to_string(), vid);
    }
    n
}

/// Viewers do Kick (`livestream.viewer_count`) — `null` se offline.
fn kick_viewers(slug: &str) -> Option<u64> {
    let slug = slug.trim().trim_start_matches('@').to_lowercase();
    if slug.is_empty() {
        return None;
    }
    let url = format!("https://kick.com/api/v2/channels/{slug}");
    let body = ureq::get(&url)
        .set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36")
        .set("Accept", "application/json")
        .timeout(Duration::from_secs(6))
        .call()
        .ok()?
        .into_string()
        .ok()?;
    let v: Value = serde_json::from_str(&body).ok()?;
    v.pointer("/livestream/viewer_count").and_then(|x| x.as_u64())
}

/// Poll periódico das fontes → emite `viewers://update` com o total + por fonte.
fn run_viewers(
    sources: Vec<crate::config::ChatSource>,
    api_key: String,
    running: Arc<AtomicBool>,
    app: AppHandle,
) {
    let mut yt_cache: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    while running.load(Ordering::Relaxed) {
        let mut items = vec![];
        let mut total: u64 = 0;
        let mut any_live = false;
        for src in &sources {
            if !running.load(Ordering::Relaxed) {
                return;
            }
            let label = if src.name.trim().is_empty() {
                src.value.clone()
            } else {
                src.name.clone()
            };
            let count = match src.platform.as_str() {
                "twitch" => twitch_viewers(&src.value),
                "youtube" => youtube_viewers(&api_key, &src.value, &mut yt_cache),
                "kick" => kick_viewers(&src.value),
                _ => None,
            };
            if let Some(v) = count {
                total += v;
                any_live = true;
            }
            items.push(json!({
                "platform": src.platform,
                "source": label,
                "viewers": count,
                "live": count.is_some(),
            }));
        }
        if let Some(p) = session_path(&app) {
            crate::session::record_viewers(&p, total, &items);
        }
        let _ = app.emit(
            "viewers://update",
            json!({ "total": total, "anyLive": any_live, "items": items }),
        );
        // Espera ~30 s, checando o running.
        for _ in 0..150 {
            if !running.load(Ordering::Relaxed) {
                return;
            }
            thread::sleep(Duration::from_millis(200));
        }
    }
}

fn kick_badges(badges: Option<&Value>) -> Vec<ChatBadge> {
    let Some(arr) = badges.and_then(|v| v.as_array()) else {
        return vec![];
    };
    arr.iter()
        .filter_map(|b| {
            let kind = b.get("type").and_then(|x| x.as_str()).unwrap_or("");
            let text = b.get("text").and_then(|x| x.as_str()).unwrap_or("");
            let label = match kind {
                "broadcaster" => "HOST".to_string(),
                "moderator" => "MOD".to_string(),
                "vip" => "VIP".to_string(),
                "subscriber" => "SUB".to_string(),
                "founder" => "FND".to_string(),
                "og" => "OG".to_string(),
                "verified" => "✓".to_string(),
                _ if !text.is_empty() => text.to_uppercase(),
                _ => return None,
            };
            let kind = if kind.is_empty() { "subscriber" } else { kind };
            Some(ChatBadge { label, kind: kind.to_string() })
        })
        .collect()
}
