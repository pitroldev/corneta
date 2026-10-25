//! What a platform plugs into the shared chat runtime and the account layer.

use serde_json::{Map, Value};
use std::collections::HashMap;
use std::sync::atomic::AtomicBool;
use std::sync::{mpsc, Arc, Mutex};
use tauri::AppHandle;

use crate::auth::{AccountChannel, OauthConfig};
use crate::chat::{ChannelCounts, Outgoing, ReplyTo};
use crate::config::{ChatSource, Settings};
use crate::i18n::Msg;

/// One connection attempt for one chat source.
pub struct Connection<'a> {
    pub app: &'a AppHandle,
    pub gen: u64,
    pub running: &'a Arc<AtomicBool>,
    pub source: &'a ChatSource,
    /// The source's name, or its channel when it has none.
    pub label: &'a str,
    pub settings: &'a Settings,
}

/// Every enabled source of one provider in the current chat session.
pub struct ChatSession<'a> {
    pub app: &'a AppHandle,
    pub gen: u64,
    pub running: &'a Arc<AtomicBool>,
    pub sources: &'a [ChatSource],
}

/// One outgoing message for one source.
pub struct Outbox<'a> {
    pub app: &'a AppHandle,
    /// Send queues of sources whose session can write, keyed by source ID.
    pub senders: &'a Mutex<HashMap<String, mpsc::Sender<Outgoing>>>,
    pub source: &'a ChatSource,
    pub label: &'a str,
    pub text: &'a str,
    pub reply: Option<&'a ReplyTo>,
    /// The answered message's native ID, already checked to be safe to thread on.
    pub reply_to: Option<&'a str>,
}

pub struct Moderation {
    pub action: String,
    pub native_id: Option<String>,
    pub author: Option<String>,
    pub author_id: Option<String>,
    pub seconds: Option<u64>,
}

/// What an audience reader may keep for the whole chat session.
pub struct AudienceSetup<'a> {
    pub app: &'a AppHandle,
    pub running: &'a Arc<AtomicBool>,
    pub settings: &'a Settings,
    pub sources: &'a [ChatSource],
}

pub trait AudienceReader {
    fn begin_cycle(&mut self) {}
    /// None skips the source, as when a second source names a channel already read this cycle.
    fn read(&mut self, source: &ChatSource) -> Option<ChannelCounts>;
}

pub trait ChatProvider: Sync {
    fn id(&self) -> &'static str;
    /// Wait before reconnecting after a session that connected, in 200 ms ticks; it doubles up to 60 s.
    fn first_backoff(&self) -> u32 {
        15
    }
    /// One connection; true when it connected at least once.
    fn connect(&self, c: &Connection) -> bool;
    /// Work that covers every source of this provider at once, started with each chat session.
    fn start_shared(&self, _session: &ChatSession) {}
    /// Whether a message sent without explicit targets reaches this provider's sources over its API.
    fn sends_by_default(&self) -> bool {
        false
    }
    /// One send per signed-in account, however many sources point at it.
    fn sends_once(&self) -> bool {
        false
    }
    /// The login viewers @mention in this source's chat, when the source holds one.
    fn mention_login<'a>(&self, _source: &'a ChatSource) -> Option<&'a str> {
        None
    }
    /// None when this source cannot take the message right now.
    fn send(&self, _out: &Outbox) -> Option<Result<(), String>> {
        None
    }
    fn audience(&self, _setup: &AudienceSetup) -> Option<Box<dyn AudienceReader>> {
        None
    }
    fn moderate(
        &self,
        _app: &AppHandle,
        _source: &ChatSource,
        _m: Moderation,
    ) -> Result<(), String> {
        Err(Msg::ModeratePlatformUnsupported.now())
    }
}

/// The fields of a JSON object, for providers that build their status with `json!`.
pub fn status_fields(value: Value) -> Map<String, Value> {
    match value {
        Value::Object(fields) => fields,
        _ => Map::new(),
    }
}

/// What a sign-in asks for besides the basic scopes; platforms without on-demand scopes ignore it.
#[derive(Clone, Copy, Debug, Default)]
pub struct LoginOptions {
    pub moderation: bool,
    pub stream_key: bool,
}

/// A stream key read through the login. The key goes straight to the vault; only this returns.
#[derive(Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamKeyGrant {
    pub login: String,
    /// The account's server URL; the app uses it only for a destination that has none.
    pub url: Option<String>,
}

