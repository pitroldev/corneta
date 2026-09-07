import { useCallback, useEffect, useId, useState } from "react";
import { api } from "../../lib/api";
import { brbSlateGeneration, renderBrbSlatePng } from "../../lib/brbSlate";
import { useI18n, useT } from "../../lib/i18n";
import { useStore } from "../../lib/store";
import { toast } from "../../lib/toast";
import { cn } from "../../lib/utils";

export function BrbSlateChooser() {
  const { t, locale } = useI18n();
  const kind = useStore((s) => s.config!.settings.brbSlateKind) ?? "auto";
  const fileName = useStore((s) => s.config!.settings.brbSlateFileName);
  const setSettings = useStore((s) => s.setSettings);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string>("");

  // Backend previews are base64 JPEGs; an empty string means unavailable.
  const loadPreview = useCallback(async () => {
    try {
      setPreview(await api.getBrbSlatePreview());
    } catch {
      setPreview("");
    }
  }, []);
  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  const pick = async () => {
    setBusy(true);
    try {
      const r = await api.setBrbSlate();
      if (r) {
        setSettings({ brbSlateKind: r.kind, brbSlateFileName: r.fileName });
        toast.success(t("settings.brb.slate.toast.updated"));
        await loadPreview();
      }
    } catch (e) {
      toast.error(
        t("settings.brb.slate.toast.fileError", { error: String(e) }),
      );
    } finally {
      setBusy(false);
    }
  };

  const useDefault = async () => {
    setBusy(true);
    try {
      await api.clearBrbSlate();
      const b64 = await renderBrbSlatePng(t);
      if (b64) await api.saveBrbSlate(b64, brbSlateGeneration(locale));
      setSettings({ brbSlateKind: "auto", brbSlateFileName: undefined });
      toast.success(t("settings.brb.slate.toast.default"));
      await loadPreview();
    } catch (e) {
      toast.error(
        t("settings.brb.slate.toast.defaultError", { error: String(e) }),
      );
    } finally {
      setBusy(false);
    }
  };

  // Media kinds are persisted Rust enum values, not display labels.
  const current =
    kind === "image"
      ? t("settings.brb.slate.using.image", {
          file: fileName ?? t("settings.brb.slate.using.image.fallback"),
        })
      : kind === "video"
        ? t("settings.brb.slate.using.video", {
            file: fileName ?? t("settings.brb.slate.using.video.fallback"),
          })
        : t("settings.brb.slate.using.default");

  const opt = (active: boolean) =>
    cn(
      "flex-1 rounded-md border-2 px-3 py-2 font-display text-sm font-bold transition-colors disabled:opacity-50",
      active
        ? "border-brass bg-brass/10 text-brass"
        : "border-border text-ink-muted hover:border-brass/60",
    );
  const isDefault = kind === "auto";
  const isCustom = kind === "image" || kind === "video";
  const labelId = useId();

  return (
    <div className="flex items-start gap-4 py-3.5">
      {preview && (
        <div className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-md ring-1 ring-border">
          <img
            src={`data:image/jpeg;base64,${preview}`}
            alt={t("settings.brb.slate.preview.alt")}
            className="h-full w-full object-cover"
          />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <span id={labelId} className="text-sm font-semibold text-ink-muted">
          {t("settings.brb.slate.label")}
        </span>
        <div className="flex gap-2" role="group" aria-labelledby={labelId}>
          <button
            className={opt(isDefault)}
            aria-pressed={isDefault}
            disabled={busy}
            onClick={useDefault}
          >
            {t("settings.brb.slate.default")}
          </button>
          <button
            className={opt(isCustom)}
            aria-pressed={isCustom}
            disabled={busy}
            onClick={pick}
          >
            {t("settings.brb.slate.custom")}
          </button>
        </div>
        <span className="text-xs font-semibold text-ink-faint">
          {t("settings.brb.slate.note", { current })}
        </span>
      </div>
    </div>
  );
}

export function BrbPreview() {
  const t = useT();
  return (
    <div className="absolute inset-0 grid place-items-center bg-[#14100a]">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,179,35,0.16) 1px, transparent 0)",
          backgroundSize: "7px 7px",
        }}
      />
      <div className="relative -rotate-3 bg-brass px-2 py-0.5 font-display text-[9px] font-extrabold leading-none text-brass-ink shadow-[2px_2px_0_#0b0805]">
        {t("brb.slate.title")}
      </div>
    </div>
  );
}
