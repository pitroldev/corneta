//! Gravação do PROGRAMA em disco — o vídeo que alimenta o replay do relatório.
//! Ver docs/FEATURE-GRAVACAO-E-REPLAY.md.
//!
//! ------------------------------------------------------------
//! A REGRA QUE MANDA NO DESENHO
//! ------------------------------------------------------------
//! A gravação NUNCA pode derrubar a live. Este módulo é um filho isolado que lê o programa
//! como se fosse mais um espectador: disco cheio, pasta sumida, unidade arrancada — ele
//! morre, escreve o motivo na sessão, avisa por toast, e a transmissão não sente nada.
//! Nenhum erro daqui sobe pro caminho que decide o estado do motor.
//!
//! A hierarquia de sacrifício (§9.1 do doc), quando duas coisas não cabem:
//!   1. a transmissão · 2. o relatório · 3. o chat gravado · 4. o vídeo (o primeiro a cair)
//!
//! ------------------------------------------------------------
//! POR QUE fMP4 E NÃO MP4 COMUM
//! ------------------------------------------------------------
//! MP4 normal só fica legível quando o `moov` é escrito no FIM: falta de energia às 3h de
//! live transforma o arquivo inteiro em lixo. Com `frag_keyframe+empty_moov` cada fragmento
//! já é reproduzível. O preço é a navegação (sem índice global, pular pro minuto 187 é
//! ruim), e quem paga é o REMUX DE FINALIZAÇÃO: `-c copy +faststart` depois da live, que
//! devolve o índice sem re-encode. Melhor dos dois mundos.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

use crate::session;
use crate::telemetry::AppError;
use crate::AppState;

/// `#[track_caller]` OBRIGATÓRIO: sem ele o `Location::caller()` lá dentro resolve
/// para ESTE wrapper, e todo erro de gravação chega com
/// `top_app_frame = recorder.rs:<linha daqui>` — foi o que aconteceu com o primeiro
/// `recording_gave_up` reportado por um beta, que apontou pro helper em vez do laço.
#[track_caller]
fn capture_recording_error(app: &AppHandle, code: &str, retryable: bool) {
    let state = app.state::<AppState>();
    let operation_id = state.engine.lock().unwrap().operation_id.clone();
    state.telemetry.capture_error(
        AppError::new(code, "recording", retryable, None),
        operation_id.as_deref(),
        true,
        "warning",
    );
}

/// Chave do gravador no mapa de filhos do motor. Estar lá é o que faz TODOS os caminhos de
/// encerramento que já existem (`kill_engine`, `taskkill /T /F`) levarem o gravador junto.
pub const RECORDER_KEY: &str = "__recorder";

/// Sem notícia do `-progress` por este tempo = FFmpeg morto (mesmo sem `Terminated`).
const STALL_MS: u128 = 10_000;
/// Reancoragem periódica: sem ela a deriva de relógio se acumula até o fim da live.
const SYNC_EVERY_MS: u64 = 5 * 60_000;
/// Piso de disco. Parar ANTES de zerar não é preciosismo: disco em zero trava a escrita do
/// NDJSON da sessão, do config.json e do que o Windows estiver fazendo — reagir depois é tarde.
const DISK_FLOOR: u64 = 2 * 1024 * 1024 * 1024;
/// Espaço mínimo pra sequer começar a gravar.
pub const DISK_START_FLOOR: u64 = 5 * 1024 * 1024 * 1024;
const DISK_CHECK_EVERY: Duration = Duration::from_secs(30);
/// Teto de retomadas. Sem ele, um erro permanente vira laço infinito de spawn.
const MAX_RESTARTS: u32 = 5;
/// Depois disto sem `-progress`, a âncora é chutada (marcada como estimada) pra não perder
/// o replay inteiro por causa de um formato que não reportou.
const ANCHOR_TIMEOUT_MS: u128 = 15_000;

// ---------------------------------------------------------------------------
// Núcleo puro (testado): nomes, argumentos e parsing do -progress
// ---------------------------------------------------------------------------

