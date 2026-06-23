import { useEffect, useState, type ReactNode } from "react";
import { Minus, Square, Copy, X } from "lucide-react";
import { cn } from "../lib/utils";
import { IS_TAURI } from "../lib/api";
import { Mascot } from "./decor";

async function getWin() {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow();
}

export function TitleBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!IS_TAURI) return;
    let unlisten: (() => void) | undefined;
    (async () => {
      const w = await getWin();
      setMaximized(await w.isMaximized());
      unlisten = await w.onResized(async () => setMaximized(await w.isMaximized()));
    })();
    return () => unlisten?.();
  }, []);

  const min = async () => IS_TAURI && (await getWin()).minimize();
  const toggleMax = async () => IS_TAURI && (await getWin()).toggleMaximize();
  const close = async () => IS_TAURI && (await getWin()).close();

  return (
    <div
      data-tauri-drag-region
      className="flex h-9 shrink-0 items-center justify-between bg-night pl-3 select-none"
    >
      <div data-tauri-drag-region className="pointer-events-none flex items-center gap-2">
        <div className="grid size-5 place-items-center rounded-[5px] bg-brass text-brass-ink">
          <Mascot className="size-3.5" />
        </div>
        <span className="font-display text-sm font-bold leading-none">Corneta</span>
        <span className="text-[11px] font-medium text-ink-faint">multi-stream</span>
      </div>

      <div className="flex h-full">
        <WinBtn onClick={min} label="Minimizar">
          <Minus className="size-4" strokeWidth={2.4} />
        </WinBtn>
        <WinBtn onClick={toggleMax} label={maximized ? "Restaurar" : "Maximizar"}>
          {maximized ? <Copy className="size-3.5" strokeWidth={2.2} /> : <Square className="size-3.5" strokeWidth={2.4} />}
        </WinBtn>
        <WinBtn onClick={close} label="Fechar" danger>
          <X className="size-4" strokeWidth={2.4} />
        </WinBtn>
      </div>
    </div>
  );
}

function WinBtn({
  children,
  onClick,
  label,
  danger,
}: {
  children: ReactNode;
  onClick: () => void;
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "grid h-full w-12 place-items-center text-ink-muted transition-colors",
        danger ? "hover:bg-bad hover:text-white" : "hover:bg-surface-2 hover:text-ink"
      )}
    >
      {children}
    </button>
  );
}
