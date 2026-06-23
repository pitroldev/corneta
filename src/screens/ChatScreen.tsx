import { useEffect, useRef, useState } from "react";
import { MessageSquare, Settings2, Trash2, Wifi, WifiOff } from "lucide-react";
import { useStore } from "../lib/store";
import { IS_TAURI } from "../lib/api";
import { cn } from "../lib/utils";
import type { ChatMessage } from "../lib/types";
import { Button, Card, PlatformGlyph, SectionTitle } from "../components/ui";

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
  const [filter, setFilter] = useState({ twitch: true, youtube: true });

  const feedRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  const shown = messages.filter((m) => filter[m.platform]);

  // Auto-scroll, a menos que o usuário tenha rolado pra cima.
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
  const configured =
    !!s.twitchChannel?.trim() || !!(s.youtubeApiKey?.trim() && s.youtubeVideo?.trim());

  return (
    <div className="mx-auto flex max-w-3xl flex-col">
      <SectionTitle
        kicker="A galera junta"
        title="Chat unificado"
        subtitle="Os chats de todas as plataformas num feed só — pra você não perder ninguém."
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

      {/* Status + configuração */}
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
                  <PlatformGlyph id={platform as ChatMessage["platform"]} size={16} />
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
            <Field
              label="Canal da Twitch"
              hint="leitura anônima, sem login"
              value={s.twitchChannel ?? ""}
              placeholder="ex.: pitrol"
              onChange={(v) => setSettings({ twitchChannel: v })}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                placeholder="ex.: youtube.com/watch?v=..."
                onChange={(v) => setSettings({ youtubeVideo: v })}
              />
            </div>
            <p className="text-xs text-ink-faint">
              💡 Twitch funciona só com o nome do canal. YouTube precisa de uma API key sua (Data API)
              + o vídeo ao vivo. Kick/Facebook ainda não têm leitura pública simples.
            </p>
          </div>
        )}
      </Card>

      {/* Filtros */}
      <div className="mb-2 flex items-center gap-2">
        <FilterChip
          label="Twitch"
          id="twitch"
          on={filter.twitch}
          onClick={() => setFilter((f) => ({ ...f, twitch: !f.twitch }))}
        />
        <FilterChip
          label="YouTube"
          id="youtube"
          on={filter.youtube}
          onClick={() => setFilter((f) => ({ ...f, youtube: !f.youtube }))}
        />
        <Button variant="ghost" size="sm" className="ml-auto" onClick={clearChat}>
          <Trash2 className="size-4" /> Limpar
        </Button>
      </div>

      {/* Feed */}
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
            shown.map((m) => <MsgRow key={m.id} m={m} />)
          )}
        </div>
      </Card>
    </div>
  );
}

function MsgRow({ m }: { m: ChatMessage }) {
  return (
    <div className="flex items-start gap-2 px-3 py-1 leading-snug hover:bg-surface-2">
      <span className="mt-0.5 shrink-0">
        <PlatformGlyph id={m.platform} size={15} />
      </span>
      <span className="shrink-0 text-sm font-bold" style={m.color ? { color: m.color } : undefined}>
        {m.author}
      </span>
      <span className="break-words text-sm text-ink-muted">{m.text}</span>
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
  id: ChatMessage["platform"];
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

const statusDot = (status: string) =>
  status === "connected" ? "bg-ok" : status === "error" ? "bg-bad" : "bg-ink-faint";
const statusLabel = (status: string) =>
  status === "connected" ? "no ar" : status === "error" ? "erro" : "desconectado";

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
