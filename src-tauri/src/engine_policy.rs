//! Política PURA do motor — decisões sem I/O que estavam enterradas no meio do `commands.rs`
//! (ao lado de locks, spawns e emits). Aqui viram funções testáveis: como uma linha de erro do
//! FFmpeg vira estado+mensagem, quando a bandeja fica vermelha/amarela, como o JSON do MediaMTX
//! e a URL de ingestão são lidos. Espelha o formato de `guardian/domain.rs` (núcleo puro + testes).

use crate::engine::{EngineSnapshot, TargetStatus};
use std::path::Path;

/// Bitrate em Mbps (ou kbps abaixo de 1 Mbps) pra exibição.
pub(crate) fn fmt_mbps(kbps: u32) -> String {
    if kbps >= 1000 {
        format!("{:.1} Mbps", kbps as f64 / 1000.0)
    } else {
        format!("{kbps} kbps")
    }
}

/// Qualidade geral do multistream → cor do ícone da bandeja.
pub(crate) fn quality_of(snap: &EngineSnapshot) -> &'static str {
    match snap.state.as_str() {
        "stopped" => "idle",
        "error" => "bad",
        "starting" => "warn",
        _ => {
            let mut bad = false;
            let mut warn = false;
            for st in snap.targets.values() {
                match st.state.as_str() {
                    "error" | "signal-lost" => bad = true,
                    "reconnecting" | "connecting" | "waiting" | "brb" => warn = true,
                    _ => {}
                }
            }
            if bad {
                "bad"
            } else if warn {
                "warn"
            } else {
                "good"
            }
        }
    }
}

/// Tooltip da bandeja: cabeçalho + uma linha por plataforma (métrica/estado).
pub(crate) fn tray_tooltip(snap: &EngineSnapshot) -> String {
    if snap.state == "stopped" {
        return "Corneta".into();
    }
    let header = match snap.state.as_str() {
        "starting" => "Corneta · aguardando OBS".to_string(),
        "error" => "Corneta · erro".to_string(),
        _ => format!("Corneta · no ar ({})", snap.targets.len()),
    };
    let mut items: Vec<&TargetStatus> = snap.targets.values().collect();
    items.sort_by(|a, b| a.name.cmp(&b.name));
    let mut lines = vec![header];
    for st in items {
        let (mark, detail) = match st.state.as_str() {
            "live" => ("✓", fmt_mbps(st.bitrate_kbps)),
            "reconnecting" => ("⚠", "reconectando".to_string()),
            "error" => ("✕", "erro".to_string()),
            "signal-lost" => ("✕", "sem sinal do OBS".to_string()),
            "paused" => ("⏸", "pausado".to_string()),
            "waiting" => ("◌", "aguardando sinal".to_string()),
            "brb" => ("◷", "JÁ VOLTO no ar".to_string()),
            _ => ("…", "conectando".to_string()),
        };
        lines.push(format!("{mark} {} · {detail}", st.name));
    }
    lines.join("\n")
}

/// Lê um valor numérico do tipo "fps= 60" / "drop=5" do log do FFmpeg.
pub(crate) fn parse_kv(line: &str, key: &str) -> Option<f64> {
    let idx = line.find(key)?;
    let rest = line[idx + key.len()..].trim_start();
    let num: String = rest
        .chars()
        .take_while(|c| c.is_ascii_digit() || *c == '.')
        .collect();
    num.parse().ok()
}

/// Traduz uma linha de erro do FFmpeg para (estado, mensagem amigável).
pub(crate) fn friendly_error(low: &str) -> (&'static str, String) {
    if low.contains("403")
        || low.contains("forbidden")
        || low.contains("unauthorized")
        || low.contains("not authorized")
        || low.contains("rejected")
        || low.contains("auth")
        || low.contains("badname")
        || low.contains("publish denied")
        || low.contains("invalid stream")
        || low.contains("invalid key")
        || low.contains("stream key")
    {
        (
            "error",
            "Endereço ou chave recusados — confira o destino em Plataformas e clique em Tentar de novo."
                .into(),
        )
    } else if low.contains("connection refused")
        || low.contains("cannot open")
        || low.contains("failed to connect")
        || low.contains("no route")
        || low.contains("name or service not known")
    {
        (
            "reconnecting",
            "Sem conexão com a plataforma — tentando de novo.".into(),
        )
    } else if low.contains("broken pipe")
        || low.contains("connection reset")
        || low.contains("end of file")
        || low.contains("timed out")
    {
        ("reconnecting", "A conexão caiu — reconectando.".into())
    } else {
        (
            "reconnecting",
            "Instabilidade no envio — reconectando.".into(),
        )
    }
}

