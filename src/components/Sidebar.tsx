import {
  BarChart3,
  Eye,
  Info,
  MessageSquare,
  Radio,
  Settings,
  Sliders,
  Tv2,
  Users,
} from "lucide-react";
import { cn } from "../lib/utils";
import { useStore } from "../lib/store";
import { MESA_ENABLED } from "../lib/flags";
import { Mascot } from "./decor";

export type Screen =
  | "platforms"
  | "encoding"
  | "golive"
  | "chat"
  | "mesa"
  | "reports"
  | "about"
  | "settings";

// Relatórios entra na jornada numerada (é o passo que FECHA o ciclo da live) — no rodapé
// apagado ninguém descobria que o app gera relatório.
const NAV: { id: Screen; label: string; icon: typeof Radio; hint: string }[] = [
  {
    id: "platforms",
    label: "Plataformas",
    icon: Tv2,
    hint: "onde sua live aparece",
  },
  {
    id: "encoding",
    label: "Qualidade",
    icon: Sliders,
    hint: "capricho da imagem",
  },
  { id: "golive", label: "Ao vivo", icon: Radio, hint: "bota tudo no ar" },
  {
    id: "chat",
    label: "Chat",
    icon: MessageSquare,
    hint: "todo chat num lugar",
  },
  ...(MESA_ENABLED
    ? [
        {
          id: "mesa" as Screen,
          label: "Mesa",
          icon: Users,
          hint: "co-stream com a galera",
        },
      ]
    : []),
  {
    id: "reports",
    label: "Relatórios",
    icon: BarChart3,
    hint: "como foi a live",
  },
];

// Numeração dos utilitários do rodapé segue a nav (Alt+N contínuo, com ou sem Mesa).
const SETTINGS_N = NAV.length + 1;
const ABOUT_N = NAV.length + 2;

