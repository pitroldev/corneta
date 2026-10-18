import * as Collapsible from "@radix-ui/react-collapsible";
import { ChevronDown, Trash2, Wifi } from "lucide-react";
import { useEffect, useState } from "react";
import { Select } from "../../components/Select";
import { Tooltip } from "../../components/Tooltip";
import {
  Button,
  ExperimentalBadge,
  PlatformGlyph,
  Toggle,
} from "../../components/ui";
import { api } from "../../lib/api";
import { normalizeChatChannel } from "../../lib/chatChannel";
import { useT } from "../../lib/i18n";
import type { ChatPlatform, ChatSource } from "../../lib/types";
import { cn, errMsg } from "../../lib/utils";
import { sanitizeApiKey } from "../../lib/validation";
import { draftInputProps, useDraft } from "../../lib/useDraft";
import {
  CHAT_PLATFORM_LABEL,
  HINT,
  PLACEHOLDER,
  PLATFORM_OPTS,
  VALUE_LABEL,
} from "./constants";

export function SourceCard({
  src,
  onChange,
  onRemove,
}: {
  src: ChatSource;
  onChange: (patch: Partial<ChatSource>) => void;
  onRemove: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(() => !src.value.trim());
  const [confirmRemove, setConfirmRemove] = useState(false);
  const valueDraft = useDraft(
    src.value,
    (value) => onChange({ value }),
    (value) => normalizeChatChannel(src.platform, value),
  );
  const nameDraft = useDraft(src.name, (name) => onChange({ name }));
  const inputCls =
    "h-9 rounded-md border-2 border-border bg-surface px-2 text-sm font-medium text-ink outline-none focus:border-brass";
  const platLabel = CHAT_PLATFORM_LABEL[src.platform];
  return (
    <div
      className={cn(
        "rounded-md border-2 transition-opacity",
        src.enabled ? "bg-surface" : "bg-surface-2 opacity-60",
        valueDraft.value.trim() ? "border-border-soft" : "border-bad/50",
      )}
    >
      <Collapsible.Root open={open} onOpenChange={setOpen}>
        <div className="flex items-center gap-2 p-2.5">
          <PlatformGlyph id={src.platform} size={22} />
          <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
            <span className="shrink-0 font-display text-sm font-bold">
              {platLabel}
            </span>
            {src.platform === "cinefy" && (
              <ExperimentalBadge className="ml-1 scale-90" />
            )}
            {valueDraft.value.trim() ? (
              <span className="truncate text-xs text-ink-muted">
                · {valueDraft.value}
                {nameDraft.value ? ` (${nameDraft.value})` : ""}
              </span>
            ) : (
              <span className="shrink-0 text-xs font-semibold text-bad">
                · {t("chat.source.noChannel")}
              </span>
            )}
          </div>
          <Toggle
            checked={src.enabled}
            onChange={(v) => onChange({ enabled: v })}
            label={t("chat.source.toggle", {
              name:
                nameDraft.value.trim() || valueDraft.value.trim() || platLabel,
            })}
          />
          <Collapsible.Trigger asChild>
            <button
              aria-label={
                open ? t("chat.source.collapse") : t("chat.source.expand")
              }
              className="grid size-8 shrink-0 place-items-center rounded-md text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <ChevronDown
                className={cn(
                  "size-5 transition-transform",
                  open && "rotate-180",
                )}
              />
            </button>
          </Collapsible.Trigger>
        </div>

        <Collapsible.Content className="flex flex-col gap-2 px-2.5 pb-2.5">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">
              {t("chat.source.platformLabel")}
            </span>
            <Select
              className="w-36"
              value={src.platform}
              options={PLATFORM_OPTS}
              aria-label={t("chat.source.platformLabel")}
              onChange={(v) =>
                onChange({
                  platform: v as ChatPlatform,
                  value: normalizeChatChannel(v as ChatPlatform, src.value),
                })
              }
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_11rem]">
            <label className="flex flex-col gap-1 text-[11px] font-semibold text-ink-faint">
              {t(VALUE_LABEL[src.platform])}
              <input
                {...draftInputProps(valueDraft)}
                placeholder={t(PLACEHOLDER[src.platform])}
                className={inputCls}
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-semibold text-ink-faint">
              <span>
                {t("chat.source.nickname")}{" "}
                <span className="font-medium normal-case text-ink-faint/60">
                  {t("chat.source.nickname.optional")}
                </span>
              </span>
              <input
                {...draftInputProps(nameDraft)}
                placeholder={t("chat.source.nickname.placeholder")}
                className={inputCls}
              />
            </label>
          </div>
          <p className="text-[11px] text-ink-faint">{t(HINT[src.platform])}</p>
          <div className="flex justify-end border-t-2 border-border-soft pt-2.5">
            <Button
              variant={confirmRemove ? "danger" : "ghost"}
              size="sm"
              onClick={() => {
                if (confirmRemove) {
                  onRemove();
                  return;
                }
                setConfirmRemove(true);
                setTimeout(() => setConfirmRemove(false), 3000);
              }}
            >
              <Trash2 className="size-4" />
              {confirmRemove
                ? t("chat.common.removeConfirm")
                : t("chat.source.remove")}
            </Button>
          </div>
        </Collapsible.Content>
      </Collapsible.Root>
    </div>
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
