import * as Collapsible from "@radix-ui/react-collapsible";
import * as RTabs from "@radix-ui/react-tabs";
import {
  AlertTriangle,
  ChevronDown,
  Database,
  Download,
  FileText,
  Keyboard,
  MonitorCog,
  Palette,
  Plug,
  Server,
  Shield,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Select } from "../components/Select";
import { TelemetrySettingsPanel } from "../components/TelemetryConsent";
import {
  Button,
  Card,
  CopyField,
  EmptyState,
  ExperimentalBadge,
  Input,
  SectionTitle,
  Toggle,
} from "../components/ui";
import { api } from "../lib/api";
import { obsIngestUrl } from "../lib/factory";
import {
  LOCALES,
  LOCALE_LABEL,
  rich,
  useT,
  type MessageKey,
} from "../lib/i18n";
import { useStore } from "../lib/store";
import { shortcutErrorKey } from "../lib/shortcuts";
import { addStep } from "../lib/telemetry";
import { toast } from "../lib/toast";
import type { AppSettings } from "../lib/types";
import { cn } from "../lib/utils";
import { sanitizeHost } from "../lib/validation";
import { BrbPreview, BrbSlateChooser } from "./settings/BrbSettings";
import { GuardianEditor, GuardianPreview } from "./settings/GuardianSettings";
import { ObsTestButton } from "./settings/ObsTestButton";
import {
  BitratePreview,
  LoudnessPreview,
  LoudnessTarget,
} from "./settings/QualityPreviews";
import { RecordingSettings } from "./settings/RecordingSettings";
import {
  Field,
  SecurityFeature,
  SettingRow,
  SubSettings,
} from "./settings/SettingPrimitives";
import { ShortcutCapture } from "./settings/ShortcutCapture";

// Tab IDs are stable deep-link values; only labels are localized.
type SettingsTab = "obs" | "seguranca" | "geral";

const TABS: { id: SettingsTab; labelKey: MessageKey; icon: typeof Plug }[] = [
  { id: "geral", labelKey: "settings.tab.general", icon: MonitorCog },
  { id: "seguranca", labelKey: "settings.tab.safety", icon: Shield },
  { id: "obs", labelKey: "settings.tab.obs", icon: Plug },
];

