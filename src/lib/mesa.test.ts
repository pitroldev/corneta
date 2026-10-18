import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildStudioUrl,
  decodeInvite,
  encodeInvite,
  inviteHost,
  isLoopback,
  MAX_INVITE_LENGTH,
  MESA_MAX_SEATS,
  MesaClient,
  newRoomKey,
  type MesaClientOpts,
  type MesaPeer,
  type MesaStatus,
} from "./mesa";

const ROOM = "abcde.0123456789abcdef0123456789a";
const LAN = "192.168.0.10:5000";

const base64Url = (text: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(text)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const rawInvite = (data: unknown) => `MESA1.${base64Url(JSON.stringify(data))}`;

describe("Mesa invites", () => {
  it("round-trips the invites this app generates, titles in any script included", () => {
    const invite = { addr: LAN, room: newRoomKey(), title: "Pitrol 🎺 Zoë" };
    const code = encodeInvite(invite);
    expect(code).toMatch(/^MESA1\.[\w-]+$/);
    expect(decodeInvite(`  ${code}\n`)).toEqual(invite);
    expect(decodeInvite(encodeInvite({ addr: LAN, room: ROOM }))).toEqual({
      addr: LAN,
      room: ROOM,
    });
  });

  it.each(["🎺".repeat(500), "\u0001".repeat(500), "x".repeat(5000)])(
    "clamps a long title so the host's own invite still decodes (case %#)",
    (title) => {
      const code = encodeInvite({ addr: "[fe80::1]:65535", room: ROOM, title });
      expect(code.length).toBeLessThanOrEqual(MAX_INVITE_LENGTH);
      const decoded = decodeInvite(code);
      expect(decoded?.title).toBeTruthy();
      expect(title.startsWith(decoded!.title!)).toBe(true);
      expect(decoded!.title!.length).toBeLessThan(title.length);
    },
  );

  it("rejects text that is not a MESA1 invite", () => {
    const code = encodeInvite({ addr: LAN, room: ROOM });
    const body = code.slice("MESA1.".length);
    for (const text of [
      "",
      "MESA1.",
      body,
      `MESA2.${body}`,
      `mesa1.${body}`,
      `https://corneta.live/mesa?invite=${code}`,
      `ws://${LAN}/ws`,
      `${code}!`,
      `${code}==`,
      `MESA1.${body.slice(0, 10)} ${body.slice(10)}`,
      "MESA1.abc+def/ghi",
      `MESA1.${base64Url("not json")}`,
      "MESA1.__4",
    ])
      expect(decodeInvite(text), text).toBeNull();
  });

  it("rejects oversized input before decoding it", () => {
    const padded = rawInvite({ addr: LAN, room: ROOM, note: "x".repeat(900) });
    expect(padded.length).toBeGreaterThan(MAX_INVITE_LENGTH);
    expect(decodeInvite(padded)).toBeNull();
    expect(
      decodeInvite(rawInvite({ addr: LAN, room: ROOM, note: "x".repeat(100) })),
    ).toEqual({ addr: LAN, room: ROOM });
  });

  it("rejects payloads that are not a complete invite object", () => {
    for (const payload of [
      null,
      42,
      "text",
      [],
      [LAN, ROOM],
      { room: ROOM },
      { addr: LAN },
      { addr: 5000, room: ROOM },
      { addr: LAN, room: 42 },
      { addr: LAN, room: "short" },
      { addr: LAN, room: ROOM.toUpperCase() },
      { addr: LAN, room: `${ROOM}0` },
      { addr: LAN, room: ROOM, title: 7 },
      { addr: LAN, room: ROOM, title: "x".repeat(65) },
    ])
      expect(
        decodeInvite(rawInvite(payload)),
        JSON.stringify(payload),
      ).toBeNull();
  });

  it("accepts only a host and port, never credentials, schemes, paths or bad ports", () => {
    for (const addr of [
      "",
      "user:secret@192.168.0.10:5000",
      "192.168.0.10:5000@evil.example:80",
      "ws://192.168.0.10:5000",
      "http://192.168.0.10:5000",
      "192.168.0.10:5000/ws",
      "192.168.0.10:5000/../admin",
      "192.168.0.10:5000?room=x",
      "192.168.0.10:5000#x",
      "192.168.0.10:5000 ",
      " 192.168.0.10:5000",
      "192.168.0.10",
      "192.168.0.10:",
      "192.168.0.10:0",
      "192.168.0.10:65536",
      "192.168.0.10:05000",
      "192.168.0.10:abc",
      "fe80::1:5000",
      "[fe80::1%eth0]:5000",
      "[1.2.3.4]:5000",
      "999.1.1.1:5000",
      "evil.127.0.0.1:5000",
      "a..b:5000",
      "-host.example:5000",
      "host-.example:5000",
      "café.example:5000",
      "0.0.0.0:5000",
      "0:5000",
      "[::]:5000",
    ])
      expect(decodeInvite(rawInvite({ addr, room: ROOM })), addr).toBeNull();
  });

  it("canonicalizes the host so the loopback check sees what will be dialed", () => {
    for (const [addr, canonical, host] of [
      ["LOCALHOST:5000", "localhost:5000", "localhost"],
      ["[0:0:0:0:0:0:0:1]:5000", "[::1]:5000", "[::1]"],
      ["[::FFFF:127.0.0.1]:5000", "[::ffff:7f00:1]:5000", "[::ffff:7f00:1]"],
      ["127.1:5000", "127.0.0.1:5000", "127.0.0.1"],
      ["2130706433:5000", "127.0.0.1:5000", "127.0.0.1"],
      ["Mesa-Host.example:443", "mesa-host.example:443", "mesa-host.example"],
      ["192.168.0.10:80", "192.168.0.10:80", "192.168.0.10"],
    ]) {
      const invite = decodeInvite(rawInvite({ addr, room: ROOM }));
      expect(invite?.addr, addr).toBe(canonical);
      expect(inviteHost(invite!)).toBe(host);
    }
  });
});

describe("isLoopback", () => {
  it.each([
    "localhost",
    "LOCALHOST",
    "LocalHost",
    " localhost ",
    "localhost.",
    "mesa.localhost",
    "127.0.0.1",
    "127.255.255.254",
    "127.1",
    "2130706433",
    "0x7f.0.0.1",
    "::1",
    "[::1]",
    "0:0:0:0:0:0:0:1",
    "[0:0:0:0:0:0:0:1]",
    "::ffff:127.0.0.1",
    "[::ffff:7f00:1]",
  ])("treats %s as this machine", (host) => {
    expect(isLoopback(host)).toBe(true);
  });

  it.each([
    "127.example.com",
    "localhost.evil.com",
    "evil-localhost",
    "mylocalhost",
    "128.0.0.1",
    "126.255.255.255",
    "192.168.0.10",
    "0.0.0.0",
    "::",
    "[::]",
    "::2",
    "fe80::1",
    "::7f00:1",
    "::ffff:128.0.0.1",
    "",
    "localhost:5000",
    "[::1]:5000",
    "user@localhost",
    "localhost/ws",
  ])("does not treat %s as this machine", (host) => {
    expect(isLoopback(host)).toBe(false);
  });
});

describe("Mesa room keys and studio URLs", () => {
  afterEach(() => vi.restoreAllMocks());

  it("draws room keys from the CSPRNG in the format invites accept", () => {
    const secure = vi.spyOn(crypto, "getRandomValues");
    const weak = vi.spyOn(Math, "random");
    const keys = new Set(Array.from({ length: 50 }, () => newRoomKey()));
    expect(secure).toHaveBeenCalledTimes(50);
    expect(weak).not.toHaveBeenCalled();
    expect(keys.size).toBe(50);
    for (const room of keys)
      expect(decodeInvite(encodeInvite({ addr: LAN, room }))?.room).toBe(room);
  });

  it("points OBS at the local studio page with the room signaling and the seat id", () => {
    const iceServers = [{ urls: "stun:stun.example:3478" }];
    const url = new URL(
      buildStudioUrl({
        base: "http://127.0.0.1:7000/",
        signalUrl: `ws://${LAN}/ws`,
        room: ROOM,
        selfId: "control-abc",
        layout: "solo",
        peer: "guest-a",
        hideSelf: true,
        labels: true,
        iceServers,
      }),
    );
    expect(`${url.origin}${url.pathname}`).toBe("http://127.0.0.1:7000/studio");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      room: ROOM,
      signal: `ws://${LAN}/ws`,
      self: "control-abc",
      layout: "solo",
      peer: "guest-a",
      hideSelf: "1",
      labels: "1",
      ice: JSON.stringify(iceServers),
    });
    const minimal = new URL(
      buildStudioUrl({
        base: "http://127.0.0.1:7000",
        signalUrl: "ws://127.0.0.1:7000/ws",
        room: ROOM,
        selfId: "control-abc",
        iceServers: [],
      }),
    );
    expect([...minimal.searchParams.keys()]).toEqual([
      "room",
      "signal",
      "self",
    ]);
  });
});

