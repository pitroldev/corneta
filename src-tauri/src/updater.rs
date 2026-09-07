//! Installation and stream startup share the engine lock; no lock is held over I/O.
use crate::{engine::EngineRuntime, i18n::Msg, AppState};
use serde::Serialize;
use std::sync::Mutex;
use tauri::{ipc::Channel, AppHandle, Emitter, Manager, ResourceId, Webview};

pub(crate) const START_UPDATE_BLOCKED: &str = "corneta:update-in-progress";

pub(crate) fn claim_start(engine: &mut EngineRuntime) -> Result<(), String> {
    if engine.update_in_progress {
        return Err(START_UPDATE_BLOCKED.into());
    }
    if engine.live {
        return Err(Msg::EngineAlreadyLive.now());
    }
    engine.live = true;
    Ok(())
}

struct InstallLease<'a> {
    engine: &'a Mutex<EngineRuntime>,
    app: Option<AppHandle>,
}

impl<'a> InstallLease<'a> {
    fn acquire(engine: &'a Mutex<EngineRuntime>) -> Result<Self, String> {
        let mut runtime = engine.lock().unwrap();
        if runtime.update_in_progress {
            return Err(Msg::UpdateInProgress.now());
        }
        if runtime.live
            || runtime
                .pending_activity
                .load(std::sync::atomic::Ordering::Acquire)
                != 0
            || runtime.running.load(std::sync::atomic::Ordering::Acquire)
            || runtime.mediamtx.is_some()
            || !runtime.ffmpegs.is_empty()
            || runtime
                .snapshot
                .as_ref()
                .is_some_and(|snapshot| snapshot.state != "stopped")
        {
            return Err(Msg::UpdateRequiresStopped.now());
        }
        runtime.update_in_progress = true;
        Ok(Self { engine, app: None })
    }

    fn announce(mut self, app: AppHandle) -> Self {
        let _ = app.emit_to("main", "updater://installing", true);
        self.app = Some(app);
        self
    }
}

