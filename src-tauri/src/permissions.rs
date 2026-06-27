//! Auto-concede câmera/mic no WebView2 (Windows) pra Mesa: registra um handler de
//! `PermissionRequested` que dá ALLOW pra Camera/Microphone na origem do app. Sem isso,
//! o getUserMedia mostraria o prompt do WebView2 e, se o usuário bloqueasse uma vez,
//! ficaria preso num DENY em cache (tauri#5042) que só limpa apagando a pasta EBWebView.
//! Setar o estado ALLOW antes do prompt aparecer evita os dois problemas.

#[cfg(windows)]
pub fn grant_av_permissions(window: &tauri::WebviewWindow) {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2, ICoreWebView2PermissionRequestedEventArgs, COREWEBVIEW2_PERMISSION_KIND,
        COREWEBVIEW2_PERMISSION_KIND_CAMERA, COREWEBVIEW2_PERMISSION_KIND_MICROPHONE,
        COREWEBVIEW2_PERMISSION_STATE_ALLOW,
    };
    use webview2_com::PermissionRequestedEventHandler;

    // with_webview roda F: FnOnce(PlatformWebview) + Send + 'static na thread do webview.
    let _ = window.with_webview(move |webview| unsafe {
        let core = match webview.controller().CoreWebView2() {
            Ok(c) => c,
            Err(_) => return,
        };

        let handler = PermissionRequestedEventHandler::create(Box::new(
            move |_sender: Option<ICoreWebView2>,
                  args: Option<ICoreWebView2PermissionRequestedEventArgs>| {
                if let Some(args) = args {
                    let mut kind = COREWEBVIEW2_PERMISSION_KIND::default();
                    args.PermissionKind(&mut kind)?;
                    if kind == COREWEBVIEW2_PERMISSION_KIND_CAMERA
                        || kind == COREWEBVIEW2_PERMISSION_KIND_MICROPHONE
                    {
                        args.SetState(COREWEBVIEW2_PERMISSION_STATE_ALLOW)?;
                    }
                }
                Ok(())
            },
        ));

        let mut token = 0_i64;
        let _ = core.add_PermissionRequested(&handler, &mut token);
    });
}

#[cfg(not(windows))]
pub fn grant_av_permissions(_window: &tauri::WebviewWindow) {}
