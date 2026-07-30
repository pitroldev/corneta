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
  LEGAL_HOST,
  LEGAL_OPERATOR,
  LEGAL_ROUTES,
  LEGAL_UPDATED_LABEL,
} from "@/lib/legal";
import { jsonLdScript, legalJsonLd } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Política de privacidade",
  description:
    "O que a Corneta trata, o que fica só no seu computador e o que passa pelos nossos servidores. Sem telemetria, sem conta, sem cookies.",
  alternates: { canonical: LEGAL_ROUTES.privacy },
  openGraph: {
    title: "Política de privacidade — Corneta",
    description:
      "O que a Corneta trata, o que fica só no seu computador e o que passa pelos nossos servidores.",
    url: LEGAL_ROUTES.privacy,
  },
};

const sections = [
  { id: "responsavel", title: "Quem é o responsável" },
  { id: "escopo", title: "A que esta política se aplica" },
  { id: "principio", title: "O princípio: a Corneta é local" },
  { id: "site", title: "Dados no site" },
  { id: "api", title: "Dados na API de login" },
  { id: "app", title: "Dados no seu computador" },
  { id: "bases", title: "Bases legais" },
  { id: "google", title: "Dados do Google e do YouTube" },
  { id: "terceiros", title: "Terceiros e conexões do app" },
  { id: "internacional", title: "Transferência internacional" },
  { id: "retencao", title: "Por quanto tempo guardamos" },
  { id: "seguranca", title: "Segurança" },
  { id: "direitos", title: "Seus direitos" },
  { id: "espectadores", title: "Dados dos seus espectadores" },
  { id: "criancas", title: "Crianças e adolescentes" },
  { id: "cookies", title: "Cookies" },
  { id: "mudancas", title: "Mudanças nesta política" },
];

