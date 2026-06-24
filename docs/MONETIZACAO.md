# Monetização da Corneta

> Como a Corneta pode ganhar dinheiro **sem trair quem usa**. A regra é simples e inegociável:
> **o que roda local é grátis pra sempre; só se paga pelo que custa servidor.**

- **Status:** Estratégia / rascunho · 2026-06-24
- **Relacionado:** [`IDEIAS.md`](./IDEIAS.md), [`IDEIAS-v2.md`](./IDEIAS-v2.md), [`IDEIAS-v3.md`](./IDEIAS-v3.md)

---

## 0. Os princípios (inegociáveis)

1. **Tudo que construímos até agora é grátis.** Esse é o **core** da Corneta. Não vira pago depois.
2. **Feature paga = sempre server-sided.** Você paga porque tem um **servidor nosso trabalhando** pra
   você (banda, GPU, storage, uptime), não por destravar um botão.
3. **Se é só local, é grátis.** Rodou na sua máquina, sem nossos servidores? **De graça.** Sempre.
4. **Sem dark pattern.** Sem anúncio, sem vender dado, sem *watermark* no grátis, sem estrangular o
   grátis pra empurrar o pago. O grátis é **bom de verdade**, não isca.

> A litmus test de qualquer feature: **"isso precisa de um servidor nosso pra existir?"**
> Não → grátis. Sim → pode ser paga (e o preço cobre o custo real daquele servidor).

---

## 1. Por que esse modelo é forte (não é só ética — é estratégia)

- **Confiança vira marketing.** "Local é grátis pra sempre" é uma promessa que o streamer **sente**.
  Vira boca-a-boca: *"usa a Corneta, o básico é free e não tem pegadinha"*.
- **A gente dá de graça o que o concorrente vende.** O **Restream cobra US$ 16–39/mês** pra fazer
  multistream **na nuvem deles**. A Corneta faz **da sua máquina, de graça**. Então o nosso pago
  **não** é o multistream — é o **extra de nuvem** pra quem quiser. Posicionamento absurdamente forte.
- **Incentivos alinhados.** A gente só cobra quando **gasta de verdade** (banda/compute). Não tem
  incentivo pra capar o grátis — o grátis é o funil.
- **Custo previsível pra nós.** Quem não usa nuvem não nos custa quase nada (app local). O servidor
  só liga pra quem paga por ele.

---

## 2. O que é GRÁTIS pra sempre (tudo que já existe — é local)

Multistream (OBS → MediaMTX → 1 FFmpeg por destino), pausar/retomar por plataforma, **chat unificado**
(Twitch IRC, **YouTube via InnerTube sem API key**, Kick), **alertas centralizados**, **viewers
somados**, **relatório pós-live turbinado** (retenção, picos, momentos de destaque), **clipes/backtrack**,
**"JÁ VOLTO"/proteção contra quedas**, **reframe vertical**, **auto-bitrate**, temas, **janela de chat**
(modo Ambos, slider de fonte, divisor), YouTube **zero-config**, import/export de config, atalhos…

**Tudo isso roda na máquina do usuário → grátis pra sempre.** Ponto.

---

## 3. Candidatas a PAGO (porque exigem servidor)

> Pra cada uma: **por que precisa de servidor** e o **custo marginal** (isso define como cobrar).

### 🚀 Relay na nuvem (o "Restream killer", opcional)
Em vez de a máquina do streamer subir o sinal **N vezes** (uma por plataforma, gastando o upload
dele), ele sobe **uma vez** pra nós e **nós** distribuímos pras plataformas.
- **Por que servidor:** ingest + fan-out + egress acontecem no nosso servidor.
- **Pra quem:** quem tem **upload fraco** (a dor nº1 do multistream) ou quer poupar CPU/banda.
- **Custo marginal:** 🔴 **alto** — *egress* é caro (~8 GB/h por stream a 6 Mbps × nº de plataformas).
  Tem que ser **medido/limitado** (horas ou GB), não "ilimitado barato".

