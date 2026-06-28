import { useEffect, useState } from "react";
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
  Gauge,
  Layers,
  Pencil,
  GripVertical,
  Eye,
  EyeOff,
  ClipboardPaste,
  Wifi,
  ExternalLink,
  Copy,
  Crop,
} from "lucide-react";
import { useStore } from "../lib/store";
import { api } from "../lib/api";
import { PLATFORM_LIST, PLATFORMS } from "../lib/platforms";
import { toast } from "../lib/toast";
import { cn, fmtBitrate, openExternal } from "../lib/utils";
import type { PlatformId, Target } from "../lib/types";
import { INGEST_URL_RE, blockingIssues, hasValidUrl, isUrlInvalid } from "../lib/validation";
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
import { Mascot } from "../components/decor";
import type { Screen } from "../components/Sidebar";

export function PlatformsScreen({ onNavigate }: { onNavigate?: (s: Screen) => void }) {
  const config = useStore((s) => s.config);
  const addTarget = useStore((s) => s.addTarget);
  const reorderTargets = useStore((s) => s.reorderTargets);
  const setEncodingFocus = useStore((s) => s.setEncodingFocus);
  const [picking, setPicking] = useState(false);
  const [reframeTarget, setReframeTarget] = useState<Target | null>(null);

  if (!config) return null;

  const tune = (id: string) => {
    setEncodingFocus(id);
    onNavigate?.("encoding");
  };

  return (
    <div className="mx-auto max-w-3xl">
      <SectionTitle
        kicker="Pra onde a corneta toca"
        title="Plataformas"
        subtitle="Escolha os destinos, cole a chave de cada um e eu pego seu vídeo do OBS e toco em todos de uma vez."
        right={
          <Button variant="primary" onClick={() => setPicking(true)}>
            <Plus className="size-4" strokeWidth={2.6} /> Adicionar
          </Button>
        }
      />

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
            {config.targets.map((t) => (
              <TargetRow
                key={t.id}
                target={t}
                onReframe={() => setReframeTarget(t)}
                onTune={() => tune(t.id)}
              />
            ))}
          </Reorder.Group>
        </>
      )}

      {reframeTarget && (
        <ReframeEditor target={reframeTarget} onClose={() => setReframeTarget(null)} />
      )}

      {picking && (
        <PlatformPicker
          onPick={(id) => {
            addTarget(id);
            setPicking(false);
            toast.success(`${PLATFORMS[id].name} entrou na corneta 📣`);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}

// Perfis = combos salvos de destinos (+ modo de qualidade). Cada perfil é uma pílula:
// vê todos de relance, troca num clique. A pílula ativa renomeia ao clicar; "Novo" e
// "Excluir" agem no ativo. Trocou o Select escondido por algo direto e legível.
function ProfileBar() {
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
          Perfil de transmissão
        </span>
        <Hint text="Um perfil é um conjunto salvo de destinos. Crie um pra cada situação (ex.: 'Solo Twitch+YT', 'Evento com TikTok') e troque entre eles num clique — a lista de plataformas troca junto." />
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
                  if (e.key === "Enter" || e.key === "Escape") setEditing(false);
                }}
                aria-label="Nome do perfil"
                className="h-9 min-w-0 max-w-[14rem] rounded-md border-2 border-brass bg-surface px-2.5 font-display text-sm font-bold text-ink outline-none [field-sizing:content]"
              />
            );
          }
          return (
            <button
              key={p.id}
              onClick={() => (on ? setEditing(true) : loadProfile(p.id))}
              aria-pressed={on}
              title={on ? "Clique pra renomear" : `Trocar pra "${p.name || "Sem nome"}"`}
              className={cn(
                "flex h-9 items-center gap-2 rounded-md px-3 font-display text-sm font-bold transition-all",
                on
                  ? "bg-brass text-brass-ink pop-brass"
                  : "bg-surface text-ink-muted ring-1 ring-border hover:-translate-y-px hover:text-ink",
              )}
            >
              <span className="max-w-[14rem] truncate">{p.name || "Sem nome"}</span>
              <span
                className={cn(
                  "rounded px-1.5 text-[10px] font-extrabold tabular-nums",
                  on ? "bg-brass-ink/15 text-brass-ink" : "bg-surface-2 text-ink-faint",
                )}
                title={`${p.targets.length} destino${p.targets.length === 1 ? "" : "s"}`}
              >
                {p.targets.length}
              </span>
            </button>
          );
        })}

        <Button variant="subtle" size="sm" className="h-9" onClick={addProfile}>
          <Plus className="size-4" strokeWidth={2.6} /> Novo perfil
        </Button>

        <div className="ml-auto flex items-center gap-1">
          {!editing && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9"
              onClick={() => setEditing(true)}
              title="Renomear o perfil ativo"
            >
              <Pencil className="size-3.5" /> Renomear
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
              title={`Excluir o perfil "${active.name || "Sem nome"}"`}
            >
              <Trash2 className="size-3.5" /> {confirmDel ? "Excluir mesmo?" : "Excluir"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-xl bg-surface px-6 py-14 text-center pop">
      <div className="mx-auto mb-4 grid size-16 rotate-[-4deg] place-items-center rounded-lg bg-brass text-brass-ink pop-brass">
        <Mascot className="size-9 animate-shout" />
      </div>
      <h3 className="text-2xl">Cadê os destinos?</h3>
      <p className="mx-auto mt-1 max-w-sm text-sm text-ink-muted">
        Sua corneta ainda não aponta pra lugar nenhum. Bora colocar a primeira
        plataforma?
      </p>
      <Button variant="primary" size="lg" className="mt-5" onClick={onAdd}>
        <Plus className="size-5" strokeWidth={2.6} /> Adicionar plataforma
      </Button>
    </div>
  );
}

