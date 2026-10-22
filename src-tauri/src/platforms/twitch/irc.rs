//! Twitch IRC lines into chat events: messages, GIFs, notices, room state and moderation.

use serde_json::{json, Map, Value};
use std::collections::HashMap;

use super::assets::ChannelAssets;
use crate::chat::{
    enrich_frags, next_id, now_ms, rich_text_frags, Alert, ChatBadge, ChatFragment, ChatMessage,
    ReplyContext,
};
use crate::i18n::Msg;
use crate::platforms::emotes::apply_thirdparty;

pub(crate) struct IrcLine<'a> {
    tags: HashMap<&'a str, String>,
    pub nick: &'a str,
    pub command: &'a str,
    pub trailing: Option<&'a str>,
}

impl IrcLine<'_> {
    /// A tag value, unescaped; empty values count as absent.
    pub fn tag(&self, key: &str) -> Option<&str> {
        self.tags
            .get(key)
            .map(String::as_str)
            .filter(|v| !v.is_empty())
    }
}

/// IRCv3 tag values escape spaces, semicolons and backslashes.
fn unescape_tag(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    let mut chars = value.chars();
    while let Some(c) = chars.next() {
        if c != '\\' {
            out.push(c);
            continue;
        }
        match chars.next() {
            Some('s') => out.push(' '),
            Some(':') => out.push(';'),
            Some('\\') => out.push('\\'),
            Some('r') => out.push('\r'),
            Some('n') => out.push('\n'),
            Some(other) => out.push(other),
            None => {}
        }
    }
    out
}

pub(crate) fn parse_line(line: &str) -> Option<IrcLine<'_>> {
    let mut rest = line.trim_end_matches(['\r', '\n']);
    let mut tags = HashMap::new();
    if let Some(stripped) = rest.strip_prefix('@') {
        let (raw, after) = stripped.split_once(' ')?;
        for kv in raw.split(';') {
            // GIF URLs contain '=', so only the first one separates key and value.
            let (k, v) = kv.split_once('=').unwrap_or((kv, ""));
            tags.insert(k, unescape_tag(v));
        }
        rest = after;
    }
    let mut nick = "";
    if let Some(stripped) = rest.strip_prefix(':') {
        let (prefix, after) = stripped.split_once(' ')?;
        nick = prefix.split('!').next().unwrap_or("");
        rest = after;
    }
    let (head, trailing) = match rest.split_once(" :") {
        Some((head, trailing)) => (head, Some(trailing)),
        None => (rest, None),
    };
    let command = head.split(' ').next().unwrap_or("");
    Some(IrcLine {
        tags,
        nick,
        command,
        trailing,
    })
}

pub(crate) enum TwitchEvent {
    Message(ChatMessage),
    Alert(Alert),
    Delete(String),
    DeleteUser {
        login: String,
        user_id: Option<String>,
        seconds: Option<u64>,
    },
    Clear,
    Modes(Value),
}

pub(crate) fn line_events(line: &str, source: &str, assets: &ChannelAssets) -> Vec<TwitchEvent> {
    let Some(irc) = parse_line(line) else {
        return Vec::new();
    };
    let mut events = Vec::new();
    match irc.command {
        "PRIVMSG" => {
            if let Some(bits) = irc.tag("bits").and_then(|v| v.parse::<f64>().ok()) {
                if bits > 0.0 && !is_shared(&irc) {
                    events.push(TwitchEvent::Alert(Alert {
                        id: next_id(),
                        platform: "twitch".into(),
                        source: source.to_string(),
                        kind: "bits".into(),
                        user: author_name(&irc),
                        amount: Some(bits),
                        ts: now_ms(),
                        ..Default::default()
                    }));
                }
            }
            events.extend(privmsg(&irc, source, assets).map(TwitchEvent::Message));
        }
        "USERNOTICE" => events.extend(usernotice(&irc, source, assets)),
        "CLEARMSG" => {
            if let Some(id) = irc.tag("target-msg-id") {
                events.push(TwitchEvent::Delete(id.to_string()));
            }
        }
        "CLEARCHAT" => match irc.trailing.map(str::trim).filter(|u| !u.is_empty()) {
            Some(login) => events.push(TwitchEvent::DeleteUser {
                login: login.to_string(),
                user_id: irc.tag("target-user-id").map(String::from),
                seconds: irc.tag("ban-duration").and_then(|v| v.parse().ok()),
            }),
            None => events.push(TwitchEvent::Clear),
        },
        "ROOMSTATE" => {
            let modes = room_modes(&irc);
            if !modes.is_empty() {
                events.push(TwitchEvent::Modes(Value::Object(modes)));
            }
        }
        "NOTICE" => events.extend(notice(&irc, source).map(TwitchEvent::Message)),
        _ => {}
    }
    events
}