### 🧠 IA na nuvem (quando não dá local)
Legendas/tradução ao vivo, **resumo pós-live por IA**, **auto-moderação** com modelo grande,
detecção de clipe por IA. *(Versão local/leve = grátis; a turbinada na nuvem = paga.)*
- **Por que servidor:** STT/LLM/visão pesados rodam em **GPU nossa**.
- **Custo marginal:** 🟡 médio — por minuto de áudio / por token. **Metered** ou cota generosa.

### ☁️ Gravação, clipes e VOD na nuvem + storage
Backup da live na nuvem, **render de clipe/vertical no servidor**, hospedar a **página de recap**.
- **Por que servidor:** processamento + **armazenamento** ($/GB/mês).
- **Custo marginal:** 🟡 storage acumula → cota/retenção (ex.: "últimos 30 dias").

### 🎛️ Overlay / alert box hospedado + página pública
URL hospedada pro *browser source* do OBS (alertas, metas, legendas, placar) + um **perfil público**
(ex.: `pitrol.dev/seunome`) com seus highlights.
- **Por que servidor:** URL persistente, sempre no ar, editável de qualquer lugar.
- **Custo marginal:** 🟢 **baixo** (tráfego pequeno) → cabe em assinatura fixa.

### 📱 Controle remoto pela internet (de qualquer lugar)
Controlar a stream do celular **fora da rede local** (na rede local pode ser grátis) — precisa de um
**túnel/relay** nosso pra alcançar o PC.
- **Por que servidor:** o relay/túnel é nosso.
- **Custo marginal:** 🟢 baixo → assinatura fixa.

### 🐶 Watchdog "te aviso se a stream cair"
Um servidor que **vigia** sua transmissão e te **manda push/SMS** se ela cair — funciona **mesmo se o
seu PC morrer** (que é justamente quando o app local não consegue te avisar).
- **Por que servidor:** tem que rodar **fora** da sua máquina.
- **Custo marginal:** 🟢 baixo → assinatura fixa.

### 🗓️ Agendar / enviar com o app desligado
Postar aviso ("vou ao ar às 20h"), agendar ações, ou manter o envio rodando **sem o app aberto**.
- **Por que servidor:** roda quando seu PC está off.
- **Custo marginal:** 🟢 baixo → assinatura fixa.

### 👥 Histórico, analytics e comunidade persistentes
Guardar chat/viewers de **todas** as lives na nuvem, dashboards de longo prazo, **leaderboard
cross-platform** persistente, "fã do mês".
- **Por que servidor:** storage + agregação contínua.
- **Custo marginal:** 🟡 médio (storage/compute) → cota.

### 🧑‍🤝‍🧑 Time / multi-seat (web)
Mods e editores acessando dashboard/clipes pela web, permissões.
- **Por que servidor:** contas + acesso web compartilhado.
- **Custo marginal:** 🟢 por assento.

---

## 4. Modelos de cobrança (como, não só o quê)

- **Freemium com nuvem opcional.** App local **grátis e completo** + **"Corneta+"** (assinatura) pros
  extras de servidor de **custo baixo** (overlay hospedado, controle remoto, watchdog, agendamento,
  histórico).
- **Medido/créditos pro que é caro.** Relay (GB ou horas), IA (minutos), storage (GB) → **metered**
  ou pacotes de crédito. Estilo Restream: ao bater o limite, **para** (sem cobrança-surpresa).
- **Add-ons.** Relay e "AI Clips" como **complementos** por cima do Corneta+ (igual o Restream cobra
  +US$ 29/mês por 100 clipes de IA).
- **Time por assento.** +X/assento/mês (referência Restream: US$ 25/assento).
- **Apoio sem gate (opcional).** "Pague um café"/apoiador recorrente que **não destrava nada** — só
  ajuda o projeto e dá um badge bonitinho. O grátis continua completo.
- **Self-host (BYO server).** Power user pode rodar **o próprio relay/servidor** (grátis, open-ish);
  a Corneta hospeda pra quem quer **conveniência** (pago). Mantém o ethos aberto e tira pressão.

---

## 5. Esboço de tiers (rascunho, pra discutir)