// Chip de qualidade do destino (resolução · bitrate). Clica → tela Qualidade focada nele.
function QualityChip({ target, onClick }: { target: Target; onClick: () => void }) {
  const rec = target.encoding.preset ?? PLATFORMS[target.platformId].recommended;
  const res = `${Math.min(rec.width, rec.height)}p${rec.fps}`;
  return (
    <button
      type="button"
      onClick={onClick}
      title="Ajustar a qualidade deste destino"
      className="hidden shrink-0 items-center gap-1.5 rounded-md bg-surface-2 px-2 py-1 text-[11px] font-bold text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink sm:flex"
    >
      <Gauge className="size-3.5 text-brass" />
      <span className="tabular-nums">{res}</span>
      <span className="text-ink-faint">·</span>
      <span className="tabular-nums">{fmtBitrate(rec.videoBitrateKbps)}</span>
    </button>
  );
}

// Resumo "pronto pra live": o que está pronto e o que falta (chave/URL) num relance.
function ReadinessSummary({ targets }: { targets: Target[] }) {
  const enabled = targets.filter((t) => t.enabled);
  const ready = enabled.filter((t) => blockingIssues(t).length === 0).length;
  const semChave = enabled.filter((t) => !t.hasKey).length;
  const semUrl = enabled.filter((t) => !hasValidUrl(t)).length;
  const off = targets.length - enabled.length;
  const allReady = enabled.length > 0 && ready === enabled.length;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
      {allReady ? (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-ok/15 px-2.5 py-1 font-bold text-ok">
          <Check className="size-3.5" strokeWidth={2.8} /> Tudo pronto pra live
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-surface-2 px-2.5 py-1 font-bold text-ink-muted">
          <Check className="size-3.5 text-ok" strokeWidth={2.8} />
          <span className="text-ink">{ready}</span> pronto{ready === 1 ? "" : "s"}
        </span>
      )}
      {semChave > 0 && (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-bad/15 px-2.5 py-1 font-bold text-bad">
          <KeyRound className="size-3.5" /> {semChave} sem chave
        </span>
      )}
      {semUrl > 0 && (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-bad/15 px-2.5 py-1 font-bold text-bad">
          <AlertTriangle className="size-3.5" /> {semUrl} sem URL
        </span>
      )}
      {off > 0 && (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-surface-2 px-2.5 py-1 font-semibold text-ink-faint">
          {off} desligado{off === 1 ? "" : "s"}
        </span>
      )}
    </div>
  );
}