impl Drop for InstallLease<'_> {
    fn drop(&mut self) {
        let mut engine = self.engine.lock().unwrap();
        engine.update_in_progress = false;
        // Publish before another installation can acquire and announce its lease.
        if let Some(app) = &self.app {
            let _ = app.emit_to("main", "updater://installing", false);
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(tag = "event", content = "data")]
pub enum DownloadEvent {
    #[serde(rename_all = "camelCase")]
    Started {
        content_length: Option<u64>,
    },
    #[serde(rename_all = "camelCase")]
    Progress {
        chunk_length: usize,
    },
    Finished,
}

#[tauri::command]
pub fn update_installing(app: AppHandle, webview: Webview) -> Result<bool, String> {
    if webview.label() != "main" {
        return Err(Msg::UpdateUnavailable.now());
    }
    let installing = app
        .state::<AppState>()
        .engine
        .lock()
        .unwrap()
        .update_in_progress;
    Ok(installing)
}

#[tauri::command]
pub async fn install_update(
    app: AppHandle,
    webview: Webview,
    rid: ResourceId,
    on_event: Channel<DownloadEvent>,
) -> Result<(), String> {
    if cfg!(corneta_contributor) || webview.label() != "main" {
        return Err(Msg::UpdateUnavailable.now());
    }
    // Use the signed update obtained by the plugin's check, never a URL supplied by JS.
    let update = webview
        .resources_table()
        .get::<tauri_plugin_updater::Update>(rid)
        .map_err(|_| Msg::UpdateCheckAgain.now())?;
    let state = app.state::<AppState>();
    let _lease = InstallLease::acquire(&state.engine)?.announce(app.clone());
    let mut update = (*update).clone();
    update.timeout = Some(std::time::Duration::from_secs(600));
    let mut started = false;
    update
        .download_and_install(
            |chunk_length, content_length| {
                if !started {
                    started = true;
                    let _ = on_event.send(DownloadEvent::Started { content_length });
                }
                let _ = on_event.send(DownloadEvent::Progress { chunk_length });
            },
            || {
                let _ = on_event.send(DownloadEvent::Finished);
            },
        )
        .await
        .map_err(|_| Msg::UpdateFailed.now())?;
    // Windows exits in the installer. Other supported plugin targets restart here,
    // while the lease still prevents startup, including after a WebView reload.
    app.restart();
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::EngineSnapshot;
    use std::sync::{Arc, Barrier};

    #[test]
    fn installation_blocks_start_and_duplicate_install_until_released() {
        let engine = Mutex::new(EngineRuntime::default());
        let lease = InstallLease::acquire(&engine).unwrap();
        assert_eq!(
            claim_start(&mut engine.lock().unwrap()),
            Err(START_UPDATE_BLOCKED.into())
        );
        assert!(InstallLease::acquire(&engine).is_err());
        drop(lease);
        assert!(claim_start(&mut engine.lock().unwrap()).is_ok());
        assert!(InstallLease::acquire(&engine).is_err());
    }

    #[test]
    fn starting_live_error_and_stopping_supervisors_block_installation() {
        for state in ["starting", "live", "error"] {
            let mut snapshot = EngineSnapshot::stopped();
            snapshot.state = state.into();
            let engine = Mutex::new(EngineRuntime {
                snapshot: Some(snapshot),
                ..Default::default()
            });
            assert!(InstallLease::acquire(&engine).is_err());
            assert!(!engine.lock().unwrap().update_in_progress);
        }
        let engine = Mutex::new(EngineRuntime::default());
        engine
            .lock()
            .unwrap()
            .running
            .store(true, std::sync::atomic::Ordering::Release);
        assert!(InstallLease::acquire(&engine).is_err());
    }

    #[test]
    fn failure_releases_the_lease() {
        let engine = Mutex::new(EngineRuntime::default());
        let attempt = || -> Result<(), ()> {
            let _lease = InstallLease::acquire(&engine).unwrap();
            Err(())
        };
        assert!(attempt().is_err());
        assert!(!engine.lock().unwrap().update_in_progress);
        assert!(InstallLease::acquire(&engine).is_ok());
    }

    #[test]
    fn stopped_snapshot_does_not_hide_pending_cleanup_or_recording_finalization() {
        let engine = Mutex::new(EngineRuntime::default());
        let cleanup = engine.lock().unwrap().begin_pending_activity();
        let recording = engine.lock().unwrap().begin_pending_activity();
        assert!(InstallLease::acquire(&engine).is_err());
        drop(cleanup);
        assert!(InstallLease::acquire(&engine).is_err());
        drop(recording);
        assert!(InstallLease::acquire(&engine).is_ok());
    }

    #[tokio::test]
    async fn cancelled_task_releases_the_lease() {
        let engine = Arc::new(Mutex::new(EngineRuntime::default()));
        let task_engine = engine.clone();
        let (ready, waiting) = tokio::sync::oneshot::channel();
        let task = tokio::spawn(async move {
            let _lease = InstallLease::acquire(&task_engine).unwrap();
            ready.send(()).unwrap();
            std::future::pending::<()>().await;
        });
        waiting.await.unwrap();
        assert!(engine.lock().unwrap().update_in_progress);
        task.abort();
        assert!(task.await.unwrap_err().is_cancelled());
        assert!(!engine.lock().unwrap().update_in_progress);
        assert!(claim_start(&mut engine.lock().unwrap()).is_ok());
    }

    #[test]
    fn simultaneous_start_and_install_have_one_winner() {
        for _ in 0..32 {
            let engine = Arc::new(Mutex::new(EngineRuntime::default()));
            let enter = Arc::new(Barrier::new(2));
            let finish = Arc::new(Barrier::new(2));
            let start_engine = engine.clone();
            let start_enter = enter.clone();
            let start_finish = finish.clone();
            let start = std::thread::spawn(move || {
                start_enter.wait();
                let won = claim_start(&mut start_engine.lock().unwrap()).is_ok();
                start_finish.wait();
                won
            });
            enter.wait();
            let lease = InstallLease::acquire(&engine);
            let installing = lease.is_ok();
            finish.wait();
            assert_ne!(start.join().unwrap(), installing);
        }
    }

    #[test]
    fn progress_matches_the_frontend_channel_contract() {
        assert_eq!(
            serde_json::to_value(DownloadEvent::Started {
                content_length: Some(42)
            })
            .unwrap(),
            serde_json::json!({"event":"Started","data":{"contentLength":42}})
        );
        assert_eq!(
            serde_json::to_value(DownloadEvent::Progress { chunk_length: 7 }).unwrap(),
            serde_json::json!({"event":"Progress","data":{"chunkLength":7}})
        );
        assert_eq!(
            serde_json::to_value(DownloadEvent::Finished).unwrap(),
            serde_json::json!({"event":"Finished"})
        );
    }
}
