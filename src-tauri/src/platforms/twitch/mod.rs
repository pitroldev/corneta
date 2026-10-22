//! Twitch: IRC chat with third-party emotes, EventSub follows, viewers, and the account.

pub mod account;
mod audience;
mod chat;
mod emotes;
mod follows;

use serde_json::{json, Map, Value};
use tauri::AppHandle;

use super::provider::{
    status_fields, AccountProvider, AudienceReader, AudienceSetup, ChatProvider, ChatSession,
    Connection, LoginOptions, Moderation, Outbox, StreamKeyGrant,
};
use crate::auth::{bootstrap_client_id, keep_client_id, AccountChannel, OauthConfig};
use crate::chat::{source_label, Outgoing};
use crate::config::ChatSource;

pub struct Twitch;

impl ChatProvider for Twitch {
    fn id(&self) -> &'static str {
        "twitch"
    }

    fn connect(&self, c: &Connection) -> bool {
        // Resolve credentials on every connection so expired OAuth tokens can refresh.
        let token = crate::keys::get_key(&format!("chat_send_{}", c.source.id))
            .or_else(|| account::twitch_token(c.app));
        chat::run_twitch(
            &c.source.value,
            c.label,
            &c.source.id,
            token,
            c.running.clone(),
            c.app.clone(),
            c.gen,
        )
    }

    fn start_shared(&self, session: &ChatSession) {
        // One EventSub socket covers every Twitch channel; follows need the app's own login.
        let channels: Vec<follows::FollowChannel> = session
            .sources
            .iter()
            .map(|source| follows::FollowChannel {
                login: source.value.trim().to_lowercase(),
                label: source_label(source),
            })
            .collect();
        if channels.is_empty() || !crate::keys::has_key("twitch_oauth") {
            return;
        }
        let (app, running, gen) = (session.app.clone(), session.running.clone(), session.gen);
        tauri::async_runtime::spawn_blocking(move || follows::run(channels, running, app, gen));
    }

    fn send(&self, out: &Outbox) -> Option<Result<(), String>> {
        // Twitch writes over the source's authenticated IRC session, so only open sessions can send.
        let senders = out.senders.lock().unwrap();
        let tx = senders.get(&out.source.id)?;
        tx.send(Outgoing {
            text: out.text.to_string(),
            reply_to: out.reply_to.map(String::from),
        })
        .ok()
        .map(Ok)
    }

    fn audience(&self, _setup: &AudienceSetup) -> Option<Box<dyn AudienceReader>> {
        Some(Box::new(audience::Reader))
    }

    fn moderate(&self, app: &AppHandle, source: &ChatSource, m: Moderation) -> Result<(), String> {
        account::twitch_moderate(
            app,
            &source.value,
            &m.action,
            m.native_id,
            m.author,
            m.author_id,
            m.seconds,
        )
    }
}

impl AccountProvider for Twitch {
    fn set_official_client_id(&self, config: &mut OauthConfig, id: &str) {
        // Twitch's secret never reaches the app; device-code login needs only the ID.
        config.twitch_client_secret.clear();
        keep_client_id(&mut config.twitch_client_id, id);
    }

    fn id(&self) -> &'static str {
        "twitch"
    }

    fn login_start(&self, app: &AppHandle, _options: LoginOptions) {
        account::twitch_login_start(app.clone());
    }

    fn logout(&self, app: &AppHandle) -> Result<(), String> {
        account::twitch_logout(app)
    }

    fn fetch_stream_key(
        &self,
        app: &AppHandle,
        target_id: &str,
    ) -> Option<Result<StreamKeyGrant, String>> {
        Some(account::twitch_fetch_stream_key(app, target_id))
    }

    fn signed_in(&self) -> bool {
        crate::keys::has_key("twitch_oauth")
    }

    fn status(&self, app: &AppHandle, _cfg: &OauthConfig) -> Map<String, Value> {
        let info = account::twitch_token(app).and_then(|token| account::twitch_validate(&token));
        let missing = info
            .as_ref()
            .map(|info| account::missing_twitch_scopes(&info.scopes))
            .unwrap_or_default();
        status_fields(json!({
            "twitchLogin": info.map(|info| info.login),
            "twitchMissingScopes": missing,
        }))
    }

    fn signed_out_status(&self) -> Map<String, Value> {
        status_fields(json!({ "twitchLogin": null, "twitchMissingScopes": [] }))
    }

    fn apply_bootstrap(&self, entry: &Value, config: &mut OauthConfig) {
        if let Some(id) = bootstrap_client_id(entry) {
            config.twitch_client_id = id;
        }
    }

    fn account_channel(&self, app: &AppHandle) -> Option<AccountChannel> {
        account::twitch_token(app)
            .and_then(|token| account::twitch_validate(&token))
            .map(|info| AccountChannel {
                platform: "twitch",
                value: info.login.to_lowercase(),
                aliases: Vec::new(),
                name: String::new(),
            })
    }

    fn set_stream_info(
        &self,
        app: &AppHandle,
        title: &str,
        category: &str,
    ) -> Result<Option<String>, String> {
        account::twitch_set_info(app, title, category)
    }
}
