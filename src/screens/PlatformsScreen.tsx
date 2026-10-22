import { useEffect, useRef, useState } from "react";
import { useConfirm } from "../lib/useConfirm";
import { AnimatePresence, Reorder, m, useDragControls } from "framer-motion";
import * as Collapsible from "@radix-ui/react-collapsible";
import { Modal } from "../components/Modal";
import {
  Plus,
  Trash2,
  Check,
  X,
  ChevronDown,
  Layers,
  Pencil,
  GripVertical,
  Wifi,
  ExternalLink,
  Crop,
} from "lucide-react";
import { useStore } from "../lib/store";
import { api } from "../lib/api";
import {
  PLATFORM_LIST,
  PLATFORMS,
  platformName,
  platformNote,
  platformTagline,
} from "../lib/platforms";
import { toast } from "../lib/toast";
import { cn, openExternal } from "../lib/utils";
import { useI18n, useT } from "../lib/i18n";
import type { AppConfig, PlatformId, Target } from "../lib/types";
import { draftInputProps, useDraft } from "../lib/useDraft";
import { youtubeAutoTargetId } from "../lib/readiness";
import { useReadiness, useReadinessContext } from "../lib/useReadiness";
import {
  INGEST_URL_RE,
  sanitizeIngestUrl,
  hasValidUrl,
  isUrlInvalid,
  targetIssueCodes,
} from "../lib/validation";
import {
  Badge,
  Button,
  Card,
  ExperimentalBadge,
  Hint,
  Input,
  PlatformGlyph,
  SectionTitle,
  Toggle,
} from "../components/ui";
import { ReframeEditor } from "../components/ReframeEditor";
import { KeyField, QuickConnect } from "../components/platforms/TargetConnect";
import { Mascot } from "../components/decor";

