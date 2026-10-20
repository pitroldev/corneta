import type { ReactNode } from "react";
import { m } from "framer-motion";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Gauge,
  Info,
  Loader2,
  Plug,
  RefreshCw,
  Shield,
  Tv2,
  Wifi,
  Zap,
} from "lucide-react";
import { useStore } from "../../lib/store";
import { obsIngestUrl } from "../../lib/factory";
import { bandFit, effectiveAction, estimate } from "../../lib/estimates";
import { platformName } from "../../lib/platforms";
import {
  joinNames,
  obsConfigured,
  youtubeAutoTargetId,
} from "../../lib/readiness";
import { useReadiness, useReadinessContext } from "../../lib/useReadiness";
import { cn } from "../../lib/utils";
import { rich, useI18n, useT, type I18n } from "../../lib/i18n";
import type { TargetIssue } from "../../lib/validation";
import {
  Badge,
  Button,
  CopyField,
  ExperimentalBadge,
  PlatformGlyph,
  Toggle,
} from "../../components/ui";
import { Drawer } from "../../components/Drawer";
import { QualityModeCards, modeTitleKey } from "../../components/QualityModes";
import { QuickConnect } from "../../components/platforms/TargetConnect";
import type { Screen } from "../../components/Sidebar";
import { CheckRow } from "./parts";

export type ReadinessPanel = "platforms" | "obs" | "internet" | "safety";
type Tone = "ok" | "warn" | "bad" | "neutral" | "loading";

function useSafetyItems() {
  const t = useT();
  const settings = useStore((s) => s.config!.settings);
  const guardianStatus = useStore((s) => s.snapshot.guardianStatus);
  const watchCount = settings.guardianWatchlist.filter(
    (term) => term.trim().length >= 3,
  ).length;
  const guardianOn =
    settings.guardianEnabled &&
    watchCount > 0 &&
    (!guardianStatus || guardianStatus === "ready");
  return [
    {
      key: "brb",
      on: settings.brbEnabled,
      label: t("golive.security.brb.label"),
    },
    {
      key: "bitrate",
      on: settings.autoBitrate,
      label: t("golive.security.bitrate.label"),
    },
    {
      key: "guardian",
      on: guardianOn,
      label: t("golive.security.guardian.label"),
    },
  ];
}

export function ReadinessTiles({
  onOpen,
  testing,
}: {
  onOpen: (panel: ReadinessPanel) => void;
  testing: boolean;
}) {
  const { t, tp, fmt } = useI18n();
  const config = useStore((s) => s.config!);
  const obs = useStore((s) => s.obs);
  const uploadMbps = useStore((s) => s.uploadMbps);
  const r = useReadiness();
  const safety = useSafetyItems();
  const neededKbps = estimate(config).uploadKbps;
  const fit = bandFit(neededKbps, uploadMbps);

  const readyNames = r.ready.map(
    (x) => x.name || platformName(x.platformId, t),
  );
  const pendingNames = r.pending.map(
    (p) => p.target.name || platformName(p.target.platformId, t),
  );
  const platforms: TileProps =
    r.enabled.length === 0
      ? {
          tone: "bad",
          value: t("golive.tile.platforms.none"),
          sub: t("golive.tile.platforms.noneSub"),
        }
      : r.pending.length > 0
        ? {
            tone: "warn",
            value: t("golive.tile.platforms.partial", {
              ready: r.ready.length,
              total: r.enabled.length,
            }),
            sub: tp("golive.tile.platforms.missing", r.pending.length, {
              names: joinNames(pendingNames, t),
            }),
          }
        : {
            tone: "ok",
            value: tp("golive.tile.platforms.ready", r.ready.length),
            sub: joinNames(readyNames, t),
          };

  const obsTile: TileProps =
    obs === null || obs === "loading"
      ? {
          tone: "loading",
          value: t("golive.tile.obs.checking"),
          sub: t("golive.tile.obs.checkingSub"),
        }
      : obsConfigured(obs)
        ? {
            tone: "ok",
            value: t("golive.tile.obs.ok"),
            sub: obs.width
              ? `${obs.width}×${obs.height} · ${Math.round(obs.fps)} fps`
              : t("golive.tile.obs.okSub"),
          }
        : obs.reachable
          ? {
              tone: "warn",
              value: t("golive.tile.obs.notPointing"),
              sub: t("golive.tile.obs.fixSub"),
            }
          : {
              tone: "bad",
              value: obs.authFailed
                ? t("golive.tile.obs.auth")
                : t("golive.tile.obs.missing"),
              sub: t("golive.tile.obs.fixSub"),
            };

  const internet: TileProps =
    uploadMbps == null
      ? testing
        ? {
            tone: "loading",
            value: t("golive.tile.internet.testing"),
            sub: t("golive.tile.internet.testingSub"),
          }
        : {
            tone: "neutral",
            value: t("golive.tile.internet.unknown"),
            sub: t("golive.tile.internet.unknownSub"),
          }
      : {
          tone: fit === "ok" ? "ok" : fit === "warn" ? "warn" : "bad",
          value: `${fmt.num(uploadMbps)} Mbps`,
          sub: t("golive.tile.internet.uses", {
            mbps: fmt.dec(neededKbps / 1000, 1),
          }),
        };

  const armed = safety.filter((x) => x.on);
  const safetyTile: TileProps = {
    tone: armed.length > 0 ? "ok" : "neutral",
    value: t("golive.tile.safety.count", { on: armed.length, total: 3 }),
    sub:
      armed.length > 0
        ? joinNames(
            armed.map((x) => x.label),
            t,
          )
        : t("golive.tile.safety.noneSub"),
  };

  const tiles: [ReadinessPanel, typeof Tv2, string, TileProps][] = [
    ["platforms", Tv2, t("golive.tile.platforms.label"), platforms],
    ["obs", Plug, t("golive.tile.obs.label"), obsTile],
    ["internet", Wifi, t("golive.tile.internet.label"), internet],
    ["safety", Shield, t("golive.tile.safety.label"), safetyTile],
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map(([panel, Icon, label, props], i) => (
        <m.div
          key={panel}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.04, duration: 0.2, ease: "easeOut" }}
        >
          <Tile
            icon={<Icon className="size-3.5" strokeWidth={2.4} />}
            label={label}
            onClick={() => onOpen(panel)}
            {...props}
          />
        </m.div>
      ))}
    </div>
  );
}

