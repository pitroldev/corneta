mod commands;
mod config;
mod engine;
mod keys;

use std::sync::Mutex;
use tauri::Manager;

/// Estado global: runtime do motor (handle do sidecar + último snapshot).
pub struct AppState {
    pub engine: Mutex<engine::EngineRuntime>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // single-instance DEVE ser o primeiro plugin (§14.2): evita duas Cornetas
        // disputando a porta de ingestão / subindo motores duplicados.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .manage(AppState {
            engine: Mutex::new(engine::EngineRuntime::default()),
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            commands::save_config,
            commands::set_key,
            commands::clear_key,
            commands::has_key,
            commands::detect_encoders,
            commands::test_upload,
            commands::obs_autoconfigure,
            commands::start_engine,
            commands::stop_engine,
        ])
        .on_window_event(|window, event| {
            // Ao fechar, mata FFmpeg/MediaMTX para não deixar processos órfãos (§14.2).
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let app = window.app_handle().clone();
                commands::kill_engine(&app);
            }
        })
        .run(tauri::generate_context!())
        .expect("erro ao iniciar a Corneta");
}
