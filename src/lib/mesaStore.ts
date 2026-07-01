// Estado de longa vida da Mesa (sobrevive à navegação entre telas — igual o motor/chat
// vivem no store). Dono do MesaClient e da stream local; a tela só observa e dispara ações.
import { create } from "zustand";
import { api, IS_TAURI } from "./api";
import { toast } from "./toast";
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

  refreshDevices: () => Promise<void>;
  openLocal: () => Promise<void>;
  setCamera: (id: string) => Promise<void>;
  setMic: (id: string) => Promise<void>;
  toggleCam: () => void;
  toggleMic: () => void;
  setHideSelf: (v: boolean) => void;
  host: (name: string) => Promise<void>;
  join: (code: string, name: string) => Promise<void>;
  leave: () => Promise<void>;
  addToObs: () => Promise<void>;
  removeFromObs: () => Promise<void>;
  openPrivacy: (which: "camera" | "microphone") => Promise<void>;
}

export const useMesa = create<MesaState>((set, get) => {
  const startClient = (signalUrl: string, room: string, name: string) => {
    client?.stop();
    client = new MesaClient({
      signalUrl,
      room,
      name,
      onReady: (id) => set({ myId: id }),
      onPeers: (peers) => set({ peers }),
      onStatus: (status) => set({ status }),
      onError: (msg) => console.warn("[mesa]", msg),
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

    async refreshDevices() {
      try {
        set({ devices: await listDevices() });
      } catch {
        /* rótulos só aparecem após permissão — tudo bem */
      }
    },

    async openLocal() {
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
        const msg =
          name === "NotAllowedError"
            ? "Câmera/microfone bloqueados pelo Windows."
            : name === "NotReadableError"
              ? "A câmera está ocupada por outro app."
              : "Não consegui abrir a câmera.";
        set({ camError: msg });
        toast.error(msg);
        throw e;
      }
    },

    async setCamera(id) {
      const prev = get().cameraId;
      set({ cameraId: id });
      try {
        await get().openLocal();
      } catch {
        set({ cameraId: prev }); // dispositivo ocupado/sumiu → volta pro que funcionava
      }
    },

    async setMic(id) {
      const prev = get().micId;
      set({ micId: id });
      try {
        await get().openLocal();
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

    setHideSelf(v) {
      set({ hideSelf: v });
    },

    async host(name) {
      if (!IS_TAURI) {
        toast.error("A Mesa precisa do app instalado (servidor local).");
        return;
      }
      try {
        await get().openLocal();
      } catch {
        /* segue sem câmera — dá pra ligar depois */
      }
      let info;
      try {
        info = await api.mesaStartServer();
      } catch (e) {
        toast.error("Não consegui subir o servidor da Mesa.");
        set({ camError: String(e) });
        closeLocal();
        return;
      }
      // Sem IP de LAN, o convite sairia como loopback (inalcançável pelos convidados).
      if (isLoopback(info.lanIp)) {
        toast.error("Sem rede local — não consigo gerar um convite que a galera alcance.");
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
      const invite = encodeInvite({ addr: `${info.lanIp}:${info.port}`, room, title: name });
      set({
        active: true,
        mode: "host",
        room,
        signalUrl,
        localPort: info.port,
        invite,
        obsAdded: false,
      });
      startClient(signalUrl, room, name);
    },

    async join(code, name) {
      if (!IS_TAURI) {
        toast.error("A Mesa precisa do app instalado (servidor local).");
        return;
      }
      const inv = decodeInvite(code);
      if (!inv) {
        toast.error("Convite inválido. Confere o código.");
        return;
      }
      if (isLoopback(inv.addr.split(":")[0])) {
        toast.error("Esse convite aponta pra um endereço local. Pede um convite novo pro host.");
        return;
      }
      try {
        await get().openLocal();
      } catch {
        /* segue sem câmera */
      }
      let info;
      try {
        info = await api.mesaStartServer();
      } catch (e) {
        toast.error("Não consegui subir o servidor da Mesa.");
        set({ camError: String(e) });
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
      startClient(signalUrl, inv.room, name);
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
      });
    },

    async addToObs() {
      const { room, signalUrl, localPort, myId, hideSelf } = get();
      if (!room || !signalUrl || !localPort) return;
      if (!myId) {
        toast.info("Conectando à Mesa… tenta de novo num instante.");
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
        toast.success("Pus a Mesa na sua cena do OBS 🎥");
      } catch (e) {
        toast.error(`O OBS recusou: ${String(e)}`);
      }
    },

    async removeFromObs() {
      try {
        await api.mesaObsRemoveSource();
        set({ obsAdded: false });
        toast.info("Tirei a Mesa do OBS.");
      } catch (e) {
        toast.error(String(e));
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
