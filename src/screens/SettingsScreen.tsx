import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  AlertTriangle,
  AudioLines,
  Check,
  ChevronDown,
  Database,
  Download,
  FileText,
  FolderOpen,
  FolderSearch,
  HardDrive,
  Keyboard,
  MonitorCog,
  Palette,
  Plug,
  Play,
  ScanEye,
  Server,
  Shield,
  Upload,
  Video,
  X,
} from "lucide-react";
import * as Collapsible from "@radix-ui/react-collapsible";
import * as RTabs from "@radix-ui/react-tabs";
import { useStore } from "../lib/store";
import { api } from "../lib/api";
import { obsIngestUrl } from "../lib/factory";
import { lowestCommonDenominator } from "../lib/estimates";
import { brbSlateGeneration, renderBrbSlatePng } from "../lib/brbSlate";
import { toast } from "../lib/toast";
import { cn, errMsg } from "../lib/utils";
import { sanitizeHost } from "../lib/validation";
import { addStep, capture } from "../lib/telemetry";
import {
  fpsBucket,
  normalizeErrorCode,
  resolutionBucket,
} from "../lib/telemetry-schema";
import type { AppSettings, ObsCheck, RecordDirCheck } from "../lib/types";
import { Modal } from "../components/Modal";
import { TelemetrySettingsPanel } from "../components/TelemetryConsent";
import { Select } from "../components/Select";
import {
  LOCALES,
  LOCALE_LABEL,
  rich,
  useI18n,
  useT,
  type MessageKey,
} from "../lib/i18n";
import {
  Badge,
  Button,
  Card,
  CopyField,
  EmptyState,
  ExperimentalBadge,
  Input,
  SectionTitle,
  Toggle,
} from "../components/ui";

// Os ids ("obs" | "seguranca" | "geral") são identificadores de deep-link
// (store.settingsTab) — só o rótulo é texto de tela.
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
  // C20: os campos crus do endpoint nascem escondidos — a persona só copia.
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Deep-link do "Ajustar" (Ao vivo) → abre direto na aba certa, e consome o pedido.
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
        // O store não é componente e não tem `useT()` — quem chama passa o `t`.
        await load(t);
        // O backend guarda a config antiga antes de sobrescrever — dá o caminho de volta.
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

        {/* ===================== OBS ===================== */}
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

            {/* A tarefa nº1 aqui é COPIAR, não editar — os campos crus ficam no "Avançado". */}
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
                        // Se colar a URL inteira no campo de host, fica só o host.
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
                        // No blur (como no EncodingScreen): clampa pra 1–65535; vazio/inválido volta pro valor da config.
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

        {/* ===================== Segurança ao vivo ===================== */}
        <RTabs.Content value="seguranca">
          <Card accent>
            <h3 className="mb-1 flex items-center gap-2 text-lg">
              <Shield className="size-5 text-brass" />{" "}
              {t("settings.safety.title")}
            </h3>
            <p className="mb-2 text-xs text-ink-faint">
              {t("settings.safety.desc")}
            </p>
            {/* Cada feature + seus parâmetros formam um GRUPO: o divisor fica entre grupos, e os
                parâmetros só aparecem com a feature ligada, aninhados (colados) logo abaixo dela. */}
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
                    label={t("settings.safety.brb.toggle")}
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
                    label={t("settings.safety.bitrate.toggle")}
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
                    label={t("settings.safety.loudness.toggle")}
                  />
                </SecurityFeature>
                {settings.loudnessNormalize && (
                  <SubSettings>
                    <LoudnessTarget />
                  </SubSettings>
                )}
              </div>

              {/* O guardião fecha a lista porque é o único EXPERIMENTAL daqui.
                  No meio, ele emprestava a hesitação dele às redes que estão
                  prontas — e a ordem de uma lista de proteções é uma
                  recomendação, queira ela ou não. */}
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
                    label={t("settings.safety.guardian.toggle")}
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

        {/* ===================== Geral ===================== */}
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
                onChange={async (v) => {
                  const prev = settings.liveShortcut;
                  setSettings({ liveShortcut: v });
                  try {
                    await api.registerShortcut(v);
                  } catch {
                    // O backend desregistra o antigo antes de registrar — se o novo falhou
                    // (em uso por outro programa), reverte e re-registra o anterior.
                    toast.error(t("settings.hotkey.toast.inUse"));
                    setSettings({ liveShortcut: prev });
                    try {
                      await api.registerShortcut(prev);
                    } catch {
                      setSettings({ liveShortcut: "" });
                      toast.error(t("settings.hotkey.toast.restoreFailed"));
                    }
                  }
                }}
              />
              {settings.liveShortcut && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSettings({ liveShortcut: "" });
                    void api.registerShortcut("");
                  }}
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

              {/* O rótulo de cada idioma fica NO próprio idioma: quem abriu o
                  app em inglês por engano procura "Português", não "Portuguese".
                  Por isso os nomes não passam pelo `t`. */}
              <SettingRow
                title={t("settings.language.title")}
                desc={t("settings.language.desc")}
              >
                <Select
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

