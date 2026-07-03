import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Junta classes Tailwind resolvendo conflitos. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Formata kbps de forma legível (ex.: 6000 -> "6,0 Mbps"). */
export function fmtBitrate(kbps: number): string {
  if (kbps >= 1000) return `${(kbps / 1000).toFixed(1).replace(".", ",")} Mbps`;
  return `${Math.round(kbps)} kbps`;
}

/** Resolução em linguagem de gente ("1080p 60fps"; vertical: "720p vertical 30fps"). */
export function fmtResolution(w: number, h: number, fps: number): string {
  const vertical = h > w;
  // No vertical o "p" vem da largura (720×1280 é o 720p em pé).
  const p = vertical ? w : h;
  return `${p}p${vertical ? " vertical" : ""} ${fps}fps`;
}

/** Formata segundos como HH:MM:SS. */
export function fmtUptime(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

/** ID curto e único o bastante para uso local. */
export function uid(prefix = "t"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Abre uma URL no navegador padrão (Tauri shell ou window.open no demo). */
export async function openExternal(url: string): Promise<void> {
  try {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      const { open } = await import("@tauri-apps/plugin-shell");
      await open(url);
      return;
    }
  } catch {
    /* cai no fallback */
  }
  if (typeof window !== "undefined") window.open(url, "_blank", "noopener,noreferrer");
}

/** Escolhe tinta escura ou clara para contrastar com uma cor de fundo (#rrggbb). */
export function readableOn(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? "#1a120a" : "#ffffff";
}
