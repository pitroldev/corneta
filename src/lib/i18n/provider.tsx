import type { ReactNode } from "react";
import { useStore } from "../store";
import { I18nProvider } from "./index";

// Before config loads, fall back to the system locale as auto would.
export function I18nFromConfig({ children }: { children: ReactNode }) {
  const language = useStore((s) => s.config?.settings.language);
  return <I18nProvider language={language}>{children}</I18nProvider>;
}
