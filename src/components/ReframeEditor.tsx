import { useEffect, useRef, useState, type CSSProperties } from "react";
import { bold, useI18n } from "../lib/i18n";
import { Camera, Check, Crosshair, X } from "lucide-react";
import { api } from "../lib/api";
import { useStore } from "../lib/store";
import { toast } from "../lib/toast";
import { Modal } from "./Modal";
import { PLATFORMS } from "../lib/platforms";
import {
  DEFAULT_SPLIT_TOP,
  SPLIT_RATIO,
  cropFractions,
  splitHeights,
  splitParts,
} from "../lib/reframe";
import type { CropBox, Reframe, Target } from "../lib/types";
import { cn } from "../lib/utils";
import { Button } from "./ui";

type RegionId = "main" | "camera";
type Layout = "single" | "split";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** The main frame keeps its original slider floor; a webcam in a corner needs a tighter crop. */
const ZOOM_FLOOR: Record<RegionId, number> = { main: 0.4, camera: 0.15 };
const CENTERED: Record<RegionId, CropBox> = {
  main: { x: 0.5, y: 0.5, zoom: 1 },
  camera: { x: 0.5, y: 0.5, zoom: DEFAULT_SPLIT_TOP.zoom },
};

interface Geometry {
  w: number;
  h: number;
  left: number;
  top: number;
}

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

  const init: Reframe = target.encoding.reframe ?? { x: 0.5, y: 0.5, zoom: 1 };
  const initSplit = splitParts(init);
  const [layout, setLayout] = useState<Layout>(
    init.layout === "split" ? "split" : "single",
  );
  const [regions, setRegions] = useState<Record<RegionId, CropBox>>({
    main: { x: init.x, y: init.y, zoom: init.zoom },
    camera: initSplit.top,
  });
  const [ratio, setRatio] = useState(initSplit.ratio);
  const [active, setActive] = useState<RegionId>("main");
  const [frame, setFrame] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);

  const heights =
    layout === "split" ? splitHeights(preset.height, ratio) : null;
  const split = heights !== null;
  const shown: RegionId[] = split ? ["camera", "main"] : ["main"];
  const focus: RegionId = split ? active : "main";

  const geometry = (id: RegionId): Geometry => {
    const region = regions[id];
    const ar = heights
      ? preset.width / (id === "camera" ? heights[0] : heights[1])
      : preset.width / preset.height;
    const { w, h } = cropFractions(region.zoom, ar, split);
    return { w, h, left: region.x * (1 - w), top: region.y * (1 - h) };
  };
  const setRegion = (id: RegionId, patch: Partial<CropBox>) =>
    setRegions((r) => ({ ...r, [id]: { ...r[id], ...patch } }));

  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<
    ({ id: RegionId; px: number; py: number } & Geometry) | null
  >(null);
  const rafId = useRef<number | null>(null);
  const pendingXY = useRef<{ id: RegionId; x: number; y: number } | null>(null);
  const flush = () => {
    const pending = pendingXY.current;
    if (pending) setRegion(pending.id, { x: pending.x, y: pending.y });
  };

  const onPointerDown = (id: RegionId) => (e: React.PointerEvent) => {
    setActive(id);
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id, px: e.clientX, py: e.clientY, ...geometry(id) };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !stageRef.current) return;
    const r = stageRef.current.getBoundingClientRect();
    const nl = clamp(d.left + (e.clientX - d.px) / r.width, 0, 1 - d.w);
    const nt = clamp(d.top + (e.clientY - d.py) / r.height, 0, 1 - d.h);
    pendingXY.current = {
      id: d.id,
      x: 1 - d.w > 0 ? nl / (1 - d.w) : 0.5,
      y: 1 - d.h > 0 ? nt / (1 - d.h) : 0.5,
    };
    if (rafId.current == null) {
      rafId.current = requestAnimationFrame(() => {
        rafId.current = null;
        flush();
      });
    }
  };
  const onPointerUp = () => {
    drag.current = null;
    if (rafId.current != null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
    flush();
    pendingXY.current = null;
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

  // A reframe that never used the split saves exactly as before.
  const result = (): Reframe =>
    layout === "split" || init.layout || init.top
      ? {
          ...regions.main,
          layout,
          top: regions.camera,
          splitRatio: ratio,
        }
      : { ...regions.main };

  const save = () => {
    updateTarget(target.id, {
      encoding: { ...target.encoding, reframe: result() },
    });
    toast.success(t("platforms.reframe.saved.toast"));
    onClose();
  };

  // Use the native ingest flag; chat viewer counts do not indicate an OBS signal.
  const ingestLive = useStore((s) => s.snapshot.ingestLive ?? false);
  const dirty =
    JSON.stringify(result()) !== JSON.stringify(init) || frame != null;
  const nudge = (id: RegionId, dx: number, dy: number) =>
    setRegions((r) => ({
      ...r,
      [id]: {
        ...r[id],
        x: clamp(r[id].x + dx, 0, 1),
        y: clamp(r[id].y + dy, 0, 1),
      },
    }));

  const regionName = (id: RegionId) =>
    id === "camera"
      ? t("platforms.reframe.region.camera")
      : t("platforms.reframe.region.main");
  const cropLabel = (id: RegionId) =>
    !split
      ? t("platforms.reframe.crop.aria")
      : id === "camera"
        ? t("platforms.reframe.camera.aria")
        : t("platforms.reframe.main.aria");

  const regionBackground = (id: RegionId): CSSProperties | undefined => {
    if (!frame) return undefined;
    const g = geometry(id);
    const r = regions[id];
    return {
      backgroundImage: `url(${frame})`,
      backgroundSize: `${100 / g.w}% ${100 / g.h}%`,
      backgroundPosition: `${r.x * 100}% ${r.y * 100}%`,
    };
  };
  const stageBackground = frame
    ? { backgroundImage: `url(${frame})`, backgroundSize: "cover" }
    : undefined;
  const floor = ZOOM_FLOOR[focus];
  const zoom = regions[focus].zoom;
  const layouts: { id: Layout; label: string }[] = [
    { id: "single", label: t("platforms.reframe.layout.single") },
    { id: "split", label: t("platforms.reframe.layout.split") },
  ];

  return (
    <Modal
      title={t("platforms.reframe.title")}
      onClose={onClose}
      lockOutside={dirty}
      // The 16:9 stage grows with the width, so short windows narrow the modal to keep the footer in view.
      className="max-w-3xl rounded-xl bg-surface p-6 pop [@media(max-height:640px)]:max-w-2xl [@media(max-height:640px)]:p-5"
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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 [@media(max-height:640px)]:mb-3">
        <p className="min-w-0 flex-1 text-sm text-ink-muted">
          {bold(
            t,
            split ? "platforms.reframe.lede.split" : "platforms.reframe.lede",
            { size: `${preset.width}×${preset.height}` },
          )}
        </p>
        <div
          role="group"
          aria-label={t("platforms.reframe.layout.aria")}
          className="inline-flex shrink-0 rounded-md border-2 border-border p-0.5"
        >
          {layouts.map((l) => (
            <button
              key={l.id}
              type="button"
              aria-pressed={layout === l.id}
              onClick={() => {
                setLayout(l.id);
                setActive(l.id === "split" ? "camera" : "main");
              }}
              className={cn(
                "rounded px-3 py-1 text-xs font-bold transition-colors",
                layout === l.id
                  ? "bg-brass text-brass-ink"
                  : "text-ink-muted hover:text-ink",
              )}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex-1">
          <div
            ref={stageRef}
            className="relative aspect-video w-full select-none overflow-hidden rounded-md border-2 border-border bg-surface-2"
            style={stageBackground}
          >
            {!frame && <GhostScene />}
            <ThirdsGrid />
            <OutsideShade boxes={shown.map(geometry)} />
            {shown.map((id) => {
              const g = geometry(id);
              const camera = id === "camera";
              return (
                <button
                  key={id}
                  type="button"
                  aria-label={cropLabel(id)}
                  aria-pressed={split ? focus === id : undefined}
                  onPointerDown={onPointerDown(id)}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                  onFocus={() => setActive(id)}
                  onKeyDown={(e) => {
                    const step = e.shiftKey ? 0.1 : 0.01;
                    const moves: Record<string, [number, number]> = {
                      ArrowLeft: [-step, 0],
                      ArrowRight: [step, 0],
                      ArrowUp: [0, -step],
                      ArrowDown: [0, step],
                    };
                    const move = moves[e.key];
                    if (!move) return;
                    e.preventDefault();
                    nudge(id, move[0], move[1]);
                  }}
                  className={cn(
                    "absolute cursor-grab touch-none rounded-[3px] border-2 active:cursor-grabbing",
                    camera ? "border-ok" : "border-brass",
                    split && focus === id && "z-10",
                  )}
                  style={{
                    left: `${g.left * 100}%`,
                    top: `${g.top * 100}%`,
                    width: `${g.w * 100}%`,
                    height: `${g.h * 100}%`,
                  }}
                >
                  <span
                    className={cn(
                      "absolute left-1/2 -translate-x-1/2 whitespace-nowrap px-1.5 text-[10px] font-extrabold",
                      // The stage clips anything above it, so a box at the top carries its tag inside.
                      g.top < 0.06
                        ? "top-0 rounded-b"
                        : "-top-px -translate-y-full rounded-t",
                      camera ? "bg-ok text-night" : "bg-brass text-brass-ink",
                    )}
                  >
                    {split ? regionName(id) : "9:16"}
                  </span>
                </button>
              );
            })}
            {!frame && (
              <span className="pointer-events-none absolute left-2 top-2 z-20 rounded bg-brass-ink/75 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brass">
                {t("platforms.reframe.preview")}
              </span>
            )}
          </div>

          <div className="mt-3 flex items-center gap-3">
            <span className="w-28 shrink-0 text-xs font-bold uppercase tracking-wide text-ink-faint">
              {split
                ? t("platforms.reframe.zoomOf", { region: regionName(focus) })
                : t("platforms.reframe.zoom")}
            </span>
            <input
              type="range"
              min={floor}
              max={1}
              step={0.01}
              value={floor + 1 - zoom}
              aria-label={
                split
                  ? t("platforms.reframe.zoomOf", { region: regionName(focus) })
                  : t("platforms.reframe.zoom")
              }
              onChange={(e) =>
                setRegion(focus, {
                  zoom: Number((floor + 1 - Number(e.target.value)).toFixed(2)),
                })
              }
              className="flex-1 accent-brass"
            />
            <span className="w-9 text-right text-xs font-bold tabular-nums text-ink-muted">
              {fmt.dec(1 / zoom)}×
            </span>
            <Button
              variant="subtle"
              size="sm"
              onClick={() => setRegion(focus, CENTERED[focus])}
            >
              {t("platforms.reframe.center")}
            </Button>
          </div>
          {split && (
            <div className="mt-2 flex items-center gap-3">
              <span className="w-28 shrink-0 text-xs font-bold uppercase tracking-wide text-ink-faint">
                {t("platforms.reframe.split.ratio")}
              </span>
              <input
                type="range"
                min={SPLIT_RATIO.min * 100}
                max={SPLIT_RATIO.max * 100}
                step={1}
                value={Math.round(ratio * 100)}
                aria-label={t("platforms.reframe.split.ratio")}
                onChange={(e) => setRatio(Number(e.target.value) / 100)}
                className="flex-1 accent-ok"
              />
              <span className="w-9 text-right text-xs font-bold tabular-nums text-ink-muted">
                {fmt.num(Math.round(ratio * 100))}%
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-col items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wide text-ink-faint">
            {t("platforms.reframe.result")}
          </span>
          <div className="relative flex h-56 flex-col overflow-hidden rounded-md border-2 border-border bg-surface-2 [aspect-ratio:9/16] [@media(max-height:640px)]:h-48">
            {heights ? (
              <>
                <div
                  className="relative shrink-0 overflow-hidden"
                  style={{
                    height: `${(heights[0] / preset.height) * 100}%`,
                    ...regionBackground("camera"),
                  }}
                >
                  {!frame && <GhostScene />}
                </div>
                <div
                  className="relative flex-1 overflow-hidden"
                  style={regionBackground("main")}
                >
                  {!frame && <GhostScene />}
                </div>
              </>
            ) : (
              <div
                className="relative grid flex-1 place-items-center"
                style={regionBackground("main")}
              >
                {!frame && <GhostScene />}
                {!frame && (
                  <span className="relative z-10 px-2 text-center text-[11px] font-bold text-ink-faint">
                    9:16
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 [@media(max-height:640px)]:mt-3">
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
      <p className="mt-2 text-center text-xs text-ink-faint [@media(max-height:640px)]:hidden">
        {ingestLive
          ? t("platforms.reframe.hint.live")
          : t("platforms.reframe.hint.offline")}
      </p>
    </Modal>
  );
}

/** Dims the stage outside every crop; one shadow per box would also dim the other box. */
function OutsideShade({ boxes }: { boxes: Geometry[] }) {
  const holes = boxes
    .map(
      (b) =>
        `M${b.left * 100} ${b.top * 100}h${b.w * 100}v${b.h * 100}h${-b.w * 100}Z`,
    )
    .join("");
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 size-full"
      aria-hidden
    >
      <path
        d={`M0 0H100V100H0Z${holes}`}
        fillRule="evenodd"
        fill="rgba(11,8,5,0.55)"
      />
    </svg>
  );
}

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
