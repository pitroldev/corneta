import { useEffect, useRef, useState } from "react";
import {
  Users,
  Plus,
  LogIn,
  Video,
  VideoOff,
  Mic,
  MicOff,
  MonitorPlay,
  MonitorX,
  Power,
  Camera,
  ShieldAlert,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useMesa } from "../lib/mesaStore";
import { IS_TAURI } from "../lib/api";
import type { MesaPeer } from "../lib/mesa";
import { cn } from "../lib/utils";
import { useT, type MessageKey } from "../lib/i18n";
import {
  Badge,
  Button,
  Card,
  CopyField,
  Input,
  SectionTitle,
  Toggle,
} from "../components/ui";
import { Select } from "../components/Select";

function VideoTile({
  stream,
  muted,
  label,
  sub,
  down,
}: {
  stream: MediaStream | null;
  muted?: boolean;
  label: string;
  sub?: string;
  down?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && el.srcObject !== (stream ?? null)) el.srcObject = stream ?? null;
  }, [stream]);
  const empty = !stream || down;
  return (
    <div className="relative aspect-video overflow-hidden rounded-lg bg-night pop">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- The live MediaStream source provides no caption track. */}
      <video
        ref={ref}
        aria-label={label}
        autoPlay
        playsInline
        muted={muted}
        className={cn("size-full object-cover", empty && "invisible")}
      />
      {empty && (
        <div className="absolute inset-0 grid place-items-center bg-night text-center">
          <div>
            <div className="-rotate-3 bg-brass px-3 py-1 font-display text-xl font-extrabold text-brass-ink shadow-[4px_4px_0_#0b0805]">
              JÁ VOLTO
            </div>
          </div>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-6">
        <span className="truncate font-display text-sm font-bold text-white">
          {label}
        </span>
        {sub && (
          <span className="shrink-0 text-[11px] font-semibold text-white/70">
            {sub}
          </span>
        )}
      </div>
    </div>
  );
}

const CONN_LABEL: Record<string, { key: MessageKey; down: boolean }> = {
  new: { key: "platforms.mesa.conn.connecting", down: true },
  connecting: { key: "platforms.mesa.conn.connecting", down: true },
  connected: { key: "platforms.mesa.conn.live", down: false },
  disconnected: { key: "platforms.mesa.conn.dropped", down: true },
  failed: { key: "platforms.mesa.conn.dropped", down: true },
  closed: { key: "platforms.mesa.conn.left", down: true },
};

const STATUS_LABEL: Record<string, MessageKey> = {
  idle: "platforms.mesa.status.idle",
  connecting: "platforms.mesa.status.connecting",
  online: "platforms.mesa.status.online",
  offline: "platforms.mesa.status.offline",
  error: "platforms.mesa.status.error",
};

const BRASS = "var(--color-brass)";
const TOMATO = "var(--color-tomato)";
const INK = "var(--color-brass-ink)";

function Cam({
  x,
  y,
  w,
  h,
  frame = BRASS,
  live = false,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  frame?: string;
  live?: boolean;
}) {
  const id = `cam${Math.round(x)}_${Math.round(y)}`;
  const cx = x + w / 2;
  const rx = Math.min(6, w * 0.14);
  return (
    <g>
      <defs>
        <clipPath id={id}>
          <rect x={x} y={y} width={w} height={h} rx={rx} />
        </clipPath>
      </defs>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={rx}
        fill="var(--color-surface)"
        stroke={frame}
        strokeWidth="3"
      />
      <g clipPath={`url(#${id})`} fill={frame}>
        <circle cx={cx} cy={y + h * 0.44} r={h * 0.17} />
        <ellipse cx={cx} cy={y + h * 1.02} rx={w * 0.32} ry={h * 0.3} />
      </g>
      {live && (
        <circle
          cx={x + w - 8}
          cy={y + 8}
          r="3.5"
          fill={TOMATO}
          stroke="var(--color-surface)"
          strokeWidth="1.2"
        />
      )}
    </g>
  );
}

