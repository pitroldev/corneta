# "Me paga um cafezinho" — meios de pagamento pro About

> Recomendação de **como receber gorjeta voluntária** (o clássico *buy me a coffee*) na tela
> **Sobre**, pro dev (pitrol.dev). Compara plataformas, pesa os tradeoffs e recomenda.

- **Status:** Recomendação / decisão em aberto · 2026-07-04
- **Relacionado:** [`MONETIZACAO.md`](./MONETIZACAO.md) (isto **não** é monetização — é gratidão opcional),
  `src/screens/AboutScreen.tsx` (onde o botão entra)

---

## 0. Objetivo (e o que NÃO é)

Um jeito de quem gosta da Corneta **dar um trocado** pro dev, de graça e sem obrigação. Fica na tela
**Sobre**, do lado do `pitrol.dev`/GitHub/LinkedIn que já existem.

**Não confunda com [`MONETIZACAO.md`](./MONETIZACAO.md):** aquilo é o modelo de negócio (pago =
server-side). Isto é **gorjeta** — não destrava nada, não tem *dark pattern*, não estrangula o grátis.
Justamente por isso combina com a promessa "grátis e de código aberto" do rodapé do About. O tom certo é
o humilde do app ("me paga um cafezinho ☕"), não pedinte.

---

## 1. O que MANDA na escolha (o contexto decide, não a moda)

Antes de olhar plataforma, os fatos que filtram tudo:

1. **Quem paga é streamer brasileiro médio.** No Brasil, isso é sinônimo de **Pix**: todo mundo tem,
   é instantâneo, de graça, e o pagador **não cria conta em lugar nenhum**. Qualquer fluxo de
   cartão/PayPal é fricção enorme pra ganho quase zero.
2. **Quem recebe é pessoa física BR** (dev, pitrol.dev). Pix cai direto na conta; gringo-first (Stripe,
   PayPal) mete câmbio, taxa e saque.
3. **É um app desktop, offline-friendly.** Quanto **menos dependência externa**, melhor: um QR + "copia
   e cola" embutido não precisa de servidor, conta, nem SDK.
4. **Filosofia da casa:** sem fricção, sem terceiro cobrando pedágio à toa, sem poluir a UI. "Se não
   afeta o streamer, não comunica" → **uma ou duas opções, não seis.**

> Conclusão adiantada: no Brasil, o "buy me a coffee" mais honesto é literalmente **um cafezinho no Pix**.

---

## 2. Opções e tradeoffs

Taxas são **aproximadas e mudam** — confirme na hora de cadastrar.

| Meio | Taxa | Recorrência | Fricção pro pagador BR | Precisa conta/CNPJ | Gringo | Nativo no app |
|---|---|---|---|---|---|---|
| **Pix (chave aleatória)** | **0%** (PF) | ❌ (só avulso) | **mínima** (todo mundo tem) | conta bancária, sem CNPJ | ❌ BR-only | ✅ QR + copia-e-cola, **sem terceiro** |
| **Ko-fi** | **0%** plataforma + ~3–5% do processador | ✅ opcional | **alta** (exige cartão/PayPal) | conta Ko-fi grátis | ✅ | 🔗 link externo |
| **Buy Me a Coffee** | **~5%** + processador | ✅ (membership) | alta (cartão/Apple/Google Pay) | conta grátis | ✅ | 🔗 link externo |
| **GitHub Sponsors** | **0%** (GitHub cobre) | ✅ | alta (cartão) | elegibilidade BR via Stripe (historicamente limitada) | ✅ | 🔗 link externo |
| **LivePix** | grátis + taxa por saque | ❌ | baixa (**é Pix**) | conta LivePix | ❌ | 🔗 página pronta (+ alertas) |
| **Apoia.se** | ~8–12%+ | ✅ (é o foco) | média | conta | ❌ | 🔗 externo |
| **Mercado Pago (link)** | ~0,99–4,99% no recebimento | ❌ | baixa (Pix/cartão/boleto) | conta MP | parcial | 🔗 externo |
| **Stripe Payment Link** | ~3,99% + R$0,39 (cartão); Pix menor | ✅ | baixa (**aceita Pix** no BR) | **conta Stripe BR (CNPJ/MEI)** | ✅ | 🔗 externo |
| **PayPal.me** | ~ + câmbio | ❌ | **muito alta** no BR | conta | ✅ | 🔗 externo |

### Leitura rápida
- **Pix** ganha em tudo que importa pro público (taxa 0, instantâneo, zero conta pro pagador, zero
  dependência). Perde em: **não é recorrente**, **é BR-only** e — o mais importante — **quem paga vê o
  seu nome** (e o CPF mascarado) na confirmação anti-fraude (ver §5, *Privacidade do nome*). Os dois
  primeiros são contornáveis; o nome é uma escolha consciente (ou um caso pra MEI/plataforma).
- **Ko-fi vs Buy Me a Coffee:** mesma ideia, mas **Ko-fi não cobra a plataforma (0%)** e o BMC cobra ~5%.
  Se for ter um botão "buy me a coffee" de marca, **Ko-fi** é o melhor dos dois. Nenhum dos dois faz Pix.
- **GitHub Sponsors** é ótimo (0% e combina com projeto OSS), mas o público aqui é **streamer, não dev** —
  e a elegibilidade BR já foi capenga. Serve mais pra atrair contribuidor de código do que gorjeta de fã.
- **LivePix** é Pix e é feito pra streamer, mas é **terceiro cobrando saque** pra fazer o que o Pix cru
  faz de graça; faz mais sentido pro fluxo de doação **do streamer** do que pra gorjeta do dev.
