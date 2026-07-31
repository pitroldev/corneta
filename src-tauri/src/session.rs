//! Gravação da sessão de transmissão em NDJSON (uma linha por amostra/evento)
//! para o relatório pós-live. Ver docs/RELATORIO-POS-LIVE.md.
use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::{BufRead, BufReader, BufWriter, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

use crate::config::AppConfig;
use crate::engine::EngineSnapshot;
use crate::i18n::Msg;

/// Quantas sessões manter no disco (as mais antigas são podadas).
const KEEP: usize = 50;
const MAX_SESSION_BYTES: u64 = 32 * 1024 * 1024;
/// Teto PRÓPRIO do arquivo de chat (~100 mil mensagens). Separado do teto das métricas de
/// propósito: uma live movimentada não pode gastar o orçamento do relatório com texto.
/// Ver docs/FEATURE-GRAVACAO-E-REPLAY.md §3.3.
const MAX_CHAT_BYTES: u64 = 16 * 1024 * 1024;
struct SessionWriter {
    writer: BufWriter<File>,
    pending_lines: u8,
}
static WRITERS: OnceLock<Mutex<HashMap<PathBuf, SessionWriter>>> = OnceLock::new();

fn writers() -> &'static Mutex<HashMap<PathBuf, SessionWriter>> {
    WRITERS.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn valid_session_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 20 && id.bytes().all(|b| b.is_ascii_digit())
}

fn session_path(app: &AppHandle, id: &str) -> Option<PathBuf> {
    if !valid_session_id(id) {
        return None;
    }
    Some(sessions_dir(app)?.join(format!("{id}.ndjson")))
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// `app_data_dir/sessions` (criada se não existir).
pub fn sessions_dir(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_data_dir().ok()?.join("sessions");
    fs::create_dir_all(&dir).ok()?;
    Some(dir)
}

fn append_line(path: &Path, value: &Value) {
    append_line_capped(path, value, MAX_SESSION_BYTES);
}

/// Escreve uma linha NDJSON respeitando um teto de bytes PRÓPRIO do arquivo.
///
/// O teto é por arquivo (não global) porque métricas e chat competem por espaço mas não pela
/// mesma cota: chat barulhento não pode custar o diagnóstico que o relatório já entrega hoje.
fn append_line_capped(path: &Path, value: &Value, cap: u64) {
    if std::fs::metadata(path).map(|m| m.len()).unwrap_or(0) >= cap {
        log::warn!(
            "{} atingiu o limite de {cap} bytes; linha descartada",
            path.display()
        );
        return;
    }
    let mut line = value.to_string();
    line.push('\n');
    if let Ok(mut map) = writers().lock() {
        if let Some(session) = map.get_mut(path) {
            let _ = session.writer.write_all(line.as_bytes());
            session.pending_lines += 1;
            if session.pending_lines >= 10 {
                let _ = session.writer.flush();
                session.pending_lines = 0;
            }
            return;
        }
    }
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = file.write_all(line.as_bytes());
    }
}

/// Fecha (drena) o writer bufferizado de um arquivo, se existir.
fn close_writer(path: &Path) {
    if let Ok(mut map) = writers().lock() {
        if let Some(mut session) = map.remove(path) {
            let _ = session.writer.flush();
        }
    }
}

