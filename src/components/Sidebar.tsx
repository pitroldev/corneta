import { Info, Radio, Settings, Sliders, Tv2 } from "lucide-react";
import { cn } from "../lib/utils";
import { useStore } from "../lib/store";
import { Mascot } from "./decor";

export type Screen = "platforms" | "encoding" | "golive" | "about" | "settings";

const NAV: { id: Screen; label: string; icon: typeof Radio; hint: string }[] = [
  { id: "platforms", label: "Plataformas", icon: Tv2, hint: "pra onde toca" },
  { id: "encoding", label: "Qualidade", icon: Sliders, hint: "como toca" },
  { id: "golive", label: "Ao vivo", icon: Radio, hint: "solta o som" },
];

export function Sidebar({
  screen,
  onNavigate,
}: {
  screen: Screen;
  onNavigate: (s: Screen) => void;
}) {
  const state = useStore((s) => s.snapshot.state);

  return (
    <aside className="flex w-64 shrink-0 flex-col bg-night p-4">
      {/* Marca */}
      <div className="mb-9 flex items-center gap-3 px-1 pt-2">
        <div className="grid size-12 rotate-[-3deg] place-items-center rounded-lg bg-brass text-brass-ink pop-brass">
          <Mascot className="size-7" />
        </div>
        <div>
          <div className="font-display text-2xl font-extrabold leading-none">Corneta</div>
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
              className={cn(
                "group relative flex items-center gap-3 rounded-md px-3 py-3 text-left transition-all",
                active
                  ? "bg-brass text-brass-ink pop-brass"
                  : "text-ink-muted hover:bg-surface-2 hover:text-ink"
              )}
            >
              <span
                className={cn(
                  "grid size-7 place-items-center rounded-sm",
                  active ? "bg-brass-ink/15" : "bg-surface-2 group-hover:bg-surface-3"
                )}
              >
                <Icon className="size-4" strokeWidth={2.4} />
              </span>
              <div className="flex flex-col">
                <span className="font-display text-base font-bold leading-tight">{item.label}</span>
                <span
                  className={cn(
                    "text-[11px] font-medium",
                    active ? "text-brass-ink/70" : "text-ink-faint"
                  )}
                >
                  {item.hint}
                </span>
              </div>
              <span
                className={cn(
                  "ml-auto font-display text-xs font-bold opacity-40",
                  active && "opacity-60"
                )}
              >
                0{i + 1}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Configurações + Sobre + estado ao vivo */}
      <div className="mt-auto flex flex-col gap-2">
        <button
          onClick={() => onNavigate("settings")}
          className={cn(
            "flex items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-semibold transition-colors",
            screen === "settings" ? "bg-surface-2 text-ink" : "text-ink-faint hover:bg-surface-2 hover:text-ink-muted"
          )}
        >
          <Settings className="size-4" strokeWidth={2.3} /> Configurações
        </button>
        <button
          onClick={() => onNavigate("about")}
          className={cn(
            "flex items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-semibold transition-colors",
            screen === "about" ? "bg-surface-2 text-ink" : "text-ink-faint hover:bg-surface-2 hover:text-ink-muted"
          )}
        >
          <Info className="size-4" strokeWidth={2.3} /> Sobre
          <span className="ml-auto text-[11px] font-bold text-brass">pitrol.dev</span>
        </button>

        {state === "live" ? (
          <div className="flex -rotate-1 items-center gap-2 rounded-md bg-tomate px-3 py-2.5 text-white pop">
            <span className="size-2.5 rounded-full bg-white live-dot" />
            <span className="font-display text-sm font-extrabold uppercase tracking-wide">
              No ar · cornetando
            </span>
          </div>
        ) : state === "starting" ? (
          <div className="flex items-center gap-2 rounded-md bg-brass/15 px-3 py-2.5 text-brass">
            <span className="size-2.5 rounded-full bg-brass animate-pulse" />
            <span className="font-display text-sm font-bold uppercase tracking-wide">
              Aguardando OBS
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-md bg-surface-2 px-3 py-2.5">
            <span className="size-2.5 rounded-full bg-ink-faint" />
            <span className="text-sm font-semibold text-ink-muted">Fora do ar</span>
          </div>
        )}
      </div>
    </aside>
  );
}
