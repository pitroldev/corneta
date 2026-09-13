#[path = "../src/replay_media/mod.rs"]
mod replay_media;

use std::io::Write;
use std::path::PathBuf;

use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Deserialize)]
#[serde(tag = "op", rename_all = "camelCase")]
enum Command {
    Open { path: PathBuf },
    Stats { url: String },
    Release { url: String },
    Revoke { path: PathBuf },
    Close,
}

#[tokio::main(flavor = "current_thread")]
async fn main() {
    if std::env::var("CORNETA_CONTRIBUTOR").as_deref() != Ok("1") {
        eprintln!("Replay benchmark requires the isolated contributor environment");
        std::process::exit(1);
    }
    loop {
        let line = tokio::task::spawn_blocking(|| {
            let mut line = String::new();
            std::io::stdin()
                .read_line(&mut line)
                .map(|read| (read, line))
        })
        .await;
        let Ok(Ok((read, line))) = line else {
            break;
        };
        if read == 0 {
            break;
        }
        let command = serde_json::from_str::<Command>(&line);
        let result: Result<Value, String> = match command {
            Ok(Command::Open { path }) => replay_media::open(path)
                .await
                .map(|url| json!({ "url": url })),
            Ok(Command::Stats { url }) => replay_media::stats(&url).map(|stats| {
                let mut value = json!(stats);
                let memory = sysinfo::get_current_pid().ok().and_then(|pid| {
                    let mut system = sysinfo::System::new();
                    system.refresh_processes_specifics(
                        sysinfo::ProcessesToUpdate::Some(&[pid]),
                        true,
                        sysinfo::ProcessRefreshKind::nothing().with_memory(),
                    );
                    system.process(pid).map(|process| process.memory())
                });
                value["nativeProcessMemoryBytes"] = json!(memory);
                value
            }),
            Ok(Command::Release { url }) => {
                replay_media::release(&url);
                Ok(json!({ "released": true }))
            }
            Ok(Command::Revoke { path }) => {
                replay_media::revoke_path(&path);
                Ok(json!({ "revoked": true }))
            }
            Ok(Command::Close) => break,
            Err(_) => Err("Invalid replay benchmark command".into()),
        };
        let output = match result {
            Ok(value) => json!({ "ok": true, "value": value }),
            Err(error) => json!({ "ok": false, "error": error }),
        };
        println!("{output}");
        if std::io::stdout().flush().is_err() {
            break;
        }
    }
}
