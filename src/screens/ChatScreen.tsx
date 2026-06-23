import { useEffect, useRef, useState } from "react";
import { MessageSquare, Settings2, Trash2, Wifi, WifiOff } from "lucide-react";
import { useStore } from "../lib/store";
import { IS_TAURI } from "../lib/api";
import { cn } from "../lib/utils";
import type { ChatMessage, ChatPlatform } from "../lib/types";
import { Button, Card, PlatformGlyph, SectionTitle, Toggle } from "../components/ui";

const fmtTime = (ms: number) =>
  new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

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

  const feedRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  const shown = messages.filter((m) => filter[m.platform]);

  useEffect(() => {
    const el = feedRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [shown.length]);

  const onScroll = () => {
    const el = feedRef.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  };

  if (!config) return null;
  const s = config.settings;
  const view = {
    emotes: s.chatShowEmotes ?? true,
    badges: s.chatShowBadges ?? true,
    platform: s.chatShowPlatform ?? true,
    timestamps: s.chatShowTimestamps ?? false,
  };
  const configured =
    !!s.twitchChannel?.trim() ||
    !!s.kickChannel?.trim() ||
    !!(s.youtubeApiKey?.trim() && s.youtubeVideo?.trim());

  return (
    <div className="mx-auto flex max-w-3xl flex-col">
      <SectionTitle
        kicker="A galera junta"
        title="Chat unificado"
        subtitle="Os chats de todas as plataformas num feed só — com emotes, badges e de onde cada um vem."
        right={
          connected ? (
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
          )
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
              Object.entries(statuses).map(([platform, status]) => (
                <span key={platform} className="flex items-center gap-1.5 text-sm">
                  <PlatformGlyph id={platform as ChatPlatform} size={16} />
                  <span className={cn("size-2 rounded-full", statusDot(status))} />
                  <span className="text-ink-muted">{statusLabel(status)}</span>
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field
                label="Canal da Twitch"
                hint="anônimo, sem login"
                value={s.twitchChannel ?? ""}
                placeholder="ex.: pitrol"
                onChange={(v) => setSettings({ twitchChannel: v })}
              />
              <Field
                label="Canal do Kick"
                hint="slug do canal"
                value={s.kickChannel ?? ""}
                placeholder="ex.: xqc"
                onChange={(v) => setSettings({ kickChannel: v })}
              />
              <Field
                label="YouTube — API key"
                hint="Data API v3"
                value={s.youtubeApiKey ?? ""}
                placeholder="sua API key"
                onChange={(v) => setSettings({ youtubeApiKey: v })}
              />
              <Field
                label="YouTube — vídeo ao vivo"
                hint="URL ou ID"
                value={s.youtubeVideo ?? ""}
                placeholder="youtube.com/watch?v=..."
                onChange={(v) => setSettings({ youtubeVideo: v })}
              />
            </div>

            <div className="flex flex-col gap-2 border-t-2 border-border-soft pt-3">
              <span className="text-xs font-bold uppercase tracking-wide text-ink-faint">Exibição</span>
              <ToggleRow label="Mostrar emotes" checked={view.emotes} onChange={(v) => setSettings({ chatShowEmotes: v })} />
              <ToggleRow label="Mostrar badges" checked={view.badges} onChange={(v) => setSettings({ chatShowBadges: v })} />
              <ToggleRow label="Mostrar plataforma" checked={view.platform} onChange={(v) => setSettings({ chatShowPlatform: v })} />
              <ToggleRow label="Mostrar horário" checked={view.timestamps} onChange={(v) => setSettings({ chatShowTimestamps: v })} />
            </div>

            <p className="text-xs leading-relaxed text-ink-faint">
              💡 Twitch funciona só com o nome do canal (emotes + badges nativos). Kick precisa do slug
              (pode falhar por proteção anti-bot). YouTube precisa de API key + vídeo ao vivo.
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
        <div
          ref={feedRef}
          onScroll={onScroll}
          className="flex-1 overflow-y-auto py-2 [scrollbar-gutter:stable]"
        >
          {shown.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <MessageSquare className="size-8 text-ink-faint" />
              <div className="font-display text-lg font-bold">
                {connected ? "Esperando mensagens…" : "Chat desconectado"}
              </div>
              <div className="max-w-sm text-sm text-ink-muted">
                {connected
                  ? "Assim que a galera mandar mensagem, aparece aqui."
                  : "Configure ao menos uma plataforma e clique em Conectar."}
              </div>
            </div>
          ) : (
            shown.map((m) => <MsgRow key={m.id} m={m} view={view} />)
          )}
        </div>
      </Card>
    </div>
  );
}

function MsgRow({
  m,
  view,
}: {
  m: ChatMessage;
  view: { emotes: boolean; badges: boolean; platform: boolean; timestamps: boolean };
}) {
  return (
    <div className="flex flex-wrap items-start gap-1.5 px-3 py-1 leading-snug hover:bg-surface-2">
      {view.timestamps && (
        <span className="mt-0.5 shrink-0 text-[10px] tabular-nums text-ink-faint">{fmtTime(m.ts)}</span>
      )}
      {view.platform && (
        <span className="mt-0.5 shrink-0">
          <PlatformGlyph id={m.platform} size={15} />
        </span>
      )}
      {view.badges &&
        m.badges.map((b, i) => (
          <span
            key={i}
            className={cn(
              "mt-0.5 shrink-0 rounded px-1 text-[9px] font-extrabold uppercase leading-4",
              badgeColor(b.kind)
            )}
          >
            {b.label}
          </span>
        ))}
      <span className="shrink-0 text-sm font-bold" style={m.color ? { color: m.color } : undefined}>
        {m.author}
      </span>
      <span className="min-w-0 break-words text-sm text-ink-muted">
        {m.fragments.map((f, i) =>
          f.kind === "emote" && view.emotes && f.url ? (
            <img
              key={i}
              src={f.url}
              alt={f.text}
              title={f.text}
              className="mx-0.5 inline-block h-5 w-auto align-middle"
              loading="lazy"
            />
          ) : (
            <span key={i}>{f.text}</span>
          )
        )}
      </span>
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
const statusLabel = (status: string) =>
  status === "connected" ? "no ar" : status === "error" ? "erro" : "desconectado";

function badgeColor(kind: string): string {
  switch (kind) {
    case "broadcaster":
      return "bg-tomate text-white";
    case "moderator":
      return "bg-[#22c55e] text-white";
    case "vip":
      return "bg-[#e879f9] text-white";
    case "subscriber":
      return "bg-brass text-brass-ink";
    case "staff":
    case "partner":
      return "bg-[#7c9cff] text-white";
    default:
      return "bg-surface-3 text-ink-muted";
  }
}

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