class FakeSocket {
  static readonly OPEN = 1;
  static all: FakeSocket[] = [];
  readonly url: string;
  readyState = 0;
  readonly sent: Record<string, unknown>[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeSocket.all.push(this);
  }

  send(data: string) {
    this.sent.push(JSON.parse(data));
  }

  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.();
  }

  open() {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }

  receive(message: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

class FakePeerConnection {
  static all: FakePeerConnection[] = [];
  connectionState = "new";
  signalingState = "stable";
  localDescription = null;
  onicecandidate = null;
  ontrack = null;
  onconnectionstatechange = null;
  onnegotiationneeded = null;
  closed = false;

  constructor() {
    FakePeerConnection.all.push(this);
  }

  close() {
    this.closed = true;
  }

  restartIce() {}

  async setLocalDescription() {}

  async setRemoteDescription() {}

  async addIceCandidate() {}
}

const echo = ((key: string, vars?: Record<string, string | number>) =>
  vars ? `${key} ${JSON.stringify(vars)}` : key) as MesaClientOpts["t"];
const control = (peerId: string) => ({ peerId, role: "control", name: peerId });
const studio = (peerId: string) => ({ peerId, role: "studio", name: "OBS" });
const many = (count: number, make: (id: string) => object, prefix: string) =>
  Array.from({ length: count }, (_, i) => make(`${prefix}-${i}`));

function setup({ open = true } = {}) {
  const peerLists: MesaPeer[][] = [];
  const statuses: MesaStatus[] = [];
  const errors: string[] = [];
  const client = new MesaClient({
    signalUrl: `ws://${LAN}/ws`,
    room: ROOM,
    name: "Host",
    t: echo,
    onPeers: (peers) => peerLists.push(peers),
    onStatus: (status) => statuses.push(status),
    onError: (message) => errors.push(message),
  });
  client.start();
  const socket = FakeSocket.all[FakeSocket.all.length - 1];
  if (open) socket.open();
  return {
    client,
    socket,
    errors,
    status: () => statuses[statuses.length - 1],
    statuses,
    ids: () => (peerLists[peerLists.length - 1] ?? []).map((peer) => peer.id),
    latestSocket: () => FakeSocket.all[FakeSocket.all.length - 1],
  };
}

describe("MesaClient", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeSocket.all = [];
    FakePeerConnection.all = [];
    vi.stubGlobal("WebSocket", FakeSocket);
    vi.stubGlobal("RTCPeerConnection", FakePeerConnection);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("joins with a private secret and connects to everyone already seated", () => {
    const { client, socket, status, ids } = setup();
    expect(socket.url).toBe(`ws://${LAN}/ws`);
    expect(socket.sent[0]).toEqual({
      t: "join",
      room: ROOM,
      peerId: client.myId,
      role: "control",
      name: "Host",
      secret: expect.stringMatching(/^[\da-f]{32}$/),
    });
    socket.receive({
      t: "welcome",
      peers: [control("guest-a"), studio("studio-a"), control(client.myId)],
    });
    expect(status()).toBe("online");
    expect(FakePeerConnection.all).toHaveLength(2);
    expect(ids()).toEqual(["guest-a", "studio-a"]);
    client.stop();
  });

  it("refuses a seat when the room already seats the maximum, with a localized reason", () => {
    const { socket, status, errors } = setup();
    socket.receive({
      t: "welcome",
      peers: [...many(MESA_MAX_SEATS, control, "guest"), studio("studio-a")],
    });
    expect(status()).toBe("error");
    expect(errors).toEqual([
      `core.mesa.error.roomFull {"max":${MESA_MAX_SEATS}}`,
    ]);
    expect(FakePeerConnection.all).toHaveLength(0);
    expect(socket.readyState).toBe(3);
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.all).toHaveLength(1);
  });

  it("takes the last free seat without counting itself or OBS views", () => {
    const { client, socket, status, ids } = setup();
    socket.receive({
      t: "welcome",
      peers: [
        ...many(MESA_MAX_SEATS - 1, control, "guest"),
        control(client.myId),
        studio("studio-a"),
      ],
    });
    expect(status()).toBe("online");
    expect(ids()).toHaveLength(MESA_MAX_SEATS);
    client.stop();
  });

  it("never opens more connections than the seats allow, whatever the relay announces", () => {
    const { client, socket, ids } = setup();
    socket.receive({
      t: "welcome",
      peers: many(MESA_MAX_SEATS - 1, control, "guest"),
    });
    socket.receive({ t: "peer-join", peer: control("late-guest") });
    for (const peer of many(MESA_MAX_SEATS + 2, studio, "studio"))
      socket.receive({ t: "peer-join", peer });
    socket.receive({
      t: "signal",
      from: "ghost",
      data: { candidate: { candidate: "" } },
    });
    expect(FakePeerConnection.all).toHaveLength(2 * MESA_MAX_SEATS - 1);
    expect(ids()).not.toContain("late-guest");
    expect(ids()).not.toContain("ghost");
    expect(ids().filter((id) => id.startsWith("studio-"))).toHaveLength(
      MESA_MAX_SEATS,
    );
    client.stop();
  });

  it("still answers an unknown sender while seats are free", () => {
    const { client, socket, ids } = setup();
    socket.receive({ t: "welcome", peers: [] });
    socket.receive({
      t: "signal",
      from: "early-guest",
      data: { candidate: { candidate: "" } },
    });
    expect(ids()).toEqual(["early-guest"]);
    client.stop();
  });

  it("frees a seat when a participant leaves", () => {
    const { client, socket, ids } = setup();
    socket.receive({
      t: "welcome",
      peers: many(MESA_MAX_SEATS - 1, control, "guest"),
    });
    socket.receive({ t: "peer-join", peer: control("newcomer") });
    expect(ids()).not.toContain("newcomer");
    socket.receive({ t: "peer-leave", peerId: "guest-0" });
    expect(FakePeerConnection.all[0].closed).toBe(true);
    expect(ids()).not.toContain("guest-0");
    socket.receive({ t: "peer-join", peer: control("newcomer") });
    expect(ids()).toContain("newcomer");
    expect(ids()).toHaveLength(MESA_MAX_SEATS - 1);
    client.stop();
  });

  it("ignores malformed peers and roles the protocol does not define", () => {
    const { client, socket, status, ids } = setup();
    socket.receive({
      t: "welcome",
      peers: [
        { peerId: "admin-1", role: "admin", name: "x" },
        { peerId: 7, role: "control" },
        { peerId: "", role: "control" },
        { role: "control" },
        null,
        "guest",
      ],
    });
    socket.receive({
      t: "peer-join",
      peer: { peerId: "viewer-1", role: "viewer" },
    });
    socket.receive({ t: "peer-join" });
    socket.receive({ t: "welcome", peers: { length: 3 } });
    expect(status()).toBe("online");
    expect(FakePeerConnection.all).toHaveLength(0);
    expect(ids()).toEqual([]);
    client.stop();
  });

  it("drops peers that left while signaling was down and rejoins as the same seat", () => {
    const { client, socket, statuses, ids, latestSocket } = setup();
    socket.receive({
      t: "welcome",
      peers: [control("guest-a"), control("guest-b")],
    });
    socket.close();
    expect(statuses[statuses.length - 1]).toBe("offline");
    vi.advanceTimersByTime(400);
    const again = latestSocket();
    expect(again).not.toBe(socket);
    again.open();
    expect(again.sent[0]).toEqual(socket.sent[0]);
    again.receive({
      t: "welcome",
      peers: [control("guest-b"), control("guest-c")],
    });
    expect(FakePeerConnection.all[0].closed).toBe(true);
    expect(FakePeerConnection.all[1].closed).toBe(false);
    expect(ids()).toEqual(["guest-b", "guest-c"]);
    client.stop();
  });

  it.each([
    ["peer-taken", "core.mesa.error.peerTaken"],
    ["room-closed", "core.mesa.error.joinRefused"],
    [undefined, "core.mesa.error.joinRefused"],
  ])("reports a relay refusal (%s) and stops reconnecting", (code, message) => {
    const { socket, status, errors } = setup();
    socket.receive({ t: "error", code });
    expect(status()).toBe("error");
    expect(errors).toEqual([message]);
    expect(socket.readyState).toBe(3);
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.all).toHaveLength(1);
  });

  it.each([
    [false, "core.mesa.error.hostUnreachable"],
    [true, "core.mesa.error.hostGone"],
  ])(
    "gives up after bounded retries (reached the host before: %s)",
    (welcomed, message) => {
      const { socket, status, errors, latestSocket } = setup({
        open: welcomed,
      });
      if (welcomed) socket.receive({ t: "welcome", peers: [] });
      let closes = 0;
      while (!errors.length && closes < 20) {
        latestSocket().close();
        closes++;
        vi.advanceTimersByTime(5_000);
      }
      expect(errors).toEqual([message]);
      expect(status()).toBe("error");
      expect(closes).toBeLessThan(20);
      expect(FakeSocket.all).toHaveLength(closes);
      vi.advanceTimersByTime(60_000);
      expect(FakeSocket.all).toHaveLength(closes);
    },
  );

  it("stop leaves the room and releases every connection", () => {
    const { client, socket, status, ids } = setup();
    socket.receive({
      t: "welcome",
      peers: [control("guest-a"), studio("studio-a")],
    });
    client.stop();
    expect(socket.sent[socket.sent.length - 1]).toEqual({ t: "leave" });
    expect(FakePeerConnection.all.every((pc) => pc.closed)).toBe(true);
    expect(ids()).toEqual([]);
    expect(status()).toBe("idle");
    expect(socket.readyState).toBe(3);
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.all).toHaveLength(1);
  });
});