interface TileProps {
  tone: Tone;
  value: string;
  sub: string;
}

function ToneIcon({ tone }: { tone: Tone }) {
  if (tone === "loading")
    return <Loader2 className="size-4 animate-spin text-ink-faint" />;
  if (tone === "ok")
    return <Check className="size-4 text-ok" strokeWidth={2.8} />;
  if (tone === "warn") return <AlertTriangle className="size-4 text-warn" />;
  if (tone === "bad") return <AlertTriangle className="size-4 text-bad" />;
  return <Info className="size-4 text-ink-faint" />;
}

function Tile({
  icon,
  label,
  tone,
  value,
  sub,
  onClick,
}: TileProps & { icon: ReactNode; label: string; onClick: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t("golive.tile.aria", { label, value, sub })}
      className={cn(
        "group flex h-full w-full flex-col gap-1 rounded-lg border-2 bg-surface p-3.5 text-left transition hover:-translate-y-0.5 hover:bg-surface-2 active:translate-y-0",
        tone === "warn"
          ? "border-warn/50"
          : tone === "bad"
            ? "border-bad/50"
            : "border-transparent",
      )}
    >
      <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-faint">
        {icon}
        {label}
        <span className="ml-auto">
          <ToneIcon tone={tone} />
        </span>
      </span>
      <span className="font-display text-lg font-extrabold leading-tight">
        {value}
      </span>
      <span className="flex items-center gap-1 text-xs text-ink-muted">
        <span className="min-w-0 truncate">{sub}</span>
        <ChevronRight className="ml-auto size-3.5 shrink-0 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100" />
      </span>
    </button>
  );
}

