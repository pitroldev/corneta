import Link from "next/link";
import { TelemetryPreference } from "@/app/_components/telemetry-preference";
import {
  Callout,
  Contact,
  LegalSection,
  LegalTable,
  Todo,
} from "../_components/legal-chrome";
import {
  LEGAL_AUTHOR,
  LEGAL_CNPJ,
  LEGAL_HOST,
  LEGAL_OPERATOR,
  LEGAL_ROUTES,
  LEGAL_UPDATED_LABEL_PT,
} from "@/lib/legal";

// Binding Portuguese text; keep the English translation aligned.

const L = "pt-BR" as const;

export const privacyHeroPt = {
  kicker: "Política de privacidade",
  title: "O conteúdo da sua live fica onde você está: no seu PC.",
  intro:
    "A Corneta é um app de desktop que roda na sua máquina. Esta política explica, em detalhe e sem enrolação, o que acontece com dados no site, na API de login e dentro do aplicativo — incluindo o que a gente deliberadamente não coleta.",
};

export const privacySectionsPt = [
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
  { id: "cookies", title: "Cookies e preferências locais" },
  { id: "mudancas", title: "Mudanças nesta política" },
];

export const privacyTldrPt = {
  points: [
    "A Corneta não cria conta nem exige cadastro. No app, dados de uso só são enviados se você ativar. Relatos de falhas vêm ligados quando não há escolha anterior e podem ser desligados. Suas escolhas anteriores são mantidas.",
    "Chaves de transmissão e tokens ficam no cofre de credenciais do seu sistema operacional, nunca nos nossos servidores.",
    "Configurações, chat, alertas e relatórios da live ficam em arquivos no seu computador.",
    "Só o login da Kick passa pelos nossos servidores — de passagem, sem ser armazenado. Twitch e YouTube falam direto com o seu app.",
    "Este site mede apenas rota, idioma, cliques de download e erros técnicos, sem cookies de analytics, replay, texto da página ou ligação com o aplicativo; você pode desativar essas métricas abaixo.",
  ],
  note: "Este resumo é uma cortesia de leitura e não substitui o texto completo abaixo.",
};

