import type { I18n } from "../i18n";
import {
  type TelemetryChoice,
  type TelemetryStatus,
} from "../telemetry-schema";
import type {
  Alert,
  AppConfig,
  ChatDelete,
  ChatMessage,
  ChatStatus,
  EncoderInfo,
  EngineSnapshot,
  Leak,
  ObsCheck,
  RecordDirCheck,
  SessionMeta,
  Viewers,
} from "../types";

export interface CornetaApi {
  getConfig(): Promise<AppConfig>;
  saveConfig(config: AppConfig): Promise<AppConfig>;
  /** Config salva por QUALQUER janela → sincroniza as demais (evita clobber entre webviews). */
  subscribeConfigChanged(cb: (c: AppConfig) => void): () => void;
  setKey(targetId: string, key: string): Promise<void>;
  clearKey(targetId: string): Promise<void>;
  detectEncoders(): Promise<EncoderInfo[]>;
  testUpload(): Promise<number>; // Mbps
  setAutostart(enabled: boolean): Promise<void>;
  start(operationId?: string): Promise<void>;
  stop(operationId?: string): Promise<void>;
  setTargetPaused(targetId: string, paused: boolean): Promise<void>;
  /** Destino parqueado em erro (ex.: chave recusada): relê a chave do cofre e tenta de novo. */
  retryTarget(targetId: string): Promise<void>;
  /** "JÁ VOLTO agora": liga/desliga o slate manual (pausa) — exige JÁ VOLTO armado na live. */
  setForceBrb(on: boolean): Promise<void>;
  subscribe(cb: (s: EngineSnapshot) => void): () => void;
  // Relatórios pós-live
  /** `t` só serve à demo do navegador, que semeia sessões de exemplo com copy. */
  listSessions(t: I18n["t"]): Promise<SessionMeta[]>;
  readSession(id: string): Promise<string>;
  readSessionBytes(id: string, chat?: boolean): Promise<ArrayBuffer>;
  /** NDJSON do chat gravado. String vazia = a sessão não gravou chat (o caso comum). */
  readSessionChat(id: string): Promise<string>;
  deleteSession(id: string): Promise<void>;
  openSessionsDir(): Promise<void>;
  // Gravação + replay
  /** Valida a pasta candidata (existe, é pasta, ESCREVE de verdade) e devolve os avisos. */
  recordCheckDir(dir: string): Promise<RecordDirCheck>;
  /** Diálogo nativo de pasta. `null` = cancelou (não é erro). */
  recordPickDir(): Promise<string | null>;
  /** Grava 5s de barras e devolve o caminho — valida o caminho inteiro antes do BORA. */
  recordTest(dir: string): Promise<string>;
  /** Sobe o gravador de novo NA MESMA live, depois de ele ter desistido. */
  recordRetry(): Promise<void>;
  /** Libera o arquivo no escopo do asset e devolve a URL que o `<video>` consome. */
  recordVideoUrl(path: string): Promise<string>;
  /** Ajuste manual de sincronia do replay, em ms (grampeado em ±30s no backend). */
  setSessionOffset(id: string, ms: number): Promise<void>;
  /** Apaga só os vídeos de uma sessão — relatório e chat ficam. */
  deleteSessionRecordings(id: string): Promise<void>;
  openRecordingFolder(): Promise<void>;
  /** Marca um instante durante o replay (o `t` é o momento assistido, não o do clique). */
  addSessionMarker(id: string, t: number, label: string): Promise<void>;
  /** Corta um trecho da gravação (cópia de bitstream). `null` = cancelou o diálogo. */
  exportClip(
    path: string,
    startMs: number,
    endMs: number,
  ): Promise<string | null>;
  /** Salva texto no arquivo que o usuário escolher. `false` = cancelou o diálogo. */
  saveTextFile(file: {
    name: string;
    label: string;
    ext: string;
    content: string;
  }): Promise<boolean>;
  // Chat unificado
  /** `t` só serve à demo do navegador, que inventa mensagens e alertas de exemplo. */
  chatStart(t: I18n["t"]): Promise<void>;
  chatStop(): Promise<void>;
  /** Há sessão de chat no ar? (pro popout nascer com o estado da janela principal.) */
  chatRunning(): Promise<boolean>;
  /** Estado "conectado" do chat sincronizado entre janelas (start/stop de qualquer webview). */
  subscribeChatRunning(cb: (running: boolean) => void): () => void;
  chatSend(text: string, sources?: string[]): Promise<void>;
  subscribeChatAuth(
    onAuth: (a: { source: string; login: string; ok: boolean }) => void,
  ): () => void;
  // OAuth (envio/moderação)
  setOauthConfig(c: {
    twitchClientId: string;
    googleClientId: string;
    kickClientId: string;
    setupApiUrl: string;
  }): Promise<void>;
  authStatus(): Promise<{
    twitchLogin: string | null;
    youtube: boolean;
    /** Existe algum caminho de login (oficial ou credenciais próprias). */
    youtubeConfigured: boolean;
    /** O fluxo oficial está pronto — sem isso, trocar de modo deixaria sem login. */
    youtubeOfficialReady: boolean;
    /** Há credenciais próprias guardadas no cofre (dá pra voltar sem redigitar). */
    youtubeOwnCreds: boolean;
    youtubeUsingOwnCreds: boolean;
    kick: boolean;
    kickConfigured: boolean;
    kickOfficialReady: boolean;
    kickOwnCreds: boolean;
    kickUsingOwnCreds: boolean;
    /** Por que o bootstrap da setup API não respondeu, quando falhou. */
    brokerError: string | null;
  }>;
  twitchLoginStart(): Promise<void>;
  twitchLogout(): Promise<void>;
  youtubeLoginStart(): Promise<void>;
  youtubeLogout(): Promise<void>;
  youtubeBroadcastRecoveryStatus(): Promise<"none" | "pending" | "unknown">;
  youtubeRetryBroadcastCleanup(): Promise<void>;
  youtubeAcknowledgeUnknownBroadcast(confirmed: boolean): Promise<void>;
  kickLoginStart(): Promise<void>;
  kickLogout(): Promise<void>;
  /** Atualiza título (+categoria onde dá) da live em todas as plataformas logadas. */
  setStreamInfo(
    title: string,
    category?: string,
  ): Promise<Record<string, { ok: boolean; error?: string; warn?: string }>>;
  /** BYOK: salva/limpa as credenciais do Google do próprio usuário (cofre). */
  setYoutubeOauth(clientId: string, clientSecret: string): Promise<void>;
  clearYoutubeOauth(): Promise<void>;
  /** Troca de modo sem apagar nada — rejeita se o outro modo não estiver disponível. */
  youtubeUseOfficial(): Promise<void>;
  youtubeUseOwnCreds(): Promise<void>;
  setKickOauth(clientId: string, clientSecret: string): Promise<void>;
  clearKickOauth(): Promise<void>;
  kickUseOfficial(): Promise<void>;
  kickUseOwnCreds(): Promise<void>;
  chatModerate(
    sourceId: string,
    action: string,
    opts?: {
      nativeId?: string;
      author?: string;
      authorId?: string;
      seconds?: number;
    },
  ): Promise<void>;
  subscribeAuthFlow(
    onAuth: (
      who: string,
      a: {
        state: string;
        userCode: string;
        verifyUri: string;
        verifyUriComplete?: string;
        login: string;
      },
    ) => void,
  ): () => void;
  openChatWindow(): Promise<void>;
  subscribeChat(
    onMsg: (m: ChatMessage) => void,
    onStatus: (s: ChatStatus) => void,
    onDelete: (d: ChatDelete) => void,
  ): () => void;
  subscribeAlerts(onAlert: (a: Alert) => void): () => void;
  alertsStart(): Promise<void>;
  alertsStop(): Promise<void>;
  subscribeAlertStatus(
    onStatus: (s: { source: string; status: string }) => void,
  ): () => void;
  subscribeViewers(onViewers: (v: Viewers) => void): () => void;
  // UX
  obsSetStream(start: boolean): Promise<void>;
  testTarget(targetId: string, t: I18n["t"]): Promise<string>;
  /** Verifica a API key do YouTube (Data API v3). Resolve com msg de ok; rejeita com o motivo. */
  youtubeKeyCheck(key: string, t: I18n["t"]): Promise<string>;
  /** Testa o token de uma fonte de alerta. Resolve com msg de ok; rejeita com o motivo. */
  alertTest(sourceId: string, t: I18n["t"]): Promise<string>;
  openLogsDir(): Promise<void>;
  exportDiagnostics(): Promise<boolean>;
  /** Consentimento mora em telemetry.json, separado da AppConfig/exportação. */
  telemetryStatus(): Promise<TelemetryStatus>;
  telemetrySetConsent(input: {
    usage: TelemetryChoice;
    crashReports: TelemetryChoice;
    noticeVersion: string;
  }): Promise<TelemetryStatus>;
  /** Troca o UUID depois de um pedido de exclusão; exige as duas finalidades desligadas. */
  telemetryRegenerateId(): Promise<TelemetryStatus>;
  registerShortcut(shortcut: string): Promise<void>;
  subscribeShortcut(cb: () => void): () => void;
  /** Avisos do gravador (disco cheio, retomada, pasta sumida). O `kind` é ASCII de
   *  protocolo — a tradução mora no dicionário. */
  subscribeRecorder(
    cb: (e: { kind: string; detail?: string | null }) => void,
  ): () => void;
  obsCheck(): Promise<ObsCheck>;
  obsAutoconfigure(): Promise<void>;
  markMoment(label?: string): Promise<void>;
  exportConfig(): Promise<boolean>;
  importConfig(): Promise<boolean>;
  saveBrbSlate(b64: string, generation?: string): Promise<void>;
  brbSlateNeedsRefresh(generation: string): Promise<boolean>;
  /** Escolhe imagem/vídeo como tela do "JÁ VOLTO". Devolve { kind, fileName } ou null se cancelou. */
  setBrbSlate(): Promise<{ kind: "image" | "video"; fileName: string } | null>;
  /** Volta a tela do "JÁ VOLTO" pro padrão gerado (apaga o custom). */
  clearBrbSlate(): Promise<void>;
  /** Miniatura (JPEG base64, sem prefixo data:) da tela do "JÁ VOLTO" atual; "" se indisponível. */
  getBrbSlatePreview(): Promise<string>;
  captureFrame(t: I18n["t"]): Promise<string>;
  // Guardião anti-vazamento
  subscribeGuardian(
    onLeak: (l: Leak) => void,
    onCensor: (on: boolean) => void,
  ): () => void;
  // Mesa (co-stream P2P): servidor local (HTTP + sinalização) + auto-fonte no OBS
  mesaStartServer(): Promise<MesaServerInfo>;
  mesaStopServer(): Promise<void>;
  mesaObsAddSource(url: string, width: number, height: number): Promise<void>;
  mesaObsRemoveSource(): Promise<void>;
  // Overlay de alertas pro OBS (servidor local + browser source)
  /** Sobe o servidor local do overlay e devolve a URL fixa pra colar no OBS. */
  overlayStart(): Promise<OverlayInfo>;
  overlayStop(): Promise<void>;
  /** Info do overlay agora (URL/porta) — null se estiver parado. */
  overlayStatus(): Promise<OverlayInfo | null>;
  /** Empurra um alerta de exemplo pro overlay (preview no OBS). */
  overlayTest(): Promise<void>;
  /** Empurra uma mensagem de chat de exemplo pro overlay de chat (preview no OBS). */
  overlayChatTest(): Promise<void>;
  /** Adiciona/atualiza um Browser Source do overlay na cena atual do OBS. */
  overlayObsAddSource(url: string): Promise<void>;
  openPrivacySettings(which: "camera" | "microphone"): Promise<void>;
}

export interface MesaServerInfo {
  /** Porta do servidor local (HTTP do estúdio + websocket de sinalização). */
  port: number;
  /** IPv4 da LAN (pra montar o convite que o convidado alcança). */
  lanIp: string;
}

export interface OverlayInfo {
  /** Porta do servidor local do overlay. */
  port: number;
  /** URL base do overlay de ALERTAS (sem query) pra colar no OBS como Browser Source. */
  url: string;
  /** URL base do overlay de CHAT (sem query). */
  chatUrl: string;
}