export function PlatformsScreen() {
  const { t, tp } = useI18n();
  const config = useStore((s) => s.config);
  const addTarget = useStore((s) => s.addTarget);
  const reorderTargets = useStore((s) => s.reorderTargets);
  const r = useReadiness();
  const [picking, setPicking] = useState(false);
  const [reframeTarget, setReframeTarget] = useState<Target | null>(null);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);

  if (!config) return null;

  const subtitle =
    config.targets.length === 0
      ? t("platforms.subtitle")
      : r.enabled.length === 0
        ? t("platforms.summary.noneOn")
        : r.pending.length === 0
          ? tp("platforms.summary.allReady", r.ready.length)
          : t("platforms.summary.partial", {
              ready: r.ready.length,
              total: r.enabled.length,
            });

  return (
    <div className="mx-auto max-w-3xl">
      <SectionTitle
        title={t("platforms.title")}
        subtitle={subtitle}
        right={
          <Button variant="primary" onClick={() => setPicking(true)}>
            <Plus className="size-4" strokeWidth={2.6} /> {t("platforms.add")}
          </Button>
        }
      />

      <ProfileBar />

      {config.targets.length === 0 ? (
        <EmptyState onAdd={() => setPicking(true)} />
      ) : (
        <Reorder.Group
          axis="y"
          values={config.targets}
          onReorder={reorderTargets}
          className="flex list-none flex-col gap-2.5"
        >
          {config.targets.map((tg) => (
            <TargetRow
              key={tg.id}
              target={tg}
              onReframe={() => setReframeTarget(tg)}
              justAdded={tg.id === justAddedId}
              onSpotlightDone={() => setJustAddedId(null)}
            />
          ))}
        </Reorder.Group>
      )}

      {config.targets.length > 1 && (
        <p className="mt-3 text-xs text-ink-faint">
          {t("platforms.footer.hint")}
        </p>
      )}

      {reframeTarget && (
        <ReframeEditor
          target={reframeTarget}
          onClose={() => setReframeTarget(null)}
        />
      )}

      {picking && (
        <PlatformPicker
          onPick={(id) => {
            const newId = addTarget(id);
            if (newId) setJustAddedId(newId);
            setPicking(false);
            toast.success(
              t("platforms.toast.added", { platform: platformName(id, t) }),
            );
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}

function ProfileBar() {
  const t = useT();
  const config = useStore((s) => s.config)!;
  const loadProfile = useStore((s) => s.loadProfile);
  const addProfile = useStore((s) => s.addProfile);
  const removeProfile = useStore((s) => s.removeProfile);
  const [editing, setEditing] = useState(false);
  const deleteProfileStep = useConfirm(3000, {
    resetKey: config.activeProfileId,
  });

  const active = config.profiles.find((p) => p.id === config.activeProfileId);
  if (!active) return null;
  const many = config.profiles.length > 1;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-surface-2 px-3 py-2">
      <span className="flex items-center gap-1.5 pr-1 text-xs font-bold uppercase tracking-wide text-ink-faint">
        <Layers className="size-3.5" />
        {t("platforms.profile.label")}
        <Hint text={t("platforms.profile.hint")} />
      </span>
      {config.profiles.map((p) => {
        const on = p.id === active.id;
        if (on && editing) {
          return (
            <ProfileNameInput
              key={p.id}
              profile={active}
              onDone={() => setEditing(false)}
            />
          );
        }
        return (
          <button
            key={p.id}
            onClick={() => {
              if (!on) loadProfile(p.id);
            }}
            aria-pressed={on}
            title={
              on
                ? t("platforms.profile.active")
                : t("platforms.profile.switchTo", {
                    name: p.name || t("platforms.profile.untitled"),
                  })
            }
            className={cn(
              "flex h-8 items-center gap-2 rounded-md px-2.5 font-display text-sm font-bold transition",
              on
                ? "bg-brass text-brass-ink"
                : "bg-surface text-ink-muted hover:-translate-y-px hover:text-ink",
            )}
          >
            <span className="max-w-[12rem] truncate">
              {p.name || t("platforms.profile.untitled")}
            </span>
            <span
              className={cn(
                "rounded-sm px-1 text-[11px] font-extrabold tabular-nums",
                on
                  ? "bg-brass-ink/15 text-brass-ink"
                  : "bg-surface-2 text-ink-faint",
              )}
              title={t("platforms.profile.count", { n: p.targets.length })}
            >
              {p.targets.length}
            </span>
          </button>
        );
      })}
      <Button
        variant="ghost"
        size="sm"
        onClick={() =>
          addProfile((n) => t("platforms.profile.defaultNew", { n }))
        }
      >
        <Plus className="size-4" strokeWidth={2.6} />{" "}
        {t("platforms.profile.new")}
      </Button>
      <div className="ml-auto flex items-center gap-1">
        {!editing && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditing(true)}
            title={t("platforms.profile.renameTitle")}
          >
            <Pencil className="size-3.5" /> {t("platforms.profile.rename")}
          </Button>
        )}
        {many && (
          <Button
            variant={deleteProfileStep.armed ? "danger" : "ghost"}
            size="sm"
            onClick={() => {
              if (deleteProfileStep.confirm()) removeProfile(active.id);
            }}
            title={t("platforms.profile.deleteTitle", {
              name: active.name || t("platforms.profile.untitled"),
            })}
          >
            <Trash2 className="size-3.5" />{" "}
            {deleteProfileStep.armed
              ? t("platforms.profile.deleteConfirm")
              : t("platforms.profile.delete")}
          </Button>
        )}
      </div>
    </div>
  );
}

function ProfileNameInput({
  profile,
  onDone,
}: {
  profile: AppConfig["profiles"][number];
  onDone: () => void;
}) {
  const t = useT();
  const renameProfile = useStore((s) => s.renameProfile);
  // Leaving the field unmounts it, which commits the pending name.
  const draft = useDraft(profile.name, (name) =>
    renameProfile(profile.id, name),
  );
  return (
    <input
      // eslint-disable-next-line jsx-a11y/no-autofocus -- Renaming replaces the activated button and preserves keyboard flow.
      autoFocus
      value={draft.value}
      onChange={(e) => draft.change(e.target.value)}
      onBlur={onDone}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === "Escape") onDone();
      }}
      aria-label={t("platforms.profile.nameAria")}
      className="h-8 min-w-0 max-w-[12rem] rounded-md border-2 border-brass bg-surface px-2.5 font-display text-sm font-bold text-ink outline-none [field-sizing:content]"
    />
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  const t = useT();
  return (
    <div className="rounded-xl bg-surface px-6 py-14 text-center pop">
      <div className="mx-auto mb-4 grid size-16 rotate-[-4deg] place-items-center rounded-lg bg-brass text-brass-ink pop-brass">
        <Mascot className="size-9 animate-shout" />
      </div>
      <h3 className="text-2xl">{t("platforms.empty.title")}</h3>
      <p className="mx-auto mt-1 max-w-sm text-sm text-ink-muted">
        {t("platforms.empty.body")}
      </p>
      <Button variant="primary" size="lg" className="mt-5" onClick={onAdd}>
        <Plus className="size-5" strokeWidth={2.6} /> {t("platforms.empty.cta")}
      </Button>
    </div>
  );
}

