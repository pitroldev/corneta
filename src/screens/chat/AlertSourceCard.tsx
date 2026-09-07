import * as Collapsible from "@radix-ui/react-collapsible";
import {
  Bell,
  Check,
  ChevronDown,
  ClipboardPaste,
  Pencil,
  Trash2,
  Wifi,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Input, Toggle } from "../../components/ui";
import { api } from "../../lib/api";
import { useT } from "../../lib/i18n";
import { toast } from "../../lib/toast";
import type { AlertSource } from "../../lib/types";
import { cn, errMsg } from "../../lib/utils";
import { sanitizeToken } from "../../lib/validation";
import { ALERT_META, ALERT_STATUS } from "./constants";
import { useAccountAction } from "./useAccountAction";

export function AlertSourceCard({
  src,
  status,
  onChange,
  onRemove,
  onToken,
}: {
  src: AlertSource;
  status?: string;
  onChange: (patch: Partial<AlertSource>) => void;
  onRemove: () => void;
  onToken: (token: string) => Promise<void>;
}) {
  const t = useT();
  const meta = ALERT_META[src.kind];
  const [open, setOpen] = useState(() => !src.hasToken);
  const [editing, setEditing] = useState(false);
  const [token, setToken] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const { busy, run } = useAccountAction();
  const showInput = !src.hasToken || editing;

  const save = () => {
    const clean = sanitizeToken(token);
    if (!clean) return;
    void run(
      () => onToken(clean),
      () => {
        setToken("");
        setEditing(false);
        toast.success(t("chat.alertsrc.tokenStored.toast"));
      },
    );
  };
  const paste = async () => {
    try {
      const pasted = await navigator.clipboard.readText();
      if (pasted) setToken(sanitizeToken(pasted));
    } catch {
      /* Clipboard access may be denied; keep the editable field available. */
    }
  };

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    msg: string;
  } | null>(null);
  useEffect(() => setTestResult(null), [src.hasToken, editing]);
  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult({ ok: true, msg: await api.alertTest(src.id, t) });
    } catch (e) {
      setTestResult({ ok: false, msg: errMsg(e) });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div
      className={cn(
        "rounded-md border-2 transition-opacity",
        src.enabled ? "bg-surface" : "bg-surface-2 opacity-60",
        src.hasToken ? "border-border-soft" : "border-bad/50",
      )}
    >
      <Collapsible.Root open={open} onOpenChange={setOpen}>
        <div className="flex items-center gap-2 p-2.5">
          <div className="grid size-7 shrink-0 place-items-center rounded-md bg-surface-2 text-brass">
            <Bell className="size-4" />
          </div>
          <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
            <span className="shrink-0 font-display text-sm font-bold">
              {meta.label}
            </span>
            {src.hasToken ? (
              <span className="truncate text-xs text-ink-muted">
                ·{" "}
                {status
                  ? ALERT_STATUS[status]
                    ? t(ALERT_STATUS[status])
                    : status
                  : t("chat.alertsrc.tokenSaved")}
              </span>
            ) : (
              <span className="shrink-0 text-xs font-semibold text-bad">
                · {t("chat.alertsrc.noToken")}
              </span>
            )}
          </div>
          <Toggle
            checked={src.enabled}
            onChange={(v) => onChange({ enabled: v })}
            label={t("chat.source.toggle", {
              name: src.name.trim() || meta.label,
            })}
          />
          <Collapsible.Trigger asChild>
            <button
              aria-label={
                open ? t("chat.alertsrc.collapse") : t("chat.alertsrc.expand")
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
          {showInput ? (
            <div className="flex items-center gap-2">
              <Input
                type="password"
                disabled={busy}
                // eslint-disable-next-line jsx-a11y/no-autofocus -- Focus follows an explicit edit, never initial rendering.
                autoFocus={editing}
                placeholder={meta.placeholder}
                aria-label={`${meta.label} — ${meta.placeholder}`}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && token.trim() && void save()
                }
                className="flex-1"
              />
              <Button
                variant="subtle"
                size="sm"
                onClick={paste}
                disabled={busy}
              >
                <ClipboardPaste className="size-4" /> {t("chat.common.paste")}
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={!token.trim() || busy}
                loading={busy}
                onClick={save}
              >
                {t("chat.common.save")}
              </Button>
              {editing && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => setEditing(false)}
                >
                  <X className="size-4" />
                </Button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-md bg-surface-2 px-3 py-2">
              <Check className="size-4 text-ok" strokeWidth={2.6} />
              <span className="text-sm font-semibold">
                {t("chat.alertsrc.tokenStored.chip")}
              </span>
              <div className="ml-auto flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={test}
                  disabled={testing}
                >
                  <Wifi className="size-3.5" />{" "}
                  {testing ? t("chat.common.testing") : t("chat.common.test")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setToken("");
                    setEditing(true);
                  }}
                >
                  <Pencil className="size-3.5" /> {t("chat.alertsrc.replace")}
                </Button>
              </div>
            </div>
          )}
          {testResult && (
            <span
              className={cn(
                "text-[11px] font-bold",
                testResult.ok ? "text-ok" : "text-bad",
              )}
            >
              {testResult.ok ? "✓" : "✕"} {testResult.msg}
            </span>
          )}
          <p className="text-[11px] text-ink-faint">{t(meta.hintKey)}</p>
          <div className="flex justify-end border-t-2 border-border-soft pt-2.5">
            <Button
              variant={confirmRemove ? "danger" : "ghost"}
              size="sm"
              disabled={busy}
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
                : t("chat.alertsrc.remove")}
            </Button>
          </div>
        </Collapsible.Content>
      </Collapsible.Root>
    </div>
  );
}