/// Signing in through the user's own OAuth app instead of the official client. The vault keeps
/// saved credentials across mode switches; only `clear` forgets them.
pub trait OwnCredentials {
    fn save(&self, app: &AppHandle, client_id: String, client_secret: String)
        -> Result<(), String>;
    fn clear(&self, app: &AppHandle) -> Result<(), String>;
    fn use_official(&self, app: &AppHandle) -> Result<(), String>;
    fn use_saved(&self, app: &AppHandle) -> Result<(), String>;
}

/// The ingest of a broadcast an account opened for this live; it replaces the destination's saved key.
pub struct ProvisionedIngest {
    pub url: String,
    pub key: String,
}

/// What the user is told when an automatic broadcast could not be opened and the saved key is used.
pub struct AutoBroadcastFailure {
    /// Allowlisted telemetry error code.
    pub error_code: &'static str,
    pub title: String,
    pub body: String,
    /// Prefixes the reason on the destination's card.
    pub target_note: String,
    /// Reason when the attempt ended without one.
    pub unknown_reason: String,
}

/// Accounts that open and end the platform's broadcast themselves around each live.
pub trait AutoBroadcast: Sync {
    fn enabled(&self, settings: &Settings) -> bool;
    /// Opens the broadcast. Blocking.
    fn open(
        &self,
        app: &AppHandle,
        settings: &Settings,
        generation: u64,
    ) -> Result<ProvisionedIngest, String>;
    /// Ends the broadcast opened for that live. Blocking; Err leaves the cleanup recoverable.
    fn close(&self, app: &AppHandle, generation: u64) -> Result<(), String>;
    fn open_failure(&self) -> AutoBroadcastFailure;
    /// Notification title and body when closing failed.
    fn close_failure(&self) -> (String, String);
}

/// What a platform did with a moment marked during the live.
#[derive(serde::Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum MarkOutcome {
    Marked,
    /// The platform refused this live, such as a channel that does not save its broadcasts.
    Unavailable,
    Reconnect,
    Failed,
}

pub trait AccountProvider: Sync {
    fn id(&self) -> &'static str;
    fn signed_in(&self) -> bool;
    /// Starts signing in without blocking; progress and the result arrive as auth events.
    fn login_start(&self, app: &AppHandle, options: LoginOptions);
    /// Forgets the login on this device. Blocking.
    fn logout(&self, app: &AppHandle) -> Result<(), String>;
    /// Reads the stream key into the target's vault slot. Blocking; None when the platform cannot.
    fn fetch_stream_key(
        &self,
        _app: &AppHandle,
        _target_id: &str,
    ) -> Option<Result<StreamKeyGrant, String>> {
        None
    }
    /// This provider's fields in the auth status the frontend reads.
    fn status(&self, app: &AppHandle, cfg: &OauthConfig) -> Map<String, Value>;
    /// The same fields when the status could not be read.
    fn signed_out_status(&self) -> Map<String, Value>;
    /// Applies this provider's entry from the setup API bootstrap.
    fn apply_bootstrap(&self, _entry: &Value, _config: &mut OauthConfig) {}
    /// Applies the official client ID the app was built with.
    fn set_official_client_id(&self, config: &mut OauthConfig, id: &str);
    /// Picks the official client or the user's own credentials.
    fn apply_mode(&self, _config: &mut OauthConfig) {}
    fn account_channel(&self, _app: &AppHandle) -> Option<AccountChannel> {
        None
    }
    fn forget_account_channel(&self) {}
    fn own_credentials(&self) -> Option<&dyn OwnCredentials> {
        None
    }
    fn auto_broadcast(&self) -> Option<&dyn AutoBroadcast> {
        None
    }
    /// Runs as a live starts; it must not block the start.
    fn before_go_live(&self, _app: &AppHandle) {}
    /// Marks the running live on the platform's own recording. Blocking; None when the platform cannot.
    fn mark_moment(&self, _app: &AppHandle, _label: &str) -> Option<MarkOutcome> {
        None
    }
    /// Ok(Some) carries a warning; the title went through but something else did not.
    fn set_stream_info(
        &self,
        app: &AppHandle,
        title: &str,
        category: &str,
    ) -> Result<Option<String>, String>;
}
