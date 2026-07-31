import type { T } from "@/lib/i18n";
import { PlatformGlyph } from "./decor";
import { Moderated } from "./moderated";
import { Switch } from "./switch";
import { Board, Chip, DemoLabel, HubNote } from "./ui";
import {
  BellIcon,
  CoinIcon,
  HeartIcon,
  InfoIcon,
  RaidIcon,
  StarIcon,
} from "./icons";

// {t("protection.chat.tabs.chat.title")}, alertas e overlay pro OBS — as três coisas que a tela de Chat
// do app faz. As abas vêm do <Switch>; os painéis abaixo seguem sendo servidor.

export function ChatHub({ t }: { t: T }) {
  return (
    <Switch
      label={t("protection.chat.tabs.label")}
      items={[
        {
          id: "chat",
          title: "Chat unificado",
          hint: t("protection.chat.tabs.chat.hint"),
          panel: <ChatPanel t={t} />,
        },
        {
          id: "alertas",
          title: t("protection.chat.tabs.alerts.title"),
          hint: t("protection.chat.tabs.alerts.hint"),
          panel: <AlertsPanel t={t} />,
        },
        {
          id: "overlay",
          title: t("protection.chat.tabs.overlay.title"),
          hint: t("protection.chat.tabs.overlay.hint"),
          panel: <OverlayPanel t={t} />,
        },
      ]}
    />
  );
}

// Uma linha de mensagem: glifo de 26px + corpo. O `.glyph` que o PlatformGlyph
// aplica é dimensionado aqui pela primeira coluna do grid.
const MSG =
  "grid grid-cols-[26px_minmax(0,1fr)] gap-[9px] rounded-md bg-surface px-2.5 py-[9px] not-first:mt-[7px] " +
  "[&_.glyph]:h-[26px] [&_.glyph]:w-[26px] " +
  "[&>div>p]:mt-[3px] [&>div>p]:text-[0.8rem] [&>div>p]:leading-[1.4] [&>div>p]:font-[550]";
const MSG_HEAD =
  "flex items-center gap-1.5 [&>strong]:text-[0.74rem] [&>strong]:font-extrabold";
// text-faint sobre superfície elevada dá 4.44:1 e não passa AA. O token
// faint-raised existe exatamente pra esse caso — é o mesmo creme apagado, um
// passo mais claro.
const MSG_TIME =
  "ml-auto text-[0.56rem] font-bold tabular-nums text-faint-raised";
const BADGE =
  "rounded-sm px-[5px] py-px text-[0.5rem] font-extrabold tracking-[0.04em] uppercase";

