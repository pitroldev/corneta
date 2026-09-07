//! Durable, serialized recovery for broadcasts created by Corneta.
//!
//! Google lifecycle: https://developers.google.com/youtube/v3/live/docs/liveBroadcasts
//! Never delete automatically: a created/ready observation can become stale before the next request.

use super::youtube_error::GoogleError;
use crate::i18n::Msg;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Error {
    Api(GoogleError),
    Vault,
    SignIn,
    Pending,
    CreationUnknown,
    Cancelled,
}

impl From<GoogleError> for Error {
    fn from(value: GoogleError) -> Self {
        Self::Api(value)
    }
}

impl Error {
    pub(super) fn message(self) -> String {
        match self {
            Self::Api(error) => error.message(),
            Self::Vault => Msg::YoutubeRecoveryVaultFailed.now(),
            Self::SignIn => Msg::StreamInfoYoutubeSignIn.now(),
            Self::Pending => Msg::YoutubeRecoveryPending.now(),
            Self::CreationUnknown => Msg::YoutubeCreationUnknown.now(),
            Self::Cancelled => Msg::YoutubeCreationCancelled.now(),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum RemoteState {
    Missing,
    Created,
    Ready,
    Live,
    Testing,
    Complete,
    Revoked,
    Starting,
}

pub(super) trait Store {
    fn read(&mut self) -> Result<Option<String>, ()>;
    fn write(&mut self, value: &str) -> Result<(), ()>;
    fn clear(&mut self) -> Result<(), ()>;
}

pub(super) trait Remote {
    fn create(&mut self, title: &str) -> Result<String, Error>;
    fn status(&mut self, id: &str) -> Result<RemoteState, Error>;
    fn complete(&mut self, id: &str) -> Result<RemoteState, Error>;
    fn connect(&mut self, id: &str) -> Result<(String, String), Error>;
}

struct Pending {
    id: Option<String>,
    // Not persisted: engine generations are process-local and restart at zero.
    owner: Option<u64>,
}

pub(super) struct Recovery {
    pending: Option<Pending>,
}

impl Recovery {
    pub(super) const fn new() -> Self {
        Self { pending: None }
    }

    fn load(&mut self, store: &mut impl Store) -> Result<(), Error> {
        if self.pending.is_none() {
            if let Some(raw) = store.read().map_err(|_| Error::Vault)? {
                let id = if raw.starts_with('{') {
                    let value: serde_json::Value =
                        serde_json::from_str(&raw).map_err(|_| Error::Vault)?;
                    if value["version"] != 1 {
                        return Err(Error::Vault);
                    }
                    match value.get("id") {
                        Some(serde_json::Value::Null) => None,
                        Some(serde_json::Value::String(id)) if valid_id(id) => Some(id.clone()),
                        _ => return Err(Error::Vault),
                    }
                } else if valid_id(&raw) {
                    Some(raw)
                } else {
                    return Err(Error::Vault);
                };
                self.pending = Some(Pending { id, owner: None });
            }
        }
        Ok(())
    }

    fn save(&self, store: &mut impl Store) -> Result<(), Error> {
        let pending = self.pending.as_ref().ok_or(Error::Pending)?;
        store
            .write(&serde_json::json!({"version": 1, "id": pending.id}).to_string())
            .map_err(|_| Error::Vault)
    }

    fn forget(&mut self, store: &mut impl Store) -> Result<(), Error> {
        store.clear().map_err(|_| Error::Vault)?;
        self.pending = None;
        Ok(())
    }

    fn cleanup(&mut self, store: &mut impl Store, remote: &mut impl Remote) -> Result<(), Error> {
        self.load(store)?;
        let Some(pending) = &self.pending else {
            return Ok(());
        };
        let id = pending.id.as_deref().ok_or(Error::CreationUnknown)?;
        match remote.status(id)? {
            RemoteState::Missing | RemoteState::Complete | RemoteState::Revoked => {}
            RemoteState::Live | RemoteState::Testing => match remote.complete(id)? {
                RemoteState::Missing | RemoteState::Complete | RemoteState::Revoked => {}
                _ => return Err(Error::Pending),
            },
            RemoteState::Created | RemoteState::Ready | RemoteState::Starting => {
                return Err(Error::Pending)
            }
        }
        self.forget(store)
    }

    pub(super) fn provision(
        &mut self,
        generation: u64,
        current: impl Fn() -> bool,
        store: &mut impl Store,
        remote: &mut impl Remote,
        title: &str,
    ) -> Result<(String, String), Error> {
        if !current() {
            return Err(Error::Cancelled);
        }
        self.load(store)?;
        if self
            .pending
            .as_ref()
            .is_some_and(|pending| pending.owner == Some(generation))
        {
            return Err(Error::Pending);
        }
        self.cleanup(store, remote)?;
        if !current() {
            return Err(Error::Cancelled);
        }
        self.pending = Some(Pending {
            id: None,
            owner: Some(generation),
        });
        // A restart after a lost POST response must not create a duplicate broadcast.
        if let Err(error) = self.save(store) {
            self.pending = None;
            return Err(error);
        }
        let id = match remote.create(title) {
            Ok(id) if valid_id(&id) => id,
            Ok(_) => return Err(Error::CreationUnknown),
            Err(error) => {
                if matches!(error, Error::Api(api) if !api.creation_outcome_unknown())
                    || error == Error::SignIn
                {
                    self.forget(store)?;
                    return Err(error);
                }
                return Err(Error::CreationUnknown);
            }
        };
        self.pending = Some(Pending {
            id: Some(id.clone()),
            owner: Some(generation),
        });
        if let Err(error) = self.save(store) {
            // Keep the ID in memory and the unknown-creation marker on disk if compensation fails.
            let _ = self.cleanup(store, remote);
            return Err(error);
        }
        if !current() {
            let _ = self.cleanup(store, remote);
            return Err(Error::Cancelled);
        }
        let output = remote.connect(&id)?;
        if !current() {
            let _ = self.cleanup(store, remote);
            return Err(Error::Cancelled);
        }
        Ok(output)
    }

    pub(super) fn stop(
        &mut self,
        generation: u64,
        store: &mut impl Store,
        remote: &mut impl Remote,
    ) -> Result<(), Error> {
        self.load(store)?;
        if self
            .pending
            .as_ref()
            .is_some_and(|pending| pending.owner.is_some_and(|owner| owner != generation))
        {
            return Ok(());
        }
        self.cleanup(store, remote)
    }

    pub(super) fn acknowledge_unknown(
        &mut self,
        confirmed: bool,
        stopped: bool,
        store: &mut impl Store,
    ) -> Result<(), Error> {
        if !confirmed || !stopped {
            return Err(Error::Pending);
        }
        self.load(store)?;
        match &self.pending {
            Some(pending) if pending.id.is_none() => self.forget(store),
            None => Ok(()),
            Some(_) => Err(Error::Pending),
        }
    }

    pub(super) fn status(&mut self, store: &mut impl Store) -> Result<&'static str, Error> {
        self.load(store)?;
        Ok(match &self.pending {
            None => "none",
            Some(pending) if pending.id.is_some() => "pending",
            Some(_) => "unknown",
        })
    }

    pub(super) fn retry_stopped(
        &mut self,
        stopped: bool,
        store: &mut impl Store,
        remote: &mut impl Remote,
    ) -> Result<(), Error> {
        if !stopped {
            return Err(Error::Pending);
        }
        self.cleanup(store, remote)
    }
}

pub(super) fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
}

#[cfg(test)]
mod tests {
    use super::super::youtube_error::GoogleReason;
    use super::*;
    use std::cell::Cell;