function TargetRow({
  target,
  onReframe,
  onTune,
}: {
  target: Target;
  onReframe: () => void;
  onTune: () => void;
}) {
  const updateTarget = useStore((s) => s.updateTarget);
  const removeTarget = useStore((s) => s.removeTarget);
  const toggleTarget = useStore((s) => s.toggleTarget);
  const duplicateTarget = useStore((s) => s.duplicateTarget);
  const moveTarget = useStore((s) => s.moveTarget);
  const undoRemoveTarget = useStore((s) => s.undoRemoveTarget);
  const controls = useDragControls();
  const preset = PLATFORMS[target.platformId];
  const isCustom = target.platformId === "custom";
  // Mostra o campo de URL quando o preset não traz uma URL completa (custom + betas
  // TikTok/X/Instagram, que vêm com "rtmp://" e dependem do painel da plataforma).
  const presetUrlIncomplete = !INGEST_URL_RE.test(preset.ingestUrl.trim());
  const showUrlField = isCustom || presetUrlIncomplete;
  const urlInvalid = isUrlInvalid(target);
  const urlOk = hasValidUrl(target);
  // Selo de prontidão (independe de estar ligado): o erro deixa de aparecer só no Ao vivo.
  const readiness = !urlOk
    ? { tone: "bad" as const, label: urlInvalid ? "URL inválida" : "Sem URL" }
    : !target.hasKey
      ? { tone: "bad" as const, label: "Falta chave" }
      : !target.name.trim()
        ? { tone: "warn" as const, label: "Sem nome" }
        : { tone: "ok" as const, label: "Pronto" };

  const rec = target.encoding.preset ?? preset.recommended;
  const isPortrait = rec.height > rec.width;
  // Bloqueios reais (chave/URL) — acendem o acento vermelho e abrem o cartão por padrão.
  const blocking = blockingIssues(target);
  const [open, setOpen] = useState(() => blocking.length > 0);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    msg: string;
  } | null>(null);
  // Resultado do "Testar rede" envelhece: zera ao trocar chave/URL/enabled.
  useEffect(() => {
    setTestResult(null);
  }, [target.hasKey, target.ingestUrl, target.enabled]);
  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult({ ok: true, msg: await api.testTarget(target.id) });
    } catch (e) {
      setTestResult({ ok: false, msg: String(e) });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Reorder.Item
      value={target}
      dragListener={false}
      dragControls={controls}
      layout="position"
    >
      <Card
        className={cn(
          "transition-opacity",
          !target.enabled && "opacity-50",
          blocking.length > 0 && "border-l-4 border-bad",
        )}
      >
        <Collapsible.Root open={open} onOpenChange={setOpen}>
        <div className="flex items-center gap-3">
          <button
            onPointerDown={(e) => controls.start(e)}
            onKeyDown={(e) => {
              if (e.key === "ArrowUp")
                (e.preventDefault(), moveTarget(target.id, -1));
              else if (e.key === "ArrowDown")
                (e.preventDefault(), moveTarget(target.id, 1));
            }}
            aria-label="Reordenar destino (setas ↑/↓)"
            title="Arraste ou use ↑/↓"
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
                aria-label="Nome do destino"
                className="min-w-0 max-w-full rounded-md border border-transparent bg-transparent px-1 font-display text-lg font-bold leading-tight text-ink outline-none [field-sizing:content] hover:border-border focus:border-brass focus:bg-surface-2"
              />
              <Badge color={preset.color}>{preset.protocol}</Badge>
              {preset.experimental && <ExperimentalBadge />}
            </div>
            <div className="mt-0.5 truncate text-xs text-ink-faint">
              {urlOk ? target.ingestUrl : "URL não definida"}
            </div>
          </div>
          <QualityChip target={target} onClick={onTune} />
          <Badge tone={readiness.tone}>{readiness.label}</Badge>
          <Toggle
            checked={target.enabled}
            onChange={() => toggleTarget(target.id)}
            label="Ativar"
          />
          <Collapsible.Trigger asChild>
            <button
              aria-label={open ? "Recolher destino" : "Expandir destino"}
              className="grid size-8 shrink-0 place-items-center rounded-md text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <ChevronDown className={cn("size-5 transition-transform", open && "rotate-180")} />
            </button>
          </Collapsible.Trigger>
        </div>

        <Collapsible.Content className="mt-4 flex flex-col gap-4">
        {showUrlField && (
          <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">
            <span>
              URL de ingestão
              {!isCustom && (
                <span className="font-normal text-ink-faint">
                  {" "}
                  — o endereço pra onde seu vídeo vai; cole a que o
                  painel da {preset.name} te deu
                </span>
              )}
            </span>
            <Input
              value={
                INGEST_URL_RE.test(target.ingestUrl)
                  ? target.ingestUrl
                  : target.ingestUrl.replace(/^(rtmps?|srt):\/\/$/i, "")
              }
              placeholder="rtmp://servidor/app  (rtmp://, rtmps:// ou srt://)"
              onChange={(e) =>
                updateTarget(target.id, { ingestUrl: e.target.value })
              }
              invalid={urlInvalid}
            />
            {urlInvalid && (
              <span className="text-[11px] font-medium text-bad">
                URL inválida — use rtmp://, rtmps:// ou srt://
              </span>
            )}
          </label>
        )}

        <KeyField target={target} />

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <Button
            variant="subtle"
            size="sm"
            onClick={runTest}
            disabled={testing}
            title="Vê se o servidor da plataforma está respondendo — não confere a chave"
          >
            <Wifi className="size-3.5" />{" "}
            {testing ? "Testando…" : "Testar rede"}
          </Button>
          {preset.keyUrl && (
            <button
              onClick={() => void openExternal(preset.keyUrl!)}
              className="flex items-center gap-1 font-semibold text-brass hover:underline"
            >
              Pegar minha chave <ExternalLink className="size-3" />
            </button>
          )}
          {isPortrait && (
            <button
              onClick={onReframe}
              className="flex items-center gap-1 font-semibold text-brass hover:underline"
              title="Recorta o 9:16 do seu vídeo pra esta saída vertical"
            >
              <Crop className="size-3.5" /> Enquadrar vertical
            </button>
          )}
          {testResult &&
            (testResult.ok ? (
              <span className="font-medium text-ink-muted">
                📡 {testResult.msg} · a chave só é confirmada ao vivo
              </span>
            ) : (
              <span className="font-semibold text-bad">✕ {testResult.msg}</span>
            ))}
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => duplicateTarget(target.id)} title="Duplicar">
              <Copy className="size-4" /> Duplicar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const name = target.name;
                removeTarget(target.id);
                toast.action(`${name} saiu da corneta`, "Desfazer", () => undoRemoveTarget());
              }}
              aria-label="Remover"
            >
              <Trash2 className="size-4" /> Remover
            </Button>
          </div>
        </div>

        {preset.note && <p className="text-xs text-ink-faint">{preset.note}</p>}
        </Collapsible.Content>
        </Collapsible.Root>
      </Card>
    </Reorder.Item>
  );
}