/** Testa o obs-websocket ali mesmo. Quatro desfechos, não dois: não achei /
 *  senha recusada / conectado mas apontando pra outro lugar / conectado de verdade. */
function ObsTestButton() {
  const t = useT();
  const [obs, setObs] = useState<ObsCheck | "loading" | null>(null);
  const run = async () => {
    setObs("loading");
    addStep("obs_check_started", { stage: "obs_check" });
    try {
      const result = await api.obsCheck();
      setObs(result);
      capture("obs_check_completed", {
        outcome: !result.reachable
          ? "not_reachable"
          : result.pointingAtCorneta
            ? "ok"
            : "wrong_destination",
        error_code: result.reachable
          ? result.pointingAtCorneta
            ? "none"
            : "wrong_destination"
          : result.authFailed
            ? "auth_failed"
            : normalizeErrorCode(result.error, "obs_unavailable"),
        resolution_bucket: resolutionBucket(result.width, result.height),
        fps_bucket: fpsBucket(result.fps),
      });
    } catch (e) {
      setObs({
        reachable: false,
        pointingAtCorneta: false,
        width: 0,
        height: 0,
        fps: 0,
        error: String(e),
      });
      capture("obs_check_completed", {
        outcome: "error",
        error_code: normalizeErrorCode(e, "obs_check_failed"),
        resolution_bucket: "unknown",
        fps_bucket: "unknown",
      });
    }
  };

  // O backend já manda o motivo em pt-BR no error; a senha é o caso que dá pra apontar direto.
  const verdict = (() => {
    if (!obs || obs === "loading") return null;
    if (!obs.reachable) {
      // O regex casa o motivo em pt-BR que o Rust manda no `error` — é leitura de
      // texto do backend, não copy de tela: não traduzir junto (ver "pendencias").
      // Campo do backend, não farejo de texto: o regex que morava aqui
      // (`/senha|identificar|autentic/`) parou de casar no instante em que as
      // mensagens do Rust ganharam inglês, e o conselho de senha sumia.
      const authFail = obs.authFailed;
      return authFail
        ? {
            tone: "text-bad",
            msg: t("settings.obs.test.authFail"),
          }
        : {
            tone: "text-bad",
            msg: t("settings.obs.test.notFound"),
          };
    }
    if (!obs.pointingAtCorneta)
      return {
        tone: "text-warn",
        msg: t("settings.obs.test.wrongTarget"),
      };
    return {
      tone: "text-ok",
      msg:
        obs.width > 0
          ? t("settings.obs.test.okDetail", {
              width: obs.width,
              height: obs.height,
              fps: obs.fps,
            })
          : t("settings.obs.test.ok"),
    };
  })();

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button
        variant="subtle"
        size="sm"
        onClick={run}
        loading={obs === "loading"}
        disabled={obs === "loading"}
      >
        {obs !== "loading" && <Plug className="size-4" />}
        {t("settings.obs.test.button")}
      </Button>
      {verdict && (
        <span
          className={cn(
            "flex max-w-64 items-start gap-1 text-right text-xs font-semibold",
            verdict.tone,
          )}
        >
          {verdict.tone === "text-ok" ? (
            <Check className="mt-0.5 size-3.5 shrink-0" />
          ) : (
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          )}
          {verdict.msg}
        </span>
      )}
    </div>
  );
}

