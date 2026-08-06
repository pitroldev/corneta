# Gravação da live + replay no relatório — planejamento técnico

> Gravar a live (**vídeo** e **chat**) e transformar o relatório pós-live numa **linha do tempo
> navegável**: arrastar o vídeo move o cursor de todos os gráficos, e clicar numa queda de bitrate,
> num alerta ou num destaque salta o vídeo pra aquele segundo. O chat volta a rolar no ritmo em que
> rolou. É o replay da live com as estatísticas correndo junto.

- **Status:** ✅ Implementado (Fases 1–3) · 2026-07-31 — falta a validação numa live de
  verdade (§12). Núcleo do mapeamento em `src/lib/replay.ts` (24 testes) e o gravador em
  `src-tauri/src/recorder/` (núcleo puro + adaptadores, ver §14).
- **Relacionado:** [`RELATORIO-POS-LIVE.md`](./RELATORIO-POS-LIVE.md) (a linha do tempo que já
  existe), [`FEATURE-MAQUINA-DO-TEMPO.md`](./FEATURE-MAQUINA-DO-TEMPO.md) (§13 — o gravador contínuo
  muda o plano do clipe), [`CHAT.md`](./CHAT.md)

---

## 0. Objetivo

Hoje o relatório conta o que aconteceu em números: "aos 23:40 a Twitch caiu por 8s e a CPU estava em
98%". O streamer acredita, mas não **vê**. Com a gravação, aquele mesmo instante vira um clique: o
vídeo pula pro segundo 1420, o chat mostra as sete mensagens de "travou?" que chegaram ali, e o
gráfico de bitrate desenha o buraco embaixo. Diagnóstico e memória da live no mesmo lugar.

O que esta feature **não** é: um substituto pra gravação do OBS. O OBS grava a fonte; a Corneta grava
**o que foi ao ar** — com slate de JÁ VOLTO, com o que o splicer emendou, com o que cada plataforma
recebeu. São artefatos diferentes, e o segundo é o que explica o relatório.

---

## 1. Por que isso é barato aqui (e difícil em qualquer outro lugar)

As três peças já existem e — o que importa — **já estão no mesmo relógio**:

| Peça | Onde está hoje | O que falta |
|---|---|---|
| Vídeo já codificado (h264+aac) | o feed de programa que os destinos leem | copiar pro disco (`-c copy`) |
| Série temporal de métricas em epoch ms | `session.rs` (NDJSON de amostras/alertas/viewers) | nada |
| Chat com `ts` em epoch ms | `chat.rs:52` (`ChatMessage.ts`) | persistir |

Gravar não custa encode: o programa **já está codificado** pra ir pras plataformas, então o gravador
é uma cópia de bitstream — mesmo princípio do splicer. E como o relatório inteiro já é epoch ms, o
vídeo precisa de **uma única âncora** pra se alinhar com tudo (§3.4). Não há sincronização a
construir, há um offset a registrar.

---

## 2. As duas gravações nascem DESLIGADAS

> **Leitura do pedido:** "opt-out por padrão" foi lido como **desligado por padrão — quem quiser,
> liga**. Se a intenção era o contrário (nasce ligado e o streamer desliga), me avise: muda o default
> de duas chaves e a redação do onboarding, não muda mais nada da arquitetura.

São **duas chaves independentes**, e ligar uma não liga a outra — porque os motivos de recusar cada
uma são diferentes:

- **Vídeo:** custa **disco**, muito. A 6000 kbps são ~45 MB/min → **~2,7 GB/hora**. Uma live de 4h
  come quase 11 GB. Ligar isso sem o streamer pedir seria encher o SSD de alguém em duas semanas.
- **Chat:** custa **dado pessoal**. Guardar quem falou o quê é diferente de guardar "12 mensagens
  neste minuto" (que é o que o relatório já faz). É o streamer que decide se quer esse arquivo na
  máquina dele — e a política de privacidade precisa dizer isso (§10).

Nenhum dos dois sobe pra lugar nenhum. Continua valendo o que a página de privacidade promete: sem
telemetria, sem conta, sem nuvem.

---

## 3. Arquitetura

### 3.1 Três arquivos por sessão, não um

```text
app_data_dir/sessions/
  1785516333000.ndjson        ← métricas (JÁ EXISTE)
  1785516333000.chat.ndjson   ← mensagens de chat            (novo)

<pasta escolhida pelo streamer>/          (padrão: a mesma acima)
  1785516333000.mp4           ← vídeo do programa            (novo)
```

O vídeo é o único que sai de casa: ele é 99,9% do peso e a pasta dele é configurável (§6.1) — o
streamer normalmente tem um HD onde gravação pode morar. Métricas e chat ficam sempre em
`app_data_dir`, porque são o relatório em si e precisam estar onde o app sabe procurar.

Separar não é organização, é defesa. Três motivos concretos:

1. **O teto de 32 MiB** (`session.rs:20`) já descarta amostra em silêncio quando estoura
   (`session.rs:57`). Jogar chat no mesmo arquivo faria uma live movimentada **comer o orçamento das
   métricas** e degradar o relatório que hoje funciona. Chat barulhento não pode custar o
   diagnóstico.
