import { CheckIcon } from "../_components/icons";
import { VerticalCrop } from "../_components/crop-picker";
import { LiveRoom, ReportChart } from "../_components/live-room";
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

export function Quality() {
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
            kicker="Quanto capricho na imagem"
            title="Uma imagem pra todas ou uma pra cada. Sem adivinhar o preço."
          >
            <p>
              Sua live pode sair caprichada em toda plataforma sem fritar o PC —
              mas isso é uma escolha, e ela custa internet e placa de vídeo.
              Você vê essa conta antes de entrar no ar, não no meio dela. Veja o
              que muda em cada modo:
            </p>
          </SectionHeading>

          <QualityDesk />
        </TwoCol>

        <TwoCol
          cols="minmax(0,1fr) minmax(340px,0.9fr)"
          className="mt-[clamp(46px,5vw,72px)] gap-[clamp(28px,4vw,52px)] border-t-2 border-border-dry pt-[clamp(40px,5vw,64px)]"
        >
          <VerticalCopy />
          <VerticalCrop />
        </TwoCol>
      </Shell>
    </Section>
  );
}

// A jornada pousa em PAPEL, então os filetes usam a linha de papel e o texto de
// apoio usa a tinta escura — por isso `tone` aparece nas duas pontas.
const ROW =
  "grid items-center gap-[clamp(26px,3.5vw,46px)] border-b-2 border-paper-line py-[clamp(30px,4vw,46px)] max-[760px]:grid-cols-1! max-[760px]:gap-6 " +
  "[&_h3]:text-[clamp(1.6rem,2.4vw,2.3rem)] [&_h3]:tracking-[-0.02em] " +
  "[&_p]:mt-3.5 [&_p]:max-w-[46ch] [&_p]:leading-[1.62] [&_p]:font-medium [&_p]:text-ink-muted";
const COLS_3 =
  "[grid-template-columns:minmax(210px,0.8fr)_minmax(260px,0.95fr)_minmax(240px,0.8fr)]";
const COLS_2 =
  "[grid-template-columns:minmax(260px,0.85fr)_minmax(360px,1.15fr)]";

export function Journey() {
  return (
    <Section tone="paper-raised">
      <Shell>
        <SectionHeading
          tone="paper"
          kicker="Um app para a live inteira"
          title="Antes, durante e depois. Sem trocar de bancada."
        />

        <div className="mt-[clamp(46px,5vw,68px)] flex flex-col border-t-2 border-paper-line">
          <article className={`${ROW} ${COLS_3}`}>
            <div>
              <Sticker className="mb-4">Antes da live</Sticker>
              <h3>Prepare sem medo de esquecer alguma coisa.</h3>
            </div>
            <div>
              <p className="mt-0!">
                Ligue as plataformas, meça seu upload e deixe tudo pronto com
                poucos cliques. No OBS, a Corneta configura sozinha — e ainda dá
                play nele quando você aperta o BORA.
              </p>
              {/* Sobre papel o visto verde do tema escuro perde contraste;
                  `ok-ink` é o mesmo verde um passo mais fundo. */}
              <Checklist className="[&>li]:text-ink [&_svg]:stroke-ok-ink">
                <li>
                  <CheckIcon /> Teste de upload de verdade
                </li>
                <li>
                  <CheckIcon /> Configuração guiada do OBS
                </li>
                <li>
                  <CheckIcon /> Checklist da primeira live
                </li>
              </Checklist>
            </div>
            <StatPanel>
              <span>seu upload · exemplo</span>
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
              <strong>25 Mb/s</strong>
              <small>dá pra três plataformas com folga</small>
            </StatPanel>
          </article>

          <article className={`${ROW} ${COLS_2}`}>
            <div>
              <Sticker tone="tomate" className="mb-4">
                Durante a live
              </Sticker>
              <h3>Veja o que importa sem sair do seu conteúdo.</h3>
              <p>
                Bitrate, fps, quadros perdidos e tempo no ar de cada plataforma,
                mais CPU e placa de verdade. Dá pra pausar uma sem encerrar as
                outras — e quem cai volta sozinha.
              </p>
            </div>
            <LiveRoom />
          </article>

          <article className={`${ROW} ${COLS_2}`}>
            <div>
              <Sticker className="mb-4">Depois da live</Sticker>
              <h3>Entenda o que aconteceu e melhore a próxima.</h3>
              <p>
                O relatório fica no seu PC e junta audiência, movimento do chat,
                alertas, momentos marcados e os trechos em que o sinal sofreu —
                com um veredito honesto no fim.
              </p>
            </div>
            <ReportChart />
          </article>
        </div>
      </Shell>
    </Section>
  );
}
