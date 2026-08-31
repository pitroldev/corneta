// ============================================================
// Corneta — modelo de dados (compartilhado conceitualmente com o backend Rust)
// ============================================================

export type PlatformId =
  | "twitch"
  | "youtube"
  | "facebook"
  | "kick"
  | "tiktok"
  | "x"
  | "instagram"
  | "custom";

export type Protocol = "rtmp" | "rtmps";

/** O que o relay faz com cada destino. */
export type EncodingAction = "copy" | "transcode";

/** Modo global de encoding (ver PLANEJAMENTO.md §8). */
export type EncodingMode = "per-platform" | "passthrough" | "hybrid";

/** Encoders de hardware suportados. */
export type EncoderKind =
  "auto" | "nvenc" | "qsv" | "amf" | "videotoolbox" | "software";

export interface VideoPreset {
  width: number;
  height: number;
  fps: number;
  videoBitrateKbps: number;
  audioBitrateKbps: number;
  keyframeSec: number;
}

/** Catálogo de uma plataforma (valores de referência — atualizáveis). */
export interface PlatformPreset {
  id: PlatformId;
  name: string;
  /** Cor de marca para a UI. */
  color: string;
  protocol: Protocol;
  /** URL de ingestão (sem a chave). */
  ingestUrl: string;
  /** Configuração recomendada de encoding. */
  recommended: VideoPreset;
  /** Observações didáticas exibidas na UI. */
  note?: string;
  /** Página do painel onde o usuário pega a stream key. */
  keyUrl?: string;
  /** Página ao vivo/dashboard pra conferir a transmissão. */
  liveUrl?: string;
  /** Plataforma cuja chave não é auto-serviço / suporte experimental. */
  experimental?: boolean;
}

/** Configuração de encoding de um destino específico. */
/** Enquadramento do recorte vertical (saída portrait). x/y = panorâmica 0..1; zoom 0.25..1. */
export interface Reframe {
  x: number;
  y: number;
  zoom: number;
}

export interface TargetEncoding {
  /** Legado — não usado; o híbrido decide via hybridOverride/auto. */
  action: EncodingAction;
  /** Parâmetros de saída quando recodifica. */
  preset?: VideoPreset;
  encoder: EncoderKind;
  /** No modo híbrido: override manual. undefined = decisão automática. */
  hybridOverride?: EncodingAction;
  /** Enquadramento da saída vertical (crop 9:16). undefined = centralizado. */
  reframe?: Reframe;
}

/** Um destino de transmissão configurado pelo usuário. */
export interface Target {
  id: string;
  platformId: PlatformId;
  name: string;
  enabled: boolean;
  protocol: Protocol;
  ingestUrl: string;
  /** A chave NUNCA é guardada aqui — só sabemos se existe no cofre. */
  hasKey: boolean;
  encoding: TargetEncoding;
}

/** Endpoint local que o OBS usa para publicar. */
export interface IngestConfig {
  protocol: "rtmp";
  host: string;
  port: number;
  app: string;
  key: string;
}

