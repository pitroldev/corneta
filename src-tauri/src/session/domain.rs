//! Núcleo PURO da sessão: nomes, formato das linhas NDJSON, salto de relógio,
//! recuperação e poda.
//!
//! Nada aqui toca disco, relógio ou Tauri. Toda decisão que o relatório depende mora
//! neste arquivo e é testável sem criar um arquivo sequer — o tempo entra como parâmetro
//! (`t: u64`), nunca como `SystemTime::now()`.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::{json, Value};

use crate::engine::EngineSnapshot;
use crate::resources::ResourceAppSample;

/// Quantas sessões manter no disco (as mais antigas são podadas).
pub const KEEP: usize = 50;
pub const MAX_SESSION_BYTES: u64 = 32 * 1024 * 1024;
/// Teto PRÓPRIO do arquivo de chat (~100 mil mensagens). Separado do teto das métricas de
/// propósito: uma live movimentada não pode gastar o orçamento do relatório com texto.
/// Ver docs/FEATURE-GRAVACAO-E-REPLAY.md §3.3.
pub const MAX_CHAT_BYTES: u64 = 16 * 1024 * 1024;
/// v2: amostra ganhou `chatBy` (chat por canal) e o alerta ganhou `source`.
/// v3: gravação de vídeo (`recording`/`recSync`/`recEnd`), chat em arquivo irmão,
///     `clockJump` e `offset`. Leitor antigo ignora `kind` que não conhece, e o parser
///     novo lê v2 sem nada faltando — a compatibilidade vale nos dois sentidos.
/// v4: pressão de memória e, de forma esparsa, os três aplicativos que mais disputaram
///     CPU/GPU/memória. Sem caminhos, argumentos ou títulos de janela.
pub const SCHEMA_VERSION: u32 = 4;
/// O estado da sessão está na última linha. Ler só a cauda evita carregar até 32 MiB
/// para cada uma das 50 sessões durante o boot.
pub const TAIL_BYTES: u64 = 64 * 1024;

// ---------------------------------------------------------------------------
// Nomes
// ---------------------------------------------------------------------------

pub fn valid_session_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 20 && id.bytes().all(|b| b.is_ascii_digit())
}

pub fn session_file_name(id: &str) -> String {
    format!("{id}.ndjson")
}

/// `<id>.ndjson` → `<id>.chat.ndjson`. Arquivo separado para que apagar o chat (LGPD)
/// não leve o relatório junto, e para que o teto de um não coma o do outro.
pub fn chat_path(session: &Path) -> PathBuf {
    let stem = session
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("sessao");
    session.with_file_name(format!("{stem}.chat.ndjson"))
}

/// O arquivo é uma sessão (e não o `.chat.ndjson` irmão, nem coisa alheia)?
pub fn is_session_file(path: &Path) -> bool {
    path.extension().and_then(|x| x.to_str()) == Some("ndjson")
        && path
            .file_stem()
            .and_then(|s| s.to_str())
            .is_some_and(valid_session_id)
}

/// Nome de arquivo de gravação → (id da sessão, nº do segmento).
///
/// Este reconhecedor é a TRAVA DE SEGURANÇA da poda (§7 do doc): a pasta de vídeo é
/// escolhida pelo streamer e pode ser a mesma onde o OBS grava, ou a raiz de um HD com
/// dez anos de coisa. Só o que casa `<13+ dígitos>.mp4` ou `<13+ dígitos>.pN.mp4` é
/// candidato — nada de varrer por extensão, nada de "apagar o mais antigo da pasta".
pub fn parse_video_name(name: &str) -> Option<(String, u32)> {
    let stem = name.strip_suffix(".mp4")?;
    match stem.split_once(".p") {
        Some((id, seg)) if valid_session_id(id) => Some((id.into(), seg.parse().ok()?)),
        Some(_) => None,
        None if valid_session_id(stem) => Some((stem.into(), 1)),
        None => None,
    }
}

