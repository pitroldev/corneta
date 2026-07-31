import { ChatHub } from "../_components/chat-hub";
import {
  GaugeIcon,
  InfoIcon,
  LockIcon,
  ShieldIcon,
  VolumeIcon,
} from "../_components/icons";
import {
  BenefitCopy,
  BenefitNote,
  BenefitRow,
  cn,
  Section,
  SectionHeading,
  Shell,
  Sticker,
  TwoCol,
} from "../_components/ui";

export function ChatSection() {
  return (
    <Section id="chat">
      <Shell>
        <TwoCol
          align="start"
          cols="minmax(0,0.92fr) minmax(400px,1.08fr)"
          className="gap-[clamp(30px,4vw,56px)]"
        >
          <SectionHeading
            tight
            kicker="A galera junta"
            title="Ninguém fica falando sozinho numa aba que você não abriu."
          >
            <p>
              Ler, responder e moderar sem trocar de janela. Os alertas das
              plataformas e do Streamlabs no mesmo painel. E um overlay que você
              cola no OBS uma vez e esquece.
            </p>
          </SectionHeading>

          <ChatHub />
        </TwoCol>
      </Shell>
    </Section>
  );
}

/** Interruptor do app, em miniatura. `off` mostra o estado desligado. */
function Toggle({ off = false }: { off?: boolean }) {
  return (
    <span
      className={cn(
        "flex h-[21px] w-[38px] items-center rounded-md p-[3px]",
        off ? "justify-start bg-surface-3" : "justify-end bg-brass",
      )}
      aria-hidden="true"
    >
      <i
        className={cn("size-3.5 rounded-sm", off ? "bg-faint" : "bg-brass-ink")}
      />
    </span>
  );
}

// O cartão de proteção pousa em papel, então declara tinta clara. O custo fica
// colado no rodapé (`mt-auto`) pra os três cartões alinharem embaixo, e o ícone
// é absoluto pra a frase não virar item de flex e se espremer numa coluna.
const GUARD =
  "flex flex-col rounded-lg bg-surface p-[clamp(20px,2.4vw,28px)] text-cream shadow-pop-lg " +
  "[&_h3]:text-[1.28rem] [&_h3]:leading-[1.1] " +
  "[&>p]:text-[0.9rem] [&>p]:leading-[1.55] [&>p]:font-[550] [&>p]:text-muted";
const GUARD_HEAD =
  "mb-3.5 flex items-center gap-[11px] " +
  "[&>i]:grid [&>i]:size-10 [&>i]:shrink-0 [&>i]:-rotate-3 [&>i]:place-items-center [&>i]:rounded-md [&>i]:bg-surface-2 [&>i]:text-brass " +
  "[&_svg]:h-[21px] [&_svg]:w-[21px] [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:[stroke-linecap:round] [&_svg]:[stroke-linejoin:round] [&_svg]:[stroke-width:2.2]";
const GUARD_COST =
  "relative mt-auto pt-[15px] pl-[23px] text-[0.74rem] leading-[1.4] font-bold text-faint-raised " +
  "[&>svg]:absolute [&>svg]:top-4 [&>svg]:left-0 [&>svg]:h-[15px] [&>svg]:w-[15px] [&>svg]:fill-current";
const GUARD_SWITCH =
  "mt-[15px] flex items-center gap-[9px] text-[0.7rem] font-extrabold tracking-[0.06em] text-muted uppercase";

