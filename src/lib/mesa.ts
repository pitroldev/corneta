// ============================================================
// Mesa — co-stream P2P (WebRTC mesh). Lado "control": publica a própria câmera/mic
// e recebe as câmeras dos outros (preview). A composição que vai pro OBS é feita pela
// página de estúdio (src-tauri/assets/studio.html), que entra na MESMA sala.
//
// WebRTC roda no WebView (Chromium/WebView2) — nada de crate Rust. A sinalização é um
// relay de texto servido pela Corneta do host; a mídia é direta entre os pares.
// ============================================================

export type MesaRole = "control" | "studio";

export interface MesaPeer {
  id: string;
  name: string;
  role: MesaRole;
  connection: RTCPeerConnectionState;
  /** Stream remoto (pra preview na sala de controle). */
  stream: MediaStream | null;
}

export type MesaStatus = "idle" | "connecting" | "online" | "offline" | "error";

export interface MesaClientOpts {
  signalUrl: string;
  /** Chave da sala (id + segredo) — quem tem o convite tem acesso. */
  room: string;
  name: string;
  iceServers?: RTCIceServer[];
  onReady?: (myId: string) => void;
  onPeers: (peers: MesaPeer[]) => void;
  onStatus: (s: MesaStatus) => void;
  onError?: (msg: string) => void;
}

