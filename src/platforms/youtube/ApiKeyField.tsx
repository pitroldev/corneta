import { Wifi } from "lucide-react";
import { useEffect, useState } from "react";
import { Tooltip } from "../../components/Tooltip";
import { Button, PlatformGlyph } from "../../components/ui";
import { api } from "../../lib/api";
import { useT } from "../../lib/i18n";
import { useStore } from "../../lib/store";
import { draftInputProps, useDraft } from "../../lib/useDraft";
import { cn, errMsg } from "../../lib/utils";
import { sanitizeApiKey } from "../../lib/validation";

/** YouTube's channel settings: the optional Data API key, shown once any YouTube source exists. */
export function YoutubeChannelSettings() {
  const value = useStore((s) => s.config?.settings.youtubeApiKey ?? "");
  const setSettings = useStore((s) => s.setSettings);
  return (
    <YoutubeApiKeyField
      value={value}
      onChange={(v) => setSettings({ youtubeApiKey: v })}
    />
  );
}

export function YoutubeApiKeyField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const t = useT();
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(
    null,
  );
  const draft = useDraft(value, onChange, sanitizeApiKey);
  useEffect(() => setResult(null), [draft.value]);
  const verify = async () => {
    const key = sanitizeApiKey(draft.value).trim();
    if (!key) return;
    setTesting(true);
    setResult(null);
    try {
      setResult({ ok: true, msg: await api.youtubeKeyCheck(key, t) });
    } catch (e) {
      setResult({ ok: false, msg: errMsg(e) });
    } finally {
      setTesting(false);
    }
  };
  // A label wrapper would name the tooltip button first; name the input directly.
  return (
    <div className="mt-2 flex flex-col gap-1.5 rounded-md border-2 border-border-soft bg-surface-2 p-2.5 text-[11px] font-semibold text-ink-faint">
      <span className="flex flex-wrap items-center gap-1.5">
        <PlatformGlyph id="youtube" size={14} />{" "}
        {t("chat.youtube.apikey.label")}
        <Tooltip content={t("chat.youtube.apikey.tooltip")}>
          <button
            type="button"
            className="cursor-help font-medium normal-case text-ink-faint/80 underline decoration-dotted underline-offset-2"
          >
            {t("chat.youtube.apikey.optional")}
          </button>
        </Tooltip>
      </span>
      <div className="flex items-center gap-2">
        <input
          {...draftInputProps(draft)}
          aria-label={t("chat.youtube.apikey.label")}
          placeholder={t("chat.youtube.apikey.placeholder")}
          className="h-9 flex-1 rounded-md border-2 border-border bg-surface px-2 text-sm font-medium text-ink outline-none focus:border-brass"
        />
        <Button
          variant="subtle"
          size="sm"
          className="h-9 shrink-0"
          disabled={!draft.value.trim() || testing}
          onClick={verify}
        >
          <Wifi className="size-3.5" />{" "}
          {testing
            ? t("chat.youtube.apikey.checking")
            : t("chat.youtube.apikey.check")}
        </Button>
      </div>
      {result && (
        <span
          className={cn(
            "font-bold normal-case",
            result.ok ? "text-ok" : "text-bad",
          )}
        >
          {result.ok ? "✓" : "✕"} {result.msg}
        </span>
      )}
    </div>
  );
}