function KeyField({ target }: { target: Target }) {
  const setKey = useStore((s) => s.setKey);
  const clearKey = useStore((s) => s.clearKey);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [reveal, setReveal] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const paste = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (t) setValue(t.trim());
    } catch {
      /* área de transferência bloqueada */
    }
  };
  const save = async () => {
    await setKey(target.id, value.trim());
    setValue("");
    setEditing(false);
    toast.success("Chave guardada no cofre 🔒");
  };

  if (target.hasKey && !editing) {
    return (
      <div className="flex items-center gap-2 rounded-md bg-surface-2 px-3 py-2">
        <Check className="size-4 text-ok" strokeWidth={2.6} />
        <span className="text-sm font-semibold">Chave no cofre</span>
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
            <Pencil className="size-3.5" /> Trocar
          </Button>
          <Button
            variant={confirmClear ? "danger" : "ghost"}
            size="sm"
            onClick={() => {
              if (!confirmClear) {
                setConfirmClear(true);
                setTimeout(() => setConfirmClear(false), 3000);
                return;
              }
              setConfirmClear(false);
              clearKey(target.id);
              toast.info("Chave removida");
            }}
          >
            {confirmClear ? "Remover mesmo?" : "Remover"}
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
          autoFocus={editing}
          className="pl-9 pr-9"
          placeholder="Cole a chave de transmissão (stream key) que a plataforma te deu"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && value.trim() && void save()}
        />
        <button
          type="button"
          onClick={() => setReveal((v) => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink"
          aria-label={reveal ? "Ocultar" : "Mostrar"}
          title={reveal ? "Ocultar" : "Mostrar"}
        >
          {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      <Button
        variant="subtle"
        size="sm"
        onClick={paste}
        title="Colar da área de transferência"
      >
        <ClipboardPaste className="size-4" /> Colar
      </Button>
      <Button
        variant="primary"
        size="sm"
        disabled={!value.trim()}
        onClick={save}
      >
        Salvar
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
  const targets = useStore((s) => s.config?.targets ?? []);
  const countOf = (id: PlatformId) =>
    targets.filter((t) => t.platformId === id).length;

  return (
    <Modal title="Quem entra na corneta?" onClose={onClose} className="max-w-lg rounded-xl bg-surface p-5 pop">
        <div className="mb-4 flex items-center justify-between">
          <h3 id="picker-title" className="text-xl">
            Quem entra na corneta?
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
              title={p.note}
              className="flex items-center gap-3 rounded-md bg-surface-2 p-3 text-left transition-all hover:translate-x-0.5 hover:-translate-y-0.5 hover:bg-surface-3"
            >
              <PlatformGlyph id={p.id} size={38} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-display font-bold">{p.name}</span>
                  {p.experimental && <ExperimentalBadge className="shrink-0 scale-90" />}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] font-semibold text-ink-faint">
                  <span className="uppercase tracking-wide">{p.protocol}</span>
                  <span aria-hidden>·</span>
                  <span className="tabular-nums">
                    {Math.min(p.recommended.width, p.recommended.height)}p{p.recommended.fps} ·{" "}
                    {fmtBitrate(p.recommended.videoBitrateKbps)}
                  </span>
                </div>
              </div>
              {countOf(p.id) > 0 && (
                <Badge tone="neutral" className="shrink-0 self-start">
                  já tem{countOf(p.id) > 1 ? ` ×${countOf(p.id)}` : ""}
                </Badge>
              )}
            </button>
          ))}
        </div>
    </Modal>
  );
}