/** One drawer for the four readiness tiles; the panel decides the content. */
export function ReadinessDrawer({
  panel,
  onClose,
  onNavigate,
  onSetupObs,
  onRecheckObs,
  onGuide,
  onTest,
  testing,
}: {
  panel: ReadinessPanel | null;
  onClose: () => void;
  onNavigate?: (s: Screen) => void;
  onSetupObs: () => void;
  onRecheckObs: () => void;
  onGuide: () => void;
  onTest: () => void;
  testing: boolean;
}) {
  const t = useT();
  const setSettingsTab = useStore((s) => s.setSettingsTab);
  const go = (s: Screen) => {
    onClose();
    onNavigate?.(s);
  };
  const meta: Record<
    ReadinessPanel,
    { title: string; subtitle: string; icon: ReactNode; footer?: ReactNode }
  > = {
    platforms: {
      title: t("golive.drawer.platforms.title"),
      subtitle: t("golive.drawer.platforms.subtitle"),
      icon: <Tv2 className="size-5" />,
      footer: (
        <Button
          variant="subtle"
          className="w-full"
          onClick={() => go("platforms")}
        >
          {t("golive.drawer.platforms.manage")}
          <ChevronRight className="size-4" />
        </Button>
      ),
    },
    obs: {
      title: t("golive.drawer.obs.title"),
      subtitle: t("golive.drawer.obs.subtitle"),
      icon: <Plug className="size-5" />,
    },
    internet: {
      title: t("golive.drawer.internet.title"),
      subtitle: t("golive.drawer.internet.subtitle"),
      icon: <Wifi className="size-5" />,
      footer: (
        <Button
          variant="subtle"
          className="w-full"
          onClick={() => go("encoding")}
        >
          {t("golive.drawer.internet.more")}
          <ChevronRight className="size-4" />
        </Button>
      ),
    },
    safety: {
      title: t("golive.drawer.safety.title"),
      subtitle: t("golive.drawer.safety.subtitle"),
      icon: <Shield className="size-5" />,
      footer: (
        <Button
          variant="subtle"
          className="w-full"
          onClick={() => {
            setSettingsTab("seguranca");
            go("settings");
          }}
        >
          {t("golive.drawer.safety.more")}
          <ChevronRight className="size-4" />
        </Button>
      ),
    },
  };
  const current = panel ? meta[panel] : null;
  return (
    <Drawer
      open={panel !== null}
      onClose={onClose}
      title={current?.title ?? ""}
      subtitle={current?.subtitle}
      icon={current?.icon}
      footer={current?.footer}
    >
      {panel === "platforms" && <PlatformsPanel onNavigate={go} />}
      {panel === "obs" && (
        <ObsPanel
          onSetupObs={onSetupObs}
          onRecheck={onRecheckObs}
          onGuide={onGuide}
        />
      )}
      {panel === "internet" && (
        <InternetPanel onTest={onTest} testing={testing} />
      )}
      {panel === "safety" && <SafetyPanel />}
    </Drawer>
  );
}

function issueLabel(issue: TargetIssue, t: I18n["t"]): string {
  return t(
    issue === "noKey"
      ? "golive.drawer.platforms.issue.noKey"
      : "golive.drawer.platforms.issue.url",
  );
}