/** Editor da watchlist do Guardião: contagem positiva + trim/dedup no blur. */
function GuardianEditor() {
  const { t, tp } = useI18n();
  const settings = useStore((s) => s.config!.settings);
  const setSettings = useStore((s) => s.setSettings);
  const watchCount = settings.guardianWatchlist.filter(
    (term) => term.trim().length >= 3,
  ).length;
  // Termos de 1–2 letras são descartados pelo motor — avisar em vez de fingir proteção.
  const shortTerms = settings.guardianWatchlist
    .map((term) => term.trim())
    .filter((term) => term.length > 0 && term.length < 3);

  return (
    <div className="flex flex-col gap-3 py-3.5">
      <div className="rounded-md border-2 border-brass/40 bg-brass/[0.06] p-3 text-xs leading-relaxed text-ink-muted">
        <div className="mb-1 font-display text-sm font-extrabold text-ink">
          {t("settings.guardian.cost.title")}
        </div>
        {rich(t, "settings.guardian.cost.intro", {
          // Nome próprio da tela: não traduz, mesma string nos dois idiomas.
          jaVolto: (
            <strong className="text-ink">
              {t("golive.bar.protection.brb")}
            </strong>
          ),
        })}
        <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
          <li>
            {rich(t, "settings.guardian.cost.delay", {
              delay: (
                <strong className="text-ink">
                  {t("settings.guardian.cost.delay.value")}
                </strong>
              ),
            })}
          </li>
          <li>{t("settings.guardian.cost.chat")}</li>
          <li>
            {rich(t, "settings.guardian.cost.scope", {
              no: (
                <strong className="text-ink">
                  {t("settings.guardian.cost.scope.no")}
                </strong>
              ),
            })}
          </li>
          <li>{t("settings.guardian.cost.smallText")}</li>
        </ul>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-ink-muted">
          {t("settings.guardian.list.label")}{" "}
          <span className="font-normal text-ink-faint">
            {t("settings.guardian.list.hint")}
          </span>
        </span>
        <textarea
          value={settings.guardianWatchlist.join("\n")}
          onChange={(e) =>
            setSettings({ guardianWatchlist: e.target.value.split("\n") })
          }
          onBlur={() =>
            setSettings({
              guardianWatchlist: Array.from(
                new Set(
                  settings.guardianWatchlist
                    .map((term) => term.trim())
                    .filter(Boolean),
                ),
              ),
            })
          }
          rows={4}
          placeholder={t("settings.guardian.list.placeholder")}
          className="resize-y rounded-md border-2 border-border bg-surface px-2 py-1.5 text-sm font-medium text-ink outline-none focus:border-brass"
        />
        {/* A frase inteira vem do dicionário, pelo tp(): o singular não é a
            mesma costura em todo idioma, e "termo(s)" é remendo, não texto.
            {terms} chega com as aspas já postas. */}
        {watchCount === 0 ? (
          <span className="text-xs font-semibold text-brass">
            {t("settings.guardian.list.empty")}
          </span>
        ) : shortTerms.length > 0 ? (
          <span className="text-xs font-semibold text-brass">
            {shortTerms.length === 1
              ? tp("settings.guardian.list.watchingOneShort", watchCount, {
                  terms: `"${shortTerms[0]}"`,
                })
              : tp("settings.guardian.list.watchingManyShort", watchCount, {
                  short: shortTerms.length,
                  terms: shortTerms.map((term) => `"${term}"`).join(", "),
                })}
          </span>
        ) : (
          <span className="text-xs font-semibold text-ok">
            {tp("settings.guardian.list.watching", watchCount)}
          </span>
        )}
      </label>
    </div>
  );
}

/** Captura um atalho global: clica e pressiona a combinação (exige um modificador).
 *  Tecla solta não passa batido: avisa na hora que precisa de Ctrl/Alt/Shift. Esc cancela. */
