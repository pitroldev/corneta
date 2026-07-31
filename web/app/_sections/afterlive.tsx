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

// "Depois que a corneta cala" — a metade do produto que a página não mostrava.
//
// A LP inteira conta a live até o BORA. Mas o que a Corneta faz DEPOIS é o que
// nenhuma outra ferramenta faz: ela guarda o vídeo do que foi ao ar e o gráfico
// da transmissão no mesmo relógio, então "travou às 23:40" deixa de ser um número
// e vira um clique. Sem esta seção, o recurso mais próprio do produto existia só
// como uma linha solta na meta description.
//
// Fica no palco escuro entre duas faixas de papel (proteção → aqui → como
// funciona): quebra a sequência clara e dá o breu que um quadro de vídeo pede.

/** Quantas falas cada momento mostra. Casa com a lista de quem falou no
 *  componente — se um dia crescer lá, cresce aqui. */
const LINES: Record<MomentId, number> = { chat: 7, queda: 5, brb: 5 };

/** Resolve a copy da demonstração no SERVIDOR.
 *
 *  O `t` não atravessa a fronteira pro componente cliente (função não serializa),
 *  então a peça recebe texto pronto. É o mesmo contrato do editor de recorte. */
function momentCopy(t: T, id: MomentId): MomentCopy {
  return {
    tab: t(`after.moment.${id}.tab` as MessageKey),
    title: t(`after.moment.${id}.title` as MessageKey),
    finding: t(`after.moment.${id}.finding` as MessageKey),
    reading: t(`after.moment.${id}.reading` as MessageKey),
    lines: Array.from({ length: LINES[id] }, (_, i) =>
      t(`after.moment.${id}.chat.${i + 1}` as MessageKey),
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
  // O slate reusa a copy da seção de proteção: é a MESMA tela indo ao ar, e duas
  // chaves para o mesmo texto acabariam divergindo na primeira revisão.
  slateBrand: t("protection.brb.art.brand"),
  slateTitle: t("protection.brb.art.title"),
  moments: {
    chat: momentCopy(t, "chat"),
    queda: momentCopy(t, "queda"),
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

        {/* O que mais vem no relatório. Lista em linha, não grade de cartões:
            são fatos curtos, e cada um viraria um cartão vazio com dois terços
            de espaço em branco. */}
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

        {/* A Regra do Custo Visível: a gravação é o recurso mais caro em disco
            do app, e vender isso sem o preço seria o oposto do tom da marca. */}
        <p className="mt-6 flex max-w-[64ch] items-start gap-2.5 border-t-2 border-border-dry pt-5 text-[0.84rem] leading-[1.55] font-[550] text-faint-raised [&>svg]:mt-px [&>svg]:h-[17px] [&>svg]:w-[17px] [&>svg]:shrink-0 [&>svg]:fill-current [&>svg]:text-brass">
          <InfoIcon />
          <span>{t("after.cost")}</span>
        </p>
      </Shell>
    </Section>
  );
}
