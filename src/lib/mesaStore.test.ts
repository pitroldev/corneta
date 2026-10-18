import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { I18n } from "./i18n";
import {
  decodeInvite,
  encodeInvite,
  newRoomKey,
  type MesaClientOpts,
} from "./mesa";
import type { useMesa as UseMesa } from "./mesaStore";

const api = vi.hoisted(() => ({
  mesaStartServer: vi.fn(),
  mesaStopServer: vi.fn(),
  mesaObsAddSource: vi.fn(),
  mesaObsRemoveSource: vi.fn(),
  openPrivacySettings: vi.fn(),
}));
const env = vi.hoisted(() => ({ tauri: true }));
const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}));
const fakes = vi.hoisted(() => {
  class FakeMesaClient {
    readonly myId: string;
    readonly opts: MesaClientOpts;
    readonly start = vi.fn();
    readonly stop = vi.fn();
    readonly setLocalStream = vi.fn();
    readonly setCameraEnabled = vi.fn();
    readonly setMicEnabled = vi.fn();

    constructor(opts: MesaClientOpts) {
      this.opts = opts;
      this.myId = `control-${clients.length + 1}`;
      clients.push(this);
    }
  }
  const clients: FakeMesaClient[] = [];
  return {
    clients,
    FakeMesaClient,
    openCamera: vi.fn(),
    listDevices: vi.fn(),
  };
});

vi.mock("./api", () => ({
  api,
  get IS_TAURI() {
    return env.tauri;
  },
}));
vi.mock("./toast", () => ({ toast }));
vi.mock("./mesa", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./mesa")>()),
  MesaClient: fakes.FakeMesaClient,
  openCamera: fakes.openCamera,
  listDevices: fakes.listDevices,
}));

const t = ((key: string) => key) as I18n["t"];
const GUEST_ADDR = "192.168.0.20:41234";

function fakeStream() {
  const video = { enabled: true, stop: vi.fn() };
  const audio = { enabled: true, stop: vi.fn() };
  const stream = {
    getTracks: () => [video, audio],
    getVideoTracks: () => [video],
    getAudioTracks: () => [audio],
  } as unknown as MediaStream;
  return { stream, video, audio };
}

