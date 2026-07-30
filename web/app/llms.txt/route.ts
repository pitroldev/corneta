import { FAQS, FEATURES, ONE_LINER, STEPS } from "@/lib/content";
import { LEGAL_CONTACT, LEGAL_OPERATOR, LEGAL_ROUTES } from "@/lib/legal";
import { siteUrl } from "@/lib/site";

// /llms.txt — convenção emergente (llmstxt.org) que entrega a um modelo um
// resumo curado do site em markdown, em vez de deixá-lo adivinhar a partir do
// HTML. Não é padrão sancionado por ninguém e pode ser ignorado; o custo é uma
// rota estática, e o ganho é controlar a frase que o motor generativo copia.
//
// O conteúdo sai das MESMAS constantes da página. Nada exclusivo aqui: um
// arquivo pra robô que diz algo diferente do que o humano lê é cloaking.

export const dynamic = "force-static";

const abs = (path: string) => new URL(path, siteUrl).toString();

function body() {
  return `# Corneta

> ${ONE_LINER}

Multistream local, gratuito e open source (licença MIT), para Windows 10 e 11.
Feito para streamers brasileiros. Não é serviço de nuvem, não tem assinatura e
não exige cadastro: o vídeo sai do computador do streamer direto para cada
plataforma.

## O que a Corneta faz

${FEATURES.map((f) => `- ${f}`).join("\n")}

## O que a Corneta NÃO é

- Não substitui o OBS: cenas, câmera e áudio continuam no programa de captura.
- Não é relay em nuvem: nenhum servidor nosso recebe, armazena ou repassa vídeo.
- Não exige conta na Corneta — não existe cadastro nem login no site.
- Não tem versão para macOS ou Linux até agora, e não há data pública.

## Como usar em três passos

${STEPS.map((s, i) => `${i + 1}. **${s.title}** — ${s.text}`).join("\n")}

## Plataformas

Prontas no app: Twitch, YouTube, Kick, Facebook e qualquer servidor RTMP ou
RTMPS personalizado. Experimentais, porque dependem de liberação da própria
plataforma: TikTok, Instagram e X. Até agora, a Twitch é a plataforma com
transmissão real documentada de ponta a ponta.

## Perguntas frequentes

${FAQS.map((f) => `### ${f.question}\n\n${f.answer}`).join("\n\n")}

## Páginas

- [Site e download](${abs("/")})
- [Política de privacidade](${abs(LEGAL_ROUTES.privacy)})
- [Termos de uso](${abs(LEGAL_ROUTES.terms)})
- [Código-fonte](https://github.com/pitroldev)

## Quem responde

${LEGAL_OPERATOR} — contato: ${LEGAL_CONTACT}
`;
}

export function GET() {
  return new Response(body(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