function ChatPanel({ t }: { t: T }) {
  return (
    <div>
      <Board>
        <DemoLabel>
          <span>{t("protection.chat.demo.label")}</span>
          <span>{t("protection.chat.demo.example")}</span>
        </DemoLabel>

        <div className={MSG}>
          <PlatformGlyph id="twitch" />
          <div>
            <div className={MSG_HEAD}>
              <strong>{t("protection.chat.msg.1.name")}</strong>
              <span className={`${BADGE} bg-ok text-night`}>
                {t("protection.chat.msg.1.badge")}
              </span>
              <span className={MSG_TIME}>21:42</span>
            </div>
            <p>
              {t("protection.chat.msg.1.text")}{" "}
              <span className="mx-px inline-grid size-[17px] place-items-center rounded-sm bg-brass align-[-3px] text-[0.56rem] font-extrabold text-brass-ink">
                :D
              </span>
            </p>
            <div className="mt-[7px] flex gap-1.5 max-[760px]:hidden [&>span]:rounded-sm [&>span]:border [&>span]:border-border-dry [&>span]:px-[7px] [&>span]:py-[3px] [&>span]:text-[0.56rem] [&>span]:font-extrabold [&>span]:tracking-[0.04em] [&>span]:text-muted [&>span]:uppercase">
              <span>{t("protection.chat.msg.1.action.delete")}</span>
              <span>{t("protection.chat.msg.1.action.timeout")}</span>
              <span>{t("protection.chat.msg.1.action.reply")}</span>
            </div>
          </div>
        </div>

        <div className={MSG}>
          <PlatformGlyph id="youtube" />
          <div>
            <div className={MSG_HEAD}>
              <strong>{t("protection.chat.msg.2.name")}</strong>
              <span className={`${BADGE} bg-brass text-brass-ink`}>
                {t("protection.chat.msg.2.badge")}
              </span>
              <span className={MSG_TIME}>21:42</span>
            </div>
            <p>{t("protection.chat.msg.2.text")}</p>
          </div>
        </div>

        <div className={MSG}>
          <PlatformGlyph id="kick" />
          <div>
            <div className={MSG_HEAD}>
              <strong>{t("protection.chat.msg.3.name")}</strong>
              <span className={MSG_TIME}>21:43</span>
            </div>
            <p>{t("protection.chat.msg.3.text")}</p>
          </div>
        </div>

        <div className={MSG}>
          <PlatformGlyph id="twitch" />
          <div>
            <div className={MSG_HEAD}>
              <strong>{t("protection.chat.msg.4.name")}</strong>
              <span className={MSG_TIME}>21:43</span>
            </div>
            {/* Apagada ENQUANTO você olha — ver o risco atravessar a frase é o
                que transforma o botão "apagar" acima de enfeite em ação. */}
            <Moderated>{t("protection.chat.msg.4.text")}</Moderated>
          </div>
        </div>

        <div className="flex min-h-[38px] items-center justify-between gap-2.5 rounded-md border-2 border-border-dry px-[11px] text-[0.74rem] font-semibold text-faint-raised">
          {t("protection.chat.input.placeholder")}
          <b className="text-brass">{t("protection.chat.input.sendAll")}</b>
        </div>
      </Board>

      <HubNote>
        <InfoIcon />
        <span>{t("protection.chat.note")}</span>
      </HubNote>
    </div>
  );
}

const ALERT =
  "grid grid-cols-[30px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-md bg-surface px-[11px] py-2.5 not-first:mt-[7px] " +
  "[&>div>strong]:block [&>div>strong]:text-[0.8rem] [&>div>strong]:font-extrabold " +
  "[&>div>small]:mt-0.5 [&>div>small]:block [&>div>small]:text-[0.68rem] [&>div>small]:font-[550] [&>div>small]:text-muted";
const KIND =
  "grid size-[30px] place-items-center rounded-sm text-[0.62rem] font-extrabold [&>svg]:h-4 [&>svg]:w-4 [&>svg]:fill-current";
const AMOUNT = "font-display text-[0.94rem] font-extrabold tabular-nums";

function AlertsPanel({ t }: { t: T }) {
  return (
    <div>
      <Board>
        <DemoLabel>
          <span>{t("protection.alerts.demo.label")}</span>
          <span>{t("protection.alerts.demo.example")}</span>
        </DemoLabel>

        <div className={ALERT}>
          <span className={`${KIND} bg-ok text-night`}>
            <HeartIcon />
          </span>
          <div>
            <strong>{t("protection.alerts.item.follow.title")}</strong>
            <small>{t("protection.alerts.item.follow.meta")}</small>
          </div>
        </div>

        <div className={ALERT}>
          <span className={`${KIND} bg-brass text-brass-ink`}>
            <StarIcon />
          </span>
          <div>
            <strong>{t("protection.alerts.item.sub.title")}</strong>
            <small>{t("protection.alerts.item.sub.meta")}</small>
          </div>
          <span className={AMOUNT}>
            {t("protection.alerts.item.sub.amount")}
          </span>
        </div>

        <div className={ALERT}>
          <span className={`${KIND} bg-tomate text-white`}>
            <RaidIcon />
          </span>
          <div>
            <strong>{t("protection.alerts.item.raid.title")}</strong>
            <small>{t("protection.alerts.item.raid.meta")}</small>
          </div>
          <span className={AMOUNT}>42</span>
        </div>

        <div className={ALERT}>
          <span className={`${KIND} bg-brass text-brass-ink`}>
            <CoinIcon />
          </span>
          <div>
            <strong>{t("protection.alerts.item.superchat.title")}</strong>
            <small>{t("protection.alerts.item.superchat.meta")}</small>
          </div>
          <span className={AMOUNT}>
            {t("protection.alerts.item.superchat.amount")}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-[7px]">
          <Chip quiet>{t("protection.alerts.chip.bits")}</Chip>
          <Chip quiet>{t("protection.alerts.chip.subgift")}</Chip>
          <Chip quiet>{t("protection.alerts.chip.member")}</Chip>
          <Chip quiet>{t("protection.alerts.chip.tip")}</Chip>
          <Chip>Streamlabs</Chip>
          <Chip>StreamElements</Chip>
        </div>
      </Board>

      <HubNote>
        <InfoIcon />
        <span>{t("protection.alerts.note")}</span>
      </HubNote>
    </div>
  );
}

