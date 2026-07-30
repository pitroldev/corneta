import type { Metadata } from "next";
import Link from "next/link";
import {
  Callout,
  Contact,
  LegalFoot,
  LegalHero,
  LegalSection,
  LegalTldr,
  LegalToc,
  Todo,
} from "../_components/legal-chrome";
import {
  LEGAL_AUTHOR,
  LEGAL_CNPJ,
  LEGAL_OPERATOR,
  LEGAL_ROUTES,
  LEGAL_UPDATED_LABEL,
  LEGAL_VENUE,
} from "@/lib/legal";
import { jsonLdScript, legalJsonLd } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Termos de uso",
  description:
    "As regras de uso da Corneta: licença MIT, componentes de terceiros, responsabilidades de quem transmite, recursos experimentais e limites de garantia.",
  alternates: { canonical: LEGAL_ROUTES.terms },
  openGraph: {
    title: "Termos de uso — Corneta",
    description:
      "Licença, responsabilidades de quem transmite, recursos experimentais e limites de garantia.",
    url: LEGAL_ROUTES.terms,
  },
};

const sections = [
  { id: "aceitacao", title: "Aceitação destes termos" },
  { id: "oque-e", title: "O que a Corneta é (e o que não é)" },
  { id: "licenca", title: "Licença de uso do software" },
  { id: "terceiros", title: "Componentes de terceiros" },
  { id: "login", title: "Serviço de login" },
  { id: "responsabilidades", title: "Suas responsabilidades" },
  { id: "plataformas", title: "Regras das plataformas" },
  { id: "experimental", title: "Recursos experimentais" },
  { id: "requisitos", title: "Requisitos e desempenho" },
  { id: "garantia", title: "Ausência de garantia" },
  { id: "responsabilidade", title: "Limitação de responsabilidade" },
  { id: "marcas", title: "Marcas e não afiliação" },
  { id: "mudancas", title: "Mudanças no software e nos termos" },
  { id: "encerramento", title: "Encerramento" },
  { id: "lei", title: "Lei aplicável e foro" },
  { id: "contato", title: "Contato" },
];

