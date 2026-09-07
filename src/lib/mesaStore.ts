import { create } from "zustand";
import { api, IS_TAURI } from "./api";
import { toast } from "./toast";
import type { I18n } from "./i18n";
import {
  MesaClient,
  type MesaPeer,
  type MesaStatus,
  type DeviceList,
  listDevices,
  openCamera,
  encodeInvite,
  decodeInvite,
  newRoomKey,
  buildStudioUrl,
} from "./mesa";

// Keep mutable client and MediaStream objects outside reactive state.
let client: MesaClient | null = null;
let localStream: MediaStream | null = null;

type MesaMode = "host" | "guest";

type T = I18n["t"];

interface MesaState {
  active: boolean;
  mode: MesaMode | null;
  status: MesaStatus;
  myId: string | null;
  room: string | null;
  invite: string | null;
  signalUrl: string | null;
  localPort: number | null;
  peers: MesaPeer[];

  devices: DeviceList;
  cameraId?: string;
  micId?: string;
  camOn: boolean;
  micOn: boolean;
  localStream: MediaStream | null;
  hideSelf: boolean;
  obsAdded: boolean;
  camError: string | null;
  serverError: string | null;
  lastError: string | null;

  refreshDevices: () => Promise<void>;
  openLocal: (t: T) => Promise<void>;
  setCamera: (id: string, t: T) => Promise<void>;
  setMic: (id: string, t: T) => Promise<void>;
  toggleCam: () => void;
  toggleMic: () => void;
  setHideSelf: (v: boolean, t: T) => void;
  host: (name: string, t: T) => Promise<void>;
  join: (code: string, name: string, t: T) => Promise<void>;
  retry: () => void;
  leave: () => Promise<void>;
  addToObs: (t: T) => Promise<void>;
  removeFromObs: (t: T) => Promise<void>;
  openPrivacy: (which: "camera" | "microphone") => Promise<void>;
}

