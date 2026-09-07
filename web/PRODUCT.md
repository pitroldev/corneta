# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Streamers brasileiros que usam OBS ou outro programa de transmissão compatível com RTMP e querem transmitir para mais de uma plataforma sem manter servidores ou depender de uma assinatura de relay. O público inclui iniciantes que precisam de um fluxo guiado e streamers experientes que valorizam controle por destino, resiliência e privacidade.

## Product Purpose

O site público apresenta e distribui a Corneta, um app desktop que recebe um único sinal RTMP local e o envia para múltiplos destinos. O OBS é o programa recomendado por ter integração de configuração, controle e estatísticas. O sucesso da superfície pública é fazer o visitante entender o benefício em poucos segundos e baixar o app para Windows.

A Corneta está pronta para uso em Windows x64. O app não deve ser apresentado como experimental ou em preparação para beta. Os rótulos experimentais se aplicam somente aos recursos e integrações específicos listados neste documento, não ao produto como um todo. A disponibilidade de instaladores acompanha as releases publicadas.

## Positioning

A Corneta faz o multistream rodar localmente e mantém cada destino independente. Isso permite acompanhar, reconectar, pausar e ajustar saídas separadamente, sem mensalidade de relay e mantendo chaves, configurações e relatórios no computador do streamer.

## Operating Context

O streamer prepara cenas, câmera e áudio no OBS ou em outro programa compatível com RTMP. A Corneta entra depois dele: recebe o sinal local, mede o upload disponível, distribui a transmissão, acompanha os destinos e reúne informações úteis durante e depois da live. A configuração automática, o controle de início/parada e as estatísticas integradas são específicos do OBS; outras fontes exigem apontar manualmente o servidor e a chave locais.

## Capabilities and Constraints

- App atual Windows-first; não há builds públicos confirmados para macOS ou Linux.
- Requer uma fonte de vídeo/áudio compatível com RTMP. O OBS é recomendado, mas não obrigatório; aceitar o sinal de outro programa não implica oferecer a mesma integração de configuração, controle e estatísticas.
- Multistream, configuração do OBS, teste de upload, destinos independentes, chat, alertas, audiência agregada e relatórios existem no produto.
- Chaves de transmissão ficam no cofre nativo do sistema.
- Três modos de qualidade existem e têm estes nomes na interface: “Na lata” (copia o sinal do OBS para todos), “Esperto” (copia o que já serve e recodifica só o que precisa) e “Caprichado” (recodifica cada destino com o preset da plataforma). O app estima upload somado, número de recodificações e carga antes da live.
- Recodificação usa encoder de hardware quando disponível (NVENC, QSV, AMF) e cai para software; o app estima quantas sessões simultâneas a placa aguenta.
- Recorte vertical 9:16 com panorâmica e zoom existe (editor de enquadramento + filtro no motor) para destinos que só aceitam vídeo em pé.
- Chat unificado lê Twitch, Kick e YouTube com emotes (BTTV/FFZ/7TV e nativos), selos e horário; envia mensagens e permite apagar e dar timeout. Existe janela flutuante com chat, alertas ou os dois.
- Alertas nativos (seguidor, sub, resub, subgift, bits, raid, membro, superchat) e fontes externas (Streamlabs, StreamElements) existem; tokens ficam no cofre.
- Overlay para OBS existe: servidor local em loopback serve alertas e chat como Browser Source, com posição, tamanho, duração, som e limites configuráveis, além de alerta de teste.
- Auto-bitrate existe e age nos destinos que estão recodificando. Normalizador de áudio (loudnorm) existe e é opt-in.
- YouTube automático existe: com a conta conectada, o app cria a transmissão e injeta a chave no início da live.
- Atalho global, bandeja, iniciar com o Windows, tema claro/escuro, perfis de destino e backup da configuração existem.
- Métricas por destino durante a live existem: bitrate, fps, quadros perdidos, tempo no ar, além de CPU, GPU e estatísticas do OBS.
- Co-stream com convidados (“Mesa”) existe no código, mas está desligado por feature flag e não deve ser divulgado.
- A implementação de Twitch não é uma certificação de operação real. Esta fonte não apresenta um ensaio verificável de live por plataforma; a matriz externa deve ser registrada e aprovada antes da distribuição.
- TikTok, Instagram e X são experimentais.
- Proteção por tela “JÁ VOLTO” em queda do OBS existe.
- O Guardião de termos é experimental e depende de configuração explícita do usuário. Adiciona 12 s de atraso e procura apenas os termos listados; pode deixar passar texto. Durante preparação, falha ou atraso excessivo da leitura, cobre imagens não verificadas com JÁ VOLTO, sem encerrar a conexão. O vídeo pode retornar automaticamente após uma leitura válida sem termo listado. Essa proteção não censura o áudio, que continua sendo transmitido.
- Detecção de tela preta ou congelada não deve ser apresentada como concluída.
- Cada destino consome upload; transcode também pode consumir CPU ou GPU.
- O núcleo local é gratuito e o projeto usa licença MIT.

## Brand Commitments

- O nome do produto é Corneta.
- A marca existente e o símbolo de corneta são ativos reconhecíveis do produto.
- A voz deve ser casual, direta, brasileira e atraente para streamers.
- Evitar linguagem excessivamente técnica, formal ou editorial.
- A comunicação deve ser divertida sem parecer infantil e confiante sem esconder limitações.

## Evidence on Hand

- Interface funcional do app em `../src/`.
- Preview visual em `app/_components/product-preview.tsx`.
- Conta de banda e carga da LP espelha `../src/lib/estimates.ts` com os presets de `../src/lib/platforms.ts`; qualquer número exibido deve continuar saindo dessa conta.
- Copy dos recursos e das ressalvas espelha os rótulos do app (`../src/screens/SettingsScreen.tsx`, `EncodingScreen.tsx`, `ChatScreen.tsx`).
- [Checklist de publicação](../docs/PUBLICACAO.md) e [critérios de validação real](../docs/GATES-DE-RELEASE.md). São requisitos, não evidência de que um ensaio ocorreu. Ao documentar um ensaio, registrar plataforma, versão/commit, data, cenário, ambiente e resultado verificável antes de anunciar validação.
- Arquitetura e funcionalidades documentadas em `../README.md` e `../docs/`.
- Licença MIT em `../LICENSE`.
- Não há depoimentos, números públicos de usuários, benchmarks comerciais ou logos de clientes; não devem ser fabricados.

## Product Principles

1. Explicar o resultado antes da tecnologia.
2. Mostrar o app trabalhando em vez de acumular alegações.
3. Ser transparente sobre plataforma, upload e recursos experimentais.
4. Manter uma única ação principal: baixar a versão para Windows.
5. Fazer iniciantes se sentirem capazes sem afastar streamers experientes.

## Accessibility & Inclusion

O site deve funcionar por teclado, respeitar redução de movimento, manter contraste WCAG AA, usar estrutura semântica clara e permanecer utilizável em mobile e com zoom de 200%.