fn author_name(irc: &IrcLine) -> String {
    irc.tag("display-name")
        .or_else(|| irc.tag("login"))
        .or(Some(irc.nick).filter(|n| !n.is_empty()))
        .map(String::from)
        .unwrap_or_else(|| Msg::ChatUnknownUser.now())
}

/// The channel's numeric ID, which ROOMSTATE carries right after joining.
pub(crate) fn room_id(line: &str) -> Option<String> {
    parse_line(line)?.tag("room-id").map(String::from)
}

pub(crate) fn is_ping(line: &str) -> bool {
    parse_line(line).is_some_and(|irc| irc.command == "PING")
}

/// Shared chat: the message was sent in another channel of the session.
fn is_shared(irc: &IrcLine) -> bool {
    matches!((irc.tag("source-room-id"), irc.tag("room-id")), (Some(a), Some(b)) if a != b)
}

fn privmsg(irc: &IrcLine, source: &str, assets: &ChannelAssets) -> Option<ChatMessage> {
    let raw = irc.trailing?;
    // /me arrives as a CTCP ACTION; emote positions count from inside it.
    let (text, action) = match raw
        .strip_prefix("\u{1}ACTION ")
        .map(|s| s.strip_suffix('\u{1}').unwrap_or(s))
    {
        Some(inner) => (inner.to_string(), true),
        None => (raw.to_string(), false),
    };
    if text.is_empty() {
        return None;
    }
    let shared = is_shared(irc);
    let mut fragments = message_fragments(&text, irc, assets);
    let msg_id = irc.tag("msg-id").unwrap_or("");
    if msg_id == "gigantified-emote-message" {
        if let Some(last) = fragments.iter_mut().rev().find(|f| f.kind == "emote") {
            last.giant = true;
        }
    }
    let reply = irc.tag("reply-parent-msg-body").map(|body| ReplyContext {
        author: irc
            .tag("reply-parent-display-name")
            .or_else(|| irc.tag("reply-parent-user-login"))
            .unwrap_or_default()
            .to_string(),
        text: body.to_string(),
    });
    let mut text = text;
    if let Some(parent) = irc.tag("reply-parent-user-login") {
        // Twitch prefixes replies with the parent's @login; the reply line already names them.
        let mention = format!("@{parent} ");
        if text.to_lowercase().starts_with(&mention.to_lowercase()) {
            text = text[mention.len()..].to_string();
            strip_leading_mention(&mut fragments, mention.len());
        }
    }
    let (highlight, note) = match msg_id {
        "highlighted-message" => (Some("highlighted"), None),
        "skip-subs-mode-message" => (Some("redeemed"), None),
        "animated-message" => (Some("effect"), irc.tag("animation-id")),
        "user-intro" => (Some("first"), None),
        _ if irc.tag("custom-reward-id").is_some() => (Some("redeemed"), None),
        _ if irc.tag("first-msg") == Some("1") => (Some("first"), None),
        _ if irc.tag("returning-chatter") == Some("1") => (Some("returning"), None),
        _ => (None, None),
    };
    let (badge_key, info_key) = if shared && irc.tag("source-badges").is_some() {
        ("source-badges", "source-badge-info")
    } else {
        ("badges", "badge-info")
    };
    Some(ChatMessage {
        id: next_id(),
        platform: "twitch".into(),
        source: source.to_string(),
        author: author_name(irc),
        author_id: irc.tag("user-id").map(String::from),
        native_id: irc.tag("id").map(String::from),
        color: irc.tag("color").map(String::from),
        text,
        fragments,
        badges: badges(irc.tag(badge_key), irc.tag(info_key), assets),
        ts: now_ms(),
        action,
        highlight: highlight.map(String::from),
        note: note.map(String::from),
        reply,
        shared,
        dedup_key: irc.tag("source-id").filter(|_| shared).map(String::from),
        ..Default::default()
    })
}

/// Drops the `@login ` Twitch adds in front of a reply from the first fragments.
fn strip_leading_mention(frags: &mut Vec<ChatFragment>, mut chars: usize) {
    while chars > 0 && !frags.is_empty() {
        let first = &mut frags[0];
        let text = first.text.clone().unwrap_or_default();
        let len = text.len();
        if len <= chars {
            chars -= len;
            frags.remove(0);
        } else {
            first.text = Some(text[chars..].to_string());
            first.kind = "text".into();
            first.url = None;
            chars = 0;
        }
    }
}

