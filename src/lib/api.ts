import { mockApi } from "./api/demo";
import { tauriApi } from "./api/native";
import { IS_TAURI } from "./api/runtime";
import { CornetaApi } from "./api/types";
export { IS_TAURI, START_CANCELLED } from "./api/runtime";
export type {
  AccountChatChannel,
  BatchClipResult,
  BatchClipSpec,
  ChatReply,
  ClipExportFormat,
  ClipProgressEvent,
  ClipSegmentSlice,
  CornetaApi,
  MesaServerInfo,
  OverlayInfo,
  RemoteRevoke,
  ShortcutAction,
  SignOutOutcome,
} from "./api/types";

export const api: CornetaApi = IS_TAURI ? tauriApi() : mockApi();
