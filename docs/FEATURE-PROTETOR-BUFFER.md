# Protetor com buffer próprio — delay REAL + censura preventiva garantida

## Por que (o problema do tpad)
O protetor antigo usava `tpad` (FFmpeg) pra atrasar e `drawbox`+zmq pra a tarja. Mas
o `tpad` **não cria um delay confiável** num republish via MediaMTX: ele prepende N
segundos de quadros no começo, e o MediaMTX serve um leitor novo a partir da **borda
ao vivo** — então os destinos conectam depois do "burst" e leem em tempo real → **sem
delay**. Resultado: "não tem delay mesmo setando 10s" + a tarja (atrasada pelo buffer
de posição do guardião) aparecia depois do segredo já ter ido ao ar.

## A solução: a gente segura o vídeo
Bufferizar os quadros no NOSSO processo por N segundos e desenhar a tarja **na hora que
o quadro sai**. Aí o `_delayed` é genuinamente N atrás (a gente segurou os quadros), e
o segredo só sai DEPOIS de checado → preventivo garantido, sem expor.

## Prova de conceito (VALIDADA ✅)
`scratchpad/bufprog`: corrente `FFmpeg(testsrc cru) → buffer Rust (90 frames=3s) +
tarja → FFmpeg(encode)`. Saída h264 válida, delay real, tarja preta desenhada por nós
direto no yuv420p (Y=16, U=V=128). Throughput tranquilo (1080p30 ≈ 93 MB/s por pipe).

## Arquitetura
```
MediaMTX(live) ──> [Decoder FFmpeg]            ──stdout(raw yuv420p)──> [Compositor (Rust)]
                    -i live -map 0:v -f rawvideo                          │ ring buffer N s
                    -pix_fmt yuv420p -                                    │ detect+track no plano Y
                                                                         │ desenha tarja na SAÍDA
                                          ┌──stdin(raw)──────────────────┘
                    [Encoder FFmpeg] ─────┤
                    -f rawvideo -i -      └── -i live  (áudio)  -af adelay=N
                    -map 0:v -map 1:a -c:v nvenc -c:a aac -f flv _delayed ──> destinos (N atrás, confiável)
```

### Vídeo (compositor, in-process) — a "máquina do tempo"
- Lê o stdout do decoder, acumula bytes até um frame inteiro (`w*h*3/2`).
- `ring buffer` de N segundos. Enquanto enche, emite preto (pro encoder ter vídeo contínuo).
- **OCR marcado por índice**: uma thread separada faz OCR do quadro mais novo oferecido
  (no plano Y, que já é cinza), na GPU (PaddleOCR/DirectML), e guarda o resultado pelo
  ÍNDICE do quadro numa `Coverage` (domínio puro). É só pegar o quadro mais novo livre →
  a amostragem se auto-ajusta à velocidade do OCR (~0,4s/scan medido numa tela cheia).
- **Ao SAIR** (N depois), o quadro pega as regiões DELE na `Coverage` (janela ±win que
  escala com a latência medida do OCR) e desenha as tarjas (`draw_box` em yuv420p).
- Por que é certo: o atraso do OCR (≪ N) fica TODO escondido pelo buffer. Cada quadro usa
  a própria detecção → **sem deriva** (posição certa), **sem atraso** (aparece na hora),
  **sem vazar** (preventivo). Nada de movimento global nem tracking entre frames.

### Áudio (no encoder, sem named pipe)
- O encoder lê `live` pro áudio + `-af adelay=N*1000:all=1`. O vídeo sai N atrás (buffer)
  e o áudio N atrás (adelay) → sincronizado. O preto/silêncio do começo casam (PTS 0..N).

### Sincronia/PTS
- Compositor emite 1 frame por frame lido (pace = entrada, real-time). Preto no fill →
  PTS 0..N; conteúdo real → PTS N+. adelay alinha o áudio igual. Tudo no MESMO `_delayed`.

## Estrutura do código (arquitetura hexagonal)
O guardião virou um módulo `src/guardian/` com domínio puro + portas + adaptadores:
- `domain.rs` — **núcleo PURO** (sem tauri/ffmpeg/ort/windows): regras de detecção, geometria
  das tarjas e a `Coverage` (a máquina do tempo). Testado em isolamento.
- `mod.rs` — a porta `Ocr` (fronteira) + a doc do hexágono + a API pública.
- `ocr.rs` — adaptadores da porta `Ocr`: PaddleOCR (GPU/DirectML) e Windows.Media.Ocr +
  download dos modelos + a fábrica `build_ocr`.
- `pipeline.rs` — aplicação + adaptadores de I/O: processos FFmpeg (vídeo cru), pintura
  yuv420p, eventos Tauri. `run_protector` (censura/delay) e `run_warn` (avisar).
- `engine.rs` — só os args do decoder e do encoder (FFmpeg). O `ffmpeg_args_for_protector`
  (protetor zmq/tpad antigo) foi **removido**.
- `commands.rs` — sobe o protetor (decoder+encoder+pump) quando censura OU delay>0.

## Riscos / a validar ao vivo
- RAM do buffer: N×~93MB (N=5s ≈ 465MB). OK até ~5-6s; avisar se N alto.
- 2 leituras do `live` (decoder vídeo + encoder áudio) — MediaMTX aguenta.
- Sync A/V fino (o adelay + o preto do fill) — ajustar no teste com OBS.
- OCR no plano Y: **resolvido** — PaddleOCR consome o cinza direto (encolhido a 1280w, que é
  o ponto ótimo medido: ~400→300ms vs 1080p; 960w não ganha mais). GPU/DirectML libera a CPU.
- Latência do OCR vs delay: medido ~0,4s típico / ~1-2s numa tela MUITO cheia. O mínimo
  preventivo é 3s → folga garantida (o atraso fica escondido pelo buffer).
