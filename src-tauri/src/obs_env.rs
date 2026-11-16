//! What Corneta can learn about OBS on this PC without its WebSocket: whether it is installed and
//! running, and how its WebSocket server is set up. Read-only: nothing here changes OBS's files.
use std::path::{Path, PathBuf};

/// OBS's own default; Corneta falls back to it when the settings cannot be read.
pub const DEFAULT_PORT: u16 = 4455;

#[derive(serde::Serialize, Debug, Default, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ObsEnvironment {
    pub installed: bool,
    pub running: bool,
    /// `None` when OBS's settings could not be read, so the UI must not claim either state.
    pub websocket_enabled: Option<bool>,
    pub websocket_port: Option<u16>,
    pub auth_required: Option<bool>,
    /// Streamlabs Desktop is on this PC. It embeds OBS's engine without the WebSocket server, so
    /// it can only be pointed at Corneta by hand.
    pub streamlabs: bool,
}

/// Deliberately not `Debug`: the password must never reach a log line or a panic message.
#[derive(Default, PartialEq, Clone)]
pub(crate) struct WebSocketSettings {
    pub enabled: bool,
    pub port: u16,
    pub auth_required: bool,
    pub password: String,
}

fn parse_bool(value: &str) -> Option<bool> {
    match value.trim().to_ascii_lowercase().as_str() {
        "true" | "1" => Some(true),
        "false" | "0" => Some(false),
        _ => None,
    }
}

/// OBS up to 30 keeps the WebSocket options in the `[OBSWebSocket]` section of `global.ini`.
/// Keys OBS never wrote keep its defaults: server off, port 4455, authentication on.
pub(crate) fn parse_global_ini(raw: &str) -> Option<WebSocketSettings> {
    let mut in_section = false;
    let mut found = false;
    let mut settings = WebSocketSettings {
        port: DEFAULT_PORT,
        auth_required: true,
        ..Default::default()
    };
    for line in raw.trim_start_matches('\u{feff}').lines() {
        let line = line.trim_end_matches('\r');
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            in_section = trimmed.eq_ignore_ascii_case("[OBSWebSocket]");
            found |= in_section;
            continue;
        }
        if !in_section {
            continue;
        }
        // The password may contain `=`, so only the first one separates key from value.
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        match key.trim() {
            "ServerEnabled" => settings.enabled = parse_bool(value).unwrap_or(false),
            "ServerPort" => settings.port = value.trim().parse().unwrap_or(DEFAULT_PORT),
            "AuthRequired" => settings.auth_required = parse_bool(value).unwrap_or(true),
            "ServerPassword" => settings.password = value.to_string(),
            _ => {}
        }
    }
    found.then_some(settings)
}

/// OBS 31 moved the same options to `plugin_config/obs-websocket/config.json`.
pub(crate) fn parse_config_json(raw: &str) -> Option<WebSocketSettings> {
    let value: serde_json::Value = serde_json::from_str(raw.trim_start_matches('\u{feff}')).ok()?;
    let object = value.as_object()?;
    Some(WebSocketSettings {
        enabled: object
            .get("server_enabled")
            .and_then(serde_json::Value::as_bool)
            .unwrap_or(false),
        port: object
            .get("server_port")
            .and_then(serde_json::Value::as_u64)
            .and_then(|port| u16::try_from(port).ok())
            .unwrap_or(DEFAULT_PORT),
        auth_required: object
            .get("auth_required")
            .and_then(serde_json::Value::as_bool)
            .unwrap_or(true),
        password: object
            .get("server_password")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default()
            .to_string(),
    })
}

const MAX_SETTINGS_BYTES: u64 = 1024 * 1024;

fn read_small(path: &Path) -> Option<String> {
    let meta = std::fs::metadata(path).ok()?;
    if !meta.is_file() || meta.len() > MAX_SETTINGS_BYTES {
        return None;
    }
    std::fs::read_to_string(path).ok()
}

