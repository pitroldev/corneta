mod chat;
mod commands;
mod config;
mod engine;
mod keys;
mod obs;
mod session;

use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager};

/// Estado global: runtime do motor (handle do sidecar + último snapshot) + chat.
pub struct AppState {
    pub engine: Mutex<engine::EngineRuntime>,
    pub chat: Mutex<chat::ChatRuntime>,
}

fn show_main(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
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
        .manage(AppState {
            engine: Mutex::new(engine::EngineRuntime::default()),
            chat: Mutex::new(chat::ChatRuntime::default()),
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
            commands::list_sessions,
            commands::read_session,
            commands::delete_session,
            commands::open_sessions_dir,
            commands::chat_start,
            commands::chat_stop,
            commands::open_chat_window,
            commands::obs_set_stream,
            commands::test_target,
            commands::open_logs_dir,
            commands::register_shortcut,
        ])
        .setup(|app| {
            // Registra o atalho global de começar/parar a partir das settings.
            {
                use tauri_plugin_global_shortcut::GlobalShortcutExt;
                let sc = config::load(app.handle()).settings.live_shortcut;
                if !sc.trim().is_empty() {
                    let _ = app.global_shortcut().register(sc.as_str());
                }
            }
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
                            commands::kill_engine(app);
                            app.exit(0);
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
                let app = window.app_handle();
                let cfg = config::load(app);
                if cfg.settings.minimize_to_tray {
                    // Esconde na bandeja em vez de fechar — a transmissão continua (§14.8).
                    api.prevent_close();
                    let _ = window.hide();
                } else {
                    // Fechar de verdade: mata FFmpeg para não deixar processo órfão (§14.2).
                    commands::kill_engine(app);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("erro ao iniciar a Corneta");
}
