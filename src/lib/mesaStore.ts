// Estado de longa vida da Mesa (sobrevive à navegação entre telas — igual o motor/chat
// vivem no store). Dono do MesaClient e da stream local; a tela só observa e dispara ações.
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

// Fora do estado reativo (não serializável / mutável): o cliente e a stream local.
let client: MesaClient | null = null;
let localStream: MediaStream | null = null;

type MesaMode = "host" | "guest";

// Store não é componente: quem chama a ação passa o tradutor do idioma ativo.
type T = I18n["t"];

interface MesaState {
  active: boolean;
  mode: MesaMode | null;
  status: MesaStatus;
  myId: string | null;
  room: string | null;
  /** Código do convite (host gera / convidado usa). */
  invite: string | null;
  /** URL de sinalização que ESTE cliente usa. */
  signalUrl: string | null;
  /** Porta do servidor local (serve a página de estúdio pro MEU OBS). */
  localPort: number | null;
  peers: MesaPeer[];

  devices: DeviceList;
  cameraId?: string;
  micId?: string;
  camOn: boolean;
  micOn: boolean;
  localStream: MediaStream | null;
  /** Esconder o meu tile na grade do OBS (quem já tem facecam própria). */
  hideSelf: boolean;
  obsAdded: boolean;
  /** Erro de permissão de câmera (mostra o atalho pra privacidade do Windows). */
  camError: string | null;
  /** Falha ao subir o servidor local da Mesa (nada a ver com câmera/privacidade). */
  serverError: string | null;
  /** Erro de conexão/sala vindo do MesaClient — some quando volta a ficar online. */
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
  /** Reconecta do zero (mesmo cliente, mesmo id) depois de um erro de conexão. */
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
      // Voltou a ficar online → o erro antigo não vale mais.
      onStatus: (status) =>
        set(status === "online" ? { status, lastError: null } : { status }),
      // Erro de sala/conexão precisa chegar na tela — em console.warn ninguém vê.
      onError: (msg) => {
        console.warn("[mesa]", msg);
        toast.error(msg);
        set({ lastError: msg });
      },
    });
    // myId já existe na construção (é o peerId do join) — expõe já, sem esperar o onReady
    // (senão "Adicionar no OBS" antes do socket abrir gravaria self="" e quebraria o mute).
    set({ myId: client.myId });
    if (localStream) client.setLocalStream(localStream);
    client.start();
  };

  const isLoopback = (host: string) =>
    host === "localhost" || host.startsWith("127.");

  // Desliga câmera+mic locais (para as tracks → LED apaga e o dispositivo é liberado).
  // Usado no leave() e em TODO caminho de erro de host()/join() após openLocal() ter
  // dado certo — senão a stream ficaria viva sem nenhum caminho na UI pra desligar
  // (leave() só é alcançável com a Mesa ativa).
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
        /* rótulos só aparecem após permissão — tudo bem */
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
        // `name` é código do DOM (NotAllowedError…) — só a frase muda de idioma.
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
        set({ cameraId: prev }); // dispositivo ocupado/sumiu → volta pro que funcionava
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
      // Com a Mesa já no OBS, o hideSelf vive na URL do Browser Source — sem re-adicionar
      // (o backend faz add-or-update) o toggle seria no-op silencioso.
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
        /* segue sem câmera — dá pra ligar depois */
      }
      let info;
      try {
        info = await api.mesaStartServer();
      } catch (e) {
        console.warn("[mesa] servidor:", e);
        set({ serverError: t("core.mesa.server.startFailed") });
        closeLocal();
        return;
      }
      // Sem IP de LAN, o convite sairia como loopback (inalcançável pelos convidados).
      if (isLoopback(info.lanIp)) {
        toast.error(t("core.mesa.noLanNetwork"));
        try {
          await api.mesaStopServer();
        } catch {
          /* ignore */
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
        /* segue sem câmera */
      }
      let info;
      try {
        info = await api.mesaStartServer();
      } catch (e) {
        console.warn("[mesa] servidor:", e);
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
      // stop() derruba o socket velho (senão a reconexão automática duplicaria a conexão)
      // e start() volta do zero com o MESMO cliente — preserva myId e a stream local.
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
          /* OBS pode não estar acessível */
        }
        try {
          await api.mesaStopServer();
        } catch {
          /* ignore */
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
        /* ignore */
      }
    },
  };
});