export interface AppSettings {
  minimizeToTray: boolean;
  autostart: boolean;
  /** Senha do obs-websocket (vazio = sem auth). */
  obsPassword: string;
  /** Ligar/parar o OBS junto com o BORA AO VIVO. */
  autoStartObs: boolean;
  /** Atalho global pra começar/parar (acelerador do Tauri). */
  liveShortcut: string;
  /** Chat: API key do YouTube Data API v3 (compartilhada entre as fontes do YouTube). */
  youtubeApiKey: string;
  /** Chat: fontes (várias por plataforma). */
  chatSources: ChatSource[];
  /** Alertas: fontes externas (Streamlabs/StreamElements). Token no cofre. */
  alertSources: AlertSource[];
  /** Exibição do chat. */
  chatShowEmotes: boolean;
  chatShowBadges: boolean;
  chatShowPlatform: boolean;
  chatShowSource: boolean;
  chatShowTimestamps: boolean;
  /** Mostrar o contador de quem está assistindo (clicável pra esconder). */
  chatShowViewers: boolean;
  /** Tema da interface. */
  theme: "dark" | "light";
  /** Idioma da interface. "auto" segue o idioma do Windows. */
  language: "auto" | "pt-BR" | "en";
  /** Tamanho da fonte do chat, em pixels. */
  chatFontSize: number;
  /** Tamanho da fonte dos alertas, em pixels (slider próprio, igual ao do chat). */
  alertFontSize: number;
  /** Layout do modo "Ambos" da janela do chat. */
  chatBothLayout: "auto" | "row" | "col";
  /** No modo "Ambos", mostrar os alertas antes do chat. */
  chatBothAlertsFirst: boolean;
  /** Posição do divisor do modo "Ambos": % que o painel de alertas ocupa. */
  chatBothSplit: number;
  /** Guardião de privacidade: mostra a tela "JÁ VOLTO" quando um TERMO seu aparece (preventivo). */
  guardianEnabled: boolean;
  /** Termos EXPLÍCITOS a vigiar (e-mail, nome real, endereço, @…). Único gatilho da feature. */
  guardianWatchlist: string[];
  /** Normalizador de áudio: acerta o volume pro alvo antes de enviar (loudnorm no encode que já roda). */
  loudnessNormalize: boolean;
  /** Alvo de loudness integrado (LUFS) do normalizador — ~-14 pra Twitch/YouTube. */
  loudnessTargetLufs: number;
  /** Tela "JÁ VOLTO": mantém a live de pé com um slate quando o sinal cai. */
  brbEnabled: boolean;
  /** Tela "JÁ VOLTO": "auto" (gerada) | "image" | "video" (arquivo escolhido pelo usuário). */
  brbSlateKind: "auto" | "image" | "video";
  /** Nome original do arquivo custom do "JÁ VOLTO" (só exibição — o arquivo vira brb-slate.*). */
  brbSlateFileName?: string;
  /** Gravar o programa em disco (pro replay do relatório). Padrão DESLIGADO: a 6000 kbps
   *  são ~2,7 GB/hora, e ligar sem o streamer pedir encheria o disco dele. */
  recordVideo: boolean;
  /** Pasta das gravações. VAZIO = pasta de sessões, resolvida na hora — um caminho
   *  concreto aqui amarraria a config a uma máquina. */
  recordVideoDir: string;
  /** Teto de disco das gravações, em GB (a poda de vídeo é por espaço, não por contagem). */
  recordVideoKeepGb: number;
  /** Gravar as mensagens do chat. Chave separada da de vídeo: uma custa disco, a outra
   *  guarda dado pessoal de terceiros. */
  recordChat: boolean;
  /** Auto-bitrate: baixa o bitrate de destinos em transcode quando a banda aperta. */
  autoBitrate: boolean;
  /** YouTube automático: cria a transmissão (broadcast) e injeta a chave no BORA — sem Studio. */
  youtubeAutoLive: boolean;
  /** Título da live, lembrado entre sessões (alimenta o broadcast automático do YouTube). */
  streamTitle: string;
  /** Conectar o chat sozinho quando a transmissão entra no ar. */
  chatAutoConnect: boolean;
  /** Última aba usada na janela flutuante do chat (persistida entre aberturas). */
  chatPopoutTab: "chat" | "alerts" | "both";
  /** Painel de alertas da tela de Chat aberto (persistido entre visitas). */
  chatShowAlertsPanel: boolean;
  /** Overlay de alertas pro OBS: servidor local (Browser Source) ligado. URL fixa pra colar 1x. */
  overlayEnabled: boolean;
  /** Overlay: tocar um som (chime) quando um alerta aparece. */
  overlaySound: boolean;
  /** Overlay: posição do card na tela (top | bottom | center | top-left | …). */
  overlayPosition: string;
  /** Overlay: porta do servidor local (URL fixa pro OBS). */
  overlayPort: number;
  /** Overlay do chat: de onde a lista cresce ("bottom" | "top"). */
  overlayChatPosition: string;
  /** Overlay de alertas: tempo que cada card fica na tela (s). */
  overlayDurationSecs: number;
  /** Overlay de alertas: escala do card ("sm" | "md" | "lg"). */
  overlayScale: string;
  /** Overlay de alertas: mostrar alertas de seguidor. */
  overlayShowFollows: boolean;
  /** Overlay do chat: tamanho da fonte (px). */
  overlayChatSize: number;
  /** Overlay do chat: máximo de mensagens na tela. */
  overlayChatMax: number;
  /** Overlay do chat: mostrar selos (mod/sub/vip). */
  overlayChatBadges: boolean;
  /** Overlay do chat: mostrar o pontinho da plataforma. */
  overlayChatPlatform: boolean;
  /** Overlay do chat: esconder mensagens de comando (começam com "!"). */
  overlayChatHideCommands: boolean;
  /** Overlay do chat: sumir com a mensagem após N segundos (0 = nunca). */
  overlayChatFadeSecs: number;
}

export interface ObsCheck {
  reachable: boolean;
  /** A conexão falhou por SENHA? Vem do Rust como DADO — o front precisa
   *  distinguir senha errada de OBS fechado, e farejar palavra na mensagem
   *  deixou de funcionar quando ela ganhou tradução. */
  authFailed?: boolean;
  pointingAtCorneta: boolean;
  width: number;
  height: number;
  fps: number;
  error?: string;
}

/** Fontes de chat. Cinefy é somente chat; não é um destino de transmissão. */
export type ChatPlatform = "twitch" | "youtube" | "kick" | "cinefy";

