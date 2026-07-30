// Fatos do produto que a página E os dados estruturados precisam.
//
// Vive num arquivo só de propósito: FAQ renderizada e FAQPage do schema.org
// saem daqui juntas, então é impossível o texto visível e o que o buscador lê
// divergirem — que é o jeito clássico de tomar penalidade por conteúdo
// inconsistente.

/** Última revisão do conteúdo da home — alimenta o `lastModified` do sitemap.
 *  Atualize quando a copy mudar de verdade: data que mexe a cada build vira
 *  ruído e o buscador aprende a ignorar. */
export const CONTENT_UPDATED_ISO = "2026-07-30";

export type Faq = { question: string; answer: string };

/** Perguntas na ordem em que travam o download, não na ordem do produto. */
export const FAQS: Faq[] = [
  {
    question:
      "Posso transmitir na Twitch e no YouTube ao mesmo tempo? Não dá ban?",
    answer:
      "Quem decide isso é cada plataforma, não a Corneta — e essas regras mudaram nos últimos anos: hoje várias permitem, com condições que dependem do seu tipo de conta ou de contrato assinado. A Corneta não muda esse combinado, ela só manda o sinal pra onde você mandar. Antes da primeira live simultânea, dá uma lida nos termos de quem você já tem compromisso. São cinco minutos que evitam dor de cabeça.",
  },
  {
    question: "Uso Streamlabs (ou XSplit). Funciona?",
    answer:
      "Funciona. A Corneta aceita qualquer programa que transmita por RTMP — é só apontar ele pro endereço que o app mostra, igual você faria com uma plataforma. No OBS tem um atalho a mais: a Corneta configura sozinha e ainda dá play nele quando você aperta o BORA.",
  },
  {
    question: "A Corneta substitui o OBS?",
    answer:
      "Não. Você continua montando cenas, câmera e áudio no seu programa de sempre. A Corneta entra depois: pega esse sinal e cuida das plataformas, do acompanhamento e das proteções da transmissão.",
  },
  {
    question: "É grátis mesmo? Vai virar assinatura depois?",
    answer:
      "É grátis, sem cadastro e sem período de teste. Tudo que roda no seu PC — multistream, chat, alertas, relatórios e proteções — é open source com licença MIT e vai continuar assim. Se um dia existir algo pago, será um serviço opcional na nuvem, e você vai saber antes de instalar qualquer coisa.",
  },
  {
    question: "Vai travar meu jogo? Preciso de placa de vídeo boa?",
    answer:
      "Depende do modo. Copiando o sinal do seu programa, o custo é quase zero — dá pra usar em máquina modesta. Melhorando a imagem pra cada plataforma, o trabalho vai pra placa de vídeo (as NVIDIA, Intel e AMD das últimas gerações dão conta) ou, sem ela, pro processador, que pesa mais. A Corneta estima essa carga e quantas conversões sua placa aguenta antes de você entrar ao vivo.",
  },
  {
    question: "Vou precisar de muita internet?",
    answer:
      "Cada plataforma come um pedaço do seu upload. Antes da live, a Corneta mede sua conexão, soma tudo e ajuda você a escolher uma configuração que caiba com folga.",
  },
  {
    question: "Dá pra mandar vídeo em pé pro TikTok?",
    answer:
      "A Corneta recorta um 9:16 do seu vídeo deitado e você escolhe o enquadramento, com prévia do resultado. TikTok e Instagram seguem experimentais porque a entrada depende de liberação da própria plataforma; o mesmo recorte serve pra qualquer destino RTMP vertical.",
  },
  {
    question: "Tem overlay pra usar no OBS?",
    answer:
      "Tem. Um servidor dentro da sua máquina serve os alertas e o chat (com emotes) numa URL que você adiciona como Browser Source — uma vez só. Posição, tamanho, duração, som e limite de mensagens são ajustáveis, e tem botão de alerta de teste pra você conferir na hora.",
  },
  {
    question: "Quais plataformas aparecem no app?",
    answer:
      "Twitch, YouTube, Kick, Facebook e qualquer servidor RTMP que você quiser somar. TikTok, Instagram e X aparecem como experimentais porque dependem de liberação e de fluxos das próprias plataformas.",
  },
  {
    question: "Funciona em macOS ou Linux?",
    answer:
      "Hoje o download é só pra Windows. A arquitetura já considera outros sistemas, mas ainda não tem data pública pra esses builds — e a gente prefere avisar isso agora do que depois do download.",
  },
];

