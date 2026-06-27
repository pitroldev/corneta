# Mesa — co-stream P2P (webcams da galera no OBS, sem call do Discord) — planejamento técnico

> Streamer cria uma **Mesa**, compartilha um **código**, e os outros entram. A webcam de cada um chega
> **direto P2P (WebRTC)** — em **alta resolução** e **com slot fixo no OBS**, que **não desalinha** quando
> alguém sai. Mata as duas dores do "recorte de call do Discord": **qualidade baixa** e **layout que
> quebra** quando um falante desconecta.

- **Status:** Núcleo implementado (grátis/local) · 2026-06-26
- **Relacionado:** [`MONETIZACAO.md`](./MONETIZACAO.md), [`FEATURE-DEAD-AIR.md`](./FEATURE-DEAD-AIR.md) (reusa o slate "JÁ VOLTO" pra tile que cai), `obs.rs` (já fala obs-websocket v5), `engine.rs` (MediaMTX já vem no pacote)

---

## ✅ Estado da implementação (2026-06-26)

**Entregue (grátis/local, compila limpo — `tsc` + `cargo check`):**

- **Permissão de câmera no WebView2** — `src-tauri/src/permissions.rs` auto-concede Camera/Microphone (handler `PermissionRequested`), chamado no `setup()`. Sem prompt, sem o lock de DENY (tauri#5042). Fallback: comando `open_privacy_settings` (abre a privacidade do Windows).
- **Servidor local da Mesa** — `src-tauri/src/studio.rs` (axum): serve a página de estúdio (`/studio`) e o relay de sinalização (`/ws`), porta efêmera, `0.0.0.0` (OBS via 127.0.0.1, convidado via IP da LAN). Shutdown limpo (fecha conexões vivas). Comandos `mesa_start_server`/`mesa_stop_server`.
- **Página de estúdio (OBS)** — `src-tauri/assets/studio.html`: par WebRTC só-recepção, grade de **slot fixo**, tile **"JÁ VOLTO"** em quem cai, muta o áudio do próprio host, layout grid/solo.
- **Malha WebRTC (control)** — `src/lib/mesa.ts`: publica cam/mic, perfect negotiation, troca de dispositivo (`replaceTrack`), teto de bitrate, convite (token base64url), STUN público (TURN é só plugar `iceServers`).
- **Tela Mesa** — `src/screens/MesaScreen.tsx` + `src/lib/mesaStore.ts`: criar/entrar por convite, preview + pickers, grade de participantes, **auto-adicionar no OBS** via obs-websocket (`obs.rs` ganhou `add_or_update_browser_source`/`remove_input`).

**Limites honestos (externos, ainda não):**

- **Convite com endereço embutido** (não um código curto): código curto exige rendezvous hospedado. Funciona direto na **LAN**; pela internet o host precisa estar **alcançável** (port-forward/túnel).
- **TURN (NAT difícil) e SFU (Mesa > 6)** = servidor → **pago** (§9). Hoje só STUN público + mesh.
- **Captura de câmera de convidado** roda no app dele (origem `tauri.localhost`, contexto seguro) — não num browser via http de LAN (que o Chromium bloquearia).

---

## 0. Objetivo

Hoje a galera improvisa co-stream **recortando uma call do Discord** dentro do OBS. Dói em dois lugares:

1. **Qualidade.** O Discord **recomprime** todo mundo num mosaico de baixa taxa. A facecam do convidado
   chega borrada, escura, 720p ruim — não dá pra um quadro principal.
2. **Alinhamento.** O recorte é "cego": quando alguém **sai/desconecta/muda de posição**, o mosaico do
   Discord **reflui** e o recorte do OBS **vira bagunça** no ar. O streamer descobre AO VIVO.

A **Mesa** resolve os dois: cada webcam vai **P2P, na resolução real** (sem passar por mosaico), e a
Corneta **dona do layout** entrega **cada participante num slot fixo** dentro do OBS — quem cai vira um
**tile "JÁ VOLTO"** no lugar, sem mexer no resto.

**Litmus da [monetização](./MONETIZACAO.md):** o **mídia é P2P** (não passa por servidor nosso) → **grátis**.
Só o **relay TURN** (pra quem tá atrás de NAT difícil) e a **sinalização gerenciada/SFU** (sala grande)
custam servidor → **pagos**. Detalhe em §9.

---

## 1. A verdade sobre "sem servidor" (pra não prometer o impossível)

P2P de verdade tira o **caro** (o vídeo) do nosso servidor — mas **"zero servidor" 100% não existe** com
boa UX. WebRTC precisa de três coisas, e só uma delas é cara:

| Peça | Pra quê | Custo | Onde fica |
|---|---|---|---|
| **Sinalização** | trocar o "aperto de mão" (SDP/ICE) pra abrir a conexão | ~zero (só texto, cai a zero depois que conecta) | servidor minúsculo **ou** LAN/QR/manual |
| **STUN** | descobrir IP:porta público pra furar o NAT | grátis (público, sem estado) | STUN público |
| **TURN** | **relay do vídeo** quando o P2P direto falha (NAT simétrico/firewall) | 🔴 **banda real $** | servidor de relay |

Fatos que mandam no design:

- **A sinalização é inevitável**, mas é **barata e efêmera**: troca texto no começo e some. Pode ser
  **nossa (grátis, é coordenação)**, **self-host**, **LAN (mDNS)** ou até **copia-e-cola/QR** (zero servidor).
- **Mesh (P2P direto) escala pouco:** confiável até **~4–6 pessoas**. Acima disso, upload e CPU explodem
  (cada um manda pra todos os outros). Co-stream típico é 2–6 → **mesh serve**. Sala grande = **SFU (pago)**.
- **~10–20% das conexões do mundo real precisam de TURN** (NAT simétrico, CGNAT, firewall corporativo).
  Pra esses, sem relay **não conecta**. Por isso o **TURN é o upsell honesto de confiabilidade**, não um gate.

> Tradução pro usuário: **"na maioria dos casos conecta direto e de graça; pra quem tá num NAT chato, o
> relay pago garante a conexão."** Nada local é capado.

A referência viva disso é o **VDO.Ninja** (open-source, MIT): faz exatamente "webcam remota → OBS via WebRTC,
o mais serverless possível" — mídia P2P, STUN público, um **handshake server** (auto-hospedável) e TURN só
no ~1% dos casos. A gente **não reinventa o WebRTC**; a gente entrega o que o VDO.Ninja **não** faz: a
**integração nativa com o OBS** (layout automático, slot fixo, tile JÁ VOLTO) e a cara da Corneta. Ver §10.

---

## 2. Arquitetura

```
   STREAMER A (host da Mesa)                          STREAMER B (convidado)
 ┌─────────────────────────────┐                   ┌─────────────────────────────┐
 │ Corneta (janela = sala de    │   sinalização     │ Corneta (sala de controle)  │
 │ controle: presença, layout,  │◄── WSS (texto) ──►│  getUserMedia(cam B)         │
 │ setup de câmera/mic)         │   STUN/TURN ICE   │                              │
 │                              │                   │                              │
 │  página "estúdio" (servida   │◄═══ WebRTC P2P ═══►│  página "estúdio"            │
 │  em 127.0.0.1:PORT)          │   vídeo/áudio      │  (mídia real mora aqui)      │
 │  └─ getUserMedia(cam A)      │   (DTLS-SRTP)      │                              │
 └────────────┬─────────────────┘                   └─────────────────────────────┘
              │ Browser Source (OBS CEF = outro Chromium)
              ▼
        ┌───────────┐  obs-websocket (já temos!)  → cria/posiciona/remove os tiles,
        │   OBS      │  ◄────────────────────────    slot fixo, tile "JÁ VOLTO" em quem cai
        │  (cena)    │
        └─────┬──────┘
              │ RTMP → MediaMTX → 1 FFmpeg por destino  (pipeline atual da Corneta, intocado)
              ▼
        Twitch · YouTube · Kick · …
```

### 2.1 Decisão-chave: WebRTC roda **na WebView, não no Rust**

A Corneta é **Windows-only** e a WebView é **WebView2 (Chromium/Edge)** — que tem **WebRTC nativo completo**
(`getUserMedia`, `RTCPeerConnection`, `MediaStream`, AV1/VP9/H.264, simulcast). Logo:

- ✅ **Toda a malha P2P é JS na WebView.** Reaproveita um motor WebRTC maduro **de graça**.
- ❌ **Não** adicionar a crate `webrtc` (webrtc-rs) no Cargo. Ela é pra cenário **headless/nativo**; aqui
  duplicaria o que o Chromium já faz, é pesada e imatura. Seria o caminho errado (e mais trabalho). Ver §10.
- O **Rust fica só com o que é dele:** servir a página de estúdio no localhost, orquestrar o OBS via
  `obs.rs`, guardar config/credenciais, e (no futuro pago) falar com TURN/SFU.

### 2.2 O detalhe que define tudo: **o Browser Source do OBS é outro processo**

O Browser Source do OBS é um **Chromium próprio (CEF)**, **separado** da WebView da Corneta. Os dois **não
compartilham** `RTCPeerConnection`. Então a **mídia tem que morar no processo que desenha no OBS** — ou seja,
numa **página servida pela Corneta em `http://127.0.0.1:PORT`** que o OBS carrega como Browser Source.
(`localhost` é "secure context" → `getUserMedia` funciona; CEF tem WebRTC.)

Daí o modelo **sala de controle + estúdio**:

- **Sala de controle** = janela principal da Corneta (a tela "Mesa"): cria/entra na Mesa, lista quem tá,
  escolhe câmera/mic, define o layout, mostra preview. **Coordena**, não precisa carregar a mídia toda.
- **Estúdio** = a(s) página(s) em `127.0.0.1:PORT` que o **OBS** consome. É **lá** que vivem o `getUserMedia`
  e as conexões P2P que entram na cena.

Dois jeitos de materializar o estúdio no OBS (recomendação em §5):

- **(A) Um Browser Source só = a Mesa inteira (grid).** A Corneta dona do grid HTML/CSS, slot fixo. Simples,
  resolve alinhamento de cara, **não precisa criar source via obs-websocket**. Layout é dentro da página.
- **(B) Um Browser Source por convidado (sources separados).** Cada um é um source independente que a
  Corneta **cria/posiciona/remove sozinha** via obs-websocket. Máxima liberdade de posicionar cada cam na
  cena — é o diferencial que o VDO.Ninja não automatiza.

---

## 3. Como mata as duas dores (o ponto da feature)

### 3.1 Qualidade — webcam em **alta resolução**, não mosaico do Discord

- Cada cam é **enviada P2P na resolução/taxa configurada** (ex.: 1080p @ 2–4 Mbps), **sem** virar mosaico
  recomprimido. No OBS é um **source independente**, em **resolução real** — dá pra ser quadro principal.
- `getUserMedia({ video: { width: 1920, height: 1080, frameRate: 30 } })`, codec **VP9/AV1** quando rolar,
  **simulcast** (manda 1080p/720p/360p e o receptor pega o que aguenta). Bitrate/resolução por participante,
  com presets (igual aos presets de encoding que já existem).

### 3.2 Alinhamento — **slot fixo** + tile "JÁ VOLTO" em quem cai

Esse é o pulo do gato e o que **nenhuma call resolve**:

- A Corneta atribui um **slot estável** por participante (slot 1, 2, 3…). O layout **não reflui**.
- Quem **desconecta/sai** → o slot vira um **tile "JÁ VOLTO"** (reusa o slate do
  [`FEATURE-DEAD-AIR.md`](./FEATURE-DEAD-AIR.md), com a cara da Corneta) em vez de sumir e empurrar os outros.
- Quem volta **reocupa o mesmo slot**. O streamer **nunca** descobre desalinhamento no ar.
- No **modo (B)**, isso é feito **via obs-websocket**: a posição/tamanho de cada tile é controlada pela
  Corneta (`SetSceneItemTransform`), então **desconexão não mexe na cena**.

---

## 4. Sinalização & conectividade

### 4.1 Sinalização (o "aperto de mão")

Servidor **minúsculo de texto**: entra na sala por **código**, troca SDP/ICE, presença, "fulano saiu".
Some depois que conecta. Opções, do mais conveniente ao mais serverless:

1. **Sinalização Corneta (padrão, grátis).** WebSocket nosso (cabe num **Cloudflare Worker + Durable Object**
   ou um nó pequeno). É **coordenação barata**, então pode ser **grátis** sem ferir a monetização — o caro
   (mídia) nunca passa por aqui. Código de Mesa curto (ex.: `MESA-7F3K`).
2. **LAN (mDNS), zero servidor.** Mesma rede (mesmo estúdio/casa) → descoberta local, **nenhum servidor nosso**.
3. **Copia-e-cola / QR, zero servidor.** Troca o offer/answer por **código ou QR**. Funciona **offline**,
   ótimo pra privacidade e pra provar que **não tem lock-in**. UX pior (manual), mas é o escape hatch.
4. **BYO / interop.** Apontar pra um **handshake server próprio** (o `websocket_server` do VDO.Ninja serve)
   — ou até **interoperar com link do VDO.Ninja**. Mantém o ethos aberto do projeto (igual "self-host" na
   [`MONETIZACAO.md`](./MONETIZACAO.md) §4).

### 4.2 NAT traversal

- **STUN:** público e grátis (Google etc.) ou um nosso. Sem estado, custo ~zero.
- **TURN (pago):** relay de mídia pra quem **não fura o NAT** (~10–20% real). **Banda nossa = custo real** →
  **medido**, igual ao relay multistream da [`MONETIZACAO.md`](./MONETIZACAO.md) §3. Self-host (coturn) pro
  power user; hospedado por nós pra quem quer conveniência. Modo **"TURN-only"** também serve de **privacidade**
  (não vaza seu IP pros outros peers) — vira recurso pago bonitinho.

### 4.3 Topologia

| Pessoas | Topologia | Onde | Por quê |
|---|---|---|---|
| 2–6 | **Mesh** (P2P direto) | **grátis, local** | upload = `(n-1)×bitrate`; ok pra co-stream típico |
| 6+ | **SFU** | **pago (servidor)** | mesh satura; SFU sobe 1× e distribui (simulcast/SVC) |

Mesh é o default. Acima de ~6 a Corneta **avisa** ("Mesa grande puxa muito do seu upload — quer o modo
servidor?") e oferece o SFU pago. **Nunca** trava silenciosamente.

---

## 5. Integração com o OBS (o diferencial)

A Corneta **já fala obs-websocket v5** (`obs.rs`: Hello→Identify com auth SHA256, `SetStreamServiceSettings`,
`Start/StopStream`, `GetVideoSettings`, `GetStats`). Falta só **CRUD de inputs/scene items** — que o
obs-websocket v5 suporta (`CreateInput` kind `browser_source`, `SetSceneItemTransform`, `RemoveInput`,
`GetSceneItemList`).

### 5.1 Servidor HTTP local pra Browser Source

OBS CEF carrega **http(s)**, não `tauri://`/`asset://`. Então a Corneta precisa servir as páginas de
estúdio em **`http://127.0.0.1:PORT`** (via `tauri-plugin-localhost` ou um `axum`/`tiny_http` minúsculo).
`localhost` é secure context → `getUserMedia`/WebRTC funcionam.

### 5.2 Modo (A) grid único vs (B) sources separados

| | **(A) Grid único** | **(B) Source por convidado** |
|---|---|---|
| OBS | **1** Browser Source | **N** Browser Sources (auto via obs-websocket) |
| Layout | dentro da página (Corneta dona) | livre na cena (Corneta posiciona via `SetSceneItemTransform`) |
| Alinhamento | resolvido (página fixa) | resolvido (Corneta controla transform) |
| Liberdade de cena | baixa (arrumação fixa) | **alta** (cada cam onde quiser) |
| Esforço | **menor** (MVP) | maior (CRUD de scene item) |

**Recomendação:** **MVP = (A)** (resolve as duas dores com pouquíssimo código de OBS), e **(B) como fase
seguinte** (o "pro layout" que automatiza o que o VDO.Ninja faz na mão). A Corneta pode **auto-adicionar** o
source ("Adicionei a Mesa na sua cena atual ✅") em vez de mandar o usuário colar URL.

### 5.3 Considerada e descartada (pro v1): WHIP/WHEP via MediaMTX

O MediaMTX **já vem no pacote** e tem WebRTC (hoje `webrtc: no` no `engine.rs`). Dava pra os convidados
**WHIP** a cam pro MediaMTX do host e o OBS puxar por **WHEP**. **Mas** isso vira **estrela no host** (host
carrega toda a banda) e exige o **host alcançável** pelos convidados (volta o problema de NAT no host). Não é
P2P simétrico. Fica **anotado como base de um futuro "modo host/relay"** (parente do SFU), não como o v1.

---

## 6. Permissão de câmera/mic na WebView2 (o risco nº 1)

É o ponto mais arriscado e merece **spike antes de tudo** (§11, Fase 0):

- WebView2 dispara `PermissionRequested`. Sem tratar, tem o **bug conhecido**: se o usuário bloqueia uma
  vez, **trava** até apagar a pasta `EBWebView`. Pra **app próprio acessando a própria cam**, queremos
  **auto-conceder**.
- **Abordagem:** via `WebviewWindow::with_webview` + `webview2-com`/`windows-rs`, anexar handler em
  `CoreWebView2.add_PermissionRequested` que **allow** automático pra `Camera`/`Microphone` na origem do app.
- **Camada do Windows:** Configurações → Privacidade → **Câmera/Microfone → "permitir apps de desktop"**. A
  Corneta deve **detectar** e **guiar** ("ative a câmera pra apps de desktop") em vez de só falhar.
- **CSP** (`tauri.conf.json`): hoje é restritivo (`connect-src 'self' ipc: http://ipc.localhost`). Precisa
  liberar a **sinalização `wss://`** e o **HTTP local** do estúdio. STUN/TURN são ICE (UDP), **não** caem no
  `connect-src`. Adicionar `media-src`/`img-src` conforme necessário.

---

## 7. Áudio (a pegadinha clássica de co-stream)

Áudio é onde co-stream estraga se mal feito:

- **Eco/áudio dobrado:** cada um tem mic próprio. A `getUserMedia` do **mic** entra com **AEC/NS/AGC ligados**
  (cancelamento de eco). O **áudio dos convidados que vai pro OBS** entra **sem AEC** (é fonte limpa).
- **Quem leva o áudio pras plataformas:** decisão explícita. Padrão sugerido: **só o host** carrega o mix
  (host ouve todo mundo, manda o combinado), e cada convidado **monitora** localmente. Evita N áudios
  concorrentes nas plataformas.
- **Controles por tile:** mute/monitorar por participante, **push-to-talk** opcional, ducking simples.
- WebRTC já traz **AEC/NS/AGC** de fábrica — usar os defaults certos por trilha (mic on, fonte-OBS off).

---

## 8. Casos de borda

- **Convidado cai no ar:** tile vira **JÁ VOLTO** (não reflui); reconecta no **mesmo slot**. ICE restart
  automático antes de desistir.
- **NAT não fura (sem TURN):** estado claro "não consegui direto — ative o relay" em vez de travar mudo.
- **Upload fraco do host (mesh):** estimar `(n-1)×bitrate` e **avisar** (reusa a lógica do `test_upload`);
  oferecer baixar resolução/bitrate ou ir pro SFU pago.
- **Sala grande (>6):** avisar + oferecer SFU; **não** capar silenciosamente.
- **Código da Mesa:** curto mas **não adivinhável** (entropia suficiente); host **aprova** quem entra;
  expira. DTLS-SRTP já criptografa a mídia ponta-a-ponta por padrão.
- **Dispositivos:** trocar câmera/mic ao vivo (`enumerateDevices` + `replaceTrack` sem derrubar a conexão).
- **OBS fechado/sem ws:** a Mesa funciona como preview na sala de controle; integração de cena só quando o
  OBS estiver acessível (mesma checagem do `obs_check`).
- **Eco:** trilha de mic com AEC; fonte-OBS sem AEC (§7).

---

## 9. Grátis vs pago

> Litmus ([`MONETIZACAO.md`](./MONETIZACAO.md)): **"precisa de um servidor NOSSO pra existir?"** Não → grátis.

- **Grátis (local/P2P, pra sempre):** criar/entrar na **Mesa**, **mídia P2P mesh** (até ~4–6), webcam em
  **alta resolução**, **slot fixo + tile JÁ VOLTO**, integração com OBS (grid e sources via obs-websocket),
  **STUN público**, sinalização **LAN/QR/manual/BYO**, áudio/controles por tile. O mídia **nunca** passa por
  nós → grátis.
- **Pago (servidor, medido/fixo):**
  - **TURN relay** — garante conexão atrás de NAT difícil; **banda nossa** → **medido** (igual relay).
  - **Sinalização gerenciada** (rooms persistentes, "diretor", sem setup) — custo baixo → cabe no **Corneta+**.
  - **SFU** (Mesa > 6, simulcast/SVC) — compute/banda → **medido/assinatura**.
  - **Modo TURN-only (privacidade)** — não vaza seu IP pros peers.

| | **Corneta (Free)** | **Corneta+ / Add-on** |
|---|---|---|
| Mesa P2P (mesh ≤6), alta-res, slot fixo, OBS, STUN, LAN/QR/BYO | ✅ tudo | ✅ |
| **TURN relay** (NAT difícil / TURN-only privacidade) | — | 💳 medido |
| **Sinalização gerenciada** (rooms, diretor) | — | ✅ Corneta+ |
| **SFU** (Mesa grande >6) | — | 💳 medido/assinatura |

A sinalização básica nossa pode ser **grátis** (é texto, custo ~idle) — decisão fina em §13.

---

## 10. Alternativas consideradas & trade-offs

- **WebRTC no Rust (crate `webrtc`) ❌.** Duplicaria o Chromium da WebView, pesado e imaturo. **Usar a WebView**
  (§2.1). Decisão forte.
- **Construir o WebRTC do zero vs SDK do VDO.Ninja.** Sinalização/ICE/reconexão robustos são **anos** de
  casos de borda (o VDO.Ninja já resolveu). **Recomendação híbrida:** **nossa UX + integração OBS** (o valor)
  por cima de uma **sinalização enxuta e padrão** (Worker próprio **ou** `websocket_server`/SDK do VDO.Ninja).
  Mantém o peso do WebRTC fino e padrão. Reavaliar "embutir o SDK" vs "só o protocolo" no spike.
- **Grid único (A) vs sources separados (B).** (A) no MVP, (B) depois (§5.2).
- **MediaMTX WHIP/WHEP (host relay).** Não é P2P simétrico; base de um futuro modo servidor (§5.3).
- **Virtual camera (compor o grid e expor como webcam pro OBS).** Driver nativo no Windows = lift grande.
  Fora do v1; Browser Source entrega o mesmo sem driver.
- **OBS WHIP nativo (30+).** É **saída** (publica do OBS), não resolve **entrada** de convidado. Não serve aqui.

---

## 11. Fases de implementação

- **Fase 0 — Spike de risco (de-risk a permissão).** Provar `getUserMedia` + `RTCPeerConnection` **dentro da
  WebView2 da Corneta**, com **auto-conceder** câmera/mic (handler `PermissionRequested`) e CSP ajustado.
  É o maior desconhecido — atacar primeiro.
- **Fase 1 — 1:1 sem servidor.** Duas Cornetas se veem por **LAN/manual**, mídia P2P direta. Valida o caminho
  de mídia e a qualidade (alta-res) ponta-a-ponta.
- **Fase 2 — Mesa + sinalização + mesh.** Criar/entrar por **código**, presença, mesh até ~6, **slot fixo**,
  tile JÁ VOLTO em quem cai.
- **Fase 3 — Integração OBS (A).** Servidor HTTP local + página de estúdio (grid único) + **auto-adicionar**
  o Browser Source na cena. Resolve as duas dores de ponta a ponta.
- **Fase 4 — OBS (B) + áudio + robustez.** Sources separados via obs-websocket (`CreateInput`/transform),
  controles de áudio (§7), ICE restart/reconexão, troca de dispositivo, simulcast/bitrate por tile.
- **Fase 5 — Pago (servidor).** TURN relay (medido) + sinalização gerenciada + SFU pra Mesa grande +
  modo TURN-only.

---

## 12. TODO (implementação)

**Fase 0 — spike**
- [ ] Handler `CoreWebView2.PermissionRequested` (via `with_webview`/`webview2-com`) → allow Camera/Mic
- [ ] Ajustar CSP (`wss://` da sinalização + HTTP local do estúdio + `media-src`)
- [ ] Detectar/guiar permissão de câmera de apps de desktop no Windows

**Fase 1 — 1:1**
- [ ] Tela "Mesa" mínima (sala de controle): pedir cam/mic, preview, picker de dispositivo
- [ ] `RTCPeerConnection` 1:1 via handshake **manual/QR** (zero servidor) + STUN público
- [ ] Medir/validar qualidade (1080p), latência e CPU

**Fase 2 — Mesa + mesh**
- [ ] Servidor de sinalização (Worker/DO ou `websocket_server`) — join por código, SDP/ICE, presença
- [ ] Mesh n-peer (até ~6) com **slot estável** por participante
- [ ] Tile **JÁ VOLTO** ao cair (reusa slate do dead-air) + reocupar mesmo slot ao voltar
- [ ] LAN/mDNS como modo zero-servidor

**Fase 3 — OBS (A)**
- [ ] HTTP local (`tauri-plugin-localhost`/`axum`) servindo a página de estúdio (grid)
- [ ] Página de estúdio = receptor WebRTC + grid de slot fixo (Corneta dona do layout)
- [ ] obs-websocket: **auto-criar** o Browser Source na cena atual ("adicionei a Mesa ✅")

**Fase 4 — OBS (B) + áudio + robustez**
- [ ] Sources separados por convidado (`CreateInput` browser_source) + `SetSceneItemTransform`/`RemoveInput`
- [ ] Áudio: AEC no mic / sem-AEC na fonte-OBS, mute/monitor por tile, push-to-talk, "host carrega o mix"
- [ ] ICE restart + reconexão; troca de câmera/mic ao vivo (`replaceTrack`); simulcast + bitrate por tile
- [ ] Aviso de upload (reusa `test_upload`) quando a Mesa puxa demais

**Fase 5 — pago (servidor)**
- [ ] TURN (coturn self-host + hospedado medido) + modo TURN-only (privacidade)
- [ ] Sinalização gerenciada (rooms persistentes, diretor)
- [ ] SFU pra Mesa > 6 (simulcast/SVC)

---

## 13. Decisões em aberto (pro Petro)

1. **Sinalização básica é grátis?** Tese: **sim** — é coordenação barata (texto, ~idle), o caro (mídia) é P2P.
   Mas é tecnicamente "um servidor nosso". Confirmar a linha: **grátis com nossa sinalização** + escape hatches
   (LAN/QR/BYO), e **pago só** TURN/SFU/gerenciada. (Recomendo grátis — combina com "o grátis é bom de verdade".)
2. **Nome.** "**Mesa**" (a mesa onde a resenha acontece) é o nome de trabalho. Alternativas no tom da casa:
   **Resenha**, **Roda**, **Call da Corneta**. Decidir antes da tela.
3. **Construir vs SDK do VDO.Ninja.** Decidir no fim da Fase 0/1: protocolo próprio enxuto **ou** embutir o
   SDK/`websocket_server` do VDO.Ninja pra herdar anos de casos de borda. (Inclinação: protocolo próprio fino,
   reaproveitando o handshake server aberto deles se acelerar.)

---

## 14. Referências

- VDO.Ninja — como funciona (P2P, STUN público, handshake server, TURN ~1%): <https://docs.vdo.ninja/readme/how-does-it-work> · repo <https://github.com/steveseguin/vdo.ninja> · handshake auto-hospedável <https://github.com/steveseguin/websocket_server> · SDK <https://sdk.vdo.ninja/>
- WebRTC em Browser Source do OBS: <https://docs.vdo.ninja/guides/enabling-webrtc-sources-in-obs>
- Mesh vs SFU (limite ~4–6 no mesh; SFU pra 5+): <https://antmedia.io/webrtc-network-topology/> · <https://www.forasoft.com/blog/article/webrtc-architecture-guide-for-business-2026>
- WebRTC em Tauri/WebView2 (suporte + bug de permissão de câmera): <https://github.com/tauri-apps/tauri/issues/5042> · <https://v2.tauri.app/security/permissions/>
- Sinalização serverless (manual/QR; STUN ainda necessário): <https://blog.printf.net/articles/2013/05/17/webrtc-without-a-signaling-server/> · <https://github.com/lesmana/webrtc-without-signaling-server>
- Custo de TURN / opções (coturn self-host; Open Relay 20 GB grátis; ~$99–150/mês 150 GB): <https://www.metered.ca/tools/openrelay/> · <https://dev.to/alakkadshaw/turn-server-costs-a-complete-guide-1c4b> · <https://bloggeek.me/webrtc-turn/>
- OBS WHIP nativo (saída, 30+) — por que não resolve entrada de convidado: <https://obsproject.com/kb/whip-streaming-guide> · <https://webrtchacks.com/webrtc-cracks-the-whip-on-obs/>