describe("Mesa store", () => {
  let useMesa: typeof UseMesa;

  beforeEach(async () => {
    vi.resetAllMocks();
    vi.resetModules();
    fakes.clients.length = 0;
    env.tauri = true;
    ({ useMesa } = await import("./mesaStore"));
    fakes.listDevices.mockResolvedValue({ cameras: [], mics: [] });
    fakes.openCamera.mockResolvedValue(fakeStream().stream);
    api.mesaStartServer.mockResolvedValue({
      port: 7000,
      lanIp: "192.168.0.10",
    });
    api.mesaStopServer.mockResolvedValue(undefined);
    api.mesaObsAddSource.mockResolvedValue(undefined);
    api.mesaObsRemoveSource.mockResolvedValue(undefined);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => vi.restoreAllMocks());

  const joinGuest = async (room = newRoomKey()) => {
    const code = encodeInvite({ addr: GUEST_ADDR, room, title: "Host" });
    await useMesa.getState().join(code, "Guest", t);
    return { code, room, client: fakes.clients[0] };
  };

  it("refuses a malformed invite before opening the camera or a server", async () => {
    await useMesa.getState().join("MESA1.not-an-invite", "Guest", t);
    expect(toast.error).toHaveBeenCalledWith("core.mesa.invite.invalid");
    expect(fakes.openCamera).not.toHaveBeenCalled();
    expect(api.mesaStartServer).not.toHaveBeenCalled();
    expect(useMesa.getState().active).toBe(false);
  });

  it.each([
    "127.0.0.1:5000",
    "127.8.9.10:5000",
    "LOCALHOST:5000",
    "[::1]:5000",
    "[0:0:0:0:0:0:0:1]:5000",
    "[::ffff:127.0.0.1]:5000",
    "127.1:5000",
    "mesa.localhost:5000",
  ])(
    "refuses an invite that points back at this machine (%s)",
    async (addr) => {
      await useMesa
        .getState()
        .join(encodeInvite({ addr, room: newRoomKey() }), "Guest", t);
      expect(toast.error).toHaveBeenCalledWith("core.mesa.invite.loopback");
      expect(fakes.openCamera).not.toHaveBeenCalled();
      expect(api.mesaStartServer).not.toHaveBeenCalled();
      expect(fakes.clients).toHaveLength(0);
    },
  );

  it("joins a LAN host through the canonical invite address", async () => {
    const { stream } = fakeStream();
    fakes.openCamera.mockResolvedValue(stream);
    const room = newRoomKey();
    const code = encodeInvite({ addr: "Mesa-Host.LAN:41234", room });
    await useMesa.getState().join(code, "Guest", t);
    const [client] = fakes.clients;
    expect(client.opts).toMatchObject({
      signalUrl: "ws://mesa-host.lan:41234/ws",
      room,
      name: "Guest",
    });
    expect(client.setLocalStream).toHaveBeenCalledWith(stream);
    expect(client.start).toHaveBeenCalledOnce();
    expect(useMesa.getState()).toMatchObject({
      active: true,
      mode: "guest",
      room,
      signalUrl: "ws://mesa-host.lan:41234/ws",
      localPort: 7000,
      invite: code,
      myId: client.myId,
      localStream: stream,
    });
  });

  it("requires the installed app to host or join", async () => {
    env.tauri = false;
    await useMesa
      .getState()
      .join(encodeInvite({ addr: GUEST_ADDR, room: newRoomKey() }), "Guest", t);
    await useMesa.getState().host("Host", t);
    expect(toast.error).toHaveBeenCalledTimes(2);
    expect(toast.error).toHaveBeenCalledWith("core.mesa.needsInstalledApp");
    expect(api.mesaStartServer).not.toHaveBeenCalled();
    expect(fakes.openCamera).not.toHaveBeenCalled();
  });

  it("does not issue a loopback invite when there is no LAN address", async () => {
    const { stream, video, audio } = fakeStream();
    fakes.openCamera.mockResolvedValue(stream);
    api.mesaStartServer.mockResolvedValue({ port: 7000, lanIp: "127.0.0.1" });
    await useMesa.getState().host("Host", t);
    expect(toast.error).toHaveBeenCalledWith("core.mesa.noLanNetwork");
    expect(api.mesaStopServer).toHaveBeenCalledOnce();
    expect(video.stop).toHaveBeenCalled();
    expect(audio.stop).toHaveBeenCalled();
    expect(fakes.clients).toHaveLength(0);
    expect(useMesa.getState()).toMatchObject({
      active: false,
      invite: null,
      localStream: null,
    });
  });

  it("hosts a room whose invite guests can decode, even without a camera", async () => {
    fakes.openCamera.mockRejectedValue(
      new DOMException("synthetic", "NotAllowedError"),
    );
    await useMesa.getState().host("Host", t);
    const state = useMesa.getState();
    expect(decodeInvite(state.invite!)).toEqual({
      addr: "192.168.0.10:7000",
      room: state.room,
      title: "Host",
    });
    expect(state).toMatchObject({
      active: true,
      mode: "host",
      signalUrl: "ws://127.0.0.1:7000/ws",
      localPort: 7000,
      camError: "core.mesa.camera.blocked",
    });
    expect(fakes.clients[0].opts).toMatchObject({
      signalUrl: "ws://127.0.0.1:7000/ws",
      room: state.room,
      name: "Host",
    });
  });

  it("releases the camera when the local server cannot start", async () => {
    const { stream, video } = fakeStream();
    fakes.openCamera.mockResolvedValue(stream);
    api.mesaStartServer.mockRejectedValue(new Error("synthetic port in use"));
    await joinGuest();
    expect(video.stop).toHaveBeenCalled();
    expect(fakes.clients).toHaveLength(0);
    expect(useMesa.getState()).toMatchObject({
      active: false,
      serverError: "core.mesa.server.startFailed",
      localStream: null,
    });
  });

  it.each([
    ["NotAllowedError", "core.mesa.camera.blocked"],
    ["NotReadableError", "core.mesa.camera.busy"],
    ["OverconstrainedError", "core.mesa.camera.failed"],
  ])("explains a %s camera failure", async (name, message) => {
    const error = new DOMException("synthetic", name);
    fakes.openCamera.mockRejectedValue(error);
    await expect(useMesa.getState().openLocal(t)).rejects.toBe(error);
    expect(useMesa.getState().camError).toBe(message);
    expect(toast.error).toHaveBeenCalledWith(message);
  });

  it("keeps the previous camera when switching devices fails", async () => {
    useMesa.setState({ cameraId: "camera-1" });
    fakes.openCamera.mockRejectedValue(
      new DOMException("synthetic", "NotReadableError"),
    );
    await useMesa.getState().setCamera("camera-2", t);
    expect(fakes.openCamera).toHaveBeenCalledWith({
      cameraId: "camera-2",
      micId: undefined,
    });
    expect(useMesa.getState().cameraId).toBe("camera-1");
  });

  it("mutes the local tracks and the outgoing ones together", async () => {
    const { stream, video, audio } = fakeStream();
    fakes.openCamera.mockResolvedValue(stream);
    const { client } = await joinGuest();
    useMesa.getState().toggleCam();
    useMesa.getState().toggleMic();
    expect(video.enabled).toBe(false);
    expect(audio.enabled).toBe(false);
    expect(client.setCameraEnabled).toHaveBeenCalledWith(false);
    expect(client.setMicEnabled).toHaveBeenCalledWith(false);
    expect(useMesa.getState()).toMatchObject({ camOn: false, micOn: false });
  });

  it("surfaces client errors and clears them once back online", async () => {
    const { client } = await joinGuest();
    client.opts.onError?.("synthetic refusal");
    expect(toast.error).toHaveBeenCalledWith("synthetic refusal");
    expect(useMesa.getState().lastError).toBe("synthetic refusal");
    client.opts.onStatus("offline");
    expect(useMesa.getState().lastError).toBe("synthetic refusal");
    client.opts.onStatus("online");
    expect(useMesa.getState()).toMatchObject({
      status: "online",
      lastError: null,
    });
  });

  it("retries with the same client instead of starting another one", async () => {
    const { client } = await joinGuest();
    useMesa.setState({ lastError: "synthetic refusal" });
    useMesa.getState().retry();
    expect(client.stop).toHaveBeenCalledOnce();
    expect(client.start).toHaveBeenCalledTimes(2);
    expect(fakes.clients).toHaveLength(1);
    expect(useMesa.getState().lastError).toBeNull();
  });

  it("adds this seat's studio page to OBS over loopback", async () => {
    const { room, client } = await joinGuest();
    await useMesa.getState().addToObs(t);
    const [url, width, height] = api.mesaObsAddSource.mock.calls[0];
    const studio = new URL(url);
    expect(`${studio.origin}${studio.pathname}`).toBe(
      "http://127.0.0.1:7000/studio",
    );
    expect(studio.searchParams.get("signal")).toBe(`ws://${GUEST_ADDR}/ws`);
    expect(studio.searchParams.get("room")).toBe(room);
    expect(studio.searchParams.get("self")).toBe(client.myId);
    expect([width, height]).toEqual([1920, 1080]);
    expect(useMesa.getState().obsAdded).toBe(true);
    expect(toast.success).toHaveBeenCalledWith("core.mesa.obs.added");
  });

  it("leave releases the client, camera, OBS source and server", async () => {
    const { stream, video, audio } = fakeStream();
    fakes.openCamera.mockResolvedValue(stream);
    const { client } = await joinGuest();
    await useMesa.getState().leave();
    expect(client.stop).toHaveBeenCalledOnce();
    expect(video.stop).toHaveBeenCalled();
    expect(audio.stop).toHaveBeenCalled();
    expect(api.mesaObsRemoveSource).toHaveBeenCalledOnce();
    expect(api.mesaStopServer).toHaveBeenCalledOnce();
    expect(useMesa.getState()).toMatchObject({
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
    });
  });
});
