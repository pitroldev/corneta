import type { T } from "@/lib/i18n";
import { PlatformGlyph } from "./decor";
import { EyeIcon } from "./icons";
import { Chip, cn, DemoLabel, State } from "./ui";

// Sala de guerra: o que o painel Ao vivo mostra por destino enquanto você
// transmite — bitrate, fps, quadros perdidos e tempo no ar, mais CPU/GPU reais.
// Estados e nomes de métrica saem de TargetStatus/EngineSnapshot (src/lib/types.ts).

// `text-cream` explícito: estes painéis aparecem sobre seções de PAPEL, onde a
// tinta herdada é escura — sem isso o nome da plataforma some no fundo escuro.
const PANEL = "rounded-lg bg-surface p-[18px] text-cream shadow-pop-ink-lg";

const ROW =
  "grid grid-cols-[30px_minmax(0,1fr)_auto] max-[760px]:grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-md bg-surface-2 px-2.5 py-[9px] not-first:mt-[7px] " +
  "[&_.glyph]:h-[30px] [&_.glyph]:w-[30px] " +
  "[&>div>strong]:block [&>div>strong]:font-display [&>div>strong]:text-[0.84rem] [&>div>strong]:font-bold " +
  "[&>div>small]:mt-0.5 [&>div>small]:block [&>div>small]:text-[0.62rem] [&>div>small]:font-[550] [&>div>small]:tabular-nums [&>div>small]:text-faint-raised";

/** Medidor de carga: rótulo, barrinha e número. */
function Meter({
  label,
  pct,
  ok = false,
}: {
  label: string;
  pct: number;
  ok?: boolean;
}) {
  return (
    <span className="flex items-center gap-[7px] text-[0.66rem] font-extrabold tracking-[0.04em] whitespace-nowrap text-muted uppercase">
      {label}
      <i className="block h-[7px] w-14 overflow-hidden bg-surface-3">
        <b
          className={cn("block h-full", ok ? "bg-ok" : "bg-brass")}
          style={{ width: `${pct}%` }}
        />
      </i>
      {pct}%
    </span>
  );
}

export function LiveRoom({ t }: { t: T }) {
  return (
    <div className={PANEL}>
      <DemoLabel>
        <span>{t("replica.live.label")}</span>
        <span>{t("replica.live.tag")}</span>
      </DemoLabel>

      <div className={ROW}>
        <PlatformGlyph id="twitch" />
        <div>
          <strong>Twitch</strong>
          <small>5 998 kbps · 60 fps · 0 quedas · 1h42</small>
        </div>
        <State>
          <i /> no ar
        </State>
      </div>

      <div className={ROW}>
        <PlatformGlyph id="youtube" />
        <div>
          <strong>YouTube</strong>
          <small>6 002 kbps · 60 fps · 0 quedas · 1h42</small>
        </div>
        <State>
          <i /> no ar
        </State>
      </div>

      <div className={ROW}>
        <PlatformGlyph id="kick" />
        <div>
          <strong>Kick</strong>
          <small>reconectando · tentativa 2 · 12 s fora</small>
        </div>
        <State tone="warn">
          <i /> voltando
        </State>
      </div>

      <div className={ROW}>
        <PlatformGlyph id="tiktok" />
        <div>
          <strong>TikTok</strong>
          <small>pausado por você · 720×1280</small>
        </div>
        <State tone="quiet">
          <i /> em pausa
        </State>
      </div>

      <div className="mt-[13px] flex flex-wrap gap-x-4 gap-y-2 border-t-2 border-border-soft pt-[13px]">
        <Meter label="CPU" pct={18} />
        <Meter label="Placa" pct={31} ok />
        <span className="flex items-center gap-[7px] text-[0.66rem] font-extrabold tracking-[0.04em] whitespace-nowrap text-muted uppercase [&>svg]:h-[15px] [&>svg]:w-[15px] [&>svg]:shrink-0 [&>svg]:fill-none [&>svg]:stroke-current [&>svg]:[stroke-linecap:round] [&>svg]:[stroke-linejoin:round] [&>svg]:[stroke-width:2.2]">
          <EyeIcon />1 284 assistindo
        </span>
      </div>
    </div>
  );
}

// Relatório pós-live: a curva de audiência com os marcadores do que aconteceu.
// A análise real (src/screens/ReportsScreen.tsx) usa viewerSamples, alertEvents,
// taxa de chat e janelas com problema; aqui é uma sessão de exemplo.
const CURVE =
  "M0,74 L18,70 L36,66 L54,58 L72,55 L90,49 L108,52 L126,44 L144,40 L162,34 L180,22 L198,18 L216,20 L234,26 L252,24 L270,30 L288,36 L306,33 L324,42 L342,48 L360,60";

// `vector-effect` mantém a espessura do traço quando o SVG estica sem proporção.
const GRID =
  "stroke-border-dry [stroke-width:1] [vector-effect:non-scaling-stroke]";
const LINE =
  "fill-none stroke-brass [stroke-width:2.5] [stroke-linecap:round] [stroke-linejoin:round] [vector-effect:non-scaling-stroke]";

export function ReportChart({ t }: { t: T }) {
  return (
    <div className={PANEL}>
      <DemoLabel>
        <span>{t("replica.report.label")}</span>
        <span>{t("replica.report.tag")}</span>
      </DemoLabel>

      <svg
        className="my-1.5 block h-auto w-full overflow-visible"
        viewBox="0 0 360 96"
        preserveAspectRatio="none"
        role="img"
        aria-label="Curva de audiência de uma live de exemplo, com um pico no raid e um trecho com queda de sinal."
      >
        <line className={GRID} x1="0" y1="24" x2="360" y2="24" />
        <line className={GRID} x1="0" y1="56" x2="360" y2="56" />
        <path className="fill-brass/15" d={`${CURVE} L360,96 L0,96 Z`} />
        <path className={LINE} d={CURVE} />
        {/* As bolinhas usam a cor da legenda correspondente: latão = raid,
            âmbar = trecho com queda. */}
        <circle
          className="fill-brass stroke-surface [stroke-width:2]"
          cx="180"
          cy="22"
          r="4.5"
        />
        <circle
          className="fill-warn stroke-surface [stroke-width:2]"
          cx="252"
          cy="24"
          r="4.5"
        />
      </svg>

      <div className="flex justify-between text-[0.6rem] font-bold tabular-nums text-faint-raised">
        <span>21:00</span>
        <span>22:30</span>
        <span>00:12</span>
      </div>

      <div className="mt-[13px] flex flex-wrap gap-[7px] [&>span]:text-[0.62rem]">
        <Chip tone="ok">pico 1 284</Chip>
        <Chip quiet>média 870</Chip>
        <Chip quiet>3 412 mensagens</Chip>
        <Chip>raid às 22:30</Chip>
        <Chip tone="warn">1 trecho com queda</Chip>
      </div>
    </div>
  );
}