/// `<dir>/<id>.mp4` no primeiro segmento, `<dir>/<id>.pN.mp4` nos seguintes.
///
/// O padrão de nome é a TRAVA da poda (`session::parse_video_name`): só o que casa com ele
/// é candidato a exclusão, porque a pasta pode ser a mesma onde o OBS grava.
pub fn video_path(dir: &Path, id: &str, seg: u32) -> PathBuf {
    if seg <= 1 {
        dir.join(format!("{id}.mp4"))
    } else {
        dir.join(format!("{id}.p{seg}.mp4"))
    }
}

/// Cópia de bitstream do programa pro disco. Zero re-encode: o feed JÁ está codificado
/// pra ir às plataformas, então gravar custa I/O e nada de CPU.
pub fn record_args(source: &str, out: &Path) -> Vec<String> {
    vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "warning".into(),
        "-i".into(),
        source.into(),
        "-c".into(),
        "copy".into(),
        // fMP4: cada fragmento é reproduzível sozinho (ver cabeçalho do módulo).
        "-movflags".into(),
        "+frag_keyframe+empty_moov+default_base_is_moof".into(),
        "-f".into(),
        "mp4".into(),
        "-y".into(),
        out.to_string_lossy().to_string(),
        // O `-progress` é o batimento cardíaco: é dele que saem a âncora, as reancoragens
        // e a detecção de morte silenciosa.
        "-progress".into(),
        "pipe:1".into(),
        "-nostats".into(),
    ]
}

/// Remux de finalização: fMP4 → MP4 indexado, sem re-encode.
pub fn remux_args(src: &Path, dst: &Path) -> Vec<String> {
    vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        "-i".into(),
        src.to_string_lossy().to_string(),
        "-c".into(),
        "copy".into(),
        "-movflags".into(),
        "+faststart".into(),
        "-y".into(),
        dst.to_string_lossy().to_string(),
    ]
}

/// 5 segundos de barras de teste — o "testar gravação" do §9.2.
///
/// Fonte SINTÉTICA de propósito: assim o teste funciona ANTES da primeira live e valida o
/// que realmente costuma quebrar (pasta, escrita, remux, escopo do asset, CSP, player).
/// A fonte RTMP é a única parte não coberta — e é a que a própria live valida.
pub fn test_args(out: &Path) -> Vec<String> {
    vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        "-f".into(),
        "lavfi".into(),
        "-i".into(),
        "testsrc2=size=640x360:rate=30".into(),
        "-f".into(),
        "lavfi".into(),
        "-i".into(),
        "sine=frequency=440:sample_rate=48000".into(),
        "-t".into(),
        "5".into(),
        "-c:v".into(),
        "libx264".into(),
        "-preset".into(),
        "ultrafast".into(),
        "-pix_fmt".into(),
        "yuv420p".into(),
        "-c:a".into(),
        "aac".into(),
        "-movflags".into(),
        "+faststart".into(),
        "-y".into(),
        out.to_string_lossy().to_string(),
    ]
}

/// Extrai os ms já gravados de uma linha do `-progress`.
///
/// Lê `out_time=HH:MM:SS.uuuuuu` e NÃO `out_time_ms`: apesar do nome, o FFmpeg emite
/// microssegundos nesse campo há anos. Confiar no nome dele daria um replay 1000× fora
/// de escala — e um erro que só apareceria em produção.
pub fn parse_out_time_ms(line: &str) -> Option<u64> {
    let raw = line.trim().strip_prefix("out_time=")?;
    if raw.starts_with('N') {
        return None; // "N/A" antes do primeiro pacote
    }
    let mut parts = raw.split(':');
    let h: u64 = parts.next()?.trim().parse().ok()?;
    let m: u64 = parts.next()?.trim().parse().ok()?;
    let s: f64 = parts.next()?.trim().parse().ok()?;
    Some((h * 3600 + m * 60) * 1000 + (s * 1000.0) as u64)
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

// ---------------------------------------------------------------------------
// Disco
// ---------------------------------------------------------------------------

/// Bytes livres no volume da pasta (não no disco do sistema).
///
/// A checagem tem que olhar o volume ESCOLHIDO: o streamer aponta pro HD de gravação
/// justamente pra não encher o SSD do sistema, e medir o lugar errado tornaria a proteção
/// decorativa.
#[cfg(windows)]
pub fn free_bytes(dir: &Path) -> Option<u64> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;

    let wide: Vec<u16> = dir
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let mut free: u64 = 0;
    unsafe {
        GetDiskFreeSpaceExW(PCWSTR(wide.as_ptr()), Some(&mut free), None, None).ok()?;
    }
    Some(free)
}

