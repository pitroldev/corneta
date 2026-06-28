//! Auto-concede câmera/mic no WebView2 (Windows) pra Mesa: registra um handler de
//! `PermissionRequested` que dá ALLOW pra Camera/Microphone na origem do app. Sem isso,
//! o getUserMedia mostraria o prompt do WebView2 e, se o usuário bloqueasse uma vez,
//! ficaria preso num DENY em cache (tauri#5042) que só limpa apagando a pasta EBWebView.
//! Setar o estado ALLOW antes do prompt aparecer evita os dois problemas.

/// Só a origem local do app (prod: tauri.localhost; dev: localhost:1420) ganha o ALLOW
/// automático. Conteúdo remoto que porventura fosse carregado no WebView fica de fora —
/// volta a cair no prompt padrão. Hoje a CSP já só carrega a própria origem; isto é
/// defesa em profundidade caso isso mude.
#[cfg(windows)]
fn is_app_origin(uri: &str) -> bool {
    uri.is_empty()
        || uri.starts_with("http://tauri.localhost")
        || uri.starts_with("https://tauri.localhost")
        || uri.starts_with("http://localhost")
        || uri.starts_with("http://127.0.0.1")
        || uri.starts_with("tauri://")
}

#[cfg(windows)]
pub fn grant_av_permissions(window: &tauri::WebviewWindow) {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2, ICoreWebView2PermissionRequestedEventArgs, COREWEBVIEW2_PERMISSION_KIND,
        COREWEBVIEW2_PERMISSION_KIND_CAMERA, COREWEBVIEW2_PERMISSION_KIND_MICROPHONE,
        COREWEBVIEW2_PERMISSION_STATE_ALLOW,
    };
    use webview2_com::{take_pwstr, PermissionRequestedEventHandler};

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
                        // Tipo da PWSTR resolvido por inferência (a versão do windows que
                        // o webview2-com usa difere da do crate `windows` do projeto).
                        let mut uri_ptr = Default::default();
                        args.Uri(&mut uri_ptr)?;
                        let uri = take_pwstr(uri_ptr);
                        if is_app_origin(&uri) {
                            args.SetState(COREWEBVIEW2_PERMISSION_STATE_ALLOW)?;
                        }
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
