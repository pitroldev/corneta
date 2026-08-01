# Slogan da Corneta — crítica e alternativas

> Auditoria do H1 atual e um conjunto de substitutos, derivados da
> [`PROPOSTA-DE-VALOR.md`](./PROPOSTA-DE-VALOR.md) e testados contra a régua do
> [`TOM-DE-VOZ.md`](./TOM-DE-VOZ.md).

- **Onde vive:** `web/lib/i18n/pt.ts` → `hero.title.line1/2/3` (e o par em `en.ts`)
- **Revisão 2** · 2026-07-31 — a primeira rodada de candidatos foi descartada; o §4 explica por quê

---

## 1. O slogan atual

```
Uma live.                    One stream.
Várias comunidades.          All your communities.
Nada passa batido.           Nothing slips past you.
```

### O que ele acerta — e não é pouco

- **Três tempos curtos** dão um ritmo de pôster que o desenho do hero carrega bem. A estrutura não
  é o problema.
- **"Uma live."** é um bom começo: concreto, e é o insumo real do produto.
- Em dois segundos a pessoa sabe de que categoria se trata.
- **A intenção do terceiro tempo está certa** — ele tenta dizer "a Corneta cuida da live inteira",
  que é a promessa correta. O problema é a execução, não a estratégia.

### Onde ele falha

| # | teste do §7 do tom de voz | |
|---|---|---|
| 1 | Troque "Corneta" por um concorrente | ❌ **falha feio** |
| 2 | Duas metades espelhadas? | ❌ antítese numérica |
| 3 | Três itens são coisas diferentes? | ❌ duas ideias em três tempos |
| 4 | O substantivo principal existe na tela? | ❌ "comunidades" não existe |
| 6 | Tem expressão feita? | ❌ **"nada passa batido"** |
| 7 | Aposta na demonstração ao lado? | ❌ ignora o painel |

**O teste 1 é o mais grave.** "Uma live. Várias comunidades." é a definição da *categoria*. Restream,
Castr, StreamYard e o plugin grátis do OBS se descrevem com ela. Um H1 que serve pra qualquer
concorrente não posiciona ninguém.

**O teste 6 já estava previsto no próprio doc.** "Nada passa batido" é a *gíria que faz cara de voz*
do §4.4: soa brasileiro, passa no teste do "isso soa como a gente?", e não carrega fato. O método
pra pegar é traduzir — e o resultado está no repositório:

> `"Nada passa batido."` → `"Nothing slips past you."`

*Batido* é passar despercebido; *slip past* é escapar. **Imagens diferentes**, e ninguém notou
porque as duas eram igualmente vazias. É o mesmo acidente de `"não larga do osso"` →
`"it doesn't look away"`, documentado no §4.4.

> O sintoma que confirma: a linha em `en.ts` precisou de um **comentário justificando** a tradução.
> Frase com fato atravessa sozinha. Quando precisa de nota de rodapé, é porque não havia fato.

---

## 2. A versão que veio de fora

> **Uma comunidade. / Várias lives. / Nada passa batido.**

**O que ela acerta, e é o achado mais valioso deste documento:** ela troca o eixo de *encanamento*
por *gente*. "Uma comunidade" fala de pessoas; "várias plataformas" fala de tubos. O público não
sonha em ter três conexões RTMP — sonha em não perder ninguém pelo caminho. **Essa intuição está
certa e está incorporada no §5.**

**Os dois problemas:**

**1. Ela descreve o produto ao contrário.** A Corneta faz **uma** live virar **várias** saídas.
"Várias lives" lê como várias sessões de transmissão — que é outra coisa, e não é o que o app faz.

**2. Ela prova, sem querer, que a estrutura é oca.** O §4.1 do tom de voz define antítese vazia
como aquela que *"some se você trocar os substantivos"*. Aqui os substantivos foram **literalmente
trocados de lugar** — e a frase continuou funcionando igual. Se ela sobrevive à inversão do próprio
conteúdo, o conteúdo nunca esteve nela: estava na forma.

É o melhor argumento possível contra o formato "Uma X. Várias Y." — e ele veio de graça.