/// Text split by the native emote and GIF ranges, then third-party emotes, cheers, links and mentions.
fn message_fragments(text: &str, irc: &IrcLine, assets: &ChannelAssets) -> Vec<ChatFragment> {
    let mut ranges: Vec<(usize, usize, ChatFragment)> = Vec::new();
    for (start, end, id) in emote_ranges(irc.tag("emotes").unwrap_or("")) {
        ranges.push((
            start,
            end,
            ChatFragment {
                kind: "emote".into(),
                url: Some(format!(
                    "https://static-cdn.jtvnw.net/emoticons/v2/{id}/default/dark/2.0"
                )),
                ..Default::default()
            },
        ));
    }
    for (start, end, url) in gif_ranges(irc.tag("gifs").unwrap_or("")) {
        ranges.push((
            start,
            end,
            ChatFragment {
                kind: "gif".into(),
                url: Some(url),
                ..Default::default()
            },
        ));
    }
    let frags = ranged_fragments(text, ranges);
    let frags = apply_thirdparty(frags, &assets.thirdparty);
    let bits = irc
        .tag("bits")
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(0);
    let frags = if bits > 0 {
        assets.cheer_fragments(frags)
    } else {
        frags
    };
    enrich_frags(frags)
}

fn emote_ranges(tag: &str) -> Vec<(usize, usize, String)> {
    let mut out = Vec::new();
    for part in tag.split('/') {
        let Some((id, positions)) = part.split_once(':') else {
            continue;
        };
        if id.is_empty() || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
            continue;
        }
        for pos in positions.split(',') {
            if let Some((a, b)) = pos.split_once('-') {
                if let (Ok(a), Ok(b)) = (a.parse(), b.parse()) {
                    out.push((a, b, id.to_string()));
                }
            }
        }
    }
    out
}

/// `start-end|gifId|url`, comma separated; URLs may contain commas, so an entry only starts
/// where a position range does.
fn gif_ranges(tag: &str) -> Vec<(usize, usize, String)> {
    let mut entries: Vec<String> = Vec::new();
    for piece in tag.split(',') {
        let starts_entry = piece
            .split_once('|')
            .and_then(|(range, _)| range.split_once('-'))
            .is_some_and(|(a, b)| {
                !a.is_empty()
                    && !b.is_empty()
                    && a.bytes().all(|c| c.is_ascii_digit())
                    && b.bytes().all(|c| c.is_ascii_digit())
            });
        match entries.last_mut() {
            Some(last) if !starts_entry => {
                last.push(',');
                last.push_str(piece);
            }
            _ => entries.push(piece.to_string()),
        }
    }
    entries
        .iter()
        .filter_map(|entry| {
            let mut parts = entry.splitn(3, '|');
            let (a, b) = parts.next()?.split_once('-')?;
            let _id = parts.next()?;
            let url = parts.next()?;
            // GIPHY asks for the exact URL; only https hosts under giphy.com are rendered.
            let host_ok = url
                .strip_prefix("https://")
                .and_then(|rest| rest.split('/').next())
                .is_some_and(|host| host == "giphy.com" || host.ends_with(".giphy.com"));
            (host_ok
                && !url
                    .chars()
                    .any(|c| c.is_whitespace() || c.is_control() || c == '"'))
            .then(|| Some((a.parse().ok()?, b.parse().ok()?, url.to_string())))
            .flatten()
        })
        .collect()
}

/// Replaces character ranges (inclusive, in Unicode scalars) with their fragments.
fn ranged_fragments(
    text: &str,
    mut ranges: Vec<(usize, usize, ChatFragment)>,
) -> Vec<ChatFragment> {
    if ranges.is_empty() {
        return vec![crate::chat::text_frag(text)];
    }
    ranges.sort_by_key(|r| r.0);
    let chars: Vec<char> = text.chars().collect();
    let n = chars.len();
    let mut frags = Vec::new();
    let mut cursor = 0usize;
    for (a, b, mut frag) in ranges {
        if a >= n || a < cursor || b < a {
            continue;
        }
        if a > cursor {
            frags.push(crate::chat::text_frag(
                &chars[cursor..a].iter().collect::<String>(),
            ));
        }
        let end = (b + 1).min(n);
        frag.text = Some(chars[a..end].iter().collect());
        frags.push(frag);
        cursor = end;
    }
    if cursor < n {
        frags.push(crate::chat::text_frag(
            &chars[cursor..].iter().collect::<String>(),
        ));
    }
    frags
}

