# Segurança

## Relate vulnerabilidades em particular

**Não abra uma issue pública com detalhes de exploração, tokens, stream keys, dados pessoais ou arquivos de configuração.**

O contato já utilizado pelo projeto é **[corneta@pitrol.dev](mailto:corneta@pitrol.dev)**. Use o assunto `Corneta — relato privado de segurança`. Envie primeiro um resumo sanitizado e combine um meio adequado antes de transferir material sensível. Não envie sua chave de transmissão, senha, token OAuth ou `.env`, mesmo por e-mail.

Quando a opção **Report a vulnerability** estiver disponível na aba Security do [repositório oficial](https://github.com/pitroldev/corneta/security), ela também permite iniciar um relato privado. Não confunda essa opção com criar uma issue. A disponibilidade depende da configuração do GitHub; se não aparecer, use o contato acima.

## O que informar

- Versão e commit afetados; diga se é build oficial, de contribuição ou fork.
- Superfície: desktop, API de setup/OAuth, site, updater, chat, arquivos locais ou sidecar.
- Passos mínimos e impacto observado, usando contas e dados sob seu controle.
- Windows, OBS e ambiente relevantes; inclua horários com fuso quando úteis.
- Prova de conceito mínima e sanitizada. Não acesse dados de terceiros para demonstrar impacto.

Se uma credencial sua vazou, revogue-a no provedor e gere outra. Apagar a mensagem ou o arquivo não torna a credencial anterior segura. Preserve apenas evidências necessárias e não publique o valor comprometido.

## Versões e resposta

O projeto ainda é experimental. A triagem se concentra na branch principal e na versão oficial mais recente quando houver release; não há compromisso de backport para versões antigas ou forks. Informe problemas encontrados em outras versões para avaliarmos o alcance.

Não há SLA, equipe de plantão, programa de recompensa ou certificação de segurança prometidos. A confirmação de recebimento, a avaliação e a divulgação serão coordenadas pelo mantenedor conforme disponibilidade e gravidade. Se não receber confirmação, repita o contato sem publicar detalhes sensíveis como forma de obter resposta.

## Limites para testes

Use ambiente local isolado e contas autorizadas. Não faça testes destrutivos, varreduras agressivas, exfiltração, negação de serviço ou transmissão para contas de terceiros. O código aberto não autoriza atacar o serviço oficial ou os provedores integrados.

Para bugs sem impacto de segurança ou dúvidas de uso, siga [CONTRIBUTING.md](CONTRIBUTING.md). Segredos oficiais não são necessários para desenvolver: o [perfil de contribuição](docs/DESENVOLVIMENTO.md) existe para isso.