2. **Apagar chat sem perder o relatório.** Pedido de LGPD, arrependimento, print vazando — o
   streamer apaga o `.chat.ndjson` e o relatório continua inteiro.
3. **Apagar vídeo sem perder nada.** O MP4 é 99,9% do peso; a limpeza por espaço (§7) tem que poder
   levar só ele.

### 3.2 Gravador de vídeo

**Um FFmpeg dedicado, `-c copy`, saída fMP4.** Nasce junto com a sessão e morre com ela.

```bash
ffmpeg -hide_banner -loglevel warning
       -i <MESMA URL QUE OS DESTINOS LEEM>
       -c copy
       -movflags +frag_keyframe+empty_moov+default_base_is_moof
       -f mp4 <sessions>/<id>.mp4
       -progress pipe:1 -nostats
```

**A fonte é a mesma decisão que o destino já toma.** Em `commands.rs:1330-1336` o destino lê o
`_program` **só quando o compositor/splicer está ligado**; sem ele, lê o path de ingestão do OBS
direto. O gravador tem que herdar exatamente essa escolha — hardcodar `_program` grava um path que
pode não existir, e o gravador morreria calado na configuração mais simples de todas.

> **Como ficou:** em vez de extrair uma função nova, o gravador recebe a MESMA variável
> `out_source` que os supervisores de destino já usam, no mesmo escopo. Uma variável só, um
> valor só — não há como as duas leituras divergirem porque não existem duas leituras.

**Por que fMP4 e não MP4 comum:** MP4 normal só fica legível quando o `moov` é escrito **no fim**. Se
faltar energia às 3h de live, o arquivo inteiro é lixo. Com `frag_keyframe+empty_moov` cada fragmento
já é reproduzível — queda de energia custa os últimos segundos, não a live. (MKV também é resiliente,
mas o Chromium não toca MKV, e o player do relatório é o webview.)

O preço do fMP4 é a navegação: sem índice global, pular pro minuto 187 é ruim. Quem paga essa conta é
o **remux de finalização** (§9.5), que roda depois da live e devolve o índice sem re-encode.

**Supervisão:** entra no mesmo `HashMap` de filhos que o motor já mantém (`engine.rs:777`), com um id
próprio (`"__recorder"`). Estar lá é o que faz todos os caminhos de encerramento que já existem
(`kill_engine`, `taskkill /T /F`, a limpeza de órfãos do boot) levarem o gravador junto **de graça**.

> **Como ficou:** encerrar MATA o processo, sem `q` no stdin. Parecia grosseiro no plano, mas o
> `q` exigiria manter a posse do `CommandChild` fora do mapa — e aí o gravador escaparia
> justamente da limpeza que o mapa garante. Como o fMP4 sobrevive a ser morto (é a razão de ele
> existir aqui) e o remux conserta o índice depois, matar é o caminho que troca elegância por
> uma garantia a mais.

> **REGRA DURA — a gravação nunca pode derrubar a live.** É a mesma regra do updater, pelo mesmo
> motivo: o processo é dono do MediaMTX e de um FFmpeg por destino. O gravador é um filho isolado,
> lendo o programa como se fosse mais um espectador. Disco cheio, permissão negada, pasta sumida:
> ele morre, escreve `{"kind":"recEnd","reason":...}` no NDJSON, mostra um toast, e a transmissão
> **não sente nada**. Nenhum erro do gravador pode subir pro caminho que decide o estado do motor.

### 3.3 Gravação de chat

Uma linha por mensagem em `<id>.chat.ndjson`, escrita pelo mesmo caminho que hoje já conta as
mensagens pro relatório:

```json
{"t":1785516412345,"p":"twitch","s":"pitrol","a":"fulano","c":"#ff7f50","m":"travou aí?"}
```

Campos curtos de propósito (`t/p/s/a/c/m`) — o nome longo repetido 40 mil vezes é peso puro. O
`s` (source) é o **mesmo namespace** do `chatBy` e do `viewers` que o relatório já usa, então o
replay consegue filtrar por canal sem inventar chave nova.

**O que o MVP não grava:** `fragments` e `badges` (`chat.rs:50-51`). Emote é URL de CDN e badge é
imagem — guardar tudo dobra o arquivo pra deixar o replay bonito, não útil. Fase 2 guarda só os IDs
dos emotes e remonta.

**Teto próprio:** ~16 MiB (≈ 100 mil mensagens). Ao estourar, para de gravar chat, marca no arquivo
e avisa — **sem tocar** no vídeo nem nas métricas.

O `meta` da sessão sobe pra `schemaVersion: 3` e ganha `hasVideo` / `hasChat`, pra o relatório saber
o que oferecer sem ir ao disco procurar.

### 3.4 A âncora de sincronia — o coração da feature

Uma linha nova no NDJSON principal, no momento em que a gravação começa de fato:

