import { PlatformGlyph } from "./decor";
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

// Chat unificado, alertas e overlay pro OBS — as três coisas que a tela de Chat
// do app faz. As abas vêm do <Switch>; os painéis abaixo seguem sendo servidor.

export function ChatHub() {
  return (
    <Switch
      label="Chat, alertas e overlay"
      items={[
        {
          id: "chat",
          title: "Chat unificado",
          hint: "ler, responder, moderar",
          panel: <ChatPanel />,
        },
        {
          id: "alertas",
          title: "Alertas",
          hint: "quem chegou e apoiou",
          panel: <AlertsPanel />,
        },
        {
          id: "overlay",
          title: "Overlay pro OBS",
          hint: "uma URL, uma vez só",
          panel: <OverlayPanel />,
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
const MSG_TIME = "ml-auto text-[0.56rem] font-bold tabular-nums text-faint";
const BADGE =
  "rounded-sm px-[5px] py-px text-[0.5rem] font-extrabold tracking-[0.04em] uppercase";

function ChatPanel() {
  return (
    <div>
      <Board>
        <DemoLabel>
          <span>chat reunido · 3 plataformas</span>
          <span>exemplo</span>
        </DemoLabel>

        <div className={MSG}>
          <PlatformGlyph id="twitch" />
          <div>
            <div className={MSG_HEAD}>
              <strong>gabizera</strong>
              <span className={`${BADGE} bg-ok text-night`}>mod</span>
              <span className={MSG_TIME}>21:42</span>
            </div>
            <p>
              salve salve, chegando!{" "}
              <span className="mx-px inline-grid size-[17px] place-items-center rounded-sm bg-brass align-[-3px] text-[0.56rem] font-extrabold text-brass-ink">
                :D
              </span>
            </p>
            <div className="mt-[7px] flex gap-1.5 max-[760px]:hidden [&>span]:rounded-sm [&>span]:border [&>span]:border-border-dry [&>span]:px-[7px] [&>span]:py-[3px] [&>span]:text-[0.56rem] [&>span]:font-extrabold [&>span]:tracking-[0.04em] [&>span]:text-muted [&>span]:uppercase">
              <span>apagar</span>
              <span>timeout</span>
              <span>responder</span>
            </div>
          </div>
        </div>

        <div className={MSG}>
          <PlatformGlyph id="youtube" />
          <div>
            <div className={MSG_HEAD}>
              <strong>Marcos L.</strong>
              <span className={`${BADGE} bg-brass text-brass-ink`}>membro</span>
              <span className={MSG_TIME}>21:42</span>
            </div>
            <p>áudio tá limpo hoje 👏</p>
          </div>
        </div>

        <div className={MSG}>
          <PlatformGlyph id="kick" />
          <div>
            <div className={MSG_HEAD}>
              <strong>duduxx</strong>
              <span className={MSG_TIME}>21:43</span>
            </div>
            <p>bora cornetar!!</p>
          </div>
        </div>

        <div className={MSG}>
          <PlatformGlyph id="twitch" />
          <div>
            <div className={MSG_HEAD}>
              <strong>bot_spam_xyz</strong>
              <span className={MSG_TIME}>21:43</span>
            </div>
            <p className="text-faint line-through">
              mensagem removida pela moderação
            </p>
          </div>
        </div>

        <div className="flex min-h-[38px] items-center justify-between gap-2.5 rounded-md border-2 border-border-dry px-[11px] text-[0.74rem] font-semibold text-faint-raised">
          Manda no chat…
          <b className="text-brass">enviar pra todas</b>
        </div>
      </Board>

      <HubNote>
        <InfoIcon />
        <span>
          Twitch, Kick e YouTube no mesmo feed — até dois canais da Twitch de
          uma vez. Emotes de BTTV, FFZ e 7TV, selos, horário e envio pelo mesmo
          campo. Apagar e dar timeout é ali mesmo: a mensagem vira lápide no
          feed em vez de sumir sem explicação e deixar você no escuro.
        </span>
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

function AlertsPanel() {
  return (
    <div>
      <Board>
        <DemoLabel>
          <span>alertas ao vivo</span>
          <span>exemplo</span>
        </DemoLabel>

        <div className={ALERT}>
          <span className={`${KIND} bg-ok text-night`}>
            <HeartIcon />
          </span>
          <div>
            <strong>lucasrmk seguiu você</strong>
            <small>Twitch · agora</small>
          </div>
        </div>

        <div className={ALERT}>
          <span className={`${KIND} bg-brass text-brass-ink`}>
            <StarIcon />
          </span>
          <div>
            <strong>ana.play assinou</strong>
            <small>Twitch · tier 1 · “tô desde o começo!”</small>
          </div>
          <span className={AMOUNT}>3 meses</span>
        </div>

        <div className={ALERT}>
          <span className={`${KIND} bg-tomate text-white`}>
            <RaidIcon />
          </span>
          <div>
            <strong>canal_do_ze mandou um raid</strong>
            <small>Twitch · trouxe gente nova pro chat</small>
          </div>
          <span className={AMOUNT}>42</span>
        </div>

        <div className={ALERT}>
          <span className={`${KIND} bg-brass text-brass-ink`}>
            <CoinIcon />
          </span>
          <div>
            <strong>Superchat de Marcos L.</strong>
            <small>YouTube · “explica o setup!”</small>
          </div>
          <span className={AMOUNT}>R$ 20</span>
        </div>

        <div className="mt-3 flex flex-wrap gap-[7px]">
          <Chip quiet>bits</Chip>
          <Chip quiet>subgift</Chip>
          <Chip quiet>membro</Chip>
          <Chip quiet>tip</Chip>
          <Chip>Streamlabs</Chip>
          <Chip>StreamElements</Chip>
        </div>
      </Board>

      <HubNote>
        <InfoIcon />
        <span>
          Seguidor, sub, resub, subgift, bits, raid, membro e superchat chegam
          direto das plataformas. Doação e meta entram pelo Streamlabs ou
          StreamElements, com o token guardado no cofre. O painel fica ao lado
          do chat — ou numa janelinha só dele, por cima do jogo.
        </span>
      </HubNote>
    </div>
  );
}

const URL_FIELD =
  "mt-2 flex min-h-[38px] items-center justify-between gap-2.5 rounded-md border-2 border-border-dry px-[11px] " +
  "[&>code]:text-[0.72rem] [&>code]:font-semibold [&>code]:text-muted [&>span]:text-[0.62rem] [&>span]:font-extrabold [&>span]:tracking-[0.06em] [&>span]:text-brass [&>span]:uppercase";

function OverlayPanel() {
  return (
    <div>
      <Board>
        <DemoLabel>
          <span>sua cena no OBS</span>
          <span>exemplo</span>
        </DemoLabel>

        <div className="relative grid aspect-video content-start overflow-hidden rounded-lg border-2 border-border-dry bg-surface bg-[image:var(--halftone-dark)] bg-[length:16px_16px] p-3">
          <small className="text-[0.6rem] font-extrabold tracking-[0.1em] text-faint-raised uppercase">
            cena · live de sempre
          </small>

          <div className="mx-auto mt-3.5 flex w-max max-w-full -rotate-[1.4deg] items-center gap-[9px] rounded-md bg-brass px-[13px] py-[9px] font-display text-[0.9rem] font-extrabold text-brass-ink shadow-pop [&>svg]:h-[18px] [&>svg]:w-[18px] [&>svg]:fill-current">
            <BellIcon />
            ana.play assinou · tier 1
          </div>

          {/* A moldura da câmera dá escala à cena e explica por que o meio
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
              <i style={{ background: "var(--twitch)" }} /> gabizera: salve
              salve!
            </span>
            <span>
              <i style={{ background: "var(--youtube)" }} /> Marcos L.: áudio tá
              limpo
            </span>
            <span>
              <i style={{ background: "var(--kick)" }} /> duduxx: bora
              cornetar!!
            </span>
          </div>
        </div>

        <div className={URL_FIELD}>
          <code>http://127.0.0.1:7393/alerts</code>
          <span>copiar</span>
        </div>
        <div className={URL_FIELD}>
          <code>http://127.0.0.1:7393/chat</code>
          <span>copiar</span>
        </div>
      </Board>

      <HubNote>
        <InfoIcon />
        <span>
          Um servidor local joga os alertas e o chat (com emotes) numa URL que
          você adiciona como <strong>Browser Source</strong> — uma vez só, e a
          Corneta consegue até criar a fonte no OBS pra você. Posição, tamanho,
          duração, som, quantas mensagens ficam na tela e esconder comandos
          (“!”) são ajustáveis. Tem botão de alerta de teste pra você conferir
          sem esperar ninguém.
        </span>
      </HubNote>
    </div>
  );
}
