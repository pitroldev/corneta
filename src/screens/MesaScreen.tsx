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
import { Badge, Button, Card, CopyField, EmptyState, Input, SectionTitle, Toggle } from "../components/ui";
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
        <span className="truncate font-display text-sm font-bold text-white">{label}</span>
        {sub && <span className="shrink-0 text-[11px] font-semibold text-white/70">{sub}</span>}
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
            <Badge tone={online ? "live" : "warn"}>
              {online ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}
              {online ? "na mesa" : mesa.status}
            </Badge>
          ) : undefined
        }
      />

      {!IS_TAURI && (
        <Card className="mb-6 border-l-4 border-warn bg-warn/10">
          <div className="text-sm font-semibold text-ink">
            Modo demonstração — a Mesa de verdade só roda no app instalado. Aqui dá pra testar a câmera e ver a interface.
          </div>
        </Card>
      )}

      {/* Câmera + dispositivos (sempre visível) */}
      <Card className="mb-6" accent>
        <div className="grid gap-5 md:grid-cols-[280px_1fr]">
          <div>
            <VideoTile stream={mesa.localStream} muted label="Você" sub={mesa.micOn ? undefined : "mudo"} />
            <div className="mt-3 flex gap-2">
              <Button
                variant={mesa.camOn ? "subtle" : "danger"}
                size="sm"
                onClick={mesa.toggleCam}
                disabled={!mesa.localStream}
                className="flex-1"
              >
                {mesa.camOn ? <Video className="size-4" /> : <VideoOff className="size-4" />}
                {mesa.camOn ? "Câmera" : "Sem vídeo"}
              </Button>
              <Button
                variant={mesa.micOn ? "subtle" : "danger"}
                size="sm"
                onClick={mesa.toggleMic}
                disabled={!mesa.localStream}
                className="flex-1"
              >
                {mesa.micOn ? <Mic className="size-4" /> : <MicOff className="size-4" />}
                {mesa.micOn ? "Mic" : "Mudo"}
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {!mesa.localStream ? (
              <Button variant="primary" onClick={() => void mesa.openLocal()} className="self-start">
                <Camera className="size-4" /> Ligar minha câmera
              </Button>
            ) : (
              <div className="text-sm font-semibold text-ok">Câmera ligada ✓</div>
            )}

            {mesa.camError && (
              <div className="rounded-md border-l-4 border-bad bg-bad/10 p-3">
                <div className="flex items-center gap-2 text-sm font-bold text-bad">
                  <ShieldAlert className="size-4" /> {mesa.camError}
                </div>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => void mesa.openPrivacy("camera")}>
                    Abrir privacidade (câmera)
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void mesa.openPrivacy("microphone")}>
                    Abrir privacidade (microfone)
                  </Button>
                </div>
              </div>
            )}

            <div>
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-faint">Câmera</span>
              <Select
                aria-label="Câmera"
                value={mesa.cameraId || "default"}
                onChange={(v) => void mesa.setCamera(v === "default" ? "" : v)}
                options={[
                  { value: "default", label: "Padrão" },
                  ...mesa.devices.cameras
                    .filter((d) => d.deviceId)
                    .map((d) => ({ value: d.deviceId, label: d.label || "Câmera" })),
                ]}
              />
            </div>
            <div>
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-faint">Microfone</span>
              <Select
                aria-label="Microfone"
                value={mesa.micId || "default"}
                onChange={(v) => void mesa.setMic(v === "default" ? "" : v)}
                options={[
                  { value: "default", label: "Padrão" },
                  ...mesa.devices.mics
                    .filter((d) => d.deviceId)
                    .map((d) => ({ value: d.deviceId, label: d.label || "Microfone" })),
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
            <div className="mb-2 flex items-center gap-2">
              <div className="grid size-9 place-items-center rounded-md bg-brass text-brass-ink pop-brass">
                <Plus className="size-5" strokeWidth={2.6} />
              </div>
              <h3 className="text-xl">Criar uma Mesa</h3>
            </div>
            <p className="mb-4 text-sm text-ink-muted">
              Você vira o host. A Corneta gera um <b>convite</b> — manda pra galera, eles entram, e as
              câmeras chegam direto na sua máquina.
            </p>
            <label className="mb-3 block">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-faint">
                Seu nome na Mesa
              </span>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex.: Pitrol" />
            </label>
            <Button variant="primary" className="mt-auto" onClick={() => void mesa.host(name || "Host")}>
              <Users className="size-4" /> Abrir a Mesa
            </Button>
          </Card>

          <Card pop className="flex flex-col">
            <div className="mb-2 flex items-center gap-2">
              <div className="grid size-9 place-items-center rounded-md bg-surface-3 text-ink">
                <LogIn className="size-5" strokeWidth={2.6} />
              </div>
              <h3 className="text-xl">Entrar numa Mesa</h3>
            </div>
            <p className="mb-4 text-sm text-ink-muted">
              Recebeu um convite? Cola aqui pra entrar na Mesa de outro streamer.
            </p>
            <label className="mb-3 block">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-faint">Convite</span>
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
              onClick={() => void mesa.join(joinCode.trim(), name || "Convidado")}
            >
              <LogIn className="size-4" /> Entrar
            </Button>
          </Card>
        </div>
      ) : (
        // -------------------- Mesa ativa --------------------
        <div className="flex flex-col gap-6">
          {mesa.mode === "host" && mesa.invite && (
            <Card accent>
              <h3 className="mb-1 text-lg">Convite da Mesa</h3>
              <p className="mb-3 text-sm text-ink-muted">
                Manda esse código pra galera entrar. Na mesma rede conecta na hora; pela internet, o host precisa estar alcançável — relay tá vindo.
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
              <VideoTile stream={mesa.localStream} muted label={`${name || "Você"} (você)`} />
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
                  <MonitorPlay className="size-5 text-brass" /> Levar a Mesa pro OBS
                </h3>
                <p className="max-w-md text-sm text-ink-muted">
                  Entra como Browser Source na sua cena atual, cada um num slot fixo. É só posicionar.
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                {mesa.obsAdded ? (
                  <Button variant="danger" onClick={() => void mesa.removeFromObs()}>
                    <MonitorX className="size-4" /> Tirar do OBS
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    disabled={!online || !mesa.myId}
                    onClick={() => void mesa.addToObs()}
                  >
                    <MonitorPlay className="size-4" /> Adicionar no OBS
                  </Button>
                )}
                <label className="flex items-center gap-2 text-xs font-semibold text-ink-muted">
                  <Toggle checked={mesa.hideSelf} onChange={mesa.setHideSelf} label="Esconder minha câmera na grade" />
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
            <EmptyState title="Mesa cheia pesa no upload">
              Acima de ~5 no P2P direto, a banda de todo mundo sofre. Modo servidor (SFU) pra mesas grandes tá vindo.
            </EmptyState>
          )}
        </div>
      )}
    </div>
  );
}
