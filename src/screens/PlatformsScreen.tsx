import { useEffect, useState } from "react";
import { AnimatePresence, motion, Reorder, useDragControls } from "framer-motion";
import {
  KeyRound, Plus, Trash2, Check, X, AlertTriangle, Pencil,
  GripVertical, Eye, EyeOff, ClipboardPaste, Wifi, ExternalLink,
} from "lucide-react";
import { useStore } from "../lib/store";
import { api } from "../lib/api";
import { PLATFORM_LIST, PLATFORMS } from "../lib/platforms";
import { toast } from "../lib/toast";
import { cn, openExternal } from "../lib/utils";
import type { PlatformId, Target } from "../lib/types";
import { isCustomUrlInvalid } from "../lib/validation";
import { Badge, Button, Card, Input, PlatformGlyph, SectionTitle, Toggle } from "../components/ui";
import { Select } from "../components/Select";
import { Mascot } from "../components/decor";

export function PlatformsScreen() {
  const config = useStore((s) => s.config);
  const addTarget = useStore((s) => s.addTarget);
  const reorderTargets = useStore((s) => s.reorderTargets);
  const [picking, setPicking] = useState(false);

  if (!config) return null;

  return (
    <div className="mx-auto max-w-3xl">
      <SectionTitle
        kicker="Pra onde a corneta toca"
        title="Plataformas"
        subtitle="Escolha os destinos e cole a chave de cada um. A gente toca em todos de uma vez."
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
        <Reorder.Group
          axis="y"
          values={config.targets}
          onReorder={reorderTargets}
          className="flex list-none flex-col gap-3"
        >
          {config.targets.map((t) => (
            <TargetRow key={t.id} target={t} />
          ))}
        </Reorder.Group>
      )}

      <AnimatePresence>
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
      </AnimatePresence>
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

  const active = config.profiles.find((p) => p.id === config.activeProfileId);
  if (!active) return null;
  const many = config.profiles.length > 1;

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2 rounded-lg bg-surface-2 p-2.5">
      <span className="px-1 text-xs font-bold uppercase tracking-wide text-ink-faint">Perfil</span>

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
        <Button variant="ghost" size="sm" onClick={() => setEditing(true)} aria-label="Renomear perfil" title="Renomear">
          <Pencil className="size-3.5" />
        </Button>
      )}

      <Button variant="subtle" size="sm" onClick={addProfile} className="ml-auto">
        <Plus className="size-3.5" strokeWidth={2.6} /> Novo
      </Button>
      {many && (
        <Button variant="ghost" size="sm" onClick={() => removeProfile(active.id)}>
          <Trash2 className="size-3.5" /> Excluir
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
        Sua corneta ainda não aponta pra lugar nenhum. Bora colocar a primeira plataforma?
      </p>
      <Button variant="primary" size="lg" className="mt-5" onClick={onAdd}>
        <Plus className="size-5" strokeWidth={2.6} /> Adicionar plataforma
      </Button>
    </div>
  );
}

function TargetRow({ target }: { target: Target }) {
  const updateTarget = useStore((s) => s.updateTarget);
  const removeTarget = useStore((s) => s.removeTarget);
  const toggleTarget = useStore((s) => s.toggleTarget);
  const controls = useDragControls();
  const preset = PLATFORMS[target.platformId];
  const isCustom = target.platformId === "custom";
  const urlInvalid = isCustomUrlInvalid(target);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
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
      <Card className={cn("flex flex-col gap-4 transition-opacity", !target.enabled && "opacity-50")}>
        <div className="flex items-center gap-3">
          <GripVertical
            onPointerDown={(e) => controls.start(e)}
            className="size-5 shrink-0 cursor-grab touch-none text-ink-faint active:cursor-grabbing"
            aria-label="Arrastar pra reordenar"
          />
          <PlatformGlyph id={target.platformId} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <input
                value={target.name}
                onChange={(e) => updateTarget(target.id, { name: e.target.value })}
                aria-label="Nome do destino"
                className="min-w-0 max-w-full rounded-md border border-transparent bg-transparent px-1 font-display text-lg font-bold leading-tight text-ink outline-none [field-sizing:content] hover:border-border focus:border-brass focus:bg-surface-2"
              />
              <Badge color={preset.color}>{preset.protocol}</Badge>
              {preset.experimental && (
                <Badge className="bg-warn text-night">
                  <AlertTriangle className="size-3" /> beta
                </Badge>
              )}
            </div>
            <div className="mt-0.5 truncate text-xs text-ink-faint">
              {target.ingestUrl || "URL não definida"}
            </div>
          </div>
          <Toggle checked={target.enabled} onChange={() => toggleTarget(target.id)} label="Ativar" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              removeTarget(target.id);
              toast.info(`${target.name} saiu da corneta`);
            }}
            aria-label="Remover"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>

        {isCustom && (
          <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">
            URL de ingestão
            <Input
              value={target.ingestUrl}
              placeholder="rtmp://servidor/app  (rtmp://, rtmps:// ou srt://)"
              onChange={(e) => updateTarget(target.id, { ingestUrl: e.target.value })}
              className={urlInvalid ? "border-bad focus:border-bad" : undefined}
            />
            {urlInvalid && (
              <span className="text-[11px] font-medium text-bad">
                URL inválida — comece com rtmp://, rtmps:// ou srt://
              </span>
            )}
          </label>
        )}

        <KeyField target={target} />

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <Button variant="subtle" size="sm" onClick={runTest} disabled={testing}>
            <Wifi className="size-3.5" /> {testing ? "Testando…" : "Testar conexão"}
          </Button>
          {preset.keyUrl && (
            <button
              onClick={() => void openExternal(preset.keyUrl!)}
              className="flex items-center gap-1 font-semibold text-brass hover:underline"
            >
              Pegar minha chave <ExternalLink className="size-3" />
            </button>
          )}
          {testResult && (
            <span className={cn("font-semibold", testResult.ok ? "text-ok" : "text-bad")}>
              {testResult.ok ? "✓" : "✕"} {testResult.msg}
            </span>
          )}
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
          <Button variant="ghost" size="sm" onClick={() => { setValue(""); setEditing(true); }}>
            <Pencil className="size-3.5" /> Trocar
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { clearKey(target.id); toast.info("Chave removida"); }}
          >
            Remover
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
          placeholder="Cole aqui a stream key desta plataforma"
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
      <Button variant="subtle" size="sm" onClick={paste} title="Colar da área de transferência">
        <ClipboardPaste className="size-4" /> Colar
      </Button>
      <Button variant="primary" size="sm" disabled={!value.trim()} onClick={save}>
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <motion.div
      className="fixed inset-0 z-50 grid place-items-center bg-night/80 p-6"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="w-full max-w-lg rounded-xl bg-surface p-5 pop"
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.92, y: 16, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.92, y: 16, opacity: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 26 }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xl">Quem entra na corneta?</h3>
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
                </div>
              </div>
            </button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