type RowTone = "ok" | "warn" | "bad" | "neutral";

function TargetRow({
  target,
  onReframe,
  justAdded,
  onSpotlightDone,
}: {
  target: Target;
  onReframe: () => void;
  justAdded?: boolean;
  onSpotlightDone?: () => void;
}) {
  const t = useT();
  const targets = useStore((s) => s.config!.targets);
  const updateTarget = useStore((s) => s.updateTarget);
  const removeTarget = useStore((s) => s.removeTarget);
  const toggleTarget = useStore((s) => s.toggleTarget);
  const moveTarget = useStore((s) => s.moveTarget);
  const undoRemoveTarget = useStore((s) => s.undoRemoveTarget);
  const r = useReadiness();
  const ctx = useReadinessContext();
  const controls = useDragControls();
  const preset = PLATFORMS[target.platformId];
  const userServer = !!preset.userServer;
  // Incomplete presets require a user-provided ingest URL; regional ingests stay editable.
  const presetUrlIncomplete = !INGEST_URL_RE.test(preset.ingestUrl.trim());
  const showUrlField =
    userServer || presetUrlIncomplete || !!preset.regionalIngest;
  const nameDraft = useDraft(target.name, (name) =>
    updateTarget(target.id, { name }),
  );
  const urlDraft = useDraft(
    INGEST_URL_RE.test(target.ingestUrl)
      ? target.ingestUrl
      : target.ingestUrl.replace(/^(rtmps?):\/\/$/i, ""),
    (ingestUrl) => updateTarget(target.id, { ingestUrl }),
    sanitizeIngestUrl,
  );
  // Validate what is being typed; the store receives it only when the edit ends.
  const edited = {
    ...target,
    name: nameDraft.value,
    ingestUrl: urlDraft.value,
  };
  const urlInvalid = isUrlInvalid(edited);
  const urlOk = hasValidUrl(edited);
  const pending = r.pending.find((p) => p.target.id === target.id);
  const auto =
    target.id === youtubeAutoTargetId(targets, ctx) && !target.hasKey;
  const keyOnly = !!pending && pending.issues.every((i) => i === "noKey");
  const noName = targetIssueCodes(edited).includes("noName");

  const status: { tone: RowTone; label: string; sub: string } = !target.enabled
    ? {
        tone: "neutral",
        label: t("platforms.target.badge.off"),
        sub: t("platforms.target.sub.off"),
      }
    : !urlOk
      ? {
          tone: "bad",
          label: urlInvalid
            ? t("platforms.target.badge.urlInvalid")
            : t("platforms.target.badge.noUrl"),
          sub: t("platforms.target.sub.noUrl"),
        }
      : pending
        ? {
            tone: "warn",
            label: t("platforms.target.badge.pasteKey"),
            sub: t("platforms.target.sub.noKey"),
          }
        : noName
          ? {
              tone: "warn",
              label: t("platforms.target.badge.noName"),
              sub: t("platforms.target.sub.ready"),
            }
          : {
              tone: "ok",
              label: t("platforms.target.badge.ready"),
              sub: auto
                ? t("platforms.target.sub.youtubeAuto")
                : t("platforms.target.sub.ready"),
            };

  const rec = target.encoding.preset ?? preset.recommended;
  const isPortrait = rec.height > rec.width;
  const [open, setOpen] = useState(() => !urlOk);

  const itemRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (!justAdded) return;
    itemRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    onSpotlightDone?.();
  }, [justAdded, onSpotlightDone]);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    msg: string;
  } | null>(null);
  useEffect(() => {
    setTestResult(null);
  }, [target.hasKey, target.ingestUrl, target.enabled]);
  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult({ ok: true, msg: await api.testTarget(target.id, t) });
    } catch (e) {
      setTestResult({ ok: false, msg: String(e) });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Reorder.Item
      ref={itemRef}
      value={target}
      dragListener={false}
      dragControls={controls}
      layout="position"
    >
      <Card
        className={cn(
          "group/row border-2 p-4 transition-colors duration-300",
          !target.enabled && "bg-surface-2",
          target.enabled && status.tone === "warn"
            ? "border-warn/45"
            : target.enabled && status.tone === "bad"
              ? "border-bad/45"
              : "border-transparent",
        )}
      >
        <Collapsible.Root open={open} onOpenChange={setOpen}>
          <div className="flex items-center gap-3">
            <button
              onPointerDown={(e) => controls.start(e)}
              onKeyDown={(e) => {
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  moveTarget(target.id, -1);
                } else if (e.key === "ArrowDown") {
                  e.preventDefault();
                  moveTarget(target.id, 1);
                }
              }}
              aria-label={t("platforms.target.reorderAria")}
              title={t("platforms.target.reorderTitle")}
              className="-ml-1 shrink-0 cursor-grab touch-none text-ink-faint opacity-40 transition-opacity focus-visible:opacity-100 active:cursor-grabbing group-hover/row:opacity-100"
            >
              <GripVertical className="size-5" />
            </button>
            <div
              aria-hidden
              className={cn(
                "shrink-0 transition-opacity",
                !target.enabled && "opacity-50",
              )}
            >
              <PlatformGlyph id={target.platformId} size={40} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <input
                  {...draftInputProps(nameDraft)}
                  aria-label={t("platforms.target.nameAria")}
                  className="min-w-0 max-w-full rounded-md border border-transparent bg-transparent px-1 font-display text-lg font-bold leading-tight text-ink outline-none [field-sizing:content] hover:border-border focus:border-brass focus:bg-surface-2"
                />
                {userServer && (
                  <Badge color={preset.color}>
                    {target.ingestUrl
                      .trim()
                      .match(/^(rtmps?):\/\//i)?.[1]
                      ?.toLowerCase() ?? preset.protocol}
                  </Badge>
                )}
                {preset.experimental && <ExperimentalBadge />}
              </div>
              <div className="mt-0.5 truncate px-1 text-xs text-ink-muted">
                {status.sub}
              </div>
            </div>
            <Badge tone={status.tone}>
              {status.tone === "ok" && (
                <Check className="size-3" strokeWidth={3} />
              )}
              {status.label}
            </Badge>
            <Toggle
              checked={target.enabled}
              onChange={() => toggleTarget(target.id)}
              label={t("platforms.target.enableAria", {
                name: target.name.trim() || platformName(target.platformId, t),
              })}
            />
            <Collapsible.Trigger asChild>
              <button
                aria-label={
                  open
                    ? t("platforms.target.collapseAria")
                    : t("platforms.target.expandAria")
                }
                className="grid size-8 shrink-0 place-items-center rounded-md text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <ChevronDown
                  className={cn(
                    "size-5 transition-transform duration-200",
                    open && "rotate-180",
                  )}
                />
              </button>
            </Collapsible.Trigger>
          </div>

          <AnimatePresence initial={false}>
            {target.enabled && keyOnly && !open && (
              <m.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="overflow-hidden"
              >
                <div className="pl-[4.75rem] pt-3">
                  <QuickConnect target={target} />
                </div>
              </m.div>
            )}
          </AnimatePresence>

          <Collapsible.Content className="mt-4 flex flex-col gap-4 border-t border-border-soft pt-4">
            <p className="text-xs text-ink-faint">
              {platformNote(target.platformId, t)}
            </p>

            {showUrlField ? (
              <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">
                <span>
                  {t("platforms.target.url.label")}
                  {!userServer && (
                    <span className="font-normal text-ink-faint">
                      {" "}
                      {preset.regionalIngest
                        ? t("platforms.target.url.helpPrefilled")
                        : t("platforms.target.url.help", {
                            platform: platformName(target.platformId, t),
                          })}
                    </span>
                  )}
                </span>
                <Input
                  {...draftInputProps(urlDraft)}
                  placeholder={t("platforms.target.url.placeholder")}
                  invalid={urlInvalid}
                />
                {urlInvalid && (
                  <span className="text-xs font-medium text-bad">
                    {t("platforms.target.url.invalid")}
                  </span>
                )}
              </label>
            ) : (
              <div className="flex items-center gap-2 text-xs">
                <span className="shrink-0 font-semibold text-ink-faint">
                  {t("platforms.target.url.label")}
                </span>
                <span
                  data-selectable
                  className="truncate font-mono text-ink-muted"
                >
                  {target.ingestUrl}
                </span>
              </div>
            )}

            <KeyField target={target} autoFocusKey={justAdded} />

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <Button
                variant="subtle"
                size="sm"
                onClick={runTest}
                loading={testing}
                title={t("platforms.target.test.title")}
              >
                {!testing && <Wifi className="size-3.5" />}{" "}
                {testing
                  ? t("platforms.target.test.running")
                  : t("platforms.target.test.cta")}
              </Button>
              {preset.keyUrl && (
                <button
                  onClick={() => void openExternal(preset.keyUrl!)}
                  className="flex items-center gap-1 font-semibold text-brass hover:underline"
                >
                  {t("platforms.target.getKey")}{" "}
                  <ExternalLink className="size-3" />
                </button>
              )}
              {isPortrait && (
                <button
                  onClick={onReframe}
                  className="flex items-center gap-1 font-semibold text-brass hover:underline"
                  title={t("platforms.target.reframeTitle")}
                >
                  <Crop className="size-3.5" /> {t("platforms.target.reframe")}
                </button>
              )}
              {/* Keep the status region mounted before the asynchronous result so screen readers announce it. */}
              <span
                role="status"
                className={cn(
                  testResult?.ok === true && "font-medium text-ink-muted",
                  testResult?.ok === false && "font-semibold text-bad",
                )}
              >
                {testResult &&
                  (testResult.ok ? (
                    t("platforms.target.test.ok", { msg: testResult.msg })
                  ) : (
                    <>✕ {testResult.msg}</>
                  ))}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={() => {
                  const name = target.name;
                  removeTarget(target.id);
                  toast.action(
                    t("platforms.toast.removed", { name }),
                    t("platforms.toast.undo"),
                    () => undoRemoveTarget(),
                  );
                }}
                aria-label={t("platforms.target.remove")}
              >
                <Trash2 className="size-4" /> {t("platforms.target.remove")}
              </Button>
            </div>
          </Collapsible.Content>
        </Collapsible.Root>
      </Card>
    </Reorder.Item>
  );
}

