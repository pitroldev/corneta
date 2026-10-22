//! Kick: chat over Pusher, viewers, and the account signed in through the setup API broker.

pub mod account;
mod audience;
mod chat;

use serde_json::{json, Map, Value};
use tauri::AppHandle;

use super::provider::{
    status_fields, AccountProvider, AudienceReader, AudienceSetup, ChatProvider, Connection,
    LoginOptions, Moderation, Outbox, OwnCredentials, StreamKeyGrant,
};
use crate::auth::{
    bootstrap_client_id, bootstrap_enabled, keep_client_id, own_creds, AccountChannel, OauthConfig,
};
use crate::config::ChatSource;

pub struct Kick;

impl ChatProvider for Kick {
    fn id(&self) -> &'static str {
        "kick"
    }

    fn connect(&self, c: &Connection) -> bool {
        chat::run_kick(
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

    // Pusher echoes Kick messages, so local echo would duplicate them.
    fn send(&self, out: &Outbox) -> Option<Result<(), String>> {
        Some(account::kick_send(
            out.app,
            out.text,
            &out.source.value,
            out.reply_to,
        ))
    }

    fn audience(&self, _setup: &AudienceSetup) -> Option<Box<dyn AudienceReader>> {
        Some(Box::new(audience::Reader))
    }

    fn moderate(&self, app: &AppHandle, source: &ChatSource, m: Moderation) -> Result<(), String> {
        account::kick_moderate(
            app,
            &source.value,
            &m.action,
            m.native_id,
            m.author_id,
            m.seconds,
        )
    }
}

impl AccountProvider for Kick {
    fn set_official_client_id(&self, config: &mut OauthConfig, id: &str) {
        keep_client_id(&mut config.kick_official_id, id);
    }

    // Refresh without delaying startup to reduce mid-stream token expiry.
    fn before_go_live(&self, app: &AppHandle) {
        account::warm_kick_session(app);
    }

    fn own_credentials(&self) -> Option<&dyn OwnCredentials> {
        Some(self)
    }

    fn id(&self) -> &'static str {
        "kick"
    }

    fn login_start(&self, app: &AppHandle, options: LoginOptions) {
        account::kick_login_start(app.clone(), options);
    }

    fn logout(&self, app: &AppHandle) -> Result<(), String> {
        account::kick_logout(app)
    }

    fn fetch_stream_key(
        &self,
        app: &AppHandle,
        target_id: &str,
    ) -> Option<Result<StreamKeyGrant, String>> {
        Some(account::kick_fetch_stream_key(app, target_id))
    }

    fn signed_in(&self) -> bool {
        crate::keys::has_key("kick_refresh")
    }

    fn status(&self, _app: &AppHandle, cfg: &OauthConfig) -> Map<String, Value> {
        let kick = self.signed_in();
        status_fields(json!({
            "kick": kick,
            "kickConfigured": cfg.kick_brokered || !cfg.kick_client_secret.is_empty(),
            "kickOfficialReady": cfg.kick_broker_ready && !cfg.kick_official_id.is_empty(),
            "kickOwnCreds": own_creds("kick_client_id", "kick_client_secret").is_some(),
            "kickUsingOwnCreds": !cfg.kick_client_secret.is_empty(),
            "kickCanBan": kick && crate::keys::has_key(account::KICK_BAN_GRANT),
            "kickCanReadKey": kick && crate::keys::has_key(account::KICK_KEY_GRANT),
        }))
    }

    fn signed_out_status(&self) -> Map<String, Value> {
        status_fields(json!({
            "kick": false,
            "kickConfigured": false,
            "kickOfficialReady": false,
            "kickOwnCreds": false,
            "kickUsingOwnCreds": false,
            "kickCanBan": false,
            "kickCanReadKey": false,
        }))
    }

    /// Build-time IDs stay as the fallback when the setup API does not enable Kick.
    fn apply_bootstrap(&self, entry: &Value, config: &mut OauthConfig) {
        let enabled = bootstrap_enabled(entry);
        if enabled {
            if let Some(id) = bootstrap_client_id(entry) {
                config.kick_official_id = id;
            }
        }
        config.kick_broker_ready = enabled;
    }

    fn apply_mode(&self, config: &mut OauthConfig) {
        account::apply_kick_mode(config);
    }

    fn account_channel(&self, app: &AppHandle) -> Option<AccountChannel> {
        account::kick_account_channel(app)
    }

    fn forget_account_channel(&self) {
        *account::KICK_ACCOUNT_CHANNEL.lock().unwrap() = None;
    }

    fn set_stream_info(
        &self,
        app: &AppHandle,
        title: &str,
        category: &str,
    ) -> Result<Option<String>, String> {
        account::kick_set_info(app, title, category)
    }
}

impl OwnCredentials for Kick {
    fn save(
        &self,
        app: &AppHandle,
        client_id: String,
        client_secret: String,
    ) -> Result<(), String> {
        account::set_kick_oauth(app.clone(), client_id, client_secret)
    }

    fn clear(&self, app: &AppHandle) -> Result<(), String> {
        account::clear_kick_oauth(app.clone())
    }

    fn use_official(&self, app: &AppHandle) -> Result<(), String> {
        account::kick_use_official(app.clone())
    }

    fn use_saved(&self, app: &AppHandle) -> Result<(), String> {
        account::kick_use_own_creds(app.clone())
    }
}
