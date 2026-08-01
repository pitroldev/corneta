import type { T } from "@/lib/i18n";
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

export function ChatSection({ t }: { t: T }) {
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
            kicker={t("protection.chat.kicker")}
            title={t("protection.chat.title")}
          >
            <p>{t("protection.chat.body")}</p>
          </SectionHeading>

          <ChatHub t={t} />
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
  "[&>svg]:absolute [&>svg]:top-4 [&>svg]:left-0 [&>svg]:h-[15px] [&>svg]:w-[15px] [&>svg]:fill-none [&>svg]:stroke-current";
const GUARD_SWITCH =
  "mt-[15px] flex items-center gap-[9px] text-[0.7rem] font-extrabold tracking-[0.06em] text-muted uppercase";

export function Protection({ t }: { t: T }) {
  return (
    <Section id="protecao" tone="paper">
      <Shell>
        <SectionHeading
          tone="paper"
          kicker={t("protection.kicker")}
          title={t("protection.title")}
        >
          <p>{t("protection.body")}</p>
        </SectionHeading>

        <div className="mt-[clamp(52px,6vw,84px)] flex flex-col gap-[clamp(30px,4vw,56px)]">
          <BenefitRow>
            <BenefitCopy
              icon={<ShieldIcon />}
              title={t("protection.brb.title")}
            >
              <p>{t("protection.brb.body")}</p>
              <BenefitNote>
                <InfoIcon /> {t("protection.brb.note")}
              </BenefitNote>
            </BenefitCopy>

            {/* Mesma arte que o app coloca no ar. */}
            <div
              className="grid min-h-[218px] place-content-center justify-items-center rounded-lg bg-[#14100a] bg-[image:var(--halftone-dark)] bg-[length:22px_22px] px-5 py-6.5 text-center text-cream shadow-pop-ink-lg"
              aria-label={t("protection.brb.art.aria")}
            >
              <small className="font-display text-[0.74rem] font-bold tracking-[0.14em] text-brass">
                {t("protection.brb.art.brand")}
              </small>
              <strong className="mt-3.5 rotate-[-1.7deg] bg-brass px-[0.16em] pt-[0.02em] pb-[0.08em] font-display text-[clamp(2.1rem,4vw,2.9rem)] leading-none font-extrabold text-brass-ink shadow-[6px_6px_0_0_var(--night)]">
                {t("protection.brb.art.title")}
              </strong>
              <p className="mt-5.5 text-[0.82rem] font-medium text-muted">
                {t("protection.brb.art.line")}
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
              <h3>{t("protection.guard.bitrate.title")}</h3>
            </div>
            <p>{t("protection.guard.bitrate.body")}</p>
            <span className={GUARD_COST}>
              <InfoIcon /> {t("protection.guard.bitrate.cost")}
            </span>
            <span className={GUARD_SWITCH}>
              <Toggle />
              {t("protection.guard.bitrate.switch")}
            </span>
          </div>

          <div className={GUARD}>
            <div className={GUARD_HEAD}>
              <i>
                <VolumeIcon />
              </i>
              <h3>{t("protection.guard.audio.title")}</h3>
            </div>
            <p>{t("protection.guard.audio.body")}</p>
            <span className={GUARD_COST}>
              <InfoIcon /> {t("protection.guard.audio.cost")}
            </span>
            <span className={GUARD_SWITCH}>
              <Toggle off />
              {t("protection.guard.audio.switch")}
            </span>
          </div>

          {/* O guardião fecha a fileira porque é o único EXPERIMENTAL dela — a
              mesma ordem que a aba de Segurança do app usa. No meio, ele
              emprestava a hesitação dele às duas redes que já estão prontas. */}
          <div className={GUARD}>
            <div className={GUARD_HEAD}>
              <i>
                <LockIcon />
              </i>
              <h3>{t("protection.guard.privacy.title")}</h3>
            </div>
            <p>{t("protection.guard.privacy.body")}</p>
            <span className={GUARD_COST}>
              <InfoIcon /> {t("protection.guard.privacy.cost")}
            </span>
            <span className={GUARD_SWITCH}>
              <Sticker tone="tomate">
                {t("protection.guard.privacy.switch")}
              </Sticker>
            </span>
          </div>
        </div>
      </Shell>
    </Section>
  );
}