export function Protection() {
  return (
    <Section id="protecao" tone="paper">
      <Shell>
        <SectionHeading
          tone="paper"
          kicker="Rede de proteção"
          title="Sua live não devia acabar porque o OBS travou."
        >
          <p>
            Quatro redes que você liga (ou não) nas Configurações. Cada uma tem
            um custo — e a Corneta conta ele antes, não no meio da live.
          </p>
        </SectionHeading>

        <div className="mt-[clamp(52px,6vw,84px)] flex flex-col gap-[clamp(30px,4vw,56px)]">
          <BenefitRow>
            <BenefitCopy
              icon={<ShieldIcon />}
              title="“JÁ VOLTO”: o sinal cai, a live continua"
            >
              <p>
                Se o OBS cair no meio da transmissão, esta tela entra no ar sem
                derrubar as plataformas — pro espectador a live nem pisca, e
                volta sozinha quando o sinal retorna. Também serve pra pausa
                manual: um clique e você sai da cadeira com o microfone mudo.
              </p>
              <BenefitNote>
                <InfoIcon /> Use o slate da Corneta ou a sua imagem ou vídeo
              </BenefitNote>
            </BenefitCopy>

            {/* Mesma arte que o app coloca no ar. */}
            <div
              className="grid min-h-[218px] place-content-center justify-items-center rounded-lg bg-[#14100a] bg-[image:var(--halftone-dark)] bg-[length:22px_22px] px-5 py-6.5 text-center text-cream shadow-pop-ink-lg"
              aria-label="Tela JÁ VOLTO que a Corneta coloca no ar"
            >
              <small className="font-display text-[0.74rem] font-bold tracking-[0.14em] text-brass">
                CORNETA · MULTI-STREAM
              </small>
              <strong className="mt-3.5 rotate-[-1.7deg] bg-brass px-[0.16em] pt-[0.02em] pb-[0.08em] font-display text-[clamp(2.1rem,4vw,2.9rem)] leading-none font-extrabold text-brass-ink shadow-[6px_6px_0_0_var(--night)]">
                JÁ VOLTO
              </strong>
              <p className="mt-5.5 text-[0.82rem] font-medium text-muted">
                já já tô de volta — segura a corneta 📣
              </p>
            </div>
          </BenefitRow>
        </div>

        <div className="mt-[clamp(44px,5vw,68px)] grid grid-cols-3 gap-[clamp(16px,2vw,22px)] max-[980px]:grid-cols-1">
          <div className={GUARD}>
            <div className={GUARD_HEAD}>
              <i>
                <GaugeIcon />
              </i>
              <h3>Auto-bitrate</h3>
            </div>
            <p>
              Se a sua internet engasgar, a Corneta baixa a qualidade do vídeo
              por um tempo em vez de deixar a live travar ou cair — e volta ao
              normal sozinha.
            </p>
            <span className={GUARD_COST}>
              <InfoIcon /> Age nas plataformas que estão convertendo; quem vai
              na cópia sai do jeito que o OBS mandou.
            </span>
            <span className={GUARD_SWITCH}>
              <Toggle />
              ligado por padrão
            </span>
          </div>

          <div className={GUARD}>
            <div className={GUARD_HEAD}>
              <i>
                <LockIcon />
              </i>
              <h3>Guardião de privacidade</h3>
            </div>
            <p>
              Você lista os termos que não podem vazar — e-mail, nome real,
              endereço. Se um deles aparece na tela, a Corneta corta pro “JÁ
              VOLTO” antes de ir ao ar.
            </p>
            <span className={GUARD_COST}>
              <InfoIcon /> Custa 12s de atraso na live inteira (o chat também).
              Rede de segurança, não garantia.
            </span>
            <span className={GUARD_SWITCH}>
              <Sticker tone="tomate">experimental</Sticker>
            </span>
          </div>

          <div className={GUARD}>
            <div className={GUARD_HEAD}>
              <i>
                <VolumeIcon />
              </i>
              <h3>Normalizador de áudio</h3>
            </div>
            <p>
              A Corneta acerta o volume do seu som antes de enviar — sem “tá
              baixo” do chat nem estouro na troca de cena, no mesmo encode que
              já estava rodando.
            </p>
            <span className={GUARD_COST}>
              <InfoIcon /> Se você já normaliza no OBS, deixe desligado pra não
              brigar com ele.
            </span>
            <span className={GUARD_SWITCH}>
              <Toggle off />
              opcional
            </span>
          </div>
        </div>
      </Shell>
    </Section>
  );
}
