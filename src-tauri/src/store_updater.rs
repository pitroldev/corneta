use crate::{
    i18n::Msg,
    updater::{DownloadEvent, InstallOutcome},
};
use tauri::{ipc::Channel, Window};
use windows::{
    core::{AgileReference, Interface, Result as WinResult},
    ApplicationModel::Package,
    Services::Store::{StoreContext, StorePackageUpdateState, StorePackageUpdateStatus},
    Win32::UI::Shell::IInitializeWithWindow,
};

fn store_error(error: windows::core::Error) -> String {
    log::warn!("Microsoft Store update failed: HRESULT {}", error.code());
    Msg::StoreUpdateFailed.now()
}

async fn on_ui_thread<T: Send + 'static>(
    window: Window,
    action: impl FnOnce(Window) -> WinResult<T> + Send + 'static,
) -> Result<T, String> {
    let (send, receive) = tokio::sync::oneshot::channel();
    let owner = window.clone();
    window
        .run_on_main_thread(move || {
            let _ = send.send(action(owner));
        })
        .map_err(|_| Msg::StoreUpdateFailed.now())?;
    receive
        .await
        .map_err(|_| Msg::StoreUpdateFailed.now())?
        .map_err(store_error)
}

fn context(window: &Window) -> WinResult<StoreContext> {
    let id = Package::Current()?.Id()?;
    if id.Name()? != "pitroldev.Corneta"
        || id.Publisher()? != "CN=CA9298D5-25D1-490F-8BFE-5807D0ACE4EC"
    {
        return Err(windows::core::Error::from_hresult(windows::core::HRESULT(
            0x80070005_u32 as i32,
        )));
    }
    let context = StoreContext::GetDefault()?;
    let owner: IInitializeWithWindow = context.cast()?;
    let hwnd = window.hwnd().map_err(|_| {
        windows::core::Error::from_hresult(windows::core::HRESULT(0x80070578_u32 as i32))
    })?;
    // SAFETY: Tauri owns this live HWND; initialization runs on its UI thread before any Store dialog.
    unsafe {
        owner.Initialize(hwnd)?;
    }
    Ok(context)
}

pub async fn check(window: Window) -> Result<bool, String> {
    let (context, operation) = on_ui_thread(window, |window| {
        let context = context(&window)?;
        let operation = context.GetAppAndOptionalStorePackageUpdatesAsync()?;
        Ok((context, operation))
    })
    .await?;
    let updates = operation.await.map_err(store_error)?;
    let available = updates.Size().map_err(store_error)? > 0;
    drop(context);
    Ok(available)
}

pub async fn install(
    window: Window,
    on_event: Channel<DownloadEvent>,
) -> Result<InstallOutcome, String> {
    let (context, operation) = on_ui_thread(window.clone(), |window| {
        let context = context(&window)?;
        let operation = context.GetAppAndOptionalStorePackageUpdatesAsync()?;
        Ok((context, operation))
    })
    .await?;
    // Re-query the Store instead of trusting package IDs or URLs supplied by the WebView.
    let updates = {
        let updates = operation.await.map_err(store_error)?;
        if updates.Size().map_err(store_error)? == 0 {
            return Ok(InstallOutcome::Current);
        }
        // The collection is apartment-bound; COM must marshal it back to the window thread.
        AgileReference::new(&updates).map_err(store_error)?
    };
    let (context, operation) = on_ui_thread(window, move |_| {
        let updates = updates.resolve()?;
        let operation = context.RequestDownloadAndInstallStorePackageUpdatesAsync(&updates)?;
        let progress = windows_future::AsyncOperationProgressHandler::new(
            move |_, status: windows::core::Ref<StorePackageUpdateStatus>| {
                let _ = on_event.send(progress_event(&status));
                Ok(())
            },
        );
        // Failure to attach progress must not release the install lease while Windows is still updating.
        if let Err(error) = operation.SetProgress(&progress) {
            log::warn!(
                "Microsoft Store progress subscription failed: HRESULT {}",
                error.code()
            );
        }
        Ok((context, operation))
    })
    .await?;
    let result = operation.await.map_err(store_error)?;
    let state = result.OverallState().map_err(store_error)?;
    drop(context);
    outcome(state)
}

fn progress_event(status: &StorePackageUpdateStatus) -> DownloadEvent {
    DownloadEvent::StoreProgress {
        progress: if status.TotalDownloadProgress.is_finite() {
            status.TotalDownloadProgress.clamp(0.0, 1.0)
        } else {
            0.0
        },
        installing: status.PackageUpdateState == StorePackageUpdateState::Deploying,
    }
}

fn outcome(state: StorePackageUpdateState) -> Result<InstallOutcome, String> {
    match state {
        StorePackageUpdateState::Completed => Ok(InstallOutcome::Installed),
        StorePackageUpdateState::Canceled => Ok(InstallOutcome::Cancelled),
        StorePackageUpdateState::ErrorLowBattery => Err(Msg::StoreUpdateBattery.now()),
        StorePackageUpdateState::ErrorWiFiRecommended
        | StorePackageUpdateState::ErrorWiFiRequired => Err(Msg::StoreUpdateNetwork.now()),
        _ => Err(Msg::StoreUpdateFailed.now()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_completed_installs_are_successful() {
        assert_eq!(
            outcome(StorePackageUpdateState::Completed),
            Ok(InstallOutcome::Installed)
        );
        assert_eq!(
            outcome(StorePackageUpdateState::Canceled),
            Ok(InstallOutcome::Cancelled)
        );
        for state in [
            StorePackageUpdateState::Pending,
            StorePackageUpdateState::Downloading,
            StorePackageUpdateState::Deploying,
            StorePackageUpdateState::OtherError,
            StorePackageUpdateState::ErrorLowBattery,
            StorePackageUpdateState::ErrorWiFiRecommended,
            StorePackageUpdateState::ErrorWiFiRequired,
            StorePackageUpdateState(99),
        ] {
            assert!(outcome(state).is_err(), "Unexpected success for {state:?}");
        }
    }

    #[test]
    fn progress_uses_the_total_and_distinguishes_deployment() {
        for (value, expected) in [(0.3, 0.3), (1.2, 1.0), (-0.1, 0.0), (f64::NAN, 0.0)] {
            let status = StorePackageUpdateStatus {
                TotalDownloadProgress: value,
                PackageDownloadProgress: 0.9,
                PackageUpdateState: StorePackageUpdateState::Deploying,
                ..Default::default()
            };
            assert_eq!(
                serde_json::to_value(progress_event(&status)).unwrap(),
                serde_json::json!({"event":"StoreProgress","data":{"progress":expected,"installing":true}})
            );
        }
    }
}