/// Inicia uma sessão: poda antigas, cria o NDJSON e escreve o cabeçalho.
pub fn start_session(app: &AppHandle, config: &AppConfig) -> Option<PathBuf> {
    let dir = sessions_dir(app)?;
    prune(&dir, KEEP);
    let id = now_ms();
    let path = dir.join(format!("{id}.ndjson"));
    let platforms: Vec<Value> = config
        .targets
        .iter()
        .filter(|t| t.enabled)
        .map(|t| json!({ "id": t.id, "name": t.name, "platformId": t.platform_id }))
        .collect();
    // v2: amostra ganhou `chatBy` (chat por canal) e o alerta ganhou `source`.
    // v3: gravação de vídeo (`recording`/`recSync`/`recEnd`), chat em arquivo irmão,
    //     `clockJump` e `offset`. Leitor antigo ignora `kind` que não conhece, e o
    //     parser novo lê v2 sem nada faltando — a compatibilidade vale nos dois sentidos.
    let meta = json!({
        "kind": "meta",
        "schemaVersion": 3,
        "id": id.to_string(),
        "startedAt": id,
        "mode": config.mode,
        "platforms": platforms,
    });
    if let Ok(file) = File::create(&path) {
        let mut writer = BufWriter::new(file);
        let _ = writeln!(writer, "{meta}");
        let _ = writer.flush();
        if let Ok(mut map) = writers().lock() {
            map.insert(
                path.clone(),
                SessionWriter {
                    writer,
                    pending_lines: 0,
                },
            );
        }
    }
    // Zera a âncora do relógio. Sem isto, a primeira amostra desta sessão compararia com
    // a última da sessão ANTERIOR — e no Windows o `Instant` (QPC) não anda enquanto a
    // máquina dorme. Um notebook fechado entre duas lives faria a diferença entre os dois
    // relógios dar horas, e a sessão nova nasceria com um "salto de relógio" inventado.
    if let Some(cell) = CLOCK.get() {
        if let Ok(mut last) = cell.lock() {
            *last = None;
        }
    }
    log::info!("relatório: gravando sessão em {}", path.display());
    Some(path)
}

/// Grava uma amostra (estado dos destinos + CPU/GPU + mensagens de chat na janela).
///
/// `chat_by_channel` vem de `chat::drain_msg_counts` (`plataforma:fonte` → nº de mensagens).
/// O campo `chat` continua sendo o TOTAL — relatórios gravados antes da segregação por
/// canal só têm ele, e a análise precisa seguir lendo os dois formatos.
/// Chat sendo gravado nesta sessão? Lido a cada mensagem, então é uma flag e não uma
/// leitura de config — abrir o `config.json` a cada linha de chat seria absurdo.
static RECORD_CHAT: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

pub fn set_chat_recording(on: bool) {
    RECORD_CHAT.store(on, std::sync::atomic::Ordering::Relaxed);
}

pub fn chat_recording() -> bool {
    RECORD_CHAT.load(std::sync::atomic::Ordering::Relaxed)
}

/// Âncora monotônica pra detectar salto do relógio de parede.
static CLOCK: OnceLock<Mutex<Option<(std::time::Instant, u64)>>> = OnceLock::new();

/// Detecta que o relógio do sistema pulou (NTP, horário de verão, ajuste manual).
///
/// Conserta mais do que a gravação: `now_ms()` é `SystemTime` puro, então uma correção de
/// NTP no meio da live JÁ hoje entorta o eixo do relatório. Comparar com um `Instant`
/// (monotônico, imune a acerto de relógio) é o único jeito de perceber.
fn detect_clock_jump(path: &Path) {
    // Tolerância folgada: o amostrador roda a cada ~2s e pode atrasar sob carga. Só um
    // desvio grande entre os dois relógios é salto de verdade.
    const TOLERANCE_MS: i64 = 2_000;
    let cell = CLOCK.get_or_init(|| Mutex::new(None));
    let Ok(mut last) = cell.lock() else { return };
    let now_wall = now_ms();
    let now_mono = std::time::Instant::now();
    if let Some((prev_mono, prev_wall)) = *last {
        let mono_delta = now_mono.duration_since(prev_mono).as_millis() as i64;
        let wall_delta = now_wall as i64 - prev_wall as i64;
        let drift = wall_delta - mono_delta;
        if drift.abs() > TOLERANCE_MS {
            log::warn!("relógio do sistema saltou {drift}ms — registrando na sessão");
            record_clock_jump(path, drift);
        }
    }
    *last = Some((now_mono, now_wall));
}

