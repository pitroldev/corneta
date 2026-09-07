import type { MessageKey, T } from "@/lib/i18n";
import {
  ReplayScope,
  type MomentCopy,
  type MomentId,
  type ReplayCopy,
} from "../_components/replay-scope";
import { CheckIcon, InfoIcon, ReportIcon } from "../_components/icons";
import {
  Checklist,
  Proof,
  Section,
  SectionHeading,
  Shell,
  Sticker,
} from "../_components/ui";

// Keep these counts aligned with the demonstration's message fixtures.
const LINES: Record<MomentId, number> = { chat: 7, drop: 5, brb: 5 };

function momentCopy(t: T, id: MomentId): MomentCopy {
  const messageId = id === "drop" ? "queda" : id;
  return {
    tab: t(`after.moment.${messageId}.tab` as MessageKey),
    title: t(`after.moment.${messageId}.title` as MessageKey),
    finding: t(`after.moment.${messageId}.finding` as MessageKey),
    reading: t(`after.moment.${messageId}.reading` as MessageKey),
    lines: Array.from({ length: LINES[id] }, (_, i) =>
      t(`after.moment.${messageId}.chat.${i + 1}` as MessageKey),
    ),
  };
}

const replayCopy = (t: T): ReplayCopy => ({
  axis: t("after.scope.axis"),
  seriesPlatforms: t("after.scope.series.platforms"),
  seriesObs: t("after.scope.series.obs"),
  chartAria: t("after.scope.chart.aria"),
  chat: t("after.scope.chat"),
  frameLive: t("after.frame.live"),
  frameReconnect: t("after.frame.reconnect"),
  frameNote: t("after.frame.note"),
  preview: t("preview.badge"),
  play: t("after.scope.play"),
  pause: t("after.scope.pause"),
  scrub: t("after.scope.scrub"),
  hint: t("after.scope.hint"),
  slateBrand: t("protection.brb.art.brand"),
  slateTitle: t("protection.brb.art.title"),
  moments: {
    chat: momentCopy(t, "chat"),
    drop: momentCopy(t, "drop"),
    brb: momentCopy(t, "brb"),
  },
});

export function AfterLive({ t }: { t: T }) {
  return (
    <Section id="depois" tone="dark">
      <Shell>
        <SectionHeading
          kicker={
            <>
              {t("after.kicker")}
              <Sticker className="ml-1">{t("after.badge")}</Sticker>
            </>
          }
          title={t("after.title")}
        >
          <p>{t("after.body")}</p>
        </SectionHeading>

        <div className="mt-[clamp(34px,4.5vw,54px)]">
          <ReplayScope copy={replayCopy(t)} />
        </div>

        <Proof>
          <ReportIcon />
          <span>{t("after.proof")}</span>
        </Proof>

        <Checklist row className="mt-6 gap-x-7 [&>li]:text-[0.86rem]">
          <li>
            <CheckIcon /> {t("after.more.channels")}
          </li>
          <li>
            <CheckIcon /> {t("after.more.export")}
          </li>
          <li>
            <CheckIcon /> {t("after.more.compare")}
          </li>
          <li>
            <CheckIcon /> {t("after.more.clip")}
          </li>
        </Checklist>

        <p className="mt-6 flex max-w-[64ch] items-start gap-2.5 border-t-2 border-border-dry pt-5 text-[0.84rem] leading-[1.55] font-[550] text-faint-raised [&>svg]:mt-px [&>svg]:h-[17px] [&>svg]:w-[17px] [&>svg]:shrink-0 [&>svg]:fill-none [&>svg]:stroke-current [&>svg]:text-brass">
          <InfoIcon />
          <span>{t("after.cost")}</span>
        </p>
      </Shell>
    </Section>
  );
}
