use std::path::PathBuf;

// Only public configuration may be embedded; other environment values can contain secrets.
const BAKEABLE: &[&str] = &[
    "POSTHOG_DESKTOP_TOKEN",
    "POSTHOG_HOST",
    "TELEMETRY_DISABLED",
    "CORNETA_BUILD_SHA",
];

fn main() {
    println!("cargo:rustc-check-cfg=cfg(corneta_contributor)");
    println!("cargo:rerun-if-env-changed=CORNETA_CONTRIBUTOR");
    if std::env::var("CORNETA_CONTRIBUTOR").as_deref() == Ok("1") {
        println!("cargo:rustc-cfg=corneta_contributor");
        println!("cargo:rustc-env=TELEMETRY_DISABLED=1");
    } else {
        bake_public_env();
    }
    assemble_destinations();
    tauri_build::build();
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
        && std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc")
    {
        // tauri-winres links resources to binaries; the library test harness also needs them.
        let out_dir = std::env::var("OUT_DIR").expect("Cargo must define OUT_DIR");
        println!("cargo:rustc-link-search=native={out_dir}");
    }
}

// Each destination is src/platforms/<id>/destination.json, the same files the frontend globs.
fn assemble_destinations() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../src/platforms");
    // A directory is scanned recursively, so a new destination folder also reruns this.
    println!("cargo:rerun-if-changed={}", root.display());
    let mut files: Vec<PathBuf> = std::fs::read_dir(&root)
        .expect("src/platforms must exist")
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path().join("destination.json"))
        .filter(|path| path.is_file())
        .collect();
    files.sort();
    let entries: Vec<String> = files
        .iter()
        .map(|path| std::fs::read_to_string(path).expect("destination.json must be readable"))
        .collect();
    let out_dir = std::env::var("OUT_DIR").expect("Cargo must define OUT_DIR");
    std::fs::write(
        PathBuf::from(out_dir).join("destinations.json"),
        format!("{{\"destinations\":[{}]}}", entries.join(",")),
    )
    .expect("OUT_DIR must be writable");
}

// Cargo does not load dotenv files. Explicit environment values must take precedence.
fn bake_public_env() {
    let env_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../.env");
    println!("cargo:rerun-if-changed={}", env_path.display());
    for name in BAKEABLE {
        println!("cargo:rerun-if-env-changed={name}");
    }

    let Ok(contents) = std::fs::read_to_string(&env_path) else {
        return;
    };
    for line in contents.lines() {
        let line = line.trim();
        if line.starts_with('#') {
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        let key = key.trim();
        if !BAKEABLE.contains(&key) || std::env::var_os(key).is_some() {
            continue;
        }
        let value = value.trim().trim_matches('"').trim_matches('\'');
        // Keep unset configuration distinguishable from Some("").
        if value.is_empty() {
            continue;
        }
        // Prevent build-directive injection.
        if value.contains('\n') || value.contains('\r') {
            continue;
        }
        println!("cargo:rustc-env={key}={value}");
    }
}
