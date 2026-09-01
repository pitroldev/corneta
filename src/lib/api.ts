// ============================================================
// Camada de acesso ao backend.
// - Dentro do Tauri: chama os commands em Rust e ouve eventos.
// - No navegador (pnpm dev): usa um simulador local (mock) para que a UI
//   seja totalmente navegável e demonstrável sem o backend.
//
// Alguns métodos recebem `t`: é o mock que precisa dele. As frases da demo
// (chat de exemplo, "demo: alcançável", sessão semeada) são copy e seguem o
// idioma — e como o módulo não é componente, o idioma entra por parâmetro, nunca
// por estado global (duas janelas, uma corrida). No Tauri o parâmetro é ignorado.
// ============================================================
import type { I18n, MessageKey } from "./i18n";
import type {
  Alert,
  AppConfig,
  ChatBadge,
  ChatDelete,
  ChatFragment,
  ChatMessage,
  ChatStatus,
  EncoderInfo,
  EngineSnapshot,
  Leak,
  ObsCheck,
  RecordDirCheck,
  SessionMeta,
  TargetStatus,
  Viewers,
} from "./types";
import { defaultConfig } from "./factory";
import { PLATFORMS } from "./platforms";
import {
  EMPTY_TELEMETRY_STATUS,
  TELEMETRY_NOTICE_VERSION,
  createTelemetryId,
  normalizeTelemetryStatus,
  type TelemetryChoice,
  type TelemetryStatus,
} from "./telemetry-schema";

export const IS_TAURI =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Espelha `commands::START_CANCELLED` (Rust). É CÓDIGO, não frase: o backend
 *  devolve isto quando a própria pessoa cancelou o início da live, e o front
 *  engole o toast de erro. Enquanto era a frase "Início cancelado.", traduzir o
 *  backend quebrava a comparação em silêncio — e o cancelamento voltava a
 *  aparecer como falha. Mudou de um lado? Muda do outro. */
export const START_CANCELLED = "corneta:start-cancelled";

/** O serde do Tauri não converte JSON float para inteiros Rust (`u64`/`i64`).
 *  Tempos vindos de `<video>` e de interpolação carregam frações de milissegundo,
 *  então a normalização precisa acontecer nesta última fronteira antes do IPC. */
function integerArg(value: number, name: string, unsigned = false): number {
  const rounded = Math.round(value);
  if (!Number.isSafeInteger(rounded) || (unsigned && rounded < 0)) {
    throw new TypeError(
      `${name} precisa ser um inteiro seguro${unsigned ? " não negativo" : ""}`,
    );
  }
  return rounded;
}

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