export default function TermsPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(legalJsonLd("terms")) }}
      />

      <LegalHero
        kicker="Termos de uso"
        title="As regras do jogo, em português de gente."
        intro="A Corneta é software livre que roda na sua máquina. Estes termos dizem o que você pode fazer com ela, o que é responsabilidade sua ao transmitir, e até onde vai a nossa — sem letrinha miúda."
        version="1.0"
      />

      <div className="shell legal-layout">
        <LegalToc sections={sections} />

        <div className="legal-body">
          <LegalTldr
            points={[
              "O núcleo da Corneta é open source sob licença MIT: pode usar, estudar, modificar e distribuir.",
              "Não cobramos assinatura e não há conta para criar; o app roda no seu computador.",
              "Você continua responsável pelo que transmite e por seguir as regras de cada plataforma.",
              "Recursos marcados como experimentais podem falhar; o Guardião é rede de segurança, não garantia.",
              "O software é oferecido “como está”, sem garantia — mas os seus direitos de consumidor continuam valendo.",
            ]}
            note="Este resumo é uma cortesia de leitura e não substitui o texto completo abaixo."
          />

          <LegalSection id="aceitacao" n={1} title="Aceitação destes termos">
            <p>
              Estes termos regem o uso do aplicativo Corneta, deste site e do serviço
              de login descrito abaixo, todos oferecidos por{" "}
              <strong>{LEGAL_OPERATOR}</strong>, inscrita no CNPJ sob o nº{" "}
              <strong>{LEGAL_CNPJ}</strong>. Ao baixar, instalar ou usar a Corneta,
              você concorda com eles. Se não concordar, não instale o aplicativo — e,
              se já tiver instalado, desinstale.
            </p>
            <p>
              Se você usa a Corneta em nome de uma empresa, canal ou equipe, declara ter
              poderes para aceitar estes termos em nome dela. Sendo menor de 18 anos,
              use o aplicativo com a assistência de quem responde legalmente por você.
            </p>
          </LegalSection>

          <LegalSection id="oque-e" n={2} title="O que a Corneta é (e o que não é)">
            <p>
              A Corneta é um aplicativo de desktop que recebe um único sinal de vídeo
              produzido pelo seu OBS e o distribui para vários destinos de transmissão
              ao mesmo tempo, com acompanhamento, chat unificado, alertas, relatórios e
              proteções que rodam na sua própria máquina.
            </p>
            <ul>
              <li>
                <strong>Ela não substitui o OBS.</strong> Cenas, câmera, áudio e
                composição continuam sendo feitos lá.
              </li>
              <li>
                <strong>Ela não é um serviço de relay em nuvem.</strong> Não existe
                servidor nosso intermediando o seu vídeo: quem envia é o seu
                computador, usando o seu upload.
              </li>
              <li>
                <strong>Ela não fornece as plataformas.</strong> Sua conta, seus
                direitos de transmissão e sua reputação em cada serviço são a sua
                relação com aquele serviço.
              </li>
            </ul>
          </LegalSection>

          <LegalSection id="licenca" n={3} title="Licença de uso do software">
            <p>
              O código do núcleo da Corneta é distribuído sob a{" "}
              <strong>licença MIT</strong>, cujo texto acompanha o repositório e o
              instalador, com direitos autorais de <strong>{LEGAL_AUTHOR}</strong>.
              Ela permite usar, copiar, modificar, mesclar, publicar, distribuir,
              sublicenciar e vender cópias do software, desde que o aviso de direitos
              autorais e o aviso de permissão sejam preservados.
            </p>
            <p>
              Em caso de divergência entre estes termos e a licença MIT no que se
              refere ao <em>código</em>, prevalece a licença MIT. Estes termos tratam
              do uso do aplicativo distribuído, do site e do serviço de login.
            </p>
          </LegalSection>

          <LegalSection id="terceiros" n={4} title="Componentes de terceiros">
            <p>
              O instalador embarca programas de terceiros que a Corneta executa como
              processos separados, cada um com a sua própria licença — em especial o{" "}
              <strong>FFmpeg</strong> (build sob GPL) e o <strong>MediaMTX</strong>. A
              licença MIT do nosso código não substitui essas obrigações.
            </p>
            <p>
              Se você redistribuir o instalador ou uma versão modificada, é sua
              responsabilidade cumprir as licenças desses componentes, incluindo a
              publicação dos avisos e do código correspondente quando exigido. Os
              avisos de terceiros acompanham o projeto no arquivo de notices.
            </p>
          </LegalSection>

          <LegalSection id="login" n={5} title="Serviço de login">
            <p>
              Para você entrar com a conta da Kick, o aplicativo usa um serviço mínimo
              hospedado neste domínio, que conclui a troca de credenciais com a
              plataforma. Esse serviço é oferecido gratuitamente, no estado em que se
              encontra, sem compromisso de disponibilidade, tempo de resposta ou
              continuidade.
            </p>
            <ul>
              <li>
                Ele existe para o uso normal do aplicativo. É proibido automatizar
                chamadas em volume, usá-lo como proxy para outros programas, tentar
                extrair segredos ou contornar os limites de uso.
              </li>
              <li>
                Há limite de tentativas por endereço IP. Uso abusivo pode ser
                bloqueado sem aviso.
              </li>
              <li>
                Podemos alterar, suspender ou descontinuar esse serviço. Se isso
                acontecer, o restante do aplicativo continua funcionando com as chaves
                que você já configurou.
              </li>
            </ul>
            <p>
              O tratamento de dados desse serviço está descrito na{" "}
              <Link href={LEGAL_ROUTES.privacy}>Política de privacidade</Link>.
            </p>
          </LegalSection>

          <LegalSection id="responsabilidades" n={6} title="Suas responsabilidades">
            <p>Ao usar a Corneta, você se compromete a:</p>
            <ul>
              <li>
                <strong>Ter direito sobre o que transmite</strong> — imagem, voz,
                música, jogos, marcas e qualquer conteúdo de terceiros que apareça na
                sua live.
              </li>
              <li>
                <strong>Não usar o aplicativo para conteúdo ilícito</strong>, para
                violar direitos de outra pessoa ou para transmitir a partir de contas
                que não são suas.
              </li>
              <li>
                <strong>Guardar as suas credenciais.</strong> As chaves e os tokens
                ficam no cofre do seu sistema operacional; proteger o acesso ao seu
                computador é parte do seu papel.
              </li>
              <li>
                <strong>Cuidar dos dados de quem assiste.</strong> Nome, mensagem e
                valor de doação aparecem na sua tela e podem aparecer na sua live se
                você usar o overlay. Essa decisão é sua.
              </li>
              <li>
                <strong>Manter o seu ambiente.</strong> Sistema, drivers, OBS e
                conexão são pré-requisitos que estão do seu lado.
              </li>
            </ul>
          </LegalSection>

          <LegalSection id="plataformas" n={7} title="Regras das plataformas">
            <p>
              Transmitir para vários serviços ao mesmo tempo é permitido por algumas
              plataformas e restringido por outras, e essas regras mudam com o tempo,
              às vezes de acordo com o seu tipo de conta ou contrato de exclusividade.
            </p>
            <Callout>
              Antes de sair transmitindo para todo lado, confira os termos de cada
              plataforma que você pretende usar. Uma ferramenta que torna algo
              tecnicamente possível não torna aquilo contratualmente permitido — e a
              consequência de descumprir esses termos recai sobre a sua conta.
            </Callout>
            <p>
              A Corneta não fiscaliza, não interpreta e não garante a conformidade do
              seu uso com as regras de terceiros. Também não temos como restabelecer
              contas suspensas por eles.
            </p>
          </LegalSection>

          <LegalSection id="experimental" n={8} title="Recursos experimentais">
            <p>
              Alguns recursos são identificados no aplicativo como{" "}
              <strong>experimentais</strong> justamente porque dependem de terceiros ou
              ainda não têm validação ampla. Eles podem falhar, mudar de comportamento
              ou ser removidos:
            </p>
            <ul>
              <li>
                <strong>TikTok, Instagram e X</strong> dependem de liberação e de
                fluxos das próprias plataformas, que podem não estar disponíveis para
                a sua conta.
              </li>
              <li>
                <strong>Guardião de privacidade</strong> é uma rede de segurança que
                observa termos definidos por você e corta para a tela “JÁ VOLTO”. Não
                é garantia de que nada vazará, e custa atraso na transmissão inteira.
              </li>
              <li>
                <strong>Proteções automáticas</strong> como “JÁ VOLTO” e auto-bitrate
                reagem a condições detectáveis; falhas fora do previsto podem, ainda
                assim, interromper a sua live.
              </li>
            </ul>
            <p>
              A matriz completa de plataformas ainda está em validação pública. Só a
              Twitch tem transmissão real documentada até esta versão dos termos.
            </p>
          </LegalSection>

          <LegalSection id="requisitos" n={9} title="Requisitos e desempenho">
            <p>
              Hoje o instalador é para <strong>Windows</strong> e o aplicativo depende
              do OBS para produzir a transmissão. Cada destino consome parte do seu
              upload, e recodificar vídeo consome CPU ou GPU. O aplicativo estima essas
              contas antes de você entrar ao vivo, mas estimativas são estimativas: o
              resultado depende da sua máquina, da sua rede e das próprias plataformas.
            </p>
          </LegalSection>

          <LegalSection id="garantia" n={10} title="Ausência de garantia">
            <p>
              Conforme a licença MIT, o software é fornecido{" "}
              <strong>“no estado em que se encontra”</strong>, sem garantias de
              qualquer tipo, expressas ou implícitas, incluindo — sem limitação — as
              garantias de comerciabilidade, adequação a uma finalidade específica e
              não violação.
            </p>
            <p>
              Não garantimos que a transmissão ocorrerá sem interrupção, que as
              proteções impedirão todo incidente, que as integrações continuarão
              funcionando após mudanças de terceiros ou que os relatórios estarão
              livres de imprecisão.
            </p>
          </LegalSection>

          <LegalSection
            id="responsabilidade"
            n={11}
            title="Limitação de responsabilidade"
          >
            <p>
              Na máxima extensão permitida pela lei aplicável, não responderemos por
              danos indiretos, lucros cessantes, perda de audiência, perda de receita
              de inscrições ou doações, perda de dados, suspensão de contas em
              plataformas ou interrupção de transmissão decorrentes do uso ou da
              impossibilidade de uso do software.
            </p>
            <Callout>
              Esta limitação não afasta direitos que a lei não permite afastar. Se você
              usa a Corneta como consumidor, o Código de Defesa do Consumidor continua
              aplicável, assim como as hipóteses legais de dolo e culpa grave.
            </Callout>
          </LegalSection>

          <LegalSection id="marcas" n={12} title="Marcas e não afiliação">
            <p>
              Twitch, YouTube, Kick, Facebook, TikTok, Instagram, X, OBS, Streamlabs,
              StreamElements e demais nomes citados são marcas dos seus respectivos
              titulares, usados aqui apenas para identificar compatibilidade. A Corneta{" "}
              <strong>não é afiliada, patrocinada ou endossada</strong> por nenhuma
              dessas empresas.
            </p>
            <p>
              O nome “Corneta”, o símbolo da corneta e a identidade visual do projeto
              são de {LEGAL_OPERATOR}. A licença MIT cobre o código, não a marca: se
              você distribuir uma versão modificada, não a apresente como se fosse a
              Corneta oficial.
            </p>
          </LegalSection>

          <LegalSection
            id="mudancas"
            n={13}
            title="Mudanças no software e nos termos"
          >
            <p>
              A Corneta está em desenvolvimento ativo. Recursos podem ser adicionados,
              alterados ou removidos, e versões novas podem exigir passos de
              reconfiguração. Estes termos podem ser atualizados para acompanhar essas
              mudanças; a data de revisão no topo indica a versão vigente, hoje de{" "}
              {LEGAL_UPDATED_LABEL}. Continuar usando o aplicativo depois de uma
              atualização significa concordar com a versão publicada.
            </p>
          </LegalSection>

          <LegalSection id="encerramento" n={14} title="Encerramento">
            <p>
              Você encerra a relação a qualquer momento desinstalando o aplicativo —
              não há conta para cancelar nem assinatura para interromper. Podemos
              suspender o acesso ao serviço de login em caso de abuso, e podemos
              descontinuar o site ou o serviço. Os direitos concedidos pela licença MIT
              sobre as versões que você já possui permanecem.
            </p>
          </LegalSection>

          <LegalSection id="lei" n={15} title="Lei aplicável e foro">
            <p>
              Estes termos são regidos pelas leis da República Federativa do Brasil.
              Para dirimir controvérsias, fica eleito o foro da comarca de{" "}
              {LEGAL_VENUE ? (
                <strong>{LEGAL_VENUE}</strong>
              ) : (
                <Todo>comarca do foro</Todo>
              )}
              , sem prejuízo do direito do consumidor de demandar no foro do seu
              domicílio.
            </p>
          </LegalSection>

          <LegalSection id="contato" n={16} title="Contato">
            <p>
              Dúvidas sobre estes termos, sobre licenciamento ou sobre uso da marca:
              fale com a gente por <Contact />. Para assuntos de dados pessoais, veja a{" "}
              <Link href={LEGAL_ROUTES.privacy}>Política de privacidade</Link>.
            </p>
          </LegalSection>

          <LegalFoot other="privacy" />
        </div>
      </div>
    </>
  );
}
