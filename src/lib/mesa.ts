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

interface PeerInfo {
  peerId: string;
  role: MesaRole;
  name: string;
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

/** Full-mesh P2P uploads every camera to every peer; the screen already calls a table this size full. */
export const MESA_MAX_SEATS = 6;

/** The relay forwards whatever peers claim; an unknown role would receive our camera without being listed. */
function peerInfo(value: unknown): PeerInfo | null {
  if (typeof value !== "object" || value === null) return null;
  const { peerId, role, name } = value as Record<string, unknown>;
  if (typeof peerId !== "string" || !peerId) return null;
  if (role !== "control" && role !== "studio") return null;
  return { peerId, role, name: typeof name === "string" ? name : "" };
}

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

const INVITE_PREFIX = "MESA1.";
/** Generated invites stay far below this; the cap bounds the work spent on pasted text. */
export const MAX_INVITE_LENGTH = 1024;
/** Encoding clamps the title so every generated invite also passes decoding. */
const MAX_INVITE_TITLE = 64;
const ROOM_KEY = /^[\da-f]{5}\.[\da-f]{27}$/;
/** Only host:port, so userinfo, schemes, paths and queries never reach the ws:// URL. */
const SIGNAL_ADDR =
  /^(\[[\da-f:.]+\]|[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?(?:\.[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?)*):([1-9]\d{0,4})$/i;

/** Canonical host:port as the WebSocket will dial it, or null. */
function signalAddr(addr: string): string | null {
  const match = SIGNAL_ADDR.exec(addr);
  if (!match || Number(match[2]) > 65535) return null;
  let host: string;
  try {
    host = new URL(`ws://${match[1]}`).hostname;
  } catch {
    return null;
  }
  // 0.0.0.0/8 and :: are not destinations, and some systems route them to this machine.
  if (/^0\.\d+\.\d+\.\d+$/.test(host) || host === "[::]") return null;
  return `${host}:${match[2]}`;
}

/**
 * Whether a bare host names this machine. Hosts go through the same URL parser that builds
 * the ws:// address, so case, IPv4 shorthand and expanded IPv6 spellings cannot slip past.
 */
export function isLoopback(host: string): boolean {
  const raw = host.trim();
  const literal = /^[\da-f]*:[\da-f:.]*$/i.test(raw) ? `[${raw}]` : raw;
  if (!/^(?:\[[\da-f:.]+\]|[a-z\d.-]+)$/i.test(literal)) return false;
  let name: string;
  try {
    name = new URL(`ws://${literal}`).hostname;
  } catch {
    return false;
  }
  if (name.startsWith("["))
    return (
      name === "[::1]" || /^\[::ffff:7f[\da-f]{2}:[\da-f]{1,4}\]$/.test(name)
    );
  if (/^\d+\.\d+\.\d+\.\d+$/.test(name)) return name.startsWith("127.");
  // Chromium resolves localhost and every *.localhost name to loopback without DNS (RFC 6761).
  return /(?:^|\.)localhost\.?$/.test(name);
}

/** Host part of a decoded invite address, keeping IPv6 brackets. */
export function inviteHost(inv: MesaInvite): string {
  return inv.addr.slice(0, inv.addr.lastIndexOf(":"));
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
  const title =
    inv.title === undefined
      ? undefined
      : [...inv.title].slice(0, MAX_INVITE_TITLE).join("");
  return INVITE_PREFIX + b64urlEncode(JSON.stringify({ ...inv, title }));
}

/** Invites are untrusted pasted text; accept only what encodeInvite can produce. */
export function decodeInvite(code: string): MesaInvite | null {
  const raw = code.trim();
  if (raw.length > MAX_INVITE_LENGTH || !raw.startsWith(INVITE_PREFIX))
    return null;
  const body = raw.slice(INVITE_PREFIX.length);
  if (!/^[\w-]+$/.test(body)) return null;
  let data: unknown;
  try {
    data = JSON.parse(b64urlDecode(body));
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const { addr, room, title } = data as Record<string, unknown>;
  const signal = typeof addr === "string" ? signalAddr(addr) : null;
  if (!signal || typeof room !== "string" || !ROOM_KEY.test(room)) return null;
  if (title === undefined) return { addr: signal, room };
  if (typeof title !== "string" || [...title].length > MAX_INVITE_TITLE)
    return null;
  return { addr: signal, room, title };
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
        const others = (Array.isArray(m.peers) ? m.peers : [])
          .map(peerInfo)
          .filter((p): p is PeerInfo => p !== null && p.peerId !== this.myId);
        if (
          others.filter((p) => p.role === "control").length >= MESA_MAX_SEATS
        ) {
          console.warn("[mesa] room full");
          this.refuse(
            this.opts.t("core.mesa.error.roomFull", { max: MESA_MAX_SEATS }),
          );
          break;
        }
        this.retry = 0;
        this.attempts = 0;
        this.wasOnline = true;
        this.opts.onStatus("online");
        // Peers missing from a fresh welcome left while signaling was down; keeping them would hold seats.
        const present = new Set(others.map((p) => p.peerId));
        for (const id of [...this.recs.keys()])
          if (!present.has(id)) this.dropPeer(id);
        for (const p of others) this.connectTo(p.peerId, p.role, p.name);
        break;
      }
      case "peer-join": {
        const p = peerInfo(m.peer);
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
        this.refuse(
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

  private refuse(message: string): void {
    // A refused join may leave the socket open; preserve the refusal instead of reconnecting over it.
    this.alive = false;
    try {
      this.ws?.close();
    } catch {
      /* Best-effort shutdown after a refused join. */
    }
    this.opts.onStatus("error");
    this.opts.onError?.(message);
  }

  /** Our own seat counts against participants; each seat may add one OBS view. */
  private hasSeat(role: MesaRole): boolean {
    let taken = 0;
    for (const rec of this.recs.values()) if (rec.peer.role === role) taken++;
    return taken < (role === "control" ? MESA_MAX_SEATS - 1 : MESA_MAX_SEATS);
  }

  private connectTo(
    remoteId: string,
    role: MesaRole,
    name: string,
  ): PeerRec | null {
    if (remoteId === this.myId) return null;
    let rec = this.recs.get(remoteId);
    if (rec) return rec;
    if (!this.hasSeat(role)) return null;

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
