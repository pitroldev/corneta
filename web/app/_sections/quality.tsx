import { thousandsSep, type Locale, type T } from "@/lib/i18n";
import { CheckIcon } from "../_components/icons";
import { VerticalCrop } from "../_components/crop-picker";
import {
  LiveRoom,
  ReportChart,
  type LiveRoomCopy,
  type ReportChartCopy,
} from "../_components/live-room";
import { QualityDesk, VerticalCopy } from "../_components/quality-desk";
import {
  Checklist,
  Section,
  SectionHeading,
  Shell,
  StatPanel,
  Sticker,
  TwoCol,
} from "../_components/ui";

// Duas seções que andam juntas: a mesa de qualidade (o que cada modo faz) e a
// jornada da live (antes, durante, depois).

export function Quality({ t }: { t: T }) {
  return (
    <Section id="qualidade">
      <Shell>
        <TwoCol
          align="start"
          cols="minmax(0,1fr) minmax(400px,1.05fr)"
          className="gap-[clamp(30px,4vw,56px)]"
        >
          <SectionHeading
            tight
            kicker={t("quality.heading.kicker")}
            title={t("quality.heading.title")}
          >
            <p>{t("quality.heading.body")}</p>
          </SectionHeading>

          <QualityDesk t={t} />
        </TwoCol>

        <TwoCol
          cols="minmax(0,1fr) minmax(340px,0.9fr)"
          className="mt-[clamp(46px,5vw,72px)] gap-[clamp(28px,4vw,52px)] border-t-2 border-border-dry pt-[clamp(40px,5vw,64px)]"
        >
          <VerticalCopy t={t} />
          <VerticalCrop caption={t("replica.crop.caption")} />
        </TwoCol>
      </Shell>
    </Section>
  );
}

// A jornada pousa em PAPEL, então os filetes usam a linha de papel e o texto de
// apoio usa a tinta escura — por isso `tone` aparece nas duas pontas.
const ROW =
  // Colapsa em 860, não em 760: as três colunas somam 710px de mínimo mais os
  // vãos, e a casca em 768px oferece 728. Entre 760 e ~810 a linha estourava
  // 16px — cortados pelo `overflow-x: clip` do body, então sem barra de
  // rolagem pra denunciar. É a largura do CONTEÚDO que manda no ponto de
  // quebra, não o número redondo do tablet.
  "grid items-center gap-[clamp(26px,3.5vw,46px)] border-b-2 border-paper-line py-[clamp(30px,4vw,46px)] max-[860px]:grid-cols-1! max-[860px]:gap-6 " +
  "[&_h3]:text-[clamp(1.6rem,2.4vw,2.3rem)] [&_h3]:tracking-[-0.02em] " +
  "[&_p]:mt-3.5 [&_p]:max-w-[46ch] [&_p]:leading-[1.62] [&_p]:font-medium [&_p]:text-ink-muted";
const COLS_3 =
  "[grid-template-columns:minmax(210px,0.8fr)_minmax(260px,0.95fr)_minmax(240px,0.8fr)]";
const COLS_2 =
  "[grid-template-columns:minmax(260px,0.85fr)_minmax(360px,1.15fr)]";

/** Copy dos dois painéis da jornada, resolvida no SERVIDOR — função não
 *  atravessa a fronteira pro componente animado. Os templates chegam com os
 *  buracos intactos: quem preenche é o cliente, a cada segundo. */
const liveRoomCopy = (t: T, locale: Locale): LiveRoomCopy => ({
  label: t("replica.live.label"),
  tag: t("replica.live.tag"),
  metrics: t("journey.live.metrics"),
  onAir: t("journey.live.onAir"),
  reconnecting: t("journey.live.reconnecting"),
  back: t("journey.live.back"),
  paused: t("journey.live.paused"),
  pausedState: t("journey.live.pausedState"),
  cpu: t("journey.live.cpu"),
  gpu: t("journey.live.gpu"),
  watching: t("journey.watching"),
  hint: t("journey.live.hint"),
  sep: thousandsSep(locale),
});

const reportCopy = (t: T, locale: Locale): ReportChartCopy => ({
  label: t("replica.report.label"),
  tag: t("replica.report.tag"),
  chartAria: t("journey.report.chartAria"),
  scrub: t("journey.report.scrub"),
  hint: t("journey.report.hint"),
  watching: t("journey.watching"),
  peak: t("journey.report.peak"),
  average: t("journey.report.average"),
  messages: t("journey.report.messages"),
  raid: t("journey.report.raid"),
  drop: t("journey.report.drop"),
  sep: thousandsSep(locale),
});

export function Journey({ t, locale }: { t: T; locale: Locale }) {
  return (
    <Section tone="paper-raised">
      <Shell>
        <SectionHeading
          tone="paper"
          kicker={t("quality.journey.kicker")}
          title={t("quality.journey.title")}
        />

        <div className="mt-[clamp(46px,5vw,68px)] flex flex-col border-t-2 border-paper-line">
          <article className={`${ROW} ${COLS_3}`}>
            <div>
              <Sticker className="mb-4">
                {t("quality.journey.before.sticker")}
              </Sticker>
              <h3>{t("quality.journey.before.title")}</h3>
            </div>
            <div>
              <p className="mt-0!">{t("quality.journey.before.body")}</p>
              {/* Sobre papel o visto verde do tema escuro perde contraste;
                  `ok-ink` é o mesmo verde um passo mais fundo. */}
              <Checklist className="[&>li]:text-ink [&_svg]:stroke-ok-ink">
                <li>
                  <CheckIcon /> {t("quality.journey.before.check.upload")}
                </li>
                <li>
                  <CheckIcon /> {t("quality.journey.before.check.obs")}
                </li>
                <li>
                  <CheckIcon /> {t("quality.journey.before.check.checklist")}
                </li>
              </Checklist>
            </div>
            <StatPanel>
              <span>{t("quality.journey.before.stat.label")}</span>
              <div
                className="my-3 mb-2.5 flex h-[46px] items-end gap-[5px] [&>i]:block [&>i]:w-[16%] [&>i]:rounded-t-sm [&>i]:bg-brass [&>i]:opacity-72"
                aria-hidden="true"
              >
                <i className="h-[34%]" />
                <i className="h-[52%]" />
                <i className="h-[68%]" />
                <i className="h-[84%]" />
                <i className="h-full bg-ok! opacity-100!" />
              </div>
              <strong>{t("quality.journey.before.stat.value")}</strong>
              <small>{t("quality.journey.before.stat.caption")}</small>
            </StatPanel>
          </article>

          <article className={`${ROW} ${COLS_2}`}>
            <div>
              <Sticker tone="tomate" className="mb-4">
                {t("quality.journey.during.sticker")}
              </Sticker>
              <h3>{t("quality.journey.during.title")}</h3>
              <p>{t("quality.journey.during.body")}</p>
            </div>
            <LiveRoom copy={liveRoomCopy(t, locale)} />
          </article>

          <article className={`${ROW} ${COLS_2}`}>
            <div>
              <Sticker className="mb-4">
                {t("quality.journey.after.sticker")}
              </Sticker>
              {/* "Junta os dados" é o que qualquer painel de analytics faz. O
                  que só um app que é dono da máquina, do OBS e do envio
                  consegue é CRUZAR os três e dizer a causa. É esse o verbo
                  que a copy precisa carregar. */}
              <h3>{t("quality.journey.after.title")}</h3>
              <p>{t("quality.journey.after.body")}</p>
            </div>
            <ReportChart copy={reportCopy(t, locale)} />
          </article>
        </div>
      </Shell>
    </Section>
  );
}