pub fn video_id_of(path: &Path) -> Option<String> {
    let name = path.file_name()?.to_str()?;
    parse_video_name(name).map(|(id, _)| id)
}

// ---------------------------------------------------------------------------
// Linhas do NDJSON
//
// Cada construtor é puro e recebe `t` de fora: o formato do relatório é contrato com o
// parser do frontend, e contrato se testa sem depender de que horas são.
// ---------------------------------------------------------------------------

pub fn meta_line(id: u64, mode: &str, platforms: Vec<Value>) -> Value {
    json!({
        "kind": "meta",
        "schemaVersion": SCHEMA_VERSION,
        "id": id.to_string(),
        "startedAt": id,
        "mode": mode,
        "platforms": platforms,
    })
}

/// Uma amostra (estado dos destinos + CPU/GPU + mensagens de chat na janela).
///
/// `chat_by_channel` vem de `chat::drain_msg_counts` (`plataforma:fonte` → nº de mensagens).
/// O campo `chat` continua sendo o TOTAL — relatórios gravados antes da segregação por
/// canal só têm ele, e a análise precisa seguir lendo os dois formatos.
pub fn sample_line(
    t: u64,
    snap: &EngineSnapshot,
    chat_by_channel: &HashMap<String, u64>,
    apps: &[ResourceAppSample],
) -> Value {
    let targets: Vec<Value> = snap
        .targets
        .values()
        .map(|x| {
            json!({
                "id": x.target_id,
                "name": x.name,
                "state": x.state,
                "bitrate": x.bitrate_kbps,
                "fps": x.fps,
                "dropped": x.dropped_frames,
            })
        })
        .collect();
    let mut sample = json!({
        "kind": "sample",
        "t": t,
        "cpu": snap.cpu,
        "gpu": snap.gpu,
        "memoryPct": snap.memory_pct,
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
    // A lista só existe nas amostras de processo (~6 s, ou ~2 s sob pressão).
    // Omitir em vez de gravar `[]` reduz bastante uma live longa.
    if !apps.is_empty() {
        sample["apps"] = json!(apps);
    }
    sample
}

/// Contagem de viewers (total + por fonte) — pra curva de retenção do relatório.
pub fn viewers_line(t: u64, total: u64, items: &[Value]) -> Value {
    json!({ "kind": "viewers", "t": t, "total": total, "items": items })
}

/// Total de seguidores de cada canal — o relatório tira daí o ganho da live
/// (último menos primeiro). É o total ABSOLUTO de propósito: guardar o delta aqui
/// deixaria o número refém do instante em que a amostragem começou.
///
/// Sem nenhum canal que exponha o contador, não há linha: `None` em vez de uma linha
/// vazia que a análise teria que aprender a ignorar.
pub fn followers_line(t: u64, items: &[Value]) -> Option<Value> {
    if items.is_empty() {
        return None;
    }
    Some(json!({ "kind": "followers", "t": t, "items": items }))
}

/// Alerta (sub/raid/bits…) — pra timeline e momentos de destaque.
///
/// `source` é o rótulo do canal (mesmo namespace do `viewers`/`chatBy`), o que permite
/// somar os alertas por canal. Em alerta de agregador (Streamlabs/StreamElements) o
/// `platform` é o nome do agregador, não uma plataforma de chat — a análise trata esses
/// como não-atribuíveis em vez de chutar um canal.
pub fn alert_line(
    t: u64,
    platform: &str,
    source: &str,
    kind: &str,
    user: &str,
    amount: Option<f64>,
) -> Value {
    json!({
        "kind": "alert", "t": t,
        "platform": platform, "source": source,
        "alertKind": kind, "user": user, "amount": amount,
    })
}

pub fn end_line(t: u64) -> Value {
    json!({ "kind": "end", "endedAt": t })
}

/// Fim escrito pelo boot seguinte, não pela live: a sessão morreu sem `end`.
pub fn recovered_end_line(t: u64) -> Value {
    json!({ "kind": "end", "endedAt": t, "recovered": true })
}

/// Âncora de um segmento de vídeo: o epoch que corresponde ao segundo 0 DAQUELE arquivo.
///
/// `estimated` marca a âncora chutada no spawn (quando o `-progress` não deu as caras a
/// tempo). O player mostra um aviso: com `-c copy` o arquivo só começa no keyframe
/// seguinte, então o chute erra até o tamanho do GOP.
pub fn recording_line(
    seg: u32,
    started_at: u64,
    file: &str,
    codec: &str,
    estimated: bool,
) -> Value {
    json!({
        "kind": "recording", "seg": seg, "t": started_at,
        "path": file, "codec": codec, "estimated": estimated,
    })
}

/// Reancoragem periódica: mapeia relógio de parede → ms já gravados.
///
/// Sem isto, uma live de 4h termina com o vídeo dessincronizado do relatório, porque o
/// relógio do RTMP e o de parede não andam idênticos — e uma âncora só no início
/// extrapola o erro justamente até o fim.
pub fn rec_sync_line(t: u64, seg: u32, out_ms: u64) -> Value {
    json!({ "kind": "recSync", "seg": seg, "t": t, "out": out_ms })
}

/// Fim de um segmento de vídeo. `reason` é ASCII de protocolo (o front traduz).
pub fn rec_end_line(t: u64, seg: u32, reason: &str) -> Value {
    json!({ "kind": "recEnd", "seg": seg, "t": t, "reason": reason })
}

/// `recEnd` escrito pela RECUPERAÇÃO, no boot seguinte a um crash. Sem `seg` de propósito:
/// quem recupera não sabe qual segmento estava aberto, só que ele ficou truncado.
pub fn truncated_rec_end_line(t: u64) -> Value {
    json!({ "kind": "recEnd", "t": t, "reason": "truncated" })
}

/// O remux de finalização terminou: o arquivo virou MP4 indexado e já navega.
pub fn rec_finalized_line(seg: u32, file: &str) -> Value {
    json!({ "kind": "recFinalized", "seg": seg, "path": file })
}

/// Salto do relógio do sistema (NTP, horário de verão, ajuste manual).
///
/// Isto conserta mais do que a gravação: o epoch da sessão é relógio de parede puro, então
/// uma correção de NTP no meio da live JÁ entorta o eixo do relatório de hoje. Registrar o
/// salto deixa o front desfazer nos dois.
pub fn clock_jump_line(t: u64, delta_ms: i64) -> Value {
    json!({ "kind": "clockJump", "t": t, "delta": delta_ms })
}

/// Ajuste manual de sincronia do streamer (ms). Última linha vence — é o histórico
/// append-only fazendo as vezes de campo editável.
pub fn offset_line(offset_ms: i64) -> Value {
    json!({ "kind": "offset", "ms": offset_ms })
}

/// Marcador ("momento") — aparece na linha do tempo do relatório.
pub fn marker_line(t: u64, label: &str) -> Value {
    json!({ "kind": "marker", "t": t, "label": label })
}

/// Uma mensagem. Campos curtos de propósito: o nome longo repetido 40 mil vezes é peso puro.
///
/// `t` epoch · `p` plataforma · `s` fonte (mesmo namespace do `chatBy`) · `a` autor ·
/// `c` cor · `m` texto · `i` id nativo (pra casar deleção).
pub fn chat_msg_line(
    t: u64,
    platform: &str,
    source: &str,
    author: &str,
    color: Option<&str>,
    text: &str,
    native_id: Option<&str>,
) -> Value {
    let mut v = json!({ "t": t, "p": platform, "s": source, "a": author, "m": text });
    if let Some(c) = color {
        v["c"] = json!(c);
    }
    if let Some(id) = native_id {
        v["i"] = json!(id);
    }
    v
}

/// Buraco no chat (caiu e voltou). O replay MOSTRA o buraco em vez de fingir continuidade —
/// silêncio de verdade e silêncio por desconexão são coisas diferentes pra quem revisa.
pub fn chat_gap_line(t: u64, from: u64) -> Value {
    json!({ "t": t, "gap": from })
}

/// Mensagem removida na plataforma depois de dita (moderação).
///
/// O replay oculta por padrão: se alguém foi banido por assédio e a mensagem saiu do ar, o
/// replay da Corneta não deveria ser o único lugar do mundo onde ela sobrevive pra sempre.
pub fn chat_delete_line(t: u64, native_id: &str) -> Value {
    json!({ "t": t, "del": native_id })
}

// ---------------------------------------------------------------------------
// Salto de relógio
// ---------------------------------------------------------------------------

/// Tolerância folgada: o amostrador roda a cada ~2s e pode atrasar sob carga. Só um
/// desvio grande entre os dois relógios é salto de verdade.
pub const CLOCK_TOLERANCE_MS: i64 = 2_000;

/// Quanto o relógio de PAREDE andou a mais (ou a menos) que o monotônico entre duas
/// amostras. O monotônico é imune a acerto de relógio; a diferença entre os dois é,
/// por definição, o que alguém mexeu.
pub fn clock_drift_ms(mono_delta_ms: i64, wall_delta_ms: i64) -> i64 {
    wall_delta_ms - mono_delta_ms
}

pub fn is_clock_jump(drift_ms: i64) -> bool {
    drift_ms.abs() > CLOCK_TOLERANCE_MS
}

// ---------------------------------------------------------------------------
// Recuperação de sessão interrompida
// ---------------------------------------------------------------------------

#[derive(Debug, PartialEq, Eq)]
pub enum Recovery {
    /// Terminou direito — nada a fazer.
    Complete,
    /// Morreu sem `end` (queda de energia, crash). Se estava gravando, o segmento aberto
    /// ficou truncado — marcar é o que faz o player mostrar "gravação interrompida" em vez
    /// de fingir que o arquivo está inteiro.
    Interrupted { was_recording: bool },
}

/// Lê o estado final da sessão a partir da CAUDA do arquivo.
///
/// A cauda pode começar no meio de uma linha (o corte é por bytes); linha quebrada não
/// parseia e é simplesmente ignorada, que é o comportamento desejado.
pub fn recovery_from_tail(raw: &str) -> Recovery {
    let mut was_recording = None;
    for value in raw
        .lines()
        .rev()
        .filter_map(|line| serde_json::from_str::<Value>(line).ok())
    {
        match value.get("kind").and_then(Value::as_str) {
            // Marker, offset e recFinalized podem ser gravados depois do fim. O
            // encerramento continua valendo mesmo quando já não é a última linha.
            Some("end") => return Recovery::Complete,
            Some("recording") if was_recording.is_none() => was_recording = Some(true),
            Some("recEnd") if was_recording.is_none() => was_recording = Some(false),
            _ => {}
        }
    }
    Recovery::Interrupted {
        was_recording: was_recording.unwrap_or(false),
    }
}

/// Encerramento real presente na cauda. Se uma versão antiga anexou uma
/// recuperação depois de um `end` legítimo, o menor timestamp válido vence.
pub fn ended_at_from_tail(raw: &str, started_at: u64) -> Option<u64> {
    raw.lines()
        .filter_map(|line| serde_json::from_str::<Value>(line).ok())
        .filter(|value| value.get("kind").and_then(Value::as_str) == Some("end"))
        .filter_map(|value| value.get("endedAt").and_then(Value::as_u64))
        .filter(|ended_at| *ended_at >= started_at)
        .min()
}

/// O arquivo tem tamanho que valha a pena examinar no boot?
pub fn worth_recovering(len: u64) -> bool {
    len > 0 && len <= MAX_SESSION_BYTES
}

// ---------------------------------------------------------------------------
// Cabeçalho da sessão
// ---------------------------------------------------------------------------

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

/// Cabeçalho (primeira linha) + mtime do arquivo → metadados da sessão.
///
/// O fim é ESTIMADO pelo mtime: uma sessão que morreu com o processo não tem linha `end`,
/// e mesmo assim precisa aparecer na lista com uma duração plausível.
pub fn parse_meta_line(first: &str, mtime_ms: Option<u64>) -> Option<SessionMeta> {
    let v: Value = serde_json::from_str(first.trim()).ok()?;
    if v.get("kind")?.as_str()? != "meta" {
        return None;
    }
    let started_at = v.get("startedAt")?.as_u64()?;
    let duration_sec = mtime_ms
        .map(|e| e.saturating_sub(started_at) / 1000)
        .unwrap_or(0);
    Some(SessionMeta {
        id: v.get("id")?.as_str()?.to_string(),
        started_at,
        ended_at: mtime_ms,
        duration_sec,
        mode: v
            .get("mode")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string(),
        platforms: v.get("platforms").cloned().unwrap_or_else(|| json!([])),
        has_video: false, // preenchido por quem lista (uma varredura pra lista toda)
        has_chat: false,
    })
}

// ---------------------------------------------------------------------------
// Poda
// ---------------------------------------------------------------------------

/// Quais sessões apagar pra manter só as `keep` mais recentes (nome do arquivo = timestamp).
///
/// Filtra por id VÁLIDO antes de contar: `<id>.chat.ndjson` também termina em `.ndjson` e
/// NÃO é uma sessão. Sem este filtro ele contaria como sessão e a poda apagaria o dobro do
/// que devia. Quem chama leva os irmãos (`.chat.ndjson`, `.mp4`) junto — senão eles ficariam
/// órfãos pra sempre, sem nada na interface explicando de onde vieram.
pub fn plan_session_prune(files: &[PathBuf], keep: usize) -> Vec<PathBuf> {
    let mut sessions: Vec<PathBuf> = files
        .iter()
        .filter(|p| is_session_file(p))
        .cloned()
        .collect();
    if sessions.len() <= keep {
        return vec![];
    }
    sessions.sort();
    let remove = sessions.len() - keep;
    sessions.truncate(remove);
    sessions
}

/// Um arquivo de gravação reconhecido, com tamanho e a sessão a que pertence.
pub struct VideoFile {
    pub path: PathBuf,
    pub len: u64,
    pub id: String,
}

/// O que apagar de vídeo, em ordem.
pub struct VideoPrunePlan {
    /// Vídeo cuja sessão já foi podada. Sai primeiro e independe do teto: sem relatório
    /// que o referencie, ele não tem como aparecer na interface.
    pub orphans: Vec<PathBuf>,
    /// Candidatos à poda por espaço, MAIS ANTIGO PRIMEIRO (o id é o timestamp de início,
    /// então ordenar por ele basta), com o tamanho de cada um.
    pub candidates: Vec<(PathBuf, u64)>,
    /// Bytes ocupados pelos vídeos que ainda têm relatório — é o que conta pro teto.
    pub total: u64,
    pub budget: u64,
}

/// Poda de vídeo: por ESPAÇO, e nunca por contagem.
///
/// 50 sessões de métricas são alguns MB; 50 vídeos são centenas de GB. São eixos
/// diferentes e por isso são duas podas diferentes.
pub fn plan_video_prune(
    files: Vec<VideoFile>,
    known_ids: &[String],
    keep_gb: u64,
) -> VideoPrunePlan {
    let budget = keep_gb.saturating_mul(1024 * 1024 * 1024);
    let mut orphans = Vec::new();
    let mut keepers: Vec<VideoFile> = Vec::new();
    let mut total: u64 = 0;
    for f in files {
        if known_ids.iter().any(|k| k == &f.id) {
            total += f.len;
            keepers.push(f);
        } else {
            orphans.push(f.path);
        }
    }
    keepers.sort_by(|a, b| a.id.cmp(&b.id));
    VideoPrunePlan {
        orphans,
        candidates: if total <= budget {
            vec![]
        } else {
            keepers.into_iter().map(|f| (f.path, f.len)).collect()
        },
        total,
        budget,
    }
}

/// Cabe mais uma linha neste arquivo?
pub fn fits_cap(current_len: u64, cap: u64) -> bool {
    current_len < cap
}