export interface ChatSource {
  id: string;
  platform: ChatPlatform;
  value: string;
  name: string;
  enabled: boolean;
  /** Tem token de envio no cofre (recomputado pelo backend). Só Twitch por enquanto. */
  hasSendToken?: boolean;
}

export type AlertSourceKind = "streamlabs" | "streamelements";

/** Fonte de alerta externa (agregador). O token fica no cofre, não aqui. */
export interface AlertSource {
  id: string;
  kind: AlertSourceKind;
  name: string;
  enabled: boolean;
  /** Recomputado pelo backend a partir do cofre (não confiar pra persistir). */
  hasToken?: boolean;
}

export interface ChatFragment {
  kind: "text" | "emote";
  text?: string;
  url?: string;
}

export interface ChatBadge {
  label: string;
  kind: string;
}

export interface ChatMessage {
  id: string;
  platform: ChatPlatform;
  source: string;
  author: string;
  /** ID do autor na plataforma (Twitch user-id) — pra moderar sem lookup por nome. */
  authorId?: string;
  nativeId?: string;
  color?: string;
  text: string;
  fragments: ChatFragment[];
  badges: ChatBadge[];
  ts: number;
  /** Removida pela moderação — vira lápide (tombstone) no feed em vez de sumir. */
  deleted?: boolean;
}

export interface ChatDelete {
  scope: "message" | "user" | "all";
  platform: string;
  source?: string;
  nativeId?: string;
  author?: string;
}

export interface ChatStatus {
  platform: string;
  source: string;
  status: string; // connected | disconnected | error
}

export interface ViewerItem {
  platform: ChatPlatform;
  source: string;
  viewers: number | null;
  live: boolean;
}

export interface Viewers {
  total: number;
  anyLive: boolean;
  items: ViewerItem[];
}

export type AlertKind =
  | "follow"
  | "sub"
  | "resub"
  | "subgift"
  | "bits"
  | "tip"
  | "raid"
  | "member"
  | "superchat";

export interface Alert {
  id: string;
  /** Origem: plataforma de chat (twitch/youtube/kick) OU agregador (streamlabs/streamelements). */
  platform: string;
  source: string;
  kind: AlertKind;
  user: string;
  amount?: number;
  currency?: string;
  tier?: string;
  message?: string;
  /** Fragmentos com emotes (BTTV/FFZ/7TV + nativos) da mensagem — hoje só Twitch (resub/sub).
   *  Vazio/ausente = renderiza `message` como texto puro. */
  fragments?: ChatFragment[];
  ts: number;
}

/** Termo do usuário detectado na tela pelo guardião de privacidade. */
export interface Leak {
  label: string;
  snippet: string;
}

export interface Profile {
  id: string;
  name: string;
  mode: EncodingMode;
  targets: Target[];
}

export interface AppConfig {
  schemaVersion: number;
  revision: number;
  ingest: IngestConfig;
  mode: EncodingMode;
  targets: Target[];
  settings: AppSettings;
  profiles: Profile[];
  activeProfileId: string;
}

// ---- Estado de execução ----

export type EngineState = "stopped" | "starting" | "live" | "error";

export type TargetState =
  | "idle"
  | "connecting"
  | "live"
  | "reconnecting"
  | "error"
  | "paused"
  | "waiting"
  /** Estava AO VIVO e o sinal do OBS sumiu (sem JÁ VOLTO) — urgente, diferente do waiting pré-live. */
  | "signal-lost"
  | "brb"
  | "censor";

export interface TargetStatus {
  targetId: string;
  name: string;
  state: TargetState;
  bitrateKbps: number;
  fps: number;
  droppedFrames: number;
  uptimeSec: number;
  message?: string;
}

export interface ObsStats {
  activeFps: number;
  avgRenderMs: number;
  renderSkipped: number;
  outputSkipped: number;
  /** Congestionamento de saída (0..1). */
  congestion: number;
}

export interface EngineSnapshot {
  state: EngineState;
  startedAt: number | null;
  targets: Record<string, TargetStatus>;
  message?: string;
  /** UUID da operação de live corrente, compartilhado entre UI e motor nativo. */
  operationId?: string;
  /** UUID opaco da falha nativa, quando o backend capturou um evento correlato. */
  errorId?: string;
  /** Uso real de CPU/GPU (%) enquanto transmite. */
  cpu?: number;
  gpu?: number;
  /** Stats do OBS (se conectado via obs-websocket). */
  obs?: ObsStats;
  /** "JÁ VOLTO agora" manual acionado pelo streamer (botão na sala de guerra). */
  forcedBrb?: boolean;
}

export interface EncoderInfo {
  kind: EncoderKind;
  label: string;
  available: boolean;
  /** Sessões simultâneas estimadas (heurística). */
  maxSessions?: number;
}

// ---- Relatório pós-live ----

