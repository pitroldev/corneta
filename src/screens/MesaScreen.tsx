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

// Tile de vídeo: anexa a MediaStream via ref. Sem stream, mostra o slate "JÁ VOLTO".
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
      <video
        ref={ref}
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

const CONN_LABEL: Record<string, { text: string; down: boolean }> = {
  new: { text: "ligando…", down: true },
  connecting: { text: "ligando…", down: true },
  connected: { text: "no ar", down: false },
  disconnected: { text: "caiu", down: true },
  failed: { text: "caiu", down: true },
  closed: { text: "saiu", down: true },
};

// MesaStatus em pt-BR (o badge do topo — senão vaza "connecting"/"offline" cru).
const STATUS_LABEL: Record<string, string> = {
  idle: "fora",
  connecting: "conectando…",
  online: "na mesa",
  offline: "reconectando…",
  error: "deu ruim",
};

// ---- Ilustrações da Mesa: tudo em "tiles" de webcam (moldura + busto) ----
// Latão = você / a Mesa; tomate = a galera / o destaque; brass-ink = contorno duro.
const BRASS = "var(--color-brass)";
const TOMATE = "var(--color-tomate)";
const INK = "var(--color-brass-ink)";

/** Tile de webcam: moldura + silhueta (cabeça + ombros), recortada na própria moldura. */
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
          fill={TOMATE}
          stroke="var(--color-surface)"
          strokeWidth="1.2"
        />
      )}
    </g>
  );
}

// Criar: as câmeras da galera (tomate) convergem na SUA (latão, ao vivo) — você é o host.
function HostHubArt() {
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
        <Cam key={gy} x={gx} y={gy} w={40} h={22} frame={TOMATE} />
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
        VOCÊ
      </text>
    </svg>
  );
}

// Entrar: seu convite (ingresso MESA) entra numa Mesa já formada (cluster de câmeras).
function GuestTicketArt() {
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
          CONVITE
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
        stroke={TOMATE}
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
      <Cam x={226} y={30} w={30} h={34} frame={TOMATE} />
    </svg>
  );
}

// Mesa cheia: webcams de todo mundo ligadas a todo mundo (mesh P2P). A teia tomate fica
// densa demais — é o que pesa no upload acima de ~5.
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
      <g stroke={TOMATE} strokeWidth="1.6" opacity="0.6">
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
          frame={i === 0 ? BRASS : TOMATE}
          live={i === 0}
        />
      ))}
    </svg>
  );
}