    #[derive(Default)]
    struct MemoryStore {
        value: Option<String>,
        writes: usize,
        fail_write: Option<usize>,
        fail_clear: bool,
        fail_read: bool,
    }
    impl Store for MemoryStore {
        fn read(&mut self) -> Result<Option<String>, ()> {
            if self.fail_read {
                Err(())
            } else {
                Ok(self.value.clone())
            }
        }
        fn write(&mut self, value: &str) -> Result<(), ()> {
            self.writes += 1;
            if self.fail_write == Some(self.writes) {
                return Err(());
            }
            self.value = Some(value.into());
            Ok(())
        }
        fn clear(&mut self) -> Result<(), ()> {
            if self.fail_clear {
                Err(())
            } else {
                self.value = None;
                Ok(())
            }
        }
    }
    struct FakeRemote {
        state: RemoteState,
        error: Option<Error>,
        create_error: Option<Error>,
        transition_error: Option<Error>,
        calls: Vec<&'static str>,
    }
    impl FakeRemote {
        fn new(state: RemoteState) -> Self {
            Self {
                state,
                error: None,
                create_error: None,
                transition_error: None,
                calls: vec![],
            }
        }
        fn call(&mut self, name: &'static str) -> Result<(), Error> {
            self.calls.push(name);
            self.error.map_or(Ok(()), Err)
        }
    }
    impl Remote for FakeRemote {
        fn create(&mut self, _: &str) -> Result<String, Error> {
            self.call("create")?;
            self.create_error.map_or(Ok("new-id".into()), Err)
        }
        fn status(&mut self, _: &str) -> Result<RemoteState, Error> {
            self.call("status")?;
            Ok(self.state)
        }
        fn complete(&mut self, _: &str) -> Result<RemoteState, Error> {
            self.call("complete")?;
            self.transition_error.map_or(Ok(RemoteState::Complete), Err)
        }
        fn connect(&mut self, _: &str) -> Result<(String, String), Error> {
            self.call("connect")?;
            Ok(("address".into(), "fixture-key".into()))
        }
    }
    fn pending_store() -> MemoryStore {
        MemoryStore {
            value: Some("old-id".into()),
            ..Default::default()
        }
    }