```json
{"kind":"recording","t":1785516333120,"path":"D:/Lives/1785516333000.mp4","source":"program"}
```

O `path` é **absoluto**, não só o nome do arquivo. Como a pasta é configurável (§6.1), o streamer
pode trocá-la amanhã — e o relatório de hoje precisa continuar achando o vídeo de hoje, onde ele
ficou. Guardar só o nome faria toda gravação antiga sumir da interface no dia em que a pasta mudasse,
sem nada ter sido apagado. Esse é também o caminho que o botão "abrir pasta" do relatório passa a usar.

A conta do player é uma só:

```text
tempoNoVideo(segundos) = (epochMsDoEvento - recording.t) / 1000
```

Duas armadilhas que essa conta esconde, e que precisam de resposta:

1. **O primeiro keyframe.** Com `-c copy` o arquivo só começa no próximo keyframe — o GOP é de 2s
   (`engine.rs:442`), então cravar `t` no instante do spawn erra **até 2 segundos**. Solução: ler o
   `-progress` e cravar `t` no relógio de parede do primeiro `out_time_ms=0`. Enquanto não vier,
   nenhuma linha `recording` é escrita — melhor não ter replay do que ter replay torto.
2. **Deriva em live longa.** O relógio do RTMP e o relógio de parede não andam idênticos por 4 horas.
   Uma âncora só no início acumula erro no fim. Solução: a cada ~5 min, uma linha
   `{"kind":"recSync","t":<parede>,"out":<out_time_ms>}` tirada do mesmo `-progress`. O player
   interpola **por trechos** entre âncoras em vez de extrapolar do começo. Custo: uma linha a cada
   5 minutos.

Isso é o que faz o replay ainda estar sincronizado no minuto 200, e é o detalhe que separa a feature
funcionando de "o vídeo está uns 10s adiantado no fim, sei lá por quê".

---

## 4. O player dentro do relatório

O `ReportDetail` (`ReportsScreen.tsx:601`) ganha um estado só: **`playheadT` em epoch ms** — a mesma
unidade de todo o resto. Tudo se pendura nele.

| Interação | Direção | Ligação |
|---|---|---|
| Arrastar/tocar o vídeo | vídeo → relatório | `timeupdate` → `playheadT` |
| Clicar num ponto do gráfico | relatório → vídeo | `timeAxis` (`report.ts:131`) → `video.currentTime` |
| Clicar num evento / janela / destaque | relatório → vídeo | `EventRow:1616`, `WindowCard:1570`, `HighlightRow:1652` — **todos já recebem o timestamp**, só falta o `onClick` |
| Chat rolando sozinho | `playheadT` → lista | filtra `t <= playheadT`, ancora no fim |
| Cursor vertical nos gráficos | `playheadT` → SVG | uma linha em cima do `chartPath.ts` |

Duas decisões de comportamento:

- **Sem gravação, nada muda.** A aba de replay só aparece se `hasVideo`. Relatório antigo (schema 2)
  segue abrindo igual — o `parseSession` ignora `kind` desconhecido, então a compatibilidade é de
  graça nos dois sentidos.
- **Teclado, porque é uma ferramenta de revisão:** espaço (play/pause), ←/→ (10s), Shift+←/→ (60s),
  `,`/`.` (quadro a quadro). Quem está caçando o instante do travamento vai usar isso mais que o
  mouse.

---

## 5. O bloqueio técnico do player: CSP e protocolo de asset

Isto trava o player antes de qualquer outra coisa e é melhor descobrir agora. A CSP atual
(`tauri.conf.json:26`) declara:

```text
media-src 'self' blob: mediastream:
```

Um `<video>` apontando pra arquivo local **não toca** — o `asset:` está liberado só em `img-src`.
Precisa de duas mudanças:

1. **Habilitar o `assetProtocol`** em `app.security`, com escopo **restrito às pastas de gravação**.
   Escopo largo (`$APPDATA/**` ou pior) entrega leitura de disco pro webview de graça — é o oposto
   do resto do projeto, onde chave nem em arquivo fica.
2. **`media-src` ganha `asset: http://asset.localhost`** (o segundo é a forma que o Windows usa).

**O escopo tem que ser dinâmico, e é aqui que a pasta configurável morde.** O escopo declarado no
`tauri.conf.json` é estático, mas a pasta do vídeo é escolhida em runtime — e sessões antigas podem
estar em pastas que nem são mais a atual. Então o escopo estático cobre só a pasta padrão, e o resto
entra em runtime pelo `asset_protocol_scope().allow_file(...)`:

- ao carregar a config, libera a pasta configurada;
- ao abrir um relatório com gravação, libera **aquele arquivo** (pelo `path` da âncora);
- ao trocar a pasta nas configurações, libera a nova.

Liberar arquivo a arquivo, e não a pasta inteira do streamer, mantém o escopo do tamanho do que a
tela está mostrando. Sem isso, o sintoma é dos piores de depurar: **o vídeo grava perfeitamente e o
player não toca**, sem erro nenhum além de um `<video>` mudo.