/// The newer location wins when both exist: OBS 31 stops updating `global.ini` after migrating.
pub(crate) fn read_settings_from(config_dir: &Path) -> Option<WebSocketSettings> {
    let json = config_dir
        .join("plugin_config")
        .join("obs-websocket")
        .join("config.json");
    if let Some(settings) = read_small(&json).and_then(|raw| parse_config_json(&raw)) {
        return Some(settings);
    }
    read_small(&config_dir.join("global.ini")).and_then(|raw| parse_global_ini(&raw))
}

fn config_dir() -> Option<PathBuf> {
    std::env::var_os("APPDATA").map(|dir| PathBuf::from(dir).join("obs-studio"))
}

pub(crate) fn websocket_settings() -> Option<WebSocketSettings> {
    config_dir().and_then(|dir| read_settings_from(&dir))
}

/// The port OBS's WebSocket server listens on, so a user who changed it still connects.
pub fn port() -> u16 {
    websocket_settings()
        .map(|settings| settings.port)
        .filter(|port| *port != 0)
        .unwrap_or(DEFAULT_PORT)
}

/// OBS's settings are the source of truth for its own password; the one typed in Corneta only
/// applies when they cannot be read.
pub(crate) fn password_from(settings: Option<&WebSocketSettings>, configured: &str) -> String {
    match settings {
        Some(settings) if !settings.auth_required => String::new(),
        Some(settings) if !settings.password.is_empty() => settings.password.clone(),
        _ => configured.to_string(),
    }
}

pub fn password(configured: &str) -> String {
    password_from(websocket_settings().as_ref(), configured)
}

#[cfg(windows)]
fn registry_install_dir() -> Option<PathBuf> {
    use winreg::enums::{HKEY_LOCAL_MACHINE, KEY_READ, KEY_WOW64_32KEY, KEY_WOW64_64KEY};
    [KEY_WOW64_64KEY, KEY_WOW64_32KEY]
        .into_iter()
        .find_map(|view| {
            winreg::RegKey::predef(HKEY_LOCAL_MACHINE)
                .open_subkey_with_flags("SOFTWARE\\OBS Studio", KEY_READ | view)
                .ok()?
                .get_value::<String, _>("")
                .ok()
                .filter(|dir| !dir.trim().is_empty())
                .map(PathBuf::from)
        })
}

#[cfg(not(windows))]
fn registry_install_dir() -> Option<PathBuf> {
    None
}

fn executable_in(install_dir: &Path) -> PathBuf {
    install_dir.join("bin").join("64bit").join("obs64.exe")
}

fn executable() -> Option<PathBuf> {
    let default_dirs = ["ProgramFiles", "ProgramW6432"]
        .into_iter()
        .filter_map(std::env::var_os)
        .map(|dir| PathBuf::from(dir).join("obs-studio"));
    registry_install_dir()
        .into_iter()
        .chain(default_dirs)
        .map(|dir| executable_in(&dir))
        .find(|exe| exe.is_file())
}

fn is_obs_process(name: &str) -> bool {
    name.eq_ignore_ascii_case("obs64.exe") || name == "obs"
}

/// Streamlabs Desktop kept the folder and executable names from when it was called Streamlabs OBS.
const STREAMLABS_EXECUTABLES: [&str; 2] = ["Streamlabs OBS.exe", "Streamlabs Desktop.exe"];

/// Streamlabs runs OBS's engine as a helper that is also called `obs64.exe`, inside its own
/// `obs-studio-node` folder.
fn is_streamlabs_engine(exe: &Path) -> bool {
    exe.to_string_lossy()
        .replace('\\', "/")
        .to_ascii_lowercase()
        .contains("/obs-studio-node/")
}

#[derive(Debug, PartialEq, Clone, Copy)]
enum Encoder {
    Obs,
    Streamlabs,
}