function PlatformPicker({
  onPick,
  onClose,
}: {
  onPick: (id: PlatformId) => void;
  onClose: () => void;
}) {
  const t = useT();
  const targets = useStore((s) => s.config?.targets ?? []);
  const countOf = (id: PlatformId) =>
    targets.filter((tg) => tg.platformId === id).length;
  const main = PLATFORM_LIST.filter((p) => !p.experimental);
  const experimental = PLATFORM_LIST.filter((p) => p.experimental);

  const option = (p: (typeof PLATFORM_LIST)[number], i: number) => (
    <m.button
      key={p.id}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.025 }}
      onClick={() => onPick(p.id)}
      title={platformNote(p.id, t)}
      className="flex items-center gap-3 rounded-md bg-surface-2 p-3 text-left transition hover:-translate-y-0.5 hover:bg-surface-3"
    >
      <PlatformGlyph id={p.id} size={38} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display font-bold">
          {platformName(p.id, t)}
        </span>
        <span className="mt-0.5 block text-xs font-medium text-ink-faint">
          {platformTagline(p.id, t)}
        </span>
      </span>
      {countOf(p.id) > 0 && (
        <Badge tone="neutral" className="shrink-0 self-start">
          {countOf(p.id) > 1
            ? t("platforms.picker.alreadyCount", { n: countOf(p.id) })
            : t("platforms.picker.already")}
        </Badge>
      )}
    </m.button>
  );

  return (
    <Modal
      title={t("platforms.picker.title")}
      onClose={onClose}
      className="max-w-2xl rounded-xl bg-surface p-5 pop"
    >
      <div className="mb-4 flex items-center justify-between">
        <h3 id="picker-title" className="text-xl">
          {t("platforms.picker.title")}
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          aria-label={t("encoding.close")}
        >
          <X className="size-4" />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">{main.map(option)}</div>
      {experimental.length > 0 && (
        <>
          <div className="mb-2 mt-5 flex items-center gap-2">
            <ExperimentalBadge />
            <span className="text-xs text-ink-faint">
              {t("platforms.picker.experimental")}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {experimental.map((p, i) => option(p, main.length + i))}
          </div>
        </>
      )}
    </Modal>
  );
}