pub fn record_sample(path: &Path, snap: &EngineSnapshot, chat_by_channel: &HashMap<String, u64>) {
    detect_clock_jump(path);
    let targets: Vec<Value> = snap
        .targets
        .values()
        .map(|t| {
            json!({
                "id": t.target_id,
                "name": t.name,
                "state": t.state,
                "bitrate": t.bitrate_kbps,
                "fps": t.fps,
                "dropped": t.dropped_frames,
            })
        })
        .collect();
    let mut sample = json!({
        "kind": "sample",
        "t": now_ms(),
        "cpu": snap.cpu,
        "gpu": snap.gpu,
        "obs": snap.obs,
        "chat": chat_by_channel.values().sum::<u64>(),
        "targets": targets,
    });
    // `chatBy` só entra quando alguém falou na janela: a maioria das amostras de uma
    // live de 3h não tem mensagem nenhuma, e um `{}` por linha engordaria o NDJSON
    // sem dizer nada além do que o `chat: 0` já diz.
    if !chat_by_channel.is_empty() {
        sample["chatBy"] = json!(chat_by_channel);
    }
    append_line(path, &sample);
}

/// Grava a contagem de viewers (total + por fonte) — pra curva de retenção do relatório.
pub fn record_viewers(path: &Path, total: u64, items: &[Value]) {
    append_line(
        path,
        &json!({ "kind": "viewers", "t": now_ms(), "total": total, "items": items }),
    );
}

/// Grava o total de seguidores de cada canal — o relatório tira daí o ganho da live
/// (último menos primeiro). É o total ABSOLUTO de propósito: guardar o delta aqui
/// deixaria o número refém do instante em que a amostragem começou.
///
/// Sem nenhum canal que exponha o contador, não escreve linha nenhuma.
pub fn record_followers(path: &Path, items: &[Value]) {
    if items.is_empty() {
        return;
    }
    append_line(
        path,
        &json!({ "kind": "followers", "t": now_ms(), "items": items }),
    );
}

/// Grava um alerta (sub/raid/bits…) na sessão — pra timeline e momentos de destaque.
///
/// `source` é o rótulo do canal (mesmo namespace do `viewers`/`chatBy`), o que permite
/// somar os alertas por canal. Em alerta de agregador (Streamlabs/StreamElements) o
/// `platform` é o nome do agregador, não uma plataforma de chat — a análise trata esses
/// como não-atribuíveis em vez de chutar um canal.
pub fn record_alert(
    path: &Path,
    platform: &str,
    source: &str,
    kind: &str,
    user: &str,
    amount: Option<f64>,
) {
    append_line(
        path,
        &json!({
            "kind": "alert", "t": now_ms(),
            "platform": platform, "source": source,
            "alertKind": kind, "user": user, "amount": amount,
        }),
    );
}

/// Fecha a sessão (marca o fim).
pub fn end_session(path: &Path) {
    append_line(path, &json!({ "kind": "end", "endedAt": now_ms() }));
    close_writer(path);
    // O chat mora em arquivo irmão e tem writer próprio — sem este flush, as últimas
    // mensagens da live ficariam no buffer e sumiriam no fechamento do processo.
    close_writer(&chat_path(path));
}

// ---------------------------------------------------------------------------
// Gravação de vídeo: âncoras de sincronia (ver docs/FEATURE-GRAVACAO-E-REPLAY.md §3.4)
// ---------------------------------------------------------------------------

/// Âncora de um segmento de vídeo: o epoch que corresponde ao segundo 0 DAQUELE arquivo.
///
/// `estimated` marca a âncora chutada no spawn (quando o `-progress` não deu as caras a
/// tempo). O player mostra um aviso: com `-c copy` o arquivo só começa no keyframe
/// seguinte, então o chute erra até o tamanho do GOP.
pub fn record_recording(
    path: &Path,
    seg: u32,
    started_at: u64,
    file: &str,
    codec: &str,
    estimated: bool,
) {
    append_line(
        path,
        &json!({
            "kind": "recording", "seg": seg, "t": started_at,
            "path": file, "codec": codec, "estimated": estimated,
        }),
    );
}