export interface SessionPlatform {
  id: string;
  name: string;
  platformId: PlatformId;
}

export interface SessionMeta {
  id: string;
  startedAt: number;
  endedAt?: number;
  durationSec: number;
  mode: EncodingMode;
  platforms: SessionPlatform[];
  /** Existe vídeo desta sessão no disco? Vem de existência de ARQUIVO, não do NDJSON:
   *  quem apaga o MP4 na mão perde a aba de replay, não ganha um erro vermelho. */
  hasVideo?: boolean;
  hasChat?: boolean;
}

export interface SessionSampleTarget {
  id: string;
  name: string;
  state: TargetState;
  bitrate: number;
  fps: number;
  dropped: number;
}

export interface SessionSample {
  t: number;
  cpu?: number;
  gpu?: number;
  obs?: ObsStats;
  /** Mensagens de chat nesta janela (~2s) — vira taxa de chat / picos. */
  chat?: number;
  /** As mesmas mensagens por canal (`plataforma:fonte`). Ausente em sessão antiga
   *  (gravada antes da segregação) e em janela sem mensagem nenhuma. */
  chatBy?: Record<string, number>;
  targets: SessionSampleTarget[];
}

export interface SessionMarker {
  t: number;
  label: string;
}

export interface SessionViewerSample {
  t: number;
  total: number;
  items: { platform: ChatPlatform; source: string; viewers: number | null }[];
}

/** Total ABSOLUTO de seguidores de cada canal num instante — o ganho da live é a
 *  diferença entre a primeira e a última amostra. Só existe pra plataforma que
 *  expõe o contador (hoje Twitch e Kick). */
export interface SessionFollowerSample {
  t: number;
  items: { platform: ChatPlatform; source: string; total: number }[];
}

export interface SessionAlertEvent {
  t: number;
  platform: ChatPlatform;
  /** Rótulo do canal de origem (mesmo namespace de `viewers`/`chatBy`).
   *  Ausente em sessão antiga; em alerta de agregador, o `platform` é o agregador. */
  source?: string;
  kind: AlertKind;
  user: string;
  amount?: number;
}

/** Resultado da validação da pasta de gravação. Só `error` impede gravar — o resto avisa
 *  e deixa seguir, porque a máquina é do streamer. */
export interface RecordDirCheck {
  ok: boolean;
  /** "missing" | "notDir" | "readonly" — chave de protocolo, o front traduz. */
  error?: string;
  freeBytes?: number;
  lowSpace: boolean;
  removableOrNetwork: boolean;
  longPath: boolean;
}

/** Uma mensagem do chat gravado. Campos curtos porque são dezenas de milhares de linhas:
 *  `t` epoch · `p` plataforma · `s` fonte · `a` autor · `c` cor · `m` texto · `i` id nativo. */
export interface ReplayChatMessage {
  t: number;
  p: ChatPlatform;
  s: string;
  a: string;
  c?: string;
  m: string;
  i?: string;
  /** Removida pela moderação depois de dita — o replay esconde por padrão. */
  deleted?: boolean;
}

/** Buraco no chat gravado (caiu e voltou). O replay mostra em vez de fingir continuidade. */
export interface ReplayChatGap {
  t: number;
  from: number;
}

export interface SessionData {
  meta: SessionMeta;
  samples: SessionSample[];
  markers: SessionMarker[];
  viewerSamples: SessionViewerSample[];
  followerSamples: SessionFollowerSample[];
  alertEvents: SessionAlertEvent[];
  /** Segmentos de vídeo gravados (uma sessão tem N: o gravador pode morrer e retomar). */
  recordings: SessionRecording[];
  /** Saltos do relógio do sistema durante a live (NTP, horário de verão). */
  clockJumps: { t: number; delta: number }[];
  /** Ajuste manual de sincronia do streamer, em ms. */
  offsetMs: number;
}

export interface SessionRecording {
  seg: number;
  t: number;
  path: string;
  codec: string;
  estimated: boolean;
  syncs: { t: number; out: number }[];
  endT: number;
  /** Motivo do fim: "stopped" | "disk" | "died" | "giveup" | "truncated". */
  reason?: string;
  /** O remux de finalização rodou — o arquivo já navega bem. */
  finalized: boolean;
}

/** Resumo de uma sessão pra lista/comparação (computado no front a partir de analyze(), cacheado). */
export interface SessionSummary {
  /** false = sessão sem amostras úteis (não mostrar chips). */
  hasData: boolean;
  peakViewers: number | null;
  avgViewers: number | null;
  /** Total de mensagens de chat na live. */
  chatTotal: number | null;
  /** Quantidade de trechos com problema detectados pela análise. */
  problemWindows: number;
  /** Cor do veredito da análise (bolinha na lista). */
  verdictTone: "ok" | "warn" | "bad";
}