export function PrivacyBodyPt() {
  return (
    <>
      <LegalSection id="responsavel" n={1} title="Quem é o responsável">
        <p>
          O responsável pelo tratamento dos dados descritos aqui — o
          “controlador”, na linguagem da Lei Geral de Proteção de Dados (Lei nº
          13.709/2018, a LGPD) — é <strong>{LEGAL_OPERATOR}</strong>, inscrita
          no CNPJ sob o nº <strong>{LEGAL_CNPJ}</strong>, que opera este site e
          a API de login.
        </p>
        <p>
          O software Corneta é distribuído sob licença MIT e seus direitos
          autorais pertencem a <strong>{LEGAL_AUTHOR}</strong>, autor do
          projeto. Autoria do código e operação do serviço são coisas distintas:
          quem responde pelos dados tratados aqui é a empresa acima.
        </p>
        <p>
          Para qualquer assunto de privacidade, incluindo o exercício dos seus
          direitos, o canal de atendimento ao titular é <Contact locale={L} />.
        </p>
        <Callout>
          Em português: a empresa é pequena o bastante para a lei dispensar a
          figura do “encarregado de dados”, desde que exista um canal aberto com
          você — que é o e-mail acima. Isso está na Resolução CD/ANPD nº 2/2022.
          Se um encarregado for nomeado algum dia, o nome dele aparecerá aqui.
        </Callout>
      </LegalSection>

      <LegalSection id="escopo" n={2} title="A que esta política se aplica">
        <p>Esta política cobre três coisas distintas, e a diferença importa:</p>
        <ul>
          <li>
            <strong>Este site</strong> — as páginas públicas que apresentam a
            Corneta e oferecem o download.
          </li>
          <li>
            <strong>A API de login</strong> — um serviço mínimo neste mesmo
            domínio que ajuda o aplicativo a concluir o login da Kick e a
            descobrir quais provedores de login estão disponíveis.
          </li>
          <li>
            <strong>O aplicativo Corneta</strong> — o programa que você instala
            no Windows e que roda na sua máquina.
          </li>
        </ul>
        <p>
          Não cobrimos as plataformas de transmissão (Twitch, YouTube, Kick,
          Facebook e outras), os agregadores de alertas (Streamlabs,
          StreamElements) nem o OBS. Cada um tem a sua própria política, e é com
          eles que você trata dos dados que ficam sob a guarda deles.
        </p>
      </LegalSection>

      <LegalSection id="principio" n={3} title="O princípio: a Corneta é local">
        <p>
          A Corneta foi construída para distribuir a sua transmissão a partir do
          seu computador, sem intermediar o vídeo em nuvem própria. Isso não é
          uma promessa de marketing: é a arquitetura. O vídeo sai do OBS, entra
          na Corneta e vai direto da sua máquina para cada plataforma de
          destino.
        </p>
        <p>
          Como consequência, <strong>não recebemos</strong> o seu vídeo, o seu
          áudio, as suas chaves de transmissão, o seu chat, os seus alertas nem
          os seus relatórios. Não existe painel nosso onde esses dados apareçam,
          porque eles nunca chegam até nós.
        </p>
        <Callout>
          No aplicativo, <strong>dados de uso dependem da sua ativação</strong>,
          separada do aceite dos termos. Sem escolha anterior, essa finalidade
          fica desligada. Relatos de falhas ficam ligados quando não há escolha
          anterior e podem ser desligados. A base prevista para uso é
          consentimento (art. 7º, I); para falhas, a hipótese é legítimo
          interesse (art. 7º, IX), sujeita à avaliação do controlador, não a uma
          aprovação automática pelo software. Você pode revogar a ativação de
          uso ou se opor ao envio de falhas em Configurações, sem perder
          recursos da Corneta. Suas escolhas anteriores são mantidas; fechar o
          aviso não ativa dados de uso. Um UUID aleatório de instalação é criado
          no primeiro uso com alguma finalidade ativa. Desligar as duas
          interrompe novos envios, mas não apaga dados já recebidos pelo
          operador. Copie o UUID antes de regenerar o identificador ou reiniciar
          o app com ambas desligadas, caso queira solicitar exclusão. Você pode
          conferir o comportamento no código-fonte.
        </Callout>
      </LegalSection>

      <LegalSection id="site" n={4} title="Dados no site">
        <p>
          As páginas deste site não têm formulário de cadastro, newsletter, chat
          de atendimento, pixel de publicidade ou perfil de usuário. As fontes
          tipográficas são servidas pelo próprio site, então a sua visita não
          gera requisição a serviços de fontes de terceiros.
        </p>
        <p>
          Usamos o PostHog em modo sem cookies para medir somente a rota e o
          idioma visitados, qual botão de download foi acionado e falhas
          técnicas redigidas, com ambiente e versão do build. Não coletamos
          query string, fragmento da URL, texto visível, campos digitados,
          reprodução de sessão, heatmap, autocapture ou desempenho de rede. O
          navegador não recebe identificador persistente de analytics, não
          criamos perfil e não ligamos a visita ao UUID opcional da instalação
          do aplicativo.
        </p>
        <p>
          A conexão revela o IP ao provedor durante o transporte, como toda
          requisição de internet, mas o projeto é configurado para descartá-lo
          na ingestão e não usar geolocalização. Respeitamos Do Not Track e
          Global Privacy Control. Você também pode interromper novas métricas a
          qualquer momento no controle da seção 16.
        </p>
        <p>
          Como em qualquer site, o servidor que o entrega registra dados
          técnicos de acesso — endereço IP, data e hora, página solicitada,
          código de resposta e informações do navegador. Esses registros são
          gerados e mantidos pelo provedor de hospedagem,{" "}
          {LEGAL_HOST ? (
            <strong>{LEGAL_HOST}</strong>
          ) : (
            <Todo locale={L}>provedor de hospedagem</Todo>
          )}
          , na condição de operador, e servem para entregar o site, manter a
          segurança e diagnosticar falhas.
        </p>
        <p>
          O botão de download aponta para o instalador. Ao baixá-lo, o provedor
          que hospeda o arquivo pode registrar o mesmo tipo de dado técnico de
          acesso.
        </p>
      </LegalSection>

      <LegalSection id="api" n={5} title="Dados na API de login">
        <p>
          Para você entrar com a sua conta e usar chat, alertas e a criação
          automática de transmissão, o aplicativo precisa concluir um fluxo de
          login (OAuth) com cada plataforma. Duas das três plataformas conversam{" "}
          <strong>diretamente</strong> com o seu computador; só a Kick exige um
          segredo de servidor, e é por isso que ela passa por aqui.
        </p>

        <LegalTable>
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
                  O código de autorização temporário da Kick, o verificador PKCE
                  e o endereço de retorno.
                </td>
                <td>
                  Encaminha para <code>id.kick.com</code> junto com o segredo do
                  cliente e devolve os tokens ao seu aplicativo.
                </td>
              </tr>
              <tr>
                <td>
                  <code>POST /api/v1/oauth/kick/refresh</code>
                </td>
                <td>O token de renovação da Kick.</td>
                <td>Pede um token novo à Kick e devolve ao seu aplicativo.</td>
              </tr>
            </tbody>
          </table>
        </LegalTable>

        <h3>O que essa API não faz</h3>
        <ul>
          <li>
            <strong>Não armazena tokens.</strong> O código e os tokens existem
            apenas na memória durante a requisição e seguem para o seu
            aplicativo, que os guarda no cofre do seu sistema. Não há banco de
            dados, arquivo ou cache com esses valores.
          </li>
          <li>
            <strong>Não cria conta nem sessão.</strong> Não há cadastro, login
            no site, cookie de sessão ou perfil de usuário.
          </li>
          <li>
            <strong>Não registra o conteúdo das requisições.</strong> Quando
            ocorre uma falha, o servidor pode enviar ao PostHog somente o
            identificador aleatório do pedido, rota e provedor em categorias,
            código do erro, classe da resposta e duração em faixa. Uma falha
            inesperada inclui tipo e stack redigida. Corpo, resposta da
            plataforma, query string, tokens e cabeçalhos de autenticação não
            entram nesse evento. O UUID de telemetria e o identificador da
            operação só acompanham o pedido quando o aplicativo tiver o
            finalidade correspondente ativa; caso contrário, a correlação é
            efêmera e limitada ao pedido.
          </li>
        </ul>

        <h3>Proteção contra abuso</h3>
        <p>
          Para reduzir abuso, cada instância do servidor limita as tentativas
          com base no IP a 20 trocas de código e 60 renovações de token por
          janela de 60 segundos. Os contadores não são compartilhados entre
          instâncias. Na memória do limitador, a chave é um identificador
          derivado do IP com um segredo temporário (HMAC), não o IP em si. O
          limitador não persiste nem envia esses contadores a um banco remoto;
          os registros de acesso da hospedagem são tratados separadamente.
        </p>
        <Callout>
          O login da Twitch usa o fluxo de código de dispositivo e o do YouTube
          usa PKCE direto com o Google. Nesses dois casos, nenhum dado do login
          passa pelos nossos servidores.
        </Callout>
      </LegalSection>

      <LegalSection id="app" n={6} title="Dados no seu computador">
        <p>
          O aplicativo guarda, na sua máquina, o que ele precisa para trabalhar.
          O conteúdo descrito abaixo não é enviado para nós. Somente dados
          técnicos expressamente listados mais adiante podem ser enviados quando
          a coleta estiver configurada e a finalidade correspondente estiver
          ativa. Antes de uma escolha no primeiro uso, somente relatos de falhas
          e seu marcador mínimo de abertura podem ser enviados, nunca dados de
          uso.
        </p>
        <ul>
          <li>
            <strong>Chaves de transmissão e tokens de acesso</strong> ficam no
            cofre de credenciais do sistema operacional (no Windows, o
            Gerenciador de Credenciais). O arquivo de configuração guarda apenas
            a informação de que existe uma chave, nunca a chave.
          </li>
          <li>
            <strong>Configurações</strong> — destinos, qualidade por plataforma,
            preferências, perfis, título da live — ficam num arquivo de
            configuração local, que você pode exportar e importar quando quiser.
          </li>
          <li>
            <strong>Chat, alertas e audiência</strong> chegam das plataformas
            diretamente ao seu aplicativo e são exibidos na interface. O
            histórico não é enviado a nenhum servidor nosso.
          </li>
          <li>
            <strong>Relatórios pós-live</strong> — estabilidade, audiência, taxa
            de chat, alertas, momentos marcados — são gravados em arquivos
            locais.
          </li>
          <li>
            <strong>Gravação da live</strong> — desligada por padrão. Se você
            ligar, o aplicativo grava o vídeo que foi ao ar (e, numa opção
            separada, as mensagens do chat com o nome de quem falou) em arquivos
            na pasta que você escolher, no seu computador. Nada disso é enviado
            para nós nem para lugar nenhum. As mensagens de terceiros que você
            optar por gravar ficam sob a sua responsabilidade: você decide por
            quanto tempo guardar e pode apagar a qualquer momento, pelo próprio
            relatório ou pela pasta.
          </li>
          <li>
            <strong>Diagnóstico de suporte</strong> — se você pedir a
            exportação, o aplicativo gera um arquivo apenas com resumo técnico
            estruturado e eventos operacionais permitidos. Ele não incorpora
            logs crus, nomes de canal ou destino, títulos, caminhos, URLs ou
            credenciais. Os logs podem ser abertos separadamente no seu
            computador; é você quem decide se e para quem enviar o diagnóstico.
          </li>
          <li>
            <strong>Telemetria com controles independentes</strong> — “dados de
            uso” só envia após ativação explícita: versão, idioma, família do
            sistema, arquitetura e GPU em categorias, etapas e resultado das
            operações, plataformas em enum, quantidade de destinos e durações em
            faixas. “Relatórios de falha” pode enviar código e etapa do erro,
            tipo, stack redigida e identificadores aleatórios de erro/operação,
            além de um marcador mínimo de abertura com versão e se a saída
            anterior foi limpa, para contextualizar falhas sem ativar métricas
            de uso. Sem escolha anterior, uso fica desligado e falhas ficam
            ligadas. Ativar uso não envia eventos anteriores à ativação,
            inclusive etapas do onboarding. Escolhas explícitas anteriores,
            ligadas ou desligadas, são preservadas quando o aviso muda. Mesmo
            com elas ativas, nunca enviamos vídeo, áudio, chat, alertas, título
            da live, canal, chave, token, URL RTMP, hostname, caminho local
            completo, log cru ou configuração.
          </li>
          <li>
            <strong>Preferência e UUID de telemetria</strong> — ficam em um
            arquivo local próprio, que não acompanha exportação ou importação de
            configuração. O UUID nasce no primeiro uso com alguma finalidade
            ativa, inclusive antes de uma escolha no primeiro uso se relatos de
            falhas estiverem ativos. Isso não ativa dados de uso. Desligar as
            duas interrompe novos envios e limpa a persistência do SDK. O ID
            permanece disponível na sessão atual para copiar e solicitar
            exclusão do que já foi enviado; copie-o antes de reiniciar ou
            regenerar o identificador. Regenerar não exclui dados no operador.
          </li>
          <li>
            <strong>Overlay para o OBS</strong> — quando ligado, o aplicativo
            sobe um servidor que responde somente no seu computador (
            <code>127.0.0.1</code>), para que o OBS leia alertas e chat como
            Browser Source. Ele não é exposto à internet.
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
          Sem token ou host válidos, ou com o bloqueio de telemetria do build
          ativo, o aplicativo não envia esses eventos. Falhas de rede da
          telemetria não impedem o uso do app nem o início e fim da live;
          eventos podem ser perdidos. Desligar não desfaz uma requisição já
          iniciada.
        </p>
        <p>
          Desinstalar o aplicativo não garante a remoção das credenciais nem de
          todos os dados locais. Antes de desinstalar, desconecte suas contas na
          Corneta e revogue o acesso nas plataformas. Para conferir credenciais
          restantes, abra o Gerenciador de Credenciais do Windows e remova
          apenas as entradas identificadas como Corneta (serviço{" "}
          <code>br.com.pitroldev.corneta</code>); não apague credenciais de
          outros aplicativos. Se o app informar falha ao desconectar, a limpeza
          pode estar incompleta.
        </p>
        <p>
          Configurações, relatórios, gravações e cópias exportadas são dados
          separados: revise os locais usados por você antes de removê-los.
          Eventos de telemetria enviados antes disso seguem o prazo da seção 11;
          para pedir a exclusão antecipada, anote o UUID mostrado nas
          Configurações antes de remover os dados e use o canal da seção 13.
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
            técnicos de acesso, o limite por IP, o diagnóstico de falhas da API
            e as métricas cookieless estritamente agregadas do site existem para
            manter o serviço disponível, seguro e compreensível, no mínimo
            necessário. O site oferece opt-out direto e respeita os sinais de
            privacidade do navegador.
          </li>
          <li>
            <strong>Consentimento para dados de uso</strong> (art. 7º, I) — essa
            finalidade só envia após ativação explícita e pode ser desligada a
            qualquer momento, sem afetar os recursos da Corneta. Serve para
            entender etapas e resultados de uso e orientar melhorias. Não
            recuperamos eventos anteriores à ativação. O aceite dos termos e o
            fechamento do aviso não substituem essa escolha.
          </li>
          <li>
            <strong>Legítimo interesse para relatos de falhas</strong> (art. 7º,
            IX) — a hipótese para o envio automático de falhas é encontrar
            defeitos e orientar correções. Sem escolha anterior, essa finalidade
            fica ligada. O tratamento deve se limitar ao necessário (art. 10,
            §1): uma lista fechada de propriedades técnicas, sem conteúdo da sua
            live, sem geolocalização e sem solicitar perfil identificado. Você
            pode se opor ao envio de falhas a qualquer momento nas Configurações
            (art. 18, §2), com efeito imediato e sem afetar o funcionamento da
            Corneta. O rascunho de balanceamento está publicado no repositório;
            a adequação da base legal depende de revisão jurídica, não da
            existência do interruptor.
          </li>
          <li>
            <strong>Cumprimento de obrigação legal ou regulatória</strong> (art.
            7º, II) — quando a guarda de registros de acesso for exigida por
            lei.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="google" n={8} title="Dados do Google e do YouTube">
        <p>
          Se você conectar a sua conta do YouTube, a Corneta pede a permissão{" "}
          <strong>“gerenciar sua conta do YouTube”</strong> (o escopo{" "}
          <code>https://www.googleapis.com/auth/youtube</code>). Ela é usada
          exclusivamente para:
        </p>
        <ul>
          <li>
            <strong>Criar e encerrar a sua transmissão ao vivo</strong>, obter a
            chave de transmissão correspondente e definir o título que você
            digitou no aplicativo, para que você não precise abrir o YouTube
            Studio a cada live. A alteração de título atinge apenas a
            transmissão em andamento — nenhum vídeo já publicado no seu canal é
            modificado.
          </li>
          <li>
            <strong>Ler e enviar mensagens no chat ao vivo</strong>, que é o que
            permite o chat unificado e a resposta pelo aplicativo.
          </li>
          <li>
            <strong>Ler a contagem de espectadores</strong> da transmissão em
            andamento, para mostrar a audiência somada.
          </li>
        </ul>
        <p>
          Esses dados são solicitados pelo aplicativo instalado na sua máquina,
          diretamente ao Google, e ficam nela. O login do YouTube usa o fluxo
          PKCE oficial para aplicativos instalados e{" "}
          <strong>não passa pelos nossos servidores</strong>: nem o código de
          autorização, nem o token, nem a renovação. Os tokens são guardados no
          cofre de credenciais do Windows.
        </p>

        <h3>Uso limitado (Limited Use)</h3>
        <p>
          O uso e a transferência, pela Corneta, de informações recebidas das
          APIs do Google obedecem à{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            rel="noreferrer noopener"
            target="_blank"
          >
            Política de Dados do Usuário dos Serviços de API do Google
          </a>
          , incluindo os requisitos de Uso Limitado. Na prática, isso significa
          que a Corneta:
        </p>
        <ul>
          <li>
            <strong>não transfere</strong> dados do Google para terceiros,
            exceto quando necessário para prover o próprio recurso pedido por
            você ou por exigência legal;
          </li>
          <li>
            <strong>não usa</strong> esses dados para publicidade, perfilamento
            ou venda;
          </li>
          <li>
            <strong>não usa</strong> esses dados para treinar modelos de
            inteligência artificial, generalizados ou não;
          </li>
          <li>
            <strong>não permite</strong> leitura humana desses dados, salvo com
            o seu consentimento explícito, por segurança, para cumprir a lei ou
            sobre dados agregados e anonimizados.
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
          . Revogar o acesso na plataforma e apagar credenciais locais são ações
          distintas. Desconecte também a conta na Corneta; desinstalar não
          garante apagar o cofre. Veja as orientações de limpeza local na seção
          6.
        </Callout>
      </LegalSection>

      <LegalSection id="terceiros" n={9} title="Terceiros e conexões do app">
        <p>
          Não vendemos, alugamos nem compartilhamos dados com terceiros para
          publicidade — não temos anúncio, patrocinador de dados ou parceria de
          marketing. O que existe são conexões que o{" "}
          <strong>seu computador</strong> faz para o app funcionar. Elas partem
          da sua máquina, não da nossa:
        </p>
        <ul>
          <li>
            <strong>Plataformas de destino</strong> — os servidores de ingestão
            de vídeo (RTMP/RTMPS) para onde a sua live é enviada.
          </li>
          <li>
            <strong>APIs das plataformas</strong> — Twitch, YouTube/Google e
            Kick, para login, chat, contagem de audiência, alertas e criação da
            transmissão.
          </li>
          <li>
            <strong>Serviços de emotes</strong> — BetterTTV, FrankerFaceZ e 7TV,
            para exibir os emotes do chat, além das CDNs de imagem das próprias
            plataformas.
          </li>
          <li>
            <strong>Agregadores de alertas</strong> — Streamlabs e
            StreamElements, somente se você configurar essas fontes; o token
            fica no seu cofre.
          </li>
          <li>
            <strong>Teste de velocidade</strong> — o medidor de upload envia
            dados descartáveis a um endpoint público da Cloudflare (
            <code>speed.cloudflare.com</code>) para estimar a sua banda. Nenhum
            conteúdo seu é transmitido nesse teste.
          </li>
        </ul>
        <p>
          Do nosso lado, atuam como operadores o provedor de hospedagem do site
          e da API, já indicado acima, e a <strong>PostHog Inc.</strong>. O
          PostHog recebe somente os eventos técnicos e exceções redigidas
          descritos nesta política, para métricas de produto, operação e
          diagnóstico; não recebe o conteúdo da sua transmissão e não é usado
          para publicidade.
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
            <Todo locale={L}>provedor de hospedagem</Todo>
          )}
          , empresa sediada nos Estados Unidos, que pode processar as
          requisições em servidores fora do Brasil. A telemetria é processada
          pelo <strong>PostHog Cloud US, na Virgínia, Estados Unidos</strong>.
          As plataformas de transmissão, os agregadores de alertas e os serviços
          de emote citados acima também operam no exterior.
        </p>
        <p>
          Ao usar esses recursos, os dados necessários para a comunicação
          transitam internacionalmente, conforme as políticas de cada serviço e
          o disposto nos arts. 33 e seguintes da LGPD. Nenhum conteúdo da sua
          transmissão passa por esses servidores: o vídeo sai da sua máquina
          direto para cada plataforma.
        </p>
      </LegalSection>

      <LegalSection id="retencao" n={11} title="Por quanto tempo guardamos">
        <LegalTable>
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
                  Somente durante a requisição, em memória. Não são gravados.
                </td>
              </tr>
              <tr>
                <td>Contador de tentativas por IP</td>
                <td>
                  Na memória de cada instância. A contagem expira em 60
                  segundos; entradas expiradas são removidas durante requisições
                  posteriores ou quando a instância encerra. Sem novas
                  requisições, podem permanecer na memória até esse
                  encerramento.
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
                <td>
                  Eventos técnicos e exceções redigidas do site, aplicativo e
                  API
                </td>
                <td>
                  Até 90 dias no PostHog. O IP é descartado na ingestão e não é
                  usado como dimensão.
                </td>
              </tr>
              <tr>
                <td>Preferências e UUID de telemetria do aplicativo</td>
                <td>
                  As preferências ficam no seu computador até serem alteradas ou
                  apagadas. O UUID pode ser regenerado com ambas desligadas;
                  também deixa de estar disponível no app ao reiniciar com ambas
                  desligadas.
                </td>
              </tr>
              <tr>
                <td>Preferências do site</td>
                <td>
                  A escolha de idioma fica em cookie funcional por até um ano; o
                  opt-out de métricas fica no armazenamento local até você
                  reativar as métricas ou limpar os dados do navegador.
                </td>
              </tr>
              <tr>
                <td>Suas configurações, chaves e relatórios</td>
                <td>
                  Pelo tempo que você quiser: estão no seu computador, sob a sua
                  guarda.
                </td>
              </tr>
            </tbody>
          </table>
        </LegalTable>
      </LegalSection>

      <LegalSection id="seguranca" n={12} title="Segurança">
        <p>
          Adotamos medidas técnicas proporcionais ao que o serviço faz: as
          credenciais sensíveis ficam no cofre do sistema operacional em vez de
          arquivos de texto; as respostas da API não são armazenadas em cache; o
          tamanho das requisições é limitado; os endereços de retorno do login
          são validados contra uma lista fixa; e há limite de tentativas por IP.
          O overlay para o OBS responde apenas no endereço local. Antes de cada
          evento de telemetria, uma lista fechada de propriedades e um redator
          removem segredos, texto livre, parâmetros de URL e caminhos locais; um
          evento fora do esquema é descartado.
        </p>
        <p>
          Nenhum sistema é infalível. Se identificarmos um incidente de
          segurança com risco relevante, comunicaremos os titulares e a
          Autoridade Nacional de Proteção de Dados (ANPD) na forma da lei.
        </p>
        <Callout>
          Encontrou uma falha? Fale com a gente por <Contact locale={L} /> antes
          de divulgar publicamente. A gente responde e credita quem reporta.
        </Callout>
      </LegalSection>

      <LegalSection id="direitos" n={13} title="Seus direitos">
        <p>
          A LGPD garante a você, entre outros, o direito de confirmar a
          existência de tratamento, acessar os dados, corrigir dados incompletos
          ou desatualizados, pedir anonimização, bloqueio ou eliminação de dados
          desnecessários, solicitar portabilidade, obter informação sobre
          compartilhamentos, revogar consentimento e se opor a tratamentos
          baseados em legítimo interesse.
        </p>
        <p>
          Para exercer qualquer um deles, escreva para <Contact locale={L} />.
          Vamos responder no prazo legal. Como não mantemos cadastro, a maior
          parte dos dados que dizem respeito a você já está sob o seu controle
          direto. Para dados de telemetria enviados pelo aplicativo, inclua o
          UUID copiável em Configurações para localizarmos e excluirmos os
          eventos. A telemetria cookieless do site não cria identificador
          persistente que permita isolar uma visita anterior; o controle abaixo
          impede novos envios neste navegador.
        </p>
      </LegalSection>

      <LegalSection
        id="espectadores"
        n={14}
        title="Dados dos seus espectadores"
      >
        <p>
          Ao usar chat e alertas, o seu computador recebe dados de outras
          pessoas: apelidos, mensagens, valores de doação, avisos de inscrição.
          Esses dados chegam das plataformas diretamente ao seu aplicativo e{" "}
          <strong>não passam por nós</strong>.
        </p>
        <p>
          Em relação a esse tratamento, quem decide o que fazer com esses dados
          é você — inclusive se eles vão aparecer no overlay dentro da sua
          transmissão. Recomendamos atenção ao exibir nome e valor de quem
          apoia, e cuidado com o compartilhamento de gravações e capturas de
          tela.
        </p>
      </LegalSection>

      <LegalSection id="criancas" n={15} title="Crianças e adolescentes">
        <p>
          A Corneta é uma ferramenta de produção para quem transmite ao vivo e
          não é direcionada a crianças. As plataformas de transmissão têm idade
          mínima própria, e o seu uso deve respeitá-la. Se você é adolescente,
          use o aplicativo com ciência e assistência de quem responde por você.
        </p>
      </LegalSection>

      <LegalSection id="cookies" n={16} title="Cookies e preferências locais">
        <p>
          O PostHog funciona em modo cookieless: não grava cookie ou
          identificador persistente de analytics, não faz fingerprinting e não
          cria perfil de pessoa. Existe um cookie funcional,
          <code> corneta.locale</code>, que guarda por até um ano o idioma que
          você escolheu.
        </p>
        <p>
          Se você desativar as métricas, o navegador grava apenas o valor
          “disabled” na chave <code>corneta:site-telemetry:v1</code> do
          armazenamento local. Essa preferência não é enviada ao PostHog. Do Not
          Track e Global Privacy Control também mantêm a captura desligada. Como
          não há cookie de publicidade ou analytics, disponibilizamos o controle
          direto abaixo em vez de um banner de cookies.
        </p>
        <TelemetryPreference locale={L} />
      </LegalSection>

      <LegalSection id="mudancas" n={17} title="Mudanças nesta política">
        <p>
          Se o produto mudar de forma que altere o tratamento de dados — por
          exemplo, se algum dia existir uma função opcional que dependa de
          servidor — esta política será atualizada antes de a mudança chegar a
          você, com nova data de revisão no topo da página. A versão atual é de{" "}
          {LEGAL_UPDATED_LABEL_PT}.
        </p>
        <p>
          Os <Link href={LEGAL_ROUTES.terms}>Termos de uso</Link> complementam
          esta política e explicam as regras de uso do software e do serviço de
          login.
        </p>
      </LegalSection>
    </>
  );
}