/// Reancoragem periódica: mapeia relógio de parede → ms já gravados.
///
/// Sem isto, uma live de 4h termina com o vídeo dessincronizado do relatório, porque o
/// relógio do RTMP e o de parede não andam idênticos — e uma âncora só no início
/// extrapola o erro justamente até o fim.
pub fn record_rec_sync(path: &Path, seg: u32, out_ms: u64) {
    append_line(
        path,
        &json!({ "kind": "recSync", "seg": seg, "t": now_ms(), "out": out_ms }),
    );
}

/// Fim de um segmento de vídeo. `reason` é ASCII de protocolo (o front traduz).
pub fn record_rec_end(path: &Path, seg: u32, reason: &str) {
    append_line(
        path,
        &json!({ "kind": "recEnd", "seg": seg, "t": now_ms(), "reason": reason }),
    );
}

/// O remux de finalização terminou: o arquivo virou MP4 indexado e já navega.
pub fn record_rec_finalized(path: &Path, seg: u32, file: &str) {
    append_line(
        path,
        &json!({ "kind": "recFinalized", "seg": seg, "path": file }),
    );
}

/// Salto do relógio do sistema (NTP, horário de verão, ajuste manual).
///
/// Isto conserta mais do que a gravação: `now_ms()` é `SystemTime` puro, então uma correção
/// de NTP no meio da live JÁ entorta o eixo do relatório de hoje. Registrar o salto deixa o
/// front desfazer nos dois.
pub fn record_clock_jump(path: &Path, delta_ms: i64) {
    append_line(
        path,
        &json!({ "kind": "clockJump", "t": now_ms(), "delta": delta_ms }),
    );
}

/// Ajuste manual de sincronia do streamer (ms). Última linha vence — é o histórico
/// append-only fazendo as vezes de campo editável.
pub fn record_offset(path: &Path, offset_ms: i64) {
    append_line(path, &json!({ "kind": "offset", "ms": offset_ms }));
}

// ---------------------------------------------------------------------------
// Gravação de chat (arquivo irmão)
// ---------------------------------------------------------------------------

/// `<id>.ndjson` → `<id>.chat.ndjson`. Arquivo separado para que apagar o chat (LGPD)
/// não leve o relatório junto, e para que o teto de um não coma o do outro.
pub fn chat_path(session: &Path) -> PathBuf {
    let stem = session
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("sessao");
    session.with_file_name(format!("{stem}.chat.ndjson"))
}

/// Uma mensagem. Campos curtos de propósito: o nome longo repetido 40 mil vezes é peso puro.
///
/// `t` epoch · `p` plataforma · `s` fonte (mesmo namespace do `chatBy`) · `a` autor ·
/// `c` cor · `m` texto · `i` id nativo (pra casar deleção).
#[allow(clippy::too_many_arguments)]
pub fn record_chat_msg(
    session: &Path,
    t: u64,
    platform: &str,
    source: &str,
    author: &str,
    color: Option<&str>,
    text: &str,
    native_id: Option<&str>,
) {
    let mut v = json!({ "t": t, "p": platform, "s": source, "a": author, "m": text });
    if let Some(c) = color {
        v["c"] = json!(c);
    }
    if let Some(id) = native_id {
        v["i"] = json!(id);
    }
    append_line_capped(&chat_path(session), &v, MAX_CHAT_BYTES);
}

/// Buraco no chat (caiu e voltou). O replay MOSTRA o buraco em vez de fingir continuidade —
/// silêncio de verdade e silêncio por desconexão são coisas diferentes pra quem revisa.
pub fn record_chat_gap(session: &Path, from: u64) {
    append_line_capped(
        &chat_path(session),
        &json!({ "t": now_ms(), "gap": from }),
        MAX_CHAT_BYTES,
    );
}

