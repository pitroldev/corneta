mod alerts;
mod auth;
mod chat;
mod commands;
mod compositor;
mod config;
mod engine;
mod guardian;
mod keys;
mod obs;
mod permissions;
mod session;
mod studio;

use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager};

/// Estado global: runtime do motor (handle do sidecar + último snapshot) + chat + Mesa.
pub struct AppState {
    pub engine: Mutex<engine::EngineRuntime>,
    pub chat: Mutex<chat::ChatRuntime>,
    pub alerts: Mutex<alerts::AlertRuntime>,
    pub oauth: Mutex<auth::OauthConfig>,
    pub studio: Mutex<studio::StudioServer>,
}

fn show_main(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

/// A transmissão está de pé? Checa a trava REAL da sessão (`eng.live`) — o snapshot pode
/// ficar em "error" com o motor já morto, e "Você está AO VIVO" falso é pior que nada.
fn engine_live(app: &tauri::AppHandle) -> bool {
    let st = app.state::<AppState>();
    let eng = st.engine.lock().unwrap();
    eng.live
}

/// Diálogo bloqueante "encerrar a live?" — compartilhado pelo "Sair" da bandeja e pelo X
/// da janela (o X era o único caminho que derrubava a live SEM perguntar).
fn confirm_end_live(app: &tauri::AppHandle, msg: &str) -> bool {
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
    app.dialog()
        .message(msg)
        .title("Sair da Corneta?")
        .buttons(MessageDialogButtons::OkCancelCustom(
            "Encerrar e sair".into(),
            "Cancelar".into(),
        ))
        .blocking_show()
}

/// Sequência única de encerramento (Mesa + broadcast do YouTube + motor).
fn shutdown_engine(app: &tauri::AppHandle) {
    studio::stop(&app.state::<AppState>().studio);
    auth::youtube_complete_active(app); // encerra o broadcast do YouTube
    commands::kill_engine(app);
}

/// Feedback da ida pra bandeja: na primeira vez avisa que o app NÃO fechou (o botão se
/// chama "Fechar"…); com live no ar avisa SEMPRE que ela continua de pé.
fn tray_hide_hint(app: &tauri::AppHandle, live: bool) {
    let marker = app
        .path()
        .app_config_dir()
        .ok()
        .map(|d| d.join("tray-hint-shown"));
    let first = marker.as_ref().map(|m| !m.exists()).unwrap_or(false);
    if live {
        commands::notify(
            app,
            "Sua live continua no ar",
            "A Corneta ficou na bandeja, perto do relógio. Pra sair de vez, use o menu da bandeja.",
        );
    } else if first {
        commands::notify(
            app,
            "A Corneta continua aqui",
            "Ela ficou na bandeja, perto do relógio — não fechou. Pra sair de vez, use o menu da bandeja.",
        );
    }
    if first {
        if let Some(m) = marker {
            let _ = std::fs::write(m, "1");
        }
    }
}

/// Garante que a janela caiba na tela. Se a altura (vinda do config ou de um tamanho
/// salvo pelo window-state) passar da área útil do monitor atual — descontando a barra
/// de tarefas —, reduz e recentraliza. Em telas grandes não mexe; em 720p/768p evita
/// que a janela sem bordas (`decorations: false`) fique cortada embaixo.
fn clamp_window_to_screen(w: &tauri::WebviewWindow) {
    let Ok(Some(monitor)) = w.current_monitor() else {
        return;
    };
    let scale = monitor.scale_factor();
    if scale <= 0.0 {
        return;
    }
    let mon_h = monitor.size().height as f64 / scale; // altura lógica do monitor
    let max_h = (mon_h - 72.0).max(480.0); // folga pra barra de tarefas
    let Ok(size) = w.inner_size() else {
        return;
    };
    let cur_h = size.height as f64 / scale;
    if cur_h > max_h {
        let cur_w = size.width as f64 / scale;
        let _ = w.set_size(tauri::LogicalSize::new(cur_w, max_h));
        let _ = w.center();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // single-instance DEVE ser o primeiro plugin (§14.2): evita duas Cornetas
        // disputando a porta de ingestão / subindo motores duplicados.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            show_main(app);
        }))
        // Log em arquivo (app log dir) + stdout — útil para diagnosticar transmissões.
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::Stdout,
                ))
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::LogDir {
                        file_name: Some("corneta".into()),
                    },
                ))
                .build(),
        )
        .plugin(tauri_plugin_shell::init())
        // Autostart (abrir com o sistema) — controlado pela tela de Configurações.
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None::<Vec<&str>>,
        ))
        // Notificações nativas + memória de tamanho/posição da janela.
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        // Atalho global: dispara um evento que o frontend trata (começar/parar).
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                        let _ = app.emit("shortcut://toggle-live", ());
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            engine: Mutex::new(engine::EngineRuntime::default()),
            chat: Mutex::new(chat::ChatRuntime::default()),
            alerts: Mutex::new(alerts::AlertRuntime::default()),
            oauth: Mutex::new(auth::OauthConfig::default()),
            studio: Mutex::new(studio::StudioServer::default()),
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            commands::save_config,
            commands::set_key,
            commands::clear_key,
            commands::has_key,
            commands::detect_encoders,
            commands::test_upload,
            commands::set_autostart,
            commands::obs_autoconfigure,
            commands::start_engine,
            commands::stop_engine,
            commands::set_target_paused,
            commands::retry_target,
            commands::set_force_brb,
            commands::list_sessions,
            commands::read_session,
            commands::delete_session,
            commands::open_sessions_dir,
            commands::chat_start,
            commands::chat_stop,
            commands::chat_running,
            commands::chat_send,
            auth::set_oauth_config,
            auth::set_youtube_oauth,
            auth::clear_youtube_oauth,
            auth::auth_status,
            auth::twitch_login_start,
            auth::twitch_logout,
            auth::youtube_login_start,
            auth::youtube_logout,
            auth::kick_login_start,
            auth::kick_logout,
            auth::set_stream_info,
            auth::chat_moderate,
            commands::alerts_start,
            commands::alerts_stop,
            commands::open_chat_window,
            commands::obs_set_stream,
            commands::test_target,
            commands::youtube_key_check,
            commands::alert_test,
            commands::open_logs_dir,
            commands::register_shortcut,
            commands::obs_check,
            commands::mark_moment,
            commands::export_config,
            commands::import_config,
            commands::save_brb_slate,
            commands::set_brb_slate,
            commands::clear_brb_slate,
            commands::get_brb_slate_preview,
            commands::capture_frame,
            commands::mesa_start_server,
            commands::mesa_stop_server,
            commands::mesa_obs_add_source,
            commands::mesa_obs_remove_source,
            commands::open_privacy_settings,
        ])
        .setup(|app| {
            // Mesa: auto-concede câmera/mic no WebView2 (getUserMedia sem prompt/lock).
            if let Some(w) = app.get_webview_window("main") {
                permissions::grant_av_permissions(&w);
                // Nunca deixa a janela mais alta que a tela (720p/768p incluídos).
                clamp_window_to_screen(&w);
            }
            // O atalho global é registrado pelo frontend no boot (App.tsx → register_shortcut),
            // que MOSTRA o erro quando a combinação já está em uso — aqui era um `let _ =` mudo.
            // Ícone na bandeja: clique esquerdo abre a janela; menu com Abrir/Sair.
            if let Some(icon) = app.default_window_icon().cloned() {
                let show = MenuItem::with_id(app, "show", "Abrir Corneta", true, None::<&str>)?;
                let quit = MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&show, &quit])?;

                TrayIconBuilder::with_id("corneta-tray")
                    .icon(icon)
                    .tooltip("Corneta")
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "show" => show_main(app),
                        "quit" => {
                            let ok = !engine_live(app)
                                || confirm_end_live(app, "Você está AO VIVO. Sair encerra a transmissão.");
                            if ok {
                                shutdown_engine(app);
                                app.exit(0);
                            }
                        }
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            show_main(tray.app_handle());
                        }
                    })
                    .build(app)?;
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // A janela flutuante do chat fecha normalmente; só a principal vai pra bandeja.
                if window.label() != "main" {
                    return;
                }
                let app = window.app_handle();
                let cfg = config::load(app);
                let live = engine_live(app);
                if cfg.settings.minimize_to_tray {
                    // Esconde na bandeja em vez de fechar — a transmissão continua (§14.8).
                    // Com feedback: sem ele, o app "sumia" num botão chamado "Fechar".
                    api.prevent_close();
                    let _ = window.hide();
                    tray_hide_hint(app, live);
                } else if live {
                    // X com a live NO AR: confirma antes — um clique acidental derrubava a
                    // transmissão em todas as plataformas (o "Sair" da bandeja já perguntava).
                    api.prevent_close();
                    if confirm_end_live(app, "Você está AO VIVO. Fechar encerra a transmissão.") {
                        shutdown_engine(app);
                        // prevent_close já cancelou o fechamento — encerra explicitamente.
                        app.exit(0);
                    }
                } else {
                    // Fechar de verdade: mata FFmpeg para não deixar processo órfão (§14.2).
                    shutdown_engine(app);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("erro ao iniciar a Corneta");
}