export function SettingsScreen() {
  const t = useT();
  const config = useStore((s) => s.config);
  const setIngest = useStore((s) => s.setIngest);
  const setSettings = useStore((s) => s.setSettings);
  const load = useStore((s) => s.load);
  const live = useStore(
    (s) => s.snapshot.state === "live" || s.snapshot.state === "starting",
  );
  const requestedTab = useStore((s) => s.settingsTab);
  const setSettingsTab = useStore((s) => s.setSettingsTab);

  const [confirmImport, setConfirmImport] = useState(false);
  const [tab, setTab] = useState<SettingsTab>(
    () => (requestedTab as SettingsTab) || "geral",
  );
  const [portDraft, setPortDraft] = useState<string | null>(null);
  const [shortcutBusy, setShortcutBusy] = useState(false);
  const shortcutPending = useRef(false);
  const changeShortcut = async (value: string) => {
    if (shortcutPending.current) return;
    shortcutPending.current = true;
    setShortcutBusy(true);
    try {
      await api.registerShortcut(value);
      setSettings({ liveShortcut: value });
    } catch (error) {
      toast.error(t(shortcutErrorKey(error)));
    } finally {
      shortcutPending.current = false;
      setShortcutBusy(false);
    }
  };
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    if (requestedTab) {
      setTab(requestedTab as SettingsTab);
      setSettingsTab(null);
    }
  }, [requestedTab, setSettingsTab]);

  if (!config) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState title={t("settings.loading.title")}>
          {t("settings.loading.body")}
        </EmptyState>
      </div>
    );
  }
  const { ingest, settings } = config;
  const portShown = portDraft ?? String(ingest.port);
  const portNum = Number(portShown);
  const portInvalid =
    portShown.trim() === "" ||
    !Number.isInteger(portNum) ||
    portNum < 1 ||
    portNum > 65535;

  const onExport = async () => {
    try {
      if (await api.exportConfig())
        toast.success(t("settings.toast.export.ok"));
    } catch (e) {
      toast.error(t("settings.toast.export.error", { error: String(e) }));
    }
  };
  const onImport = async () => {
    if (!confirmImport) {
      setConfirmImport(true);
      setTimeout(() => setConfirmImport(false), 3000);
      return;
    }
    setConfirmImport(false);
    try {
      if (await api.importConfig()) {
        await load(t);
        toast.success(t("settings.toast.import.ok"));
      }
    } catch (e) {
      toast.error(t("settings.toast.import.error", { error: String(e) }));
    }
  };
  const onExportDiagnostics = async () => {
    addStep("diagnostics_export_requested");
    try {
      await api.exportDiagnostics();
    } catch {
      toast.error(t("settings.data.logs.export.error"));
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <SectionTitle
        kicker={t("settings.header.kicker")}
        title={t("settings.header.title")}
        subtitle={t("settings.header.subtitle")}
      />

      <RTabs.Root value={tab} onValueChange={(v) => setTab(v as SettingsTab)}>
        <RTabs.List className="mb-5 flex flex-wrap gap-2">
          {TABS.map((item) => {
            const Icon = item.icon;
            return (
              <RTabs.Trigger
                key={item.id}
                value={item.id}
                data-on-brass={tab === item.id ? "" : undefined}
                className={cn(
                  "inline-flex items-center gap-2 rounded-md px-4 py-2 font-display text-sm font-bold transition",
                  "bg-surface-2 text-ink-muted hover:bg-surface-3 hover:text-ink",
                  "data-[state=active]:bg-brass data-[state=active]:text-brass-ink data-[state=active]:pop-brass",
                )}
              >
                <Icon className="size-4" strokeWidth={2.4} /> {t(item.labelKey)}
              </RTabs.Trigger>
            );
          })}
        </RTabs.List>

        <RTabs.Content value="obs">
          <Card className="mb-4">
            <h3 className="flex items-center gap-2 text-lg">
              <Server className="size-5 text-brass" />{" "}
              {t("settings.obs.ingest.title")}
            </h3>
            <p className="mt-1 mb-4 text-xs text-ink-faint">
              {rich(t, "settings.obs.ingest.desc", {
                key: (
                  <strong className="text-ink-muted">
                    {t("settings.obs.ingest.desc.key")}
                  </strong>
                ),
              })}
            </p>

            {live && (
              <div className="mb-3 flex items-center gap-2 rounded-md bg-warn/15 px-3 py-2 text-xs font-semibold text-warn">
                <AlertTriangle className="size-4 shrink-0" />
                {t("settings.obs.ingest.liveLock")}
              </div>
            )}

            <div className="rounded-md bg-surface-2 p-3">
              <span className="text-xs font-bold uppercase tracking-wide text-ink-faint">
                {t("settings.obs.paste.label")}
              </span>
              <div className="mt-2 grid gap-2">
                <CopyField
                  label={t("settings.obs.paste.field.server")}
                  value={obsIngestUrl(ingest)}
                />
                <CopyField
                  label={t("settings.obs.paste.field.key")}
                  value={ingest.key}
                  mono
                />
              </div>
            </div>

            <Collapsible.Root
              open={advancedOpen}
              onOpenChange={setAdvancedOpen}
              className="mt-4"
            >
              <Collapsible.Trigger className="group flex w-full items-center gap-2 text-left text-sm font-bold text-ink-muted transition-colors hover:text-ink">
                {t("settings.obs.advanced.trigger")}
                <ChevronDown className="size-4 shrink-0 text-ink-faint transition-transform group-data-[state=open]:rotate-180" />
              </Collapsible.Trigger>
              <Collapsible.Content className="mt-3">
                <p className="mb-3 text-xs text-ink-faint">
                  {t("settings.obs.advanced.desc")}
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label={t("settings.obs.advanced.field.host")}>
                    <Input
                      value={ingest.host}
                      disabled={live}
                      onChange={(e) => setIngest({ host: e.target.value })}
                      onBlur={(e) => {
                        const clean = sanitizeHost(e.target.value);
                        if (clean !== e.target.value)
                          setIngest({ host: clean });
                      }}
                    />
                  </Field>
                  <Field label={t("settings.obs.advanced.field.port")}>
                    <Input
                      type="number"
                      value={portShown}
                      disabled={live}
                      invalid={portInvalid}
                      onChange={(e) => setPortDraft(e.target.value)}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        const port =
                          e.target.value.trim() !== "" && Number.isFinite(v)
                            ? Math.min(65535, Math.max(1, Math.round(v)))
                            : ingest.port;
                        if (port !== ingest.port) setIngest({ port });
                        setPortDraft(null);
                      }}
                    />
                    {portInvalid && (
                      <span className="text-[11px] font-medium text-bad">
                        {t("settings.obs.advanced.port.invalid")}
                      </span>
                    )}
                  </Field>
                  <Field label={t("settings.obs.advanced.field.app")}>
                    <Input
                      value={ingest.app}
                      disabled={live}
                      onChange={(e) => setIngest({ app: e.target.value })}
                    />
                  </Field>
                  <Field label={t("settings.obs.advanced.field.localKey")}>
                    <Input
                      value={ingest.key}
                      disabled={live}
                      onChange={(e) => setIngest({ key: e.target.value })}
                    />
                  </Field>
                </div>
              </Collapsible.Content>
            </Collapsible.Root>
          </Card>

          <Card className="mb-4">
            <h3 className="flex items-center gap-2 text-lg">
              <Plug className="size-5 text-brass" />{" "}
              {t("settings.obs.autoconfig.title")}
            </h3>
            <p className="mt-1 mb-4 text-xs text-ink-faint">
              {rich(t, "settings.obs.autoconfig.desc", {
                button: (
                  <strong className="text-ink-muted">
                    {t("settings.obs.autoconfig.desc.button")}
                  </strong>
                ),
                path: (
                  <strong className="text-ink-muted">
                    {t("settings.obs.autoconfig.desc.path")}
                  </strong>
                ),
              })}
            </p>
            <div className="divide-y divide-border-soft">
              <SettingRow
                title={t("settings.obs.password.title")}
                desc={t("settings.obs.password.desc")}
              >
                <div className="flex flex-col items-end gap-2">
                  <Input
                    type="password"
                    aria-label={t("settings.obs.password.title")}
                    placeholder={t("settings.obs.password.placeholder")}
                    className="w-48"
                    value={settings.obsPassword}
                    onChange={(e) =>
                      setSettings({ obsPassword: e.target.value })
                    }
                  />
                  <ObsTestButton />
                </div>
              </SettingRow>
              <SettingRow
                title={t("settings.obs.autostart.title")}
                desc={t("settings.obs.autostart.desc")}
              >
                <Toggle
                  checked={settings.autoStartObs}
                  onChange={(v) => setSettings({ autoStartObs: v })}
                  label={t("settings.obs.autostart.toggle")}
                />
              </SettingRow>
            </div>
          </Card>
        </RTabs.Content>

        <RTabs.Content value="seguranca">
          <Card accent>
            <h3 className="mb-1 flex items-center gap-2 text-lg">
              <Shield className="size-5 text-brass" />{" "}
              {t("settings.safety.title")}
            </h3>
            <p className="mb-2 text-xs text-ink-faint">
              {t("settings.safety.desc")}
            </p>
            <div className="divide-y divide-border-soft">
              <div>
                <SecurityFeature
                  preview={<BrbPreview />}
                  on={settings.brbEnabled}
                  title={t("settings.safety.brb.title")}
                  desc={t("settings.safety.brb.desc")}
                >
                  <Toggle
                    checked={settings.brbEnabled}
                    onChange={(v) => setSettings({ brbEnabled: v })}
                    label={t("settings.safety.brb.title")}
                  />
                </SecurityFeature>
                {settings.brbEnabled && (
                  <SubSettings>
                    <BrbSlateChooser />
                  </SubSettings>
                )}
              </div>

              <div>
                <SecurityFeature
                  preview={<BitratePreview />}
                  on={settings.autoBitrate}
                  title={t("settings.safety.bitrate.title")}
                  desc={t("settings.safety.bitrate.desc")}
                >
                  <Toggle
                    checked={settings.autoBitrate}
                    onChange={(v) => setSettings({ autoBitrate: v })}
                    label={t("settings.safety.bitrate.title")}
                  />
                </SecurityFeature>
              </div>

              <div>
                <SecurityFeature
                  preview={<LoudnessPreview />}
                  on={settings.loudnessNormalize}
                  title={t("settings.safety.loudness.title")}
                  desc={t("settings.safety.loudness.desc")}
                >
                  <Toggle
                    checked={settings.loudnessNormalize}
                    onChange={(v) => setSettings({ loudnessNormalize: v })}
                    label={t("settings.safety.loudness.title")}
                  />
                </SecurityFeature>
                {settings.loudnessNormalize && (
                  <SubSettings>
                    <LoudnessTarget />
                  </SubSettings>
                )}
              </div>

              <div>
                <SecurityFeature
                  preview={<GuardianPreview />}
                  on={settings.guardianEnabled}
                  title={t("settings.safety.guardian.title")}
                  badge={<ExperimentalBadge />}
                  desc={t("settings.safety.guardian.desc")}
                >
                  <Toggle
                    checked={settings.guardianEnabled}
                    onChange={(v) => setSettings({ guardianEnabled: v })}
                    label={t("settings.safety.guardian.title")}
                  />
                </SecurityFeature>
                {settings.guardianEnabled && (
                  <SubSettings>
                    <GuardianEditor />
                  </SubSettings>
                )}
              </div>
            </div>
          </Card>
        </RTabs.Content>

        <RTabs.Content value="geral">
          <RecordingSettings />
          <Card className="mb-4">
            <h3 className="mb-1 flex items-center gap-2 text-lg">
              <Keyboard className="size-5 text-brass" />{" "}
              {t("settings.hotkey.title")}
            </h3>
            <p className="mb-3 text-xs text-ink-faint">
              {t("settings.hotkey.desc")}
            </p>
            <div className="flex items-center gap-2">
              <ShortcutCapture
                value={settings.liveShortcut}
                disabled={shortcutBusy}
                onChange={(value) => void changeShortcut(value)}
              />
              {settings.liveShortcut && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={shortcutBusy}
                  onClick={() => void changeShortcut("")}
                >
                  <X className="size-4" /> {t("settings.hotkey.clear")}
                </Button>
              )}
            </div>
          </Card>

          <Card className="mb-4">
            <h3 className="mb-1 flex items-center gap-2 text-lg">
              <MonitorCog className="size-5 text-brass" />{" "}
              {t("settings.system.title")}
            </h3>
            <div className="divide-y divide-border-soft">
              <SettingRow
                title={t("settings.system.tray.title")}
                desc={t("settings.system.tray.desc")}
              >
                <Toggle
                  checked={settings.minimizeToTray}
                  onChange={(v) => setSettings({ minimizeToTray: v })}
                  label={t("settings.system.tray.toggle")}
                />
              </SettingRow>
              <SettingRow
                title={t("settings.system.autostart.title")}
                desc={t("settings.system.autostart.desc")}
              >
                <Toggle
                  checked={settings.autostart}
                  onChange={(v) => setSettings({ autostart: v })}
                  label={t("settings.system.autostart.toggle")}
                />
              </SettingRow>
            </div>
          </Card>

          <Card className="mb-4">
            <h3 className="mb-1 flex items-center gap-2 text-lg">
              <Palette className="size-5 text-brass" />{" "}
              {t("settings.appearance.title")}
            </h3>
            <div className="divide-y divide-border-soft">
              <SettingRow title={t("settings.appearance.lightTheme.title")}>
                <Toggle
                  checked={settings.theme === "light"}
                  onChange={(v) => setSettings({ theme: v ? "light" : "dark" })}
                  label={t("settings.appearance.lightTheme.toggle")}
                />
              </SettingRow>

              {/* Language names use their own language so users can recover from an accidental locale choice. */}
              <SettingRow
                title={t("settings.language.title")}
                desc={t("settings.language.desc")}
              >
                <Select
                  aria-label={t("settings.language.title")}
                  value={settings.language}
                  onChange={(v) =>
                    setSettings({ language: v as AppSettings["language"] })
                  }
                  options={[
                    { value: "auto", label: t("settings.language.auto") },
                    ...LOCALES.map((l) => ({
                      value: l,
                      label: LOCALE_LABEL[l],
                    })),
                  ]}
                />
              </SettingRow>
            </div>
          </Card>

          <Card>
            <h3 className="mb-1 flex items-center gap-2 text-lg">
              <Database className="size-5 text-brass" />{" "}
              {t("settings.data.title")}
            </h3>
            <TelemetrySettingsPanel />
            <div className="divide-y divide-border-soft">
              <SettingRow
                title={t("settings.data.backup.title")}
                desc={t("settings.data.backup.desc")}
              >
                <div className="flex gap-2">
                  <Button variant="subtle" size="sm" onClick={onExport}>
                    <Download className="size-4" />{" "}
                    {t("settings.data.backup.export")}
                  </Button>
                  <Button
                    variant={confirmImport ? "danger" : "subtle"}
                    size="sm"
                    onClick={onImport}
                  >
                    <Upload className="size-4" />{" "}
                    {confirmImport
                      ? t("settings.data.backup.import.confirm")
                      : t("settings.data.backup.import")}
                  </Button>
                </div>
              </SettingRow>
              <SettingRow
                title={t("settings.data.logs.title")}
                desc={t("settings.data.logs.desc")}
              >
                <div className="flex gap-2">
                  <Button
                    variant="subtle"
                    size="sm"
                    onClick={() => void onExportDiagnostics()}
                  >
                    <Download className="size-4" aria-hidden />{" "}
                    {t("settings.data.logs.export")}
                  </Button>
                  <Button
                    variant="subtle"
                    size="sm"
                    onClick={() => void api.openLogsDir()}
                  >
                    <FileText className="size-4" aria-hidden />{" "}
                    {t("settings.data.logs.open")}
                  </Button>
                </div>
              </SettingRow>
            </div>
          </Card>
        </RTabs.Content>
      </RTabs.Root>
    </div>
  );
}