/// Mantém no log o motivo útil devolvido pelo FFmpeg sem persistir URL/chave de transmissão.
/// Só produz saída para linhas de erro; stats e avisos normais continuam fora do disco.
pub(crate) fn safe_ffmpeg_diagnostic(line: &str, stream_key: &str) -> Option<String> {
    const ERROR_MARKERS: [&str; 12] = [
        "error",
        "failed",
        "refused",
        "forbidden",
        "unauthorized",
        "denied",
        "badname",
        "broken pipe",
        "connection reset",
        "unable to",
        "timed out",
        "end of file",
    ];
    let low = line.to_ascii_lowercase();
    if line.contains("frame=") || !ERROR_MARKERS.iter().any(|marker| low.contains(marker)) {
        return None;
    }

    let mut safe = if stream_key.is_empty() {
        line.trim().to_string()
    } else {
        line.trim().replace(stream_key, "<stream-key>")
    };

    // O FFmpeg costuma ecoar a URL inteira em erros de abertura. Redige do esquema até o
    // próximo delimitador; o motivo ao redor (TLS, DNS, BadName...) continua visível.
    loop {
        let lower = safe.to_ascii_lowercase();
        let start = [lower.find("rtmp://"), lower.find("rtmps://")]
            .into_iter()
            .flatten()
            .min();
        let Some(start) = start else { break };
        let end = safe[start..]
            .char_indices()
            .find_map(|(offset, ch)| {
                (offset > 0 && (ch.is_whitespace() || matches!(ch, '\'' | '"' | ']' | ')')))
                    .then_some(start + offset)
            })
            .unwrap_or(safe.len());
        safe.replace_range(start..end, "<rtmp-url>");
    }

    if safe.chars().count() > 600 {
        safe = safe.chars().take(600).collect();
        safe.push('…');
    }
    Some(safe)
}

/// `true` se o caminho é um `brb-slate.*` (o nome, sem extensão, é exatamente "brb-slate").
pub(crate) fn is_brb_slate_path(p: &Path) -> bool {
    p.file_stem()
        .and_then(|s| s.to_str())
        .map(|s| s.eq_ignore_ascii_case("brb-slate"))
        .unwrap_or(false)
}

/// A extensão indica um VÍDEO (não uma imagem/still)?
pub(crate) fn brb_slate_is_video(p: &Path) -> bool {
    matches!(
        p.extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_ascii_lowercase())
            .as_deref(),
        Some("mp4" | "mov" | "mkv" | "webm" | "m4v")
    )
}

/// Parte PURA do estado dos paths do MediaMTX: lê o JSON da API `/v3/paths/list` e devolve
/// (ingestão pronta, bytes recebidos na ingestão, programa pronto). O byte count distingue OBS
/// no ar de OBS travado. JSON inválido/ausente → (false, 0, false), igual à falha de rede.
pub(crate) fn parse_mediamtx_paths(
    body: &str,
    ingest_name: &str,
    program_name: &str,
) -> (bool, u64, bool) {
    let v: serde_json::Value = match serde_json::from_str(body) {
        Ok(v) => v,
        Err(_) => return (false, 0, false),
    };
    let mut ingest_ready = false;
    let mut bytes = 0u64;
    let mut prog_ready = false;
    if let Some(arr) = v.get("items").and_then(|i| i.as_array()) {
        for p in arr {
            let name = p.get("name").and_then(|n| n.as_str()).unwrap_or("");
            // MediaMTX novo chama os campos de `online`/`inboundBytes`; versões antigas
            // expunham `ready`/`bytesReceived`. Aceitar os dois evita regredir o detector ao
            // atualizar o sidecar (os campos antigos já estão marcados como deprecated).
            let ready = p
                .get("online")
                .and_then(|r| r.as_bool())
                .or_else(|| p.get("ready").and_then(|r| r.as_bool()))
                == Some(true);
            if name == ingest_name {
                ingest_ready = ready;
                bytes = p
                    .get("inboundBytes")
                    .and_then(|b| b.as_u64())
                    .or_else(|| p.get("bytesReceived").and_then(|b| b.as_u64()))
                    .unwrap_or(0);
            } else if name == program_name {
                prog_ready = ready;
            }
        }
    }
    (ingest_ready, bytes, prog_ready)
}

