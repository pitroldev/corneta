import { thousandsSep, type Locale, type T } from "@/lib/i18n";
import { Mascot } from "./decor";
import { cn } from "./ui";
import { LiveChat, LivePanel, type LiveWindowCopy } from "./live-window";

// Réplica da tela "Ao vivo" do app (titlebar + sidebar numerada + destinos +
// chat reunido). Os números da navegação são os atalhos Alt+N do app; os valores
// de banda e as mensagens são ilustrativos e estão marcados como prévia.

// `id` é identificador de tela — o "está ativo?" e o selo "novo" olham pra ELE,
// nunca pro rótulo. Comparar com o texto traduzido quebra no primeiro idioma novo.
const nav = [
  { id: "platforms", n: "01", icon: "tv" },
  { id: "encoding", n: "02", icon: "sliders" },
  { id: "golive", n: "03", icon: "radio" },
  { id: "chat", n: "04", icon: "chat" },
  { id: "reports", n: "05", icon: "chart" },
] as const;

// `n` é o índice da mensagem no dicionário (preview.chat.msg.N.*) — o texto e o
// apelido de exemplo mudam com o idioma, o glifo da plataforma não.
//
// Oito falas, não três: a coluna mostra cinco e vai rodando, então a lista
// precisa ser maior que a janela pra o chat não repetir a cada volta. Duas
// plataformas se repetem de propósito — chat de verdade não reveza educadamente.
const chat = [
  { platform: "twitch", who: "Twitch", n: 1 },
  { platform: "youtube", who: "YouTube", n: 2 },
  { platform: "kick", who: "Kick", n: 3 },
  { platform: "twitch", who: "Twitch", n: 4 },
  { platform: "youtube", who: "YouTube", n: 5 },
  { platform: "kick", who: "Kick", n: 6 },
  { platform: "twitch", who: "Twitch", n: 7 },
  { platform: "youtube", who: "YouTube", n: 8 },
] as const;

/** Copy do miolo vivo, resolvida no SERVIDOR: função não atravessa a fronteira
 *  servidor→cliente do Next, então o componente animado recebe texto pronto. */
const liveCopy = (t: T, locale: Locale): LiveWindowCopy => ({
  kicker: t("preview.panel.title"),
  title: t("preview.nav.golive.label"),
  stateLive: t("preview.state.live"),
  statUptime: t("preview.stat.uptime"),
  statSending: t("preview.stat.sending"),
  statDrops: t("preview.stat.drops"),
  verdict: t("preview.verdict"),
  stop: t("preview.stop"),
  metrics: t("preview.target.metrics"),
  sep: thousandsSep(locale),
  chatTitle: t("preview.chat.title"),
  chatPlatforms: t("preview.chat.platforms"),
  compose: t("preview.chat.compose"),
  send: t("preview.chat.compose.send"),
  messages: chat.map((m) => ({
    platform: m.platform,
    who: m.who,
    from: t(`preview.chat.msg.${m.n}.from`),
    text: t(`preview.chat.msg.${m.n}.text`),
  })),
});

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

export function ProductPreview({ t, locale }: { t: T; locale: Locale }) {
  return (
    <figure className="overflow-hidden rounded-xl border border-border-dry bg-surface shadow-[10px_10px_0_0_var(--night),0_30px_60px_rgb(0_0_0/42%)] max-[760px]:shadow-[5px_5px_0_0_var(--night),0_18px_34px_rgb(0_0_0/38%)]">
      <figcaption className="sr-only">{t("preview.figure.alt")}</figcaption>

      <div className="flex min-h-10 items-center gap-2.5 border-b border-border-soft bg-panel pl-[13px]">
        <span className="flex items-center gap-2 [&>i]:grid [&>i]:size-[21px] [&>i]:place-items-center [&>i]:rounded-[5px] [&>i]:bg-brass [&>i]:text-brass-ink [&>i>svg]:h-3.5 [&>i>svg]:w-3.5">
          <i>
            <Mascot />
          </i>
          <strong className="font-display text-[0.88rem] leading-none font-bold">
            Corneta
          </strong>
          <span className="text-[0.68rem] font-medium text-faint max-[420px]:hidden">
            {t("preview.titlebar.tag")}
          </span>
        </span>
        <span className="ml-3.5 rounded-sm border border-border-dry px-[7px] py-[3px] text-[0.56rem] font-extrabold tracking-[0.1em] whitespace-nowrap text-muted">
          {t("preview.badge")}
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
                {t("preview.titlebar.tag")}
              </small>
            </span>
          </span>

          <div className="flex flex-col gap-1.5 max-[760px]:flex-row max-[760px]:gap-[7px]">
            {nav.map((item) => (
              <span
                key={item.id}
                className={cn(NAV_ITEM, item.id === "golive" && NAV_ACTIVE)}
              >
                <i>
                  <NavIcon name={item.icon} />
                </i>
                <span>
                  <strong>{t(`preview.nav.${item.id}.label`)}</strong>
                  <small>{t(`preview.nav.${item.id}.hint`)}</small>
                </span>
                {item.id === "reports" ? (
                  <b className="ml-auto -rotate-3 rounded-sm bg-tomate px-[5px] py-0.5 text-[0.54rem] font-extrabold tracking-[0.06em] text-brass-ink uppercase">
                    {t("preview.nav.reports.badge")}
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
              {t("preview.settings")}
              <b>06</b>
            </span>
            {/* O rodapé da barra lateral é o estado GLOBAL do app. Com o painel
                no ar ele tinha que virar junto: "Fora do ar" ao lado de um
                painel transmitindo é contradição, não detalhe. */}
            <span className="flex items-center gap-2 rounded-md bg-surface-2 px-2.5 py-2 text-[0.76rem] font-semibold text-ok [&>i]:size-[9px] [&>i]:rounded-full [&>i]:bg-ok">
              <i />
              {t("preview.state.onAir")}
            </span>
          </div>
        </div>

        <LivePanel copy={liveCopy(t, locale)} />
        <LiveChat copy={liveCopy(t, locale)} />
      </div>
    </figure>
  );
}
