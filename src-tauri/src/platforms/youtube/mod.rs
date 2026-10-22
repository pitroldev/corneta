//! YouTube: live chat over InnerTube or the Data API, viewers, the account and the automatic broadcast.

pub mod account;
mod audience;
mod broadcast;
pub mod chat;
mod error;

use serde_json::{json, Map, Value};
use tauri::AppHandle;

use super::provider::{
    status_fields, AccountProvider, AudienceReader, AudienceSetup, AutoBroadcast,
    AutoBroadcastFailure, ChatProvider, Connection, LoginOptions, Moderation, Outbox,
    OwnCredentials, ProvisionedIngest,
};
use crate::auth::{
    bootstrap_client_id, bootstrap_enabled, keep_client_id, own_creds, AccountChannel, OauthConfig,
};
use crate::chat::{emit_chat, next_id, now_ms, sanitize_outgoing, text_frag, ChatMessage};
use crate::config::{ChatSource, Settings};
use crate::i18n::Msg;

pub struct Youtube;

impl ChatProvider for Youtube {
    fn id(&self) -> &'static str {
        "youtube"
    }

    /// Offline channels poll less often.
    fn first_backoff(&self) -> u32 {
        100
    }

    fn connect(&self, c: &Connection) -> bool {
        // InnerTube can read without a Data API key.
        chat::run_youtube(
            &c.settings.youtube_api_key,
            &c.source.value,
            c.label,
            c.running.clone(),
            c.app.clone(),
            c.gen,
        )
    }

    fn sends_by_default(&self) -> bool {
        true
    }

    /// YouTube inserts into the signed-in user's live chat, so one send covers every source.
    fn sends_once(&self) -> bool {
        true
    }

    fn send(&self, out: &Outbox) -> Option<Result<(), String>> {
        let text = match out.reply {
            Some(reply) => sanitize_outgoing(&chat::youtube_reply_text(&reply.author, out.text)),
            None => out.text.to_string(),
        };
        // YouTube rejects messages longer than 200 characters.
        let text: String = text.chars().take(200).collect();
        Some(account::youtube_send(out.app, &text).map(|()| {
            emit_chat(
                out.app,
                ChatMessage {
                    id: next_id(),
                    platform: "youtube".into(),
                    source: out.label.to_string(),
                    author: Msg::ChatSelfAuthor.now(),
                    author_id: None,
                    native_id: None,
                    color: Some("#ffb323".into()),
                    text: text.clone(),
                    fragments: vec![text_frag(&text)],
                    badges: vec![],
                    ts: now_ms(),
                    ..Default::default()
                },
            );
        }))
    }

    fn audience(&self, setup: &AudienceSetup) -> Option<Box<dyn AudienceReader>> {
        Some(Box::new(audience::Reader::new(
            setup.app.clone(),
            setup.settings.youtube_api_key.clone(),
        )))
    }

    fn moderate(&self, app: &AppHandle, source: &ChatSource, m: Moderation) -> Result<(), String> {
        account::youtube_moderate(
            app,
            &source.value,
            &m.action,
            m.native_id,
            m.author_id,
            m.seconds,
        )
    }
}

impl AccountProvider for Youtube {
    fn set_official_client_id(&self, config: &mut OauthConfig, id: &str) {
        keep_client_id(&mut config.youtube_official_id, id);
    }

    fn auto_broadcast(&self) -> Option<&dyn AutoBroadcast> {
        Some(self)
    }

    fn own_credentials(&self) -> Option<&dyn OwnCredentials> {
        Some(self)
    }

