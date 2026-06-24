import { useMemo, useState } from "react";
import { Bell, Eye, ExternalLink, Plus, Settings2, Trash2, Wifi, WifiOff, X } from "lucide-react";
import { api, IS_TAURI } from "../lib/api";
import { useStore } from "../lib/store";
import { cn, uid } from "../lib/utils";
import type { ChatPlatform, ChatSource } from "../lib/types";
import { Button, Card, PlatformGlyph, SectionTitle, Toggle } from "../components/ui";
import { Select } from "../components/Select";
import { Slider } from "../components/Slider";
import { ChatFeed, type ChatView } from "../components/ChatFeed";
import { AlertsFeed } from "../components/AlertsFeed";

const PLATFORM_OPTS = [
  { value: "twitch", label: "Twitch" },
  { value: "kick", label: "Kick" },
  { value: "youtube", label: "YouTube" },
];
const VALUE_LABEL: Record<string, string> = {
  twitch: "Canal",
  kick: "Slug do canal",
  youtube: "Canal",
};
const PLACEHOLDER: Record<string, string> = {
  twitch: "ex.: pitrol",
  kick: "ex.: xqc",
  youtube: "ex.: @seucanal",
};
const HINT: Record<string, string> = {
  twitch: "Só o nome do canal — sem login.",
  kick: "O slug da URL (kick.com/slug). Pode falhar por Cloudflare.",
  youtube: "Seu canal (@handle, URL ou ID). A Corneta acha a live sozinha — sem colar o link toda vez. Usa a chave da API.",
};