export const useMesa = create<MesaState>((set, get) => {
  const startClient = (signalUrl: string, room: string, name: string, t: T) => {
    client?.stop();
    client = new MesaClient({
      signalUrl,
      room,
      name,
      t,
      onReady: (id) => set({ myId: id }),
      onPeers: (peers) => set({ peers }),
      onStatus: (status) =>
        set(status === "online" ? { status, lastError: null } : { status }),
      onError: (msg) => {
        console.warn("[mesa]", msg);
        toast.error(msg);
        set({ lastError: msg });
      },
    });
    // Expose myId before signaling connects; early OBS setup needs it to suppress self-audio.
    set({ myId: client.myId });
    if (localStream) client.setLocalStream(localStream);
    client.start();
  };

  const isLoopback = (host: string) =>
    host === "localhost" || host.startsWith("127.");

  // Stop local tracks on leave and every failed join/host path so device access cannot become orphaned.
  const closeLocal = () => {
    if (!localStream) return;
    localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
    set({ localStream: null });
  };

  return {
    active: false,
    mode: null,
    status: "idle",
    myId: null,
    room: null,
    invite: null,
    signalUrl: null,
    localPort: null,
    peers: [],
    devices: { cameras: [], mics: [] },
    camOn: true,
    micOn: true,
    localStream: null,
    hideSelf: false,
    obsAdded: false,
    camError: null,
    serverError: null,
    lastError: null,

    async refreshDevices() {
      try {
        set({ devices: await listDevices() });
      } catch {
        /* Device labels may remain unavailable before permission. */
      }
    },

    async openLocal(t) {
      try {
        const { cameraId, micId, camOn, micOn } = get();
        const stream = await openCamera({ cameraId, micId });
        if (localStream) localStream.getTracks().forEach((t) => t.stop());
        localStream = stream;
        stream.getVideoTracks().forEach((t) => (t.enabled = camOn));
        stream.getAudioTracks().forEach((t) => (t.enabled = micOn));
        client?.setLocalStream(stream);
        set({ localStream: stream, camError: null });
        await get().refreshDevices();
      } catch (e) {
        const name = e instanceof DOMException ? e.name : "";
        const msg = t(
          name === "NotAllowedError"
            ? "core.mesa.camera.blocked"
            : name === "NotReadableError"
              ? "core.mesa.camera.busy"
              : "core.mesa.camera.failed",
        );
        set({ camError: msg });
        toast.error(msg);
        throw e;
      }
    },

    async setCamera(id, t) {
      const prev = get().cameraId;
      set({ cameraId: id });
      try {
        await get().openLocal(t);
      } catch {
        set({ cameraId: prev });
      }
    },

    async setMic(id, t) {
      const prev = get().micId;
      set({ micId: id });
      try {
        await get().openLocal(t);
      } catch {
        set({ micId: prev });
      }
    },

    toggleCam() {
      const on = !get().camOn;
      set({ camOn: on });
      localStream?.getVideoTracks().forEach((t) => (t.enabled = on));
      client?.setCameraEnabled(on);
    },

    toggleMic() {
      const on = !get().micOn;
      set({ micOn: on });
      localStream?.getAudioTracks().forEach((t) => (t.enabled = on));
      client?.setMicEnabled(on);
    },

    setHideSelf(v, t) {
      set({ hideSelf: v });
      // hideSelf is encoded in the OBS source URL; update that source when the setting changes.
      const { obsAdded, room, signalUrl, localPort, myId } = get();
      if (!obsAdded || !room || !signalUrl || !localPort || !myId) return;
      const url = buildStudioUrl({
        base: `http://127.0.0.1:${localPort}`,
        signalUrl,
        room,
        selfId: myId,
        hideSelf: v,
      });
      api.mesaObsAddSource(url, 1920, 1080).then(
        () => toast.success(t("core.mesa.obs.layoutUpdated")),
        (e) => {
          console.warn("[mesa] obs update:", e);
          toast.error(t("core.mesa.obs.layoutUpdateFailed"));
        },
      );
    },

    async host(name, t) {
      if (!IS_TAURI) {
        toast.error(t("core.mesa.needsInstalledApp"));
        return;
      }
      set({ serverError: null, lastError: null });
      try {
        await get().openLocal(t);
      } catch {
        /* Joining without a camera is allowed; it can be enabled later. */
      }
      let info;
      try {
        info = await api.mesaStartServer();
      } catch (e) {
        console.warn("[mesa] server:", e);
        set({ serverError: t("core.mesa.server.startFailed") });
        closeLocal();
        return;
      }
      // Do not issue loopback invitations when no guest-reachable LAN address exists.
      if (isLoopback(info.lanIp)) {
        toast.error(t("core.mesa.noLanNetwork"));
        try {
          await api.mesaStopServer();
        } catch {
          /* Best-effort cleanup of a failed host attempt. */
        }
        closeLocal();
        return;
      }
      const room = newRoomKey();
      const signalUrl = `ws://127.0.0.1:${info.port}/ws`;
      const invite = encodeInvite({
        addr: `${info.lanIp}:${info.port}`,
        room,
        title: name,
      });
      set({
        active: true,
        mode: "host",
        room,
        signalUrl,
        localPort: info.port,
        invite,
        obsAdded: false,
      });
      startClient(signalUrl, room, name, t);
    },

    async join(code, name, t) {
      if (!IS_TAURI) {
        toast.error(t("core.mesa.needsInstalledApp"));
        return;
      }
      const inv = decodeInvite(code);
      if (!inv) {
        toast.error(t("core.mesa.invite.invalid"));
        return;
      }
      if (isLoopback(inv.addr.split(":")[0])) {
        toast.error(t("core.mesa.invite.loopback"));
        return;
      }
      set({ serverError: null, lastError: null });
      try {
        await get().openLocal(t);
      } catch {
        /* Joining without a camera is allowed. */
      }
      let info;
      try {
        info = await api.mesaStartServer();
      } catch (e) {
        console.warn("[mesa] server:", e);
        set({ serverError: t("core.mesa.server.startFailed") });
        closeLocal();
        return;
      }
      const signalUrl = `ws://${inv.addr}/ws`;
      set({
        active: true,
        mode: "guest",
        room: inv.room,
        signalUrl,
        localPort: info.port,
        invite: code,
        obsAdded: false,
      });
      startClient(signalUrl, inv.room, name, t);
    },

    retry() {
      if (!client) return;
      set({ lastError: null });
      // Restart the existing client to preserve peer identity and tracks without duplicate reconnect loops.
      client.stop();
      client.start();
    },

    async leave() {
      client?.stop();
      client = null;
      closeLocal();
      if (IS_TAURI) {
        try {
          await api.mesaObsRemoveSource();
        } catch {
          /* OBS may be unavailable during cleanup. */
        }
        try {
          await api.mesaStopServer();
        } catch {
          /* Best-effort local server cleanup. */
        }
      }
      set({
        active: false,
        mode: null,
        status: "idle",
        myId: null,
        room: null,
        invite: null,
        signalUrl: null,
        localPort: null,
        peers: [],
        localStream: null,
        obsAdded: false,
        camError: null,
        serverError: null,
        lastError: null,
      });
    },

    async addToObs(t) {
      const { room, signalUrl, localPort, myId, hideSelf } = get();
      if (!room || !signalUrl || !localPort) return;
      if (!myId) {
        toast.info(t("core.mesa.obs.connecting"));
        return;
      }
      const url = buildStudioUrl({
        base: `http://127.0.0.1:${localPort}`,
        signalUrl,
        room,
        selfId: myId ?? "",
        hideSelf,
      });
      try {
        await api.mesaObsAddSource(url, 1920, 1080);
        set({ obsAdded: true });
        toast.success(t("core.mesa.obs.added"));
      } catch (e) {
        console.warn("[mesa] obs add:", e);
        toast.error(t("core.mesa.obs.addFailed"));
      }
    },

    async removeFromObs(t) {
      try {
        await api.mesaObsRemoveSource();
        set({ obsAdded: false });
        toast.info(t("core.mesa.obs.removed"));
      } catch (e) {
        console.warn("[mesa] obs remove:", e);
        toast.error(t("core.mesa.obs.removeFailed"));
      }
    },

    async openPrivacy(which) {
      try {
        await api.openPrivacySettings(which);
      } catch {
        /* Native privacy settings may be unavailable in browser previews. */
      }
    },
  };
});