/// Mensagem removida na plataforma depois de dita (moderação).
///
/// O replay oculta por padrão: se alguém foi banido por assédio e a mensagem saiu do ar, o
/// replay da Corneta não deveria ser o único lugar do mundo onde ela sobrevive pra sempre.
pub fn record_chat_delete(session: &Path, native_id: &str) {
    append_line_capped(
        &chat_path(session),
        &json!({ "t": now_ms(), "del": native_id }),
        MAX_CHAT_BYTES,
    );
}

/// Fecha sessões deixadas sem evento `end` por queda de energia/processo. Executado uma vez no
/// boot, antes que uma nova sessão possa ser iniciada.
pub fn recover_incomplete_sessions(app: &AppHandle) {
    let Some(dir) = sessions_dir(app) else { return };
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for path in entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.extension().and_then(|ext| ext.to_str()) == Some("ndjson"))
    {
        let Ok(meta) = fs::metadata(&path) else {
            continue;
        };
        if meta.len() == 0 || meta.len() > MAX_SESSION_BYTES {
            continue;
        }
        // O estado da sessão está na última linha. Ler só a cauda evita carregar até 32 MiB
        // para cada uma das 50 sessões durante o boot.
        const TAIL_BYTES: u64 = 64 * 1024;
        let Ok(mut file) = File::open(&path) else {
            continue;
        };
        let start = meta.len().saturating_sub(TAIL_BYTES);
        if file.seek(SeekFrom::Start(start)).is_err() {
            continue;
        }
        let mut tail = Vec::with_capacity((meta.len() - start) as usize);
        if file.read_to_end(&mut tail).is_err() {
            continue;
        }
        let raw = String::from_utf8_lossy(&tail);
        let ended = raw
            .lines()
            .rev()
            .find(|line| !line.trim().is_empty())
            .and_then(|line| serde_json::from_str::<Value>(line).ok())
            .and_then(|value| value.get("kind").and_then(Value::as_str).map(str::to_owned))
            .as_deref()
            == Some("end");
        if !ended {
            // A sessão morreu sem `end` (queda de energia, crash). Se ela estava gravando,
            // o segmento aberto ficou truncado — marcar é o que faz o player mostrar
            // "gravação interrompida" em vez de fingir que o arquivo está inteiro.
            let recording = raw
                .lines()
                .rev()
                .filter_map(|line| serde_json::from_str::<Value>(line).ok())
                .find_map(|v| match v.get("kind").and_then(Value::as_str) {
                    Some("recording") => Some(true),
                    Some("recEnd") => Some(false),
                    _ => None,
                })
                .unwrap_or(false);
            if recording {
                append_line(
                    &path,
                    &json!({ "kind": "recEnd", "t": now_ms(), "reason": "truncated" }),
                );
            }
            append_line(
                &path,
                &json!({ "kind": "end", "endedAt": now_ms(), "recovered": true }),
            );
        }
    }
}

/// Crava um marcador ("momento") na sessão — aparece na linha do tempo do relatório.
pub fn record_marker(path: &Path, label: &str) {
    record_marker_at(path, now_ms(), label);
}

