import { Mascot, ObsMark, PlatformGlyph } from "../_components/decor";
import { ChatIcon, RadioIcon } from "../_components/icons";
import {
  BenefitCopy,
  BenefitNote,
  BenefitRow,
  DemoLabel,
  DemoPanel,
  Section,
  SectionHeading,
  Shell,
  State,
} from "../_components/ui";

// "Por que" — duas linhas largas de benefício, nunca grade de cards. Cada uma
// traz a cópia de um lado e uma demonstração real do app do outro.

const ROUTE_ROW =
  "grid min-h-[42px] grid-cols-[26px_1fr_auto] items-center gap-2.5 rounded-md px-[9px] py-1.5 text-[0.8rem] font-bold " +
  "[&_.glyph]:h-[26px] [&_.glyph]:w-[26px]";

const CHAT_LINE =
  "grid grid-cols-[26px_1fr] items-center gap-2.5 rounded-md bg-surface-2 px-2.5 py-[9px] " +
  "[&_.glyph]:h-[26px] [&_.glyph]:w-[26px] " +
  "[&_strong]:block [&_strong]:text-[0.6rem] [&_strong]:font-extrabold [&_strong]:tracking-[0.06em] [&_strong]:text-faint-raised [&_strong]:uppercase " +
  "[&_p]:mt-0.5 [&_p]:text-[0.84rem] [&_p]:font-semibold";

/** O leque de rotas: uma entrada, três saídas. */
function RouteFan() {
  return (
    <div className="grid grid-cols-[62px_34px_1fr] items-center max-[760px]:grid-cols-[54px_26px_1fr]">
      <span className="grid size-[62px] max-[760px]:size-[54px] max-[760px]:text-[0.92rem] place-items-center gap-0.5 rounded-md bg-brass font-display text-[1.05rem] font-extrabold text-brass-ink shadow-pop-sm [&>svg]:h-[22px] [&>svg]:w-[22px] [&>svg]:fill-current">
        <ObsMark />
        OBS
      </span>

      {/* Em porcentagem da altura: com 3 linhas de 42px e 8px de respiro, os
          centros caem em 14,79% / 50% / 85,21% — assim o leque encosta no meio
          de cada destino em qualquer altura de linha. O `self-stretch` importa:
          sem ele o SVG tinha altura própria e o grid centralizava a diferença,
          desalinhando ~5px. */}
      <span
        className="self-stretch text-brass [&_path]:fill-none [&_path]:stroke-current [&_path]:[stroke-width:2.5] [&_path]:[vector-effect:non-scaling-stroke] [&>svg]:block [&>svg]:h-full [&>svg]:w-[34px]"
        aria-hidden="true"
      >
        <svg viewBox="0 0 34 100" preserveAspectRatio="none">
          <path d="M0 50H12V14.79H34" />
          <path d="M0 50H34" />
          <path d="M0 50H12V85.21H34" />
        </svg>
      </span>

      <div className="flex flex-col gap-2">
        <div className={`${ROUTE_ROW} bg-surface-2`}>
          <PlatformGlyph id="twitch" />
          Twitch
          <State>
            <i /> no ar
          </State>
        </div>
        <div className={`${ROUTE_ROW} bg-surface-2`}>
          <PlatformGlyph id="youtube" />
          YouTube
          <State>
            <i /> no ar
          </State>
        </div>
        <div className={`${ROUTE_ROW} bg-surface-3`}>
          <PlatformGlyph id="kick" />
          Kick
          <State tone="warn">
            <i /> reconectando
          </State>
        </div>
      </div>
    </div>
  );
}

export function Benefits() {
  return (
    <Section id="por-que" tone="paper">
      <Shell>
        <SectionHeading
          tone="paper"
          centered
          kicker="Feita pra rotina de quem faz live"
          title="Você cuida do conteúdo. A Corneta cuida do caminho."
        >
          <p>
            Menos janela pra vigiar, menos susto no meio da live e mais tempo
            pra falar com quem tá assistindo.
          </p>
        </SectionHeading>

        <div className="mt-[clamp(52px,6vw,84px)] flex flex-col gap-[clamp(30px,4vw,56px)]">
          <BenefitRow>
            <BenefitCopy
              icon={<RadioIcon />}
              title="Chegue em mais lugares sem perder o controle"
            >
              <p>
                Você liga as plataformas que quiser e acompanha uma por uma. Se
                alguma precisar reconectar, as outras seguem no ar — e você vê
                isso acontecendo, sem ficar adivinhando.
              </p>
              <BenefitNote>
                <Mascot /> Cada plataforma tem seu próprio interruptor
              </BenefitNote>
            </BenefitCopy>

            <DemoPanel>
              <DemoLabel>
                <span>suas plataformas</span>
                <span>exemplo</span>
              </DemoLabel>
              <RouteFan />
            </DemoPanel>
          </BenefitRow>

          <BenefitRow brass>
            <BenefitCopy
              tone="brass"
              icon={<ChatIcon />}
              title="Converse com todo mundo sem malabarismo"
            >
              <p>
                Chat, alertas e audiência aparecem juntos. Você acompanha a
                galera sem pular entre janela e janela — e responde de um lugar
                só.
              </p>
              <BenefitNote>
                <Mascot /> Twitch, YouTube e Kick na mesma coluna
              </BenefitNote>
            </BenefitCopy>

            <DemoPanel>
              <DemoLabel>
                <span>chat reunido</span>
                <span>exemplo</span>
              </DemoLabel>
              <div className="flex flex-col gap-2.5">
                <div className={CHAT_LINE}>
                  <PlatformGlyph id="twitch" />
                  <div>
                    <strong>gabizera · Twitch</strong>
                    <p>salve salve, chegando!</p>
                  </div>
                </div>
                <div className={CHAT_LINE}>
                  <PlatformGlyph id="youtube" />
                  <div>
                    <strong>Marcos L. · YouTube</strong>
                    <p>áudio tá limpo hoje 👏</p>
                  </div>
                </div>
                <div className={CHAT_LINE}>
                  <PlatformGlyph id="kick" />
                  <div>
                    <strong>duduxx · Kick</strong>
                    <p>bora cornetar!!</p>
                  </div>
                </div>
                <div className="flex min-h-[38px] items-center justify-between gap-2.5 rounded-md border-2 border-border-dry px-[11px] text-[0.74rem] font-semibold text-faint-raised">
                  Responde de uma vez…
                  <b className="text-brass">enviar</b>
                </div>
              </div>
            </DemoPanel>
          </BenefitRow>
        </div>
      </Shell>
    </Section>
  );
}