fn badges(tag: Option<&str>, info: Option<&str>, assets: &ChannelAssets) -> Vec<ChatBadge> {
    let Some(tag) = tag else {
        return Vec::new();
    };
    let months: HashMap<&str, &str> = info
        .unwrap_or("")
        .split(',')
        .filter_map(|kv| kv.split_once('/'))
        .collect();
    tag.split(',')
        .filter_map(|badge| {
            let (set, version) = badge.split_once('/').unwrap_or((badge, "1"));
            let art = assets.badge(set, version);
            let (label, kind) = match set {
                "broadcaster" => ("HOST", "broadcaster"),
                "moderator" | "lead_moderator" => ("MOD", "moderator"),
                "vip" => ("VIP", "vip"),
                "subscriber" => ("SUB", "subscriber"),
                "founder" => ("FND", "subscriber"),
                "premium" => ("PRIME", "premium"),
                "turbo" => ("TURBO", "premium"),
                "partner" => ("✓", "partner"),
                "staff" | "admin" | "global_mod" => ("STAFF", "staff"),
                "artist-badge" => ("ART", "artist"),
                _ if art.is_some() => ("", "other"),
                _ => return None,
            };
            let mut title = art.map(|a| a.title.clone());
            if let Some(n) = months
                .get(set)
                .filter(|_| matches!(set, "subscriber" | "founder"))
            {
                let base = title.unwrap_or_else(|| label.to_string());
                title = Some(
                    Msg::ChatBadgeMonths {
                        badge: &base,
                        months: n,
                    }
                    .now(),
                );
            }
            Some(ChatBadge {
                label: label.to_string(),
                kind: kind.to_string(),
                url: art.map(|a| a.url.clone()),
                title,
            })
        })
        .collect()
}

fn system_line(irc: &IrcLine, source: &str, text: String, shared: bool) -> ChatMessage {
    ChatMessage {
        id: next_id(),
        platform: "twitch".into(),
        source: source.to_string(),
        author: author_name(irc),
        author_id: irc.tag("user-id").map(String::from),
        fragments: rich_text_frags(&text),
        text,
        ts: now_ms(),
        system: true,
        shared,
        ..Default::default()
    }
}

fn notice_alert(irc: &IrcLine, source: &str, kind: &str) -> Alert {
    Alert {
        id: next_id(),
        platform: "twitch".into(),
        source: source.to_string(),
        kind: kind.into(),
        user: author_name(irc),
        ts: now_ms(),
        ..Default::default()
    }
}

fn param_f64(irc: &IrcLine, key: &str) -> Option<f64> {
    irc.tag(key).and_then(|v| v.parse().ok())
}

/// Twitch's announcement colors; PRIMARY follows the channel's own accent.
fn announcement_accent(color: Option<&str>) -> Option<String> {
    match color? {
        "BLUE" => Some("#00d6d6"),
        "GREEN" => Some("#00db84"),
        "ORANGE" => Some("#ffb31a"),
        "PURPLE" => Some("#9146ff"),
        _ => None,
    }
    .map(String::from)
}

