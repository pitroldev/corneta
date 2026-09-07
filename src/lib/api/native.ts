import { type TelemetryStatus } from "../telemetry-schema";
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
import { CornetaApi, MesaServerInfo, OverlayInfo } from "./types";

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

// ---------------------------------------------------------------------------
// Implementação real (Tauri)
// ---------------------------------------------------------------------------
export function tauriApi(): CornetaApi {
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
    async readSessionBytes(id, chat = false) {
      const { invoke } = await core();
      return invoke<ArrayBuffer>("read_session_bytes", { id, chat });
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
    async youtubeBroadcastRecoveryStatus() {
      const { invoke } = await core();
      return await invoke("youtube_broadcast_recovery_status");
    },
    async youtubeRetryBroadcastCleanup() {
      const { invoke } = await core();
      await invoke("youtube_retry_broadcast_cleanup");
    },
    async youtubeAcknowledgeUnknownBroadcast(confirmed) {
      const { invoke } = await core();
      await invoke("youtube_acknowledge_unknown_broadcast", { confirmed });
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
    async obsAutoconfigure() {
      const { invoke } = await core();
      await invoke("obs_autoconfigure");
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
