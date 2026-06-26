import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Camera, Check, Crosshair, X } from "lucide-react";
import { api } from "../lib/api";
import { useStore } from "../lib/store";
import { useDialog } from "../lib/useDialog";
import { toast } from "../lib/toast";
import { PLATFORMS } from "../lib/platforms";
import type { Target } from "../lib/types";
import { Button } from "./ui";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Editor de enquadramento vertical: recorta um 9:16 do sinal landscape. */
export function ReframeEditor({ target, onClose }: { target: Target; onClose: () => void }) {
  const updateTarget = useStore((s) => s.updateTarget);
  const preset = target.encoding.preset ?? PLATFORMS[target.platformId].recommended;
  const ar = preset.width / preset.height; // < 1 (portrait), ex.: 0.5625

  const init = target.encoding.reframe ?? { x: 0.5, y: 0.5, zoom: 1 };
  const [x, setX] = useState(init.x);
  const [y, setY] = useState(init.y);
  const [zoom, setZoom] = useState(init.zoom);
  const [frame, setFrame] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ px: number; py: number; left: number; top: number } | null>(null);

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
    const nl = clamp(drag.current.left + (e.clientX - drag.current.px) / r.width, 0, 1 - cropW);
    const nt = clamp(drag.current.top + (e.clientY - drag.current.py) / r.height, 0, 1 - cropH);
    setX(1 - cropW > 0 ? nl / (1 - cropW) : 0.5);
    setY(1 - cropH > 0 ? nt / (1 - cropH) : 0.5);
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const capture = async () => {
    setCapturing(true);
    try {
      const b64 = await api.captureFrame();
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
    toast.success("Enquadramento salvo");
    onClose();
  };

  const dialogRef = useDialog<HTMLDivElement>(true, onClose);
  const anyLive = useStore((s) => s.viewers.anyLive);
  // Mudou algo? (pra não descartar sem querer no clique fora)
  const dirty = x !== init.x || y !== init.y || zoom !== init.zoom || frame != null;
  const nudge = (dx: number, dy: number) => {
    setX((v) => clamp(v + dx, 0, 1));
    setY((v) => clamp(v + dy, 0, 1));
  };

  const bg = frame ? { backgroundImage: `url(${frame})`, backgroundSize: "cover" } : undefined;
  // Mini-preview do 9:16 final: mostra só a região recortada do frame.
  const previewStyle = frame
    ? {
        backgroundImage: `url(${frame})`,
        backgroundSize: `${100 / cropW}% ${100 / cropH}%`,
        backgroundPosition: `${x * 100}% ${y * 100}%`,
      }
    : undefined;

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-night/80 p-6"
      onClick={() => {
        if (!dirty) onClose();
      }}
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reframe-title"
        tabIndex={-1}
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl rounded-xl bg-surface p-6 pop outline-none"
      >
        <div className="mb-1 flex items-center justify-between">
          <h3 id="reframe-title" className="flex items-center gap-2 text-xl">
            <Crosshair className="size-5 text-brass" /> Enquadrar vertical · {target.name}
          </h3>
          <button onClick={onClose} className="text-ink-faint hover:text-ink" aria-label="Fechar">
            <X className="size-5" />
          </button>
        </div>
        <p className="mb-4 text-sm text-ink-muted">
          Arraste o quadro pra escolher que parte do seu vídeo vai pro{" "}
          <strong className="text-ink">{preset.width}×{preset.height}</strong> (vertical). Capture um
          frame do OBS pra enquadrar exatamente.
        </p>

        <div className="flex flex-col gap-4 sm:flex-row">
          {/* Palco 16:9 com o recorte arrastável */}
          <div className="flex-1">
            <div
              ref={stageRef}
              className="relative aspect-video w-full select-none overflow-hidden rounded-md border-2 border-border bg-surface-2"
              style={bg}
            >
              <ThirdsGrid />
              <div
                tabIndex={0}
                role="group"
                aria-label="Recorte vertical — arraste ou use as setas (Shift = 10%)"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onKeyDown={(e) => {
                  const step = e.shiftKey ? 0.1 : 0.01;
                  if (e.key === "ArrowLeft") (e.preventDefault(), nudge(-step, 0));
                  else if (e.key === "ArrowRight") (e.preventDefault(), nudge(step, 0));
                  else if (e.key === "ArrowUp") (e.preventDefault(), nudge(0, -step));
                  else if (e.key === "ArrowDown") (e.preventDefault(), nudge(0, step));
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
              </div>
            </div>

            <div className="mt-3 flex items-center gap-3">
              <span className="text-xs font-bold uppercase tracking-wide text-ink-faint">Zoom</span>
              <input
                type="range"
                min={0.4}
                max={1}
                step={0.01}
                value={1.4 - zoom}
                aria-label="Zoom"
                onChange={(e) => setZoom(Number((1.4 - Number(e.target.value)).toFixed(2)))}
                className="flex-1 accent-brass"
              />
              <span className="w-9 text-right text-xs font-bold tabular-nums text-ink-muted">
                {(1 / zoom).toFixed(1).replace(".", ",")}×
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
                Do zero
              </Button>
            </div>
          </div>

          {/* Preview do resultado 9:16 */}
          <div className="flex flex-col items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-ink-faint">
              Vai sair assim
            </span>
            <div
              className="grid h-56 place-items-center overflow-hidden rounded-md border-2 border-border bg-surface-2 [aspect-ratio:9/16]"
              style={previewStyle}
            >
              {!frame && <span className="px-2 text-center text-[11px] text-ink-faint">9:16</span>}
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={capture}
            loading={capturing}
            disabled={capturing || !anyLive}
            title={!anyLive ? "Disponível com o OBS ao vivo" : undefined}
          >
            {!capturing && <Camera className="size-4" />}
            Capturar frame do OBS
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" size="sm" onClick={save}>
              <Check className="size-4" /> Salvar
            </Button>
          </div>
        </div>
        <p className="mt-2 text-center text-xs text-ink-faint">
          {anyLive
            ? "Capture um frame do OBS pra enquadrar exatamente."
            : "💡 A captura de frame fica disponível com o OBS ao vivo. Sem frame, use a grade pra posicionar."}
        </p>
      </motion.div>
    </div>
  );
}

function ThirdsGrid() {
  return (
    <svg className="pointer-events-none absolute inset-0 size-full text-ink-faint/40" aria-hidden>
      <line x1="33.33%" y1="0" x2="33.33%" y2="100%" stroke="currentColor" strokeWidth="1" />
      <line x1="66.66%" y1="0" x2="66.66%" y2="100%" stroke="currentColor" strokeWidth="1" />
      <line x1="0" y1="33.33%" x2="100%" y2="33.33%" stroke="currentColor" strokeWidth="1" />
      <line x1="0" y1="66.66%" x2="100%" y2="66.66%" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}