function PlatformsPanel({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  const t = useT();
  const targets = useStore((s) => s.config!.targets);
  const toggleTarget = useStore((s) => s.toggleTarget);
  const r = useReadiness();
  const ctx = useReadinessContext();
  const autoYoutube = youtubeAutoTargetId(targets, ctx);
  if (targets.length === 0)
    return (
      <div className="rounded-lg bg-surface-2 p-4 text-sm text-ink-muted">
        <p>{t("golive.drawer.platforms.empty")}</p>
        <Button
          variant="primary"
          size="sm"
          className="mt-3"
          onClick={() => onNavigate("platforms")}
        >
          {t("golive.drawer.platforms.add")}
        </Button>
      </div>
    );
  return (
    <ul className="flex flex-col gap-2">
      {targets.map((target) => {
        const pending = r.pending.find((p) => p.target.id === target.id);
        const name = target.name || platformName(target.platformId, t);
        const keyOnly = pending?.issues.every((i) => i === "noKey");
        return (
          <li
            key={target.id}
            className={cn(
              "rounded-lg bg-surface-2 p-3 transition-opacity",
              !target.enabled && "opacity-60",
            )}
          >
            <div className="flex items-center gap-3">
              <PlatformGlyph id={target.platformId} size={32} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-display font-bold">{name}</div>
                <div
                  className={cn(
                    "text-xs",
                    pending ? "font-semibold text-warn" : "text-ink-faint",
                  )}
                >
                  {!target.enabled
                    ? t("golive.drawer.platforms.off")
                    : pending
                      ? issueLabel(pending.issues[0], t)
                      : target.id === autoYoutube && !target.hasKey
                        ? t("golive.drawer.platforms.youtubeAuto")
                        : t("golive.drawer.platforms.ready")}
                </div>
              </div>
              <Toggle
                checked={target.enabled}
                onChange={() => toggleTarget(target.id)}
                label={t("platforms.target.enableAria", { name })}
              />
            </div>
            {pending &&
              (keyOnly ? (
                <QuickConnect target={target} className="mt-3" />
              ) : (
                <Button
                  variant="subtle"
                  size="sm"
                  className="mt-3"
                  onClick={() => onNavigate("platforms")}
                >
                  {t("golive.drawer.platforms.fixUrl")}
                </Button>
              ))}
          </li>
        );
      })}
    </ul>
  );
}

function ObsPanel({
  onSetupObs,
  onRecheck,
  onGuide,
}: {
  onSetupObs: () => void;
  onRecheck: () => void;
  onGuide: () => void;
}) {
  const t = useT();
  const config = useStore((s) => s.config!);
  const obs = useStore((s) => s.obs);
  const encoders = useStore((s) => s.encoders);
  const ok = obsConfigured(obs);
  const checking = obs === null || obs === "loading";
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg bg-surface-2 p-3.5">
        <div className="flex flex-col gap-1.5">
          {checking ? (
            <span className="flex items-center gap-2 text-sm text-ink-muted">
              <Loader2 className="size-4 animate-spin" />
              {t("golive.tile.obs.checking")}
            </span>
          ) : (
            <>
              <CheckRow
                label={t("golive.checkup.obsConnected")}
                ok={obs.reachable}
                warn={!obs.reachable}
                detail={
                  obs.reachable
                    ? undefined
                    : obs.authFailed
                      ? t("golive.rescue.authFailed")
                      : t("golive.checkup.obsConnected.fix")
                }
              />
              {obs.reachable && (
                <CheckRow
                  label={t("golive.checkup.obsPointing")}
                  ok={obs.pointingAtCorneta}
                  warn={!obs.pointingAtCorneta}
                  detail={
                    obs.pointingAtCorneta
                      ? `${obs.width}×${obs.height} · ${Math.round(obs.fps)} fps`
                      : t("golive.drawer.obs.notPointing")
                  }
                />
              )}
            </>
          )}
          <CheckRow
            label={t("golive.checkup.encoder")}
            ok={encoders.some((e) => e.available)}
            warn={encoders.length === 0}
            detail={
              encoders.length === 0 ? t("golive.checkup.checking") : undefined
            }
          />
        </div>
        <div className="mt-3.5 flex flex-wrap gap-2">
          <Button
            variant={ok ? "subtle" : "primary"}
            size="sm"
            onClick={onSetupObs}
          >
            <Zap className="size-4" /> {t("golive.obs.fixForMe")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRecheck}
            loading={obs === "loading"}
            disabled={obs === "loading"}
          >
            {obs !== "loading" && <RefreshCw className="size-4" />}
            {t("golive.obs.check")}
          </Button>
        </div>
      </div>

      <div>
        <h4 className="mb-1 font-display text-base font-extrabold">
          {t("golive.drawer.obs.manual")}
        </h4>
        <p className="mb-2.5 text-xs text-ink-faint">
          {rich(t, "golive.obs.hint", {
            caminho: (
              <strong className="text-ink-muted">
                {t("golive.obs.hint.path")}
              </strong>
            ),
          })}
        </p>
        <div className="flex flex-col gap-2">
          <CopyField
            label={t("golive.obs.field.server")}
            value={obsIngestUrl(config.ingest)}
            stacked
          />
          <CopyField
            label={t("golive.obs.field.key")}
            value={config.ingest.key}
            mono
            stacked
          />
        </div>
        <p className="mt-2 text-xs text-ink-faint">
          {t("golive.obs.key.note")}
        </p>
      </div>

      {config.targets.some(
        (target) =>
          target.enabled && effectiveAction(config.mode, target) === "copy",
      ) && (
        <p className="rounded-lg bg-surface-2 p-3 text-xs text-ink-muted">
          {rich(t, "golive.checkup.tip", {
            caminho: (
              <strong className="text-ink">
                {t("golive.checkup.tip.path")}
              </strong>
            ),
            taxa: (
              <strong className="text-ink">
                {t("golive.checkup.tip.rateControl")}
              </strong>
            ),
            keyframe: (
              <strong className="text-ink">
                {t("golive.checkup.tip.keyframe")}
              </strong>
            ),
          })}
        </p>
      )}
      <button
        type="button"
        onClick={onGuide}
        className="flex items-center gap-1.5 self-start text-xs font-bold text-brass hover:underline"
      >
        <Gauge className="size-3.5" /> {t("golive.obs.qualityGuide")}
      </button>
    </div>
  );
}

