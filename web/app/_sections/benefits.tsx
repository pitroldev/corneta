import type { T } from "@/lib/i18n";
import { Mascot, PlatformGlyph } from "../_components/decor";
import { RouteFan } from "../_components/route-fan";
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
} from "../_components/ui";

// "Por que" — duas linhas largas de benefício, nunca grade de cards. Cada uma
// traz a cópia de um lado e uma demonstração real do app do outro.

const CHAT_LINE =
  "grid grid-cols-[26px_1fr] items-center gap-2.5 rounded-md bg-surface-2 px-2.5 py-[9px] " +
  "[&_.glyph]:h-[26px] [&_.glyph]:w-[26px] " +
  "[&_strong]:block [&_strong]:text-[0.6rem] [&_strong]:font-extrabold [&_strong]:tracking-[0.06em] [&_strong]:text-faint-raised [&_strong]:uppercase " +
  "[&_p]:mt-0.5 [&_p]:text-[0.84rem] [&_p]:font-semibold";

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
              <RouteFan
                copy={{
                  live: t("preview.state.live"),
                  down: t("after.frame.reconnect"),
                  hint: t("benefits.routes.demo.hint"),
                }}
              />
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
