# Confidence monitor local — sugestão de implementação

> A prévia do OBS mostra tudo certo na sua máquina, mas o que **sai de verdade** (pós-ingestão,
> reencodado) pode estar congelado, preto, sem áudio ou com a cena errada — e ninguém percebe porque
> ninguém tem um **monitor do output real**. Na TV isso se chama *monitor de retorno*: a tela que mostra
> o que está indo pro ar, não o que você acha que está indo. Só a Corneta consegue fazer isso de boa
> porque o sinal **passa por nós** (OBS → MediaMTX → FFmpeg por destino); a gente lê o feed de volta e
> mostra. Não é a prévia do encoder — é o ar.

- **Status:** Sugestão de implementação · 2026-06-29
- **Relacionado:** [`../IDEIAS-v4.md`](../IDEIAS-v4.md) (§2), [`./02-detector-tela-preta-congelada.md`](./02-detector-tela-preta-congelada.md) (a heurística que AVISA), [`./07-verificacao-independente-plataforma.md`](./07-verificacao-independente-plataforma.md) (monitor por-destino, mais caro)

---

## 0. Objetivo

Uma janela que **decodifica o que está sendo enviado** (lê de volta do MediaMTX) e mostra **exatamente o
que vai pro ar**. Confidence monitor de verdade: baixo fps já resolve — o objetivo é *confiança*
("ufa, tá no ar e tá certo"), não um multiview cinematográfico. Reusa o sinal que já passa por nós e o
`capture_frame` que já existe.

Tudo **local** (lê do nosso próprio MediaMTX) → **grátis**.

---

## 1. Arquitetura

```
                            ┌──────────────────────── MVP (leve, confiável) ───────────────────┐
                            │                                                                   │
OBS ──> MediaMTX (feed comum) ──> loop grab_frame_named(app, name) @ 1–4 fps                    │
                            │           │  (JPEG via ffmpeg sidecar, já existe)                  │
                            │           └──> app.emit("monitor_frame", jpeg) ──> janela Tauri    │
                            │                                              (<img> recarrega)     │
                            │                                                                    │
                            └──────────────────────── Fase 2 (ao vivo real) ────────────────────┘
                                        │
            MediaMTX republica o MESMO feed em HLS/WebRTC ──> player na janela (vídeo + áudio)
                                        │
                            (config gerada por engine::mediamtx_config)
```

- **MVP** = polling de frames. Reusa `grab_frame_named(app, name) -> Result<Vec<u8>>` (o mesmo
  caminho do `#[tauri::command] capture_frame` em `commands.rs`), só que num loop a baixo fps em vez de
  1 frame sob demanda.
- **Fase 2** = MediaMTX vira o servidor de mídia que ele já é e republica o feed comum em HLS/WebRTC; a
  janela só toca. Mais fiel (movimento fluido + áudio), custo um pouco maior. Sem a gente decodificar
  tudo na CPU.

---

## 2. Detalhes & decisões

- **fps do monitor.** 1–4 fps é o ponto. Confidence monitor não precisa de 60fps — precisa responder
  "tá no ar? tá certo?". 1 fps já pega tela preta/congelada/cena errada; 4 fps dá sensação de "vivo".
  Configurável, default conservador (2 fps) pra não comer CPU à toa.
- **Janela separada, igual o chat popout.** Replica o padrão do `#[tauri::command] open_chat_window(app)`
  (`commands.rs`) que já abre uma janela Tauri independente (`src/screens/ChatPopout.tsx`). Um
  `open_monitor_window(app)` análogo + uma tela `MonitorPopout.tsx`. Janela destacável = o operador joga
  num segundo monitor e deixa lá, como o retorno de uma régua de TV.
- **Reuso do `capture_frame`.** Nada de pipeline novo: o frame do output **já existe**. O MVP é literalmente
  "chama `grab_frame_named` num intervalo e empurra o JPEG". Two caminhos de entrega, escolha o mais simples
  primeiro:
  - `app.emit("monitor_frame", base64)` → a janela escuta e troca o `src` do `<img>`; ou
  - a janela faz polling de um comando que devolve o último JPEG.
