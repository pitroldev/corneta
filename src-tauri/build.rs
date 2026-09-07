use std::path::PathBuf;

/// Variáveis do `.env` da raiz que podem ser ASSADAS no binário.
///
/// ALLOWLIST, e não "carrega o arquivo": o `.env` guarda junto o
/// `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, os Client Secrets de OAuth e chaves de
/// API. Um loader genérico jogaria tudo isso pra dentro do executável, onde
/// qualquer `strings` acha. Só entra o que já é público por definição: o token
/// `phc_` de ingestão (feito pra viver no cliente), o host e os kill switches.
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
    tauri_build::build()
}

/// Repassa pro `option_env!` do `telemetry.rs` o que estiver no `.env` da raiz.
///
/// O Cargo não lê `.env` — sem isto, `pnpm app:dev` compila com a telemetria em
/// no-op mesmo com tudo configurado, e o silêncio parece "não está chegando
/// evento" em vez de "não foi ligado".
///
/// O ambiente REAL sempre vence: no CI as variáveis vêm do runner e o `.env` nem
/// existe. Aqui só preenchemos o que estiver faltando.
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
        // Vazio é "não configurado": deixar passar viraria um `option_env!`
        // Some("") que engana o `posthog_token()`.
        if value.is_empty() {
            continue;
        }
        // Quebra de linha no valor viraria diretiva de build injetada.
        if value.contains('\n') || value.contains('\r') {
            continue;
        }
        println!("cargo:rustc-env={key}={value}");
    }
}