fn usernotice(irc: &IrcLine, source: &str, assets: &ChannelAssets) -> Vec<TwitchEvent> {
    let Some(msg_id) = irc.tag("msg-id") else {
        return Vec::new();
    };
    let shared = is_shared(irc);
    let kind = if msg_id == "sharedchatnotice" {
        irc.tag("source-msg-id").unwrap_or(msg_id)
    } else {
        msg_id
    };
    let system = irc.tag("system-msg").unwrap_or("").trim().to_string();
    let user_text = irc.trailing.map(str::trim_end).filter(|t| !t.is_empty());
    let user_frags = user_text.map(|t| message_fragments(t, irc, assets));

    if kind == "announcement" {
        let Some(text) = user_text else {
            return Vec::new();
        };
        return vec![TwitchEvent::Message(ChatMessage {
            id: next_id(),
            platform: "twitch".into(),
            source: source.to_string(),
            author: author_name(irc),
            author_id: irc.tag("user-id").map(String::from),
            native_id: irc.tag("id").map(String::from),
            color: irc.tag("color").map(String::from),
            text: text.to_string(),
            fragments: user_frags.unwrap_or_default(),
            badges: badges(irc.tag("badges"), irc.tag("badge-info"), assets),
            ts: now_ms(),
            highlight: Some("announcement".into()),
            accent: announcement_accent(irc.tag("msg-param-color")),
            shared,
            ..Default::default()
        })];
    }
    // Payments in a partner channel are theirs; show them, but never count them as this channel's.
    if shared {
        return (!system.is_empty())
            .then(|| TwitchEvent::Message(system_line(irc, source, system, true)))
            .into_iter()
            .collect();
    }
    let tier = irc.tag("msg-param-sub-plan").map(|p| match p {
        "Prime" => "Prime".to_string(),
        "1000" => "T1".to_string(),
        "2000" => "T2".to_string(),
        "3000" => "T3".to_string(),
        other => other.to_string(),
    });
    let with_message = |mut alert: Alert| {
        if let (Some(text), Some(frags)) = (user_text, user_frags.clone()) {
            alert.message = Some(text.to_string());
            alert.fragments = frags;
        }
        alert.tier = tier.clone();
        TwitchEvent::Alert(alert)
    };
    match kind {
        "sub" => vec![with_message(Alert {
            amount: Some(1.0),
            ..notice_alert(irc, source, "sub")
        })],
        "resub" => vec![with_message(Alert {
            amount: param_f64(irc, "msg-param-cumulative-months"),
            ..notice_alert(irc, source, "resub")
        })],
        // Each gift of a community gift repeats here; the mystery gift already counted it.
        "subgift" if irc.tag("msg-param-community-gift-id").is_some() => Vec::new(),
        "subgift" => vec![with_message(Alert {
            amount: Some(1.0),
            message: irc
                .tag("msg-param-recipient-display-name")
                .map(|r| Msg::ChatGiftRecipient { recipient: r }.now()),
            ..notice_alert(irc, source, "subgift")
        })],
        "submysterygift" | "anonsubmysterygift" => vec![with_message(Alert {
            amount: param_f64(irc, "msg-param-mass-gift-count"),
            ..notice_alert(irc, source, "subgift")
        })],
        "giftpaidupgrade" | "anongiftpaidupgrade" | "primepaidupgrade" => {
            vec![with_message(Alert {
                title: irc.tag("msg-param-sender-name").map(String::from),
                ..notice_alert(irc, source, "upgrade")
            })]
        }
        "standardpayforward" | "communitypayforward" => vec![with_message(Alert {
            title: irc
                .tag("msg-param-prior-gifter-display-name")
                .map(String::from),
            ..notice_alert(irc, source, "payforward")
        })],
        "raid" => vec![TwitchEvent::Alert(Alert {
            user: irc
                .tag("msg-param-displayName")
                .map(String::from)
                .unwrap_or_else(|| author_name(irc)),
            amount: param_f64(irc, "msg-param-viewerCount"),
            ..notice_alert(irc, source, "raid")
        })],
        "unraid" => Vec::new(),
        "viewermilestone" => vec![with_message(Alert {
            amount: param_f64(irc, "msg-param-value"),
            ..notice_alert(irc, source, "streak")
        })],
        "bitsbadgetier" => vec![with_message(Alert {
            amount: param_f64(irc, "msg-param-threshold"),
            ..notice_alert(irc, source, "milestone")
        })],
        "charitydonation" => {
            let exponent = param_f64(irc, "msg-param-exponent").unwrap_or(0.0);
            vec![with_message(Alert {
                amount: param_f64(irc, "msg-param-donation-amount")
                    .map(|v| v / 10f64.powf(exponent)),
                currency: irc.tag("msg-param-donation-currency").map(String::from),
                title: irc.tag("msg-param-charity-name").map(String::from),
                ..notice_alert(irc, source, "charity")
            })]
        }
        // Everything else (mod anniversaries, gift matches, drops, new types) is still shown.
        _ => {
            let mut line = if system.is_empty() {
                author_name(irc)
            } else if kind == "modiversary" && !system.contains(&author_name(irc)) {
                format!("{} {system}", author_name(irc))
            } else {
                system
            };
            if let Some(text) = user_text {
                line.push_str(" — ");
                line.push_str(text);
            }
            vec![TwitchEvent::Message(system_line(irc, source, line, false))]
        }
    }
}

fn room_modes(irc: &IrcLine) -> Map<String, Value> {
    let mut modes = Map::new();
    let flag = |key: &str| irc.tag(key).map(|v| json!(v == "1"));
    let number = |key: &str| {
        irc.tag(key)
            .and_then(|v| v.parse::<i64>().ok())
            .map(|n| json!(n))
    };
    for (name, value) in [
        ("emoteOnly", flag("emote-only")),
        ("subsOnly", flag("subs-only")),
        ("uniqueChat", flag("r9k")),
        ("slow", number("slow")),
        ("followersOnly", number("followers-only")),
    ] {
        if let Some(value) = value {
            modes.insert(name.to_string(), value);
        }
    }
    modes
}

