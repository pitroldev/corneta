import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { KeyRound, Plus, Trash2, Check, X, AlertTriangle, Pencil } from "lucide-react";
import { useStore } from "../lib/store";
import { PLATFORM_LIST, PLATFORMS } from "../lib/platforms";
import { toast } from "../lib/toast";
import type { PlatformId, Target } from "../lib/types";
import { Badge, Button, Card, Input, PlatformGlyph, SectionTitle, Toggle } from "../components/ui";
import { Mascot } from "../components/decor";

export function PlatformsScreen() {
  const config = useStore((s) => s.config);
  const addTarget = useStore((s) => s.addTarget);
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

      {config.targets.length === 0 ? (
        <EmptyState onAdd={() => setPicking(true)} />
      ) : (
        <div className="flex flex-col gap-3">
          <AnimatePresence initial={false}>
            {config.targets.map((t) => (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
                transition={{ type: "spring", stiffness: 320, damping: 28 }}
              >
                <TargetRow target={t} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
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
  const preset = PLATFORMS[target.platformId];
  const isCustom = target.platformId === "custom";

  return (
    <Card className={`flex flex-col gap-4 transition-opacity ${target.enabled ? "" : "opacity-50"}`}>
      <div className="flex items-center gap-4">
        <PlatformGlyph id={target.platformId} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-display text-lg font-bold">{target.name}</span>
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
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">
            Nome
            <Input value={target.name} onChange={(e) => updateTarget(target.id, { name: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">
            URL de ingestão
            <Input
              value={target.ingestUrl}
              placeholder="rtmp://servidor/app"
              onChange={(e) => updateTarget(target.id, { ingestUrl: e.target.value })}
            />
          </label>
        </div>
      )}

      <KeyField target={target} />

      {preset.note && <p className="text-xs text-ink-faint">{preset.note}</p>}
    </Card>
  );
}

function KeyField({ target }: { target: Target }) {
  const setKey = useStore((s) => s.setKey);
  const clearKey = useStore((s) => s.clearKey);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");

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
          type="password"
          autoFocus={editing}
          className="pl-9"
          placeholder="Cole aqui a stream key desta plataforma"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
      <Button
        variant="primary"
        size="sm"
        disabled={!value.trim()}
        onClick={async () => {
          await setKey(target.id, value.trim());
          setValue("");
          setEditing(false);
          toast.success("Chave guardada no cofre 🔒");
        }}
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
