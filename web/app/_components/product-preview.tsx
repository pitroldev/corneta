import { Mascot, PlatformGlyph } from "./decor";
import { cn } from "./ui";

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

const NAV_ITEM = cn(
  "flex items-center gap-[9px] rounded-md px-[9px] py-2 text-muted max-[760px]:px-2 max-[760px]:py-1.5",
  "[&>i]:grid [&>i]:size-6 [&>i]:shrink-0 [&>i]:place-items-center [&>i]:rounded-sm [&>i]:bg-surface-2",
  "[&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:[stroke-width:2.4] [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:[stroke-linecap:round] [&_svg]:[stroke-linejoin:round]",
  "[&_strong]:block [&_strong]:font-display [&_strong]:text-[0.86rem] [&_strong]:leading-[1.15] [&_strong]:font-bold max-[760px]:[&_strong]:whitespace-nowrap",
  "[&_small]:block [&_small]:text-[0.6rem] [&_small]:font-medium [&_small]:text-faint max-[760px]:[&_small]:hidden",
  "[&>b]:ml-auto [&>b]:font-display [&>b]:text-[0.68rem] [&>b]:font-extrabold [&>b]:opacity-40 max-[760px]:[&>b]:hidden",
);
const NAV_ACTIVE = cn(
  "bg-brass text-brass-ink shadow-pop-brass",
  "[&>i]:bg-brass-ink/15 [&_small]:text-brass-ink/85 [&>b]:opacity-60",
);

const STAT =
  "border-t-2 border-brass/55 bg-surface-2 px-[11px] py-2 " +
  "[&>span]:block [&>span]:text-[0.55rem] [&>span]:font-extrabold [&>span]:tracking-[0.08em] [&>span]:text-faint-raised [&>span]:uppercase " +
  "[&>strong]:mt-0.5 [&>strong]:block [&>strong]:font-display [&>strong]:text-[1.06rem] [&>strong]:leading-[1.1] [&>strong]:font-extrabold [&>strong]:tabular-nums";

