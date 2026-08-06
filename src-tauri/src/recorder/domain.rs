//! Núcleo PURO do gravador: nomes, argumentos do FFmpeg, leitura do `-progress`,
//! validação de pasta e a POLÍTICA de supervisão do segmento.
//!
//! Nada aqui toca disco, processo, relógio ou Tauri. O laço de verdade (`ffmpeg.rs`) só
//! traduz evento em pergunta pra este arquivo e obedece a resposta — o que faz a decisão
//! que desiste da gravação ser testável sem subir um FFmpeg.

use std::path::{Path, PathBuf};

// ---------------------------------------------------------------------------
// Limites
// ---------------------------------------------------------------------------

/// Sem notícia do `-progress` por este tempo = FFmpeg morto (mesmo sem `Terminated`).
pub const STALL_MS: u128 = 10_000;
/// Reancoragem periódica: sem ela a deriva de relógio se acumula até o fim da live.
pub const SYNC_EVERY_MS: u64 = 5 * 60_000;
/// Piso de disco. Parar ANTES de zerar não é preciosismo: disco em zero trava a escrita do
/// NDJSON da sessão, do config.json e do que o Windows estiver fazendo — reagir depois é tarde.
pub const DISK_FLOOR: u64 = 2 * 1024 * 1024 * 1024;
/// Espaço mínimo pra sequer começar a gravar.
pub const DISK_START_FLOOR: u64 = 5 * 1024 * 1024 * 1024;
/// De quanto em quanto tempo olhar o disco durante a gravação.
pub const DISK_CHECK_EVERY: std::time::Duration = std::time::Duration::from_secs(30);
/// Teto de retomadas. Sem ele, um erro permanente vira laço infinito de spawn.
pub const MAX_RESTARTS: u32 = 5;
/// Depois disto sem `-progress`, a âncora é chutada (marcada como estimada) pra não perder
/// o replay inteiro por causa de um formato que não reportou.
pub const ANCHOR_TIMEOUT_MS: u128 = 15_000;

/// Motivo do fim de um segmento. ASCII de protocolo — o front traduz.
pub const REASON_STOP: &str = "stopped";
pub const REASON_DISK: &str = "disk";
pub const REASON_DIED: &str = "died";
pub const REASON_GIVEUP: &str = "giveup";

// ---------------------------------------------------------------------------
// Nomes e argumentos
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
        "+frag_keyframe+empty_moov+default_base_moof".into(),
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

// ---------------------------------------------------------------------------
// Validação da pasta
// ---------------------------------------------------------------------------

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

/// O que IMPEDE gravar. Tudo o mais é aviso.
pub enum DirProblem {
    Missing,
    NotDir,
    /// No Windows a permissão MENTE: atributo somente-leitura, ACL negando, pasta
    /// sincronizada por serviço de nuvem — só escrever de verdade responde.
    ReadOnly,
}

impl DirProblem {
    pub fn code(&self) -> &'static str {
        match self {
            DirProblem::Missing => "missing",
            DirProblem::NotDir => "notDir",
            DirProblem::ReadOnly => "readonly",
        }
    }
}

impl DirCheck {
    pub fn problem(p: DirProblem) -> Self {
        DirCheck {
            error: Some(p.code().into()),
            ..Default::default()
        }
    }

    /// A pasta serve. Os avisos saem daqui — nenhum deles impede gravar.
    pub fn healthy(path: &str, free: Option<u64>) -> Self {
        DirCheck {
            ok: true,
            error: None,
            free_bytes: free,
            low_space: blocks_start(free),
            removable_or_network: path.starts_with("\\\\") || path.starts_with("//"),
            long_path: path.chars().count() > 200,
        }
    }
}

// ---------------------------------------------------------------------------
// Disco
// ---------------------------------------------------------------------------

/// Espaço insuficiente pra COMEÇAR. `None` (plataforma que não sabe medir) não bloqueia:
/// recusar gravação por não saber medir seria pior do que tentar.
pub fn blocks_start(free: Option<u64>) -> bool {
    free.is_some_and(|f| f < DISK_START_FLOOR)
}

/// Chegou no piso DURANTE a gravação — encerra limpo em vez de escrever até travar a máquina.
pub fn hit_floor(free: Option<u64>) -> bool {
    free.is_some_and(|f| f < DISK_FLOOR)
}

// ---------------------------------------------------------------------------
// Supervisão de um segmento
// ---------------------------------------------------------------------------