// ---------------------------------------------------------------------------
// Implementação real (Tauri)
// ---------------------------------------------------------------------------
function tauriApi(): CornetaApi {
  // Imports dinâmicos: só carregam dentro do Tauri.
  const core = () => import("@tauri-apps/api/core");
  const event = () => import("@tauri-apps/api/event");

  return {
    async getConfig() {
      const { invoke } = await core();
      return invoke<AppConfig>("get_config");
    },
    async saveConfig(config) {
      const { invoke } = await core();
      return invoke<AppConfig>("save_config", { config });
    },
    subscribeConfigChanged(cb) {
      let cancelled = false;
      let unlisten: (() => void) | null = null;
      void event().then(({ listen }) =>
        listen<AppConfig>("config://changed", (e) => cb(e.payload)).then((u) =>
          cancelled ? u() : (unlisten = u),
        ),
      );
      return () => {
        cancelled = true;
        unlisten?.();
        unlisten = null;
      };
    },
    async setKey(targetId, key) {
      const { invoke } = await core();
      await invoke("set_key", { targetId, key });
    },
    async clearKey(targetId) {
      const { invoke } = await core();
      await invoke("clear_key", { targetId });
    },
    async detectEncoders() {
      const { invoke } = await core();
      return invoke<EncoderInfo[]>("detect_encoders");
    },
    async testUpload() {
      const { invoke } = await core();
      return invoke<number>("test_upload");
    },
    async setAutostart(enabled) {
      const { invoke } = await core();
      await invoke("set_autostart", { enabled });
    },
    async start(operationId) {
      const { invoke } = await core();
      await invoke("start_engine", { operationId: operationId ?? null });
    },
    async stop(operationId) {
      const { invoke } = await core();
      await invoke("stop_engine", { operationId: operationId ?? null });
    },
    async setTargetPaused(targetId, paused) {
      const { invoke } = await core();
      await invoke("set_target_paused", { targetId, paused });
    },
    async retryTarget(targetId) {
      const { invoke } = await core();
      await invoke("retry_target", { targetId });
    },
    async setForceBrb(on) {
      const { invoke } = await core();
      await invoke("set_force_brb", { on });
    },
    subscribe(cb) {
      let cancelled = false;
      let unlisten: (() => void) | null = null;
      void event().then(({ listen }) =>
        listen<EngineSnapshot>("engine://status", (e) => cb(e.payload)).then(
          (u) => (cancelled ? u() : (unlisten = u)),
        ),
      );
      return () => {
        cancelled = true;
        unlisten?.();
        unlisten = null;
      };
    },
    async listSessions() {
      const { invoke } = await core();
      return invoke<SessionMeta[]>("list_sessions");
    },
    async readSession(id) {
      const { invoke } = await core();
      return invoke<string>("read_session", { id });
    },
    async saveTextFile(file) {
      const { invoke } = await core();
      return invoke<boolean>("save_text_file", file);
    },
    async readSessionChat(id) {
      const { invoke } = await core();
      return invoke<string>("read_session_chat", { id });
    },
    async deleteSession(id) {
      const { invoke } = await core();
      await invoke("delete_session", { id });
    },
    async openSessionsDir() {
      const { invoke } = await core();
      await invoke("open_sessions_dir");
    },
    async recordCheckDir(dir) {
      const { invoke } = await core();
      return invoke<RecordDirCheck>("record_check_dir", { dir });
    },
    async recordPickDir() {
      const { invoke } = await core();
      return (await invoke<string | null>("record_pick_dir")) ?? null;
    },
    async recordTest(dir) {
      const { invoke } = await core();
      return invoke<string>("record_test", { dir });
    },
    async recordRetry() {
      const { invoke } = await core();
      await invoke("record_retry");
    },
    async recordVideoUrl(path) {
      const { invoke, convertFileSrc } = await core();
      // Duas etapas de propósito: o Rust confere que o arquivo é NOSSO e o libera no
      // escopo; a URL é montada pelo próprio Tauri, que é quem sabe o escape do handler.
      await invoke("record_allow_file", { path });
      return convertFileSrc(path);
    },
    async setSessionOffset(id, ms) {
      const { invoke } = await core();
      await invoke("set_session_offset", { id, ms: integerArg(ms, "ms") });
    },
    async deleteSessionRecordings(id) {
      const { invoke } = await core();
      await invoke("delete_session_recordings", { id });
    },
    async openRecordingFolder() {
      const { invoke } = await core();
      await invoke("open_recording_folder");
    },
    async addSessionMarker(id, t, label) {
      const { invoke } = await core();
      await invoke("add_session_marker", {
        id,
        t: integerArg(t, "t", true),
        label,
      });
    },
    async exportClip(path, startMs, endMs) {
      const { invoke } = await core();
      return invoke<string | null>("export_clip", {
        path,
        startMs: integerArg(startMs, "startMs", true),
        endMs: integerArg(endMs, "endMs", true),
      });
    },
    async chatStart() {
      const { invoke } = await core();
      await invoke("chat_start");
    },
    async chatStop() {
      const { invoke } = await core();
      await invoke("chat_stop");
    },
    async chatRunning() {
      const { invoke } = await core();
      return invoke<boolean>("chat_running");
    },
    subscribeChatRunning(cb) {
      let cancelled = false;
      let unlisten: (() => void) | null = null;
      void event().then(({ listen }) =>
        listen<boolean>("chat://running", (e) => cb(e.payload)).then((u) =>
          cancelled ? u() : (unlisten = u),
        ),
      );
      return () => {
        cancelled = true;
        unlisten?.();
        unlisten = null;
      };
    },
    async chatSend(text, sources) {
      const { invoke } = await core();
      await invoke("chat_send", { text, sources: sources ?? null });
    },
    subscribeChatAuth(onAuth) {
      let cancelled = false;
      let unlisten: (() => void) | null = null;
      void event().then(({ listen }) =>
        listen<{ source: string; login: string; ok: boolean }>(
          "chat://auth",
          (e) => onAuth(e.payload),
        ).then((u) => (cancelled ? u() : (unlisten = u))),
      );
      return () => {
        cancelled = true;
        unlisten?.();
        unlisten = null;
      };
    },
    async setOauthConfig(c) {
      const { invoke } = await core();
      await invoke("set_oauth_config", c);
    },
    async authStatus() {
      const { invoke } = await core();
      return await invoke("auth_status");
    },
    async twitchLoginStart() {
      const { invoke } = await core();
      await invoke("twitch_login_start");
    },
    async twitchLogout() {
      const { invoke } = await core();
      await invoke("twitch_logout");
    },
    async youtubeLoginStart() {
      const { invoke } = await core();
      await invoke("youtube_login_start");
    },
    async youtubeLogout() {
      const { invoke } = await core();
      await invoke("youtube_logout");
    },
    async kickLoginStart() {
      const { invoke } = await core();
      await invoke("kick_login_start");
    },
    async kickLogout() {
      const { invoke } = await core();
      await invoke("kick_logout");
    },
    async setStreamInfo(title, category) {
      const { invoke } = await core();
      return await invoke("set_stream_info", {
        title,
        category: category ?? null,
      });
    },
    async setYoutubeOauth(clientId, clientSecret) {
      const { invoke } = await core();
      await invoke("set_youtube_oauth", { clientId, clientSecret });
    },
    async clearYoutubeOauth() {
      const { invoke } = await core();
      await invoke("clear_youtube_oauth");
    },
    async youtubeUseOfficial() {
      const { invoke } = await core();
      await invoke("youtube_use_official");
    },
    async youtubeUseOwnCreds() {
      const { invoke } = await core();
      await invoke("youtube_use_own_creds");
    },
    async setKickOauth(clientId, clientSecret) {
      const { invoke } = await core();
      await invoke("set_kick_oauth", { clientId, clientSecret });
    },
    async clearKickOauth() {
      const { invoke } = await core();
      await invoke("clear_kick_oauth");
    },
    async kickUseOfficial() {
      const { invoke } = await core();
      await invoke("kick_use_official");
    },
    async kickUseOwnCreds() {
      const { invoke } = await core();
      await invoke("kick_use_own_creds");
    },
    async chatModerate(sourceId, action, opts) {
      const { invoke } = await core();
      await invoke("chat_moderate", {
        sourceId,
        action,
        nativeId: opts?.nativeId ?? null,
        author: opts?.author ?? null,
        authorId: opts?.authorId ?? null,
        seconds: opts?.seconds ?? null,
      });
    },
    subscribeAuthFlow(onAuth) {
      let cancelled = false;
      const uns: Array<() => void> = [];
      const add = (u: () => void) => (cancelled ? u() : uns.push(u));
      type AuthPayload = {
        state: string;
        userCode: string;
        verifyUri: string;
        verifyUriComplete?: string;
        login: string;
      };
      void event().then(({ listen }) => {
        void listen<AuthPayload>("auth://twitch", (e) =>
          onAuth("twitch", e.payload),
        ).then(add);
        void listen<AuthPayload>("auth://youtube", (e) =>
          onAuth("youtube", e.payload),
        ).then(add);
        void listen<AuthPayload>("auth://kick", (e) =>
          onAuth("kick", e.payload),
        ).then(add);
      });
      return () => {
        cancelled = true;
        uns.forEach((u) => u());
        uns.length = 0;
      };
    },
    async openChatWindow() {
      const { invoke } = await core();
      await invoke("open_chat_window");
    },
    subscribeChat(onMsg, onStatus, onDelete) {
      // StrictMode (dev) monta→desmonta→monta. Como `listen` é async, o cleanup pode
      // rodar antes de resolver; o flag `cancelled` garante que ele desregistre mesmo
      // assim (senão sobram 2 listeners → mensagens duplicadas).
      let cancelled = false;
      const uns: Array<() => void> = [];
      const add = (u: () => void) => (cancelled ? u() : uns.push(u));
      void event().then(({ listen }) => {
        void listen<ChatMessage>("chat://message", (e) =>
          onMsg(e.payload),
        ).then(add);
        void listen<ChatStatus>("chat://status", (e) =>
          onStatus(e.payload),
        ).then(add);
        void listen<ChatDelete>("chat://delete", (e) =>
          onDelete(e.payload),
        ).then(add);
      });
      return () => {
        cancelled = true;
        uns.forEach((u) => u());
        uns.length = 0;
      };
    },
    subscribeAlerts(onAlert) {
      let cancelled = false;
      let unlisten: (() => void) | null = null;
      void event().then(({ listen }) =>
        listen<Alert>("alert://event", (e) => onAlert(e.payload)).then((u) =>
          cancelled ? u() : (unlisten = u),
        ),
      );
      return () => {
        cancelled = true;
        unlisten?.();
        unlisten = null;
      };
    },
    async alertsStart() {
      const { invoke } = await core();
      await invoke("alerts_start");
    },
    async alertsStop() {
      const { invoke } = await core();
      await invoke("alerts_stop");
    },
    subscribeAlertStatus(onStatus) {
      let cancelled = false;
      let unlisten: (() => void) | null = null;
      void event().then(({ listen }) =>
        listen<{ source: string; status: string }>("alert://status", (e) =>
          onStatus(e.payload),
        ).then((u) => (cancelled ? u() : (unlisten = u))),
      );
      return () => {
        cancelled = true;
        unlisten?.();
        unlisten = null;
      };
    },
    subscribeViewers(onViewers) {
      let cancelled = false;
      let unlisten: (() => void) | null = null;
      void event().then(({ listen }) =>
        listen<Viewers>("viewers://update", (e) => onViewers(e.payload)).then(
          (u) => (cancelled ? u() : (unlisten = u)),
        ),
      );
      return () => {
        cancelled = true;
        unlisten?.();
        unlisten = null;
      };
    },
    async obsSetStream(start) {
      const { invoke } = await core();
      await invoke("obs_set_stream", { start });
    },
    async testTarget(targetId) {
      const { invoke } = await core();
      return invoke<string>("test_target", { targetId });
    },
    async youtubeKeyCheck(key) {
      const { invoke } = await core();
      return invoke<string>("youtube_key_check", { key });
    },
    async alertTest(sourceId) {
      const { invoke } = await core();
      return invoke<string>("alert_test", { sourceId });
    },
    async openLogsDir() {
      const { invoke } = await core();
      await invoke("open_logs_dir");
    },
    async exportDiagnostics() {
      const { invoke } = await core();
      return invoke<boolean>("export_diagnostics");
    },
    async telemetryStatus() {
      const { invoke } = await core();
      return invoke<TelemetryStatus>("telemetry_status");
    },
    async telemetrySetConsent(input) {
      const { invoke } = await core();
      // O command Rust recebe um argumento nomeado `input`; Tauri não agrupa
      // automaticamente os campos do objeto interno.
      return invoke<TelemetryStatus>("telemetry_set_consent", { input });
    },
    async telemetryRegenerateId() {
      const { invoke } = await core();
      return invoke<TelemetryStatus>("telemetry_regenerate_id");
    },
    async registerShortcut(shortcut) {
      const { invoke } = await core();
      await invoke("register_shortcut", { shortcut });
    },
    subscribeRecorder(cb) {
      let cancelled = false;
      let unlisten: (() => void) | null = null;
      void event().then(({ listen }) =>
        listen<{ kind: string; detail?: string | null }>(
          "recorder://status",
          (e) => cb(e.payload),
        ).then((u) => (cancelled ? u() : (unlisten = u))),
      );
      return () => {
        cancelled = true;
        unlisten?.();
      };
    },
    subscribeShortcut(cb) {
      let cancelled = false;
      let unlisten: (() => void) | null = null;
      void event().then(({ listen }) =>
        listen("shortcut://toggle-live", () => cb()).then((u) =>
          cancelled ? u() : (unlisten = u),
        ),
      );
      return () => {
        cancelled = true;
        unlisten?.();
        unlisten = null;
      };
    },
    async obsCheck() {
      const { invoke } = await core();
      return invoke<ObsCheck>("obs_check");
    },
    async markMoment(label) {
      const { invoke } = await core();
      await invoke("mark_moment", { label: label ?? null });
    },
    async exportConfig() {
      const { invoke } = await core();
      return invoke<boolean>("export_config");
    },
    async importConfig() {
      const { invoke } = await core();
      return invoke<boolean>("import_config");
    },
    async saveBrbSlate(b64, generation) {
      const { invoke } = await core();
      await invoke("save_brb_slate", {
        data: b64,
        generation: generation ?? null,
      });
    },
    async brbSlateNeedsRefresh(generation) {
      const { invoke } = await core();
      return invoke<boolean>("brb_slate_needs_refresh", { generation });
    },
    async setBrbSlate() {
      const { invoke } = await core();
      return invoke<{ kind: "image" | "video"; fileName: string } | null>(
        "set_brb_slate",
      );
    },
    async clearBrbSlate() {
      const { invoke } = await core();
      await invoke("clear_brb_slate");
    },
    async getBrbSlatePreview() {
      const { invoke } = await core();
      return invoke<string>("get_brb_slate_preview");
    },
    async captureFrame() {
      const { invoke } = await core();
      return invoke<string>("capture_frame");
    },
    subscribeGuardian(onLeak, onCensor) {
      let cancelled = false;
      const uns: Array<() => void> = [];
      const add = (u: () => void) => (cancelled ? u() : uns.push(u));
      void event().then(({ listen }) => {
        void listen<Leak>("leak://alert", (e) => onLeak(e.payload)).then(add);
        void listen<boolean>("leak://censor", (e) => onCensor(e.payload)).then(
          add,
        );
      });
      return () => {
        cancelled = true;
        uns.forEach((u) => u());
        uns.length = 0;
      };
    },
    async mesaStartServer() {
      const { invoke } = await core();
      return invoke<MesaServerInfo>("mesa_start_server");
    },
    async mesaStopServer() {
      const { invoke } = await core();
      await invoke("mesa_stop_server");
    },
    async mesaObsAddSource(url, width, height) {
      const { invoke } = await core();
      await invoke("mesa_obs_add_source", { url, width, height });
    },
    async mesaObsRemoveSource() {
      const { invoke } = await core();
      await invoke("mesa_obs_remove_source");
    },
    async overlayStart() {
      const { invoke } = await core();
      return invoke<OverlayInfo>("overlay_start");
    },
    async overlayStop() {
      const { invoke } = await core();
      await invoke("overlay_stop");
    },
    async overlayStatus() {
      const { invoke } = await core();
      return invoke<OverlayInfo | null>("overlay_status");
    },
    async overlayTest() {
      const { invoke } = await core();
      await invoke("overlay_test");
    },
    async overlayChatTest() {
      const { invoke } = await core();
      await invoke("overlay_chat_test");
    },
    async overlayObsAddSource(url) {
      const { invoke } = await core();
      await invoke("overlay_obs_add_source", { url });
    },
    async openPrivacySettings(which) {
      const { invoke } = await core();
      await invoke("open_privacy_settings", { which });
    },
  };
}