/// Marcador num instante ARBITRÁRIO — o "marcar este momento" feito durante o replay,
/// depois da live. O `t` é do momento assistido, não do clique.
pub fn record_marker_at(path: &Path, t: u64, label: &str) {
    append_line(path, &json!({ "kind": "marker", "t": t, "label": label }));
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionMeta {
    pub id: String,
    pub started_at: u64,
    pub ended_at: Option<u64>,
    pub duration_sec: u64,
    pub mode: String,
    pub platforms: Value,
    /// Existe vídeo gravado desta sessão? A lista mostra o selo e o detalhe abre o replay.
    /// Vem de existência de ARQUIVO, não do NDJSON: quem apaga o MP4 na mão some com a
    /// aba de replay em vez de tomar um erro vermelho.
    pub has_video: bool,
    pub has_chat: bool,
}

/// Lista as sessões gravadas (mais recente primeiro).
pub fn list_sessions(app: &AppHandle, video_dir: Option<&Path>) -> Vec<SessionMeta> {
    let Some(dir) = sessions_dir(app) else {
        return vec![];
    };
    let Ok(entries) = fs::read_dir(&dir) else {
        return vec![];
    };
    // UMA varredura das pastas de vídeo pra toda a lista: um `read_dir` por sessão faria
    // 50 varreduras de uma pasta que pode estar num HD externo dormindo.
    let recorded: Vec<String> = video_dirs(app, video_dir)
        .iter()
        .flat_map(|d| video_files(d))
        .filter_map(|(p, len)| if len > 0 { video_id_of(&p) } else { None })
        .collect();
    let mut out: Vec<SessionMeta> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().and_then(|x| x.to_str()) == Some("ndjson"))
        .filter(|p| {
            p.file_stem()
                .and_then(|s| s.to_str())
                .is_some_and(valid_session_id)
        })
        .filter_map(|p| {
            let mut m = read_meta(&p)?;
            m.has_video = recorded.iter().any(|id| id == &m.id);
            m.has_chat = fs::metadata(chat_path(&p)).map(|x| x.len() > 0).unwrap_or(false);
            Some(m)
        })
        .collect();
    out.sort_by_key(|item| std::cmp::Reverse(item.started_at));
    out
}

/// Lê o cabeçalho (primeira linha) e estima fim/duração pelo mtime do arquivo.
fn read_meta(path: &Path) -> Option<SessionMeta> {
    let f = File::open(path).ok()?;
    let mut first = String::new();
    BufReader::new(f).read_line(&mut first).ok()?;
    let v: Value = serde_json::from_str(first.trim()).ok()?;
    if v.get("kind")?.as_str()? != "meta" {
        return None;
    }
    let started_at = v.get("startedAt")?.as_u64()?;
    let ended_at = fs::metadata(path)
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64);
    let duration_sec = ended_at
        .map(|e| e.saturating_sub(started_at) / 1000)
        .unwrap_or(0);
    Some(SessionMeta {
        id: v.get("id")?.as_str()?.to_string(),
        started_at,
        ended_at,
        duration_sec,
        mode: v
            .get("mode")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string(),
        platforms: v.get("platforms").cloned().unwrap_or_else(|| json!([])),
        has_video: false, // preenchido por `list_sessions` (uma varredura pra lista toda)
        has_chat: false,
    })
}

/// Conteúdo NDJSON cru de uma sessão (o frontend parseia e analisa).
pub fn read_session(app: &AppHandle, id: &str) -> Option<String> {
    let path = session_path(app, id)?;
    if fs::metadata(&path).ok()?.len() > MAX_SESSION_BYTES {
        log::warn!("sessão recusada: arquivo excede {MAX_SESSION_BYTES} bytes");
        return None;
    }
    fs::read_to_string(path).ok()
}

/// Conteúdo do `<id>.chat.ndjson` (vazio se a sessão não gravou chat).
pub fn read_chat(app: &AppHandle, id: &str) -> Option<String> {
    let path = chat_path(&session_path(app, id)?);
    if fs::metadata(&path).ok()?.len() > MAX_CHAT_BYTES {
        return None;
    }
    fs::read_to_string(path).ok()
}

pub fn delete_session(app: &AppHandle, id: &str, video_dir: Option<&Path>) -> Result<(), String> {
    let path = session_path(app, id).ok_or_else(|| Msg::SessionInvalidId.now())?;
    let _ = fs::remove_file(chat_path(&path));
    delete_recordings(app, id, video_dir)?;
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(Msg::SessionDeleteFailed { e: &e.to_string() }.now()),
    }
}