export type Step = { title: string; text: string };

export const STEPS: Step[] = [
  {
    title: "Escolha onde quer aparecer",
    text: "A Corneta abre a página certa de cada plataforma pra você copiar a chave, e guarda ela no cofre do Windows — nunca num arquivo de configuração.",
  },
  {
    title: "Ligue o seu programa de live",
    text: "No OBS, a Corneta configura sozinha. Em qualquer outro (Streamlabs, XSplit), é colar um endereço e uma chave — uma vez só, e nunca mais.",
  },
  {
    title: "Aperte BORA AO VIVO",
    text: "Acompanhe cada plataforma e siga cuidando do conteúdo. Se quiser, a Corneta manda o OBS começar a transmitir junto.",
  },
];

/** Uma frase por recurso — vira `featureList` do schema e resposta citável. */
export const FEATURES = [
  "Multistream de um sinal só para Twitch, YouTube, Kick, Facebook e qualquer servidor RTMP",
  "Cada plataforma com conexão independente: se uma cai, as outras continuam no ar",
  "Três modos de qualidade — copiar o sinal, converter só o que precisa ou converter tudo",
  "Estimativa de upload somado e de carga na placa antes de entrar ao vivo",
  "Recorte vertical 9:16 com enquadramento manual para TikTok e Instagram",
  "Chat unificado de Twitch, Kick e YouTube com emotes, envio e moderação",
  "Alertas das plataformas e do Streamlabs/StreamElements no mesmo painel",
  "Overlay de alertas e chat para OBS servido localmente como Browser Source",
  "Tela “JÁ VOLTO” que segura a transmissão quando o sinal do programa cai",
  "Auto-bitrate quando a internet aperta e normalizador de áudio opcional",
  "Relatório pós-live com audiência, chat, alertas e trechos com problema",
  "Chaves de transmissão guardadas no cofre de credenciais do Windows",
];

/** O que cada login oficial pede e por quê.
 *
 *  Existe por dois motivos: o streamer merece saber o que está autorizando, e a
 *  verificação de marca do Google exige que a home explique o uso dos dados do
 *  usuário. Os escopos são os mesmos do código (src-tauri/src/auth.rs) — se
 *  mudarem lá, mudam aqui. */
export const ACCOUNT_SCOPES = [
  {
    platform: "youtube" as const,
    title: "Conta do YouTube (Google)",
    permission: "Gerenciar sua conta do YouTube",
    why: "Criar a transmissão ao vivo e pegar a chave sozinha, encerrar a transmissão no fim, ler e enviar mensagens no chat ao vivo e mostrar quantas pessoas estão assistindo.",
    never:
      "A Corneta não publica vídeo no seu canal, não altera vídeos existentes, não lê seu histórico e não usa esses dados para anúncio ou treinamento de modelo.",
  },
  {
    platform: "twitch" as const,
    title: "Conta da Twitch",
    permission: "Ler e enviar no chat, moderar e gerenciar a transmissão",
    why: "Mostrar o chat no app, responder por lá, apagar mensagem ou dar timeout quando você mandar, e acompanhar o estado da sua live.",
    never:
      "Nada é postado no seu canal sem você pedir, e a Corneta não segue, não inscreve nem altera nada da sua conta.",
  },
  {
    platform: "kick" as const,
    title: "Conta da Kick",
    permission: "Ler o canal, enviar no chat e moderar",
    why: "As mesmas coisas do chat unificado: ler, responder e moderar sem sair do app.",
    never:
      "É o único login que passa pelo nosso servidor, porque a Kick exige um segredo de servidor na troca — e mesmo assim o token não é armazenado em lugar nenhum.",
  },
];

/** Frase única e citável: é o que motor generativo tende a extrair. */
export const ONE_LINER =
  "A Corneta é um aplicativo gratuito e de código aberto para Windows que recebe um único sinal de vídeo do OBS (ou de qualquer programa que transmita por RTMP) e o retransmite ao mesmo tempo para Twitch, YouTube, Kick, Facebook e outros destinos, com cada plataforma em conexão independente, chat e alertas reunidos e processamento inteiramente no computador do streamer.";