Alternativa se o escopo incomodar: servir o arquivo por um handler `http://` local só de leitura,
como o overlay já faz. Mais código e mais superfície — o asset com escopo apertado é o caminho.

---

## 6. Configuração (Rust **e** TS — sempre os dois)

| Chave | Padrão | O que faz |
|---|---|---|
| `recordVideo` | `false` | liga a gravação do programa |
| `recordVideoDir` | `""` | pasta do vídeo — vazio = pasta de sessões (§6.1) |
| `recordVideoKeepGb` | `20` | teto de disco das gravações (§7) |
| `recordChat` | `false` | liga a gravação das mensagens |

Onde encostar, nos dois lados (não existe um sem o outro):

- `src-tauri/src/config.rs` — struct `Settings` (a partir da linha 112), com `#[serde(default)]` em
  todas: config antiga tem que continuar carregando.
- `src/lib/types.ts` — `AppSettings` (linha 99).
- `src/screens/SettingsScreen.tsx` — a seção precisa dizer **o custo em disco por hora** ao lado do
  botão. "Gravar a live" sem "≈2,7 GB/h no seu bitrate atual" é uma pegadinha.
- `src/lib/i18n/pt.ts` e `en.ts` — as duas, com o `dict.test.ts` cobrando paridade.

### 6.1 A pasta do vídeo

Escolher a pasta não é conforto, é requisito: ~2,7 GB/h vai para o disco do sistema por padrão, que é
justamente onde o streamer **não** quer isso. Quem grava já tem um HD pra gravação — o OBS pergunta a
mesma coisa, e pelo mesmo motivo.

**O padrão é vazio, não um caminho.** `""` significa "a pasta de sessões", resolvida na hora. Gravar
o caminho concreto no `config.json` amarraria a configuração a uma máquina — e essa config viaja
entre perfis e é lida pelo Rust e pelo TS. Vazio é o único default que continua certo depois que o
`app_data_dir` muda.

**Validar na hora de escolher, não na hora de gravar.** Descobrir que a pasta não presta quando o
streamer aperta BORA é tarde demais. Ao selecionar:

| Checagem | Por quê |
|---|---|
| A pasta existe e é uma pasta | caminho digitado à mão, unidade que sumiu |
| Grava de verdade (escreve e apaga um arquivo temporário) | no Windows a permissão **mente**: `readonly` no atributo, ACL negando, pasta sincronizada — só o teste real responde |
| Espaço livre **do volume dela** | a checagem de espaço do §7 tem que olhar `D:`, não o disco do sistema |
| Avisa se for unidade de rede ou removível | latência de rede pode engasgar a escrita; removível some no meio da live |
| Avisa se o caminho for muito longo (>200 chars) | o limite de 260 do Windows estoura ao juntar o nome do arquivo |

Nenhuma dessas é impeditiva a não ser a primeira e a segunda — as outras avisam e deixam seguir. É a
máquina do streamer.

**Detalhes que a pasta configurável arrasta:**

- **Escopo do asset protocol** (§5) precisa ser liberado em runtime pra essa pasta, senão o vídeo
  grava e o player não toca.
- **O `path` da âncora vira absoluto** (§3.4), pra o relatório antigo achar o vídeo antigo depois que
  a pasta mudar.
- **A poda não pode passear em pasta alheia** (§7) — é a regra mais importante desta seção.
- **Trocar a pasta não move nada.** O que já foi gravado fica onde está; o relatório continua abrindo
  porque guarda o caminho absoluto. Mover arquivo de dezenas de GB por trás do streamer seria pior
  que deixar onde está.
- **Caminho com espaço ou acento** não é problema: os args do FFmpeg vão como `Vec<String>`, sem
  shell no meio.

---

## 7. Retenção — e o bug que vem de graça se ninguém olhar

`prune()` (`session.rs:352`) mantém as 50 sessões mais recentes filtrando **`.ndjson`**. Do jeito que
está, ele apagaria o `.ndjson` e deixaria o `.mp4` de 11 GB **órfão pra sempre**. Em três meses o
usuário tem 200 GB de vídeo sem nenhum relatório que os referencie, e nada na interface explica de
onde veio.

O que a poda precisa passar a fazer:

1. Ao remover uma sessão, remover os **irmãos** (`.mp4`, `.chat.ndjson`).
2. Uma poda **por espaço**, separada da poda por contagem: 50 sessões de métricas são ~alguns MB, mas
   50 vídeos são centenas de GB. Vídeo se poda por `recordVideoKeepGb`, do mais antigo pro mais novo.
3. Uma **varredura de órfãos** no boot, junto com `recover_incomplete_sessions` (`session.rs:215`) —
   pra limpar o que versões anteriores (ou uma queda) deixaram pra trás.
4. **Checar espaço livre antes de dar BORA** — no volume da pasta escolhida (§6.1), não no do
   sistema. Abaixo de ~5 GB, não começa a gravar e avisa. Encher o disco no meio de uma live é pior
   que não ter gravado.