/// Apaga só os vídeos de uma sessão, preservando relatório e chat. É o botão "apagar
/// gravações" — o MP4 é 99,9% do peso e quase sempre é ele que a pessoa quer de volta.
pub fn delete_recordings(
    app: &AppHandle,
    id: &str,
    video_dir: Option<&Path>,
) -> Result<(), String> {
    if !valid_session_id(id) {
        return Err(Msg::SessionInvalidId.now());
    }
    for dir in video_dirs(app, video_dir) {
        for (path, _) in video_files(&dir) {
            if video_id_of(&path).as_deref() == Some(id) {
                let _ = fs::remove_file(path);
            }
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Retenção
// ---------------------------------------------------------------------------

/// Nome de arquivo de gravação → (id da sessão, nº do segmento).
///
/// Este reconhecedor é a TRAVA DE SEGURANÇA da poda (§7 do doc): a pasta de vídeo é
/// escolhida pelo streamer e pode ser a mesma onde o OBS grava, ou a raiz de um HD com
/// dez anos de coisa. Só o que casa `<13+ dígitos>.mp4` ou `<13+ dígitos>.pN.mp4` é
/// candidato — nada de varrer por extensão, nada de "apagar o mais antigo da pasta".
pub(crate) fn parse_video_name(name: &str) -> Option<(String, u32)> {
    let stem = name.strip_suffix(".mp4")?;
    match stem.split_once(".p") {
        Some((id, seg)) if valid_session_id(id) => Some((id.into(), seg.parse().ok()?)),
        Some(_) => None,
        None if valid_session_id(stem) => Some((stem.into(), 1)),
        None => None,
    }
}

fn video_id_of(path: &Path) -> Option<String> {
    let name = path.file_name()?.to_str()?;
    parse_video_name(name).map(|(id, _)| id)
}

/// Pastas onde pode haver gravação: a configurada e a de sessões (o padrão).
fn video_dirs(app: &AppHandle, configured: Option<&Path>) -> Vec<PathBuf> {
    let mut out: Vec<PathBuf> = Vec::new();
    if let Some(d) = configured {
        if !d.as_os_str().is_empty() {
            out.push(d.to_path_buf());
        }
    }
    if let Some(d) = sessions_dir(app) {
        if !out.contains(&d) {
            out.push(d);
        }
    }
    out
}

/// Arquivos de gravação reconhecidos numa pasta, com o tamanho de cada um.
fn video_files(dir: &Path) -> Vec<(PathBuf, u64)> {
    let Ok(entries) = fs::read_dir(dir) else {
        return vec![];
    };
    entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .and_then(parse_video_name)
                .is_some()
        })
        .filter_map(|p| {
            let len = fs::metadata(&p).ok()?.len();
            Some((p, len))
        })
        .collect()
}

/// Ids das sessões que ainda têm relatório no disco.
fn known_ids(app: &AppHandle) -> Vec<String> {
    let Some(dir) = sessions_dir(app) else {
        return vec![];
    };
    let Ok(entries) = fs::read_dir(dir) else {
        return vec![];
    };
    entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().and_then(|x| x.to_str()) == Some("ndjson"))
        .filter_map(|p| {
            p.file_stem()
                .and_then(|s| s.to_str())
                .filter(|s| valid_session_id(s))
                .map(str::to_owned)
        })
        .collect()
}

