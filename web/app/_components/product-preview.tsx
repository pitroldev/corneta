import { Mascot, PlatformGlyph } from "./decor";

// Réplica da tela "Ao vivo" do app (titlebar + sidebar numerada + destinos +
// chat reunido). Os números da navegação são os atalhos Alt+N do app; os valores
// de banda e as mensagens são ilustrativos e estão marcados como prévia.

const nav = [
  { n: "01", label: "Plataformas", hint: "onde sua live aparece", icon: "tv" },
  { n: "02", label: "Qualidade", hint: "capricho da imagem", icon: "sliders" },
  { n: "03", label: "Ao vivo", hint: "bota tudo no ar", icon: "radio" },
  { n: "04", label: "Chat", hint: "todo chat num lugar", icon: "chat" },
  { n: "05", label: "Relatórios", hint: "como foi a live", icon: "chart" },
] as const;

// Modo "Esperto" com três destinos deitados: todos recebem a cópia do OBS no
// menor bitrate da lista (6000). A soma bate com src/lib/estimates.ts.
const targets = [
  {
    id: "twitch",
    name: "Twitch",
    detail: "1080p60 · 6000 kbps",
    quality: "Cópia",
  },
  {
    id: "youtube",
    name: "YouTube",
    detail: "1080p60 · 6000 kbps",
    quality: "Cópia",
  },
  { id: "kick", name: "Kick", detail: "1080p60 · 6000 kbps", quality: "Cópia" },
] as const;

const chat = [
  {
    id: "twitch",
    who: "Twitch",
    from: "gabizera",
    text: "salve salve, chegando!",
  },
  {
    id: "youtube",
    who: "YouTube",
    from: "Marcos L.",
    text: "áudio tá limpo hoje 👏",
  },
  { id: "kick", who: "Kick", from: "duduxx", text: "bora cornetar!!" },
] as const;

function NavIcon({ name }: { name: (typeof nav)[number]["icon"] }) {
  switch (name) {
    case "tv":
      return (
        <svg viewBox="0 0 24 24">
          <rect x="2" y="4" width="20" height="14" rx="2" />
          <path d="M8 21h8" />
        </svg>
      );
    case "sliders":
      return (
        <svg viewBox="0 0 24 24">
          <path d="M4 6h16M4 12h16M4 18h16" />
          <circle cx="9" cy="6" r="2.2" />
          <circle cx="15" cy="12" r="2.2" />
          <circle cx="7" cy="18" r="2.2" />
        </svg>
      );
    case "radio":
      return (
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="2" />
          <path d="M7.8 16.2a6 6 0 0 1 0-8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 19.1a10 10 0 0 1 0-14.2M19.1 4.9a10 10 0 0 1 0 14.2" />
        </svg>
      );
    case "chat":
      return (
        <svg viewBox="0 0 24 24">
          <path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z" />
        </svg>
      );
    case "chart":
      return (
        <svg viewBox="0 0 24 24">
          <path d="M3 3v18h18M8 17v-4M13 17V7M18 17v-7" />
        </svg>
      );
  }
}

export function ProductPreview() {
  return (
    <figure className="app-window">
      <figcaption className="sr-only">
        Prévia ilustrativa do app da Corneta na tela “Ao vivo”: o sinal do OBS
        sai para Twitch, YouTube e Kick, cada destino com sua própria qualidade
        e seu próprio interruptor, com o chat das três plataformas reunido ao
        lado.
      </figcaption>

      <div className="app-titlebar">
        <span className="app-titlebar-brand">
          <i>
            <Mascot />
          </i>
          <strong>Corneta</strong>
          <span>multi-stream</span>
        </span>
        <span className="app-demo-tag">PRÉVIA ILUSTRATIVA</span>
        <span className="app-winbtns" aria-hidden="true">
          <i>
            <svg viewBox="0 0 24 24">
              <path d="M5 12h14" />
            </svg>
          </i>
          <i>
            <svg viewBox="0 0 24 24">
              <rect x="5" y="5" width="14" height="14" rx="1.5" />
            </svg>
          </i>
          <i>
            <svg viewBox="0 0 24 24">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </i>
        </span>
      </div>

      <div className="app-body">
        <div className="app-sidebar" aria-hidden="true">
          <span className="app-sidebar-brand">
            <i>
              <Mascot />
            </i>
            <span>
              <strong>Corneta</strong>
              <small>multi-stream</small>
            </span>
          </span>

          <div className="app-nav">
            {nav.map((item) => (
              <span
                key={item.n}
                className={`app-nav-item${item.label === "Ao vivo" ? " app-nav-item-active" : ""}`}
              >
                <i>
                  <NavIcon name={item.icon} />
                </i>
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.hint}</small>
                </span>
                {item.label === "Relatórios" ? (
                  <b className="app-nav-new">novo</b>
                ) : (
                  <b>{item.n}</b>
                )}
              </span>
            ))}
          </div>

          <div className="app-sidebar-foot">
            <span>
              <svg viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
              </svg>
              Configurações
              <b>06</b>
            </span>
            <span className="app-status-pill">
              <i />
              Fora do ar
            </span>
          </div>
        </div>

        <div className="app-main">
          <div className="app-main-head">
            <span>painel da live</span>
            <strong>Ao vivo</strong>
          </div>

          <div className="app-stats">
            <div className="app-stat">
              <span>seu upload</span>
              <strong>25 Mb/s</strong>
            </div>
            <div className="app-stat">
              <span>a live precisa</span>
              <strong>18,5 Mb/s</strong>
            </div>
            <div className="app-stat app-stat-ok">
              <span>folga</span>
              <strong>tranquila</strong>
            </div>
          </div>

          <div className="app-targets">
            {targets.map((target) => (
              <div className="app-target" key={target.id}>
                <PlatformGlyph id={target.id} />
                <div>
                  <strong>{target.name}</strong>
                  <small>{target.detail}</small>
                </div>
                <span className="app-quality">{target.quality}</span>
                <span className="app-toggle" aria-hidden="true">
                  <i />
                </span>
              </div>
            ))}
          </div>

          <div className="app-bora">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="2" />
              <path d="M7.8 16.2a6 6 0 0 1 0-8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 19.1a10 10 0 0 1 0-14.2M19.1 4.9a10 10 0 0 1 0 14.2" />
            </svg>
            BORA AO VIVO
          </div>
        </div>

        <div className="app-chat" aria-hidden="true">
          <div className="app-chat-head">
            <span>
              <strong>Chat reunido</strong>
              <small>3 plataformas</small>
            </span>
          </div>

          <div className="app-chat-list">
            {chat.map((message) => (
              <div className="app-chat-msg" key={message.id}>
                <PlatformGlyph id={message.id} />
                <div>
                  <strong>
                    {message.from} · {message.who}
                  </strong>
                  <p>{message.text}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="app-chat-compose">
            Responde de uma vez…
            <b>enviar</b>
          </div>
        </div>
      </div>
    </figure>
  );
}
