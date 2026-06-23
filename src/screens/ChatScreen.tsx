import { useState } from "react";
import { ExternalLink, Plus, Settings2, Trash2, Wifi, WifiOff, X } from "lucide-react";
import { api, IS_TAURI } from "../lib/api";
import { useStore } from "../lib/store";
import { cn, uid } from "../lib/utils";
import type { ChatPlatform, ChatSource } from "../lib/types";
import { Button, Card, PlatformGlyph, SectionTitle, Toggle } from "../components/ui";
import { Select } from "../components/Select";
import { ChatFeed, type ChatView } from "../components/ChatFeed";

const PLATFORM_OPTS = [
  { value: "twitch", label: "Twitch" },
  { value: "kick", label: "Kick" },
  { value: "youtube", label: "YouTube" },
];
const placeholderFor = (p: string) =>
  p === "twitch" ? "canal (ex.: pitrol)" : p === "kick" ? "slug (ex.: xqc)" : "URL ou ID do vídeo ao vivo";

export function ChatScreen() {
  const config = useStore((s) => s.config);
  const setSettings = useStore((s) => s.setSettings);
  const messages = useStore((s) => s.chatMessages);
  const connected = useStore((s) => s.chatConnected);
  const statuses = useStore((s) => s.chatStatuses);
  const connectChat = useStore((s) => s.connectChat);
  const disconnectChat = useStore((s) => s.disconnectChat);
  const clearChat = useStore((s) => s.clearChat);

  const [showConfig, setShowConfig] = useState(false);
  const [filter, setFilter] = useState<Record<ChatPlatform, boolean>>({
    twitch: true,
    youtube: true,
    kick: true,
  });

  if (!config) return null;
  const s = config.settings;
  const sources = s.chatSources ?? [];
  const view: ChatView = {
    emotes: s.chatShowEmotes ?? true,
    badges: s.chatShowBadges ?? true,
    platform: s.chatShowPlatform ?? true,
    source: s.chatShowSource ?? false,
    timestamps: s.chatShowTimestamps ?? false,
    fontSize: s.chatFontSize ?? "md",
  };
  const configured = sources.some((x) => x.enabled && x.value.trim());
  const shown = messages.filter((m) => filter[m.platform]);

  const addSource = () =>
    setSettings({
      chatSources: [...sources, { id: uid("src"), platform: "twitch", value: "", name: "", enabled: true }],
    });
  const updateSource = (id: string, patch: Partial<ChatSource>) =>
    setSettings({ chatSources: sources.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const removeSource = (id: string) =>
    setSettings({ chatSources: sources.filter((x) => x.id !== id) });

  return (
    <div className="mx-auto flex max-w-3xl flex-col">
      <SectionTitle
        kicker="A galera junta"
        title="Chat unificado"
        subtitle="Vários canais (até 2 Twitches!) num feed só — com emotes, badges, origem e deleções."
        right={
          <div className="flex items-center gap-2">
            {IS_TAURI && (
              <Button variant="subtle" size="sm" onClick={() => void api.openChatWindow()}>
                <ExternalLink className="size-4" /> Janela
              </Button>
            )}
            {connected ? (
              <Button variant="outline" size="sm" onClick={() => void disconnectChat()}>
                <WifiOff className="size-4" /> Desconectar
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                onClick={() => void connectChat()}
                disabled={IS_TAURI && !configured}
              >
                <Wifi className="size-4" /> Conectar
              </Button>
            )}
          </div>
        }
      />

      <Card className="mb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {Object.keys(statuses).length === 0 ? (
              <span className="text-sm text-ink-faint">
                {connected ? "conectando…" : "desconectado"}
              </span>
            ) : (
              Object.entries(statuses).map(([source, st]) => (
                <span key={source} className="flex items-center gap-1.5 text-sm">
                  <PlatformGlyph id={st.platform as ChatPlatform} size={16} />
                  <span className={cn("size-2 rounded-full", statusDot(st.status))} />
                  <span className="text-ink-muted">{source}</span>
                </span>
              ))
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={() => setShowConfig((v) => !v)}>
            <Settings2 className="size-4" /> Configurar
          </Button>
        </div>

        {showConfig && (
          <div className="mt-3 flex flex-col gap-3 border-t-2 border-border-soft pt-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wide text-ink-faint">
                Fontes do chat
              </span>
              <Button variant="subtle" size="sm" onClick={addSource}>
                <Plus className="size-3.5" /> Adicionar
              </Button>
            </div>

            {sources.length === 0 && (
              <p className="text-sm text-ink-muted">
                Nenhuma fonte. Adicione um canal da Twitch/Kick ou um vídeo do YouTube — pode repetir
                a plataforma (ex.: 2 Twitches).
              </p>
            )}

            {sources.map((src) => (
              <div key={src.id} className="flex flex-wrap items-center gap-2">
                <Select
                  className="w-28"
                  value={src.platform}
                  options={PLATFORM_OPTS}
                  onChange={(v) => updateSource(src.id, { platform: v as ChatPlatform })}
                />
                <input
                  value={src.value}
                  placeholder={placeholderFor(src.platform)}
                  onChange={(e) => updateSource(src.id, { value: e.target.value })}
                  className="h-9 min-w-40 flex-1 rounded-md border-2 border-border bg-surface px-2 text-sm font-medium text-ink outline-none focus:border-brass"
                />
                <input
                  value={src.name}
                  placeholder="apelido"
                  onChange={(e) => updateSource(src.id, { name: e.target.value })}
                  className="h-9 w-28 rounded-md border-2 border-border bg-surface px-2 text-sm font-medium text-ink outline-none focus:border-brass"
                />
                <Toggle checked={src.enabled} onChange={(v) => updateSource(src.id, { enabled: v })} label="ativo" />
                <button
                  onClick={() => removeSource(src.id)}
                  className="text-ink-faint hover:text-bad"
                  aria-label="Remover fonte"
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}

            {sources.some((x) => x.platform === "youtube") && (
              <Field
                label="YouTube — API key"
                hint="Data API v3 (compartilhada entre as fontes do YouTube)"
                value={s.youtubeApiKey ?? ""}
                placeholder="sua API key"
                onChange={(v) => setSettings({ youtubeApiKey: v })}
              />
            )}

            <div className="flex flex-col gap-2 border-t-2 border-border-soft pt-3">
              <span className="text-xs font-bold uppercase tracking-wide text-ink-faint">Exibição</span>
              <ToggleRow label="Emotes" checked={view.emotes} onChange={(v) => setSettings({ chatShowEmotes: v })} />
              <ToggleRow label="Badges" checked={view.badges} onChange={(v) => setSettings({ chatShowBadges: v })} />
              <ToggleRow label="Plataforma" checked={view.platform} onChange={(v) => setSettings({ chatShowPlatform: v })} />
              <ToggleRow label="Origem (canal)" checked={view.source} onChange={(v) => setSettings({ chatShowSource: v })} />
              <ToggleRow label="Horário" checked={view.timestamps} onChange={(v) => setSettings({ chatShowTimestamps: v })} />
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-ink-muted">Tamanho da fonte</span>
                <Select
                  className="w-28"
                  value={view.fontSize}
                  options={[
                    { value: "sm", label: "Pequeno" },
                    { value: "md", label: "Médio" },
                    { value: "lg", label: "Grande" },
                  ]}
                  onChange={(v) => setSettings({ chatFontSize: v as "sm" | "md" | "lg" })}
                />
              </div>
            </div>

            <p className="text-xs leading-relaxed text-ink-faint">
              💡 Twitch: só o nome do canal (sem login). Kick: o slug (pode falhar por Cloudflare).
              YouTube: API key + vídeo ao vivo. Deleções de moderação somem do feed automaticamente.
            </p>
          </div>
        )}
      </Card>

      <div className="mb-2 flex items-center gap-2">
        {(["twitch", "kick", "youtube"] as const).map((p) => (
          <FilterChip
            key={p}
            id={p}
            label={p === "twitch" ? "Twitch" : p === "kick" ? "Kick" : "YouTube"}
            on={filter[p]}
            onClick={() => setFilter((f) => ({ ...f, [p]: !f[p] }))}
          />
        ))}
        <Button variant="ghost" size="sm" className="ml-auto" onClick={clearChat}>
          <Trash2 className="size-4" /> Limpar
        </Button>
      </div>

      <Card className="flex h-[54vh] flex-col overflow-hidden p-0">
        <ChatFeed messages={shown} view={view} connected={connected} className="flex-1" />
      </Card>
    </div>
  );
}

function FilterChip({
  label,
  id,
  on,
  onClick,
}: {
  label: string;
  id: ChatPlatform;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md border-2 px-2.5 py-1 text-xs font-bold transition-colors",
        on
          ? "border-brass bg-brass/10 text-ink"
          : "border-border bg-surface text-ink-faint hover:text-ink-muted"
      )}
    >
      <PlatformGlyph id={id} size={14} /> {label}
    </button>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm font-semibold text-ink-muted">{label}</span>
      <Toggle checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

const statusDot = (status: string) =>
  status === "connected" ? "bg-ok" : status === "error" ? "bg-bad" : "bg-ink-faint";

function Field({
  label,
  hint,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold text-ink-faint">
      <span>
        {label}
        {hint && <span className="ml-1 font-medium normal-case text-ink-faint/70">· {hint}</span>}
      </span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-md border-2 border-border bg-surface px-2 text-sm font-medium text-ink outline-none focus:border-brass"
      />
    </label>
  );
}