- **Overlay de detecção (quando integrar).** O [`./02-detector-tela-preta-congelada.md`](./02-detector-tela-preta-congelada.md)
  é a **fonte de dados/heurística**: o monitor **mostra**, o detector **avisa**. Integração natural =
  desenhar um badge/borda na janela do monitor quando o detector dispara ("⚠ TELA PRETA há 4s"). Mostrar +
  avisar juntos é o casamento certo — mas o monitor funciona sozinho mesmo sem o detector.

---

## 3. Casos de borda

- **Sem sinal (publisher caiu).** `grab_frame_named` falha / devolve vazio → a janela mostra um estado
  "sem sinal" explícito (não congela o último frame achando que está tudo bem). Esse é exatamente o caso
  que o detector de preto/congelado cobre — bom lugar pra cruzar.
- **Custo de CPU.** O MVP decodifica 1–4 JPEGs/s do feed comum — barato. O perigo é querer subir o fps ou
  abrir vários monitores: aí a CPU sobe. Mantém o fps baixo e **um** monitor (feed comum). Decode contínuo
  em alta taxa é trabalho da Fase 2 via HLS/WebRTC (o MediaMTX faz, não a gente).
- **Latência do monitor.** Frame a 2 fps + JPEG + emit ⇒ alguns segundos de atraso. Pra *confiança* tá ótimo;
  não é ferramenta de timing fino. A Fase 2 (HLS) também tem latência de buffer (segundos); WebRTC é mais
  baixo. Deixar claro na UI que é monitor de retorno, não scope frame-accurate.
- **Feed comum vs por-destino.** Este monitor é do **feed comum** (pós-ingestão, antes do encode por
  plataforma). É barato e pega 95% dos sustos. Monitorar o que **cada destino** recebe (pós-encode da
  YouTube, da Twitch, etc.) exige decodificar N saídas → custoso, e é outro produto:
  [`./07-verificacao-independente-plataforma.md`](./07-verificacao-independente-plataforma.md). Não misturar.

---

## 4. Grátis vs pago

- **Grátis (local):** todo o monitor. Lê do nosso próprio MediaMTX, decodifica na máquina, mostra numa janela
  Tauri. MVP (frames) e Fase 2 (HLS/WebRTC local) são ambos locais por natureza.
- **Pago (nuvem):** nada específico aqui. Se um dia houver "monitor remoto" (assistir o ar de outro lugar via
  relay na nuvem), isso teria custo — mas é outra história. O monitor de retorno em si é grátis.

---

## 5. Próximo passo

MVP: uma janela Tauri (clone do padrão `open_chat_window` / `ChatPopout.tsx`) que mostra o output do feed
comum com frames a **1–4 fps**, vindos de um loop sobre `grab_frame_named`. Estado "sem sinal" explícito.
Sem player, sem áudio, sem por-destino — só "o que vai pro ar, agora".

---

## 6. TODO (implementação)

**MVP**
- [ ] `open_monitor_window(app)` espelhando `open_chat_window` em `commands.rs`
- [ ] Tela `MonitorPopout.tsx` (clone enxuto de `ChatPopout.tsx`) com um `<img>` que recarrega
- [ ] Loop de captura: chamar `grab_frame_named(app, name)` a cada 250ms–1s (fps configurável)
- [ ] Entrega do frame: `app.emit("monitor_frame", base64)` → `<img>` troca o `src` (ou polling de comando)
- [ ] Estado "sem sinal" quando `grab_frame_named` falha/retorna vazio
- [ ] Setting: fps do monitor (default 2), liga/desliga
**Fase 2**
- [ ] MediaMTX republica o feed comum em HLS/WebRTC (ajuste em `engine::mediamtx_config`)
- [ ] Player de vídeo (HLS.js / WebRTC) na janela do monitor, com áudio
- [ ] Overlay de detecção: badge/borda na janela quando o detector de [`./02-detector-tela-preta-congelada.md`](./02-detector-tela-preta-congelada.md) dispara
- [ ] Avaliar (não construir) monitor por-destino → encaminha pra [`./07-verificacao-independente-plataforma.md`](./07-verificacao-independente-plataforma.md)