> **REGRA DURA — a poda nunca apaga arquivo que a Corneta não criou.** A pasta do vídeo é do
> streamer, e ele pode apontá-la pra onde o OBS já grava, pro Vídeos do Windows, pra raiz de um HD
> com dez anos de coisa. Uma poda "por GB" solta ali dentro é um apagador de arquivos alheios.
>
> Só entra na fila de exclusão o arquivo que satisfaz **as duas** condições: o nome casa exatamente
> com `<13 dígitos>.mp4` **e** existe uma sessão conhecida com aquele id. Nada de varrer por
> extensão, nada de apagar "o mais antigo da pasta". Se a conta de GB não fecha só com os arquivos
> que passam nesse filtro, a Corneta **avisa e para de gravar** em vez de abrir mão do critério — o
> pior resultado aceitável é uma gravação que não acontece, não um arquivo de terceiro que some.

---

## 8. Casos de borda

| Situação | Comportamento |
|---|---|
| Disco enche no meio | gravador morre sozinho, toast, `recEnd` no NDJSON, **live intacta** |
| Falta de energia | fMP4 sobrevive; `recover_incomplete_sessions` marca a gravação como truncada |
| OBS cai no meio | grava o que foi ao ar — slate de JÁ VOLTO incluso, que é justamente o que se quer ver depois |
| Sem compositor/splicer | grava do path de ingestão do OBS (§3.2) |
| Streamer troca de perfil no meio | a sessão é a mesma; a gravação continua |
| Chat desconecta e reconecta | buraco no `.chat.ndjson`; o replay mostra o buraco em vez de fingir |
| `recordVideo` ligado no meio da live | só vale na próxima — gravação começa com a sessão, ponto |
| Relatório antigo (schema 2) | abre normal, sem aba de replay |
| Vídeo apagado na mão | relatório abre, aba de replay some, sem erro vermelho |
| Pasta do vídeo num HD externo que foi desplugado | não começa a gravar (ou morre no meio) com aviso; **live intacta** |
| Pasta configurada foi apagada/renomeada | valida no BORA; avisa e segue **sem gravar**, nunca recria caminho no escuro |
| Streamer troca a pasta com gravações antigas na anterior | relatórios antigos continuam abrindo pelo `path` absoluto; nada é movido |
| Pasta apontada pra onde o OBS grava | a poda ignora tudo que não casa com o padrão de nome (§7) |

---

## 9. Resiliência: o que quebra, como perceber e o que fazer

### 9.1 A hierarquia de sacrifício

Toda decisão desta seção sai de uma ordem só. Quando duas coisas não cabem, sacrifica-se de baixo
pra cima:

```text
1. A TRANSMISSÃO      ← nunca, por nada, sob nenhuma hipótese
2. O RELATÓRIO        ← as métricas são o produto que já existe e funciona
3. O CHAT gravado     ← perder texto dói, mas não apaga o diagnóstico
4. O VÍDEO            ← é o primeiro a ser jogado fora
```

Parece óbvio escrito assim, mas é o que resolve as decisões difíceis sem discussão: disco apertado
→ para o vídeo, não as métricas. Escrita lenta → larga o vídeo, não segura o programa. Erro no
gravador → toast, nunca um estado de erro do motor. **O vídeo é o item mais caro e o mais
descartável ao mesmo tempo** — e tratar ele como opcional em tempo de execução, não só na
configuração, é o que impede a feature de virar um risco pra live.

### 9.2 A mitigação que vale mais que todas as outras: o teste de 5 segundos

Um botão **"testar gravação"** nas configurações, que grava 5 segundos, finaliza e **toca de volta
ali mesmo**. Em um clique ele valida, de ponta a ponta: a pasta existe e aceita escrita, tem espaço,
o FFmpeg sobe com aqueles argumentos, o remux funciona, o escopo do asset foi liberado, a CSP deixa,
o codec é tocável pelo webview e o player funciona.

É pouca linha de código pra uma mudança enorme de resultado: **converte quase toda falha de
configuração numa descoberta antes do BORA**, em vez de uma decepção depois de 4 horas de live. Roda
sozinho na primeira vez que o streamer liga a gravação e quando ele troca a pasta.

Se existir uma única coisa desta seção pra implementar junto com a Fase 1, é esta.

### 9.3 Gravador de vídeo

| Problema | Como perceber | Resposta |
|---|---|---|
| FFmpeg morre calado | `out_time_ms` do `-progress` parado por >10s | watchdog marca como morto e **retoma em segmento novo** |
| Morte repetida (loop) | contagem de retomadas | backoff + máximo de ~5 tentativas, depois desiste e avisa |
| Disco enchendo | checagem do volume a cada 30s | **para limpo abaixo de 2 GB** — antes de zerar |
| Escrita lenta (USB/rede/SMR/antivírus) | fila do leitor crescendo, MediaMTX derrubando | o gravador é só mais um leitor: o servidor o derruba isolado, os destinos não sentem; avisa "sua pasta não está dando conta" |
| Órfão depois de o app morrer | — | **já resolvido**: `kill_child_tree` (`commands.rs:66`) e `kill_orphan_sidecars` (`commands.rs:1006`); o gravador só precisa entrar por essa mesma porta |
| Duas Cornetas gravando no mesmo arquivo | — | **já resolvido**: plugin `single-instance` (`lib.rs:132`) |