/// O que fazer com uma linha de `-progress`.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct ProgressActions {
    /// Ancorar. O epoch do segundo 0 do arquivo é `agora - out_ms`: NÃO é "quando
    /// spawnei", porque com `-c copy` o arquivo só começa no keyframe seguinte, e o
    /// atraso até ele chega a um GOP.
    pub anchor_out_ms: Option<u64>,
    /// Reancorar (mapeia relógio de parede → ms já gravados).
    pub sync_out_ms: Option<u64>,
    /// O vídeo andou — o watchdog de morte silenciosa reinicia a contagem.
    pub advanced: bool,
}

/// Progresso de UM segmento (uma vida do FFmpeg).
#[derive(Default)]
pub struct SegmentProgress {
    anchored: bool,
    last_out: u64,
    last_sync_out: u64,
}

impl SegmentProgress {
    pub fn anchored(&self) -> bool {
        self.anchored
    }

    /// Âncora CHUTADA: o `-progress` não deu as caras a tempo, mas o arquivo cresce.
    /// Melhor um replay com aviso de sincronia do que replay nenhum.
    pub fn estimate_anchor(&mut self) {
        self.anchored = true;
    }

    pub fn observe(&mut self, out_ms: u64) -> ProgressActions {
        let advanced = out_ms > self.last_out;
        if advanced {
            self.last_out = out_ms;
        }
        let anchor_out_ms = if self.anchored {
            None
        } else {
            self.anchored = true;
            Some(out_ms)
        };
        let sync_out_ms = if out_ms.saturating_sub(self.last_sync_out) >= SYNC_EVERY_MS {
            self.last_sync_out = out_ms;
            Some(out_ms)
        } else {
            None
        };
        ProgressActions {
            anchor_out_ms,
            sync_out_ms,
            advanced,
        }
    }
}

/// Morte silenciosa: o processo existe mas parou de produzir. Sem este watchdog, a UI diria
/// "gravando" a live inteira e no fim haveria 4 minutos de vídeo.
///
/// Só vale depois de ancorado: antes do primeiro pacote não há "parou de andar", há
/// "ainda não começou" — e essa espera tem prazo próprio (`should_estimate_anchor`).
pub fn is_stalled(anchored: bool, since_advance_ms: u128) -> bool {
    anchored && since_advance_ms > STALL_MS
}

/// Hora de chutar a âncora: passou do prazo sem `-progress`, mas o arquivo tem bytes.
pub fn should_estimate_anchor(anchored: bool, since_spawn_ms: u128, bytes_written: u64) -> bool {
    !anchored && since_spawn_ms > ANCHOR_TIMEOUT_MS && bytes_written > 0
}

/// O motivo que vai pra sessão. Parada pedida pelo streamer vence qualquer diagnóstico:
/// encerrar a live não é "o gravador morreu".
pub fn final_reason(stopping: bool, reason: &'static str) -> &'static str {
    if stopping {
        REASON_STOP
    } else {
        reason
    }
}

/// O que fazer depois que um segmento fecha.
#[derive(Debug, PartialEq, Eq)]
pub enum AfterSegment {
    /// A live acabou (ou o streamer parou).
    Stop,
    /// Disco no piso: retomar só encheria de novo.
    DiskFull,
    /// Sobe o segmento seguinte depois de esperar. O backoff cresce porque retomada
    /// imediata em erro permanente vira laço de spawn.
    Resume { seg: u32, backoff_ms: u64 },
    /// Estourou o orçamento de retomadas: desiste e avisa.
    GiveUp,
}

/// Orçamento de retomadas.
///
/// É esta política que decide o `recording_gave_up` que chega na telemetria. O orçamento
/// zera a cada segmento que GRAVOU DE VERDADE (ancorou): sem isso, uma live de 6h com uma
/// queda de rede por hora desistiria na sexta — mesmo tendo gravado tudo entre elas.
#[derive(Default)]
pub struct RestartBudget {
    used: u32,
}

impl RestartBudget {
    /// Ancorou: gravou de verdade, o orçamento volta ao começo.
    pub fn earned(&mut self) {
        self.used = 0;
    }

    /// Quantas retomadas já foram gastas. Existe pro teste conseguir afirmar que parar a
    /// live e encher o disco NÃO consomem orçamento.
    #[cfg(test)]
    pub fn used(&self) -> u32 {
        self.used
    }

    pub fn after_segment(&mut self, seg: u32, stopping: bool, reason: &str) -> AfterSegment {
        if stopping {
            return AfterSegment::Stop;
        }
        if reason == REASON_DISK {
            return AfterSegment::DiskFull;
        }
        self.used += 1;
        if self.used > MAX_RESTARTS {
            return AfterSegment::GiveUp;
        }
        AfterSegment::Resume {
            seg: seg + 1,
            backoff_ms: 500 * self.used as u64,
        }
    }
}