function InternetPanel({
  onTest,
  testing,
}: {
  onTest: () => void;
  testing: boolean;
}) {
  const { t, fmt } = useI18n();
  const config = useStore((s) => s.config!);
  const uploadMbps = useStore((s) => s.uploadMbps);
  const onAir = useStore(
    (s) => s.snapshot.state === "live" || s.snapshot.state === "starting",
  );
  const neededKbps = estimate(config).uploadKbps;
  const fit = bandFit(neededKbps, uploadMbps);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4 rounded-lg bg-surface-2 p-4">
        <div className="min-w-0 flex-1">
          <div className="font-display text-4xl font-extrabold leading-none tabular-nums">
            {uploadMbps == null ? "—" : fmt.num(uploadMbps)}
            <span className="ml-1 text-base text-ink-muted">Mbps</span>
          </div>
          <div className="mt-1 text-xs text-ink-muted">
            {uploadMbps == null
              ? t("golive.drawer.internet.unknown")
              : t("golive.drawer.internet.measured")}
          </div>
        </div>
        <Button
          variant={uploadMbps == null ? "primary" : "subtle"}
          size="sm"
          onClick={onTest}
          loading={testing}
          disabled={testing || onAir}
          title={onAir ? t("golive.band.test.disabledTitle") : undefined}
        >
          {!testing && <Wifi className="size-4" />}
          {testing ? t("golive.band.testing") : t("golive.band.test")}
        </Button>
      </div>
      <p
        className={cn(
          "rounded-lg p-3 text-sm",
          fit === "ok"
            ? "bg-ok/10 text-ink"
            : fit === "warn"
              ? "bg-warn/10 text-ink"
              : fit === "bad"
                ? "bg-bad/10 text-ink"
                : "bg-surface-2 text-ink-muted",
        )}
      >
        {t(
          fit === "ok"
            ? "golive.drawer.internet.fit.ok"
            : fit === "warn"
              ? "golive.drawer.internet.fit.warn"
              : fit === "bad"
                ? "golive.drawer.internet.fit.bad"
                : "golive.drawer.internet.fit.unknown",
          {
            mbps: fmt.dec(neededKbps / 1000, 1),
            mode: t(modeTitleKey(config.mode)),
          },
        )}
      </p>
      <div>
        <h4 className="mb-2 font-display text-base font-extrabold">
          {t("golive.drawer.internet.modes")}
        </h4>
        <QualityModeCards compact />
      </div>
    </div>
  );
}

function SafetyPanel() {
  const t = useT();
  const settings = useStore((s) => s.config!.settings);
  const setSettings = useStore((s) => s.setSettings);
  const guardianStatus = useStore((s) => s.snapshot.guardianStatus);
  const watchCount = settings.guardianWatchlist.filter(
    (term) => term.trim().length >= 3,
  ).length;
  const rows: {
    key: string;
    label: string;
    desc: string;
    on: boolean;
    set: (v: boolean) => void;
    experimental?: boolean;
    status?: string;
  }[] = [
    {
      key: "brb",
      label: t("golive.security.brb.label"),
      desc: settings.brbEnabled
        ? t("golive.security.brb.desc")
        : t("golive.security.brb.desc.off"),
      on: settings.brbEnabled,
      set: (brbEnabled) => setSettings({ brbEnabled }),
    },
    {
      key: "bitrate",
      label: t("golive.security.bitrate.label"),
      desc: settings.autoBitrate
        ? t("golive.security.bitrate.desc")
        : t("golive.security.bitrate.desc.off"),
      on: settings.autoBitrate,
      set: (autoBitrate) => setSettings({ autoBitrate }),
    },
    {
      key: "guardian",
      label: t("golive.security.guardian.label"),
      desc:
        guardianStatus && guardianStatus !== "ready"
          ? t(`guardian.status.${guardianStatus}.body`)
          : settings.guardianEnabled
            ? watchCount > 0
              ? t("golive.security.guardian.watching", { n: watchCount })
              : t("golive.security.guardian.noTerms")
            : t("golive.security.guardian.desc.off"),
      on: settings.guardianEnabled,
      set: (guardianEnabled) => setSettings({ guardianEnabled }),
      experimental: true,
      status:
        guardianStatus && guardianStatus !== "ready"
          ? t(`guardian.status.${guardianStatus}.short`)
          : undefined,
    },
  ];
  if (settings.loudnessNormalize)
    rows.push({
      key: "loudness",
      label: t("golive.security.loudness.label"),
      desc: t("golive.security.loudness.desc"),
      on: settings.loudnessNormalize,
      set: (loudnessNormalize) => setSettings({ loudnessNormalize }),
    });
  return (
    <div className="flex flex-col gap-2">
      {rows.map((row) => (
        <div
          key={row.key}
          className="flex items-start gap-3 rounded-lg bg-surface-2 p-3.5"
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display font-bold">{row.label}</span>
              {row.experimental && <ExperimentalBadge />}
              {row.status && <Badge tone="warn">{row.status}</Badge>}
            </div>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
              {row.desc}
            </p>
          </div>
          <Toggle checked={row.on} onChange={row.set} label={row.label} />
        </div>
      ))}
      <p className="mt-1 text-xs text-ink-faint">
        {t("golive.drawer.safety.note")}
      </p>
    </div>
  );
}