Sobre parar **antes** de o disco zerar: disco em zero não estraga só a gravação — trava a escrita do
NDJSON da sessão, do `config.json` e do que o Windows estiver fazendo. Reagir ao disco cheio é tarde;
os 2 GB de folga são o que mantém o item 2 da hierarquia de pé.

**A retomada muda o modelo de dados.** Se o gravador pode morrer e voltar, uma sessão tem **N
segmentos**, não um arquivo. Cada segmento carrega sua própria âncora, e o player emenda:

```json
{"kind":"recording","seg":1,"t":1785516333120,"path":"D:/Lives/1785516333000.mp4","codec":"h264"}
{"kind":"recording","seg":2,"t":1785517001400,"path":"D:/Lives/1785516333000.p2.mp4","codec":"h264"}
```

É mais complexo que um arquivo só — e é o que separa "perdi as 3 horas seguintes" de "faltam 8
segundos no meio".

### 9.4 Sincronia — a classe de bug que não quebra, só fica errada

A pior categoria da feature inteira: nada dá erro, o vídeo toca, os gráficos desenham, e o replay
está mostrando o momento errado. Ninguém percebe até confiar e se enganar.

| Problema | Como perceber | Resposta |
|---|---|---|
| A âncora nunca chega | 15s sem `out_time_ms`, mas o arquivo cresce | grava âncora **estimada** com `"estimated":true`; o player mostra um aviso discreto |
| Relógio do sistema salta (NTP, horário de verão, ajuste manual) | comparar `SystemTime` com um `Instant` monotônico | grava `{"kind":"clockJump","delta":…}`; o player corrige o trecho |
| Deriva em live longa | — | `recSync` a cada 5 min (§3.4), interpolação por trechos |
| Encoder do programa reinicia (PTS zera) | descontinuidade no `out_time_ms` | fecha o segmento e abre outro (§9.3) |
| Sincronia simplesmente errada | o streamer vê | **offset manual por sessão** |

O **salto de relógio** merece atenção porque não é problema só desta feature: `now_ms()`
(`session.rs:42`) é `SystemTime` puro, então uma correção de NTP no meio da live **já hoje** entorta
o eixo do relatório. Detectar e registrar o salto conserta a gravação e o relatório de uma vez.

E o **offset manual** (±30s, salvo por sessão) é a válvula de escape que cobre a classe inteira:
qualquer coisa que a automação erre, o streamer corrige arrastando. É a diferença entre um replay
inutilizável e um replay com dois segundos de ajuste.

### 9.5 O arquivo que grava bem mas não navega

fMP4 é ótimo pra sobreviver a uma queda de energia (§3.2) e **ruim pra procurar**: sem índice
global, pular pro minuto 187 de um arquivo de 11 GB vai de lento a impossível, dependendo de como o
webview resolve. E "pular pro instante do problema" é exatamente a feature.

**Solução: um remux de finalização.** Ao encerrar a live, `-c copy -movflags +faststart` transforma
o fMP4 num MP4 indexado. É cópia de bitstream — rápido, sem re-encode — e roda **depois** da live,
quando ninguém disputa CPU. Fica o melhor dos dois mundos: durante a gravação, um formato que
sobrevive a tudo; depois dela, um arquivo que navega.

O remux também precisa ser resiliente: a sessão fica com `"finalized":false` até ele terminar, e o
boot refaz o que ficou pendente. Se o remux falhar de vez, **o fMP4 continua tocando** — pior de
navegar, mas nada foi perdido.

Sobre o **codec**: hoje toda saída é h264 (`ffmpeg_video_codec`, `engine.rs:84` — todas as variantes
são `h264_*`), então o webview toca. Isso é uma dependência implícita: no dia em que entrar HEVC ou
AV1, o replay vira tela preta silenciosa. Guardar o `codec` na âncora custa nada e deixa o player
avisar em vez de mostrar preto.

### 9.6 Chat

| Problema | Resposta |
|---|---|
| Chat cai e volta | grava `{"kind":"chatGap"}`; o replay **mostra o buraco** em vez de fingir continuidade |
| Mensagem moderada/apagada depois de dita | grava o evento de deleção (o `native_id` do `chat.rs:46` já existe pra casar) e o replay **oculta por padrão** |
| Raid/flood estoura o teto | para de gravar **texto**, segue contando — as métricas do relatório não perdem nada |

O caso da mensagem apagada não é só técnico. Se alguém foi banido por assédio e a mensagem foi
removida da plataforma, o replay da Corneta não deveria ser o único lugar do mundo onde ela continua
aparecendo pra sempre. Guardar a deleção e respeitá-la é o comportamento certo — com um "mostrar
apagadas" pra quem precisa revisar uma moderação.