/// Parte PURA do teste de alcance: extrai (host, porta) da URL de ingestão. Porta padrão 443
/// pra rtmps, 1935 pro resto. Host vazio → erro. (A conexão TCP em si fica no adapter.)
pub(crate) fn parse_ingest_hostport(ingest_url: &str) -> Result<(String, u16), String> {
    let after = ingest_url.split("://").nth(1).unwrap_or(ingest_url);
    let hostport = after.split('/').next().unwrap_or("");
    let (host, port) = match hostport.rsplit_once(':') {
        Some((h, p)) => (h.to_string(), p.parse::<u16>().unwrap_or(1935)),
        None => {
            let default = if ingest_url.starts_with("rtmps") {
                443
            } else {
                1935
            };
            (hostport.to_string(), default)
        }
    };
    if host.is_empty() {
        return Err("URL de ingestão inválida".into());
    }
    Ok((host, port))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn target(name: &str, state: &str, kbps: u32) -> TargetStatus {
        TargetStatus {
            target_id: name.into(),
            name: name.into(),
            state: state.into(),
            bitrate_kbps: kbps,
            fps: 0,
            dropped_frames: 0,
            uptime_sec: 0.0,
            message: None,
        }
    }
    fn snap(state: &str, targets: Vec<TargetStatus>) -> EngineSnapshot {
        let mut map = HashMap::new();
        for t in targets {
            map.insert(t.target_id.clone(), t);
        }
        EngineSnapshot {
            state: state.into(),
            started_at: None,
            ingest_live: state == "live",
            operation_id: None,
            error_id: None,
            targets: map,
            message: None,
            cpu: None,
            gpu: None,
            memory_pct: None,
            obs: None,
            forced_brb: false,
        }
    }

    #[test]
    fn fmt_mbps_threshold() {
        assert_eq!(fmt_mbps(999), "999 kbps");
        assert_eq!(fmt_mbps(1000), "1.0 Mbps");
        assert_eq!(fmt_mbps(6000), "6.0 Mbps");
    }

    #[test]
    fn quality_red_yellow_green() {
        assert_eq!(quality_of(&snap("stopped", vec![])), "idle");
        assert_eq!(quality_of(&snap("error", vec![])), "bad");
        assert_eq!(quality_of(&snap("starting", vec![])), "warn");
        // um destino em erro → bad, mesmo com outro no ar.
        assert_eq!(
            quality_of(&snap(
                "live",
                vec![target("a", "live", 6000), target("b", "error", 0)]
            )),
            "bad"
        );
        // reconectando sem erro → warn.
        assert_eq!(
            quality_of(&snap(
                "live",
                vec![target("a", "live", 6000), target("b", "reconnecting", 0)]
            )),
            "warn"
        );
        // tudo live → good.
        assert_eq!(
            quality_of(&snap("live", vec![target("a", "live", 6000)])),
            "good"
        );
        // signal-lost também é bad.
        assert_eq!(
            quality_of(&snap("live", vec![target("a", "signal-lost", 0)])),
            "bad"
        );
        // connecting / waiting / brb → warn (não bad).
        for st in ["connecting", "waiting", "brb"] {
            assert_eq!(
                quality_of(&snap("live", vec![target("a", st, 0)])),
                "warn",
                "{st}"
            );
        }
    }

    #[test]
    fn tray_tooltip_lists_platforms() {
        let s = snap(
            "live",
            vec![target("YouTube", "live", 9000), target("Twitch", "brb", 0)],
        );
        let t = tray_tooltip(&s);
        assert!(t.starts_with("Corneta · no ar (2)"));
        assert!(t.contains("✓ YouTube · 9.0 Mbps"));
        assert!(t.contains("◷ Twitch · JÁ VOLTO no ar"));
        assert_eq!(tray_tooltip(&snap("stopped", vec![])), "Corneta");
    }

    #[test]
    fn friendly_error_classifies() {
        assert_eq!(
            friendly_error("stream key rejected: 403 forbidden").0,
            "error"
        );
        assert_eq!(friendly_error("not authorized").0, "error");
        assert_eq!(friendly_error("connection refused").0, "reconnecting");
        assert_eq!(friendly_error("broken pipe").0, "reconnecting");
        assert_eq!(
            friendly_error("server error: netstream.publish.badname").0,
            "error"
        );
        assert_eq!(friendly_error("algo estranho").0, "reconnecting");
        // a mensagem de chave recusada guia o streamer pra Plataformas.
        assert!(friendly_error("auth failed").1.contains("Plataformas"));
        // cada tier de reconexão tem a sua mensagem.
        assert_eq!(
            friendly_error("connection refused").1,
            "Sem conexão com a plataforma — tentando de novo."
        );
        assert_eq!(
            friendly_error("broken pipe").1,
            "A conexão caiu — reconectando."
        );
        assert_eq!(
            friendly_error("algo estranho").1,
            "Instabilidade no envio — reconectando."
        );
    }

    #[test]
    fn ffmpeg_diagnostic_keeps_reason_and_redacts_destination() {
        let safe = safe_ffmpeg_diagnostic(
            "[rtmp] Server error: BadName opening rtmps://host/app/secret-key",
            "secret-key",
        )
        .unwrap();
        assert!(safe.contains("BadName"));
        assert!(safe.contains("<rtmp-url>"));
        assert!(!safe.contains("host"));
        assert!(!safe.contains("secret-key"));
        assert!(safe_ffmpeg_diagnostic("frame=12 fps=30", "secret").is_none());
    }

    #[test]
    fn parse_kv_reads_ffmpeg_stats() {
        assert_eq!(
            parse_kv("frame= 120 fps= 60 bitrate= 6000.5kbits/s", "fps="),
            Some(60.0)
        );
        assert_eq!(parse_kv("bitrate= 6000.5kbits/s", "bitrate="), Some(6000.5));
        assert_eq!(parse_kv("drop=5", "drop="), Some(5.0));
        assert_eq!(parse_kv("sem chave aqui", "fps="), None);
        // chave presente mas sem dígito depois → None (não pânico).
        assert_eq!(parse_kv("fps= abc", "fps="), None);
    }

    #[test]
    fn slate_path_predicates() {
        assert!(is_brb_slate_path(Path::new("/x/brb-slate.png")));
        assert!(is_brb_slate_path(Path::new("/x/BRB-SLATE.MP4")));
        assert!(!is_brb_slate_path(Path::new("/x/outra.png")));
        assert!(brb_slate_is_video(Path::new("/x/brb-slate.mp4")));
        assert!(brb_slate_is_video(Path::new("/x/brb-slate.MOV")));
        assert!(!brb_slate_is_video(Path::new("/x/brb-slate.png")));
    }

    #[test]
    fn mediamtx_paths_ready_and_bytes() {
        let body = r#"{"items":[
            {"name":"live/obs","ready":true,"bytesReceived":12345},
            {"name":"live/obs_program","ready":false}
        ]}"#;
        assert_eq!(
            parse_mediamtx_paths(body, "live/obs", "live/obs_program"),
            (true, 12345, false)
        );
        let current = r#"{"items":[
            {"name":"live/obs","online":true,"inboundBytes":67890},
            {"name":"live/obs_program","online":true}
        ]}"#;
        assert_eq!(
            parse_mediamtx_paths(current, "live/obs", "live/obs_program"),
            (true, 67890, true)
        );
        // JSON inválido → tudo falso (igual falha de rede).
        assert_eq!(
            parse_mediamtx_paths("nao é json", "live/obs", "live/obs_program"),
            (false, 0, false)
        );
        // path ausente → não pronto.
        assert_eq!(
            parse_mediamtx_paths(r#"{"items":[]}"#, "live/obs", "live/obs_program"),
            (false, 0, false)
        );
        // só o _program pronto (OBS ainda não publicou) → prog_ready=true, ingest false.
        let prog = r#"{"items":[{"name":"live/obs_program","ready":true}]}"#;
        assert_eq!(
            parse_mediamtx_paths(prog, "live/obs", "live/obs_program"),
            (false, 0, true)
        );
    }

    #[test]
    fn ingest_hostport_defaults() {
        assert_eq!(
            parse_ingest_hostport("rtmp://live.twitch.tv/app").unwrap(),
            ("live.twitch.tv".into(), 1935)
        );
        assert_eq!(
            parse_ingest_hostport("rtmps://x.live-video.net/app").unwrap(),
            ("x.live-video.net".into(), 443)
        );
        assert_eq!(
            parse_ingest_hostport("rtmp://host:1234/app").unwrap(),
            ("host".into(), 1234)
        );
        assert!(parse_ingest_hostport("rtmp:///app").is_err());
        // porta não-numérica → cai pro default 1935 (unwrap_or).
        assert_eq!(
            parse_ingest_hostport("rtmp://host:abc/app").unwrap(),
            ("host".into(), 1935)
        );
        // múltiplos ':' → rsplit_once pega o ÚLTIMO como porta.
        assert_eq!(
            parse_ingest_hostport("rtmp://host:1234:5/app").unwrap(),
            ("host:1234".into(), 5)
        );
    }
}