#[cfg(not(windows))]
pub fn free_bytes(_dir: &Path) -> Option<u64> {
    None
}

/// O que a validação da pasta encontrou. Só as duas primeiras impedem gravar — o resto
/// avisa e deixa seguir, porque a máquina é do streamer.
#[derive(serde::Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DirCheck {
    pub ok: bool,
    /// Chave ASCII de protocolo (o front traduz): "missing" | "notDir" | "readonly".
    pub error: Option<String>,
    pub free_bytes: Option<u64>,
    pub low_space: bool,
    pub removable_or_network: bool,
    pub long_path: bool,
}

/// Valida na hora de ESCOLHER, não na hora de gravar: descobrir que a pasta não presta
/// quando o streamer aperta BORA é tarde demais.
pub fn check_dir(dir: &Path) -> DirCheck {
    let mut out = DirCheck::default();
    if dir.as_os_str().is_empty() || !dir.exists() {
        out.error = Some("missing".into());
        return out;
    }
    if !dir.is_dir() {
        out.error = Some("notDir".into());
        return out;
    }
    // Escrever de verdade e apagar. No Windows a permissão MENTE: atributo somente-leitura,
    // ACL negando, pasta sincronizada por serviço de nuvem — só o teste real responde.
    let probe = dir.join(".corneta-write-test");
    match std::fs::write(&probe, b"corneta") {
        Ok(()) => {
            let _ = std::fs::remove_file(&probe);
        }
        Err(_) => {
            out.error = Some("readonly".into());
            return out;
        }
    }
    out.free_bytes = free_bytes(dir);
    out.low_space = out.free_bytes.is_some_and(|f| f < DISK_START_FLOOR);
    let s = dir.to_string_lossy();
    out.removable_or_network = s.starts_with("\\\\") || s.starts_with("//");
    out.long_path = s.chars().count() > 200;
    out.ok = true;
    out
}

/// Pasta efetiva das gravações: a configurada, ou a de sessões quando vazia.
///
/// O padrão é VAZIO (e não um caminho concreto) porque o config viaja entre perfis e é lido
/// pelos dois lados — um caminho gravado amarraria a configuração a uma máquina.
pub fn resolve_dir(app: &AppHandle, configured: &str) -> Option<PathBuf> {
    let trimmed = configured.trim();
    if !trimmed.is_empty() {
        let p = PathBuf::from(trimmed);
        if p.is_dir() {
            return Some(p);
        }
        // Pasta configurada sumiu (renomeada, unidade arrancada): NÃO recria no escuro e
        // NÃO cai calado pra outro lugar — quem chama avisa e segue sem gravar.
        log::warn!("gravação: pasta configurada indisponível: {}", p.display());
        return None;
    }
    session::sessions_dir(app)
}

// ---------------------------------------------------------------------------
// O laço de gravação
// ---------------------------------------------------------------------------

/// Motivo do fim de um segmento. ASCII de protocolo — o front traduz.
const REASON_STOP: &str = "stopped";
const REASON_DISK: &str = "disk";
const REASON_DIED: &str = "died";
const REASON_GIVEUP: &str = "giveup";

fn toast(app: &AppHandle, kind: &str, detail: Option<String>) {
    let _ = app.emit(
        "recorder://status",
        serde_json::json!({ "kind": kind, "detail": detail }),
    );
}