export default function PrivacyPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(legalJsonLd("privacy")),
        }}
      />

      <LegalHero
        kicker="Política de privacidade"
        title="Seus dados ficam onde você já está: no seu PC."
        intro="A Corneta é um app de desktop que roda na sua máquina. Esta política explica, em detalhe e sem enrolação, o que acontece com dados no site, na API de login e dentro do aplicativo — incluindo o que a gente deliberadamente não coleta."
        version="1.0"
      />

      <div className="shell legal-layout">
        <LegalToc sections={sections} />

        <div className="legal-body">
          <LegalTldr
            points={[
              "A Corneta não tem telemetria, não cria conta e não exige cadastro para funcionar.",
              "Chaves de transmissão e tokens ficam no cofre de credenciais do seu sistema operacional, nunca nos nossos servidores.",
              "Configurações, chat, alertas e relatórios da live ficam em arquivos no seu computador.",
              "Só o login da Kick passa pelos nossos servidores — de passagem, sem ser armazenado. Twitch e YouTube falam direto com o seu app.",
              "Este site não usa cookies, analytics, pixel de rastreamento nem formulário.",
            ]}
            note="Este resumo é uma cortesia de leitura e não substitui o texto completo abaixo."
          />

          <LegalSection id="responsavel" n={1} title="Quem é o responsável">
            <p>
              O responsável pelo tratamento dos dados descritos aqui — o
              “controlador”, na linguagem da Lei Geral de Proteção de Dados (Lei
              nº 13.709/2018, a LGPD) — é <strong>{LEGAL_OPERATOR}</strong>,
              inscrita no CNPJ sob o nº <strong>{LEGAL_CNPJ}</strong>, que opera
              este site e a API de login.
            </p>
            <p>
              O software Corneta é distribuído sob licença MIT e seus direitos
              autorais pertencem a <strong>{LEGAL_AUTHOR}</strong>, autor do
              projeto. Autoria do código e operação do serviço são coisas
              distintas: quem responde pelos dados tratados aqui é a empresa
              acima.
            </p>
            <p>
              Para qualquer assunto de privacidade, incluindo o exercício dos
              seus direitos, o canal de atendimento ao titular é <Contact />.
            </p>
            <Callout>
              Em português: a empresa é pequena o bastante para a lei dispensar
              a figura do “encarregado de dados”, desde que exista um canal
              aberto com você — que é o e-mail acima. Isso está na Resolução
              CD/ANPD nº 2/2022. Se um encarregado for nomeado algum dia, o nome
              dele aparecerá aqui.
            </Callout>
          </LegalSection>

          <LegalSection id="escopo" n={2} title="A que esta política se aplica">
            <p>
              Esta política cobre três coisas distintas, e a diferença importa:
            </p>
            <ul>
              <li>
                <strong>Este site</strong> — as páginas públicas que apresentam
                a Corneta e oferecem o download.
              </li>
              <li>
                <strong>A API de login</strong> — um serviço mínimo neste mesmo
                domínio que ajuda o aplicativo a concluir o login da Kick e a
                descobrir quais provedores de login estão disponíveis.
              </li>
              <li>
                <strong>O aplicativo Corneta</strong> — o programa que você
                instala no Windows e que roda na sua máquina.
              </li>
            </ul>
            <p>
              Não cobrimos as plataformas de transmissão (Twitch, YouTube, Kick,
              Facebook e outras), os agregadores de alertas (Streamlabs,
              StreamElements) nem o OBS. Cada um tem a sua própria política, e é
              com eles que você trata dos dados que ficam sob a guarda deles.
            </p>
          </LegalSection>

          <LegalSection
            id="principio"
            n={3}
            title="O princípio: a Corneta é local"
          >
            <p>
              A Corneta foi construída para distribuir a sua transmissão a
              partir do seu computador, sem intermediar o vídeo em nuvem
              própria. Isso não é uma promessa de marketing: é a arquitetura. O
              vídeo sai do OBS, entra na Corneta e vai direto da sua máquina
              para cada plataforma de destino.
            </p>
            <p>
              Como consequência, <strong>não recebemos</strong> o seu vídeo, o
              seu áudio, as suas chaves de transmissão, o seu chat, os seus
              alertas nem os seus relatórios. Não existe painel nosso onde esses
              dados apareçam, porque eles nunca chegam até nós.
            </p>
            <Callout>
              O aplicativo não possui telemetria, coleta de uso, relatório
              automático de erros ou identificador de instalação. Você pode
              conferir isso no código-fonte: o projeto é aberto.
            </Callout>
          </LegalSection>

          <LegalSection id="site" n={4} title="Dados no site">
            <p>
              As páginas deste site são estáticas. Não há formulário de
              cadastro, newsletter, chat de atendimento, cookies, pixel de
              rastreamento nem ferramenta de analytics. As fontes tipográficas
              são servidas pelo próprio site, então a sua visita não gera
              requisição a serviços de fontes de terceiros.
            </p>
            <p>
              Como em qualquer site, o servidor que o entrega registra dados
              técnicos de acesso — endereço IP, data e hora, página solicitada,
              código de resposta e informações do navegador. Esses registros são
              gerados e mantidos pelo provedor de hospedagem,{" "}
              {LEGAL_HOST ? (
                <strong>{LEGAL_HOST}</strong>
              ) : (
                <Todo>provedor de hospedagem</Todo>
              )}
              , na condição de operador, e servem para entregar o site, manter a
              segurança e diagnosticar falhas.
            </p>
            <p>
              O botão de download aponta para o instalador. Ao baixá-lo, o
              provedor que hospeda o arquivo pode registrar o mesmo tipo de dado
              técnico de acesso.
            </p>
          </LegalSection>

          <LegalSection id="api" n={5} title="Dados na API de login">
            <p>
              Para você entrar com a sua conta e usar chat, alertas e a criação
              automática de transmissão, o aplicativo precisa concluir um fluxo
              de login (OAuth) com cada plataforma. Duas das três plataformas
              conversam <strong>diretamente</strong> com o seu computador; só a
              Kick exige um segredo de servidor, e é por isso que ela passa por
              aqui.
            </p>

            <div className="legal-table">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Rota</th>
                    <th scope="col">O que recebe</th>
                    <th scope="col">O que fazemos</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <code>GET /api/v1/bootstrap</code>
                    </td>
                    <td>Nada além da requisição em si.</td>
                    <td>
                      Responde quais provedores de login estão ativos e os
                      identificadores públicos de cliente. Sem dado pessoal.
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <code>GET /api/v1/health</code>
                    </td>
                    <td>Nada além da requisição em si.</td>
                    <td>Responde se o serviço está de pé.</td>
                  </tr>
                  <tr>
                    <td>
                      <code>POST /api/v1/oauth/kick/exchange</code>
                    </td>
                    <td>
                      O código de autorização temporário da Kick, o verificador
                      PKCE e o endereço de retorno.
                    </td>
                    <td>
                      Encaminha para <code>id.kick.com</code> junto com o
                      segredo do cliente e devolve os tokens ao seu aplicativo.
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <code>POST /api/v1/oauth/kick/refresh</code>
                    </td>
                    <td>O token de renovação da Kick.</td>
                    <td>
                      Pede um token novo à Kick e devolve ao seu aplicativo.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h3>O que essa API não faz</h3>
            <ul>
              <li>
                <strong>Não armazena tokens.</strong> O código e os tokens
                existem apenas na memória durante a requisição e seguem para o
                seu aplicativo, que os guarda no cofre do seu sistema. Não há
                banco de dados, arquivo ou cache com esses valores.
              </li>
              <li>
                <strong>Não cria conta nem sessão.</strong> Não há cadastro,
                login no site, cookie de sessão ou perfil de usuário.
              </li>
              <li>
                <strong>Não registra o conteúdo das requisições.</strong> Quando
                ocorre uma falha inesperada, o servidor registra apenas um
                identificador aleatório do pedido, para investigação — sem
                tokens, sem corpo da requisição.
              </li>
            </ul>

            <h3>Proteção contra abuso</h3>
            <p>
              Para evitar que alguém use o serviço como trampolim, existe um
              limite de tentativas por endereço IP (20 trocas e 60 renovações
              por minuto). Esse controle usa o IP da requisição apenas em
              memória e por poucos minutos, exclusivamente para contar
              tentativas na janela vigente.
            </p>
            <Callout>
              O login da Twitch usa o fluxo de código de dispositivo e o do
              YouTube usa PKCE direto com o Google. Nesses dois casos, nenhum
              dado do login passa pelos nossos servidores.
            </Callout>
          </LegalSection>

          <LegalSection id="app" n={6} title="Dados no seu computador">
            <p>
              O aplicativo guarda, na sua máquina, o que ele precisa para
              trabalhar. Nada disso é enviado para nós.
            </p>
            <ul>
              <li>
                <strong>Chaves de transmissão e tokens de acesso</strong> ficam
                no cofre de credenciais do sistema operacional (no Windows, o
                Gerenciador de Credenciais). O arquivo de configuração guarda
                apenas a informação de que existe uma chave, nunca a chave.
              </li>
              <li>
                <strong>Configurações</strong> — destinos, qualidade por
                plataforma, preferências, perfis, título da live — ficam num
                arquivo de configuração local, que você pode exportar e importar
                quando quiser.
              </li>
              <li>
                <strong>Chat, alertas e audiência</strong> chegam das
                plataformas diretamente ao seu aplicativo e são exibidos na
                interface. O histórico não é enviado a nenhum servidor nosso.
              </li>
              <li>
                <strong>Relatórios pós-live</strong> — estabilidade, audiência,
                taxa de chat, alertas, momentos marcados — são gravados em
                arquivos locais.
              </li>
              <li>
                <strong>Diagnóstico de suporte</strong> — se você pedir a
                exportação de logs, o aplicativo gera um arquivo com informações
                técnicas redigidas e é você quem decide se e para quem enviar.
              </li>
              <li>
                <strong>Overlay para o OBS</strong> — quando ligado, o
                aplicativo sobe um servidor que responde somente no seu
                computador (<code>127.0.0.1</code>), para que o OBS leia alertas
                e chat como Browser Source. Ele não é exposto à internet.
              </li>
              <li>
                <strong>Aceite destes documentos</strong> — a data e a versão dos
                termos que você viu na tela de boas-vindas ficam guardadas
                localmente, só para o aplicativo saber quando precisa avisar de
                novo. Esse registro não acompanha a exportação da configuração e
                nunca é enviado para nós.
              </li>
            </ul>
            <p>
              Desinstalar o aplicativo, apagar o arquivo de configuração e
              remover as credenciais do cofre do sistema elimina esses dados.
              Como eles estão sob a sua guarda, essa exclusão não depende de
              nós.
            </p>
          </LegalSection>

          <LegalSection id="bases" n={7} title="Bases legais">
            <p>
              Para os poucos tratamentos que realizamos, as bases legais da LGPD
              são:
            </p>
            <ul>
              <li>
                <strong>Execução de contrato</strong> (art. 7º, V) — processar o
                código e os tokens da Kick é o que permite entregar o recurso de
                login que você pediu ao clicar em entrar.
              </li>
              <li>
                <strong>Legítimo interesse</strong> (art. 7º, IX) — registros
                técnicos de acesso e o limite por IP existem para manter o site
                e a API disponíveis e seguros, no mínimo necessário para essa
                finalidade.
              </li>
              <li>
                <strong>Cumprimento de obrigação legal ou regulatória</strong>{" "}
                (art. 7º, II) — quando a guarda de registros de acesso for
                exigida por lei.
              </li>
            </ul>
          </LegalSection>

          <LegalSection id="google" n={8} title="Dados do Google e do YouTube">
            <p>
              Se você conectar a sua conta do YouTube, a Corneta pede a
              permissão <strong>“gerenciar sua conta do YouTube”</strong> (o
              escopo <code>https://www.googleapis.com/auth/youtube</code>). Ela
              é usada exclusivamente para:
            </p>
            <ul>
              <li>
                <strong>Criar e encerrar a sua transmissão ao vivo</strong>,
                obter a chave de transmissão correspondente e definir o título
                que você digitou no aplicativo, para que você não precise abrir
                o YouTube Studio a cada live. A alteração de título atinge
                apenas a transmissão em andamento — nenhum vídeo já publicado no
                seu canal é modificado.
              </li>
              <li>
                <strong>Ler e enviar mensagens no chat ao vivo</strong>, que é o
                que permite o chat unificado e a resposta pelo aplicativo.
              </li>
              <li>
                <strong>Ler a contagem de espectadores</strong> da transmissão
                em andamento, para mostrar a audiência somada.
              </li>
            </ul>
            <p>
              Esses dados são solicitados pelo aplicativo instalado na sua
              máquina, diretamente ao Google, e ficam nela. O login do YouTube
              usa o fluxo PKCE oficial para aplicativos instalados e{" "}
              <strong>não passa pelos nossos servidores</strong>: nem o código
              de autorização, nem o token, nem a renovação. Os tokens são
              guardados no cofre de credenciais do Windows.
            </p>

            <h3>Uso limitado (Limited Use)</h3>
            <p>
              O uso e a transferência, pela Corneta, de informações recebidas
              das APIs do Google obedecem à{" "}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                rel="noreferrer noopener"
                target="_blank"
              >
                Política de Dados do Usuário dos Serviços de API do Google
              </a>
              , incluindo os requisitos de Uso Limitado. Na prática, isso
              significa que a Corneta:
            </p>
            <ul>
              <li>
                <strong>não transfere</strong> dados do Google para terceiros,
                exceto quando necessário para prover o próprio recurso pedido
                por você ou por exigência legal;
              </li>
              <li>
                <strong>não usa</strong> esses dados para publicidade,
                perfilamento ou venda;
              </li>
              <li>
                <strong>não usa</strong> esses dados para treinar modelos de
                inteligência artificial, generalizados ou não;
              </li>
              <li>
                <strong>não permite</strong> leitura humana desses dados, salvo
                com o seu consentimento explícito, por segurança, para cumprir a
                lei ou sobre dados agregados e anonimizados.
              </li>
            </ul>
            <Callout>
              Você pode revogar o acesso a qualquer momento em{" "}
              <a
                href="https://myaccount.google.com/permissions"
                rel="noreferrer noopener"
                target="_blank"
              >
                myaccount.google.com/permissions
              </a>
              . A revogação vale imediatamente; o que estiver no cofre da sua
              máquina some ao desinstalar o aplicativo.
            </Callout>
          </LegalSection>

          <LegalSection
            id="terceiros"
            n={9}
            title="Terceiros e conexões do app"
          >
            <p>
              Não vendemos, alugamos nem compartilhamos dados com terceiros para
              publicidade — não temos anúncio, patrocinador de dados ou parceria
              de marketing. O que existe são conexões que o{" "}
              <strong>seu computador</strong> faz para o app funcionar. Elas
              partem da sua máquina, não da nossa:
            </p>
            <ul>
              <li>
                <strong>Plataformas de destino</strong> — os servidores de
                ingestão de vídeo (RTMP/RTMPS) para onde a sua live é enviada.
              </li>
              <li>
                <strong>APIs das plataformas</strong> — Twitch, YouTube/Google e
                Kick, para login, chat, contagem de audiência, alertas e criação
                da transmissão.
              </li>
              <li>
                <strong>Serviços de emotes</strong> — BetterTTV, FrankerFaceZ e
                7TV, para exibir os emotes do chat, além das CDNs de imagem das
                próprias plataformas.
              </li>
              <li>
                <strong>Agregadores de alertas</strong> — Streamlabs e
                StreamElements, somente se você configurar essas fontes; o token
                fica no seu cofre.
              </li>
              <li>
                <strong>Teste de velocidade</strong> — o medidor de upload envia
                dados descartáveis a um endpoint público da Cloudflare (
                <code>speed.cloudflare.com</code>) para estimar a sua banda.
                Nenhum conteúdo seu é transmitido nesse teste.
              </li>
            </ul>
            <p>
              Do nosso lado, o único operador envolvido é o provedor de
              hospedagem do site e da API, já indicado acima.
            </p>
          </LegalSection>

          <LegalSection
            id="internacional"
            n={10}
            title="Transferência internacional"
          >
            <p>
              O site e a API são hospedados na{" "}
              {LEGAL_HOST ? (
                <strong>{LEGAL_HOST}</strong>
              ) : (
                <Todo>provedor de hospedagem</Todo>
              )}
              , empresa sediada nos Estados Unidos, que pode processar as
              requisições em servidores fora do Brasil. As plataformas de
              transmissão, os agregadores de alertas e os serviços de emote
              citados acima também operam no exterior.
            </p>
            <p>
              Ao usar esses recursos, os dados necessários para a comunicação
              transitam internacionalmente, conforme as políticas de cada
              serviço e o disposto nos arts. 33 e seguintes da LGPD. Nenhum
              conteúdo da sua transmissão passa por esses servidores: o vídeo
              sai da sua máquina direto para cada plataforma.
            </p>
          </LegalSection>

          <LegalSection id="retencao" n={11} title="Por quanto tempo guardamos">
            <div className="legal-table">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Dado</th>
                    <th scope="col">Prazo</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Código de autorização e tokens da Kick</td>
                    <td>
                      Somente durante a requisição, em memória. Não são
                      gravados.
                    </td>
                  </tr>
                  <tr>
                    <td>Contador de tentativas por IP</td>
                    <td>
                      Em memória, até o fim da janela de contagem (um minuto).
                    </td>
                  </tr>
                  <tr>
                    <td>Registros técnicos de acesso</td>
                    <td>
                      Pelo prazo praticado pelo provedor de hospedagem e pelos
                      prazos legais aplicáveis.
                    </td>
                  </tr>
                  <tr>
                    <td>Suas configurações, chaves e relatórios</td>
                    <td>
                      Pelo tempo que você quiser: estão no seu computador, sob a
                      sua guarda.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </LegalSection>

          <LegalSection id="seguranca" n={12} title="Segurança">
            <p>
              Adotamos medidas técnicas proporcionais ao que o serviço faz: as
              credenciais sensíveis ficam no cofre do sistema operacional em vez
              de arquivos de texto; as respostas da API não são armazenadas em
              cache; o tamanho das requisições é limitado; os endereços de
              retorno do login são validados contra uma lista fixa; e há limite
              de tentativas por IP. O overlay para o OBS responde apenas no
              endereço local.
            </p>
            <p>
              Nenhum sistema é infalível. Se identificarmos um incidente de
              segurança com risco relevante, comunicaremos os titulares e a
              Autoridade Nacional de Proteção de Dados (ANPD) na forma da lei.
            </p>
            <Callout>
              Encontrou uma falha? Fale com a gente por <Contact /> antes de
              divulgar publicamente. A gente responde e credita quem reporta.
            </Callout>
          </LegalSection>

          <LegalSection id="direitos" n={13} title="Seus direitos">
            <p>
              A LGPD garante a você, entre outros, o direito de confirmar a
              existência de tratamento, acessar os dados, corrigir dados
              incompletos ou desatualizados, pedir anonimização, bloqueio ou
              eliminação de dados desnecessários, solicitar portabilidade, obter
              informação sobre compartilhamentos, revogar consentimento e se
              opor a tratamentos baseados em legítimo interesse.
            </p>
            <p>
              Para exercer qualquer um deles, escreva para <Contact />. Vamos
              responder no prazo legal. Como não mantemos cadastro, a maior
              parte dos dados que dizem respeito a você já está sob o seu
              controle direto — e vamos explicar isso caso o seu pedido se
              refira a algo que não temos.
            </p>
          </LegalSection>

          <LegalSection
            id="espectadores"
            n={14}
            title="Dados dos seus espectadores"
          >
            <p>
              Ao usar chat e alertas, o seu computador recebe dados de outras
              pessoas: apelidos, mensagens, valores de doação, avisos de
              inscrição. Esses dados chegam das plataformas diretamente ao seu
              aplicativo e <strong>não passam por nós</strong>.
            </p>
            <p>
              Em relação a esse tratamento, quem decide o que fazer com esses
              dados é você — inclusive se eles vão aparecer no overlay dentro da
              sua transmissão. Recomendamos atenção ao exibir nome e valor de
              quem apoia, e cuidado com o compartilhamento de gravações e
              capturas de tela.
            </p>
          </LegalSection>

          <LegalSection id="criancas" n={15} title="Crianças e adolescentes">
            <p>
              A Corneta é uma ferramenta de produção para quem transmite ao vivo
              e não é direcionada a crianças. As plataformas de transmissão têm
              idade mínima própria, e o seu uso deve respeitá-la. Se você é
              adolescente, use o aplicativo com ciência e assistência de quem
              responde por você.
            </p>
          </LegalSection>

          <LegalSection id="cookies" n={16} title="Cookies">
            <p>
              Este site não usa cookies, armazenamento local, fingerprinting ou
              qualquer outro mecanismo de rastreamento. Como não há cookie a
              consentir, também não há banner de consentimento.
            </p>
          </LegalSection>

          <LegalSection id="mudancas" n={17} title="Mudanças nesta política">
            <p>
              Se o produto mudar de forma que altere o tratamento de dados — por
              exemplo, se algum dia existir uma função opcional que dependa de
              servidor — esta política será atualizada antes de a mudança chegar
              a você, com nova data de revisão no topo da página. A versão atual
              é de {LEGAL_UPDATED_LABEL}.
            </p>
            <p>
              Os <Link href={LEGAL_ROUTES.terms}>Termos de uso</Link>{" "}
              complementam esta política e explicam as regras de uso do software
              e do serviço de login.
            </p>
          </LegalSection>

          <LegalFoot other="terms" />
        </div>
      </div>
    </>
  );
}