function HostHubArt() {
  const t = useT();
  const guests: [number, number][] = [
    [16, 8],
    [16, 37],
    [16, 66],
  ];
  return (
    <svg viewBox="0 0 260 96" className="h-full w-full" aria-hidden>
      <g
        stroke={BRASS}
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {guests.map(([gx, gy]) => (
          <path
            key={gy}
            d={`M${gx + 40} ${gy + 11} C 112 ${gy + 11} 120 48 166 48`}
          />
        ))}
        <path d="M156 41 L170 48 L156 55" />
      </g>
      {guests.map(([gx, gy]) => (
        <Cam key={gy} x={gx} y={gy} w={40} h={22} frame={TOMATO} />
      ))}
      <Cam x={172} y={24} w={70} h={48} frame={BRASS} live />
      <rect x={180} y={56} width={54} height={13} rx={3} fill={INK} />
      <text
        x={207}
        y={66}
        textAnchor="middle"
        fontSize="9"
        fontWeight="800"
        fill={BRASS}
        letterSpacing="1"
      >
        {t("platforms.mesa.art.you")}
      </text>
    </svg>
  );
}

function GuestTicketArt() {
  const t = useT();
  return (
    <svg viewBox="0 0 260 96" className="h-full w-full" aria-hidden>
      <g transform="rotate(-7 70 48)">
        <rect
          x="20"
          y="28"
          width="100"
          height="40"
          rx="7"
          fill={BRASS}
          stroke={INK}
          strokeWidth="2.5"
        />
        <line
          x1="94"
          y1="28"
          x2="94"
          y2="68"
          stroke={INK}
          strokeWidth="2"
          strokeDasharray="4 4"
        />
        <text
          x="57"
          y="45"
          textAnchor="middle"
          fontSize="8"
          fontWeight="800"
          fill={INK}
          letterSpacing="1.5"
        >
          {t("platforms.mesa.art.invite")}
        </text>
        <text
          x="57"
          y="60"
          textAnchor="middle"
          fontSize="14"
          fontWeight="900"
          fill={INK}
        >
          MESA1
        </text>
        <g fill={INK}>
          <circle cx="107" cy="40" r="2.3" />
          <circle cx="107" cy="48" r="2.3" />
          <circle cx="107" cy="56" r="2.3" />
        </g>
      </g>
      <g
        stroke={TOMATO}
        strokeWidth="3.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M134 48 H168" />
        <path d="M160 40 L170 48 L160 56" />
      </g>
      <Cam x={182} y={9} w={40} h={28} frame={BRASS} live />
      <Cam x={182} y={50} w={40} h={28} frame={BRASS} />
      <Cam x={226} y={30} w={30} h={34} frame={TOMATO} />
    </svg>
  );
}

function MeshArt() {
  const n = 5;
  const cx = 70;
  const cy = 68;
  const r = 46;
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as [number, number];
  });
  const edges: [number, number][] = [];
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) edges.push([i, j]);
  return (
    <svg viewBox="0 0 140 140" className="size-full" aria-hidden>
      <g stroke={TOMATO} strokeWidth="1.6" opacity="0.6">
        {edges.map(([i, j]) => (
          <line
            key={`${i}-${j}`}
            x1={pts[i][0]}
            y1={pts[i][1]}
            x2={pts[j][0]}
            y2={pts[j][1]}
          />
        ))}
      </g>
      {pts.map(([x, y], i) => (
        <Cam
          key={i}
          x={x - 16}
          y={y - 12}
          w={32}
          h={24}
          frame={i === 0 ? BRASS : TOMATO}
          live={i === 0}
        />
      ))}
    </svg>
  );
}