**E ela mantém "Nada passa batido"**, que é a linha mais fraca das três.

**Veredito:** a intuição vale ouro e foi adotada. A frase, não.

---

## 3. O que o H1 tem que fazer (vem da proposta de valor)

A `PROPOSTA-DE-VALOR.md` §10 define uma hierarquia de mensagem, e o H1 é o **nível 1**:

| nível | trabalho | onde |
|---|---|---|
| **1 · Promessa** | Em 2 segundos: você não fica sozinho na sua live | **H1** |
| 2 · Mecanismo | Como isso funciona sem custar nada | subtítulo |
| 3 · Colunas | não cai · galera junta · você sabe depois | seções |

**A regra que sai daí:** se o H1 descreve o *mecanismo*, ele roubou o trabalho do nível 2 e deixou a
promessa sem dono. É exatamente o defeito do slogan atual — "uma live pra várias comunidades" é
mecanismo puro.

E o mecanismo é justamente a parte **commodity**: existe plugin grátis dentro do OBS que faz
fan-out. Anunciar o mecanismo é anunciar a única coisa que não nos diferencia.

---

## 4. Por que a primeira rodada de candidatos foi descartada

A revisão 1 deste documento propôs seis alternativas. Todas as seis abriam com
**"Uma live. Três plataformas."** e fechavam com uma variação de *nada quebra*: `Nenhuma cai sem
você saber`, `Zero servidor no meio`, `Do BORA ao relatório`.

Dois defeitos de fundo, e nenhum deles era de escrita:

1. **Todas descreviam o mecanismo** — exatamente o que o §3 acabou de proibir. Elas trocavam uma
   frase de mecanismo por outra frase de mecanismo, mais precisa e igualmente errada de nível.
2. **Nenhuma tinha uma pessoa dentro.** Plataformas, servidores, quedas, relatórios. O produto
   existe pra que alguém não perca a galera dele, e não havia galera nenhuma em seis tentativas.

O feedback externo (§2) apontou o segundo defeito antes de mim. É o que reorienta o §5.

---

## 5. Candidatos

Todos partem do mesmo eixo: **gente, não tubo**. Todos passam pelos oito testes do §7 do tom de voz.

### ⭐ A — No ar desde 2026-07-31

```
Uma live.                    One stream.
Três plataformas.            Three platforms.
Um chat só.                  One chat.
```

> **O terceiro tempo era "Uma galera só", e foi vetado — com razão.** Em inglês "galera"
> vira `crowd`, que é multidão anônima: o oposto da audiência de um streamer. Teria
> repetido exatamente o acidente de "Nada passa batido" — palavra que soa como a gente e
> atravessa a tradução virando outra coisa.
>
> Os candidatos avaliados no lugar:
>
> | terceiro tempo | inglês | veredito |
> |---|---|---|
> | **Um chat só.** | `One chat.` | ✅ **escolhido** — "Chat" é tela do app e item da barra do site |
> | Uma conversa só. | `One conversation.` | mais quente, mas menos ancorado na tela |
> | Um público só. | `One audience.` | correto e sem graça |
>
> "Chat" ganhou pelo teste 5 do tom de voz: é a única das três que a pessoa **vê escrita**
> — no app e na própria navegação da LP.

| teste | |
|---|---|
| 1 · concorrente | ✅ o mosaico (Aitum + Restream Chat) não entrega isso num lugar só |
| 2 · antítese | ✅ **não é simétrica**: 1 → 3 → 1 é o fluxo real, e inverter dá bobagem |
| 3 · três itens | ✅ insumo · saídas · público — três coisas diferentes |
| 4 · substantivo | ✅ "galera" é a palavra que o público usa pra própria audiência |
| 6 · tradução | ✅ `One crowd.` carrega o mesmo fato |
| 7 · demonstração | ✅ o painel ao lado mostra as três plataformas e o chat unificado |
| 8 · repetição | ✅ `benefits.chat.title` fala da **coluna do chat**; aqui é a promessa |

**Por que este.** É a menor mudança possível que corrige os dois defeitos de uma vez: mantém a forma
de pôster, o comprimento das linhas e o layout — e o terceiro tempo deixa de ser idioma vazio pra
virar **a promessa com gente dentro**. O arco fecha: sua live sai de um lugar, vai pra três, e as
pessoas voltam como uma coisa só.