    #[test]
    fn temporary_failure_or_absent_token_retains_id_and_blocks_new_creation() {
        for error in [
            Error::SignIn,
            Error::Api(GoogleError::Transport),
            Error::Api(GoogleError::Http {
                status: 503,
                reason: GoogleReason::Backend,
            }),
            Error::Api(GoogleError::Http {
                status: 403,
                reason: GoogleReason::Quota,
            }),
        ] {
            let mut store = pending_store();
            let mut remote = FakeRemote::new(RemoteState::Live);
            remote.error = Some(error);
            let mut recovery = Recovery::new();
            assert_eq!(recovery.stop(1, &mut store, &mut remote), Err(error));
            assert_eq!(
                recovery.provision(2, || true, &mut store, &mut remote, "title"),
                Err(error)
            );
            assert_eq!(store.value.as_deref(), Some("old-id"));
            assert_eq!(remote.calls, ["status", "status"]);
        }
    }

    #[test]
    fn scheduled_or_starting_broadcasts_are_preserved_for_studio_review() {
        for state in [
            RemoteState::Missing,
            RemoteState::Created,
            RemoteState::Ready,
            RemoteState::Live,
            RemoteState::Testing,
            RemoteState::Complete,
            RemoteState::Revoked,
            RemoteState::Starting,
        ] {
            let mut store = pending_store();
            let mut remote = FakeRemote::new(state);
            let result = Recovery::new().stop(1, &mut store, &mut remote);
            let pending = matches!(
                state,
                RemoteState::Created | RemoteState::Ready | RemoteState::Starting
            );
            assert!(!remote.calls.contains(&"delete"));
            assert_eq!(store.value.is_none(), !pending);
            assert_eq!(result.is_ok(), !pending);
        }
    }

    #[test]
    fn transition_failure_never_falls_back_to_delete() {
        for reason in [
            GoogleReason::InvalidTransition,
            GoogleReason::RedundantTransition,
            GoogleReason::Unknown,
            GoogleReason::Backend,
        ] {
            let mut remote = FakeRemote::new(RemoteState::Live);
            remote.transition_error = Some(Error::Api(GoogleError::Http {
                status: 403,
                reason,
            }));
            let mut store = pending_store();
            assert!(Recovery::new().stop(1, &mut store, &mut remote).is_err());
            assert_eq!(remote.calls, ["status", "complete"]);
            assert!(store.value.is_some());
        }
    }

    #[test]
    fn failed_local_ack_remains_recoverable_without_recreating_a_broadcast() {
        let mut store = pending_store();
        store.fail_clear = true;
        let mut remote = FakeRemote::new(RemoteState::Complete);
        let mut recovery = Recovery::new();
        assert_eq!(
            recovery.provision(1, || true, &mut store, &mut remote, "title"),
            Err(Error::Vault)
        );
        assert_eq!(remote.calls, ["status"]);
        store.fail_clear = false;
        recovery.stop(1, &mut store, &mut remote).unwrap();
        assert!(store.value.is_none());
    }