- **Stripe/Mercado Pago link** só valem a pena se você **já tem CNPJ/MEI** e quer aceitar **cartão** de
  quem não usa Pix. Setup e taxa maiores — exagero pra um cafezinho.
- **Patreon/Apoia.se/PayPal:** recorrência é peso demais pra gorjeta, e PayPal no BR é fricção pura. Fora.

---

## 3. Recomendação

**Faça isto (2 opções, no máximo):**

1. **Pix (chave aleatória) — o principal, embutido no About.** Um card "Me paga um cafezinho ☕" com
   **QR + botão "copiar chave Pix" (copia e cola)**. Zero taxa, zero terceiro, zero conta pro pagador,
   100% nativo do público. É o "buy me a coffee" mais brasileiro que existe.
2. **Ko-fi — opcional, o "buy me a coffee" de marca.** Um único link externo (igual aos botões que já
   existem no About) pra quem é **de fora do Brasil** ou quer **apoio recorrente**. Escolhi Ko-fi por ser
   **0% de plataforma** (vs. 5% do BMC).

**Não faça (por enquanto):** Buy Me a Coffee (5% e sem Pix), PayPal (fricção BR), Patreon/Apoia.se
(recorrência pesada demais), Stripe/Mercado Pago link (só se já tiver CNPJ e quiser cartão). Um monte de
botão de doação **espanta** mais do que converte.

> Regra de ouro: **Pix pro BR (99% do público), Ko-fi pro resto.** Se quiser começar com o mínimo,
> comece **só com o Pix** — cobre quase todo mundo sem nenhuma dependência nova.

> **Ressalva de privacidade:** o Pix mostra o **seu nome** pra quem paga (§5). Se você não quer expor o
> nome pessoal, duas opções: **Pix de MEI** (o pagador vê a razão social) ou promover o **Ko-fi/LivePix**
> a principal — aí um terceiro fica entre você e o pagador e o seu nome não aparece pra ele.

---

## 4. Como embutir no About (implementação leve)

O `AboutScreen.tsx` já tem o padrão pronto: botões-card com `openUrl(...)`. O Pix não precisa nem de
rede.

- **Pix (sem backend, sem lib nova):**
  - Gere **uma vez** no seu banco o **"copia e cola" (BR Code / payload EMV)** de uma **chave aleatória**,
    de preferência **sem valor fixo** (quem dá escolhe quanto).
  - Guarde a string como constante e mostre um botão **"copiar chave Pix"** → `navigator.clipboard.writeText(...)`
    (o app já usa esse padrão no overlay/chat).
  - QR: ou **empacote um PNG estático** em `assets/` (gerado do mesmo payload) e exiba, ou gere no cliente.
    Um PNG estático é o caminho de menor atrito — a chave é fixa.
- **Ko-fi:** um `LinkDef` a mais no array `LINKS` (ou um card próprio), `openUrl("https://ko-fi.com/<user>")`.
  Reaproveita `openUrl` (shell do Tauri com fallback pro navegador) que já existe no arquivo.
- **UI:** um card discreto abaixo das redes, com o mascote/☕ e um texto leve ("gostou? me paga um
  cafezinho"). Nada de modal ou banner — coerente com o rodapé "grátis e de código aberto".

---

## 5. Cuidados

- **Chave:** use **chave aleatória** (não CPF, telefone nem e-mail). Isso evita **publicar** seu
  CPF/telefone/e-mail *como* a chave no app, e ela é **revogável**. Mas atenção: a chave aleatória
  **não esconde o seu nome** (ver abaixo).
- **Privacidade do nome (importante):** em QUALQUER Pix, na hora de te pagar, o app do banco do pagador
  mostra pra ele o **seu nome** (completo ou quase) e o **CPF mascarado** (`•••.456.789-••`, nunca o
  inteiro) — é a confirmação anti-fraude do Pix e **independe do tipo de chave**. O nome NÃO fica
  publicado numa página; ele aparece **1:1**, só pra quem de fato inicia um pagamento. Se isso incomoda,
  três saídas:
  1. **MEI/CNPJ** → o pagador vê a **razão social/nome fantasia**, não o seu nome pessoal (~uns reais/mês).
  2. **Plataforma no meio** (Ko-fi, LivePix, Mercado Pago) → o fã paga a plataforma, então o seu nome não
     aparece pra ele. É o caso em que um terceiro **compra privacidade** pra você — ponto a favor do Ko-fi.
  3. **Aceitar** → pra um cafezinho, o dev ter o nome visível 1:1 costuma ser tranquilo.
- **Imposto:** gorjeta é **renda** — guarde o histórico e declare. (Não é aconselhamento jurídico.)
- **Termos das plataformas:** Ko-fi/BMC/Stripe têm regras de uso; ler antes de plugar.
- **Tom:** um cafezinho, não um pires na cara. O charme é ser opcional e humilde — do jeito da Corneta.

---

## 6. TL;DR

**Pix com chave aleatória, embutido no About (QR + copia-e-cola), como principal — taxa 0, fricção 0,
nativo do streamer BR. Ko-fi como link opcional pro público de fora/recorrente (0% de plataforma).
Só isso. Se for pra escolher um, é o Pix.**

**Ressalva:** o Pix mostra o **seu nome** pra quem paga (não é público, mas cada pagador vê). Se isso
incomoda, vá de **Pix-MEI** (aparece a razão social) ou promova o **Ko-fi/LivePix** a principal (§5).