/// Sobe o gravador e supervisiona até `running` cair. Um segmento por vida do FFmpeg.
///
/// Roda numa task própria: nada aqui bloqueia o motor, e um erro aqui não tem caminho
/// nenhum de volta pro estado da transmissão.
pub async fn run(
    app: AppHandle,
    source: String,
    dir: PathBuf,
    session_path: PathBuf,
    id: String,
    running: Arc<AtomicBool>,
) {
    let mut seg: u32 = 1;
    let mut restarts: u32 = 0;

    while running.load(Ordering::Relaxed) {
        if let Some(free) = free_bytes(&dir) {
            if free < DISK_START_FLOOR {
                log::warn!("gravação: espaço insuficiente ({free} bytes) — não vou começar");
                capture_recording_error(&app, "recording_disk_low", true);
                session::record_rec_end(&session_path, seg, REASON_DISK);
                toast(&app, "diskFull", None);
                return;
            }
        }
        let out = video_path(&dir, &id, seg);
        let spawned = app
            .shell()
            .sidecar("ffmpeg")
            .and_then(|c| c.args(record_args(&source, &out)).spawn());
        let (mut rx, child) = match spawned {
            Ok(v) => v,
            Err(e) => {
                log::error!("gravação: sidecar ffmpeg indisponível: {e}");
                capture_recording_error(&app, "recording_ffmpeg_spawn_failed", true);
                session::record_rec_end(&session_path, seg, REASON_GIVEUP);
                toast(&app, "failed", Some(e.to_string()));
                return;
            }
        };
        {
            let st = app.state::<AppState>();
            st.engine
                .lock()
                .unwrap()
                .ffmpegs
                .insert(RECORDER_KEY.into(), child);
        }
        // Mesma corrida do supervisor de destino: o stop pode ter drenado o mapa entre o
        // spawn e o insert. Como o stop grava running=false sob o mesmo lock antes de
        // drenar, aqui já vemos a flag — mata o recém-inserido e sai.
        if !running.load(Ordering::Relaxed) {
            take_and_kill(&app);
            break;
        }

        let spawn_at = Instant::now();
        let mut anchored = false;
        let mut last_out: u64 = 0;
        let mut last_advance = Instant::now();
        let mut last_sync_out: u64 = 0;
        let mut last_disk = Instant::now();
        let mut reason = REASON_DIED;

        loop {
            let ev = tokio::time::timeout(Duration::from_secs(2), rx.recv()).await;
            match ev {
                Ok(Some(CommandEvent::Stdout(b))) => {
                    let text = String::from_utf8_lossy(&b);
                    for line in text.lines() {
                        let Some(out_ms) = parse_out_time_ms(line) else {
                            continue;
                        };
                        if out_ms > last_out {
                            last_out = out_ms;
                            last_advance = Instant::now();
                        }
                        if !anchored {
                            // A âncora não é "quando spawnei": é `agora - out_time`, que
                            // é o instante do PRIMEIRO pacote gravado. Isso já desconta o
                            // atraso até o keyframe, que com `-c copy` chega a um GOP.
                            session::record_recording(
                                &session_path,
                                seg,
                                now_ms().saturating_sub(out_ms),
                                &out.to_string_lossy(),
                                "h264",
                                false,
                            );
                            anchored = true;
                            restarts = 0; // gravou de verdade: o orçamento de retomadas volta
                        }
                        if out_ms.saturating_sub(last_sync_out) >= SYNC_EVERY_MS {
                            last_sync_out = out_ms;
                            session::record_rec_sync(&session_path, seg, out_ms);
                        }
                    }
                }
                Ok(Some(CommandEvent::Stderr(b))) => {
                    let raw = String::from_utf8_lossy(&b);
                    let t = raw.trim();
                    if !t.is_empty() {
                        log::warn!("gravação/ffmpeg: {t}");
                    }
                }
                Ok(Some(CommandEvent::Terminated(_))) | Ok(None) => break,
                Ok(Some(_)) => {}
                Err(_) => {
                    // Sem evento nesta janela: hora de olhar o relógio e o disco.
                    if !running.load(Ordering::Relaxed) {
                        reason = REASON_STOP;
                        break;
                    }
                    // Morte silenciosa: o processo existe mas parou de produzir. Sem este
                    // watchdog, a UI diria "gravando" a live inteira e no fim haveria 4
                    // minutos de vídeo.
                    if anchored && last_advance.elapsed().as_millis() > STALL_MS {
                        log::warn!("gravação: sem progresso há {STALL_MS}ms — considerando morta");
                        break;
                    }
                    // Âncora estimada: o formato não reportou a tempo, mas o arquivo cresce.
                    // Melhor um replay com aviso de sincronia do que replay nenhum.
                    if !anchored
                        && spawn_at.elapsed().as_millis() > ANCHOR_TIMEOUT_MS
                        && std::fs::metadata(&out).map(|m| m.len()).unwrap_or(0) > 0
                    {
                        session::record_recording(
                            &session_path,
                            seg,
                            now_ms().saturating_sub(spawn_at.elapsed().as_millis() as u64),
                            &out.to_string_lossy(),
                            "h264",
                            true,
                        );
                        anchored = true;
                        toast(&app, "estimatedAnchor", None);
                    }
                    if last_disk.elapsed() >= DISK_CHECK_EVERY {
                        last_disk = Instant::now();
                        if free_bytes(&dir).is_some_and(|f| f < DISK_FLOOR) {
                            log::warn!("gravação: disco no piso — encerrando limpo");
                            reason = REASON_DISK;
                            break;
                        }
                    }
                }
            }
        }

        take_and_kill(&app);
        let stopping = !running.load(Ordering::Relaxed);
        let final_reason = if stopping { REASON_STOP } else { reason };
        session::record_rec_end(&session_path, seg, final_reason);
        // Finaliza ESTE segmento agora, não no fim da live: se o app morrer daqui a duas
        // horas, o que já foi gravado continua navegável.
        finalize(&app, &session_path, seg, &out).await;

        if stopping || final_reason == REASON_DISK {
            if final_reason == REASON_DISK {
                toast(&app, "diskFull", None);
            }
            break;
        }
        restarts += 1;
        if restarts > MAX_RESTARTS {
            log::error!("gravação: {MAX_RESTARTS} retomadas sem sucesso — desistindo");
            capture_recording_error(&app, "recording_gave_up", false);
            session::record_rec_end(&session_path, seg, REASON_GIVEUP);
            toast(&app, "gaveUp", None);
            break;
        }
        toast(&app, "resumed", None);
        // Backoff: retomada imediata em erro permanente vira laço de spawn.
        tokio::time::sleep(Duration::from_millis(500 * restarts as u64)).await;
        seg += 1;
    }
}

