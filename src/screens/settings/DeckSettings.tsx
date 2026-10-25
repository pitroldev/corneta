import { useCallback, useEffect, useState } from "react";
import {
  Copy,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Wifi,
  X,
} from "lucide-react";
import { Modal } from "../../components/Modal";
import {
  QrSvg,
  useDeckStatus,
  usePairTicket,
} from "../../components/deck/pairing";
import { Button, Card, Toggle } from "../../components/ui";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { useStore } from "../../lib/store";
import { toast } from "../../lib/toast";
import type { DeckStatus } from "../../lib/types";
import { useConfirm } from "../../lib/useConfirm";
import { cn, errMsg } from "../../lib/utils";
import { SettingRow } from "./SettingPrimitives";

const PAIR_STEPS = [
  { Icon: Wifi, key: "settings.deck.pair.step1" },
  { Icon: Smartphone, key: "settings.deck.pair.step2" },
  { Icon: ShieldCheck, key: "settings.deck.pair.step3" },
] as const;

function PairModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const { ticket, error, clock, expired, issue } = usePairTicket(true);
  // The confirmation prompt takes over once the phone asks to pair.
  useEffect(() => api.subscribeDeck({ pairRequest: onClose }), [onClose]);

  const copy = () => {
    if (!ticket) return;
    void navigator.clipboard
      .writeText(ticket.url)
      .then(() => toast.info(t("settings.deck.pair.copied")));
  };

  return (
    <Modal
      title={t("settings.deck.pair.title")}
      onClose={onClose}
      className="max-w-xl"
    >
      <div className="rounded-lg border-2 border-border bg-surface p-6 pop">
        <div className="mb-5 flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-md bg-brass text-brass-ink pop-sm">
            <QrCode className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-xl">{t("settings.deck.pair.title")}</h3>
            <p className="text-sm text-ink-muted">
              {t("settings.deck.pair.lede")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-m-1 grid size-9 place-items-center rounded-md text-ink-faint hover:bg-surface-2 hover:text-ink"
            aria-label={t("settings.deck.pair.close")}
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-6">
          <div
            className={cn(
              "relative size-52 shrink-0 overflow-hidden rounded-md bg-white p-2 pop",
              expired && "opacity-25",
            )}
          >
            {ticket ? (
              <QrSvg text={ticket.url} label={t("settings.deck.pair.qrAlt")} />
            ) : (
              <div className="size-full animate-pulse bg-surface-3" />
            )}
          </div>
          <ol className="min-w-0 flex-1 basis-56 space-y-3 text-sm">
            {PAIR_STEPS.map(({ Icon, key }) => (
              <li key={key} className="flex items-start gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-md bg-surface-2 text-brass">
                  <Icon className="size-4" />
                </span>
                <span className="pt-1.5">{t(key)}</span>
              </li>
            ))}
          </ol>
        </div>
        {error ? (
          <p className="mt-5 text-sm font-semibold text-bad">{error}</p>
        ) : (
          <p className="mt-5 text-sm text-ink-muted" aria-live="polite">
            {expired
              ? t("settings.deck.pair.expired")
              : ticket
                ? t("settings.deck.pair.expires", { time: clock })
                : t("settings.deck.pair.loading")}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant={expired || error ? "primary" : "subtle"}
            onClick={issue}
            data-on-brass={expired || error ? true : undefined}
          >
            <RefreshCw className="size-4" />
            {t("settings.deck.pair.renew")}
          </Button>
          <Button variant="ghost" onClick={copy} disabled={!ticket || expired}>
            <Copy className="size-4" />
            {t("settings.deck.pair.copy")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function DeviceRow({ device }: { device: DeckStatus["devices"][number] }) {
  const { t, fmt } = useI18n();
  const step = useConfirm(3000, { minDelayMs: 300 });
  const remove = () => {
    if (!step.confirm()) return;
    api.deckDeviceRemove(device.id).then(
      () =>
        toast.success(t("settings.deck.device.removed", { name: device.name })),
      (e: unknown) => toast.error(errMsg(e)),
    );
  };
  return (
    <li className="flex items-center gap-3 rounded-md bg-surface-2 px-3.5 py-2.5">
      <Smartphone className="size-5 shrink-0 text-ink-muted" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{device.name}</span>
        <span
          className={cn(
            "block text-xs",
            device.connected ? "text-ok" : "text-ink-faint",
          )}
        >
          {device.connected
            ? t("settings.deck.device.connected")
            : t("settings.deck.device.paired", {
                date: fmt.date(device.pairedAt),
              })}
        </span>
      </span>
      <Button
        size="sm"
        variant={step.armed ? "danger" : "ghost"}
        onClick={remove}
      >
        {step.armed
          ? t("settings.deck.device.removeConfirm")
          : t("settings.deck.device.remove")}
      </Button>
    </li>
  );
}

export function DeckSettings() {
  const { t } = useI18n();
  const enabled = useStore((s) => s.config!.settings.deckEnabled);
  const setSettings = useStore((s) => s.setSettings);
  const status = useDeckStatus();
  const [pairing, setPairing] = useState(false);
  const closePairing = useCallback(() => setPairing(false), []);
  const running = status?.running ?? false;

  return (
    <Card className="mb-4">
      <h3 className="mb-1 flex items-center gap-2 text-lg">
        <Smartphone className="size-5 text-brass" /> {t("settings.deck.title")}
      </h3>
      <p className="mb-1 text-xs text-ink-faint">{t("settings.deck.desc")}</p>
      <SettingRow
        title={t("settings.deck.toggle")}
        desc={t("settings.deck.toggle.desc")}
      >
        <Toggle
          checked={enabled}
          onChange={(deckEnabled) => setSettings({ deckEnabled })}
          label={t("settings.deck.toggle")}
        />
      </SettingRow>
      {enabled && (
        <div className="space-y-4 border-t border-border-soft pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={cn(
                "flex items-center gap-2 text-sm font-semibold",
                status?.error
                  ? "text-bad"
                  : running
                    ? "text-ok"
                    : "text-ink-muted",
              )}
              aria-live="polite"
            >
              <span
                className={cn(
                  "size-2 rounded-full",
                  status?.error ? "bg-bad" : running ? "bg-ok" : "bg-ink-faint",
                )}
              />
              {status?.error
                ? status.error
                : running
                  ? status?.address
                    ? t("settings.deck.status.on", { address: status.address })
                    : t("settings.deck.status.noNetwork")
                  : t("settings.deck.status.starting")}
            </span>
            <span className="flex-1" />
            <Button
              variant="primary"
              onClick={() => setPairing(true)}
              disabled={!running || !status?.address}
              data-on-brass
            >
              <QrCode className="size-4" />
              {t("settings.deck.pair")}
            </Button>
          </div>
          <div>
            <h4 className="mb-2 font-display text-sm font-bold text-ink-muted">
              {t("settings.deck.devices")}
            </h4>
            {status && status.devices.length > 0 ? (
              <ul className="space-y-2">
                {status.devices.map((device) => (
                  <DeviceRow key={device.id} device={device} />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-faint">
                {t("settings.deck.devices.empty")}
              </p>
            )}
          </div>
          <p className="text-xs text-ink-faint">{t("settings.deck.note")}</p>
        </div>
      )}
      {pairing && <PairModal onClose={closePairing} />}
    </Card>
  );
}