fn encoder_of(name: &str, exe: Option<&Path>) -> Option<Encoder> {
    if STREAMLABS_EXECUTABLES
        .iter()
        .any(|known| name.eq_ignore_ascii_case(known))
    {
        return Some(Encoder::Streamlabs);
    }
    if !is_obs_process(name) {
        return None;
    }
    // An unreadable path stays OBS: only a path inside Streamlabs' folder moves the engine there.
    Some(if exe.is_some_and(is_streamlabs_engine) {
        Encoder::Streamlabs
    } else {
        Encoder::Obs
    })
}

#[derive(Default)]
struct Running {
    obs: bool,
    streamlabs: bool,
}

fn running() -> Running {
    let mut system = sysinfo::System::new();
    system.refresh_processes_specifics(
        sysinfo::ProcessesToUpdate::All,
        true,
        sysinfo::ProcessRefreshKind::nothing(),
    );
    // The path costs a handle per process, so it is read only for the engines it tells apart.
    let engines: Vec<sysinfo::Pid> = system
        .processes()
        .iter()
        .filter(|(_, process)| is_obs_process(&process.name().to_string_lossy()))
        .map(|(pid, _)| *pid)
        .collect();
    if !engines.is_empty() {
        system.refresh_processes_specifics(
            sysinfo::ProcessesToUpdate::Some(&engines),
            false,
            sysinfo::ProcessRefreshKind::nothing().with_exe(sysinfo::UpdateKind::Always),
        );
    }
    let mut found = Running::default();
    for process in system.processes().values() {
        match encoder_of(&process.name().to_string_lossy(), process.exe()) {
            Some(Encoder::Obs) => found.obs = true,
            Some(Encoder::Streamlabs) => found.streamlabs = true,
            None => {}
        }
    }
    found
}

fn streamlabs_installed() -> bool {
    ["ProgramFiles", "ProgramW6432"]
        .into_iter()
        .filter_map(std::env::var_os)
        .map(PathBuf::from)
        .any(|programs| {
            STREAMLABS_EXECUTABLES.iter().any(|exe| {
                programs
                    .join(exe.trim_end_matches(".exe"))
                    .join(exe)
                    .is_file()
            })
        })
}

pub fn environment() -> ObsEnvironment {
    let settings = websocket_settings();
    let running = running();
    ObsEnvironment {
        // A portable OBS runs from any folder, so a running one counts as installed.
        installed: running.obs || executable().is_some(),
        running: running.obs,
        streamlabs: running.streamlabs || streamlabs_installed(),
        websocket_enabled: settings.as_ref().map(|settings| settings.enabled),
        websocket_port: settings.as_ref().map(|settings| settings.port),
        auth_required: settings.as_ref().map(|settings| settings.auth_required),
    }
}