const URL_FIELD =
  "mt-2 flex min-h-[38px] items-center justify-between gap-2.5 rounded-md border-2 border-border-dry px-[11px] " +
  "[&>code]:text-[0.72rem] [&>code]:font-semibold [&>code]:text-muted [&>span]:text-[0.62rem] [&>span]:font-extrabold [&>span]:tracking-[0.06em] [&>span]:text-brass [&>span]:uppercase";

function OverlayPanel({ t }: { t: T }) {
  return (
    <div>
      <Board>
        <DemoLabel>
          <span>{t("protection.overlay.demo.label")}</span>
          <span>{t("protection.overlay.demo.example")}</span>
        </DemoLabel>

        <div className="relative grid aspect-video content-start overflow-hidden rounded-lg border-2 border-border-dry bg-surface bg-[image:var(--halftone-dark)] bg-[length:16px_16px] p-3">
          <small className="text-[0.6rem] font-extrabold tracking-[0.1em] text-faint-raised uppercase">
            {t("protection.overlay.scene")}
          </small>

          <div className="mx-auto mt-3.5 flex w-max max-w-full -rotate-[1.4deg] items-center gap-[9px] rounded-md bg-brass px-[13px] py-[9px] font-display text-[0.9rem] font-extrabold text-brass-ink shadow-pop [&>svg]:h-[18px] [&>svg]:w-[18px] [&>svg]:fill-current">
            <BellIcon />
            {t("protection.overlay.alert")}
          </div>

          {/* A moldura da {t("protection.overlay.camera")} dá escala à cena e explica por que o meio
              fica livre: ali é o seu conteúdo. */}
          <span
            className="absolute right-3 bottom-3 grid aspect-4/3 w-[27%] content-end justify-end rounded-md border-2 border-dashed border-border-dry px-[9px] py-[7px] text-[0.58rem] font-extrabold tracking-[0.08em] text-faint-raised uppercase"
            aria-hidden="true"
          >
            câmera
          </span>

          <div
            className="absolute bottom-3 left-3 flex flex-col gap-[5px] [&>span]:flex [&>span]:w-max [&>span]:max-w-full [&>span]:items-center [&>span]:gap-1.5 [&>span]:rounded-sm [&>span]:bg-night/[0.78] [&>span]:px-2 [&>span]:py-[5px] [&>span]:text-[0.66rem] [&>span]:font-[650] [&_i]:h-[7px] [&_i]:w-[7px] [&_i]:shrink-0 [&_i]:rounded-full"
            aria-hidden="true"
          >
            <span>
              <i style={{ background: "var(--twitch)" }} />{" "}
              {t("protection.overlay.chat.1")}
            </span>
            <span>
              <i style={{ background: "var(--youtube)" }} />{" "}
              {t("protection.overlay.chat.2")}
            </span>
            <span>
              <i style={{ background: "var(--kick)" }} />{" "}
              {t("protection.overlay.chat.3")}
            </span>
          </div>
        </div>

        <div className={URL_FIELD}>
          <code>http://127.0.0.1:7393/alerts</code>
          <span>{t("protection.overlay.url.copy")}</span>
        </div>
        <div className={URL_FIELD}>
          <code>http://127.0.0.1:7393/chat</code>
          <span>copiar</span>
        </div>
      </Board>

      <HubNote>
        <InfoIcon />
        <span>
          {/* Sem `<strong>` no meio: marcação dentro da frase obrigaria a
              fatiá-la em pedaços que a tradução não recompõe na mesma ordem. */}
          {t("protection.overlay.note")}
        </span>
      </HubNote>
    </div>
  );
}
