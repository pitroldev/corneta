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

const ROW =
  // Collapse before the content's minimum column widths exceed the available container width.
  "grid items-center gap-[clamp(26px,3.5vw,46px)] border-b-2 border-paper-line py-[clamp(30px,4vw,46px)] max-[860px]:grid-cols-1! max-[860px]:gap-6 " +
  "[&_h3]:text-[clamp(1.6rem,2.4vw,2.3rem)] [&_h3]:tracking-[-0.02em] " +
  "[&_p]:mt-3.5 [&_p]:max-w-[46ch] [&_p]:leading-[1.62] [&_p]:font-medium [&_p]:text-ink-muted";
const COLS_3 =
  "[grid-template-columns:minmax(210px,0.8fr)_minmax(260px,0.95fr)_minmax(240px,0.8fr)]";
const COLS_2 =
  "[grid-template-columns:minmax(260px,0.85fr)_minmax(360px,1.15fr)]";

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
              <Sticker tone="tomato" className="mb-4">
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