interface SignalData {
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

interface PeerRec {
  pc: RTCPeerConnection;
  peer: MesaPeer;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  videoSender: RTCRtpSender | null;
  audioSender: RTCRtpSender | null;
}

const DEFAULT_ICE: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

function randomId(prefix: string): string {
  return prefix + "-" + Math.random().toString(36).slice(2, 10);
}

// ------------------------------------------------------------------
// Convite (token) — carrega o endereço do host + a chave da sala, sem servidor de
// rendezvous. base64url de um JSON pequeno. Curto o bastante pra copiar/QR.
// ------------------------------------------------------------------
export interface MesaInvite {
  /** host:porta alcançável do relay de sinalização (LAN ou túnel). */
  addr: string;
  /** Chave da sala (id.segredo). */
  room: string;
  /** Nome amigável da Mesa (opcional). */
  title?: string;
}

function b64urlEncode(s: string): string {
  return btoa(unescape(encodeURIComponent(s)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlDecode(s: string): string {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad)));
}

export function encodeInvite(inv: MesaInvite): string {
  return "MESA1." + b64urlEncode(JSON.stringify(inv));
}

export function decodeInvite(code: string): MesaInvite | null {
  try {
    const raw = code.trim();
    const body = raw.startsWith("MESA1.") ? raw.slice("MESA1.".length) : raw;
    const inv = JSON.parse(b64urlDecode(body)) as MesaInvite;
    if (!inv.addr || !inv.room) return null;
    return inv;
  } catch {
    return null;
  }
}

/** Gera uma chave de sala nova (id curto + segredo). A chave É o controle de acesso
 *  (quem a tem entra na sala), então usa CSPRNG — nada de Math.random adivinhável. */
export function newRoomKey(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  const hex = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 5)}.${hex.slice(5)}`;
}

// ------------------------------------------------------------------
// Dispositivos (câmera/mic)
// ------------------------------------------------------------------
export interface DeviceList {
  cameras: MediaDeviceInfo[];
  mics: MediaDeviceInfo[];
}

export async function listDevices(): Promise<DeviceList> {
  const all = await navigator.mediaDevices.enumerateDevices();
  return {
    cameras: all.filter((d) => d.kind === "videoinput"),
    mics: all.filter((d) => d.kind === "audioinput"),
  };
}

export interface CameraOpts {
  cameraId?: string;
  micId?: string;
  width?: number;
  height?: number;
  fps?: number;
}

/** Abre câmera + mic com a resolução pedida (padrão 1280×720@30). */
export async function openCamera(opts: CameraOpts = {}): Promise<MediaStream> {
  const video: MediaTrackConstraints = {
    width: { ideal: opts.width ?? 1280 },
    height: { ideal: opts.height ?? 720 },
    frameRate: { ideal: opts.fps ?? 30 },
  };
  if (opts.cameraId) video.deviceId = { exact: opts.cameraId };
  const audio: MediaTrackConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  };
  if (opts.micId) audio.deviceId = { exact: opts.micId };
  return navigator.mediaDevices.getUserMedia({ video, audio });
}

// ------------------------------------------------------------------
// Cliente da Mesa (lado control)
// ------------------------------------------------------------------
export class MesaClient {
  readonly myId = randomId("control");
  private ws: WebSocket | null = null;
  private readonly opts: MesaClientOpts;
  private readonly ice: RTCIceServer[];
  private readonly recs = new Map<string, PeerRec>();
  private local: MediaStream | null = null;
  private maxBitrateKbps = 0;
  private alive = false;
  private retry = 0;
  private keepalive: ReturnType<typeof setInterval> | null = null;

  constructor(opts: MesaClientOpts) {
    this.opts = opts;
    this.ice = opts.iceServers && opts.iceServers.length ? opts.iceServers : DEFAULT_ICE;
  }

  /** Define/atualiza a stream local publicada pra todos os pares. */
  setLocalStream(stream: MediaStream | null): void {
    this.local = stream;
    for (const rec of this.recs.values()) this.syncTracks(rec);
  }

  /** Liga/desliga a câmera (mantém a conexão). */
  setCameraEnabled(on: boolean): void {
    this.local?.getVideoTracks().forEach((t) => (t.enabled = on));
  }

  /** Liga/desliga o mic. */
  setMicEnabled(on: boolean): void {
    this.local?.getAudioTracks().forEach((t) => (t.enabled = on));
  }

  /** Teto de bitrate do vídeo enviado (0 = sem teto). */
  setMaxBitrate(kbps: number): void {
    this.maxBitrateKbps = kbps;
    for (const rec of this.recs.values()) void this.applyBitrate(rec);
  }

  start(): void {
    this.alive = true;
    this.opts.onStatus("connecting");
    this.connect();
    if (this.keepalive) clearInterval(this.keepalive);
    this.keepalive = setInterval(() => this.send({ t: "ping" }), 25000);
  }

  stop(): void {
    this.alive = false;
    if (this.keepalive) clearInterval(this.keepalive);
    this.keepalive = null;
    this.send({ t: "leave" });
    for (const rec of this.recs.values()) {
      try {
        rec.pc.close();
      } catch {
        /* ignore */
      }
    }
    this.recs.clear();
    this.emitPeers();
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
    this.opts.onStatus("idle");
  }

  // ---------------- sinalização ----------------
  private connect(): void {
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.opts.signalUrl);
    } catch (e) {
      this.opts.onError?.(`sinalização inválida: ${String(e)}`);
      this.opts.onStatus("error");
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.opts.onStatus("online");
      this.opts.onReady?.(this.myId);
      this.send({ t: "join", room: this.opts.room, peerId: this.myId, role: "control", name: this.opts.name });
    };
    ws.onmessage = (ev) => {
      let m: Record<string, unknown>;
      try {
        m = JSON.parse(ev.data as string);
      } catch {
        return;
      }
      void this.onMessage(m);
    };
    ws.onclose = () => {
      if (!this.alive) return;
      this.opts.onStatus("offline");
      this.retry = Math.min(this.retry + 1, 6);
      setTimeout(() => this.alive && this.connect(), 400 * this.retry);
    };
    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    };
  }

  private send(obj: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }

  private async onMessage(m: Record<string, unknown>): Promise<void> {
    switch (m.t) {
      case "welcome": {
        const list = (m.peers as { peerId: string; role: MesaRole; name: string }[]) ?? [];
        for (const p of list) this.connectTo(p.peerId, p.role, p.name);
        break;
      }
      case "peer-join": {
        const p = m.peer as { peerId: string; role: MesaRole; name: string } | undefined;
        if (p) this.connectTo(p.peerId, p.role, p.name);
        break;
      }
      case "peer-leave":
        this.dropPeer(m.peerId as string);
        break;
      case "signal":
        await this.onPeerSignal(m.from as string, m.data as SignalData);
        break;
    }
  }

  // ---------------- WebRTC (perfect negotiation) ----------------
  private connectTo(remoteId: string, role: MesaRole, name: string): PeerRec | null {
    if (remoteId === this.myId) return null;
    let rec = this.recs.get(remoteId);
    if (rec) return rec;

    const pc = new RTCPeerConnection({ iceServers: this.ice, bundlePolicy: "max-bundle" });
    rec = {
      pc,
      polite: this.myId > remoteId,
      makingOffer: false,
      ignoreOffer: false,
      videoSender: null,
      audioSender: null,
      peer: { id: remoteId, name, role, connection: "new", stream: null },
    };
    this.recs.set(remoteId, rec);

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) this.send({ t: "signal", to: remoteId, data: { candidate } });
    };
    pc.ontrack = ({ streams }) => {
      if (streams[0]) {
        rec!.peer.stream = streams[0];
        this.emitPeers();
      }
    };
    pc.onconnectionstatechange = () => {
      rec!.peer.connection = pc.connectionState;
      if (pc.connectionState === "failed") {
        try {
          pc.restartIce();
        } catch {
          /* ignore */
        }
      }
      this.emitPeers();
    };
    pc.onnegotiationneeded = async () => {
      try {
        rec!.makingOffer = true;
        await pc.setLocalDescription();
        this.send({ t: "signal", to: remoteId, data: { description: pc.localDescription ?? undefined } });
      } catch {
        /* ignore */
      } finally {
        rec!.makingOffer = false;
      }
    };

    // Publica a câmera/mic local pra este par (control → todos). Dispara negotiationneeded.
    this.syncTracks(rec);
    this.emitPeers();
    return rec;
  }

  private syncTracks(rec: PeerRec): void {
    if (!this.local) return;
    const vt = this.local.getVideoTracks()[0] ?? null;
    const at = this.local.getAudioTracks()[0] ?? null;
    // Vídeo
    if (vt) {
      if (rec.videoSender) void rec.videoSender.replaceTrack(vt);
      else rec.videoSender = rec.pc.addTrack(vt, this.local);
    }
    // Áudio
    if (at) {
      if (rec.audioSender) void rec.audioSender.replaceTrack(at);
      else rec.audioSender = rec.pc.addTrack(at, this.local);
    }
    void this.applyBitrate(rec);
  }

  private async applyBitrate(rec: PeerRec): Promise<void> {
    if (!rec.videoSender || this.maxBitrateKbps <= 0) return;
    try {
      const params = rec.videoSender.getParameters();
      if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
      params.encodings[0].maxBitrate = this.maxBitrateKbps * 1000;
      await rec.videoSender.setParameters(params);
    } catch {
      /* navegador pode recusar — best-effort */
    }
  }

  private async onPeerSignal(fromId: string, data: SignalData): Promise<void> {
    if (!data) return;
    let rec = this.recs.get(fromId);
    if (!rec) rec = this.connectTo(fromId, "control", "convidado") ?? undefined;
    if (!rec) return;
    const pc = rec.pc;
    try {
      if (data.description) {
        const desc = data.description;
        const collision =
          desc.type === "offer" && (rec.makingOffer || pc.signalingState !== "stable");
        rec.ignoreOffer = !rec.polite && collision;
        if (rec.ignoreOffer) return;
        await pc.setRemoteDescription(desc);
        if (desc.type === "offer") {
          await pc.setLocalDescription();
          this.send({ t: "signal", to: fromId, data: { description: pc.localDescription ?? undefined } });
        }
      } else if (data.candidate) {
        try {
          await pc.addIceCandidate(data.candidate);
        } catch (e) {
          if (!rec.ignoreOffer) throw e;
        }
      }
    } catch {
      /* ignore — perfect negotiation tolera corridas */
    }
  }

  private dropPeer(remoteId: string): void {
    const rec = this.recs.get(remoteId);
    if (!rec) return;
    try {
      rec.pc.close();
    } catch {
      /* ignore */
    }
    this.recs.delete(remoteId);
    this.emitPeers();
  }

  private emitPeers(): void {
    this.opts.onPeers([...this.recs.values()].map((r) => ({ ...r.peer })));
  }
}

// ------------------------------------------------------------------
// URL da página de estúdio (carregada pelo OBS como Browser Source).
// ------------------------------------------------------------------
export interface StudioUrlOpts {
  /** Base do servidor local que serve studio.html (ex.: http://127.0.0.1:7777). */
  base: string;
  /** URL de sinalização que ESTE cliente usa (host: 127.0.0.1; convidado: addr do host). */
  signalUrl: string;
  room: string;
  /** peerId do próprio control (muta o áudio do próprio host no estúdio). */
  selfId: string;
  layout?: "grid" | "solo";
  /** Solo: peerId a exibir em tela cheia. */
  peer?: string;
  hideSelf?: boolean;
  labels?: boolean;
  iceServers?: RTCIceServer[];
}

export function buildStudioUrl(o: StudioUrlOpts): string {
  const p = new URLSearchParams();
  p.set("room", o.room);
  p.set("signal", o.signalUrl);
  p.set("self", o.selfId);
  if (o.layout) p.set("layout", o.layout);
  if (o.peer) p.set("peer", o.peer);
  if (o.hideSelf) p.set("hideSelf", "1");
  if (o.labels) p.set("labels", "1");
  if (o.iceServers && o.iceServers.length) p.set("ice", JSON.stringify(o.iceServers));
  return `${o.base.replace(/\/$/, "")}/studio?${p.toString()}`;
}
