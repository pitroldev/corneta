import Link from "next/link";
import { ACCOUNT_SCOPES, STEPS } from "@/lib/content";
import { LEGAL_ROUTES } from "@/lib/legal";
import { Mascot, PlatformGlyph } from "../_components/decor";
import { CheckIcon, LockIcon, RadioIcon } from "../_components/icons";
import {
  Checklist,
  HonestNote,
  Proof,
  Section,
  SectionHeading,
  Shell,
  TwoCol,
} from "../_components/ui";

// Três passos, o argumento do "roda no seu PC", os destinos e as permissões de
// conta. São as seções de meio de página, todas de leitura corrida.

// Os filetes de 3px em tinta escura são o que dá o ar de tabela impressa; a
// numeração é um bloco torto de latão, como no app.
const STEPS_LIST =
  "m-0 list-none border-t-[3px] border-ink p-0 " +
  "[&>li]:grid [&>li]:grid-cols-[52px_1fr] [&>li]:items-start [&>li]:gap-5 [&>li]:border-b-[3px] [&>li]:border-ink [&>li]:py-6.5 " +
  "[&>li>b]:grid [&>li>b]:size-[46px] [&>li>b]:rotate-[-2.4deg] [&>li>b]:place-items-center [&>li>b]:rounded-md [&>li>b]:bg-brass [&>li>b]:font-display [&>li>b]:text-[1.35rem] [&>li>b]:font-extrabold [&>li>b]:text-brass-ink [&>li>b]:shadow-pop-ink " +
  "[&_h3]:text-[clamp(1.42rem,2.2vw,1.9rem)] [&_h3]:leading-[1.1] " +
  "[&_p]:mt-1.5 [&_p]:max-w-[54ch] [&_p]:leading-[1.6] [&_p]:font-medium [&_p]:text-ink-muted " +
  "[&_em]:mt-3 [&_em]:inline-flex [&_em]:rotate-[-1.5deg] [&_em]:items-center [&_em]:gap-[7px] [&_em]:rounded-sm [&_em]:bg-tomate [&_em]:px-[9px] [&_em]:py-[5px] [&_em]:font-display [&_em]:text-[0.86rem] [&_em]:font-extrabold [&_em]:text-brass-ink [&_em]:not-italic [&_em]:shadow-[3px_3px_0_0_var(--ink)] " +
  "[&_em>svg]:h-[15px] [&_em>svg]:w-[15px] [&_em>svg]:fill-current";