/// Poda de vídeo: por ESPAÇO, e nunca por contagem.
///
/// 50 sessões de métricas são alguns MB; 50 vídeos são centenas de GB. São eixos
/// diferentes e por isso são duas podas diferentes. Órfão (vídeo cuja sessão já foi podada)
/// sai primeiro, depois os mais antigos, até caber no teto.
///
/// Devolve quantos bytes ainda sobram acima do teto quando não deu pra fechar a conta só
/// com arquivos reconhecidos — quem chama avisa em vez de relaxar o critério.
pub fn prune_videos(app: &AppHandle, configured: Option<&Path>, keep_gb: u64) -> u64 {
    let budget = keep_gb.saturating_mul(1024 * 1024 * 1024);
    let ids = known_ids(app);
    let mut all: Vec<(PathBuf, u64, String)> = Vec::new();
    for dir in video_dirs(app, configured) {
        for (path, len) in video_files(&dir) {
            let Some(id) = video_id_of(&path) else { continue };
            all.push((path, len, id));
        }
    }
    // Órfãos primeiro: sessão podada = vídeo sem relatório que o referencie.
    let mut total: u64 = 0;
    let mut keepers: Vec<(PathBuf, u64, String)> = Vec::new();
    for (path, len, id) in all {
        if ids.iter().any(|k| k == &id) {
            total += len;
            keepers.push((path, len, id));
        } else {
            log::info!("gravação órfã removida: {}", path.display());
            let _ = fs::remove_file(path);
        }
    }
    if total <= budget {
        return 0;
    }
    // Mais antigo primeiro — o id é o timestamp de início, então ordenar por ele basta.
    keepers.sort_by(|a, b| a.2.cmp(&b.2));
    for (path, len, _) in keepers {
        if total <= budget {
            break;
        }
        log::info!("gravação podada por espaço: {}", path.display());
        if fs::remove_file(&path).is_ok() {
            total = total.saturating_sub(len);
        }
    }
    total.saturating_sub(budget)
}

/// Mantém só as `keep` sessões mais recentes (nome do arquivo = timestamp).
///
/// Leva os IRMÃOS junto: sem isso o `.chat.ndjson` e o `.mp4` de 11 GB ficariam órfãos pra
/// sempre, sem nada na interface explicando de onde vieram.
fn prune(dir: &Path, keep: usize) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    let mut files: Vec<PathBuf> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().and_then(|x| x.to_str()) == Some("ndjson"))
        // `<id>.chat.ndjson` também termina em .ndjson e NÃO é uma sessão: sem este
        // filtro ele contaria como sessão e a poda apagaria o dobro do que devia.
        .filter(|p| {
            p.file_stem()
                .and_then(|s| s.to_str())
                .is_some_and(valid_session_id)
        })
        .collect();
    if files.len() <= keep {
        return;
    }
    files.sort();
    let remove = files.len() - keep;
    for p in files.into_iter().take(remove) {
        let _ = fs::remove_file(chat_path(&p));
        let _ = fs::remove_file(p);
    }
    // Os vídeos das sessões que acabaram de sair viram órfãos — o `prune_videos` do boot
    // (e o do próximo start) recolhe.
}

#[cfg(test)]
mod tests {
    use super::{chat_path, parse_video_name, valid_session_id};
    use std::path::Path;

    #[test]
    fn session_id_accepts_only_timestamp_digits() {
        assert!(valid_session_id("1721400000000"));
        assert!(!valid_session_id("../config"));
        assert!(!valid_session_id("1/2"));
        assert!(!valid_session_id(""));
        assert!(!valid_session_id("123456789012345678901"));
    }

    #[test]
    fn video_name_reconhece_gravacao_da_corneta() {
        assert_eq!(
            parse_video_name("1721400000000.mp4"),
            Some(("1721400000000".into(), 1))
        );
        assert_eq!(
            parse_video_name("1721400000000.p2.mp4"),
            Some(("1721400000000".into(), 2))
        );
    }

    /// A trava de segurança da poda: a pasta de vídeo é do streamer e pode ser a mesma onde
    /// o OBS grava. Nada que não seja NOSSO padrão de nome pode virar candidato a exclusão.
    #[test]
    fn video_name_recusa_arquivo_alheio() {
        for alheio in [
            "2024-07-30 21-15-03.mp4",
            "live-twitch.mp4",
            "ferias.mp4",
            "1721400000000.mkv",
            "1721400000000.p.mp4",
            "1721400000000.pX.mp4",
            "../../1721400000000.mp4",
            "casamento-1721400000000.mp4",
        ] {
            assert_eq!(parse_video_name(alheio), None, "não podia casar: {alheio}");
        }
    }

    #[test]
    fn chat_mora_ao_lado_da_sessao() {
        assert_eq!(
            chat_path(Path::new("/x/1721400000000.ndjson")),
            Path::new("/x/1721400000000.chat.ndjson")
        );
    }
}
