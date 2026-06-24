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

### Vídeo (compositor, in-process)
- Lê o stdout do decoder, acumula bytes até um frame inteiro (`w*h*3/2`).
- `ring buffer` de N segundos. Enquanto enche, emite preto (pro encoder ter vídeo contínuo).
- **detect+track** roda no plano Y (já é escala de cinza!): reusa `ocr_words`/`scan`
  (OCR a ~3Hz num thread separado, sem travar o pipeline) + `global_motion` (por frame).
- Cada frame que ENTRA guarda o snapshot das regiões; ao detectar segredo novo, faz
  **backfill** das regiões nos frames recentes do buffer (ainda não saíram). Ao SAIR,
  desenha as regiões guardadas (`draw_box` em yuv420p). Exato e preventivo.

### Áudio (no encoder, sem named pipe)
- O encoder lê `live` pro áudio + `-af adelay=N*1000:all=1`. O vídeo sai N atrás (buffer)
  e o áudio N atrás (adelay) → sincronizado. O preto/silêncio do começo casam (PTS 0..N).

### Sincronia/PTS
- Compositor emite 1 frame por frame lido (pace = entrada, real-time). Preto no fill →
  PTS 0..N; conteúdo real → PTS N+. adelay alinha o áudio igual. Tudo no MESMO `_delayed`.

## O que muda no código
- NOVO `compositor.rs`: orquestra decoder+encoder (sidecars) + o loop de frames + o
  sub-task de OCR. Reusa de `guardian.rs`: `ocr_words`, `scan`, `Region`, `global_motion`,
  `project`, `round_region`, `associate`, `Track` (virar `pub(crate)`).
- `engine.rs`: args do decoder e do encoder (no lugar de `ffmpeg_args_for_protector`).
- `commands.rs`: sobe decoder+encoder+compositor quando guardião censura OU delay>0
  (no lugar do protetor zmq). Remove o protetor zmq + o buffer de posição do guardião.
- Guardião: o detect+track migra pro compositor (que tem os frames crus). O `run_guardian`
  vira fino (ou some) — o compositor emite `leak://alert` e `leak://censor`.

## Riscos / a validar ao vivo
- RAM do buffer: N×~93MB (N=5s ≈ 465MB). OK até ~5-6s; avisar se N alto.
- 2 leituras do `live` (decoder vídeo + encoder áudio) — MediaMTX aguenta.
- Sync A/V fino (o adelay + o preto do fill) — ajustar no teste com OBS.
- OCR no plano Y: encodar Y→JPEG (image crate) e reusar `ocr_words`, OU SoftwareBitmap
  direto do cinza. Começar pelo JPEG (reuso) e otimizar depois.
