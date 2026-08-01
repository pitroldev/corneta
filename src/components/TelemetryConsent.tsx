import { type ReactNode, useEffect, useState } from "react";
import {
  Activity,
  Bug,
  ExternalLink,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { acceptedCurrent, legalUrl } from "../lib/legal";
import { useI18n } from "../lib/i18n";
import {
  discardBufferedOnboardingTelemetry,
  regenerateTelemetryId,
  setTelemetryConsent,
  TELEMETRY_DECISION_READY_EVENT,
  useTelemetry,
} from "../lib/telemetry";
import {
  needsTelemetryDecision,
  telemetryConsentDraft,
} from "../lib/telemetry-schema";
import { openExternal } from "../lib/utils";
import { toast } from "../lib/toast";
import { LegalLink } from "./legal";
import { Modal } from "./Modal";
import { Button, CopyField, Toggle } from "./ui";

export function TelemetryConsentNotice() {
  const { t, locale } = useI18n();
  const telemetry = useTelemetry();
  const [legalReady, setLegalReady] = useState(acceptedCurrent);
  const [deferred, setDeferred] = useState(false);
  const [draft, setDraft] = useState(() =>
    telemetryConsentDraft(telemetry.status),
  );

  useEffect(() => {
    const ready = () => setLegalReady(true);
    window.addEventListener(TELEMETRY_DECISION_READY_EVENT, ready);
    return () =>
      window.removeEventListener(TELEMETRY_DECISION_READY_EVENT, ready);
  }, []);

  useEffect(() => {
    setDraft(telemetryConsentDraft(telemetry.status));
  }, [telemetry.status]);

  if (
    !telemetry.ready ||
    !telemetry.available ||
    !legalReady ||
    deferred ||
    !needsTelemetryDecision(telemetry.status)
  )
    return null;

  const defer = () => {
    discardBufferedOnboardingTelemetry();
    setDeferred(true);
  };

  const save = async (withoutSending = false) => {
    try {
      await setTelemetryConsent({
        usage: withoutSending || !draft.usage ? "disabled" : "enabled",
        crashReports:
          withoutSending || !draft.crashReports ? "disabled" : "enabled",
      });
      toast.success(t("components.telemetry.notice.saved"));
    } catch {
      toast.error(t("components.telemetry.notice.error"));
    }
  };

  return (
    <Modal
      title={t("components.telemetry.notice.title")}
      onClose={defer}
      className="max-w-lg overflow-hidden rounded-xl bg-surface pop"
    >
      <div className="border-b-2 border-brass/40 bg-brass px-6 py-6 text-brass-ink">
        <div className="mb-3 grid size-12 -rotate-3 place-items-center rounded-lg bg-brass-ink text-brass pop-sm">
          <ShieldCheck className="size-7" strokeWidth={2.5} />
        </div>
        <h2 className="text-3xl">{t("components.telemetry.notice.title")}</h2>
        <p className="mt-1 text-sm font-semibold opacity-80">
          {t("components.telemetry.notice.subtitle")}
        </p>
      </div>

      <div className="p-6">
        <div className="space-y-2">
          <ConsentChoice
            icon={Activity}
            title={t("components.telemetry.usage.title")}
            body={t("components.telemetry.usage.body")}
            checked={draft.usage}
            onChange={(usage) => setDraft((current) => ({ ...current, usage }))}
          />
          <ConsentChoice
            icon={Bug}
            title={t("components.telemetry.crashes.title")}
            body={t("components.telemetry.crashes.body")}
            checked={draft.crashReports}
            onChange={(crashReports) =>
              setDraft((current) => ({ ...current, crashReports }))
            }
          />
        </div>

        <details className="mt-4 rounded-md border-2 border-border bg-surface-2 p-3 text-xs text-ink-muted">
          <summary className="cursor-pointer font-bold text-ink">
            {t("components.telemetry.notice.details")}
          </summary>
          <p className="mt-2 leading-relaxed">
            {t("components.telemetry.notice.allowed")}
          </p>
          <p className="mt-2 leading-relaxed text-bad">
            {t("components.telemetry.notice.forbidden")}
          </p>
        </details>

        <p className="mt-3 text-xs leading-relaxed text-ink-faint">
          {t("components.telemetry.notice.privacy")}{" "}
          <LegalLink href={legalUrl(locale, "privacy")}>
            {t("components.telemetry.notice.privacyLink")}
          </LegalLink>
        </p>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            onClick={() => void save(false)}
            disabled={telemetry.saving}
            loading={telemetry.saving}
          >
            {t("components.telemetry.notice.save")}
          </Button>
          <Button
            variant="outline"
            onClick={() => void save(true)}
            disabled={telemetry.saving}
          >
            {t("components.telemetry.notice.none")}
          </Button>
        </div>
        <button
          type="button"
          className="mt-3 w-full text-center text-xs font-semibold text-ink-faint hover:text-ink-muted"
          onClick={defer}
        >
          {t("components.telemetry.notice.later")}
        </button>
      </div>
    </Modal>
  );
}

function ConsentChoice({
  icon: Icon,
  title,
  body,
  checked,
  onChange,
}: {
  icon: typeof Activity;
  title: string;
  body: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-md border-2 border-border bg-surface-2 p-3.5">
      <Icon className="mt-0.5 size-5 shrink-0 text-brass" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="font-display text-sm font-extrabold">{title}</div>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{body}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} label={title} />
    </div>
  );
}

