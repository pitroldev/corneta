import type { T } from "@/lib/i18n";
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
function RouteFan({ t }: { t: T }) {
  return (
    <div className="grid grid-cols-[62px_34px_1fr] items-center max-[760px]:grid-cols-[54px_26px_1fr]">
      {/* "OBS" não tem letra com descendente, mas a caixa de linha da Baloo 2
          reserva o espaço dela assim mesmo — quase 7px vazios abaixo da tinta.
          O grid centraliza CAIXAS, não tinta, então essa sobra empurrava o
          conjunto pra cima e o logo encostava na borda de topo. `leading-none`
          tira boa parte do fantasma. O que sobra é a assimetria da própria
          fonte, e aí não tem cálculo: o `pt` é correção ÓPTICA medida na tela —
          sem ele restavam 5,6px de tinta em cima contra 10,7px embaixo, e
          padding no topo empurra o conteúdo centralizado metade disso. */}
      <span className="grid size-[62px] place-items-center gap-1 rounded-md bg-brass pt-[5px] font-display text-[1.05rem] font-extrabold text-brass-ink shadow-pop-sm max-[760px]:size-[54px] max-[760px]:text-[0.92rem] [&>svg]:h-5 [&>svg]:w-5 [&>svg]:fill-current">
        <ObsMark />
        <span className="leading-none">OBS</span>
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
            <i /> {t("benefits.routes.demo.twitch.state")}
          </State>
        </div>
        <div className={`${ROUTE_ROW} bg-surface-2`}>
          <PlatformGlyph id="youtube" />
          YouTube
          <State>
            <i /> {t("benefits.routes.demo.youtube.state")}
          </State>
        </div>
        <div className={`${ROUTE_ROW} bg-surface-3`}>
          <PlatformGlyph id="kick" />
          Kick
          <State tone="warn">
            <i /> {t("benefits.routes.demo.kick.state")}
          </State>
        </div>
      </div>
    </div>
  );
}

export function Benefits({ t }: { t: T }) {
  return (
    <Section id="por-que" tone="paper">
      <Shell>
        <SectionHeading
          tone="paper"
          centered
          kicker={t("benefits.heading.kicker")}
          title={t("benefits.heading.title")}
        >
          {/* Não cita plataforma: a linha de baixo já usa a Kick como exemplo,
              e repetir a mesma piada em três linhas mata as duas. */}
          <p>{t("benefits.heading.subtitle")}</p>
        </SectionHeading>

        <div className="mt-[clamp(52px,6vw,84px)] flex flex-col gap-[clamp(30px,4vw,56px)]">
          <BenefitRow>
            <BenefitCopy
              icon={<RadioIcon />}
              title={t("benefits.routes.title")}
            >
              <p>{t("benefits.routes.body")}</p>
              <BenefitNote>
                <Mascot /> {t("benefits.routes.note")}
              </BenefitNote>
            </BenefitCopy>

            <DemoPanel>
              <DemoLabel>
                <span>{t("benefits.routes.demo.label")}</span>
                <span>{t("benefits.chat.demo.tag")}</span>
              </DemoLabel>
              <RouteFan t={t} />
            </DemoPanel>
          </BenefitRow>

          <BenefitRow brass>
            <BenefitCopy
              tone="brass"
              icon={<ChatIcon />}
              title={t("benefits.chat.title")}
            >
              <p>{t("benefits.chat.body")}</p>
              <BenefitNote>
                <Mascot /> {t("benefits.chat.note")}
              </BenefitNote>
            </BenefitCopy>

            <DemoPanel>
              <DemoLabel>
                <span>{t("benefits.chat.demo.label")}</span>
                <span>{t("benefits.routes.demo.tag")}</span>
              </DemoLabel>
              <div className="flex flex-col gap-2.5">
                <div className={CHAT_LINE}>
                  <PlatformGlyph id="twitch" />
                  <div>
                    <strong>{t("benefits.chat.demo.line1.author")}</strong>
                    <p>{t("benefits.chat.demo.line1.message")}</p>
                  </div>
                </div>
                <div className={CHAT_LINE}>
                  <PlatformGlyph id="youtube" />
                  <div>
                    <strong>{t("benefits.chat.demo.line2.author")}</strong>
                    <p>{t("benefits.chat.demo.line2.message")}</p>
                  </div>
                </div>
                <div className={CHAT_LINE}>
                  <PlatformGlyph id="kick" />
                  <div>
                    <strong>{t("benefits.chat.demo.line3.author")}</strong>
                    <p>{t("benefits.chat.demo.line3.message")}</p>
                  </div>
                </div>
                <div className="flex min-h-[38px] items-center justify-between gap-2.5 rounded-md border-2 border-border-dry px-[11px] text-[0.74rem] font-semibold text-faint-raised">
                  {t("benefits.chat.demo.input.placeholder")}
                  <b className="text-brass">
                    {t("benefits.chat.demo.input.send")}
                  </b>
                </div>
              </div>
            </DemoPanel>
          </BenefitRow>
        </div>
      </Shell>
    </Section>
  );
}