export function ProductPreview() {
  return (
    <figure className="overflow-hidden rounded-xl border border-border-dry bg-surface shadow-[10px_10px_0_0_var(--night),0_30px_60px_rgb(0_0_0/42%)] max-[760px]:shadow-[5px_5px_0_0_var(--night),0_18px_34px_rgb(0_0_0/38%)]">
      <figcaption className="sr-only">
        Prévia ilustrativa do app da Corneta na tela “Ao vivo”: o sinal do OBS
        sai para Twitch, YouTube e Kick, cada destino com sua própria qualidade
        e seu próprio interruptor, com o chat das três plataformas reunido ao
        lado.
      </figcaption>

      <div className="flex min-h-10 items-center gap-2.5 border-b border-border-soft bg-panel pl-[13px]">
        <span className="flex items-center gap-2 [&>i]:grid [&>i]:size-[21px] [&>i]:place-items-center [&>i]:rounded-[5px] [&>i]:bg-brass [&>i]:text-brass-ink [&>i>svg]:h-3.5 [&>i>svg]:w-3.5">
          <i>
            <Mascot />
          </i>
          <strong className="font-display text-[0.88rem] leading-none font-bold">
            Corneta
          </strong>
          <span className="text-[0.68rem] font-medium text-faint max-[420px]:hidden">
            multi-stream
          </span>
        </span>
        <span className="ml-3.5 rounded-sm border border-border-dry px-[7px] py-[3px] text-[0.56rem] font-extrabold tracking-[0.1em] whitespace-nowrap text-muted">
          PRÉVIA ILUSTRATIVA
        </span>
        <span
          className={cn(
            "ml-auto flex h-10 text-muted",
            "[&>i]:grid [&>i]:w-10 [&>i]:place-items-center",
            "[&_svg]:h-[15px] [&_svg]:w-[15px] [&_svg]:[stroke-width:2.4] [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:[stroke-linecap:round]",
          )}
          aria-hidden="true"
        >
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

      <div className="grid grid-cols-[214px_minmax(0,1fr)_232px] max-[1180px]:grid-cols-[200px_minmax(0,1fr)] max-[760px]:grid-cols-1">
        <div
          className="flex flex-col border-r border-border-soft bg-panel px-[11px] py-[13px] max-[760px]:flex-row max-[760px]:items-center max-[760px]:overflow-hidden max-[760px]:border-r-0 max-[760px]:border-b max-[760px]:px-2.5 max-[760px]:py-[9px]"
          aria-hidden="true"
        >
          <span className="mb-[22px] flex items-center gap-2.5 px-0.5 pt-1 max-[760px]:hidden">
            <i className="grid size-[38px] -rotate-3 place-items-center rounded-lg bg-brass text-brass-ink shadow-pop-brass [&>svg]:h-[23px] [&>svg]:w-[23px]">
              <Mascot />
            </i>
            <span>
              <strong className="block font-display text-[1.14rem] leading-none font-extrabold">
                Corneta
              </strong>
              <small className="mt-[3px] block text-[0.54rem] font-semibold tracking-[0.2em] text-faint uppercase">
                multi-stream
              </small>
            </span>
          </span>

          <div className="flex flex-col gap-1.5 max-[760px]:flex-row max-[760px]:gap-[7px]">
            {nav.map((item) => (
              <span
                key={item.n}
                className={cn(NAV_ITEM, item.label === "Ao vivo" && NAV_ACTIVE)}
              >
                <i>
                  <NavIcon name={item.icon} />
                </i>
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.hint}</small>
                </span>
                {item.label === "Relatórios" ? (
                  <b className="ml-auto -rotate-3 rounded-sm bg-tomate px-[5px] py-0.5 text-[0.54rem] font-extrabold tracking-[0.06em] text-brass-ink uppercase">
                    novo
                  </b>
                ) : (
                  <b>{item.n}</b>
                )}
              </span>
            ))}
          </div>

          <div className="mt-auto flex flex-col gap-1.5 pt-[18px] max-[760px]:hidden">
            <span
              className={cn(
                "flex items-center gap-[9px] rounded-md px-[9px] py-1.5 text-[0.76rem] font-semibold text-faint",
                "[&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:shrink-0 [&>svg]:[stroke-width:2.3] [&>svg]:fill-none [&>svg]:stroke-current [&>svg]:[stroke-linecap:round] [&>svg]:[stroke-linejoin:round]",
                "[&>b]:ml-auto [&>b]:font-display [&>b]:text-[0.66rem] [&>b]:font-extrabold [&>b]:opacity-50",
              )}
            >
              <svg viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
              </svg>
              Configurações
              <b>06</b>
            </span>
            <span className="flex items-center gap-2 rounded-md bg-surface-2 px-2.5 py-2 text-[0.76rem] font-semibold text-muted [&>i]:size-[9px] [&>i]:rounded-full [&>i]:bg-faint">
              <i />
              Fora do ar
            </span>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-3.5 p-[18px] max-[760px]:p-[15px]">
          <div>
            <span className="mb-[5px] block text-[0.6rem] font-extrabold tracking-[0.16em] text-brass uppercase">
              painel da live
            </span>
            <strong className="block font-display text-2xl leading-[1.05] font-extrabold tracking-[-0.02em]">
              Ao vivo
            </strong>
          </div>

          <div className="grid grid-cols-3 gap-2 max-[760px]:grid-cols-2 max-[760px]:[&>div:last-child]:col-span-2">
            <div className={STAT}>
              <span>seu upload</span>
              <strong>25 Mb/s</strong>
            </div>
            <div className={STAT}>
              <span>a live precisa</span>
              <strong>18,5 Mb/s</strong>
            </div>
            <div className={cn(STAT, "[&>strong]:text-ok")}>
              <span>folga</span>
              <strong>tranquila</strong>
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-2">
            {targets.map((target) => (
              <div
                className="grid grid-cols-[38px_minmax(0,1fr)_auto_auto] items-center gap-[11px] rounded-md bg-surface-2 px-[11px] py-[9px] max-[760px]:grid-cols-[34px_minmax(0,1fr)_auto] [&_.glyph]:h-[38px] [&_.glyph]:w-[38px]"
                key={target.id}
              >
                <PlatformGlyph id={target.id} />
                <div>
                  <strong className="block font-display text-[0.92rem] leading-[1.1] font-bold">
                    {target.name}
                  </strong>
                  <small className="mt-0.5 block text-[0.62rem] font-[550] text-faint-raised">
                    {target.detail}
                  </small>
                </div>
                <span className="rounded-sm border border-border-dry px-[7px] py-1 text-[0.58rem] font-bold text-muted max-[760px]:hidden">
                  {target.quality}
                </span>
                <span
                  className="flex h-[21px] w-[38px] items-center justify-end rounded-md bg-brass p-[3px]"
                  aria-hidden="true"
                >
                  <i className="size-3.5 rounded-sm bg-brass-ink" />
                </span>
              </div>
            ))}
          </div>

          {/* ≥18.66px em peso 800 = "texto grande" no WCAG, então o branco sobre
              tomate (3.1:1) passa AA — é o mesmo botão do app. */}
          <div
            className={cn(
              "flex min-h-[50px] items-center justify-center gap-2.5 rounded-md bg-tomate text-white shadow-pop",
              "font-display text-[1.18rem] font-extrabold tracking-[0.01em]",
              "[&>svg]:h-[21px] [&>svg]:w-[21px] [&>svg]:[stroke-width:2.5] [&>svg]:fill-none [&>svg]:stroke-current [&>svg]:[stroke-linecap:round] [&>svg]:[stroke-linejoin:round]",
            )}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="2" />
              <path d="M7.8 16.2a6 6 0 0 1 0-8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 19.1a10 10 0 0 1 0-14.2M19.1 4.9a10 10 0 0 1 0 14.2" />
            </svg>
            BORA AO VIVO
          </div>
        </div>

        <div
          className="flex min-w-0 flex-col border-l border-border-soft bg-panel px-[15px] py-[18px] max-[1180px]:hidden"
          aria-hidden="true"
        >
          <div className="mb-4 flex items-start justify-between gap-2.5">
            <span>
              <strong className="block font-display text-[0.9rem] leading-none font-bold">
                Chat reunido
              </strong>
              <small className="mt-[3px] block text-[0.56rem] font-bold tracking-[0.08em] text-faint uppercase">
                3 plataformas
              </small>
            </span>
          </div>

          <div className="flex flex-1 flex-col gap-[13px]">
            {chat.map((message) => (
              <div
                className="grid grid-cols-[24px_minmax(0,1fr)] gap-2 [&_.glyph]:h-6 [&_.glyph]:w-6"
                key={message.id}
              >
                <PlatformGlyph id={message.id} />
                <div>
                  <strong className="block text-[0.6rem] font-extrabold text-muted">
                    {message.from} · {message.who}
                  </strong>
                  <p className="mt-0.5 text-[0.72rem] leading-[1.4] font-[550]">
                    {message.text}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3.5 flex min-h-[34px] items-center justify-between gap-2 rounded-md border border-border-dry px-2.5 text-[0.62rem] font-[550] text-faint">
            Responde de uma vez…
            <b className="text-brass">enviar</b>
          </div>
        </div>
      </div>
    </figure>
  );
}
