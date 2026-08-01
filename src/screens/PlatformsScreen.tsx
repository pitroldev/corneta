import { useEffect, useRef, useState } from "react";
import { Reorder, useDragControls } from "framer-motion";
import * as Collapsible from "@radix-ui/react-collapsible";
import { Modal } from "../components/Modal";
import {
  KeyRound,
  Plus,
  Trash2,
  Check,
  X,
  AlertTriangle,
  ChevronDown,
  Layers,
  Pencil,
  GripVertical,
  Eye,
  EyeOff,
  ClipboardPaste,
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
import { cn, openExternal, uid } from "../lib/utils";
import { useI18n, useT, type I18n, type Locale } from "../lib/i18n";
import type { ChatPlatform, PlatformId, Target } from "../lib/types";
import {
  INGEST_URL_RE,
  sanitizeIngestUrl,
  blockingIssues,
  hasValidUrl,
  isUrlInvalid,
  sanitizeStreamKey,
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
import { FirstLiveChecklist } from "../components/FirstLiveChecklist";
import { Mascot } from "../components/decor";

export function PlatformsScreen() {
  const t = useT();
  const config = useStore((s) => s.config);
  const addTarget = useStore((s) => s.addTarget);
  const reorderTargets = useStore((s) => s.reorderTargets);
  const [picking, setPicking] = useState(false);
  const [reframeTarget, setReframeTarget] = useState<Target | null>(null);
  // Plataforma recém-adicionada: rola até o card novo e foca o campo da chave.
  const [justAddedId, setJustAddedId] = useState<string | null>(null);

  if (!config) return null;

  return (
    <div className="mx-auto max-w-3xl">
      <SectionTitle
        kicker={t("platforms.title.kicker")}
        title={t("platforms.title")}
        subtitle={t("platforms.subtitle")}
        right={
          <Button variant="primary" onClick={() => setPicking(true)}>
            <Plus className="size-4" strokeWidth={2.6} /> {t("platforms.add")}
          </Button>
        }
      />

      <FirstLiveChecklist />

      <ProfileBar />

      {config.targets.length === 0 ? (
        <EmptyState onAdd={() => setPicking(true)} />
      ) : (
        <>
          <ReadinessSummary targets={config.targets} />
          <Reorder.Group
            axis="y"
            values={config.targets}
            onReorder={reorderTargets}
            className="flex list-none flex-col gap-3"
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
        </>
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

// Perfis = combos salvos de plataformas (+ modo de qualidade). Cada perfil é uma pílula:
// vê todos de relance, troca num clique. Renomear é só pelo botão dedicado (clicar na
// pílula ativa não faz nada — evitava renomeio acidental no mesmo gesto da troca).
function ProfileBar() {
  const t = useT();
  const config = useStore((s) => s.config)!;
  const loadProfile = useStore((s) => s.loadProfile);
  const addProfile = useStore((s) => s.addProfile);
  const removeProfile = useStore((s) => s.removeProfile);
  const renameProfile = useStore((s) => s.renameProfile);
  const [editing, setEditing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const active = config.profiles.find((p) => p.id === config.activeProfileId);
  if (!active) return null;
  const many = config.profiles.length > 1;

  return (
    <div className="mb-6 rounded-lg bg-surface-2 p-3">
      <div className="mb-2.5 flex items-center gap-1.5 px-0.5">
        <Layers className="size-3.5 text-ink-faint" />
        <span className="text-xs font-bold uppercase tracking-wide text-ink-faint">
          {t("platforms.profile.label")}
        </span>
        <Hint text={t("platforms.profile.hint")} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {config.profiles.map((p) => {
          const on = p.id === active.id;
          if (on && editing) {
            return (
              <input
                key={p.id}
                autoFocus
                value={active.name}
                onChange={(e) => renameProfile(active.id, e.target.value)}
                onBlur={() => setEditing(false)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === "Escape")
                    setEditing(false);
                }}
                aria-label={t("platforms.profile.nameAria")}
                className="h-9 min-w-0 max-w-[14rem] rounded-md border-2 border-brass bg-surface px-2.5 font-display text-sm font-bold text-ink outline-none [field-sizing:content]"
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
                "flex h-9 items-center gap-2 rounded-md px-3 font-display text-sm font-bold transition",
                on
                  ? "bg-brass text-brass-ink pop-brass"
                  : "bg-surface text-ink-muted ring-1 ring-border hover:-translate-y-px hover:text-ink",
              )}
            >
              <span className="max-w-[14rem] truncate">
                {p.name || t("platforms.profile.untitled")}
              </span>
              <span
                className={cn(
                  "rounded px-1.5 text-[10px] font-extrabold tabular-nums",
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

        <Button variant="subtle" size="sm" className="h-9" onClick={addProfile}>
          <Plus className="size-4" strokeWidth={2.6} />{" "}
          {t("platforms.profile.new")}
        </Button>

        <div className="ml-auto flex items-center gap-1">
          {!editing && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9"
              onClick={() => setEditing(true)}
              title={t("platforms.profile.renameTitle")}
            >
              <Pencil className="size-3.5" /> {t("platforms.profile.rename")}
            </Button>
          )}
          {many && (
            <Button
              variant={confirmDel ? "danger" : "ghost"}
              size="sm"
              className="h-9"
              onClick={() => {
                if (confirmDel) {
                  removeProfile(active.id);
                  setConfirmDel(false);
                } else {
                  setConfirmDel(true);
                  setTimeout(() => setConfirmDel(false), 3000);
                }
              }}
              title={t("platforms.profile.deleteTitle", {
                name: active.name || t("platforms.profile.untitled"),
              })}
            >
              <Trash2 className="size-3.5" />{" "}
              {confirmDel
                ? t("platforms.profile.deleteConfirm")
                : t("platforms.profile.delete")}
            </Button>
          )}
        </div>
      </div>
    </div>
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

// Resumo "pronto pra live": o que está pronto e o que falta (chave/URL) num relance.
function ReadinessSummary({ targets }: { targets: Target[] }) {
  const t = useT();
  const enabled = targets.filter((x) => x.enabled);
  const ready = enabled.filter((x) => blockingIssues(x, t).length === 0).length;
  const semChave = enabled.filter((x) => !x.hasKey).length;
  const semUrl = enabled.filter((x) => !hasValidUrl(x)).length;
  const off = targets.length - enabled.length;
  const allReady = enabled.length > 0 && ready === enabled.length;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
      {allReady ? (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-ok/15 px-2.5 py-1 font-bold text-ok">
          <Check className="size-3.5" strokeWidth={2.8} />{" "}
          {t("platforms.readiness.allReady")}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-surface-2 px-2.5 py-1 font-bold text-ink-muted">
          <Check className="size-3.5 text-ok" strokeWidth={2.8} />
          <span className="text-ink">
            {t("platforms.readiness.ready", { n: ready })}
          </span>
        </span>
      )}
      {/* Chave ausente é pendência (warn), não erro — vermelho fica pra URL quebrada. */}
      {semChave > 0 && (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-warn/15 px-2.5 py-1 font-bold text-warn">
          <KeyRound className="size-3.5" />{" "}
          {t("platforms.readiness.noKey", { n: semChave })}
        </span>
      )}
      {semUrl > 0 && (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-bad/15 px-2.5 py-1 font-bold text-bad">
          <AlertTriangle className="size-3.5" />{" "}
          {t("platforms.readiness.noUrl", { n: semUrl })}
        </span>
      )}
      {off > 0 && (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-surface-2 px-2.5 py-1 font-semibold text-ink-faint">
          {t("platforms.readiness.off", { n: off })}
        </span>
      )}
    </div>
  );
}

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
  const updateTarget = useStore((s) => s.updateTarget);
  const removeTarget = useStore((s) => s.removeTarget);
  const toggleTarget = useStore((s) => s.toggleTarget);
  const moveTarget = useStore((s) => s.moveTarget);
  const undoRemoveTarget = useStore((s) => s.undoRemoveTarget);
  const controls = useDragControls();
  const preset = PLATFORMS[target.platformId];
  const isCustom = target.platformId === "custom";
  // Mostra o campo de URL quando o preset não traz uma URL completa (custom + betas
  // TikTok/X/Instagram, que vêm com "rtmp://" e dependem do painel da plataforma).
  // A Kick também mostra, pré-preenchido: a URL dela varia por conta/região.
  const presetUrlIncomplete = !INGEST_URL_RE.test(preset.ingestUrl.trim());
  const showUrlField =
    isCustom || presetUrlIncomplete || target.platformId === "kick";
  const urlInvalid = isUrlInvalid(target);
  const urlOk = hasValidUrl(target);
  // Selo de prontidão (independe de estar ligado): o erro deixa de aparecer só no Ao vivo.
  // Chave ausente é pendência convidativa (warn) — vermelho só pra URL quebrada/faltando.
  const readiness = !urlOk
    ? {
        tone: "bad" as const,
        label: urlInvalid
          ? t("platforms.target.badge.urlInvalid")
          : t("platforms.target.badge.noUrl"),
      }
    : !target.hasKey
      ? { tone: "warn" as const, label: t("platforms.target.badge.pasteKey") }
      : !target.name.trim()
        ? { tone: "warn" as const, label: t("platforms.target.badge.noName") }
        : { tone: "ok" as const, label: t("platforms.target.badge.ready") };

  const rec = target.encoding.preset ?? preset.recommended;
  const isPortrait = rec.height > rec.width;
  // Bloqueios reais (chave/URL) — acendem o acento na borda e abrem o cartão por padrão.
  // Só chave faltando (URL ok) = warn; URL quebrada = vermelho.
  const blocking = blockingIssues(target, t);
  const keyOnlyPending = blocking.length > 0 && urlOk;
  const [open, setOpen] = useState(() => blocking.length > 0);

  // Recém-adicionada: rola até o card (o foco da chave vai via autoFocus no KeyField).
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
  // Resultado do "Testar o servidor" envelhece: zera ao trocar chave/URL/enabled.
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
          "transition-opacity",
          !target.enabled && "opacity-50",
          blocking.length > 0 &&
            (keyOnlyPending
              ? "border-l-4 border-warn"
              : "border-l-4 border-bad"),
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
              className="shrink-0 cursor-grab touch-none text-ink-faint active:cursor-grabbing"
            >
              <GripVertical className="size-5" />
            </button>
            <PlatformGlyph id={target.platformId} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <input
                  value={target.name}
                  onChange={(e) =>
                    updateTarget(target.id, { name: e.target.value })
                  }
                  aria-label={t("platforms.target.nameAria")}
                  className="min-w-0 max-w-full rounded-md border border-transparent bg-transparent px-1 font-display text-lg font-bold leading-tight text-ink outline-none [field-sizing:content] hover:border-border focus:border-brass focus:bg-surface-2"
                />
                {/* Protocolo é jargão — só interessa no Personalizado, e aí reflete
                    o esquema da URL digitada (rtmp/rtmps), não o preset fixo. */}
                {isCustom && (
                  <Badge color={preset.color}>
                    {target.ingestUrl
                      .trim()
                      .match(/^(rtmps?):\/\//i)?.[1]
                      ?.toLowerCase() ?? preset.protocol}
                  </Badge>
                )}
                {preset.experimental && <ExperimentalBadge />}
              </div>
              <div className="mt-0.5 truncate text-xs text-ink-faint">
                {urlOk ? target.ingestUrl : t("platforms.target.urlUnset")}
              </div>
            </div>
            <Badge tone={readiness.tone}>{readiness.label}</Badge>
            <Toggle
              checked={target.enabled}
              onChange={() => toggleTarget(target.id)}
              label={t("platforms.target.enableAria")}
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
                    "size-5 transition-transform",
                    open && "rotate-180",
                  )}
                />
              </button>
            </Collapsible.Trigger>
          </div>

          <Collapsible.Content className="mt-4 flex flex-col gap-4">
            {/* A nota didática vem ANTES dos campos: é o que precisa ser lido
                antes de preencher (liberação de conta, onde pegar a chave etc.). */}
            <p className="text-xs text-ink-faint">
              {platformNote(target.platformId, t)}
            </p>

            {showUrlField && (
              <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">
                <span>
                  {t("platforms.target.url.label")}
                  {!isCustom && (
                    <span className="font-normal text-ink-faint">
                      {" "}
                      {target.platformId === "kick"
                        ? t("platforms.target.url.helpKick")
                        : t("platforms.target.url.help", {
                            platform: platformName(target.platformId, t),
                          })}
                    </span>
                  )}
                </span>
                <Input
                  value={
                    INGEST_URL_RE.test(target.ingestUrl)
                      ? target.ingestUrl
                      : target.ingestUrl.replace(/^(rtmps?):\/\/$/i, "")
                  }
                  placeholder={t("platforms.target.url.placeholder")}
                  onChange={(e) =>
                    updateTarget(target.id, { ingestUrl: e.target.value })
                  }
                  onBlur={(e) => {
                    // Tira espaços/aspas/quebras que colam junto com a URL.
                    const clean = sanitizeIngestUrl(e.target.value);
                    if (clean !== e.target.value)
                      updateTarget(target.id, { ingestUrl: clean });
                  }}
                  invalid={urlInvalid}
                />
                {urlInvalid && (
                  <span className="text-[11px] font-medium text-bad">
                    {t("platforms.target.url.invalid")}
                  </span>
                )}
              </label>
            )}

            <KeyField target={target} autoFocusKey={justAdded} />

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <Button
                variant="subtle"
                size="sm"
                onClick={runTest}
                disabled={testing}
                title={t("platforms.target.test.title")}
              >
                <Wifi className="size-3.5" />{" "}
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
              {testResult &&
                (testResult.ok ? (
                  <span className="font-medium text-ink-muted">
                    {t("platforms.target.test.ok", { msg: testResult.msg })}
                  </span>
                ) : (
                  <span className="font-semibold text-bad">
                    ✕ {testResult.msg}
                  </span>
                ))}
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

// Ponte plataforma→chat: guardar a chave NÃO configura o chat agregado (são
// cadastros separados). Depois de salvar, oferece criar a fonte na tela de Chat.
//
// O fragmento só existe por causa da preposição + gênero do português ("o chat
// DA Twitch", "DO YouTube"). Em inglês a frase pede o nome cru ("Want Twitch
// chat…"), então o mapa some e entra o nome do catálogo.
const CHAT_BRIDGE_LABEL_PT: Record<ChatPlatform, string> = {
  twitch: "da Twitch",
  youtube: "do YouTube",
  kick: "da Kick",
};

function isChatPlatform(id: PlatformId): id is ChatPlatform {
  return id === "twitch" || id === "youtube" || id === "kick";
}

// Não é componente: recebe `t` e o idioma de quem chama (o app tem duas janelas,
// então estado global de idioma viraria corrida entre elas).
function offerChatBridge(platformId: PlatformId, t: I18n["t"], locale: Locale) {
  if (!isChatPlatform(platformId)) return;
  const sources = useStore.getState().config?.settings.chatSources ?? [];
  if (sources.some((s) => s.platform === platformId)) return;
  // Oferece UMA vez por plataforma: quem trocar a chave 3x não leva 3 toasts.
  // Marcamos no momento da oferta (aceitar/ignorar não re-oferece).
  const offeredKey = `corneta.chatBridgeOffered.${platformId}`;
  try {
    if (localStorage.getItem(offeredKey)) return;
    localStorage.setItem(offeredKey, "1");
  } catch {
    /* storage indisponível: melhor arriscar oferecer de novo que nunca */
  }
  const platformLabel =
    locale === "pt-BR"
      ? CHAT_BRIDGE_LABEL_PT[platformId]
      : platformName(platformId, t);
  toast.action(
    t("platforms.chatBridge.ask", { platform: platformLabel }),
    t("platforms.chatBridge.cta"),
    () => {
      const st = useStore.getState();
      const cur = st.config?.settings.chatSources ?? [];
      // Pode ter sido criada enquanto o toast estava na tela — não duplica.
      if (!cur.some((s) => s.platform === platformId)) {
        st.setSettings({
          chatSources: [
            ...cur,
            {
              id: uid("src"),
              platform: platformId,
              value: "",
              name: "",
              enabled: true,
            },
          ],
        });
      }
      st.requestChatConfig("canais");
      st.requestNavigate("chat");
    },
  );
}

function KeyField({
  target,
  autoFocusKey,
}: {
  target: Target;
  autoFocusKey?: boolean;
}) {
  const { t, locale } = useI18n();
  const setKey = useStore((s) => s.setKey);
  const clearKey = useStore((s) => s.clearKey);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [reveal, setReveal] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const save = async (raw: string = value) => {
    try {
      // Idempotente: se digitou/colou a URL inteira, cortamos o servidor e avisamos.
      const { key, strippedUrl } = sanitizeStreamKey(raw, target.ingestUrl);
      if (!key) {
        // Colou só a URL do servidor (ou nada): não tem chave pra guardar.
        if (strippedUrl) toast.error(t("platforms.key.pastedUrlOnly"));
        return;
      }
      await setKey(target.id, key);
      setValue("");
      setEditing(false);
      if (strippedUrl) toast.info(t("platforms.key.strippedUrl"));
      toast.success(t("platforms.key.savedToast"));
      offerChatBridge(target.platformId, t, locale);
    } catch (e) {
      toast.error(t("platforms.key.saveFailed", { err: String(e) }));
    }
  };
  // Colar já salva: um clique a menos no caminho mais quente do onboarding
  // (quem prefere digitar continua com o campo + Salvar).
  const paste = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (!clip.trim()) return;
      await save(clip);
    } catch {
      /* área de transferência bloqueada */
    }
  };

  if (target.hasKey && !editing) {
    return (
      <div className="flex items-center gap-2 rounded-md bg-surface-2 px-3 py-2">
        <Check className="size-4 text-ok" strokeWidth={2.6} />
        <span className="text-sm font-semibold">
          {t("platforms.key.saved")}
        </span>
        <span className="font-mono text-sm text-ink-faint">•••••••••••</span>
        <div className="ml-auto flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setValue("");
              setEditing(true);
            }}
          >
            <Pencil className="size-3.5" /> {t("platforms.key.change")}
          </Button>
          <Button
            variant={confirmClear ? "danger" : "ghost"}
            size="sm"
            onClick={async () => {
              if (!confirmClear) {
                setConfirmClear(true);
                setTimeout(() => setConfirmClear(false), 3000);
                return;
              }
              setConfirmClear(false);
              try {
                await clearKey(target.id);
                toast.info(t("platforms.key.removed"));
              } catch (e) {
                toast.error(
                  t("platforms.key.removeFailed", { err: String(e) }),
                );
              }
            }}
          >
            {confirmClear
              ? t("platforms.key.removeConfirm")
              : t("platforms.key.remove")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
        <Input
          type={reveal ? "text" : "password"}
          autoFocus={editing || autoFocusKey}
          className="pl-9 pr-9"
          placeholder={t("platforms.key.placeholder")}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && value.trim() && void save()}
        />
        <button
          type="button"
          onClick={() => setReveal((v) => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink"
          aria-label={
            reveal ? t("platforms.key.hide") : t("platforms.key.show")
          }
          title={reveal ? t("platforms.key.hide") : t("platforms.key.show")}
        >
          {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      <Button
        variant="subtle"
        size="sm"
        onClick={paste}
        title={t("platforms.key.pasteSaveTitle")}
      >
        <ClipboardPaste className="size-4" /> {t("platforms.key.pasteSave")}
      </Button>
      <Button
        variant="primary"
        size="sm"
        disabled={!value.trim()}
        onClick={() => void save()}
      >
        {t("platforms.key.save")}
      </Button>
      {editing && (
        <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
          <X className="size-4" />
        </Button>
      )}
    </div>
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
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {PLATFORM_LIST.map((p) => (
          <button
            key={p.id}
            onClick={() => onPick(p.id)}
            title={platformNote(p.id, t)}
            className="flex items-center gap-3 rounded-md bg-surface-2 p-3 text-left transition hover:translate-x-0.5 hover:-translate-y-0.5 hover:bg-surface-3"
          >
            <PlatformGlyph id={p.id} size={38} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate font-display font-bold">
                  {platformName(p.id, t)}
                </span>
                {p.experimental && (
                  <ExperimentalBadge className="shrink-0 scale-90" />
                )}
              </div>
              {/* Descrição humana no lugar do protocolo: o pré-requisito
                  (conta liberada, vídeo em pé) aparece antes do clique. */}
              <div className="mt-0.5 text-[11px] font-medium text-ink-faint">
                {platformTagline(p.id, t)}
              </div>
            </div>
            {countOf(p.id) > 0 && (
              <Badge tone="neutral" className="shrink-0 self-start">
                {countOf(p.id) > 1
                  ? t("platforms.picker.alreadyCount", { n: countOf(p.id) })
                  : t("platforms.picker.already")}
              </Badge>
            )}
          </button>
        ))}
      </div>
    </Modal>
  );
}