    #[test]
    fn unreadable_vault_and_preflight_write_failure_prevent_remote_creation() {
        for fail_read in [false, true] {
            let mut store = MemoryStore {
                fail_read,
                fail_write: Some(1),
                ..Default::default()
            };
            let mut remote = FakeRemote::new(RemoteState::Created);
            assert_eq!(
                Recovery::new().provision(1, || true, &mut store, &mut remote, "title"),
                Err(Error::Vault)
            );
            assert!(remote.calls.is_empty());
        }
    }

    #[test]
    fn failed_id_persistence_never_binds_and_retains_recovery_marker() {
        let mut store = MemoryStore {
            fail_write: Some(2),
            ..Default::default()
        };
        let mut remote = FakeRemote::new(RemoteState::Created);
        assert_eq!(
            Recovery::new().provision(1, || true, &mut store, &mut remote, "title"),
            Err(Error::Vault)
        );
        assert_eq!(remote.calls, ["create", "status"]);
        assert!(store.value.is_some());
    }

    #[test]
    fn lost_creation_response_survives_restart_and_requires_explicit_stopped_ack() {
        let mut store = MemoryStore::default();
        let mut remote = FakeRemote::new(RemoteState::Created);
        remote.create_error = Some(Error::Api(GoogleError::Transport));
        assert_eq!(
            Recovery::new().provision(1, || true, &mut store, &mut remote, "title"),
            Err(Error::CreationUnknown)
        );
        let mut restarted = Recovery::new();
        assert_eq!(
            restarted.provision(2, || true, &mut store, &mut remote, "title"),
            Err(Error::CreationUnknown)
        );
        assert_eq!(remote.calls, ["create"]);
        for (confirmed, stopped) in [(false, true), (true, false)] {
            assert!(restarted
                .acknowledge_unknown(confirmed, stopped, &mut store)
                .is_err());
            assert!(store.value.is_some());
        }
        restarted
            .acknowledge_unknown(true, true, &mut store)
            .unwrap();
        assert!(store.value.is_none());
        assert!(Recovery::new()
            .acknowledge_unknown(true, true, &mut pending_store())
            .is_err());
    }

    #[test]
    fn definitive_creation_rejection_clears_marker_and_allows_retry() {
        let mut store = MemoryStore::default();
        let mut remote = FakeRemote::new(RemoteState::Created);
        remote.create_error = Some(Error::Api(GoogleError::Http {
            status: 401,
            reason: GoogleReason::Permission,
        }));
        assert!(Recovery::new()
            .provision(1, || true, &mut store, &mut remote, "title")
            .is_err());
        assert!(store.value.is_none());
    }

    #[test]
    fn stale_stop_and_duplicate_start_cannot_end_the_new_generation() {
        let mut recovery = Recovery::new();
        let mut store = MemoryStore::default();
        let mut remote = FakeRemote::new(RemoteState::Live);
        recovery
            .provision(2, || true, &mut store, &mut remote, "title")
            .unwrap();
        recovery.stop(1, &mut store, &mut remote).unwrap();
        assert_eq!(
            recovery.provision(2, || true, &mut store, &mut remote, "title"),
            Err(Error::Pending)
        );
        assert_eq!(remote.calls, ["create", "connect"]);
        recovery.stop(2, &mut store, &mut remote).unwrap();
        assert_eq!(remote.calls, ["create", "connect", "status", "complete"]);
    }

    #[test]
    fn cancellation_during_creation_never_binds_and_preserves_recovery() {
        let mut store = MemoryStore::default();
        let mut remote = FakeRemote::new(RemoteState::Created);
        let checks = Cell::new(0);
        let result = Recovery::new().provision(
            1,
            || {
                let previous = checks.get();
                checks.set(previous + 1);
                previous < 2
            },
            &mut store,
            &mut remote,
            "title",
        );
        assert_eq!(result, Err(Error::Cancelled));
        assert_eq!(remote.calls, ["create", "status"]);
        assert!(store.value.is_some());
    }
}
