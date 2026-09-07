mod alerts;
mod auth;
mod chat;
mod commands;
mod compositor;
mod config;
mod engine;
mod engine_policy;
mod frame_pool;
mod gpu_pipeline;
mod guardian;
mod http_client;
mod i18n;
mod keys;
mod obs;
mod overlay;
mod permissions;
mod queue_probe;
mod recorder;
mod renditions;
mod resources;
mod session;
mod shortcut;
mod splicer;
mod studio;
mod telemetry;
mod updater;

// The library test harness also needs Tauri's Common Controls v6 manifest.
#[cfg(all(test, target_os = "windows", target_env = "msvc"))]
#[link(name = "resource", kind = "static", modifiers = "-bundle")]
extern "C" {}

use crate::i18n::Msg;
use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager};

struct NativeMenu {
    show: MenuItem<tauri::Wry>,
    quit: MenuItem<tauri::Wry>,
}

/// Apply language changes to native UI without waiting for an engine transition.
pub(crate) fn apply_native_language(app: &tauri::AppHandle, setting: &str) {
    let before = i18n::generation();
    let locale = i18n::apply_setting(setting);
    if before == i18n::generation() {
        return;
    }
    if let Some(menu) = app.try_state::<NativeMenu>() {
        let _ = menu.show.set_text(Msg::TrayOpen.text(locale));
        let _ = menu.quit.set_text(Msg::TrayQuit.text(locale));
    }
    let snapshot = app
        .state::<AppState>()
        .engine
        .lock()
        .unwrap()
        .snapshot
        .clone();
    if let Some(snapshot) = snapshot {
        commands::update_tray(app, &snapshot);
    }
}

pub struct AppState {
    pub engine: Mutex<engine::EngineRuntime>,
    pub chat: Mutex<chat::ChatRuntime>,
    pub alerts: Mutex<alerts::AlertRuntime>,
    pub oauth: Mutex<auth::OauthConfig>,
    pub studio: Mutex<studio::StudioServer>,
    pub overlay: Mutex<overlay::OverlayServer>,
    pub telemetry: telemetry::TelemetryRuntime,
}

fn show_main(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

/// Use actual engine liveness; a cached error snapshot does not imply an active stream.
fn engine_live(app: &tauri::AppHandle) -> bool {
    let st = app.state::<AppState>();
    let eng = st.engine.lock().unwrap();
    eng.live
}

fn confirm_end_live(app: &tauri::AppHandle) -> bool {
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
    app.dialog()
        .message(Msg::ExitLiveWarning.now())
        .title(Msg::ExitTitle.now())
        .buttons(MessageDialogButtons::OkCancelCustom(
            Msg::ExitConfirm.now(),
            Msg::ExitCancel.now(),
        ))
        .blocking_show()
}

fn shutdown_engine(app: &tauri::AppHandle) {
    let generation = app.state::<AppState>().engine.lock().unwrap().start_gen;
    // Capture liveness before shutdown; the exit marker and flush run only on ExitRequested.
    app.state::<AppState>()
        .telemetry
        .note_exit_live(engine_live(app));
    studio::stop(&app.state::<AppState>().studio);
    overlay::stop(&app.state::<AppState>().overlay);
    commands::kill_engine_for_shutdown(app);
    if auth::youtube_complete_active(app, generation).is_err() {
        log::warn!("YouTube auto-broadcast: cleanup_pending_at_shutdown");
    }
}

/// Explain the first tray hide, and always confirm that an active stream continues.
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
            &Msg::TrayLiveHintTitle.now(),
            &Msg::TrayLiveHintBody.now(),
        );
    } else if first {
        commands::notify(
            app,
            &Msg::TrayIdleHintTitle.now(),
            &Msg::TrayIdleHintBody.now(),
        );
    }
    if first {
        if let Some(m) = marker {
            let _ = std::fs::write(m, "1");
        }
    }
}