/// Tira o gravador do mapa de filhos e mata a árvore dele.
fn take_and_kill(app: &AppHandle) {
    let child = {
        let st = app.state::<AppState>();
        let mut eng = st.engine.lock().unwrap();
        eng.ffmpegs.remove(RECORDER_KEY)
    };
    if let Some(c) = child {
        crate::commands::kill_child_tree(c);
    }
}

/// Remux de finalização (§9.5). Falhar aqui não perde nada: o fMP4 continua tocando,
/// só navega pior.
async fn finalize(app: &AppHandle, session_path: &Path, seg: u32, src: &Path) {
    if std::fs::metadata(src).map(|m| m.len()).unwrap_or(0) == 0 {
        let _ = std::fs::remove_file(src);
        return;
    }
    let tmp = src.with_extension("fin.mp4");
    let Ok(cmd) = app.shell().sidecar("ffmpeg") else {
        return;
    };
    match cmd.args(remux_args(src, &tmp)).output().await {
        Ok(o) if o.status.success() => {
            if std::fs::rename(&tmp, src).is_ok() {
                session::record_rec_finalized(session_path, seg, &src.to_string_lossy());
            } else {
                let _ = std::fs::remove_file(&tmp);
            }
        }
        Ok(o) => {
            log::warn!(
                "gravação: remux falhou ({}) — o fMP4 segue tocável",
                String::from_utf8_lossy(&o.stderr).trim()
            );
            let _ = std::fs::remove_file(&tmp);
        }
        Err(e) => {
            log::warn!("gravação: remux não rodou: {e}");
            let _ = std::fs::remove_file(&tmp);
        }
    }
}