    fn id(&self) -> &'static str {
        "youtube"
    }

    fn login_start(&self, app: &AppHandle, _options: LoginOptions) {
        account::youtube_login_start(app.clone());
    }

    fn logout(&self, app: &AppHandle) -> Result<(), String> {
        account::youtube_logout(app)
    }

    fn signed_in(&self) -> bool {
        crate::keys::has_key("youtube_refresh")
    }

    fn status(&self, _app: &AppHandle, cfg: &OauthConfig) -> Map<String, Value> {
        status_fields(json!({
            "youtube": self.signed_in(),
            "youtubeConfigured": cfg.youtube_direct || !cfg.google_client_secret.is_empty(),
            "youtubeOfficialReady": !cfg.youtube_official_id.is_empty(),
            "youtubeOwnCreds": own_creds("youtube_client_id", "youtube_client_secret").is_some(),
            "youtubeUsingOwnCreds": !cfg.google_client_secret.is_empty(),
        }))
    }

    fn signed_out_status(&self) -> Map<String, Value> {
        status_fields(json!({
            "youtube": false,
            "youtubeConfigured": false,
            "youtubeOfficialReady": false,
            "youtubeOwnCreds": false,
            "youtubeUsingOwnCreds": false,
        }))
    }

    /// Build-time IDs stay as the fallback when the setup API does not enable YouTube.
    fn apply_bootstrap(&self, entry: &Value, config: &mut OauthConfig) {
        if bootstrap_enabled(entry) {
            if let Some(id) = bootstrap_client_id(entry) {
                config.youtube_official_id = id;
            }
        }
    }

    fn apply_mode(&self, config: &mut OauthConfig) {
        account::apply_youtube_mode(config);
    }

    fn account_channel(&self, app: &AppHandle) -> Option<AccountChannel> {
        account::youtube_account_channel(app)
    }

    fn forget_account_channel(&self) {
        *account::YT_ACCOUNT_CHANNEL.lock().unwrap() = None;
    }

    fn set_stream_info(
        &self,
        app: &AppHandle,
        title: &str,
        _category: &str,
    ) -> Result<Option<String>, String> {
        account::youtube_set_title(app, title)
    }
}

impl OwnCredentials for Youtube {
    fn save(
        &self,
        app: &AppHandle,
        client_id: String,
        client_secret: String,
    ) -> Result<(), String> {
        account::set_youtube_oauth(app.clone(), client_id, client_secret)
    }

    fn clear(&self, app: &AppHandle) -> Result<(), String> {
        account::clear_youtube_oauth(app.clone())
    }

    fn use_official(&self, app: &AppHandle) -> Result<(), String> {
        account::youtube_use_official(app.clone())
    }

    fn use_saved(&self, app: &AppHandle) -> Result<(), String> {
        account::youtube_use_own_creds(app.clone())
    }
}

impl AutoBroadcast for Youtube {
    fn enabled(&self, settings: &Settings) -> bool {
        settings.youtube_auto_live && crate::keys::has_key("youtube_refresh")
    }

    fn open(
        &self,
        app: &AppHandle,
        settings: &Settings,
        generation: u64,
    ) -> Result<ProvisionedIngest, String> {
        let title = match settings.stream_title.trim() {
            "" => Msg::YoutubeDefaultBroadcastTitle.now(),
            title => title.to_string(),
        };
        let (url, key) = account::youtube_provision_broadcast(
            app,
            &title,
            &settings.youtube_privacy,
            settings.youtube_made_for_kids,
            generation,
        )?;
        Ok(ProvisionedIngest { url, key })
    }

    fn close(&self, app: &AppHandle, generation: u64) -> Result<(), String> {
        account::youtube_complete_active(app, generation)
    }

    fn open_failure(&self) -> AutoBroadcastFailure {
        AutoBroadcastFailure {
            error_code: "youtube_auto_provision_failed",
            title: Msg::NotifyYoutubeAutoFailedTitle.now(),
            body: Msg::NotifyYoutubeAutoFailedBody.now(),
            target_note: Msg::TargetYoutubeAutoFallback.now(),
            unknown_reason: Msg::AuthYoutubeBadResponse.now(),
        }
    }

    fn close_failure(&self) -> (String, String) {
        (
            Msg::NotifyYoutubeCleanupFailedTitle.now(),
            Msg::NotifyYoutubeCleanupFailedBody.now(),
        )
    }
}