| | **Corneta** (Free) | **Corneta+** (~US$ 8–12/mês) | **Add-ons** (metered) | **Time** |
|---|---|---|---|---|
| Multistream local, chat, alertas, relatório, clipes… | ✅ tudo | ✅ | — | — |
| Overlay/alert box **hospedado** + perfil público | — | ✅ | — | ✅ |
| Controle remoto **pela internet** + watchdog + agendar | — | ✅ | — | ✅ |
| Histórico/analytics/leaderboard **na nuvem** | — | ✅ (cota) | — | ✅ |
| **Relay na nuvem** (poupa seu upload) | — | — | 💳 por hora/GB | 💳 |
| **IA na nuvem** (legenda/tradução/resumo/clipe) | local leve grátis | cota base | 💳 por minuto | 💳 |
| **Gravação/VOD na nuvem** + storage | — | cota base | 💳 por GB | 💳 |
| Assentos de time (web) | — | — | — | +US$/assento |

> Números são **chute inicial** ancorado no Restream (US$ 16–39 pelo relay; +US$ 29 AI Clips; US$ 25/
> assento). Como o **multistream básico é grátis** na Corneta, o **Corneta+ pode ser mais barato** que
> eles — você só paga os extras de nuvem, não o multistream.

---

## 6. A matemática honesta (pra não prometer o impossível)

- **Relay** é o de **maior valor e maior custo**: *egress* multiplica pelo nº de plataformas
  (~8 GB/h × N a 6 Mbps). 100h/mês × 3 plataformas ≈ **centenas de GB** → **dezenas de dólares** só
  de banda. Por isso **medido/limitado**, nunca "ilimitado por US$ 5".
- **IA** custa por minuto/token (uma live de 4h = ~240 min de STT). Cota generosa + metered acima.
- **Storage** é barato por GB mas **acumula** → **retenção** (ex.: 30 dias) ou cota.
- **Overlay/remoto/watchdog/agendar** são **baratos** (quase idle) → cabem **fixos** no Corneta+.

Regra: **custo marginal baixo → fixo (Corneta+); custo marginal alto → medido (add-on).**

---

## 7. Riscos & armadilhas

- **C007 — canibalizar o grátis.** A tentação de "mover" uma feature local pro pago. **Nunca.** Quebra
  o princípio e a confiança de uma vez.
- **Relay no prejuízo.** Subprecificar a banda = perder dinheiro por stream. Medir desde o dia 1.
- **Suporte/uptime.** Servidor pago = expectativa de **uptime** e suporte. Custa tempo, não só infra.
- **Complexidade de billing.** Metered + créditos + assentos pode virar um monstro. Começar **simples**
  (1 tier pago de custo baixo) e só depois os add-ons caros.
- **Confiança é frágil.** Um deslize (gatear algo local, um *watermark*) e a narrativa "sem pegadinha"
  morre. Vale mais que qualquer feature.

---

## 8. O que **NÃO** fazer

- ❌ Tornar paga **qualquer** feature que roda 100% local (multistream, chat, alertas, relatório…).
- ❌ *Watermark*, anúncio, ou venda de dados no grátis.
- ❌ Capar o grátis (limite de plataformas, de tempo) pra forçar upgrade. **O grátis é completo.**
- ❌ Assinatura que não cobre custo de servidor real (vira pegadinha ao contrário — insustentável).
- ❌ Prometer "relay ilimitado barato" — a banda não deixa.

---

## 9. Próximo passo sugerido

O caminho de **menor risco e maior aprendizado**: começar pelos extras de **custo baixo** num único
**Corneta+** (overlay hospedado + controle remoto pela internet + watchdog + agendamento). Valida a
disposição a pagar **sem** o risco financeiro do relay. Depois, com base na demanda, abrir os add-ons
**medidos** (relay, IA, storage) — que são os de maior valor mas exigem billing por uso.

Antes de qualquer um: decidir **conta/identidade** (precisa de login só pros recursos de servidor — o
app local segue sem login) e o **provedor de infra** (a escolha de banda barata faz ou quebra o relay).
