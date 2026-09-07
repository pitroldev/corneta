# Revisão de materiais públicos

Revisão de 2026-09-06 para OS-07. Os bytes revisados estão registrados em [`compliance/public-assets-review.json`](../compliance/public-assets-review.json); os testes detectam alterações e inclusões nas pastas inventariadas. Atualizar um hash não substitui revisar o material.

## Escopo e resultado

- **11 masters PNG e 11 derivadas WebP editoriais:** inspecionados visualmente. Foram observados nomes de demonstração, métricas fictícias, placeholders, chaves mascaradas e destinos públicos ou `demo.invalid`; não foi identificada credencial real legível, conversa pessoal, notificação privada ou caminho de usuário nas imagens.
- A chave `obs` mostrada junto de `127.0.0.1` é o exemplo de ingestão local, não a stream key de uma conta de plataforma. Chaves de contas não devem aparecer em screenshots, mesmo parcialmente.
- **Ícones e arte do instalador:** PNGs inspecionados; BMPs comparados pixel a pixel com os PNGs correspondentes, com igualdade. O PNG embutido no ICO é idêntico ao ícone de 256 px revisado. A arte tem geração no próprio repositório. O SVG do site foi inspecionado como código vetorial passivo.
- Total: **36 arquivos visuais e o README de orientação dos masters** registrados. O [manifesto editorial](../web/content/assets/manifest.json) já declara procedência própria e captura em modo de demonstração. Foi preservada a versão verdadeira das capturas, 0.6.0; não foram reclassificadas como imagens atuais da 0.7.0.
- A captura de chat contém marcas e emotes de plataforma como parte da interface; isso não transfere titularidade desses elementos à Corneta. A revisão visual verifica exposição, não concede direitos sobre marcas ou emotes.

Modelos ONNX, vídeos pessoais, relatórios NDJSON e fontes binárias não estão incluídos nesses assets rastreados. Dependências obtidas no install/build/runtime precisam de seus próprios avisos e verificação de distribuição; ver [avisos de terceiros](../THIRD_PARTY_NOTICES.md).

## Ao adicionar ou trocar um arquivo

1. Prepare perfil descartável e dados fictícios antes de capturar. Nunca use blur para esconder uma credencial real como única proteção.
2. Revise o original e a derivada em resolução legível, incluindo título de janela, caminhos, tooltips, nomes, URLs, chat e notificações.
3. Registre a procedência e o direito de uso. Não chame assets de terceiros de autoria própria.
4. Confira texto/metadados embutidos e formato; siga o [protocolo editorial](../web/content/README.md).
5. Atualize o inventário e explique no PR a revisão feita. Não atualize hashes em massa só para obter um teste verde.

Rode `pnpm exec vitest run scripts/public-assets.test.ts` e os checks editoriais pertinentes. O teste inventaria todos os arquivos nas raízes fixadas, rejeita links simbólicos/junctions e impede substituição silenciosa dos bytes. Para Markdown/SVG, o hash normaliza somente CRLF para LF, respeitando a conversão normal do Git entre Windows e Linux. Não é um detector de informações pessoais, não inspeciona anexos do GitHub nem cobre arquivos novos fora dessas raízes. Faça também a [varredura de segredos](SEGURANCA-REPOSITORIO.md).

A identidade do autor, os dados públicos de operação presentes nas páginas legais e os contatos publicados intencionalmente pelo projeto não foram removidos como se fossem credenciais. Não houve inspeção ou publicação dos relatórios, gravações e `.env` privados da máquina do mantenedor.