/// Keep the borderless window reachable on small displays, allowing space for the taskbar.
fn clamp_window_to_screen(w: &tauri::WebviewWindow) {
    let Ok(Some(monitor)) = w.current_monitor() else {
        return;
    };
    let scale = monitor.scale_factor();
    if scale <= 0.0 {
        return;
    }
    let mon_h = monitor.size().height as f64 / scale;
    let max_h = (mon_h - 72.0).max(480.0); // Reserve taskbar space in logical pixels.
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
    let startup_started = std::time::Instant::now();
    let builder = tauri::Builder::default()
        // Register first to prevent competing ingest listeners or duplicate engines.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            show_main(app);
        }))
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .max_file_size(5 * 1024 * 1024)
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepSome(5))
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
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None::<Vec<&str>>,
        ))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                        let _ = app.emit("shortcut://toggle-live", ());
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_dialog::init());
    // Contributor builds omit the updater plugin so they cannot install official releases over themselves.
    #[cfg(not(corneta_contributor))]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    builder
        .manage(AppState {
            engine: Mutex::new(engine::EngineRuntime::default()),
            chat: Mutex::new(chat::ChatRuntime::default()),
            alerts: Mutex::new(alerts::AlertRuntime::default()),
            oauth: Mutex::new(auth::OauthConfig::default()),
            studio: Mutex::new(studio::StudioServer::default()),
            overlay: Mutex::new(overlay::OverlayServer::default()),
            telemetry: telemetry::TelemetryRuntime::default(),
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
            updater::install_update,
            updater::update_installing,
            commands::set_target_paused,
            commands::retry_target,
            commands::set_force_brb,
            commands::list_sessions,
            commands::read_session,
            commands::read_session_chat,
            commands::read_session_bytes,
            commands::delete_session,
            commands::open_sessions_dir,
            commands::record_check_dir,
            commands::record_pick_dir,
            commands::record_test,
            commands::record_retry,
            commands::record_allow_file,
            commands::set_session_offset,
            commands::delete_session_recordings,
            commands::open_recording_folder,
            commands::add_session_marker,
            commands::export_clip,
            commands::open_external,
            commands::chat_start,
            commands::chat_stop,
            commands::chat_running,
            commands::chat_send,
            auth::set_oauth_config,
            auth::set_youtube_oauth,
            auth::clear_youtube_oauth,
            auth::youtube_use_official,
            auth::youtube_use_own_creds,
            auth::set_kick_oauth,
            auth::clear_kick_oauth,
            auth::kick_use_official,
            auth::kick_use_own_creds,
            auth::auth_status,
            auth::twitch_login_start,
            auth::twitch_logout,
            auth::youtube_login_start,
            auth::youtube_logout,
            auth::youtube_broadcast_recovery_status,
            auth::youtube_retry_broadcast_cleanup,
            auth::youtube_acknowledge_unknown_broadcast,
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
            commands::export_diagnostics,
            commands::register_shortcut,
            commands::obs_check,
            commands::mark_moment,
            commands::export_config,
            commands::import_config,
            commands::save_text_file,
            commands::save_brb_slate,
            commands::brb_slate_needs_refresh,
            commands::set_brb_slate,
            commands::clear_brb_slate,
            commands::get_brb_slate_preview,
            commands::capture_frame,
            commands::mesa_start_server,
            commands::mesa_stop_server,
            commands::mesa_obs_add_source,
            commands::mesa_obs_remove_source,
            commands::overlay_start,
            commands::overlay_stop,
            commands::overlay_status,
            commands::overlay_test,
            commands::overlay_chat_test,
            commands::overlay_obs_add_source,
            commands::open_privacy_settings,
            telemetry::telemetry_status,
            telemetry::telemetry_set_consent,
            telemetry::telemetry_regenerate_id,
            telemetry::telemetry_capture,
            telemetry::telemetry_capture_exception,
        ])
        .setup(move |app| {
            i18n::apply_setting(&config::load(app.handle()).settings.language);
            let previous_exit = telemetry::mark_boot_started(app.handle());
            let telemetry_state = &app.state::<AppState>().telemetry;
            telemetry_state.initialize(app.handle());
            telemetry::install_panic_hook(app.handle().clone());
            telemetry_state.capture_app_started(&previous_exit, startup_started.elapsed());
            session::recover_incomplete_sessions(app.handle());
            // Collect orphaned recordings after interrupted sessions, without blocking startup on disk I/O.
            {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    let cfg = config::load(&handle);
                    let dir = recorder::resolve_dir(&handle, &cfg.settings.record_video_dir);
                    session::prune_videos(
                        &handle,
                        dir.as_deref(),
                        cfg.settings.record_video_keep_gb,
                    );
                });
            }
            if let Some(w) = app.get_webview_window("main") {
                permissions::grant_av_permissions(&w);
                clamp_window_to_screen(&w);
            }
            // Start enabled overlays at boot so persisted OBS sources reconnect before a stream begins.
            {
                let cfg = config::load(app.handle());
                if cfg.settings.overlay_enabled {
                    let handle = app.handle().clone();
                    let port = cfg.settings.overlay_port as u16;
                    tauri::async_runtime::spawn(async move {
                        let st = handle.state::<AppState>();
                        if let Err(e) = overlay::start(&st.overlay, port).await {
                            log::warn!("overlay: {e}");
                        }
                    });
                }
            }
            // The frontend registers shortcuts so registration errors can be shown to the user.
            if let Some(icon) = app.default_window_icon().cloned() {
                let show = MenuItem::with_id(app, "show", Msg::TrayOpen.now(), true, None::<&str>)?;
                let quit = MenuItem::with_id(app, "quit", Msg::TrayQuit.now(), true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&show, &quit])?;
                app.manage(NativeMenu { show, quit });

                TrayIconBuilder::with_id("corneta-tray")
                    .icon(icon)
                    .tooltip("Corneta")
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "show" => show_main(app),
                        "quit" => {
                            let ok = !engine_live(app) || confirm_end_live(app);
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
                // Only the main window hides to the tray; the floating chat closes normally.
                if window.label() != "main" {
                    return;
                }
                let app = window.app_handle();
                let cfg = config::load(app);
                let live = engine_live(app);
                if cfg.settings.minimize_to_tray {
                    api.prevent_close();
                    let _ = window.hide();
                    tray_hide_hint(app, live);
                } else if live {
                    api.prevent_close();
                    if confirm_end_live(app) {
                        shutdown_engine(app);
                        // Close was prevented above; exit explicitly after confirmation.
                        app.exit(0);
                    }
                } else {
                    shutdown_engine(app);
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("failed to start Corneta")
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested { .. } = event {
                let telemetry = &app.state::<AppState>().telemetry;
                telemetry.record_clean_exit(app, engine_live(app));
                telemetry.shutdown();
            }
        });
}
