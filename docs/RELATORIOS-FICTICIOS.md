# Relatórios fictícios para teste visual

O gerador [`scripts/seed-report-fixtures.mjs`](../scripts/seed-report-fixtures.mjs) cria um catálogo determinístico **fora dos dados reais do streamer por padrão**. Ele permite testar relatórios sem contas ou lives pessoais. Não carrega `.env` nem inicia o app/OBS.

## Uso

```powershell
pnpm reports:seed
```

Por padrão, os arquivos são criados no repositório, ignorados pelo Git:

```text
.artifacts/report-fixtures/sessions
```

O gerador:

- remove somente fixtures da execução anterior;
- preserva todos os arquivos preexistentes em um backup com timestamp;
- mantém os horários originais desse backup;
- cria um `REPORT-FIXTURES.md` no diretório de dados com datas e cenários daquela execução;
- gera MP4s pequenos, válidos e com áudio usando o FFmpeg empacotado **somente com `--video`**;
- valida todas as linhas NDJSON e os arquivos de vídeo antes de concluir.

Para remover apenas os fixtures:

```powershell
pnpm reports:fixtures:clean
```

Para removê-los e restaurar do backup qualquer relatório antigo que tenha sido podado enquanto os fixtures estavam instalados:

```powershell
pnpm reports:fixtures:restore
```

A restauração nunca sobrescreve um arquivo que já existe.

O padrão não precisa de FFmpeg e inclui os cenários sem geração de mídia (incluindo vídeo ausente). Para listar slugs e escolher um caso:

```sh
pnpm reports:seed --list
pnpm reports:seed --scenario live-perfeita
pnpm reports:seed --scenario gravacao-completa --video
pnpm reports:seed --video
```

Os horários são relativos à referência fixa `2026-01-15T12:00:00.000Z`, para comparar execuções. Use `--at 2026-09-06T12:00:00.000Z` se precisar de outra data. O seed pseudoaleatório de cada cenário permanece o mesmo, inclusive ao gerar um único caso.

Para visualizar no **desktop Contributor**, feche esse app e use explicitamente `--contributor`. O destino será `%APPDATA%\br.com.pitroldev.corneta.contributor\sessions`, nunca o perfil oficial. Use a mesma opção para limpar/restaurar. A pasta isolada do repositório não é importada automaticamente pelo app; a demo no navegador continua usando seu próprio mock.

```sh
pnpm reports:seed --contributor --video
pnpm reports:fixtures:clean --contributor
```

A limpeza valida o manifesto, os hashes dos arquivos, a pasta de backup e a ausência de symlinks/junctions, inclusive links cujo alvo foi removido. Se você modificou um fixture, ela recusa removê-lo; preserve sua reprodução antes de preparar uma pasta nova. Manifestos antigos do gerador pessoal não são limpos automaticamente por este comando. Backups são preservados e não são enviados ao Git.

A geração verifica antecipadamente colisões de nomes de relatório, chat e vídeo. Depois prepara e valida os arquivos em uma pasta exclusiva `.report-fixtures-staging-*`, sem remover a geração anterior até essa etapa terminar. Uma falha deixa essa pasta para inspeção; não a trate como relatório instalado. A publicação registra antes os caminhos/hashes planejados e usa cópias exclusivas, permitindo limpar uma publicação interrompida sem sobrescrever um arquivo que outro processo tenha criado. Arquivos divergentes continuam bloqueando a limpeza.

O backup guarda os arquivos de `sessions` que existiam antes da substituição, incluindo fixtures de uma execução anterior. Portanto, `--restore` também pode trazê-los de volta se estiverem ausentes. A restauração verifica todos os caminhos antes da remoção e nunca segue links nem sobrescreve um destino já existente. Feche o desktop Contributor durante geração, limpeza e restauração.

### O que observar em cada família

Timestamps de relatório/chat são milissegundos inteiros; métricas como CPU mantêm suas frações. Os testes do gerador cobrem esse contrato para não produzir marcadores incompatíveis com as fronteiras nativas.

| Família                       | Resultado esperado                                                              |
| ----------------------------- | ------------------------------------------------------------------------------- |
| Completa/multissegmento       | Vídeo válido, seek atravessando segmentos e chat com relógio coerente.          |
| Sem vídeo/removido            | Relatório continua utilizável; ausência é informada sem bloquear gráficos/chat. |
| Longa/raid                    | Chat limitado/paginado e interface responsiva; a live continua protagonista.    |
| Interrompida/crash/relógio    | Duração e recuperação coerentes; não transformar saltos em centenas de horas.   |
| Legado/sem amostras           | Campos ausentes não inventam dados; estado vazio oferece contexto.              |
| Múltiplos destinos/incidentes | Falha isolada não faz todas as plataformas parecerem indisponíveis.             |

## Cenários gerados

1. Gravação completa e sincronizada, com MP4 real, áudio, chat e finalização normal.
2. Live longa perfeita em Twitch, YouTube e Kick.
3. Upload saturado afetando simultaneamente todos os destinos.
4. Falha isolada da Kick com as demais plataformas saudáveis.
5. Sobrecarga de CPU/GPU e perda de frames do encoder.
6. Lag de renderização do OBS sem CPU/GPU excessivas.
7. Sinal do OBS perdido e posteriormente recuperado.
8. Raid viral com explosão de audiência, chat e alertas.
9. Live curta, silenciosa, sem alertas e sem vídeo.
10. Gravação retomada em dois MP4s depois de o FFmpeg morrer.
11. Crash recuperado no boot com vídeo truncado.
12. Salto do relógio do sistema e ajuste manual de sincronia.
13. Relatório legado schema v1 sem os campos modernos.
14. Metadado de gravação cujo arquivo foi removido externamente.
15. Estados JÁ VOLTO e censura do Guardião sem falso positivo de queda.
16. Sessão abortada antes da primeira amostra, sem dados úteis.
17. Navegador disputando CPU com a transmissão.
18. Pressão de memória atribuível ao navegador.
19. O próprio OBS disputando a GPU.

Também há variações de:

- modo por plataforma, híbrido e passthrough;
- uma a quatro saídas simultâneas;
- audiência crescente, baixa e com pico de raid;
- seguidores por canal;
- todos os tipos de alerta suportados;
- chat por plataforma, replay de chat, mensagem moderada e lacuna de conexão;
- marcadores manuais;
- reconexão, erro, bitrate baixo, congestionamento e perda de sinal;
- gravação inexistente, única, multissegmento, interrompida e ausente no disco.

## Retenção

A Corneta mantém oficialmente 50 sessões. Na pasta descartável do repositório não há app fazendo poda. No perfil Contributor, fixtures podem elevar temporariamente esse total e uma live de teste pode podar sessões antigas daquele perfil; por isso há backup/restauração. A instalação oficial não é alterada por estes comandos.