export function MesaScreen() {
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
      /* ignore */
    }
  }, [name]);

  // Tenta listar dispositivos ao abrir (rótulos só aparecem após permissão).
  useEffect(() => {
    void mesa.refreshDevices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const online = mesa.status === "online";
  // Só "control" são participantes; "studio" são as páginas do OBS (infra), não entram na grade.
  const participants = mesa.peers.filter((p) => p.role === "control");

  return (
    <div className="mx-auto max-w-5xl">
      <SectionTitle
        kicker="Mesa · co-stream"
        title="Chama a galera pra Mesa"
        subtitle="Webcam de cada um direto P2P, em alta — sem call do Discord, sem mosaico borrado. E quem cai vira 'JÁ VOLTO' no lugar, sem quebrar a sua cena."
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
              {STATUS_LABEL[mesa.status] ?? mesa.status}
            </Badge>
          ) : undefined
        }
      />

      {!IS_TAURI && (
        <Card className="mb-6 border-l-4 border-warn bg-warn/10">
          <div className="text-sm font-semibold text-ink">
            Modo demonstração — a Mesa de verdade só roda no app instalado. Aqui
            dá pra testar a câmera e ver a interface.
          </div>
        </Card>
      )}

      {/* Falha do servidor local — card próprio (não é problema de câmera/privacidade) */}
      {mesa.serverError && (
        <Card className="mb-6 border-l-4 border-bad bg-bad/10">
          <div className="flex items-center gap-2 text-sm font-bold text-bad">
            <WifiOff className="size-4" /> {mesa.serverError}
          </div>
        </Card>
      )}

      {/* Câmera + dispositivos (sempre visível) */}
      <Card className="mb-6" accent>
        <div className="grid gap-5 md:grid-cols-[280px_1fr]">
          <div>
            <VideoTile
              stream={mesa.localStream}
              muted
              label="Você"
              sub={mesa.micOn ? undefined : "mudo"}
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
                {mesa.camOn ? "Câmera" : "Sem vídeo"}
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
                {mesa.micOn ? "Mic" : "Mudo"}
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {!mesa.localStream ? (
              <Button
                variant="primary"
                onClick={() => void mesa.openLocal()}
                className="self-start"
              >
                <Camera className="size-4" /> Ligar minha câmera
              </Button>
            ) : (
              <div className="text-sm font-semibold text-ok">
                Câmera ligada ✓
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
                    Abrir privacidade (câmera)
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void mesa.openPrivacy("microphone")}
                  >
                    Abrir privacidade (microfone)
                  </Button>
                </div>
              </div>
            )}

            {/* Nome fora dos cards Criar/Entrar: vale pros DOIS fluxos (o convidado também
                aparece com ele na grade — antes ele entrava como "Convidado" sem saber). */}
            {!mesa.active && (
              <div>
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-faint">
                  Seu nome na Mesa
                </span>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ex.: Pitrol"
                />
              </div>
            )}

            <div>
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-faint">
                Câmera
              </span>
              <Select
                aria-label="Câmera"
                value={mesa.cameraId || "default"}
                onChange={(v) => void mesa.setCamera(v === "default" ? "" : v)}
                options={[
                  { value: "default", label: "Padrão" },
                  ...mesa.devices.cameras
                    .filter(
                      (d) =>
                        d.deviceId &&
                        d.deviceId !== "default" &&
                        d.deviceId !== "communications",
                    )
                    .map((d) => ({
                      value: d.deviceId,
                      label: d.label || "Câmera",
                    })),
                ]}
              />
            </div>
            <div>
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-faint">
                Microfone
              </span>
              <Select
                aria-label="Microfone"
                value={mesa.micId || "default"}
                onChange={(v) => void mesa.setMic(v === "default" ? "" : v)}
                options={[
                  { value: "default", label: "Padrão" },
                  ...mesa.devices.mics
                    .filter(
                      (d) =>
                        d.deviceId &&
                        d.deviceId !== "default" &&
                        d.deviceId !== "communications",
                    )
                    .map((d) => ({
                      value: d.deviceId,
                      label: d.label || "Microfone",
                    })),
                ]}
              />
            </div>
          </div>
        </div>
      </Card>

      {!mesa.active ? (
        // -------------------- Lobby --------------------
        <div className="grid gap-5 md:grid-cols-2">
          <Card pop className="flex flex-col">
            <div className="mb-3 h-24 w-full overflow-hidden rounded-md bg-surface-2 ring-1 ring-border">
              <HostHubArt />
            </div>
            <div className="mb-2 flex items-center gap-2">
              <div className="grid size-9 place-items-center rounded-md bg-brass text-brass-ink pop-brass">
                <Plus className="size-5" strokeWidth={2.6} />
              </div>
              <h3 className="text-xl">Criar uma Mesa</h3>
            </div>
            <p className="mb-4 text-sm text-ink-muted">
              Você vira o host. A Corneta gera um <b>convite</b> — manda pra
              galera, eles entram, e as câmeras chegam direto na sua máquina.
            </p>
            <Button
              variant="primary"
              className="mt-auto"
              onClick={() => void mesa.host(name || "Host")}
            >
              <Users className="size-4" /> Abrir a Mesa
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
              <h3 className="text-xl">Entrar numa Mesa</h3>
            </div>
            <p className="mb-2 text-sm text-ink-muted">
              Recebeu um convite? Cola aqui pra entrar na Mesa de outro
              streamer.
            </p>
            <p className="mb-4 text-xs text-ink-faint">
              Por enquanto funciona na mesma rede (ou com o host acessível pela
              internet) — relay tá vindo.
            </p>
            <label className="mb-3 block">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-faint">
                Convite
              </span>
              <Input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="MESA1.xxxxx…"
                className="font-mono"
              />
            </label>
            <Button
              variant="tomate"
              className="mt-auto"
              disabled={!joinCode.trim()}
              onClick={() =>
                void mesa.join(joinCode.trim(), name || "Convidado")
              }
            >
              <LogIn className="size-4" /> Entrar
            </Button>
          </Card>
        </div>
      ) : (
        // -------------------- Mesa ativa --------------------
        <div className="flex flex-col gap-6">
          {/* Erro de conexão/sala: destacado, com saída — antes morria no console */}
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
                  Tentar de novo
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void mesa.leave()}
                >
                  <Power className="size-4" /> Sair da Mesa
                </Button>
              </div>
            </Card>
          )}

          {mesa.mode === "host" && mesa.invite && (
            <Card accent>
              <h3 className="mb-1 text-lg">Convite da Mesa</h3>
              <p className="mb-3 text-sm text-ink-muted">
                Manda esse código pra galera entrar. Na mesma rede conecta na
                hora; pela internet, o host precisa estar alcançável — relay tá
                vindo.
              </p>
              <CopyField label="Convite" value={mesa.invite} mono />
            </Card>
          )}

          {/* Grade de participantes */}
          <div>
            <div className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-faint">
              <Users className="size-4" /> Na Mesa ({participants.length + 1})
            </div>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              <VideoTile
                stream={mesa.localStream}
                muted
                label={`${name || "Você"} (você)`}
              />
              {participants.map((p: MesaPeer) => {
                const c = CONN_LABEL[p.connection] ?? CONN_LABEL.connecting;
                return (
                  <VideoTile
                    key={p.id}
                    stream={p.stream}
                    label={p.name || "convidado"}
                    sub={c.text}
                    down={c.down}
                  />
                );
              })}
            </div>
            {participants.length === 0 && (
              <p className="mt-3 text-sm text-ink-faint">
                Esperando a galera entrar com o convite…
              </p>
            )}
          </div>

          {/* OBS + opções */}
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="mb-1 flex items-center gap-2 text-lg">
                  <MonitorPlay className="size-5 text-brass" /> Levar a Mesa pro
                  OBS
                </h3>
                <p className="max-w-md text-sm text-ink-muted">
                  Entra como Browser Source na sua cena atual, cada um num slot
                  fixo. É só posicionar.
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                {mesa.obsAdded ? (
                  <Button
                    variant="danger"
                    onClick={() => void mesa.removeFromObs()}
                  >
                    <MonitorX className="size-4" /> Tirar do OBS
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    disabled={!online || !mesa.myId}
                    title={
                      !online || !mesa.myId
                        ? "Conectando à Mesa… libero assim que conectar"
                        : undefined
                    }
                    onClick={() => void mesa.addToObs()}
                  >
                    <MonitorPlay className="size-4" /> Adicionar no OBS
                  </Button>
                )}
                <label className="flex items-center gap-2 text-xs font-semibold text-ink-muted">
                  <Toggle
                    checked={mesa.hideSelf}
                    onChange={mesa.setHideSelf}
                    label="Esconder minha câmera na grade"
                  />
                  esconder minha câmera na grade
                </label>
              </div>
            </div>
          </Card>

          <div>
            <Button variant="outline" onClick={() => void mesa.leave()}>
              <Power className="size-4" /> Sair da Mesa
            </Button>
          </div>

          {participants.length >= 5 && (
            <Card className="flex flex-col items-center gap-4 border-l-4 border-warn sm:flex-row sm:items-start">
              <div className="size-28 shrink-0">
                <MeshArt />
              </div>
              <div className="min-w-0">
                <h3 className="font-display text-lg font-extrabold">
                  Mesa cheia pesa no upload
                </h3>
                <p className="mt-1 text-sm text-ink-muted">
                  No P2P direto cada câmera sai pra todo mundo — a conta de
                  conexões explode e seu upload vai no talo passando de ~5. Modo
                  servidor (SFU) pra mesas grandes tá vindo.
                </p>
                <div className="mt-3 max-w-xs">
                  <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wide">
                    <span className="text-ink-faint">seu upload</span>
                    <span className="text-bad">no talo</span>
                  </div>
                  <div className="flex gap-0.5">
                    {Array.from({ length: 12 }).map((_, i) => (
                      <div
                        key={i}
                        className={cn(
                          "h-3 flex-1 rounded-[1px]",
                          i < 8 ? "bg-brass" : "bg-tomate",
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