function ShortcutCapture({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const t = useT();
  const [capturing, setCapturing] = useState(false);
  const [hint, setHint] = useState(false);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Feedback de ~1.5s quando vier tecla sem modificador — some sozinho (reinicia se repetir).
  const flashHint = useCallback(() => {
    if (hintTimer.current) clearTimeout(hintTimer.current);
    setHint(true);
    hintTimer.current = setTimeout(() => setHint(false), 1500);
  }, []);
  useEffect(
    () => () => {
      if (hintTimer.current) clearTimeout(hintTimer.current);
    },
    [],
  );

  const onKey = (e: React.KeyboardEvent) => {
    if (!capturing) return;
    e.preventDefault();
    const k = e.key;
    if (k === "Escape") {
      // Cancela sem mexer no atalho atual.
      setCapturing(false);
      setHint(false);
      return;
    }
    if (["Control", "Alt", "Shift", "Meta", "OS"].includes(k)) return;
    const parts: string[] = [];
    if (e.ctrlKey || e.metaKey) parts.push("CommandOrControl");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");
    if (parts.length === 0) {
      // Atalho global exige modificador — avisar em vez de ignorar em silêncio.
      flashHint();
      return;
    }
    parts.push(k.length === 1 ? k.toUpperCase() : k);
    onChange(parts.join("+"));
    setCapturing(false);
    setHint(false);
  };

  return (
    <button
      onClick={() => setCapturing(true)}
      onBlur={() => {
        setCapturing(false);
        setHint(false);
      }}
      onKeyDown={onKey}
      className={cn(
        "rounded-md border-2 px-3 py-2 font-mono text-sm transition-colors",
        capturing && hint
          ? "border-warn text-warn"
          : capturing
            ? "border-brass text-brass"
            : "border-border text-ink hover:border-brass/60",
      )}
    >
      {capturing
        ? hint
          ? t("settings.hotkey.capture.needsModifier")
          : t("settings.hotkey.capture.prompt")
        : value || t("settings.hotkey.capture.idle")}
    </button>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">
      {label}
      {children}
    </label>
  );
}

/** Escolhe a tela do "JÁ VOLTO": padrão gerada ou arquivo próprio (imagem ou vídeo —
 *  a kind vem da extensão). O arquivo é copiado pro backend (brb-slate.*) e entra no
 *  ar quando o sinal cai. Preview 16:9 pra conferir o que vai pro ar de verdade. */
function BrbSlateChooser() {
  const { t, locale } = useI18n();
  const kind = useStore((s) => s.config!.settings.brbSlateKind) ?? "auto";
  const fileName = useStore((s) => s.config!.settings.brbSlateFileName);
  const setSettings = useStore((s) => s.setSettings);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string>("");

  // Preview vem do backend em JPEG base64 (vídeo = 1 frame); "" = indisponível.
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
      // null = usuário cancelou o seletor → sem mudança.
    } catch (e) {
      toast.error(
        t("settings.brb.slate.toast.fileError", { error: String(e) }),
      );
    } finally {
      setBusy(false);
    }
  };

  // Volta pro padrão: apaga o custom e regenera o PNG da Corneta (como o App faz no boot).
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

  // "image"/"video"/"auto" são os valores gravados na config e lidos pelo Rust —
  // só a frase muda de idioma.
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

  return (
    <div className="flex items-start gap-4 py-3.5">
      {/* Mesmo formato 16:9 dos previews de SecurityFeature — é isso que vai pro ar. */}
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
        <span className="text-sm font-semibold text-ink-muted">
          {t("settings.brb.slate.label")}
        </span>
        <div className="flex gap-2">
          <button
            className={opt(kind === "auto")}
            disabled={busy}
            onClick={useDefault}
          >
            {t("settings.brb.slate.default")}
          </button>
          <button
            className={opt(kind === "image" || kind === "video")}
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

/** A tela "JÁ VOLTO" que vai pro ar quando o sinal do OBS cai. */
function BrbPreview() {
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

/** O bitrate de saída (latão) descendo pra caber embaixo da banda disponível (linha tracejada). */
function BitratePreview() {
  return (
    <div className="absolute inset-0 bg-surface-2">
      <svg
        viewBox="0 0 128 72"
        preserveAspectRatio="none"
        className="h-full w-full"
      >
        <path
          d="M2 16 H44 L64 40 H84 L126 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="4 3"
          className="text-bad/70"
        />
        <path
          d="M2 26 H44 L64 50 H84 L126 26 V72 H2 Z"
          fill="currentColor"
          className="text-brass/20"
        />
        <path
          d="M2 26 H44 L64 50 H84 L126 26"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinejoin="round"
          className="text-brass"
        />
      </svg>
    </div>
  );
}

/** Uma linha da tela com um termo seu tampado — o Guardião viu e cortou. */
/** Sub-painel dos parâmetros de uma feature: acento de latão à esquerda + fundo sutil, colado
 *  logo abaixo do toggle. Renderizado só quando a feature está ligada — deixa claro que aquilo
 *  pertence à feature acima (em vez de virar uma linha solta na lista). */
function SubSettings({ children }: { children: ReactNode }) {
  return (
    <div className="-mt-1 mb-3 ml-1 rounded-md border-l-2 border-brass/30 bg-surface-2/40 px-3">
      {children}
    </div>
  );
}

/** Prévia do guardião de áudio: um medidor com a agulha na zona-alvo (verde). */
function LoudnessPreview() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-surface-2 px-2.5">
      <div className="relative h-2.5 w-4/5 overflow-hidden rounded-sm bg-night">
        <div className="absolute inset-y-0 left-[45%] right-[25%] bg-ok/40" />
        <div className="absolute inset-y-0 left-[58%] w-1 rounded-sm bg-ok" />
      </div>
      <AudioLines
        className="absolute right-1.5 top-1.5 size-3.5 text-brass"
        strokeWidth={2.4}
      />
    </div>
  );
}