/// Grava 5s de barras e devolve o caminho — o teste do §9.2.
pub async fn test_record(app: &AppHandle, dir: &Path) -> Result<String, String> {
    let out = dir.join("corneta-teste.mp4");
    let cmd = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| e.to_string())?
        .args(test_args(&out));
    let res = cmd.output().await.map_err(|e| e.to_string())?;
    if !res.status.success() {
        return Err(String::from_utf8_lossy(&res.stderr).trim().to_string());
    }
    Ok(out.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn out_time_e_lido_em_milissegundos_de_verdade() {
        // O campo `out_time_ms` do FFmpeg vem em MICROssegundos apesar do nome; por isso
        // o parser lê `out_time=`. Se algum dia alguém "otimizar" pra ler o outro campo,
        // este teste é quem pega o fator 1000.
        assert_eq!(parse_out_time_ms("out_time=00:00:01.000000"), Some(1_000));
        assert_eq!(
            parse_out_time_ms("out_time=01:02:03.500000"),
            Some(3_723_500)
        );
        assert_eq!(parse_out_time_ms("out_time=00:00:00.000000"), Some(0));
    }

    #[test]
    fn linhas_que_nao_sao_progresso_sao_ignoradas() {
        assert_eq!(parse_out_time_ms("out_time_ms=1000000"), None);
        assert_eq!(parse_out_time_ms("out_time=N/A"), None);
        assert_eq!(parse_out_time_ms("frame=30"), None);
        assert_eq!(parse_out_time_ms("progress=continue"), None);
        assert_eq!(parse_out_time_ms(""), None);
        assert_eq!(parse_out_time_ms("out_time=lixo"), None);
    }

    #[test]
    fn nome_do_segmento_casa_com_a_trava_da_poda() {
        let d = Path::new("D:/Lives");
        assert!(video_path(d, "1721400000000", 1).ends_with("1721400000000.mp4"));
        assert!(video_path(d, "1721400000000", 3).ends_with("1721400000000.p3.mp4"));
        // O que o gravador escreve tem que ser exatamente o que a poda reconhece — senão
        // ou os arquivos ficam órfãos pra sempre, ou a poda não acha o que apagar.
        for seg in 1..4 {
            let p = video_path(d, "1721400000000", seg);
            let name = p.file_name().unwrap().to_str().unwrap();
            assert!(
                crate::session::parse_video_name(name).is_some(),
                "a poda não reconheceria {name}"
            );
        }
    }

    #[test]
    fn args_de_gravacao_sao_copia_pura_e_fragmentados() {
        let a = record_args("rtmp://x/live/obs_program", Path::new("D:/a.mp4"));
        let joined = a.join(" ");
        assert!(joined.contains("-c copy"), "gravar não pode re-encodar");
        assert!(
            joined.contains("frag_keyframe"),
            "precisa sobreviver a queda"
        );
        assert!(
            joined.contains("-progress pipe:1"),
            "sem isso não há âncora"
        );
        assert!(
            !joined.contains("faststart"),
            "faststart é do remux, não da gravação"
        );
    }

    #[test]
    fn remux_indexa_sem_reencodar() {
        let a = remux_args(Path::new("a.mp4"), Path::new("b.mp4")).join(" ");
        assert!(a.contains("-c copy"));
        assert!(a.contains("+faststart"));
    }

    #[test]
    fn teste_de_5s_nao_depende_de_fonte_ao_vivo() {
        // É o que faz o botão funcionar ANTES da primeira live.
        let a = test_args(Path::new("t.mp4")).join(" ");
        assert!(a.contains("lavfi"));
        assert!(a.contains("-t 5"));
        assert!(!a.contains("rtmp"));
    }
}