### 9.7 Recuperação no boot

`recover_incomplete_sessions` (`session.rs:215`) já roda uma vez no boot, antes de qualquer sessão
nova. É o lugar natural pra reconciliar o que a queda deixou:

- gravação sem `end` → marca truncada (e tenta o remux pendente);
- remux `finalized:false` → refaz;
- **âncora sem arquivo** → some a aba de replay, sem erro vermelho;
- **arquivo sem âncora** (a Corneta morreu antes de escrever a linha) → oferece adotar o arquivo com
  offset manual, em vez de deixá-lo órfão ocupando 11 GB pra sempre;
- órfãos da poda (§7).

### 9.8 O que testar — porque isso não se testa numa live

Metade destas falhas nunca vai aparecer no `pnpm app:dev`. Precisam ser **provocadas**:

- pasta renomeada no meio da gravação; unidade removível arrancada; disco enchendo de verdade
  (arquivo gigante numa partição pequena); `taskkill` no FFmpeg do gravador; relógio do sistema
  puxado 30s pra trás; arquivo cortado no meio de um fragmento.
- E o mais importante: o **mapeamento epoch ↔ tempo de vídeo** com âncoras faltando, fora de ordem,
  com `clockJump` no meio e com vários segmentos é **função pura** — testa sem I/O, sem FFmpeg e sem
  live, do jeito que o resto do núcleo do projeto já é testado. É onde os bugs sutis moram e é o
  teste mais barato de escrever.

---

## 10. LGPD e textos legais

Gravar chat guarda **nome e fala de terceiros** na máquina do streamer. Não muda o papel da Corneta
(nada sai do computador), mas muda o que os documentos precisam dizer:

- `web/.../legal/_content/privacy.pt` e `privacy.en` — um parágrafo: se você ligar a gravação de
  chat, as mensagens ficam **no seu computador**, sob sua responsabilidade; a Corneta não recebe cópia.
- ~~`src/components/legal.tsx`~~ — **não precisa**: o app não embute o texto legal, só
  linka pro site (justamente pra nunca ficar com uma cópia velha). Um lugar a menos pra
  divergir.
- **Não** sobe `LEGAL_ACCEPT_VERSION`: nada passa a ser cobrado, nenhum escopo novo de OAuth, nenhum
  dado novo trafega. É esclarecimento de feature opt-in, não mudança material. (Ver `web/lib/legal.ts:45`.)
- Botão **"apagar gravações desta sessão"** no relatório, separado do "apagar sessão".

---

## 11. Fases

**Fase 1 — MVP (a espinha)**
Gravador de vídeo + âncora de sincronia + player com cursor nos gráficos. Sem chat. Já entrega
"clicar na queda e ver o que estava na tela", que é 80% do valor.

Da §9 entram **na Fase 1**, não depois: o **teste de 5 segundos** (§9.2), o **remux de finalização**
(§9.5), o **watchdog + retomada em segmento** (§9.3), a **parada antes do disco zerar** (§9.3) e o
**offset manual** (§9.4). Não são polimento — são o que decide se a primeira live gravada de verdade
entrega um arquivo navegável ou 4 minutos de vídeo e uma sincronia torta. O resto da §9 (salto de
relógio, adoção de arquivo órfão, deleções de chat) pode vir depois.

**Fase 2 — o chat volta a rolar**
`.chat.ndjson`, painel de replay sincronizado, filtro por canal reusando o `channelKey`
(`report.ts:855`).

**Fase 3 — refino**
Emotes no replay (IDs + remontagem), exportar trecho (encosta na Máquina do Tempo, §13), marcadores
criados durante o replay, miniatura na timeline.

---

## 12. TODO (implementação)

**Fase 1**
- [x] Extrair a escolha de fonte de `commands.rs:1330-1336` numa função compartilhada
- [x] `recorder/`: spawn/stop do FFmpeg de cópia, entrada no mapa de filhos (`engine.rs:777`)
- [x] Parse do `-progress` → `kind:"recording"` no primeiro frame + `kind:"recSync"` a cada 5 min
- [x] `parseSession` lê as duas linhas novas; `SessionMeta` ganha `hasVideo`
- [x] Habilitar `assetProtocol` com escopo restrito + `media-src` na CSP (`tauri.conf.json:26`)
- [x] Liberar o escopo do asset em runtime: pasta configurada, troca de pasta e arquivo do relatório aberto
- [x] `playheadT` no `ReportDetail`; cursor vertical nos gráficos
- [x] Clique em evento/janela/destaque → seek; clique no gráfico → seek
- [x] Atalhos de teclado do player
- [x] Settings: `recordVideo`, `recordVideoDir`, `recordVideoKeepGb` (Rust + TS + i18n pt/en)
- [x] Seletor de pasta (diálogo nativo) + campo mostrando o caminho atual
- [x] Validação da pasta ao escolher: existe, grava de verdade, espaço, avisos de rede/removível/caminho longo
- [x] Aviso de custo em GB/h na tela de Settings
- [x] Checagem de espaço livre antes do BORA — no volume da pasta escolhida
- [x] "Abrir pasta" do relatório aponta pro `path` da gravação, não pra pasta de sessões
- [x] Poda: irmãos + por GB + varredura de órfãos no boot
- [x] Teste: a poda **não** apaga arquivo fora do padrão `<13 dígitos>.mp4` nem sem sessão conhecida
- [x] Teste: `recSync` com âncoras fora de ordem / faltando não quebra o mapeamento

