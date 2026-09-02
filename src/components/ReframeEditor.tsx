import { useEffect, useRef, useState } from "react";
import { bold, useI18n } from "../lib/i18n";
import { Camera, Check, Crosshair, X } from "lucide-react";
import { api } from "../lib/api";
import { useStore } from "../lib/store";
import { toast } from "../lib/toast";
import { Modal } from "./Modal";
import { PLATFORMS } from "../lib/platforms";
import type { Target } from "../lib/types";
import { Button } from "./ui";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** Editor de enquadramento vertical: recorta um 9:16 do sinal landscape. */
export function ReframeEditor({
  target,
  onClose,
}: {
  target: Target;
  onClose: () => void;
}) {
  const { t, fmt } = useI18n();
  const updateTarget = useStore((s) => s.updateTarget);
  const preset =
    target.encoding.preset ?? PLATFORMS[target.platformId].recommended;
  const ar = preset.width / preset.height; // < 1 (portrait), ex.: 0.5625

  const init = target.encoding.reframe ?? { x: 0.5, y: 0.5, zoom: 1 };
  const [x, setX] = useState(init.x);
  const [y, setY] = useState(init.y);
  const [zoom, setZoom] = useState(init.zoom);
  const [frame, setFrame] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    px: number;
    py: number;
    left: number;
    top: number;
  } | null>(null);
  const rafId = useRef<number | null>(null);
  const pendingXY = useRef<{ x: number; y: number } | null>(null);

  // Dimensões do recorte como fração do palco (16:9).
  const cropW = Math.min(1, zoom * ar * (9 / 16));
  const cropH = zoom;
  const left = x * (1 - cropW);
  const top = y * (1 - cropH);

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, left, top };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current || !stageRef.current) return;
    const r = stageRef.current.getBoundingClientRect();
    const nl = clamp(
      drag.current.left + (e.clientX - drag.current.px) / r.width,
      0,
      1 - cropW,
    );
    const nt = clamp(
      drag.current.top + (e.clientY - drag.current.py) / r.height,
      0,
      1 - cropH,
    );
    pendingXY.current = {
      x: 1 - cropW > 0 ? nl / (1 - cropW) : 0.5,
      y: 1 - cropH > 0 ? nt / (1 - cropH) : 0.5,
    };
    if (rafId.current == null) {
      rafId.current = requestAnimationFrame(() => {
        rafId.current = null;
        if (pendingXY.current) {
          setX(pendingXY.current.x);
          setY(pendingXY.current.y);
        }
      });
    }
  };
  const onPointerUp = () => {
    drag.current = null;
    if (rafId.current != null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
    if (pendingXY.current) {
      setX(pendingXY.current.x);
      setY(pendingXY.current.y);
      pendingXY.current = null;
    }
  };
  useEffect(
    () => () => {
      if (rafId.current != null) cancelAnimationFrame(rafId.current);
    },
    [],
  );

  const capture = async () => {
    setCapturing(true);
    try {
      const b64 = await api.captureFrame(t);
      setFrame(`data:image/jpeg;base64,${b64}`);
    } catch (e) {
      toast.error(`${e}`.replace("Error: ", ""));
    } finally {
      setCapturing(false);
    }
  };

  const save = () => {
    updateTarget(target.id, {
      encoding: { ...target.encoding, reframe: { x, y, zoom } },
    });
    toast.success(t("platforms.reframe.saved.toast"));
    onClose();
  };

  // "Tem vídeo do OBS chegando?" — é o bit que o Rust publica no snapshot, não a
  // contagem de viewers do chat (que pode existir sem OBS e faltar com OBS). Serve só
  // pra escolher a dica: o botão de captura fica sempre ligado e, sem sinal, o backend
  // responde com o aviso certo.
  const ingestLive = useStore((s) => s.snapshot.ingestLive ?? false);
  // Mudou algo? (pra não descartar sem querer no clique fora)
  const dirty =
    x !== init.x || y !== init.y || zoom !== init.zoom || frame != null;
  const nudge = (dx: number, dy: number) => {
    setX((v) => clamp(v + dx, 0, 1));
    setY((v) => clamp(v + dy, 0, 1));
  };

  const bg = frame
    ? { backgroundImage: `url(${frame})`, backgroundSize: "cover" }
    : undefined;
  // Mini-preview do 9:16 final: mostra só a região recortada do frame.
  const previewStyle = frame
    ? {
        backgroundImage: `url(${frame})`,
        backgroundSize: `${100 / cropW}% ${100 / cropH}%`,
        backgroundPosition: `${x * 100}% ${y * 100}%`,
      }
    : undefined;

  return (
    <Modal
      title={t("platforms.reframe.title")}
      onClose={onClose}
      lockOutside={dirty}
      className="max-w-3xl rounded-xl bg-surface p-6 pop"
    >
      <div className="mb-1 flex items-center justify-between">
        <h3 id="reframe-title" className="flex items-center gap-2 text-xl">
          <Crosshair className="size-5 text-brass" />{" "}
          {t("platforms.reframe.titleWithTarget", { target: target.name })}
        </h3>
        <button
          onClick={onClose}
          className="text-ink-faint hover:text-ink"
          aria-label={t("platforms.reframe.close")}
        >
          <X className="size-5" />
        </button>
      </div>
      <p className="mb-4 text-sm text-ink-muted">
        {bold(t, "platforms.reframe.lede", {
          size: `${preset.width}×${preset.height}`,
        })}
      </p>

      <div className="flex flex-col gap-4 sm:flex-row">
        {/* Palco 16:9 com o recorte arrastável */}
        <div className="flex-1">
          <div
            ref={stageRef}
            className="relative aspect-video w-full select-none overflow-hidden rounded-md border-2 border-border bg-surface-2"
            style={bg}
          >
            {!frame && <GhostScene />}
            <ThirdsGrid />
            <button
              type="button"
              aria-label={t("platforms.reframe.crop.aria")}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onKeyDown={(e) => {
                const step = e.shiftKey ? 0.1 : 0.01;
                if (e.key === "ArrowLeft") {
                  e.preventDefault();
                  nudge(-step, 0);
                } else if (e.key === "ArrowRight") {
                  e.preventDefault();
                  nudge(step, 0);
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  nudge(0, -step);
                } else if (e.key === "ArrowDown") {
                  e.preventDefault();
                  nudge(0, step);
                }
              }}
              className="absolute cursor-grab touch-none rounded-[3px] border-2 border-brass active:cursor-grabbing"
              style={{
                left: `${left * 100}%`,
                top: `${top * 100}%`,
                width: `${cropW * 100}%`,
                height: `${cropH * 100}%`,
                boxShadow: "0 0 0 9999px rgba(11,8,5,0.55)",
              }}
            >
              <span className="absolute -top-px left-1/2 -translate-x-1/2 -translate-y-full rounded-t bg-brass px-1.5 text-[10px] font-extrabold text-brass-ink">
                9:16
              </span>
            </button>
            {!frame && (
              <span className="pointer-events-none absolute left-2 top-2 z-10 rounded bg-brass-ink/75 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brass">
                {t("platforms.reframe.preview")}
              </span>
            )}
          </div>

          <div className="mt-3 flex items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-wide text-ink-faint">
              {t("platforms.reframe.zoom")}
            </span>
            <input
              type="range"
              min={0.4}
              max={1}
              step={0.01}
              value={1.4 - zoom}
              aria-label={t("platforms.reframe.zoom")}
              onChange={(e) =>
                setZoom(Number((1.4 - Number(e.target.value)).toFixed(2)))
              }
              className="flex-1 accent-brass"
            />
            <span className="w-9 text-right text-xs font-bold tabular-nums text-ink-muted">
              {fmt.dec(1 / zoom)}×
            </span>
            <Button
              variant="subtle"
              size="sm"
              onClick={() => {
                setX(0.5);
                setY(0.5);
                setZoom(1);
              }}
            >
              {t("platforms.reframe.center")}
            </Button>
          </div>
        </div>

        {/* Preview do resultado 9:16 */}
        <div className="flex flex-col items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wide text-ink-faint">
            {t("platforms.reframe.result")}
          </span>
          <div
            className="relative grid h-56 place-items-center overflow-hidden rounded-md border-2 border-border bg-surface-2 [aspect-ratio:9/16]"
            style={previewStyle}
          >
            {!frame && <GhostScene />}
            {!frame && (
              <span className="relative z-10 px-2 text-center text-[11px] font-bold text-ink-faint">
                9:16
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={capture}
          loading={capturing}
        >
          {!capturing && <Camera className="size-4" />}
          {t("platforms.reframe.capture")}
        </Button>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t("platforms.reframe.cancel")}
          </Button>
          <Button variant="primary" size="sm" onClick={save}>
            <Check className="size-4" /> {t("platforms.reframe.save")}
          </Button>
        </div>
      </div>
      <p className="mt-2 text-center text-xs text-ink-faint">
        {ingestLive
          ? t("platforms.reframe.hint.live")
          : t("platforms.reframe.hint.offline")}
      </p>
    </Modal>
  );
}

// Cena-fantasma: sem frame do OBS, mostra uma silhueta (busto) centralizada pra você
// já enxergar onde o recorte 9:16 vai cair. Latão suave de fundo, contorno duro do tema.
function GhostScene() {
  return (
    <svg
      viewBox="0 0 320 180"
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none absolute inset-0 size-full"
      aria-hidden
    >
      <circle
        cx="160"
        cy="78"
        r="60"
        fill="var(--color-brass)"
        opacity="0.07"
      />
      <g fill="var(--color-ink-faint)" opacity="0.22">
        <circle cx="160" cy="74" r="30" />
        <path d="M104 182 C104 142 130 120 160 120 C190 120 216 142 216 182 Z" />
      </g>
      <line
        x1="20"
        y1="150"
        x2="300"
        y2="150"
        stroke="var(--color-ink-faint)"
        strokeWidth="1.5"
        opacity="0.2"
        strokeDasharray="5 6"
      />
    </svg>
  );
}

function ThirdsGrid() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 size-full text-ink-faint/40"
      aria-hidden
    >
      <line
        x1="33.33%"
        y1="0"
        x2="33.33%"
        y2="100%"
        stroke="currentColor"
        strokeWidth="1"
      />
      <line
        x1="66.66%"
        y1="0"
        x2="66.66%"
        y2="100%"
        stroke="currentColor"
        strokeWidth="1"
      />
      <line
        x1="0"
        y1="33.33%"
        x2="100%"
        y2="33.33%"
        stroke="currentColor"
        strokeWidth="1"
      />
      <line
        x1="0"
        y1="66.66%"
        x2="100%"
        y2="66.66%"
        stroke="currentColor"
        strokeWidth="1"
      />
    </svg>
  );
}