// ---------------------------------------------------------------------------
// Implementação mock (navegador) — simula motor e cofre via localStorage
// ---------------------------------------------------------------------------
function mockApi(): CornetaApi {
  const CONFIG_KEY = "corneta.config";
  const VAULT_KEY = "corneta.vault";
  const TELEMETRY_KEY = "corneta.telemetry.v1";

  const loadVault = (): Record<string, string> => {
    try {
      return JSON.parse(localStorage.getItem(VAULT_KEY) || "{}");
    } catch {
      return {};
    }
  };
  const saveVault = (v: Record<string, string>) =>
    localStorage.setItem(VAULT_KEY, JSON.stringify(v));

  const loadTelemetry = (): TelemetryStatus => {
    try {
      return normalizeTelemetryStatus(
        JSON.parse(localStorage.getItem(TELEMETRY_KEY) || "null"),
      );
    } catch {
      return EMPTY_TELEMETRY_STATUS;
    }
  };
  const saveTelemetry = (value: TelemetryStatus): TelemetryStatus => {
    localStorage.setItem(TELEMETRY_KEY, JSON.stringify(value));
    return value;
  };

  const loadConfig = (): AppConfig => {
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AppConfig>;
        return {
          ...defaultConfig(),
          ...parsed,
          schemaVersion: 1,
          revision: Number.isSafeInteger(parsed.revision)
            ? Number(parsed.revision)
            : 0,
        };
      }
    } catch {
      /* ignore */
    }
    const cfg = defaultConfig();
    localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
    return cfg;
  };

  // --- sessões (relatório pós-live) ---
  const SESSIONS_KEY = "corneta.sessions";
  const loadSessions = (): Record<string, string> => {
    try {
      return JSON.parse(localStorage.getItem(SESSIONS_KEY) || "{}");
    } catch {
      return {};
    }
  };
  const saveSessions = (m: Record<string, string>) =>
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(m));

  // Gera uma sessão sintética (demo), com opção de janela problemática.
  const genSession = (
    startedAt: number,
    mins: number,
    plats: { id: string; name: string; platformId: string }[],
    t: I18n["t"],
    opts?: { dropAtMin?: number; dropIdx?: number; highCpu?: boolean },
  ): string => {
    const meta = {
      kind: "meta",
      id: String(startedAt),
      startedAt,
      mode: "per-platform",
      platforms: plats,
    };
    const lines = [JSON.stringify(meta)];
    const step = 2000;
    const n = Math.round((mins * 60 * 1000) / step);
    const base = [6000, 9000, 6000, 4500];
    const drops = plats.map(() => 0);
    const raidAtMin = Math.min(mins * 0.35, 11);
    const raidViewers = 90 + Math.floor(Math.random() * 110);
    const vbase = plats.map((p) => (p.platformId === "youtube" ? 70 : 280));
    for (let k = 0; k < n; k++) {
      const t = startedAt + k * step;
      const minNow = (k * step) / 60000;
      let cpu = 46 + Math.sin(k / 9) * 7 + Math.random() * 5;
      const gpu = 32 + Math.sin(k / 7) * 6 + Math.random() * 4;
      const targets = plats.map((p, i) => {
        let bitrate = Math.round(
          base[i % base.length] * (0.96 + Math.random() * 0.07),
        );
        let state = "live";
        const isDrop =
          opts?.dropAtMin != null &&
          Math.abs(minNow - opts.dropAtMin) < 0.18 &&
          i === (opts.dropIdx ?? 0);
        if (isDrop) {
          bitrate = Math.round(base[i % base.length] * 0.3);
          state = "reconnecting";
          drops[i] += 25;
          if (opts?.highCpu) cpu = 97;
        }
        return {
          id: p.id,
          name: p.name,
          state,
          bitrate,
          fps: 60,
          dropped: drops[i],
        };
      });
      const incident =
        opts?.dropAtMin != null && Math.abs(minNow - opts.dropAtMin) < 0.18;
      const obs = {
        activeFps: 60,
        avgRenderMs: incident ? 28 + Math.random() * 5 : 7 + Math.random() * 3,
        renderSkipped: incident ? 40 : 0,
        outputSkipped: incident ? 30 : 0,
        congestion: incident ? 0.6 + Math.random() * 0.2 : Math.random() * 0.06,
      };
      const nearRaid = Math.abs(minNow - raidAtMin) < 0.5;
      let chat = Math.round(5 + Math.sin(k / 11) * 2 + Math.random() * 4);
      if (nearRaid) chat += 18;
      if (Math.random() < 0.015) chat += 14;
      // Reparte o chat entre os canais: a primeira plataforma fala mais que as outras,
      // que é o formato que o relatório por canal precisa exercitar.
      const chatBy: Record<string, number> = {};
      let left = chat;
      plats.forEach((p, i) => {
        const share =
          i === plats.length - 1
            ? left
            : Math.round(chat * (i === 0 ? 0.62 : 0.38 / (plats.length - 1)));
        left -= share;
        if (share > 0) chatBy[`${p.platformId}:${p.name}`] = share;
      });
      lines.push(
        JSON.stringify({
          kind: "sample",
          t,
          cpu: Math.round(cpu * 10) / 10,
          gpu: Math.round(gpu * 10) / 10,
          obs,
          chat,
          ...(Object.keys(chatBy).length ? { chatBy } : {}),
          targets,
        }),
      );
      if (k % 15 === 0) {
        const ramp = Math.min(1, minNow / 5);
        const items = plats.map((p, i) => {
          let v = Math.round(vbase[i] * ramp * (0.9 + Math.random() * 0.15));
          if (minNow >= raidAtMin) v += Math.round(raidViewers / plats.length);
          return { platform: p.platformId, source: p.name, viewers: v };
        });
        const total = items.reduce((acc, x) => acc + (x.viewers ?? 0), 0);
        lines.push(JSON.stringify({ kind: "viewers", t, total, items }));
        // Contador de seguidores: só Twitch e Kick expõem (o YouTube arredonda), e o
        // total é absoluto — o relatório tira o ganho da diferença ponta a ponta.
        const seg = plats
          .filter((p) => p.platformId === "twitch" || p.platformId === "kick")
          .map((p) => ({
            platform: p.platformId,
            source: p.name,
            total: 12480 + Math.round(minNow * 1.7),
          }));
        if (seg.length)
          lines.push(JSON.stringify({ kind: "followers", t, items: seg }));
      }
    }
    // Alertas de exemplo: raid (pico), subs/membros espalhados, gift bomb e bits.
    const at = (mm: number) => startedAt + mm * 60000;
    lines.push(
      JSON.stringify({
        kind: "alert",
        t: at(raidAtMin),
        platform: plats[0].platformId,
        source: plats[0].name,
        alertKind: "raid",
        user: "raid_demo",
        amount: raidViewers,
      }),
    );
    ["sub", "resub", "sub", "member", "resub"].forEach((kd, idx) => {
      const mm = 3 + idx * 6;
      if (mm < mins)
        lines.push(
          JSON.stringify({
            kind: "alert",
            t: at(mm),
            platform: plats[idx % plats.length].platformId,
            source: plats[idx % plats.length].name,
            alertKind: kd,
            user: [
              "viewer_demo_01",
              "viewer_demo_02",
              "viewer_demo_03",
              "viewer_demo_04",
              "viewer_demo_05",
            ][idx],
            amount: kd === "resub" ? 2 + idx : 1,
          }),
        );
    });
    lines.push(
      JSON.stringify({
        kind: "alert",
        t: at(Math.min(mins * 0.55, 16)),
        platform: plats[0].platformId,
        source: plats[0].name,
        alertKind: "subgift",
        user: "Patrocinador",
        amount: 10,
      }),
    );
    lines.push(
      JSON.stringify({
        kind: "alert",
        t: at(Math.min(mins * 0.28, 8)),
        platform: plats[0].platformId,
        source: plats[0].name,
        alertKind: "bits",
        user: "fa_numero_1",
        amount: 1000,
      }),
    );
    if (opts?.dropAtMin != null) {
      lines.push(
        JSON.stringify({
          kind: "marker",
          t: startedAt + opts.dropAtMin * 60000,
          label: t("core.mock.marker.twitchDropped"),
        }),
      );
    }
    lines.push(JSON.stringify({ kind: "end", endedAt: startedAt + n * step }));
    return lines.join("\n");
  };

  const seedSessions = (t: I18n["t"]) => {
    const m = loadSessions();
    if (Object.keys(m).length > 0) return;
    const tw = { id: "t1", name: "Twitch", platformId: "twitch" };
    const yt = { id: "y1", name: "YouTube", platformId: "youtube" };
    const a = Date.now() - 26 * 3600 * 1000;
    const b = Date.now() - 3 * 3600 * 1000;
    m[String(a)] = genSession(a, 35, [tw, yt], t); // sem incidentes
    m[String(b)] = genSession(b, 48, [tw, yt], t, {
      dropAtMin: 23,
      dropIdx: 0,
      highCpu: true,
    }); // com incidente
    saveSessions(m);
  };

  // --- simulador do motor ---
  let snapshot: EngineSnapshot = {
    state: "stopped",
    startedAt: null,
    targets: {},
  };
  const listeners = new Set<(s: EngineSnapshot) => void>();
  let timer: ReturnType<typeof setInterval> | null = null;
  // Gravação da sessão demo em andamento.
  let rec: { id: string; lines: string[] } | null = null;
  // Destinos pausados (controle ao vivo).
  const pausedTargets = new Set<string>();

  // --- chat demo ---
  const chatMsgListeners = new Set<(m: ChatMessage) => void>();
  const chatStatusListeners = new Set<(s: ChatStatus) => void>();
  const chatDeleteListeners = new Set<(d: ChatDelete) => void>();
  const alertListeners = new Set<(a: Alert) => void>();
  let alertSeq = 0;
  const viewerListeners = new Set<(v: Viewers) => void>();
  let viewerTimer: ReturnType<typeof setInterval> | null = null;
  let chatTimer: ReturnType<typeof setInterval> | null = null;
  let chatSeq = 0;
  const recentIds: { nativeId: string; platform: string }[] = [];
  const ALERT_SOURCES = [
    { platform: "twitch" as const, source: "Twitch Demo" },
    { platform: "kick" as const, source: "Kick Demo" },
    { platform: "youtube" as const, source: "YouTube Demo" },
  ];
  const ALERT_USERS = [
    "viewer_demo_01",
    "viewer_demo_02",
    "viewer_demo_03",
    "viewer_demo_04",
    "viewer_demo_05",
    "viewer_demo_06",
  ];
  const randomAlert = (seq: number, t: I18n["t"]): Alert => {
    const src = ALERT_SOURCES[Math.floor(Math.random() * ALERT_SOURCES.length)];
    const user = ALERT_USERS[Math.floor(Math.random() * ALERT_USERS.length)];
    const kinds: Alert["kind"][] = [
      "sub",
      "resub",
      "subgift",
      "bits",
      "raid",
      "member",
      "superchat",
    ];
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
    const base: Alert = {
      id: `a${seq}-${Date.now()}`,
      platform: src.platform,
      source: src.source,
      kind,
      user,
      ts: Date.now(),
    };
    switch (kind) {
      case "bits":
        return { ...base, amount: pick([100, 500, 1000]) };
      case "resub":
        return {
          ...base,
          amount: 1 + Math.floor(Math.random() * 24),
          tier: "T1",
          message: t("core.mock.alert.resub.message"),
        };
      case "sub":
        return { ...base, tier: "T1" };
      case "subgift":
        return { ...base, amount: pick([1, 5, 10]) };
      case "raid":
        return { ...base, amount: 10 + Math.floor(Math.random() * 200) };
      case "member":
        return {
          ...base,
          // Rótulo exibido no card (ao contrário do "T1", que é código de tier).
          tier: t("core.mock.alert.tier.member"),
          amount: 1 + Math.floor(Math.random() * 12),
        };
      case "superchat":
        return {
          ...base,
          amount: pick([5, 10, 50]),
          currency: "BRL",
          message: t("core.mock.alert.superchat.message"),
        };
      default:
        return base;
    }
  };
  const CHAT_MSG_KEYS: MessageKey[] = [
    "core.mock.chat.msg.1",
    "core.mock.chat.msg.2",
    "core.mock.chat.msg.3",
    "core.mock.chat.msg.4",
    "core.mock.chat.msg.5",
    "core.mock.chat.msg.6",
    "core.mock.chat.msg.7",
    "core.mock.chat.msg.8",
    "core.mock.chat.msg.9",
    "core.mock.chat.msg.10",
    "core.mock.chat.msg.11",
    "core.mock.chat.msg.12",
    "core.mock.chat.msg.13",
    "core.mock.chat.msg.14",
  ];

  const emit = () => listeners.forEach((l) => l(structuredClone(snapshot)));

  const tick = () => {
    const now = Date.now();
    // Demo: depois de "ouvir" um instante, o "OBS conecta" e entra no ar.
    if (snapshot.state === "starting") {
      snapshot.ingestLive = true;
      snapshot.state = "live";
    }
    for (const st of Object.values(snapshot.targets)) {
      if (pausedTargets.has(st.targetId)) continue; // pausado: mantém o estado
      if (st.state === "connecting") {
        st.state = "live";
      } else if (st.state === "live") {
        // pequena flutuação ao redor do alvo
        const jitter = (Math.random() - 0.5) * 0.06;
        st.bitrateKbps = Math.max(0, Math.round(st.bitrateKbps * (1 + jitter)));
        st.fps = 30 + Math.round(Math.random() * 30);
        if (Math.random() < 0.04)
          st.droppedFrames += Math.round(Math.random() * 3);
      }
      st.uptimeSec = snapshot.startedAt ? (now - snapshot.startedAt) / 1000 : 0;
    }
    snapshot.cpu = Math.round((30 + Math.random() * 40) * 10) / 10;
    snapshot.gpu = Math.round((20 + Math.random() * 30) * 10) / 10;
    snapshot.obs = {
      activeFps: 60,
      avgRenderMs: Math.round((7 + Math.random() * 4) * 10) / 10,
      renderSkipped: 0,
      outputSkipped: 0,
      congestion: Math.round(Math.random() * 8) / 100,
    };
    if (rec) {
      rec.lines.push(
        JSON.stringify({
          kind: "sample",
          t: now,
          cpu: snapshot.cpu,
          gpu: snapshot.gpu,
          obs: snapshot.obs,
          targets: Object.values(snapshot.targets).map((s) => ({
            id: s.targetId,
            name: s.name,
            state: s.state,
            bitrate: s.bitrateKbps,
            fps: s.fps,
            dropped: s.droppedFrames,
          })),
        }),
      );
    }
    emit();
  };

  return {
    async getConfig() {
      return loadConfig();
    },
    async saveConfig(config) {
      const saved = { ...config, revision: config.revision + 1 };
      localStorage.setItem(CONFIG_KEY, JSON.stringify(saved));
      return saved;
    },
    subscribeConfigChanged() {
      // Navegador = uma janela só; não há outra webview pra sincronizar.
      return () => {};
    },
    async setKey(targetId, key) {
      const v = loadVault();
      v[targetId] = key;
      saveVault(v);
    },
    async clearKey(targetId) {
      const v = loadVault();
      delete v[targetId];
      saveVault(v);
    },
    async detectEncoders() {
      return [
        {
          kind: "nvenc",
          label: "NVIDIA NVENC",
          available: true,
          maxSessions: 8,
        },
        { kind: "qsv", label: "Intel Quick Sync", available: false },
        { kind: "amf", label: "AMD AMF", available: false },
        {
          kind: "software",
          label: "Software (x264)",
          available: true,
          maxSessions: 1,
        },
      ];
    },
    async testUpload() {
      // simula um teste: ~25–60 Mbps
      return Math.round(25 + Math.random() * 35);
    },
    async setAutostart() {
      // no-op no navegador (sem SO pra registrar autostart)
    },
    async start(_operationId) {
      const cfg = loadConfig();
      pausedTargets.clear();
      const targets: Record<string, TargetStatus> = {};
      for (const t of cfg.targets.filter((x) => x.enabled)) {
        const target =
          t.encoding.preset?.videoBitrateKbps ??
          PLATFORMS[t.platformId].recommended.videoBitrateKbps;
        targets[t.id] = {
          targetId: t.id,
          name: t.name,
          state: "connecting",
          bitrateKbps: target,
          fps: 60,
          droppedFrames: 0,
          uptimeSec: 0,
        };
      }
      snapshot = {
        state: "starting",
        startedAt: Date.now(),
        ingestLive: false,
        targets,
      };
      const sid = String(snapshot.startedAt);
      const plats = cfg.targets
        .filter((x) => x.enabled)
        .map((t) => ({ id: t.id, name: t.name, platformId: t.platformId }));
      rec = {
        id: sid,
        lines: [
          JSON.stringify({
            kind: "meta",
            id: sid,
            startedAt: snapshot.startedAt,
            mode: cfg.mode,
            platforms: plats,
          }),
        ],
      };
      emit();
      if (timer) clearInterval(timer);
      timer = setInterval(tick, 1000);
    },
    async stop(_operationId) {
      if (timer) clearInterval(timer);
      timer = null;
      if (rec) {
        rec.lines.push(JSON.stringify({ kind: "end", endedAt: Date.now() }));
        const m = loadSessions();
        m[rec.id] = rec.lines.join("\n");
        saveSessions(m);
        rec = null;
      }
      pausedTargets.clear();
      snapshot = {
        state: "stopped",
        startedAt: null,
        ingestLive: false,
        targets: {},
      };
      emit();
    },
    async setTargetPaused(targetId, paused) {
      if (paused) pausedTargets.add(targetId);
      else pausedTargets.delete(targetId);
      const st = snapshot.targets[targetId];
      if (st) st.state = paused ? "paused" : "connecting";
      emit();
    },
    async retryTarget(targetId) {
      const st = snapshot.targets[targetId];
      if (st) {
        st.state = "connecting";
        st.message = undefined;
      }
      emit();
    },
    async setForceBrb(on) {
      snapshot.forcedBrb = on;
      for (const st of Object.values(snapshot.targets)) {
        if (st.state === "live" || st.state === "brb")
          st.state = on ? "brb" : "live";
      }
      emit();
    },
    subscribe(cb) {
      listeners.add(cb);
      cb(structuredClone(snapshot));
      return () => listeners.delete(cb);
    },
    async listSessions(t) {
      seedSessions(t);
      const m = loadSessions();
      const out: SessionMeta[] = [];
      for (const [id, ndjson] of Object.entries(m)) {
        const lines = ndjson.trim().split("\n");
        let meta: {
          kind?: string;
          startedAt?: number;
          mode?: string;
          platforms?: unknown;
        };
        try {
          meta = JSON.parse(lines[0]);
        } catch {
          continue;
        }
        if (meta?.kind !== "meta") continue;
        const startedAt = meta.startedAt ?? 0;
        let endedAt = startedAt;
        try {
          const last = JSON.parse(lines[lines.length - 1]);
          endedAt = last.kind === "end" ? last.endedAt : (last.t ?? startedAt);
        } catch {
          /* ignore */
        }
        out.push({
          id,
          startedAt,
          endedAt,
          durationSec: Math.max(0, Math.round((endedAt - startedAt) / 1000)),
          mode: (meta.mode ?? "per-platform") as SessionMeta["mode"],
          platforms: (meta.platforms ?? []) as SessionMeta["platforms"],
        });
      }
      out.sort((a, b) => b.startedAt - a.startedAt);
      return out;
    },
    async readSession(id) {
      return loadSessions()[id] ?? "";
    },
    // No navegador não existe diálogo nativo: cai no download do próprio browser,
    // que escolhe a pasta de Downloads. Sempre "salvou" — não há como cancelar.
    async saveTextFile({ name, content }) {
      const url = URL.createObjectURL(
        new Blob([content], { type: "text/plain;charset=utf-8" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      return true;
    },
    async deleteSession(id) {
      const m = loadSessions();
      delete m[id];
      saveSessions(m);
    },
    async openSessionsDir() {
      // No navegador não há pasta de sessões (no app, abre o explorador de arquivos).
    },
    // Gravação não existe na demo do navegador: não há FFmpeg, não há disco e não há
    // protocolo de asset. Os stubs devolvem "nada gravado" em vez de lançar — assim a
    // tela de relatório abre igual, só sem a aba de replay.
    async readSessionChat() {
      return "";
    },
    async recordCheckDir() {
      return {
        ok: true,
        freeBytes: 231 * 1024 ** 3,
        lowSpace: false,
        removableOrNetwork: false,
        longPath: false,
      };
    },
    async recordPickDir() {
      return null;
    },
    async recordTest() {
      throw new Error("sem gravação no navegador");
    },
    async recordRetry() {
      throw new Error("sem gravação no navegador");
    },
    async recordVideoUrl() {
      throw new Error("sem gravação no navegador");
    },
    async setSessionOffset() {},
    async deleteSessionRecordings() {},
    async openRecordingFolder() {},
    async addSessionMarker() {},
    async exportClip() {
      return null;
    },
    async chatStart(t) {
      // Frases da demo resolvidas UMA vez por conexão (o timer roda a cada 1,1 s).
      const chatMsgs = CHAT_MSG_KEYS.map((k) => t(k));
      const SOURCES = [
        { platform: "twitch", name: "Twitch Demo A" },
        { platform: "twitch", name: "Twitch Demo B" },
        { platform: "kick", name: "Kick Demo" },
        { platform: "youtube", name: "YouTube Demo" },
      ] as const;
      SOURCES.forEach((src) =>
        chatStatusListeners.forEach((l) =>
          l({ platform: src.platform, source: src.name, status: "connected" }),
        ),
      );
      // Viewers simulados (oscilam ao redor de uma base por canal).
      const VBASE: Record<string, number> = {
        "Twitch Demo A": 820,
        "Twitch Demo B": 4200,
        "Kick Demo": 1500,
        "YouTube Demo": 300,
      };
      const emitViewers = () => {
        const items = SOURCES.map((s) => {
          const base = VBASE[s.name] ?? 100;
          const viewers = Math.max(
            0,
            Math.round(base * (0.9 + Math.random() * 0.2)),
          );
          return { platform: s.platform, source: s.name, viewers, live: true };
        });
        const total = items.reduce((a, b) => a + (b.viewers ?? 0), 0);
        viewerListeners.forEach((l) => l({ total, anyLive: true, items }));
      };
      emitViewers();
      if (viewerTimer) clearInterval(viewerTimer);
      viewerTimer = setInterval(emitViewers, 4000);
      if (chatTimer) clearInterval(chatTimer);
      const AUTHORS = {
        twitch: [
          "viewer_twitch_01",
          "viewer_twitch_02",
          "viewer_twitch_03",
          "viewer_twitch_04",
        ],
        kick: [
          "viewer_kick_01",
          "viewer_kick_02",
          "viewer_kick_03",
          "viewer_kick_04",
        ],
        youtube: [
          "viewer_youtube_01",
          "viewer_youtube_02",
          "viewer_youtube_03",
          "viewer_youtube_04",
        ],
      };
      const COLORS = ["#ff5a36", "#7c9cff", "#34d399", "#f5a524", "#e879f9"];
      chatTimer = setInterval(() => {
        // Demonstra o fluxo de deleção de vez em quando.
        if (recentIds.length > 8 && Math.random() < 0.08) {
          const r = recentIds[Math.floor(Math.random() * recentIds.length)];
          chatDeleteListeners.forEach((l) =>
            l({ scope: "message", platform: r.platform, nativeId: r.nativeId }),
          );
        }
        // De vez em quando, dispara um alerta de exemplo.
        if (Math.random() < 0.12) {
          const a = randomAlert(++alertSeq, t);
          alertListeners.forEach((l) => l(a));
        }
        const src = SOURCES[Math.floor(Math.random() * SOURCES.length)];
        const platform = src.platform;
        const text = chatMsgs[Math.floor(Math.random() * chatMsgs.length)];
        const fragments: ChatFragment[] = [{ kind: "text", text: `${text} ` }];
        if (Math.random() < 0.4) {
          if (platform === "twitch")
            fragments.push({
              kind: "emote",
              text: "Kappa",
              url: "https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/1.0",
            });
          else if (platform === "kick")
            fragments.push({
              kind: "emote",
              text: "emote",
              url: "https://files.kick.com/emotes/37236/fullsize",
            });
          else fragments[0] = { kind: "text", text: `${text} 🎉🔥` };
        }
        const badges: ChatBadge[] = [];
        const br = Math.random();
        if (br < 0.15) badges.push({ label: "MOD", kind: "moderator" });
        else if (br < 0.4) badges.push({ label: "SUB", kind: "subscriber" });
        const nativeId = `n${++chatSeq}`;
        recentIds.push({ nativeId, platform });
        if (recentIds.length > 40) recentIds.shift();
        const pool = AUTHORS[platform];
        chatMsgListeners.forEach((l) =>
          l({
            id: `${chatSeq}-${Date.now()}`,
            platform,
            source: src.name,
            author: pool[Math.floor(Math.random() * pool.length)],
            nativeId,
            color:
              platform === "youtube"
                ? undefined
                : COLORS[Math.floor(Math.random() * COLORS.length)],
            text,
            fragments,
            badges,
            ts: Date.now(),
          }),
        );
      }, 1100);
    },
    async chatStop() {
      if (chatTimer) clearInterval(chatTimer);
      chatTimer = null;
      if (viewerTimer) clearInterval(viewerTimer);
      viewerTimer = null;
      viewerListeners.forEach((l) =>
        l({ total: 0, anyLive: false, items: [] }),
      );
    },
    async chatRunning() {
      return chatTimer != null;
    },
    subscribeChatRunning() {
      // Navegador = uma janela só; nada pra sincronizar entre webviews.
      return () => {};
    },
    async openChatWindow() {
      // No navegador não dá pra abrir janela nativa (no app instalado, abre a flutuante).
    },
    async chatSend(text) {
      // Demo: ecoa local pra UI funcionar no navegador.
      //
      // NÃO TRADUZIR "você" aqui sozinho: a ChatScreen compara `m.author === "você"`
      // pra não deixar você moderar a própria mensagem. Os dois lados são um par —
      // trocar um só destrava a moderação do próprio eco. Chave pronta no
      // dicionário: core.mock.chat.self.
      chatMsgListeners.forEach((l) =>
        l({
          id: `me-${Date.now()}`,
          platform: "twitch",
          source: "você",
          author: "você",
          color: "#ffb323",
          text,
          fragments: [{ kind: "text", text }],
          badges: [],
          ts: Date.now(),
        }),
      );
    },
    subscribeChatAuth() {
      return () => {};
    },
    async setOauthConfig() {},
    async authStatus() {
      return {
        twitchLogin: null,
        youtube: false,
        youtubeConfigured: false,
        youtubeOfficialReady: false,
        youtubeOwnCreds: false,
        youtubeUsingOwnCreds: false,
        kick: false,
        kickConfigured: false,
        kickOfficialReady: false,
        kickOwnCreds: false,
        kickUsingOwnCreds: false,
        brokerError: null,
      };
    },
    async twitchLoginStart() {},
    async twitchLogout() {},
    async youtubeLoginStart() {},
    async youtubeLogout() {},
    async kickLoginStart() {},
    async kickLogout() {},
    async setStreamInfo() {
      return {};
    },
    async setYoutubeOauth() {},
    async clearYoutubeOauth() {},
    async youtubeUseOfficial() {},
    async youtubeUseOwnCreds() {},
    async setKickOauth() {},
    async clearKickOauth() {},
    async kickUseOfficial() {},
    async kickUseOwnCreds() {},
    async chatModerate() {},
    subscribeAuthFlow() {
      return () => {};
    },
    subscribeChat(onMsg, onStatus, onDelete) {
      chatMsgListeners.add(onMsg);
      chatStatusListeners.add(onStatus);
      chatDeleteListeners.add(onDelete);
      return () => {
        chatMsgListeners.delete(onMsg);
        chatStatusListeners.delete(onStatus);
        chatDeleteListeners.delete(onDelete);
      };
    },
    subscribeAlerts(onAlert) {
      alertListeners.add(onAlert);
      return () => alertListeners.delete(onAlert);
    },
    async alertsStart() {},
    async alertsStop() {},
    subscribeAlertStatus() {
      return () => {};
    },
    subscribeViewers(onViewers) {
      viewerListeners.add(onViewers);
      return () => viewerListeners.delete(onViewers);
    },
    async obsSetStream() {
      // no-op no navegador (sem OBS).
    },
    async testTarget(_targetId, t) {
      return t("core.mock.target.test.ok");
    },
    async youtubeKeyCheck(_key, t) {
      return t("core.mock.youtubeKey.ok");
    },
    async alertTest(_sourceId, t) {
      return t("core.mock.alertToken.ok");
    },
    async openLogsDir() {
      // no-op no navegador.
    },
    async exportDiagnostics() {
      return true;
    },
    async telemetryStatus() {
      return loadTelemetry();
    },
    async telemetrySetConsent(input) {
      const previous = loadTelemetry();
      const needsId =
        input.usage === "enabled" || input.crashReports === "enabled";
      return saveTelemetry({
        schemaVersion: 1,
        noticeVersion: TELEMETRY_NOTICE_VERSION,
        usage: input.usage,
        crashReports: input.crashReports,
        installationId:
          previous.installationId ?? (needsId ? createTelemetryId() : null),
        decidedAt: new Date().toISOString(),
      });
    },
    async telemetryRegenerateId() {
      const previous = loadTelemetry();
      if (previous.usage === "enabled" || previous.crashReports === "enabled")
        throw new Error("telemetry_disable_before_regenerate");
      return saveTelemetry({
        ...previous,
        installationId: null,
        decidedAt: new Date().toISOString(),
      });
    },
    async registerShortcut() {
      // no-op no navegador (atalho global é do SO).
    },
    subscribeRecorder() {
      return () => {};
    },
    subscribeShortcut() {
      return () => {};
    },
    async obsCheck() {
      return {
        reachable: true,
        pointingAtCorneta: true,
        width: 1920,
        height: 1080,
        fps: 60,
      };
    },
    async markMoment() {
      // no-op no navegador (sem sessão real gravando)
    },
    async exportConfig() {
      return false;
    },
    async importConfig() {
      return false;
    },
    async saveBrbSlate() {
      // no-op no navegador (sem backend pra salvar o slate)
    },
    async brbSlateNeedsRefresh() {
      return false;
    },
    async setBrbSlate() {
      // no-op no navegador (sem seletor de arquivo nativo)
      console.log("[mock] setBrbSlate: sem seletor de arquivo no navegador");
      return null;
    },
    async clearBrbSlate() {
      // no-op no navegador
    },
    async getBrbSlatePreview() {
      return "";
    },
    async captureFrame(t) {
      throw new Error(t("core.mock.captureFrame.unavailable"));
    },
    subscribeGuardian() {
      return () => {};
    },
    // Mesa: sem backend no navegador — a conexão real só roda no app instalado.
    async mesaStartServer() {
      return { port: 0, lanIp: "127.0.0.1" };
    },
    async mesaStopServer() {
      /* no-op no navegador */
    },
    async mesaObsAddSource() {
      /* no-op no navegador (sem OBS) */
    },
    async mesaObsRemoveSource() {
      /* no-op no navegador */
    },
    // Overlay: sem backend no navegador — só roda no app instalado.
    async overlayStart() {
      return {
        port: 7393,
        url: "http://127.0.0.1:7393/overlay",
        chatUrl: "http://127.0.0.1:7393/chat",
      };
    },
    async overlayStop() {
      /* no-op no navegador */
    },
    async overlayStatus() {
      return null;
    },
    async overlayTest() {
      /* no-op no navegador */
    },
    async overlayChatTest() {
      /* no-op no navegador */
    },
    async overlayObsAddSource() {
      /* no-op no navegador (sem OBS) */
    },
    async openPrivacySettings() {
      /* no-op no navegador */
    },
  };
}

export const api: CornetaApi = IS_TAURI ? tauriApi() : mockApi();
