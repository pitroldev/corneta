import * as Collapsible from "@radix-ui/react-collapsible";
import { useConfirm } from "../../lib/useConfirm";
import { ChevronDown, Trash2 } from "lucide-react";
import { useState } from "react";
import { Select } from "../../components/Select";
import {
  Button,
  ExperimentalBadge,
  PlatformGlyph,
  Toggle,
} from "../../components/ui";
import { normalizeChatChannel } from "../../lib/chatChannel";
import { useT } from "../../lib/i18n";
import type { ChatPlatform, ChatSource } from "../../lib/types";
import { cn } from "../../lib/utils";
import { draftInputProps, useDraft } from "../../lib/useDraft";
import { CHAT_PROVIDERS, chatProvider } from "../../platforms";

const PLATFORM_OPTS = CHAT_PROVIDERS.map((p) => ({
  value: p.id,
  label: p.experimental ? `${p.name} · experimental` : p.name,
}));

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
  const removeStep = useConfirm();
  const valueDraft = useDraft(
    src.value,
    (value) => onChange({ value }),
    (value) => normalizeChatChannel(src.platform, value),
  );
  const nameDraft = useDraft(src.name, (name) => onChange({ name }));
  const inputCls =
    "h-9 rounded-md border-2 border-border bg-surface px-2 text-sm font-medium text-ink outline-none focus:border-brass";
  const provider = chatProvider(src.platform);
  const platLabel = provider?.name ?? src.platform;
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
            {provider?.experimental && (
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
              {provider && t(provider.copy.channel)}
              <input
                {...draftInputProps(valueDraft)}
                placeholder={provider && t(provider.copy.placeholder)}
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
          {provider && (
            <p className="text-[11px] text-ink-faint">
              {t(provider.copy.hint)}
            </p>
          )}
          <div className="flex justify-end border-t-2 border-border-soft pt-2.5">
            <Button
              variant={removeStep.armed ? "danger" : "ghost"}
              size="sm"
              onClick={() => {
                if (removeStep.confirm()) onRemove();
              }}
            >
              <Trash2 className="size-4" />
              {removeStep.armed
                ? t("chat.common.removeConfirm")
                : t("chat.source.remove")}
            </Button>
          </div>
        </Collapsible.Content>
      </Collapsible.Root>
    </div>
  );
}