export function TelemetrySettingsPanel() {
  const { t, locale } = useI18n();
  const telemetry = useTelemetry();
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);

  if (!telemetry.ready)
    return (
      <p className="border-b border-border-soft py-4 text-sm text-ink-faint">
        {t("settings.telemetry.loading")}
      </p>
    );
  if (!telemetry.available)
    return (
      <p className="border-b border-border-soft py-4 text-sm text-warn">
        {t("settings.telemetry.unavailable")}
      </p>
    );

  const change = async (which: "usage" | "crashReports", enabled: boolean) => {
    const other = which === "usage" ? "crashReports" : "usage";
    const choices = {
      usage: telemetry.status.usage,
      crashReports: telemetry.status.crashReports,
    };
    choices[which] = enabled ? "enabled" : "disabled";
    if (choices[other] === "unset") choices[other] = "disabled";
    try {
      await setTelemetryConsent(choices);
      toast.success(t("settings.telemetry.saved"));
    } catch {
      toast.error(t("settings.telemetry.saveError"));
    }
  };

  const regenerate = async () => {
    if (!confirmRegenerate) {
      setConfirmRegenerate(true);
      setTimeout(() => setConfirmRegenerate(false), 4_000);
      return;
    }
    setConfirmRegenerate(false);
    try {
      await regenerateTelemetryId();
      toast.success(t("settings.telemetry.regenerate.ok"));
    } catch {
      toast.error(t("settings.telemetry.regenerate.error"));
    }
  };

  const bothDisabled =
    telemetry.status.usage !== "enabled" &&
    telemetry.status.crashReports !== "enabled";

  return (
    <div className="border-b border-border-soft pb-4 pt-1">
      <div className="divide-y divide-border-soft">
        <TelemetrySettingRow
          icon={Activity}
          title={t("components.telemetry.usage.title")}
          body={t("settings.telemetry.usage.desc")}
        >
          <Toggle
            checked={telemetry.status.usage === "enabled"}
            onChange={(enabled) => void change("usage", enabled)}
            disabled={telemetry.saving}
            label={t("components.telemetry.usage.title")}
          />
        </TelemetrySettingRow>
        <TelemetrySettingRow
          icon={Bug}
          title={t("components.telemetry.crashes.title")}
          body={t("settings.telemetry.crashes.desc")}
        >
          <Toggle
            checked={telemetry.status.crashReports === "enabled"}
            onChange={(enabled) => void change("crashReports", enabled)}
            disabled={telemetry.saving}
            label={t("components.telemetry.crashes.title")}
          />
        </TelemetrySettingRow>
      </div>

      <div className="mt-3 rounded-md bg-surface-2 p-3 text-xs leading-relaxed text-ink-muted">
        <p>{t("settings.telemetry.explainer")}</p>
        {!telemetry.configured && (
          <p className="mt-2 font-semibold text-warn">
            {t("settings.telemetry.buildDisabled")}
          </p>
        )}
        <button
          type="button"
          onClick={() => void openExternal(legalUrl(locale, "privacy"))}
          className="mt-2 inline-flex items-center gap-1 font-bold text-ink underline decoration-brass decoration-2 underline-offset-2 hover:text-brass"
        >
          {t("settings.telemetry.privacy")}
          <ExternalLink className="size-3" aria-hidden />
        </button>
      </div>

      {telemetry.status.installationId ? (
        <div className="mt-3 space-y-2">
          <CopyField
            label={t("settings.telemetry.id")}
            value={telemetry.status.installationId}
            mono
          />
          {bothDisabled && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="max-w-md text-xs text-ink-faint">
                {t("settings.telemetry.deletion.desc")}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="subtle"
                  size="sm"
                  onClick={() => void openExternal(legalUrl(locale, "privacy"))}
                >
                  {t("settings.telemetry.deletion.cta")}
                </Button>
                <Button
                  variant={confirmRegenerate ? "danger" : "subtle"}
                  size="sm"
                  onClick={() => void regenerate()}
                  disabled={telemetry.saving}
                >
                  <RotateCcw className="size-3.5" aria-hidden />
                  {confirmRegenerate
                    ? t("settings.telemetry.regenerate.confirm")
                    : t("settings.telemetry.regenerate.cta")}
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="mt-3 text-xs text-ink-faint">
          {t("settings.telemetry.id.pending")}
        </p>
      )}
    </div>
  );
}

function TelemetrySettingRow({
  icon: Icon,
  title,
  body,
  children,
}: {
  icon: typeof Activity;
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-3">
      <Icon className="size-4 shrink-0 text-brass" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold">{title}</div>
        <p className="text-xs text-ink-faint">{body}</p>
      </div>
      {children}
    </div>
  );
}
