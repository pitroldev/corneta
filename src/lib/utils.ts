import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function errMsg(e: unknown): string {
  return String(e).replace(/^Error:\s*/, "");
}

export function fmtResolution(w: number, h: number, fps: number): string {
  const vertical = h > w;
  // Portrait resolution labels use width: 720×1280 is 720p portrait.
  const p = vertical ? w : h;
  return `${p}p${vertical ? " vertical" : ""} ${fps}fps`;
}

export function fmtUptime(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

export function uid(prefix = "t"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export async function openExternal(url: string): Promise<void> {
  try {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("open_external", { url });
      return;
    }
  } catch {
    /* Fall back to browser navigation when native opening is unavailable. */
  }
  if (typeof window !== "undefined")
    window.open(url, "_blank", "noopener,noreferrer");
}

export function readableOn(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? "#1a120a" : "#ffffff";
}