Além disso, é a resposta à intuição do §2 sem herdar o erro dela: a comunidade vira **uma** no
final, que é onde ela de fato vira.

---

### B — A mais memorável (avaliada em produção, não adotada)

```
Você fala em três lugares.        You talk in three places.
Eles respondem num só.            They answer in one.
```

**A favor:** é a frase mais humana e mais memorável do conjunto — tem duas pessoas dentro (você e
eles) e descreve o produto inteiro sem citar uma peça de software. Sobrevive à tradução sem perder
nada. É impossível de inverter.

**Contra:** são **dois** tempos, e o hero renderizava três `<span>`. Adotar exigiu mexer na
tipografia do H1.

**O que o layout custou, medido:** as frases são mais longas, então o corpo cedeu de **4,45rem para
3,85rem** no topo do clamp. Não mais que isso — a linha mais larga é a primeira **em português**
(667px numa coluna de 737px, ~10% de folga); o inglês é sempre mais curto e nunca é o limite. No
celular os `vw` são proporcionalmente menores que no desktop, porque lá a coluna é a tela inteira
menos a margem e a primeira linha encostava na borda em 390px.

A segunda linha é o `Slab`, que tem `whitespace-nowrap` — **ela não pode quebrar**, e é por isso
que o tamanho é calibrado e não estimado.

---

### C — A que assume a coluna 3

```
Uma live.                    One stream.
Três plataformas.            Three platforms.
Amanhã você sabe por quê.    Tomorrow you'll know why.
```

**A favor:** aposta na **única linha da tabela de concorrência onde não achamos ninguém** — o
relatório pós-live. A `ANALISE-CONCORRENCIA.md` §8 recomenda exatamente isso: *"a ponta de lança é
o relatório"*.

**Contra:** "por quê" sem antecedente obriga o leitor a supor que algo deu errado. Vende seguro
antes de mostrar o carro — funciona pra quem já perdeu uma live, e confunde o resto.

---

### D — A que encara o medo

```
Ninguém devia descobrir pelo chat
que a live caiu.
```

**A favor:** é a cena real, e é a dor nº 2 da proposta de valor. Ninguém consegue copiar essa frase
sem ter o produto que sustenta ela.

**Contra:** repete a **construção** de `protection.title` ("Sua live não devia acabar porque o OBS
travou"). Duas frases "não devia" na mesma página é o cacoete do §8. E abre a página com uma
catástrofe.

---

## 6. Decisão

**B está no ar.** É a frase mais memorável do conjunto — tem duas pessoas dentro (você e eles),
descreve o produto inteiro sem citar uma peça de software, e é a única que eu esperaria alguém
repetir pra um amigo. O custo de layout foi pago e medido.

**A fica de reserva**, com o terceiro tempo trocado (`Um chat só.` é o candidato). Volta a valer se
em algum momento a estrutura de três tempos for necessária de novo — por exemplo se o pôster do
`opengraph-image` pedir três linhas curtas.

**C entra quando o relatório virar a primeira dobra**, como a análise de concorrência recomenda.
Aí ele deixa de ser seguro-antes-do-carro e passa a ser a manchete do que a página inteira mostra.

---

## 7. O inglês não é tradução, é reescrita

**Regra de aceite:** se a linha em inglês precisar de um comentário no `en.ts` explicando por que a
imagem mudou, a linha em português ainda não tem fato dentro. Foi esse comentário que denunciou o
slogan atual.

| escolha | inglês |
|---|---|
| A | `One stream. / Three platforms. / One crowd.` |
| B | `You talk in three places. / They answer in one.` |
| C | `One stream. / Three platforms. / Tomorrow you'll know why.` |

---

## 8. Onde mexer

```
web/lib/i18n/pt.ts   → hero.title.line1 / line2 / line3
web/lib/i18n/en.ts   → as mesmas três chaves
```

Conferir depois: `web/app/opengraph-image.tsx` usa o título no cartão de compartilhamento — a linha
nova precisa caber lá antes de fechar.