export function Steps() {
  return (
    <Section id="como-funciona" tone="paper-raised">
      <Shell>
        <TwoCol
          align="start"
          cols="minmax(0,0.86fr) minmax(400px,1.14fr)"
          className="gap-[clamp(44px,7vw,100px)]"
        >
          <SectionHeading
            tight
            tone="paper"
            kicker="Do seu programa pro público"
            title="Você entra ao vivo em três passos."
          >
            <p>
              Sem terminal, sem Docker, sem endereço de servidor pra decorar.
            </p>
          </SectionHeading>

          <ol className={STEPS_LIST}>
            {STEPS.map((step, i) => (
              <li key={step.title}>
                <b>{i + 1}</b>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                  {i === STEPS.length - 1 && (
                    <em>
                      <RadioIcon /> BORA AO VIVO
                    </em>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </TwoCol>
      </Shell>
    </Section>
  );
}

export function Local() {
  return (
    <Section>
      <Shell>
        <TwoCol
          align="stretch"
          cols="minmax(0,1.18fr) minmax(310px,0.82fr)"
          className="gap-[clamp(38px,5vw,58px)]"
        >
          <div>
            <SectionHeading
              kicker="Roda no seu PC, de verdade"
              title="Não tem mensalidade porque não tem servidor nosso no meio."
            >
              <p className="max-w-[60ch]!">
                O trabalho pesado acontece na máquina que já tá transmitindo.
                Ajustes, chaves e relatórios ficam com você — e até o overlay do
                OBS é um servidor que só responde dentro do seu computador.
              </p>
            </SectionHeading>

            <Checklist row className="mt-6.5">
              <li>
                <CheckIcon /> Grátis, sem cadastro
              </li>
              <li>
                <CheckIcon /> Código aberto com licença MIT
              </li>
              <li>
                <CheckIcon /> Chaves no cofre do Windows
              </li>
              <li>
                <CheckIcon /> Sem marca-d&apos;água
              </li>
            </Checklist>

            <Proof>
              <LockIcon />
              <span>
                Código aberto: dá pra abrir o repositório e ver exatamente o que
                o app faz com a sua chave.{" "}
                <a
                  href="https://github.com/pitroldev"
                  rel="noreferrer noopener"
                  target="_blank"
                >
                  Ver o código
                </a>
              </span>
            </Proof>
          </div>

          <HonestNote>
            <span>
              <Mascot /> A conta honesta
            </span>
            <h3>Cada plataforma come um pedaço do seu upload.</h3>
            <p>
              E melhorar a imagem pra cada uma pesa na placa ou no processador.
              A Corneta mede sua conexão, soma tudo e te mostra a conta antes da
              live — não no meio dela.
            </p>
          </HonestNote>
        </TwoCol>
      </Shell>
    </Section>
  );
}

const DEST =
  "grid grid-cols-[38px_minmax(0,1fr)] items-center gap-3 rounded-md bg-surface-2 px-[13px] py-3 " +
  "[&_.glyph]:h-[38px] [&_.glyph]:w-[38px] " +
  "[&_strong]:block [&_strong]:font-display [&_strong]:text-[0.98rem] [&_strong]:leading-[1.1] [&_strong]:font-bold " +
  "[&_p]:mt-[3px] [&_p]:text-[0.74rem] [&_p]:leading-[1.35] [&_p]:font-[550] [&_p]:text-faint-raised";
const DEST_NOTE =
  "mt-[18px] border-t-2 border-border-soft pt-4 text-[0.8rem] leading-[1.55] font-[550] text-muted " +
  "[&_strong]:font-[750] [&_strong]:text-cream " +
  "[&+&]:mt-2.5 [&+&]:border-t-0 [&+&]:pt-0";

const ACCOUNT =
  "flex flex-col rounded-lg bg-surface bg-[image:var(--halftone-dark)] bg-[length:18px_18px] p-[clamp(20px,2.4vw,26px)] text-cream shadow-pop-ink-lg " +
  "[&_p]:text-[0.86rem] [&_p]:leading-[1.55] [&_p]:font-medium [&_p]:text-muted " +
  "[&_p+p]:mt-3 [&_b]:font-[750] [&_b]:text-cream";

export function Platforms({
  destinations,
}: {
  destinations: readonly { id: string; name: string; note: string }[];
}) {
  return (
    <Section id="plataformas" tone="paper">
      <Shell>
        <TwoCol
          cols="minmax(0,1fr) minmax(430px,1.02fr)"
          className="gap-[clamp(40px,5vw,72px)]"
        >
          <SectionHeading
            tight
            tone="paper"
            kicker="Do seu canal pra todo lugar"
            title="As quatro grandes prontas, e o resto por sua conta."
          >
            <p>
              As quatro grandes já vêm prontas, com o endereço de cada uma
              preenchido. Some quantas quiser — inclusive qualquer servidor RTMP
              que não esteja nesta lista.
            </p>
          </SectionHeading>

          <div className="rounded-xl bg-surface bg-[image:var(--halftone-dark)] bg-[length:20px_20px] p-5.5 text-cream shadow-pop-ink-lg max-[980px]:max-w-[720px]">
            <div className="grid grid-cols-2 gap-[9px] max-[760px]:grid-cols-1">
              {destinations.map((destination) => (
                <article className={DEST} key={destination.name}>
                  <PlatformGlyph id={destination.id as never} />
                  <div>
                    <strong>{destination.name}</strong>
                    <p>{destination.note}</p>
                  </div>
                </article>
              ))}
            </div>

            <p className={DEST_NOTE}>
              <strong>TikTok, Instagram e X são experimentais.</strong> A
              entrada depende de liberação e de fluxos das próprias plataformas,
              então podem simplesmente não funcionar para a sua conta.
            </p>
            <p className={DEST_NOTE}>
              Até aqui, a Twitch é a plataforma com transmissão real documentada
              de ponta a ponta. As outras estão implementadas no app e seguem em
              validação pública.
            </p>
          </div>
        </TwoCol>

        <Shell className="w-full!" as="div">
          <div id="contas">
            <SectionHeading
              tone="paper"
              kicker="Entrar com a sua conta"
              title="O que a Corneta pede — e o que ela faz com isso."
              className="mt-[clamp(56px,7vw,96px)] max-w-[720px]! border-t-2 border-paper-line pt-[clamp(40px,5vw,64px)]"
            >
              <p>
                Dá pra usar só colando a chave de transmissão. Mas se você
                conectar a conta, o app faz o trabalho chato sozinho: cria a
                live, pega a chave e traz o chat. Aqui está exatamente o que
                cada permissão serve.
              </p>
            </SectionHeading>

            <div className="mt-[clamp(32px,4vw,48px)] grid grid-cols-3 gap-[clamp(14px,2vw,20px)] max-[980px]:grid-cols-1">
              {ACCOUNT_SCOPES.map((account) => (
                <article className={ACCOUNT} key={account.platform}>
                  <div className="mb-4 grid grid-cols-[40px_minmax(0,1fr)] items-center gap-3 [&_.glyph]:h-10 [&_.glyph]:w-10">
                    <PlatformGlyph id={account.platform} />
                    <div>
                      <strong className="block font-display text-[1.06rem] leading-[1.15] font-bold">
                        {account.title}
                      </strong>
                      <small className="mt-[3px] block text-[0.72rem] font-bold text-brass">
                        {account.permission}
                      </small>
                    </div>
                  </div>
                  <p>
                    <b>Pra quê:</b> {account.why}
                  </p>
                  <p className="mt-auto! border-t-2 border-border-soft pt-3.5 text-[0.8rem]! text-faint-raised!">
                    <b>O que não acontece:</b> {account.never}
                  </p>
                </article>
              ))}
            </div>

            <p className="mt-[clamp(22px,2.5vw,30px)] flex max-w-[90ch] items-start gap-3 text-[0.9rem] leading-[1.6] font-medium text-ink-muted [&>svg]:mt-px [&>svg]:h-[19px] [&>svg]:w-[19px] [&>svg]:shrink-0 [&>svg]:fill-none [&>svg]:stroke-current [&>svg]:text-tomate-ink [&>svg]:[stroke-linecap:round] [&>svg]:[stroke-linejoin:round] [&>svg]:[stroke-width:2.2] [&_a]:font-[750] [&_a]:text-tomate-ink [&_a]:underline [&_a]:decoration-2 [&_a]:underline-offset-[3px]">
              <LockIcon />
              <span>
                Os tokens de acesso ficam no cofre de credenciais do Windows, na
                sua máquina — não em servidor nosso, porque não existe conta
                Corneta nem banco de dados de usuário. Dá pra revogar o acesso a
                qualquer momento na própria plataforma, e desinstalar o app
                apaga o que ficou no cofre. Os detalhes estão na{" "}
                <Link href={LEGAL_ROUTES.privacy}>política de privacidade</Link>
                .
              </span>
            </p>
          </div>
        </Shell>
      </Shell>
    </Section>
  );
}
