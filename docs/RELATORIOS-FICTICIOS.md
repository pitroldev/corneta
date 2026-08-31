# Relatórios fictícios para teste visual

O gerador [`scripts/seed-report-fixtures.mjs`](../scripts/seed-report-fixtures.mjs) popula o diretório real de sessões da Corneta com um catálogo determinístico de cenários. Ele foi criado para testar a interface completa de Relatórios sem depender de várias transmissões reais.

## Uso

```powershell
pnpm reports:seed
```

No Windows, os arquivos são criados em:

```text
%APPDATA%\br.com.pitroldev.corneta\sessions
```

O gerador:

- remove somente fixtures da execução anterior;
- preserva todos os arquivos preexistentes em um backup com timestamp;
- mantém os horários originais desse backup;
- cria um `REPORT-FIXTURES.md` no diretório de dados com datas e cenários daquela execução;
- cria MP4s pequenos, válidos e com áudio usando o FFmpeg empacotado;
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

A Corneta mantém oficialmente 50 sessões. Os fixtures podem elevar temporariamente esse total. Ao iniciar uma nova live, a poda poderá remover relatórios mais antigos do diretório ativo; por isso o backup é criado antes da geração e o comando `reports:fixtures:restore` existe.