**Fase 1 — resiliência (§9, não adiar)**
- [x] Botão "testar gravação": 5s → finaliza → toca de volta na própria tela (§9.2)
- [x] Roda o teste sozinho ao ligar a gravação pela 1ª vez e ao trocar a pasta
- [x] Watchdog do `-progress`: `out_time_ms` parado >10s = morto
- [x] Retomada em segmento novo (`seg` na âncora) + backoff + teto de ~5 tentativas
- [x] Player emenda N segmentos como uma linha do tempo só
- [x] Monitor de espaço a cada 30s: para limpo abaixo de 2 GB
- [x] Remux de finalização (`-c copy +faststart`) + `finalized:false` refeito no boot
- [x] Âncora estimada quando o `-progress` não vem em 15s (`estimated:true` + aviso na UI)
- [x] Offset manual por sessão (±30s), persistido
- [x] `codec` na âncora + aviso do player quando não for tocável
- [x] Teste: mapeamento epoch↔vídeo como **função pura** — âncoras faltando, fora de ordem, múltiplos segmentos, `clockJump`
- [ ] Provocar na mão: pasta renomeada, unidade arrancada, disco cheio, `taskkill` no gravador, relógio pra trás, arquivo truncado

**Fase 2**
- [x] `.chat.ndjson` + `recordChat` (Rust + TS + i18n)
- [x] Teto próprio do chat, sem afetar vídeo/métricas
- [x] Painel de replay do chat + filtro por canal
- [x] Textos legais (web pt/en + `legal.tsx`) e botão de apagar gravações

---


> **O que falta é o que só a realidade responde:** gravar uma live de verdade de ponta
> a ponta, provocar as falhas do §9.8 na mão e conferir a sincronia no minuto 200. O núcleo
> do mapeamento tem 24 testes e o gravador 6, mas nenhum deles roda com um HD sendo
> arrancado da tomada.

## 13. Relação com a Máquina do Tempo

A [`FEATURE-MAQUINA-DO-TEMPO.md`](./FEATURE-MAQUINA-DO-TEMPO.md) planeja um **anel** de segmentos
curtos pra clipar os últimos 30s. Com a gravação contínua ligada, esse anel é redundante: o clipe sai
de um `-ss/-to` no arquivo que já está no disco, sem processo extra.

Como as duas não podem depender uma da outra (a gravação é opt-in e o clipe precisa funcionar sem
ela), o desenho que sobrevive aos dois casos é: **`clip_now` pergunta se existe gravação em
andamento** — se existe, corta do arquivo; se não, sobe o anel. O anel deixa de ser a base e vira o
fallback de quem não grava. Vale ajustar aquele documento quando esta Fase 1 entrar.

## 14. Estrutura do código (arquitetura hexagonal)

Mesmo desenho do guardião ([`FEATURE-PROTETOR-BUFFER.md`](./FEATURE-PROTETOR-BUFFER.md)): a decisão
no meio, o I/O nas bordas.

```
src-tauri/src/recorder/
  domain.rs   ← núcleo PURO: nomes de segmento, argumentos do FFmpeg, leitura do -progress
                e a POLÍTICA (quando ancorar, quando considerar morto, retomar, desistir)
  mod.rs      ← a API pública que o resto do app usa
  ffmpeg.rs   ← adaptador do encoder: sidecar, -progress, remux, matar a árvore
  disk.rs     ← adaptador do volume: espaço livre (Win32) e a sondagem real da pasta
```

O que a divisão compra é o §9.3 virar teste: o orçamento de retomadas — que é quem decide o
`recording_gave_up` que chega na telemetria — roda inteiro sem subir FFmpeg. Dá pra afirmar em
teste que uma live de 6h com uma queda por hora **não** desiste (cada segmento gravou de verdade,
então o orçamento volta), e que cinco spawns que nunca gravaram nada **desistem**. Antes essas duas
frases só podiam ser verificadas em produção.

Não há `trait` de porta aqui, e é de propósito: cada externo tem uma implementação só, e a
substituição que valeria teste — a política — já é pura e roda sem nenhum deles. Inverter as
dependências Tauri de `ffmpeg::run` (`AppHandle`, `AppState`) é o próximo passo se um dia o laço em
si precisar de teste.

A sessão seguiu o mesmo caminho (`src-tauri/src/session/`), com uma diferença: lá a porta
`SessionStore` **existe**, porque ela paga — a recuperação de sessão interrompida, que só acontece
depois de um crash, roda contra um `MemStore` em memória em vez de exigir um desligamento na tomada
pra ser exercitada.
