# Contrato de performance

Referência: linha 0.7.0. A promessa de resposta rápida deve ser sustentada por cenários e medições, não por uma garantia universal de “blazing fast”. Mudanças no caminho da live precisam comparar antes/depois no mesmo hardware, modo e carga.

## Gates automatizados

| Cenário             | Medição / critério                                                                                                                                              |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bundle de entrada   | Até 250 KiB JS gzip, 55 KiB CSS gzip e 256 KiB de outros assets por grafo estático; cada chunk JS até 110 KiB gzip. `pnpm bundle:check`.                        |
| Relatório longo     | 8 horas, 14.400 amostras e quatro destinos. Teste de regressão do parser/analisador com teto 750 ms; não confundir com primeiro paint.                          |
| Benchmark local     | `pnpm benchmark:reports`: cinco aquecimentos, 25 medições, p50/p95/máximo; JSON ignorado em `.artifacts/performance/report.json`. Teto sintético p95 de 750 ms. |
| Browser de produção | `pnpm smoke:reports`: Chromium descartável, worker real de `dist`, dados fictícios e chat volumoso com paginação limitada. Não exige contas.                    |
| Build               | `pnpm benchmark:build`: registrar frio/quente e versões; não comparar máquinas/caches diferentes como ganho do código.                                          |

O benchmark Node exclui a criação/serialização da fixture, disco, React, IPC e GPU. O teste unitário existente inclui a serialização no seu cronômetro: os números não são intercambiáveis. Preserve o teto do teste e investigue regressões antes de aumentá-lo. A [baseline sintética](../compliance/performance-baseline.json) identifica cenário, ferramenta e hardware; não certifica lives reais.

## Medições em ambiente real

A evidência sintética registra o SHA-256 da fixture e dos fontes medidos (`source.sourceTreeSha256`), além do HEAD disponível. O hash inclui as alterações locais: HEAD sozinho não identifica um benchmark executado em uma árvore modificada. A seleção de arquivos está em `scripts/benchmark-source.mjs`; normaliza CRLF para LF, ordena os caminhos e calcula SHA-256 do manifesto de hashes. Credenciais e artefatos ficam fora. Se os fontes mudarem durante a execução, o benchmark falha e não grava o resultado. Para atualizar a baseline, conclua as edições, rode novamente e copie o JSON medido; não reaproveite números de outra árvore.

Use estes procedimentos para complementar os gates sintéticos. A matriz e as evidências exigidas para uma distribuição estão em [Publicação](PUBLICACAO.md); resultados de uma execução não aprovam automaticamente outra versão ou configuração.

| Medição                          | Procedimento reproduzível                                                                                                                                                                    | Limite da evidência                                                            |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Startup frio/quente              | Versão/SHA do instalador; perfil vazio versus existente; 10 partidas por condição; tempo até interação útil, p50/p95. Separar updater e rede.                                                | Exige medição no aplicativo instalado; benchmark de parsing não mede startup.  |
| Abrir relatório e marcar momento | Mesmo relatório/volume; medir clique → feedback/primeiro conteúdo e conclusão de análise separadamente; confirmar player sem remontagem.                                                     | Smoke cobre comportamento, não percepção humana ou latência nativa.            |
| Chat sob carga                   | Mesmo ritmo/volume e número de canais; medir resposta ao scroll/envio, elementos montados e retenção; não confundir mensagens recebidas com renderizadas.                                    | Cenários sintéticos precisam ser complementados pela medição nativa.           |
| CPU/GPU e memória                | OBS/sinal idênticos, resolução/FPS, destinos, cópia/híbrido/encode; Corneta e cada sidecar separados, incluindo memória GPU.                                                                 | Resultados dependem do hardware, driver e carga concorrente declarados.        |
| Live longa                       | Pelo menos 2 h no ensaio inicial; capturar série após aquecimento e comparar crescimento sustentado com volume e limites. Para distribuição, seguir a duração exigida no guia de publicação. | Um pico isolado de RSS não demonstra vazamento; avalie crescimento sustentado. |
| Encerramento                     | Parar/fechar/cancelar setup durante reconexão; verificar liberação de portas/arquivos e ausência dos filhos pertencentes à sessão.                                                           | Testes de política não substituem ensaio real.                                 |

Registre modelo CPU/GPU, RAM, Windows, driver, Node/Rust/WebView2/OBS, energia, gravação, Guardião e processos concorrentes relevantes. Não publique hostname, caminho pessoal, token, chat ou janela privada. Defina o orçamento de CPU/GPU/RSS depois dessa baseline: números inventados podem aprovar uma regressão ou excluir hardware sem evidência.

Para uma comparação, use ao menos três execuções equivalentes. Uma piora reproduzível de p95 superior a 20% merece investigação, mesmo abaixo do teto absoluto; esse percentual é um critério de revisão, não falha automática em runner compartilhado. Para memória, avalie inclinação após aquecimento e limites de retenção, não só memória alocada no fim.

## Invariantes de implementação

Não bloquear a transmissão com coleta, disco, relatórios ou telemetria. Preserve filas limitadas, descarte planejado, cancelamento, reuso de rendições, pools de frames e isolamento do gravador. No React, preserve lazy loading, imports condicionais, worker, chat virtualizado/paginado e assinaturas de estado estreitas. Menos código não prova menos CPU; um cache sem teto pode trocar tempo por vazamento.