/** Alvo de volume (LUFS) do normalizador: presets comuns. -14 é o padrão de Twitch/YouTube. */
function LoudnessTarget() {
  const t = useT();
  const target = useStore((s) => s.config!.settings.loudnessTargetLufs);
  const setSettings = useStore((s) => s.setSettings);
  // -14/-16/-18 são os valores em LUFS gravados na config; só o rótulo é texto.
  const opts = [
    { v: -14, label: t("settings.loudness.target.minus14") },
    { v: -16, label: t("settings.loudness.target.minus16") },
    { v: -18, label: t("settings.loudness.target.minus18") },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2 py-3.5">
      <span className="text-xs font-semibold text-ink-faint">
        {t("settings.loudness.target.label")}
      </span>
      {opts.map((o) => (
        <button
          key={o.v}
          onClick={() => setSettings({ loudnessTargetLufs: o.v })}
          className={cn(
            "rounded-md border-2 px-2.5 py-1 text-xs font-bold transition-colors",
            target === o.v
              ? "border-brass bg-brass/10 text-brass"
              : "border-border text-ink-muted hover:border-brass/60",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function GuardianPreview() {
  return (
    <div className="absolute inset-0 flex flex-col justify-center gap-1.5 bg-surface-2 px-2.5">
      <div className="h-1.5 w-4/5 rounded-full bg-ink-faint/40" />
      <div className="flex items-center gap-1.5">
        <div className="h-1.5 w-1/5 rounded-full bg-ink-faint/40" />
        <div className="h-3 flex-1 rounded-sm bg-night" />
      </div>
      <div className="h-1.5 w-3/5 rounded-full bg-ink-faint/40" />
      <ScanEye
        className="absolute right-1.5 top-1.5 size-3.5 text-brass"
        strokeWidth={2.4}
      />
    </div>
  );
}

/** Linha ILUSTRADA da "Segurança ao vivo": uma mini-tela mostra a proteção em ação e
 *  ganha moldura de latão (com sombra) quando está armada — como na tela Ao vivo. */
function SecurityFeature({
  preview,
  on,
  title,
  desc,
  badge,
  children,
}: {
  preview: ReactNode;
  on: boolean;
  title: string;
  desc: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <div className="flex items-center gap-4 py-4">
      <div
        className={cn(
          "relative aspect-video w-32 shrink-0 overflow-hidden rounded-md transition",
          on
            ? "pop-brass ring-2 ring-brass"
            : "opacity-60 grayscale ring-1 ring-border",
        )}
      >
        {preview}
        {!on && (
          <div className="absolute inset-0 grid place-items-center bg-night/45">
            <span className="rounded-sm bg-surface-3/90 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-ink-faint">
              {t("settings.safety.state.off")}
            </span>
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 font-display font-bold">
          {title}
          {badge}
          {on && (
            <Badge tone="brass" className="text-[10px]">
              {t("settings.safety.state.armed")}
            </Badge>
          )}
        </div>
        <div className="mt-0.5 text-sm text-ink-muted">{desc}</div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function SettingRow({
  title,
  desc,
  badge,
  children,
}: {
  title: string;
  desc?: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5">
      <div>
        <div className="flex items-center gap-2 font-display font-bold">
          {title}
          {badge}
        </div>
        {desc && (
          <div className="mt-0.5 max-w-xl text-sm text-ink-muted">{desc}</div>
        )}
      </div>
      {children}
    </div>
  );
}

// ============================================================
// Gravação da live (vídeo + chat) — ver docs/FEATURE-GRAVACAO-E-REPLAY.md §6.
//
// As duas chaves nascem DESLIGADAS e são independentes: uma custa disco, a outra guarda
// dado pessoal de terceiros na máquina do streamer. Nenhuma das duas é decisão da Corneta.
// ============================================================
/** Título de um bloco dentro dos ajustes de gravação. Existe pra que "onde
 *  salvar" e "espaço em disco" sejam ASSUNTOS, e não mais duas linhas na pilha. */
function RecordGroup({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 text-xs font-extrabold tracking-wide text-ink-faint uppercase [&>svg]:text-brass">
      {icon}
      {children}
    </div>
  );
}

function RecordingSettings() {
  const { t, fmt } = useI18n();
  const config = useStore((s) => s.config!);
  const settings = config.settings;
  const setSettings = useStore((s) => s.setSettings);
  const [check, setCheck] = useState<RecordDirCheck | null>(null);
  const [testing, setTesting] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const dir = settings.recordVideoDir;

  const validate = useCallback(async (path: string) => {
    try {
      setCheck(await api.recordCheckDir(path));
    } catch {
      setCheck(null);
    }
  }, []);

  useEffect(() => {
    if (settings.recordVideo) void validate(dir);
  }, [dir, settings.recordVideo, validate]);

  // Custo em disco a partir do bitrate REAL desta configuração, não de um número redondo.
  // "Gravar a live" sem "≈2,7 GB/h no seu bitrate" é uma pegadinha: o streamer só
  // descobriria o preço quando o SSD enchesse.
  const kbps =
    lowestCommonDenominator(config).videoKbps ??
    Math.max(
      2500,
      ...config.targets
        .filter((x) => x.enabled)
        .map((x) => x.encoding.preset?.videoBitrateKbps || 0),
    );
  const gbPerHour = ((kbps + 160) * 3600) / 8 / 1024 / 1024;

  const runTest = async () => {
    setTesting(true);
    try {
      const file = await api.recordTest(dir);
      // Tocar de volta ali mesmo é o que fecha a prova de ponta a ponta: pasta, escrita,
      // FFmpeg, remux, escopo do asset, CSP, codec e player, num clique só. Se o vídeo
      // aparecer, TODO o caminho da gravação funciona nesta máquina.
      setPreview(await api.recordVideoUrl(file));
      toast.success(t("settings.record.test.ok"));
    } catch (e) {
      toast.error(t("settings.record.test.fail", { error: errMsg(e) }));
    } finally {
      setTesting(false);
    }
  };

  const pick = async () => {
    const chosen = await api.recordPickDir();
    if (!chosen) return; // cancelou — não é erro
    const c = await api.recordCheckDir(chosen);
    setCheck(c);
    if (!c.ok) return; // pasta que não escreve não vira configuração
    setSettings({ recordVideoDir: chosen });
  };

  const dirErrorKey =
    check?.error === "notDir"
      ? "settings.record.dir.error.notDir"
      : check?.error === "readonly"
        ? "settings.record.dir.error.readonly"
        : "settings.record.dir.error.missing";

  // Abrir a pasta é o gesto que faltava: até aqui dava pra ESCOLHER onde salvar e
  // nunca pra ir lá ver. O comando resolve a pasta padrão sozinho, então funciona
  // igual quando o caminho está vazio — que é justamente quando o streamer não
  // sabe onde as gravações foram parar.
  const openDir = async () => {
    try {
      await api.openRecordingFolder();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const freeGb = check?.freeBytes != null ? check.freeBytes / 1024 ** 3 : null;
  const keepGb = settings.recordVideoKeepGb;
  // O limite passar do espaço livre é uma armadilha silenciosa: a faxina só age
  // DEPOIS de encher, então o disco acaba primeiro.
  const keepOverFree = freeGb != null && keepGb > freeGb;

  return (
    <Card className="mb-4">
      <h3 className="mb-1 flex items-center gap-2 text-lg">
        <Video className="size-5 text-brass" /> {t("settings.record.title")}
      </h3>
      <p className="mb-3 text-xs text-ink-faint">{t("settings.record.desc")}</p>

      <div className="divide-y divide-border-soft">
        <SettingRow
          title={t("settings.record.video.label")}
          desc={t("settings.record.video.hint", { gb: fmt.dec(gbPerHour, 1) })}
        >
          <Toggle
            checked={settings.recordVideo}
            onChange={(v) => setSettings({ recordVideo: v })}
            label={t("settings.record.video.label")}
          />
        </SettingRow>

        {/* Os ajustes do vídeo em BLOCOS, não numa pilha. Antes eram pasta,
            avisos, limite e teste soltos no mesmo nível, todos com o mesmo peso
            — e "onde salvar" acabava com a mesma importância visual que uma nota
            de rodapé. Cada assunto agora tem caixa e título próprios. */}
        {settings.recordVideo && (
          <div className="flex flex-col gap-3 py-3.5">
            <section className="rounded-md bg-surface-2 p-3">
              <RecordGroup icon={<FolderOpen className="size-4" />}>
                {t("settings.record.dir.label")}
              </RecordGroup>

              {/* O caminho INTEIRO, quebrando se precisar. Ele estava num chip de
                  384px com `truncate`, que cortava justo o fim — a parte que diz
                  em qual pasta a gravação cai. */}
              <p className="mt-2 rounded bg-surface px-2.5 py-2 font-mono text-xs break-all text-ink-muted">
                {dir || t("settings.record.dir.default")}
              </p>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={() => void openDir()}>
                  <FolderOpen className="size-4" />{" "}
                  {t("settings.record.dir.open")}
                </Button>
                <Button size="sm" variant="subtle" onClick={() => void pick()}>
                  <FolderSearch className="size-4" />{" "}
                  {t("settings.record.dir.pick")}
                </Button>
                {dir && (
                  <button
                    onClick={() => setSettings({ recordVideoDir: "" })}
                    className="text-xs font-semibold text-ink-faint hover:text-brass"
                  >
                    {t("settings.record.dir.reset")}
                  </button>
                )}
              </div>

              {check &&
                (check.error || check.removableOrNetwork || check.longPath) && (
                  <div className="mt-2 flex flex-col gap-1 text-xs">
                    {check.error && (
                      <span className="font-semibold text-bad">
                        {t(dirErrorKey)}
                      </span>
                    )}
                    {check.removableOrNetwork && (
                      <span className="text-warn">
                        {t("settings.record.warn.network")}
                      </span>
                    )}
                    {check.longPath && (
                      <span className="text-warn">
                        {t("settings.record.warn.longPath")}
                      </span>
                    )}
                  </div>
                )}
            </section>

            <section className="rounded-md bg-surface-2 p-3">
              <RecordGroup icon={<HardDrive className="size-4" />}>
                {t("settings.record.group.space")}
              </RecordGroup>

              {/* A barra dá ao limite a referência que ele nunca teve: "20 GB" é
                  um número abstrato até você ver quanto isso é do disco que
                  sobrou. Vermelha quando o limite passa do livre — aí a faxina
                  nunca chega a agir, porque o disco enche antes. */}
              {freeGb != null && (
                <>
                  <div
                    className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3"
                    role="img"
                    aria-label={t("settings.record.dir.free", {
                      size: fmt.dec(freeGb, 1),
                      hours: fmt.dec(freeGb / Math.max(gbPerHour, 0.1), 1),
                    })}
                  >
                    <div
                      className={cn(
                        "h-full rounded-full transition-[width] duration-200",
                        keepOverFree ? "bg-bad" : "bg-brass",
                      )}
                      style={{
                        width: `${Math.min(100, (keepGb / Math.max(freeGb, 0.1)) * 100)}%`,
                      }}
                    />
                  </div>
                  <p
                    className={cn(
                      "mt-1.5 text-xs",
                      check?.lowSpace ? "text-warn" : "text-ink-faint",
                    )}
                  >
                    {t("settings.record.dir.free", {
                      size: fmt.dec(freeGb, 1),
                      hours: fmt.dec(freeGb / Math.max(gbPerHour, 0.1), 1),
                    })}
                  </p>
                </>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2.5">
                <span className="text-sm font-semibold">
                  {t("settings.record.keep.label")}
                </span>
                <input
                  type="range"
                  min={5}
                  max={500}
                  step={5}
                  value={keepGb}
                  onChange={(e) =>
                    setSettings({ recordVideoKeepGb: Number(e.target.value) })
                  }
                  className="h-1 min-w-40 flex-1 accent-brass"
                  aria-label={t("settings.record.keep.label")}
                />
                {/* GB é a unidade do disco; hora é a unidade de quem transmite.
                    O limite só quer dizer alguma coisa nas duas. */}
                <span className="font-mono text-xs whitespace-nowrap">
                  {fmt.num(keepGb)} GB
                  <span className="ml-1.5 text-ink-faint">
                    {t("settings.record.keep.hours", {
                      hours: fmt.dec(keepGb / Math.max(gbPerHour, 0.1), 1),
                    })}
                  </span>
                </span>
              </div>
              <p
                className={cn(
                  "mt-1.5 text-[11px]",
                  keepOverFree ? "font-semibold text-warn" : "text-ink-faint",
                )}
              >
                {keepOverFree
                  ? t("settings.record.keep.over")
                  : t("settings.record.keep.hint")}
              </p>
            </section>

            <div>
              <Button
                size="sm"
                variant="subtle"
                loading={testing}
                onClick={() => void runTest()}
              >
                {!testing && <Play className="size-4" />}
                {testing
                  ? t("settings.record.test.busy")
                  : t("settings.record.test.cta")}
              </Button>
              <p className="mt-1 text-[11px] text-ink-faint">
                {t("settings.record.test.hint")}
              </p>
            </div>
          </div>
        )}

        <SettingRow
          title={t("settings.record.chat.label")}
          desc={t("settings.record.chat.hint")}
        >
          <Toggle
            checked={settings.recordChat}
            onChange={(v) => setSettings({ recordChat: v })}
            label={t("settings.record.chat.label")}
          />
        </SettingRow>
      </div>

      <p className="mt-3 rounded bg-surface-2 px-3 py-2 text-[11px] text-ink-muted">
        {t("settings.record.privacy")}
      </p>

      {/* O resultado do teste num modal de verdade (e não num <video> jogado no body):
          fecha no Esc, no clique fora e no X, como todo o resto do app. */}
      {preview && (
        <Modal
          title={t("settings.record.test.modal")}
          onClose={() => setPreview(null)}
        >
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            src={preview}
            controls
            autoPlay
            className="w-full rounded-lg bg-black"
          />
          <p className="mt-2 text-xs text-ink-muted">
            {t("settings.record.test.modal.body")}
          </p>
        </Modal>
      )}
    </Card>
  );
}