/// Starts OBS from its own folder, which it requires to find its data files.
pub fn open() -> Result<(), String> {
    let exe = executable().ok_or_else(|| "obs_not_installed".to_string())?;
    let dir = exe
        .parent()
        .ok_or_else(|| "obs_not_installed".to_string())?;
    std::process::Command::new(&exe)
        .current_dir(dir)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map(|_| ())
        .map_err(|_| "obs_launch_failed".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "synthetic=value";

    #[test]
    fn the_engine_streamlabs_bundles_is_not_obs() {
        let obs = Path::new(r"C:\Program Files\obs-studio\bin\64bit\obs64.exe");
        let bundled = Path::new(
            r"C:\Program Files\Streamlabs OBS\resources\app.asar.unpacked\node_modules\obs-studio-node\obs64.exe",
        );
        assert_eq!(encoder_of("obs64.exe", Some(obs)), Some(Encoder::Obs));
        assert_eq!(
            encoder_of("OBS64.EXE", Some(bundled)),
            Some(Encoder::Streamlabs)
        );
        assert_eq!(
            encoder_of("obs64.exe", None),
            Some(Encoder::Obs),
            "an unreadable path keeps the old answer"
        );
        for name in ["Streamlabs OBS.exe", "streamlabs desktop.exe"] {
            assert_eq!(encoder_of(name, None), Some(Encoder::Streamlabs));
        }
        for name in [
            "chrome.exe",
            "Streamlabs Chatbot.exe",
            "obs-browser-page.exe",
        ] {
            assert_eq!(encoder_of(name, None), None, "{name} is not an encoder");
        }
    }

    #[test]
    fn global_ini_reads_only_the_websocket_section_and_keeps_obs_defaults() {
        let raw = format!(
            "\u{feff}[General]\r\nServerEnabled=true\r\nServerPort=1\r\n\r\n[OBSWebSocket]\r\nFirstLoad=false\r\nServerEnabled=true\r\nServerPort=4460\r\nAlertsEnabled=false\r\nAuthRequired=true\r\nServerPassword={SAMPLE}\r\n\r\n[Other]\r\nServerPassword=ignored\r\n"
        );
        let settings = parse_global_ini(&raw).unwrap();
        assert!(settings.enabled);
        assert_eq!(settings.port, 4460);
        assert!(settings.auth_required);
        assert_eq!(settings.password, SAMPLE);

        let untouched = parse_global_ini("[OBSWebSocket]\nFirstLoad=true\n").unwrap();
        assert!(!untouched.enabled);
        assert_eq!(untouched.port, DEFAULT_PORT);
        assert!(untouched.auth_required);
        assert!(untouched.password.is_empty());

        assert!(parse_global_ini("[General]\nName=obs\n").is_none());
    }

    #[test]
    fn config_json_reads_the_newer_location() {
        let raw = format!(
            r#"{{"alerts_enabled":false,"auth_required":false,"first_load":false,"server_enabled":true,"server_password":"{SAMPLE}","server_port":4470}}"#
        );
        let settings = parse_config_json(&raw).unwrap();
        assert!(settings.enabled);
        assert_eq!(settings.port, 4470);
        assert!(!settings.auth_required);
        assert_eq!(settings.password, SAMPLE);

        let defaults = parse_config_json("{}").unwrap();
        assert!(!defaults.enabled);
        assert_eq!(defaults.port, DEFAULT_PORT);
        assert!(defaults.auth_required);
        assert!(parse_config_json("[]").is_none());
        assert!(parse_config_json("not json").is_none());
    }

    #[test]
    fn the_newer_file_wins_and_a_missing_folder_reads_as_unknown() {
        let dir = std::env::temp_dir().join(format!("corneta-obs-env-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        assert!(read_settings_from(&dir).is_none());

        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(
            dir.join("global.ini"),
            "[OBSWebSocket]\nServerEnabled=false\nServerPort=4455\n",
        )
        .unwrap();
        assert!(!read_settings_from(&dir).unwrap().enabled);

        let plugin = dir.join("plugin_config").join("obs-websocket");
        std::fs::create_dir_all(&plugin).unwrap();
        std::fs::write(
            plugin.join("config.json"),
            r#"{"server_enabled":true,"server_port":4480}"#,
        )
        .unwrap();
        let settings = read_settings_from(&dir).unwrap();
        assert!(settings.enabled);
        assert_eq!(settings.port, 4480);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn obs_settings_decide_the_password_and_the_typed_one_is_the_fallback() {
        let with = |auth_required: bool, password: &str| WebSocketSettings {
            enabled: true,
            port: DEFAULT_PORT,
            auth_required,
            password: password.to_string(),
        };
        assert_eq!(password_from(Some(&with(true, SAMPLE)), "typed"), SAMPLE);
        assert_eq!(password_from(Some(&with(false, SAMPLE)), "typed"), "");
        assert_eq!(password_from(Some(&with(true, "")), "typed"), "typed");
        assert_eq!(password_from(None, "typed"), "typed");
    }

    #[test]
    fn recognizes_the_obs_process_by_name() {
        assert!(is_obs_process("obs64.exe"));
        assert!(is_obs_process("OBS64.EXE"));
        assert!(is_obs_process("obs"));
        assert!(!is_obs_process("obs-browser-page.exe"));
        assert!(!is_obs_process("corneta.exe"));
    }
}
