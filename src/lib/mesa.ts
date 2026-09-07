import type { I18n } from "./i18n";

export type MesaRole = "control" | "studio";

export interface MesaPeer {
  id: string;
  name: string;
  role: MesaRole;
  connection: RTCPeerConnectionState;
  stream: MediaStream | null;
}

export type MesaStatus = "idle" | "connecting" | "online" | "offline" | "error";

export interface MesaClientOpts {
  signalUrl: string;
  /** Room ID and secret; possession of the invitation grants access. */
  room: string;
  name: string;
  t: I18n["t"];
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

/** Bound consecutive retries so unreachable rooms eventually produce a recoverable error. */
const MAX_ATTEMPTS = 6;

function randomId(prefix: string): string {
  return prefix + "-" + Math.random().toString(36).slice(2, 10);
}

/** Per-peer CSPRNG secret proves ownership on reconnect; sent only in join, never broadcast. */
function randomSecret(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export interface MesaInvite {
  /** Reachable signaling host and port, over LAN or a tunnel. */
  addr: string;
  room: string;
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
  return decodeURIComponent(
    escape(atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad)),
  );
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

/** Room keys grant access and must use cryptographically secure randomness. */
export function newRoomKey(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  const hex = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 5)}.${hex.slice(5)}`;
}

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

export class MesaClient {
  readonly myId = randomId("control");
  private readonly secret = randomSecret();
  private ws: WebSocket | null = null;
  private readonly opts: MesaClientOpts;
  private readonly ice: RTCIceServer[];
  private readonly recs = new Map<string, PeerRec>();
  private local: MediaStream | null = null;
  private maxBitrateKbps = 0;
  private alive = false;
  private retry = 0;
  private attempts = 0;
  private wasOnline = false;
  private keepalive: ReturnType<typeof setInterval> | null = null;

  constructor(opts: MesaClientOpts) {
    this.opts = opts;
    this.ice =
      opts.iceServers && opts.iceServers.length ? opts.iceServers : DEFAULT_ICE;
  }

  setLocalStream(stream: MediaStream | null): void {
    this.local = stream;
    for (const rec of this.recs.values()) this.syncTracks(rec);
  }

  setCameraEnabled(on: boolean): void {
    this.local?.getVideoTracks().forEach((t) => (t.enabled = on));
  }

  setMicEnabled(on: boolean): void {
    this.local?.getAudioTracks().forEach((t) => (t.enabled = on));
  }

  /** Outgoing video bitrate cap; zero means uncapped. */
  setMaxBitrate(kbps: number): void {
    this.maxBitrateKbps = kbps;
    for (const rec of this.recs.values()) void this.applyBitrate(rec);
  }

  start(): void {
    this.alive = true;
    this.retry = 0;
    this.attempts = 0;
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
        /* Best-effort peer shutdown. */
      }
    }
    this.recs.clear();
    this.emitPeers();
    try {
      this.ws?.close();
    } catch {
      /* Best-effort signaling shutdown. */
    }
    this.ws = null;
    this.opts.onStatus("idle");
  }

  private connect(): void {
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.opts.signalUrl);
    } catch (e) {
      console.warn("[mesa] invalid signaling:", e);
      this.opts.onError?.(this.opts.t("core.mesa.error.badInviteAddress"));
      this.opts.onStatus("error");
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      // A socket handshake does not prove room access; reset retries only after welcome.
      this.opts.onReady?.(this.myId);
      this.send({
        t: "join",
        room: this.opts.room,
        peerId: this.myId,
        role: "control",
        name: this.opts.name,
        secret: this.secret,
      });
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
      this.attempts += 1;
      if (this.attempts >= MAX_ATTEMPTS) {
        this.alive = false;
        this.opts.onStatus("error");
        this.opts.onError?.(
          this.opts.t(
            this.wasOnline
              ? "core.mesa.error.hostGone"
              : "core.mesa.error.hostUnreachable",
          ),
        );
        return;
      }
      this.opts.onStatus("offline");
      this.retry = Math.min(this.retry + 1, 6);
      setTimeout(() => this.alive && this.connect(), 400 * this.retry);
    };
    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        /* Closing an already-failed signaling socket is best-effort. */
      }
    };
  }

  private send(obj: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN)
      this.ws.send(JSON.stringify(obj));
  }

  private async onMessage(m: Record<string, unknown>): Promise<void> {
    switch (m.t) {
      case "welcome": {
        this.retry = 0;
        this.attempts = 0;
        this.wasOnline = true;
        this.opts.onStatus("online");
        const list =
          (m.peers as { peerId: string; role: MesaRole; name: string }[]) ?? [];
        for (const p of list) this.connectTo(p.peerId, p.role, p.name);
        break;
      }
      case "peer-join": {
        const p = m.peer as
          { peerId: string; role: MesaRole; name: string } | undefined;
        if (p) this.connectTo(p.peerId, p.role, p.name);
        break;
      }
      case "peer-leave":
        this.dropPeer(m.peerId as string);
        break;
      case "signal":
        await this.onPeerSignal(m.from as string, m.data as SignalData);
        break;
      case "error": {
        const code = typeof m.code === "string" ? m.code : "";
        console.warn("[mesa] room rejected:", code || "(no code)");
        // A rejected join may leave the socket open; preserve the rejection instead of reconnecting over it.
        this.alive = false;
        try {
          this.ws?.close();
        } catch {
          /* Best-effort shutdown after a rejected join. */
        }
        this.opts.onStatus("error");
        this.opts.onError?.(
          this.opts.t(
            code === "peer-taken"
              ? "core.mesa.error.peerTaken"
              : "core.mesa.error.joinRefused",
          ),
        );
        break;
      }
    }
  }

  private connectTo(
    remoteId: string,
    role: MesaRole,
    name: string,
  ): PeerRec | null {
    if (remoteId === this.myId) return null;
    let rec = this.recs.get(remoteId);
    if (rec) return rec;

    const pc = new RTCPeerConnection({
      iceServers: this.ice,
      bundlePolicy: "max-bundle",
    });
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
      if (candidate)
        this.send({ t: "signal", to: remoteId, data: { candidate } });
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
          /* ICE restart failure must not prevent publishing connection status. */
        }
      }
      this.emitPeers();
    };
    pc.onnegotiationneeded = async () => {
      try {
        rec!.makingOffer = true;
        await pc.setLocalDescription();
        this.send({
          t: "signal",
          to: remoteId,
          data: { description: pc.localDescription ?? undefined },
        });
      } catch {
        /* Concurrent negotiation may invalidate the local offer. */
      } finally {
        rec!.makingOffer = false;
      }
    };

    this.syncTracks(rec);
    this.emitPeers();
    return rec;
  }

  private syncTracks(rec: PeerRec): void {
    if (!this.local) return;
    const vt = this.local.getVideoTracks()[0] ?? null;
    const at = this.local.getAudioTracks()[0] ?? null;
    if (vt) {
      if (rec.videoSender) void rec.videoSender.replaceTrack(vt);
      else rec.videoSender = rec.pc.addTrack(vt, this.local);
    }
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
      if (!params.encodings || params.encodings.length === 0)
        params.encodings = [{}];
      params.encodings[0].maxBitrate = this.maxBitrateKbps * 1000;
      await rec.videoSender.setParameters(params);
    } catch {
      /* The browser may reject bitrate parameters. */
    }
  }

  private async onPeerSignal(fromId: string, data: SignalData): Promise<void> {
    if (!data) return;
    let rec = this.recs.get(fromId);
    if (!rec)
      rec =
        this.connectTo(
          fromId,
          "control",
          this.opts.t("core.mesa.peer.unknownName"),
        ) ?? undefined;
    if (!rec) return;
    const pc = rec.pc;
    try {
      if (data.description) {
        const desc = data.description;
        const collision =
          desc.type === "offer" &&
          (rec.makingOffer || pc.signalingState !== "stable");
        rec.ignoreOffer = !rec.polite && collision;
        if (rec.ignoreOffer) return;
        await pc.setRemoteDescription(desc);
        if (desc.type === "offer") {
          await pc.setLocalDescription();
          this.send({
            t: "signal",
            to: fromId,
            data: { description: pc.localDescription ?? undefined },
          });
        }
      } else if (data.candidate) {
        try {
          await pc.addIceCandidate(data.candidate);
        } catch (e) {
          if (!rec.ignoreOffer) throw e;
        }
      }
    } catch {
      /* Perfect negotiation tolerates concurrent offer races. */
    }
  }

  private dropPeer(remoteId: string): void {
    const rec = this.recs.get(remoteId);
    if (!rec) return;
    try {
      rec.pc.close();
    } catch {
      /* Peer shutdown must not prevent removing its local record. */
    }
    this.recs.delete(remoteId);
    this.emitPeers();
  }

  private emitPeers(): void {
    this.opts.onPeers([...this.recs.values()].map((r) => ({ ...r.peer })));
  }
}

export interface StudioUrlOpts {
  base: string;
  signalUrl: string;
  room: string;
  /** The local control peer ID prevents duplicate self-audio in the studio. */
  selfId: string;
  layout?: "grid" | "solo";
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
  if (o.iceServers && o.iceServers.length)
    p.set("ice", JSON.stringify(o.iceServers));
  return `${o.base.replace(/\/$/, "")}/studio?${p.toString()}`;
}