export function MesaScreen() {
  const t = useT();
  const mesa = useMesa();
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem("corneta.mesa.name") || "";
    } catch {
      return "";
    }
  });
  const [joinCode, setJoinCode] = useState("");

  useEffect(() => {
    try {
      localStorage.setItem("corneta.mesa.name", name);
    } catch {
      /* Storage may be unavailable; keep the name for this visit. */
    }
  }, [name]);

  useEffect(() => {
    void mesa.refreshDevices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const online = mesa.status === "online";
  // Only control peers are participants; studio peers are OBS infrastructure.
  const participants = mesa.peers.filter((p) => p.role === "control");

  return (
    <div className="mx-auto max-w-5xl">
      <SectionTitle
        kicker={t("platforms.mesa.kicker")}
        title={t("platforms.mesa.title")}
        subtitle={t("platforms.mesa.subtitle")}
        right={
          mesa.active ? (
            <Badge
              tone={online ? "live" : mesa.status === "error" ? "bad" : "warn"}
            >
              {online ? (
                <Wifi className="size-3.5" />
              ) : (
                <WifiOff className="size-3.5" />
              )}
              {STATUS_LABEL[mesa.status]
                ? t(STATUS_LABEL[mesa.status])
                : mesa.status}
            </Badge>
          ) : undefined
        }
      />

      {!IS_TAURI && (
        <Card className="mb-6 border-l-4 border-warn bg-warn/10">
          <div className="text-sm font-semibold text-ink">
            {t("platforms.mesa.demoNotice")}
          </div>
        </Card>
      )}

      {mesa.serverError && (
        <Card className="mb-6 border-l-4 border-bad bg-bad/10">
          <div className="flex items-center gap-2 text-sm font-bold text-bad">
            <WifiOff className="size-4" /> {mesa.serverError}
          </div>
        </Card>
      )}

      <Card className="mb-6" accent>
        <div className="grid gap-5 md:grid-cols-[280px_1fr]">
          <div>
            <VideoTile
              stream={mesa.localStream}
              muted
              label={t("platforms.mesa.you")}
              sub={mesa.micOn ? undefined : t("platforms.mesa.muted")}
            />
            <div className="mt-3 flex gap-2">
              <Button
                variant={mesa.camOn ? "subtle" : "danger"}
                size="sm"
                onClick={mesa.toggleCam}
                disabled={!mesa.localStream}
                className="flex-1"
              >
                {mesa.camOn ? (
                  <Video className="size-4" />
                ) : (
                  <VideoOff className="size-4" />
                )}
                {mesa.camOn
                  ? t("platforms.mesa.cam.on")
                  : t("platforms.mesa.cam.off")}
              </Button>
              <Button
                variant={mesa.micOn ? "subtle" : "danger"}
                size="sm"
                onClick={mesa.toggleMic}
                disabled={!mesa.localStream}
                className="flex-1"
              >
                {mesa.micOn ? (
                  <Mic className="size-4" />
                ) : (
                  <MicOff className="size-4" />
                )}
                {mesa.micOn
                  ? t("platforms.mesa.mic.on")
                  : t("platforms.mesa.mic.off")}
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {!mesa.localStream ? (
              <Button
                variant="primary"
                onClick={() => void mesa.openLocal(t)}
                className="self-start"
              >
                <Camera className="size-4" /> {t("platforms.mesa.openCam")}
              </Button>
            ) : (
              <div className="text-sm font-semibold text-ok">
                {t("platforms.mesa.camOn")}
              </div>
            )}

            {mesa.camError && (
              <div className="rounded-md border-l-4 border-bad bg-bad/10 p-3">
                <div className="flex items-center gap-2 text-sm font-bold text-bad">
                  <ShieldAlert className="size-4" /> {mesa.camError}
                </div>
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void mesa.openPrivacy("camera")}
                  >
                    {t("platforms.mesa.privacy.camera")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void mesa.openPrivacy("microphone")}
                  >
                    {t("platforms.mesa.privacy.mic")}
                  </Button>
                </div>
              </div>
            )}

            {!mesa.active && (
              <div>
                <label
                  htmlFor="mesa-name"
                  className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-faint"
                >
                  {t("platforms.mesa.nameLabel")}
                </label>
                <Input
                  id="mesa-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("platforms.mesa.namePlaceholder")}
                />
              </div>
            )}

            <div>
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-faint">
                {t("platforms.mesa.cameraLabel")}
              </span>
              <Select
                aria-label={t("platforms.mesa.cameraLabel")}
                value={mesa.cameraId || "default"}
                onChange={(v) =>
                  void mesa.setCamera(v === "default" ? "" : v, t)
                }
                options={[
                  {
                    value: "default",
                    label: t("platforms.mesa.deviceDefault"),
                  },
                  ...mesa.devices.cameras
                    .filter(
                      (d) =>
                        d.deviceId &&
                        d.deviceId !== "default" &&
                        d.deviceId !== "communications",
                    )
                    .map((d) => ({
                      value: d.deviceId,
                      label: d.label || t("platforms.mesa.cameraLabel"),
                    })),
                ]}
              />
            </div>
            <div>
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-faint">
                {t("platforms.mesa.micLabel")}
              </span>
              <Select
                aria-label={t("platforms.mesa.micLabel")}
                value={mesa.micId || "default"}
                onChange={(v) => void mesa.setMic(v === "default" ? "" : v, t)}
                options={[
                  {
                    value: "default",
                    label: t("platforms.mesa.deviceDefault"),
                  },
                  ...mesa.devices.mics
                    .filter(
                      (d) =>
                        d.deviceId &&
                        d.deviceId !== "default" &&
                        d.deviceId !== "communications",
                    )
                    .map((d) => ({
                      value: d.deviceId,
                      label: d.label || t("platforms.mesa.micLabel"),
                    })),
                ]}
              />
            </div>
          </div>
        </div>
      </Card>

      {!mesa.active ? (
        <div className="grid gap-5 md:grid-cols-2">
          <Card pop className="flex flex-col">
            <div className="mb-3 h-24 w-full overflow-hidden rounded-md bg-surface-2 ring-1 ring-border">
              <HostHubArt />
            </div>
            <div className="mb-2 flex items-center gap-2">
              <div className="grid size-9 place-items-center rounded-md bg-brass text-brass-ink pop-brass">
                <Plus className="size-5" strokeWidth={2.6} />
              </div>
              <h3 className="text-xl">{t("platforms.mesa.host.title")}</h3>
            </div>
            <p className="mb-4 text-sm text-ink-muted">
              {t("platforms.mesa.host.body")}
            </p>
            <Button
              variant="primary"
              className="mt-auto"
              onClick={() =>
                void mesa.host(name || t("platforms.mesa.hostDefaultName"), t)
              }
            >
              <Users className="size-4" /> {t("platforms.mesa.host.cta")}
            </Button>
          </Card>

          <Card pop className="flex flex-col">
            <div className="mb-3 h-24 w-full overflow-hidden rounded-md bg-surface-2 ring-1 ring-border">
              <GuestTicketArt />
            </div>
            <div className="mb-2 flex items-center gap-2">
              <div className="grid size-9 place-items-center rounded-md bg-surface-3 text-ink">
                <LogIn className="size-5" strokeWidth={2.6} />
              </div>
              <h3 className="text-xl">{t("platforms.mesa.join.title")}</h3>
            </div>
            <p className="mb-2 text-sm text-ink-muted">
              {t("platforms.mesa.join.body")}
            </p>
            <p className="mb-4 text-xs text-ink-faint">
              {t("platforms.mesa.join.note")}
            </p>
            <label className="mb-3 block">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-faint">
                {t("platforms.mesa.invite.label")}
              </span>
              <Input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="MESA1.xxxxx…"
                className="font-mono"
              />
            </label>
            <Button
              variant="tomato"
              className="mt-auto"
              disabled={!joinCode.trim()}
              onClick={() =>
                void mesa.join(
                  joinCode.trim(),
                  name || t("platforms.mesa.guestDefaultName"),
                  t,
                )
              }
            >
              <LogIn className="size-4" /> {t("platforms.mesa.join.cta")}
            </Button>
          </Card>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {mesa.lastError && (
            <Card className="border-l-4 border-bad bg-bad/10">
              <div className="flex items-center gap-2 text-sm font-bold text-bad">
                <WifiOff className="size-4" /> {mesa.lastError}
              </div>
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => mesa.retry()}
                >
                  {t("platforms.mesa.retry")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void mesa.leave()}
                >
                  <Power className="size-4" /> {t("platforms.mesa.leave")}
                </Button>
              </div>
            </Card>
          )}

          {mesa.mode === "host" && mesa.invite && (
            <Card accent>
              <h3 className="mb-1 text-lg">
                {t("platforms.mesa.invite.title")}
              </h3>
              <p className="mb-3 text-sm text-ink-muted">
                {t("platforms.mesa.invite.body")}
              </p>
              <CopyField
                label={t("platforms.mesa.invite.label")}
                value={mesa.invite}
                mono
              />
            </Card>
          )}

          <div>
            <div className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-faint">
              <Users className="size-4" />{" "}
              {t("platforms.mesa.grid.count", { n: participants.length + 1 })}
            </div>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              <VideoTile
                stream={mesa.localStream}
                muted
                label={t("platforms.mesa.grid.self", {
                  name: name || t("platforms.mesa.you"),
                })}
              />
              {participants.map((p: MesaPeer) => {
                const c = CONN_LABEL[p.connection] ?? CONN_LABEL.connecting;
                return (
                  <VideoTile
                    key={p.id}
                    stream={p.stream}
                    label={p.name || t("platforms.mesa.guest")}
                    sub={t(c.key)}
                    down={c.down}
                  />
                );
              })}
            </div>
            {participants.length === 0 && (
              <p className="mt-3 text-sm text-ink-faint">
                {t("platforms.mesa.waiting")}
              </p>
            )}
          </div>

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="mb-1 flex items-center gap-2 text-lg">
                  <MonitorPlay className="size-5 text-brass" />{" "}
                  {t("platforms.mesa.obs.title")}
                </h3>
                <p className="max-w-md text-sm text-ink-muted">
                  {t("platforms.mesa.obs.body")}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                {mesa.obsAdded ? (
                  <Button
                    variant="danger"
                    onClick={() => void mesa.removeFromObs(t)}
                  >
                    <MonitorX className="size-4" />{" "}
                    {t("platforms.mesa.obs.remove")}
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    disabled={!online || !mesa.myId}
                    title={
                      !online || !mesa.myId
                        ? t("platforms.mesa.obs.waitTitle")
                        : undefined
                    }
                    onClick={() => void mesa.addToObs(t)}
                  >
                    <MonitorPlay className="size-4" />{" "}
                    {t("platforms.mesa.obs.add")}
                  </Button>
                )}
                <label className="flex items-center gap-2 text-xs font-semibold text-ink-muted">
                  <Toggle
                    checked={mesa.hideSelf}
                    onChange={(v) => mesa.setHideSelf(v, t)}
                    label={t("platforms.mesa.hideSelfAria")}
                  />
                  {t("platforms.mesa.hideSelfLabel")}
                </label>
              </div>
            </div>
          </Card>

          <div>
            <Button variant="outline" onClick={() => void mesa.leave()}>
              <Power className="size-4" /> {t("platforms.mesa.leave")}
            </Button>
          </div>

          {participants.length >= 5 && (
            <Card className="flex flex-col items-center gap-4 border-l-4 border-warn sm:flex-row sm:items-start">
              <div className="size-28 shrink-0">
                <MeshArt />
              </div>
              <div className="min-w-0">
                <h3 className="font-display text-lg font-extrabold">
                  {t("platforms.mesa.full.title")}
                </h3>
                <p className="mt-1 text-sm text-ink-muted">
                  {t("platforms.mesa.full.body")}
                </p>
                <div className="mt-3 max-w-xs">
                  <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wide">
                    <span className="text-ink-faint">
                      {t("platforms.mesa.full.uploadLabel")}
                    </span>
                    <span className="text-bad">
                      {t("platforms.mesa.full.uploadValue")}
                    </span>
                  </div>
                  <div className="flex gap-0.5">
                    {Array.from({ length: 12 }).map((_, i) => (
                      <div
                        key={i}
                        className={cn(
                          "h-3 flex-1 rounded-[1px]",
                          i < 8 ? "bg-brass" : "bg-tomato",
                        )}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