export function ChatScreen() {
  const config = useStore((s) => s.config);
  const setSettings = useStore((s) => s.setSettings);
  const messages = useStore((s) => s.chatMessages);
  const connected = useStore((s) => s.chatConnected);
  const statuses = useStore((s) => s.chatStatuses);
  const connectChat = useStore((s) => s.connectChat);
  const disconnectChat = useStore((s) => s.disconnectChat);
  const clearChat = useStore((s) => s.clearChat);
  const alerts = useStore((s) => s.alerts);
  const clearAlerts = useStore((s) => s.clearAlerts);
  const viewers = useStore((s) => s.viewers);

  const [showConfig, setShowConfig] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const [filter, setFilter] = useState<Record<ChatPlatform, boolean>>({
    twitch: true,
    youtube: true,
    kick: true,
  });

  if (!config) return null;
  const s = config.settings;
  const sources = s.chatSources ?? [];
  const view: ChatView = useMemo(
    () => ({
      emotes: s.chatShowEmotes ?? true,
      badges: s.chatShowBadges ?? true,
      platform: s.chatShowPlatform ?? true,
      source: s.chatShowSource ?? false,
      timestamps: s.chatShowTimestamps ?? false,
      fontSize: s.chatFontSize ?? 14,
    }),
    [
      s.chatShowEmotes,
      s.chatShowBadges,
      s.chatShowPlatform,
      s.chatShowSource,
      s.chatShowTimestamps,
      s.chatFontSize,
    ]
  );
  const configured = sources.some((x) => x.enabled && x.value.trim());
  const shown = useMemo(() => messages.filter((m) => filter[m.platform]), [messages, filter]);

  const addSource = () =>
    setSettings({
      chatSources: [...sources, { id: uid("src"), platform: "twitch", value: "", name: "", enabled: true }],
    });
  const updateSource = (id: string, patch: Partial<ChatSource>) =>
    setSettings({ chatSources: sources.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const removeSource = (id: string) =>
    setSettings({ chatSources: sources.filter((x) => x.id !== id) });

  return (
    <div className={cn("mx-auto flex flex-col", showAlerts ? "max-w-5xl" : "max-w-3xl")}>
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
          <div className="flex items-center gap-3">
            {viewers.total > 0 && (
              <span
                className="flex items-center gap-1.5 text-sm font-bold text-ink-muted"
                title={viewers.items
                  .filter((i) => i.live)
                  .map((i) => `${i.source}: ${(i.viewers ?? 0).toLocaleString("pt-BR")}`)
                  .join("\n")}
              >
                <Eye className="size-4 text-brass" />
                {viewers.total.toLocaleString("pt-BR")} assistindo
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={() => setShowConfig((v) => !v)}>
              <Settings2 className="size-4" /> Configurar
            </Button>
          </div>
        </div>

        {showConfig && (
          <div className="mt-3 flex flex-col gap-4 border-t-2 border-border-soft pt-3">
            {/* Canais */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wide text-ink-faint">
                  Canais
                </span>
                <Button variant="subtle" size="sm" onClick={addSource}>
                  <Plus className="size-3.5" /> Adicionar canal
                </Button>
              </div>

              {sources.length === 0 ? (
                <div className="rounded-md border-2 border-dashed border-border bg-surface-2 px-3 py-5 text-center text-sm text-ink-muted">
                  Nenhum canal ainda. Adicione um da <strong className="text-ink">Twitch</strong>,{" "}
                  <strong className="text-ink">Kick</strong> ou{" "}
                  <strong className="text-ink">YouTube</strong> — pode repetir (ex.: 2 Twitches).
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {sources.map((src) => (
                    <SourceCard
                      key={src.id}
                      src={src}
                      onChange={(p) => updateSource(src.id, p)}
                      onRemove={() => removeSource(src.id)}
                    />
                  ))}
                </div>
              )}

              {sources.some((x) => x.platform === "youtube") && (
                <label className="mt-2 flex flex-col gap-1 rounded-md border-2 border-info/30 bg-info/5 p-2.5 text-[11px] font-semibold text-ink-faint">
                  <span className="flex items-center gap-1.5">
                    <PlatformGlyph id="youtube" size={14} /> Chave da API do YouTube
                    <span className="font-medium normal-case text-ink-faint/70">
                      · necessária pro chat do YouTube
                    </span>
                  </span>
                  <input
                    value={s.youtubeApiKey ?? ""}
                    placeholder="cole sua API key (Data API v3)"
                    onChange={(e) => setSettings({ youtubeApiKey: e.target.value })}
                    className="h-9 rounded-md border-2 border-border bg-surface px-2 text-sm font-medium text-ink outline-none focus:border-brass"
                  />
                </label>
              )}
            </div>

            {/* Exibição */}
            <div className="border-t-2 border-border-soft pt-3">
              <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-ink-faint">
                O que mostrar no feed
              </span>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <ToggleRow label="Emotes" checked={view.emotes} onChange={(v) => setSettings({ chatShowEmotes: v })} />
                <ToggleRow label="Badges" checked={view.badges} onChange={(v) => setSettings({ chatShowBadges: v })} />
                <ToggleRow label="Ícone da plataforma" checked={view.platform} onChange={(v) => setSettings({ chatShowPlatform: v })} />
                <ToggleRow label="Nome do canal" checked={view.source} onChange={(v) => setSettings({ chatShowSource: v })} />
                <ToggleRow label="Horário" checked={view.timestamps} onChange={(v) => setSettings({ chatShowTimestamps: v })} />
              </div>
              <div className="mt-3 flex items-center gap-3 border-t border-border-soft pt-3">
                <span className="shrink-0 text-sm font-semibold text-ink-muted">Tamanho da fonte</span>
                <Slider
                  className="ml-auto max-w-52 flex-1"
                  value={view.fontSize}
                  min={11}
                  max={26}
                  onChange={(v) => setSettings({ chatFontSize: v })}
                  suffix="px"
                />
              </div>
            </div>
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
        <Button
          variant={showAlerts ? "primary" : "ghost"}
          size="sm"
          className="ml-auto"
          onClick={() => setShowAlerts((v) => !v)}
        >
          <Bell className="size-4" /> Alertas{alerts.length > 0 ? ` (${alerts.length})` : ""}
        </Button>
        <Button variant="ghost" size="sm" onClick={clearChat}>
          <Trash2 className="size-4" /> Limpar
        </Button>
      </div>

      <div className="flex gap-3">
        <Card className="flex h-[54vh] flex-1 flex-col overflow-hidden p-0">
          <ChatFeed messages={shown} view={view} connected={connected} className="flex-1" />
        </Card>
        {showAlerts && (
          <Card className="flex h-[54vh] w-72 shrink-0 flex-col overflow-hidden p-0">
            <div className="flex items-center justify-between border-b-2 border-border-soft px-3 py-2">
              <span className="flex items-center gap-1.5 font-display text-sm font-extrabold">
                <Bell className="size-4 text-brass" /> Alertas
              </span>
              <button
                onClick={clearAlerts}
                className="text-ink-faint transition-colors hover:text-bad"
                title="Limpar alertas"
                aria-label="Limpar alertas"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
            <AlertsFeed alerts={alerts} className="flex-1" />
          </Card>
        )}
      </div>
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
  status === "connected"
    ? "bg-ok"
    : status === "error"
      ? "bg-bad"
      : status === "waiting"
        ? "bg-warn animate-pulse"
        : "bg-ink-faint";

function SourceCard({
  src,
  onChange,
  onRemove,
}: {
  src: ChatSource;
  onChange: (patch: Partial<ChatSource>) => void;
  onRemove: () => void;
}) {
  const inputCls =
    "h-9 rounded-md border-2 border-border bg-surface px-2 text-sm font-medium text-ink outline-none focus:border-brass";
  return (
    <div
      className={cn(
        "rounded-md border-2 border-border-soft p-2.5 transition-opacity",
        src.enabled ? "bg-surface" : "bg-surface-2 opacity-60"
      )}
    >
      <div className="flex items-center gap-2">
        <PlatformGlyph id={src.platform} size={20} />
        <Select
          className="w-28"
          value={src.platform}
          options={PLATFORM_OPTS}
          onChange={(v) => onChange({ platform: v as ChatPlatform })}
        />
        <div className="ml-auto flex items-center gap-2.5">
          <Toggle checked={src.enabled} onChange={(v) => onChange({ enabled: v })} label="ligado" />
          <button
            onClick={onRemove}
            className="text-ink-faint transition-colors hover:text-bad"
            aria-label="Remover canal"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_11rem]">
        <label className="flex flex-col gap-1 text-[11px] font-semibold text-ink-faint">
          {VALUE_LABEL[src.platform]}
          <input
            value={src.value}
            placeholder={PLACEHOLDER[src.platform]}
            onChange={(e) => onChange({ value: e.target.value })}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-semibold text-ink-faint">
          <span>
            Apelido <span className="font-medium normal-case text-ink-faint/60">(opcional)</span>
          </span>
          <input
            value={src.name}
            placeholder="ex.: Pitrol"
            onChange={(e) => onChange({ name: e.target.value })}
            className={inputCls}
          />
        </label>
      </div>
      <p className="mt-1.5 text-[11px] text-ink-faint">{HINT[src.platform]}</p>
    </div>
  );
}