/// Twitch answers a rejected message (banned, slow mode, duplicate) with a NOTICE.
fn notice(irc: &IrcLine, source: &str) -> Option<ChatMessage> {
    let text = irc.trailing?.trim();
    if text.is_empty() || irc.tag("msg-id").is_none() {
        return None;
    }
    Some(ChatMessage {
        id: next_id(),
        platform: "twitch".into(),
        source: source.to_string(),
        author: String::new(),
        fragments: rich_text_frags(text),
        text: text.to_string(),
        ts: now_ms(),
        system: true,
        highlight: Some("error".into()),
        ..Default::default()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn assets() -> ChannelAssets {
        ChannelAssets::default()
    }

    fn message(line: &str) -> ChatMessage {
        match line_events(line, "canal", &assets())
            .into_iter()
            .find_map(|e| match e {
                TwitchEvent::Message(m) => Some(m),
                _ => None,
            }) {
            Some(m) => m,
            None => panic!("no message in {line}"),
        }
    }

    fn alerts(line: &str) -> Vec<Alert> {
        line_events(line, "canal", &assets())
            .into_iter()
            .filter_map(|e| match e {
                TwitchEvent::Alert(a) => Some(a),
                _ => None,
            })
            .collect()
    }

    #[test]
    fn privmsg_extracts_text_and_ignores_lines_without_messages() {
        let msg =
            message("@id=1 :fulano!fulano@fulano.tmi.twitch.tv PRIVMSG #canal :bora cornetar 😀");
        assert_eq!(msg.author, "fulano");
        assert_eq!(msg.text, "bora cornetar 😀");
        assert_eq!(msg.source, "canal");
        assert_eq!(msg.platform, "twitch");
        assert!(line_events("@id=1 :a!a@a PRIVMSG #c :", "s", &assets()).is_empty());
        assert!(line_events("PING :tmi.twitch.tv", "s", &assets()).is_empty());
        assert!(is_ping("PING :tmi.twitch.tv"));
        assert!(!is_ping("@id=1 :a!a@a PRIVMSG #c :PING"));
    }

    #[test]
    fn tag_lookup_matches_the_exact_key_not_its_prefix() {
        let irc = parse_line("@id=abc;bits=100;idade=9 :a!a@a PRIVMSG #c :x").unwrap();
        assert_eq!(irc.tag("id"), Some("abc"));
        assert_eq!(irc.tag("bits"), Some("100"));
        assert_eq!(irc.tag("nao-existe"), None);
        assert_eq!(
            parse_line("@id=;bits= :a PRIVMSG #c :x")
                .unwrap()
                .tag("bits"),
            None
        );
    }

    #[test]
    fn twitch_parsers_tolerate_hostile_network_fixtures() {
        for case in crate::chat::hostile_chat_corpus() {
            let _ = line_events(&case, "fonte", &assets());
            let _ = room_id(&case);
        }
    }

    /// Run by hand with `CORNETA_LIVE_CHAT=1 cargo test --lib live_twitch -- --ignored --nocapture`;
    /// CI runs ignored tests too, and these depend on a third-party service.
    #[test]
    #[ignore = "talks to irc-ws.chat.twitch.tv"]
    fn live_twitch_lines_parse_into_events() {
        if std::env::var_os("CORNETA_LIVE_CHAT").is_none() {
            return;
        }
        use tungstenite::Message;
        crate::install_tls_provider();
        let channel = std::env::var("CORNETA_LIVE_TWITCH").unwrap_or_else(|_| "xqc".into());
        let (mut socket, _) =
            tungstenite::connect("wss://irc-ws.chat.twitch.tv:443").expect("twitch irc");
        for line in [
            "CAP REQ :twitch.tv/tags twitch.tv/commands".to_string(),
            "PASS SCHMOOPIIE".into(),
            "NICK justinfan54321".into(),
            format!("JOIN #{channel}"),
        ] {
            socket.send(Message::Text(line.into())).unwrap();
        }
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(40);
        let (mut messages, mut alerts, mut modes, mut other) = (0, 0, 0, 0);
        let mut kinds = std::collections::BTreeMap::<String, usize>::new();
        while std::time::Instant::now() < deadline && messages < 60 {
            let Ok(Message::Text(t)) = socket.read() else {
                continue;
            };
            for line in t
                .split(
                    "
",
                )
                .filter(|l| !l.is_empty())
            {
                for event in line_events(line, &channel, &assets()) {
                    match event {
                        TwitchEvent::Message(m) => {
                            messages += 1;
                            for f in &m.fragments {
                                *kinds.entry(f.kind.clone()).or_default() += 1;
                            }
                            if m.highlight.is_some() || m.reply.is_some() || m.system {
                                println!(
                                    "{:?} {:?} reply={} system={} {}",
                                    m.highlight,
                                    m.note,
                                    m.reply.is_some(),
                                    m.system,
                                    m.text
                                );
                            }
                        }
                        TwitchEvent::Alert(a) => {
                            alerts += 1;
                            println!("alert {} {} {:?}", a.kind, a.user, a.amount);
                        }
                        TwitchEvent::Modes(m) => {
                            modes += 1;
                            println!("modes {m}");
                        }
                        _ => other += 1,
                    }
                }
            }
        }
        println!(
            "messages {messages} alerts {alerts} modes {modes} other {other} fragments {kinds:?}"
        );
        assert!(messages > 0 && modes > 0);
    }

    #[test]
    fn tags_are_unescaped_and_split_on_the_first_equals() {
        let irc = parse_line(
            r"@system-msg=5\sraiders\sfrom\sx;a\:b=c\\d;url=https://x/?a=1&b=2 :tmi.twitch.tv USERNOTICE #c",
        )
        .unwrap();
        assert_eq!(irc.tag("system-msg"), Some("5 raiders from x"));
        assert_eq!(irc.tag("url"), Some("https://x/?a=1&b=2"));
        assert_eq!(irc.command, "USERNOTICE");
    }

    #[test]
    fn gifs_become_gif_fragments_with_the_exact_url() {
        let m = message(
            "@badge-info=subscriber/30;badges=broadcaster/1,subscriber/0;color=#033700;display-name=TwitchDev;emotes=;first-msg=0;gifs=0-33|joSNxeswxuc74Juo8X|https://media4.giphy.com/media/joSNxeswxuc74Juo8X/giphy.gif?cid=095d7a5d&ep=v1_gifs_trending&rid=giphy.gif&ct=g;id=401abf17;room-id=12826;user-id=141981764 :twitchdev!twitchdev@twitchdev.tmi.twitch.tv PRIVMSG #twitch :[Y A Y Yes GIF by Djemilah Birnie]",
        );
        assert_eq!(m.fragments.len(), 1);
        let gif = &m.fragments[0];
        assert_eq!(gif.kind, "gif");
        assert_eq!(
            gif.text.as_deref(),
            Some("[Y A Y Yes GIF by Djemilah Birnie]")
        );
        assert_eq!(
            gif.url.as_deref(),
            Some("https://media4.giphy.com/media/joSNxeswxuc74Juo8X/giphy.gif?cid=095d7a5d&ep=v1_gifs_trending&rid=giphy.gif&ct=g")
        );
        assert_eq!(
            m.badges[1].title.as_deref(),
            Some(
                Msg::ChatBadgeMonths {
                    badge: "SUB",
                    months: "30"
                }
                .now()
                .as_str()
            )
        );
    }

    #[test]
    fn gif_urls_with_commas_stay_whole_and_other_hosts_are_dropped() {
        assert_eq!(
            gif_ranges(
                "0-3|a|https://media.giphy.com/x.gif?a=1,2,5-9|b|https://evil.example/x.gif"
            ),
            vec![(0, 3, "https://media.giphy.com/x.gif?a=1,2".to_string())]
        );
    }

    #[test]
    fn me_replies_and_highlights_are_marked() {
        let m = message("@id=1;display-name=Ana;first-msg=1;emotes=25:0-4 :ana!ana@ana PRIVMSG #c :\u{1}ACTION Kappa dança\u{1}");
        assert!(m.action);
        assert_eq!(m.highlight.as_deref(), Some("first"));
        assert_eq!(m.fragments[0].kind, "emote");
        let reply = message(
            r"@id=2;display-name=Bia;reply-parent-display-name=Ana;reply-parent-user-login=ana;reply-parent-msg-body=oi\sgente :bia!bia@bia PRIVMSG #c :@ana olá",
        );
        assert_eq!(reply.text, "olá");
        assert_eq!(
            reply.reply.as_ref().map(|r| r.text.as_str()),
            Some("oi gente")
        );
        let effect =
            message("@id=3;msg-id=animated-message;animation-id=simmer :a!a@a PRIVMSG #c :brilha");
        assert_eq!(effect.highlight.as_deref(), Some("effect"));
        assert_eq!(effect.note.as_deref(), Some("simmer"));
        let giant = message(
            "@id=4;msg-id=gigantified-emote-message;emotes=25:4-8 :a!a@a PRIVMSG #c :olha Kappa",
        );
        assert!(giant.fragments.iter().any(|f| f.giant));
    }

    #[test]
    fn links_and_mentions_are_fragments() {
        let m = message("@id=5 :a!a@a PRIVMSG #c :vai em https://corneta.live e chama @Bia!");
        let kinds: Vec<&str> = m.fragments.iter().map(|f| f.kind.as_str()).collect();
        assert!(kinds.contains(&"link"));
        assert!(kinds.contains(&"mention"));
    }

    #[test]
    fn shared_chat_messages_are_marked_and_their_payments_are_not_counted() {
        let m = message("@id=6;room-id=1;source-room-id=2;source-id=abc;source-badges=moderator/1 :a!a@a PRIVMSG #c :oi");
        assert!(m.shared);
        assert_eq!(m.badges[0].kind, "moderator");
        let events = line_events(
            r"@msg-id=sharedchatnotice;source-msg-id=sub;room-id=1;source-room-id=2;system-msg=Ana\ssubscribed :tmi.twitch.tv USERNOTICE #c",
            "canal",
            &assets(),
        );
        assert!(events.iter().all(|e| !matches!(e, TwitchEvent::Alert(_))));
    }

    #[test]
    fn notices_cover_every_type_without_double_counting_gifts() {
        assert!(alerts("@msg-id=subgift;msg-param-community-gift-id=9;display-name=A :tmi.twitch.tv USERNOTICE #c").is_empty());
        assert_eq!(alerts("@msg-id=submysterygift;msg-param-mass-gift-count=5;display-name=A :tmi.twitch.tv USERNOTICE #c")[0].amount, Some(5.0));
        let streak = &alerts("@msg-id=viewermilestone;msg-param-category=watch-streak;msg-param-value=7;display-name=A :tmi.twitch.tv USERNOTICE #c :sete!")[0];
        assert_eq!((streak.kind.as_str(), streak.amount), ("streak", Some(7.0)));
        let charity = &alerts("@msg-id=charitydonation;msg-param-donation-amount=1500;msg-param-exponent=2;msg-param-donation-currency=BRL;msg-param-charity-name=Ação;display-name=A :tmi.twitch.tv USERNOTICE #c")[0];
        assert_eq!(
            (charity.amount, charity.currency.as_deref()),
            (Some(15.0), Some("BRL"))
        );
        let upgrade = &alerts("@msg-id=giftpaidupgrade;msg-param-sender-name=Bia;display-name=A :tmi.twitch.tv USERNOTICE #c")[0];
        assert_eq!(upgrade.kind, "upgrade");
        let announcement = message("@msg-id=announcement;msg-param-color=PURPLE;display-name=A;id=7 :tmi.twitch.tv USERNOTICE #c :atenção");
        assert_eq!(announcement.highlight.as_deref(), Some("announcement"));
        assert_eq!(announcement.accent.as_deref(), Some("#9146ff"));
        let unknown = message(
            r"@msg-id=brandnewthing;display-name=A;system-msg=A\sdid\sa\sthing :tmi.twitch.tv USERNOTICE #c",
        );
        assert!(unknown.system);
        assert_eq!(unknown.text, "A did a thing");
    }

    #[test]
    fn room_state_and_moderation() {
        let events = line_events("@emote-only=0;followers-only=10;r9k=0;room-id=1;slow=30;subs-only=1 :tmi.twitch.tv ROOMSTATE #c", "c", &assets());
        let modes = events.iter().find_map(|e| match e {
            TwitchEvent::Modes(m) => Some(m.clone()),
            _ => None,
        });
        assert_eq!(
            modes,
            Some(
                json!({ "emoteOnly": false, "followersOnly": 10, "uniqueChat": false, "slow": 30, "subsOnly": true })
            )
        );
        let events = line_events(
            "@ban-duration=600;room-id=1;target-user-id=42 :tmi.twitch.tv CLEARCHAT #c :ana",
            "c",
            &assets(),
        );
        assert!(events.iter().any(|e| matches!(e, TwitchEvent::DeleteUser { login, user_id: Some(id), seconds: Some(600) } if login == "ana" && id == "42")));
        let rejected = message("@msg-id=msg_duplicate :tmi.twitch.tv NOTICE #c :Your message is identical to the one you sent less than 30 seconds ago.");
        assert_eq!(rejected.highlight.as_deref(), Some("error"));
    }
}