export function Sidebar({
  screen,
  onNavigate,
  onPreload,
}: {
  screen: Screen;
  onNavigate: (s: Screen) => void;
  onPreload?: (s: Screen) => void;
}) {
  const state = useStore((s) => s.snapshot.state);
  const setGoLiveFocus = useStore((s) => s.setGoLiveFocus);
  const viewers = useStore((s) => s.viewers);
  const unseenReport = useStore((s) => s.unseenReport);

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border-soft bg-panel p-4">
      {/* Marca */}
      <div className="mb-9 flex items-center gap-3 px-1 pt-2">
        <div className="grid size-12 rotate-[-3deg] place-items-center rounded-lg bg-brass text-brass-ink pop-brass">
          <Mascot className="size-7" />
        </div>
        <div>
          <div className="font-display text-2xl font-extrabold leading-none">
            Corneta
          </div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-faint">
            multi-stream
          </div>
        </div>
      </div>

      <nav className="flex flex-col gap-2">
        {NAV.map((item, i) => {
          const active = screen === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              onPointerEnter={() => onPreload?.(item.id)}
              onFocus={() => onPreload?.(item.id)}
              aria-current={active ? "page" : undefined}
              data-on-brass={active ? "" : undefined}
              title={`Alt+${i + 1}`}
              className={cn(
                "group relative flex items-center gap-3 rounded-md px-3 py-3 text-left transition",
                active
                  ? "bg-brass text-brass-ink pop-brass"
                  : "text-ink-muted hover:bg-surface-2 hover:text-ink",
              )}
            >
              <span
                className={cn(
                  "grid size-7 place-items-center rounded-sm",
                  active
                    ? "bg-brass-ink/15"
                    : "bg-surface-2 group-hover:bg-surface-3",
                )}
              >
                <Icon className="size-4" strokeWidth={2.4} />
              </span>
              <div className="flex flex-col">
                <span className="font-display text-base font-bold leading-tight">
                  {item.label}
                </span>
                <span
                  className={cn(
                    "text-[11px] font-medium",
                    active ? "text-brass-ink/70" : "text-ink-faint",
                  )}
                >
                  {item.hint}
                </span>
              </div>
              {item.id === "reports" && unseenReport && !active ? (
                <span className="ml-auto -rotate-3 rounded-sm bg-tomate px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white">
                  novo
                </span>
              ) : (
                <span
                  className={cn(
                    "ml-auto font-display text-xs font-bold opacity-40",
                    active && "opacity-60",
                  )}
                >
                  0{i + 1}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Configurações + Sobre + estado ao vivo */}
      <div className="mt-auto flex flex-col gap-2">
        <button
          onClick={() => onNavigate("settings")}
          onPointerEnter={() => onPreload?.("settings")}
          onFocus={() => onPreload?.("settings")}
          aria-current={screen === "settings" ? "page" : undefined}
          title={`Alt+${SETTINGS_N}`}
          className={cn(
            "flex items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-semibold transition-colors",
            screen === "settings"
              ? "bg-surface-2 text-ink"
              : "text-ink-faint hover:bg-surface-2 hover:text-ink-muted",
          )}
        >
          <Settings className="size-4" strokeWidth={2.3} /> Configurações
          <span className="ml-auto font-display text-xs font-bold opacity-40">
            0{SETTINGS_N}
          </span>
        </button>
        <button
          onClick={() => onNavigate("about")}
          onPointerEnter={() => onPreload?.("about")}
          onFocus={() => onPreload?.("about")}
          aria-current={screen === "about" ? "page" : undefined}
          title={`Alt+${ABOUT_N}`}
          className={cn(
            "flex items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-semibold transition-colors",
            screen === "about"
              ? "bg-surface-2 text-ink"
              : "text-ink-faint hover:bg-surface-2 hover:text-ink-muted",
          )}
        >
          <Info className="size-4" strokeWidth={2.3} /> Sobre
          <span className="ml-auto text-[11px] font-bold text-brass">
            pitrol.dev
          </span>
        </button>

        {state === "live" ? (
          <button
            onClick={() => onNavigate("golive")}
            title="Ver o painel ao vivo"
            className="flex w-full -rotate-1 items-center gap-2 rounded-md bg-tomate px-3 py-2.5 text-left text-white pop transition-transform hover:scale-[1.02]"
          >
            <span className="size-2.5 rounded-full bg-white live-dot" />
            <span className="font-display text-sm font-extrabold uppercase tracking-wide">
              No ar · cornetando
            </span>
          </button>
        ) : state === "starting" ? (
          <button
            onClick={() => onNavigate("golive")}
            title="Ver o painel ao vivo"
            className="flex w-full items-center gap-2 rounded-md bg-brass/15 px-3 py-2.5 text-left text-brass transition-transform hover:translate-x-0.5"
          >
            <span className="size-2.5 rounded-full bg-brass animate-pulse" />
            <span className="font-display text-sm font-bold uppercase tracking-wide">
              Aguardando o OBS
            </span>
          </button>
        ) : state === "error" ? (
          <button
            onClick={() => onNavigate("golive")}
            title="Ver o painel ao vivo"
            className="flex w-full items-center gap-2 rounded-md bg-bad/15 px-3 py-2.5 text-left text-bad transition-transform hover:translate-x-0.5"
          >
            <span className="size-2.5 rounded-full bg-bad" />
            <span className="font-display text-sm font-bold uppercase tracking-wide">
              Erro
            </span>
          </button>
        ) : (
          <button
            onClick={() => {
              setGoLiveFocus(true);
              onNavigate("golive");
            }}
            title="Ir pro Ao vivo e começar"
            className="group flex w-full items-center gap-2 rounded-md bg-surface-2 px-3 py-2.5 text-left transition-transform hover:translate-x-0.5"
          >
            <span className="size-2.5 rounded-full bg-ink-faint" />
            <span className="text-sm font-semibold text-ink-muted group-hover:text-ink">
              Fora do ar
            </span>
          </button>
        )}

        {viewers.total > 0 && (
          <div
            className="flex items-center justify-center gap-1.5 pt-0.5 text-xs text-ink-faint"
            title={viewers.items
              .filter((i) => i.live)
              .map(
                (i) =>
                  `${i.source}: ${(i.viewers ?? 0).toLocaleString("pt-BR")}`,
              )
              .join("\n")}
          >
            <Eye className="size-3.5" />
            <span className="font-display font-extrabold text-ink-muted">
              {viewers.total.toLocaleString("pt-BR")}
            </span>
            assistindo
          </div>
        )}
      </div>
    </aside>
  );
}
