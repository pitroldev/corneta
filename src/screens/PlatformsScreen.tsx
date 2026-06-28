import { useEffect, useState } from "react";
import { Reorder, useDragControls } from "framer-motion";
import { Modal } from "../components/Modal";
import {
  KeyRound,
  Plus,
  Trash2,
  Check,
  X,
  AlertTriangle,
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
import { cn, openExternal } from "../lib/utils";
import type { PlatformId, Target } from "../lib/types";
import { INGEST_URL_RE, hasValidUrl, isUrlInvalid } from "../lib/validation";
import {
  Badge,
  Button,
  Card,
  Input,
  PlatformGlyph,
  SectionTitle,
  Toggle,
} from "../components/ui";
import { Select } from "../components/Select";
import { ReframeEditor } from "../components/ReframeEditor";
import { Mascot } from "../components/decor";

export function PlatformsScreen() {
  const config = useStore((s) => s.config);
  const addTarget = useStore((s) => s.addTarget);
  const reorderTargets = useStore((s) => s.reorderTargets);
  const [picking, setPicking] = useState(false);
  const [reframeTarget, setReframeTarget] = useState<Target | null>(null);

  if (!config) return null;

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
          <RoutingBanner targets={config.targets} />
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
    <div className="mb-6 flex flex-wrap items-center gap-2 rounded-lg bg-surface-2 p-2.5">
      <span className="px-1 text-xs font-bold uppercase tracking-wide text-ink-faint">
        Perfil
      </span>

      {editing ? (
        <input
          autoFocus
          value={active.name}
          onChange={(e) => renameProfile(active.id, e.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => e.key === "Enter" && setEditing(false)}
          aria-label="Nome do perfil"
          className="min-w-0 max-w-full rounded-md border-2 border-brass bg-surface px-2 py-1 font-display text-base font-bold text-ink outline-none [field-sizing:content]"
        />
      ) : many ? (
        <Select
          className="w-48"
          value={config.activeProfileId}
          options={config.profiles.map((p) => ({ value: p.id, label: p.name }))}
          onChange={loadProfile}
        />
      ) : (
        <span className="font-display text-base font-bold">{active.name}</span>
      )}

      {!editing && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setEditing(true)}
          aria-label="Renomear perfil"
          title="Renomear"
        >
          <Pencil className="size-3.5" />
        </Button>
      )}

      <Button
        variant="subtle"
        size="sm"
        onClick={addProfile}
        className="ml-auto"
      >
        <Plus className="size-3.5" strokeWidth={2.6} /> Novo
      </Button>
      {many && (
        <Button
          variant={confirmDel ? "primary" : "ghost"}
          size="sm"
          onClick={() => {
            if (confirmDel) {
              removeProfile(active.id);
              setConfirmDel(false);
            } else {
              setConfirmDel(true);
              setTimeout(() => setConfirmDel(false), 3000);
            }
          }}
        >
          <Trash2 className="size-3.5" />{" "}
          {confirmDel ? "Confirmar?" : "Excluir"}
        </Button>
      )}
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

// Mapa de roteamento: seu OBS → a Corneta (megafone) → as plataformas reais que você
// configurou, tocando todas de uma vez. Glyphs apagados = destino desligado.
function RoutingBanner({ targets }: { targets: Target[] }) {
  const liveCount = targets.filter((t) => t.enabled).length;
  return (
    <div className="mb-6 flex items-center gap-2.5 overflow-hidden rounded-lg bg-surface-2 p-3 ring-1 ring-border sm:gap-3">
      <div className="flex shrink-0 items-center rounded-md bg-surface px-2.5 py-2 ring-1 ring-border">
        <span className="font-display text-sm font-extrabold text-ink">OBS</span>
      </div>
      <FlowArrow />
      <div
        className="grid size-10 shrink-0 -rotate-3 place-items-center rounded-lg bg-brass-ink text-brass pop"
        title="A Corneta espalha pra todos"
      >
        <Mascot className="size-6" />
      </div>
      <FlowArrow />
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        {targets.map((t) => (
          <span
            key={t.id}
            className={cn("transition-opacity", !t.enabled && "opacity-30 grayscale")}
            title={t.enabled ? t.name : `${t.name} (desligado)`}
          >
            <PlatformGlyph id={t.platformId} size={30} />
          </span>
        ))}
      </div>
      <div className="shrink-0 text-right text-[11px] font-bold uppercase leading-tight tracking-wide text-ink-faint">
        {liveCount} no ar
        <br />
        de uma vez
      </div>
    </div>
  );
}

function FlowArrow() {
  return (
    <svg viewBox="0 0 28 16" className="h-4 w-7 shrink-0 text-brass" fill="none" aria-hidden>
      <path d="M2 8 H22" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path
        d="M17 3 L23 8 L17 13"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TargetRow({
  target,
  onReframe,
}: {
  target: Target;
  onReframe: () => void;
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
    <Reorder.Item value={target} dragListener={false} dragControls={controls}>
      <Card
        className={cn(
          "flex flex-col gap-4 transition-opacity",
          !target.enabled && "opacity-50",
        )}
      >
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
              {preset.experimental && (
                <Badge className="-rotate-2 bg-tomate text-white pop-sm">
                  <AlertTriangle className="size-3" strokeWidth={2.8} />{" "}
                  Experimental
                </Badge>
              )}
            </div>
            <div className="mt-0.5 truncate text-xs text-ink-faint">
              {urlOk ? target.ingestUrl : "URL não definida"}
            </div>
          </div>
          <Badge tone={readiness.tone}>{readiness.label}</Badge>
          <Toggle
            checked={target.enabled}
            onChange={() => toggleTarget(target.id)}
            label="Ativar"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => duplicateTarget(target.id)}
            aria-label="Duplicar"
            title="Duplicar"
          >
            <Copy className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const name = target.name;
              removeTarget(target.id);
              toast.action(`${name} saiu da corneta`, "Desfazer", () =>
                undoRemoveTarget(),
              );
            }}
            aria-label="Remover"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>

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
        </div>

        {preset.note && <p className="text-xs text-ink-faint">{preset.note}</p>}
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
              className="flex items-center gap-3 rounded-md bg-surface-2 p-3 text-left transition-all hover:translate-x-0.5 hover:-translate-y-0.5 hover:bg-surface-3"
            >
              <PlatformGlyph id={p.id} size={38} />
              <div className="min-w-0">
                <div className="truncate font-display font-bold">{p.name}</div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                  {p.protocol}
                  {p.experimental && (
                    <span className="ml-1.5 text-tomate">· experimental</span>
                  )}
                </div>
              </div>
              {countOf(p.id) > 0 && (
                <Badge tone="neutral" className="ml-auto shrink-0">
                  já tem{countOf(p.id) > 1 ? ` ×${countOf(p.id)}` : ""}
                </Badge>
              )}
            </button>
          ))}
        </div>
    </Modal>
  );
}
