# Tom de voz da Corneta

> Como a Corneta escreve — no app, na LP e nas mensagens de erro. Não é manual de marca:
> é a régua concreta que a gente usa pra decidir entre duas frases.

- **Status:** ✅ Em uso · 2026-07-31
- **Relacionado:** [`REVISAO-UX-UI.md`](./REVISAO-UX-UI.md), [`PLANEJAMENTO.md`](./PLANEJAMENTO.md)

---

## 1. Pra quem a gente fala

**Streamer brasileiro médio.** Sabe montar cena no OBS, não sabe o que é Docker. Já perdeu live
por coisa boba e não quer perder de novo. Lê no celular enquanto o jogo carrega.

Ele não é "usuário", não é "criador de conteúdo" e não é "profissional de streaming". É **você**.

> No repositório inteiro a palavra "usuário" aparece 3 vezes, todas em texto jurídico ou em
> comentário de código. Isso não é acidente — é o teste passando.

---

## 2. A regra que resolve quase tudo

**Diga a coisa específica.**

Quase todo texto ruim que já escrevemos aqui era abstrato. Quase toda correção foi trocar um
substantivo genérico por uma coisa que existe na tela.

| genérico | específico |
|---|---|
| "sem perder o controle" | "Se a Kick cair, a Twitch nem fica sabendo" |
| "quando algo dá errado" | "porque o OBS travou" |
| "prepare sem medo de esquecer" | "chega no BORA sem aquele frio na barriga" |
| "o resto do cuidado" | "coisa pequena que você só nota na terceira live" |
| "fica na bandeja do sistema" | "esconde a Corneta perto do relógio" |

Se a frase serve pra descrever o concorrente também, ela não descreve a Corneta.

---

## 3. As cinco características

### 3.1 O app fala em primeira pessoa do que ele fez

Ele agiu, então ele conta. Nada de voz passiva nem de "operação concluída".

✅ `"Atualizei a grade no OBS"` · `"Tirei a Mesa do OBS."` · `"Instalei — feche e abra a Corneta
pra terminar."` · `"cortei pro JÁ VOLTO"` · `"monto o relatório dela aqui"`

❌ `"Grade atualizada com sucesso"` · `"A atualização foi instalada"` · `"Operação concluída"`

### 3.2 Erro começa com "Não consegui" e termina no que fazer

Não é sugestão: são **16 ocorrências** no código, todas no mesmo formato. O app assume a falha
como dele, mesmo quando a culpa é do ambiente, e oferece a saída.

✅ `"Não consegui atualizar a grade no OBS — vê se ele tá aberto."`
✅ `"Não consegui medir o upload — sem internet?"`
✅ `"Não consegui dar play no OBS — dê play manualmente."`

❌ `"Erro ao atualizar a grade."` · `"Falha na operação (código 3)."` · `"O OBS não está disponível."`

> A pergunta no fim (`— sem internet?`) funciona porque é um palpite honesto, não um diagnóstico
> fingido. Use quando você realmente não sabe a causa.

### 3.3 Escreve do jeito que se fala

`tá`, `pra`, `vê se`, `num instante`, `dá uma olhada`. Contração e informalidade são o padrão em
texto de interface.

✅ `"vê se ele tá aberto"` · `"Você tá no ar"` · `"volta pro jogo"` · `"tenta de novo num instante"`

❌ `"verifique se está aberto"` · `"Você está transmitindo"` · `"aguarde alguns instantes"`

**Exceção:** texto legal (Termos, Privacidade) e escopos de OAuth usam português formal. Ali a
precisão vale mais que a proximidade.

### 3.4 Assume o limite antes de a pessoa descobrir sozinha

É a característica mais cara de manter e a que mais rende confiança. Se tem defeito, ressalva ou
concorrente melhor pro caso dela, diga — **antes do download**, não depois.

✅ `"Rede de segurança, não garantia."`
✅ `"Se você só quer mandar o mesmo vídeo pra mais de um lugar, o plugin resolve"`
✅ `"Se o seu caso é macOS ou Linux, a resposta é: por enquanto, não."`
✅ `"Custa 12s de atraso na live inteira (o chat também)."`

❌ `"A Corneta protege sua privacidade."` · `"Compatível com os principais sistemas."`
❌ Omitir o custo de uma proteção porque ele é feio.

### 3.5 Nomeia coisas que existem na tela

OBS. Kick. Cofre do Windows. O minuto do VOD. Perto do relógio. O Studio do YouTube.

✅ `"guarda ela no cofre do Windows — nunca num arquivo de configuração"`
✅ `"a Corneta cria a transmissão e injeta a chave no BORA. Sem abrir o Studio."`

❌ `"armazenamento seguro de credenciais"` · `"integração simplificada com a plataforma"`

---

## 4. Os cinco vícios

São os defeitos que aparecem quando a escrita entra no piloto automático. Os três primeiros dão o
mesmo cheiro de texto gerado por máquina; os dois últimos são piores, porque passam despercebidos
justamente por parecerem certos — um soa como a nossa voz, o outro é específico demais.

### 4.1 A antítese simétrica

Duas metades espelhadas que soam profundas e não dizem nada. Some se você trocar os substantivos.

| ❌ não | ✅ sim |
|---|---|
| "Você cuida do conteúdo. A Corneta cuida do caminho." | "Uma tela só — inclusive na hora que dá ruim." |
| "Multistream para quem quer criar, não manter servidor." | "Multistream que roda no seu PC — não na nuvem de ninguém." |
| "Sem mensalidade de retransmissão. Sem mandar chaves pra nuvem." | "Não tem mensalidade porque não tem servidor nosso no meio." |

> O terceiro caso mostra a saída: trocar duas negações espelhadas por **uma causa**. Dizer *por
> que* é grátis convence mais do que anunciar que é.

### 4.2 A regra de três

Ritmo bonito, informação zero. Três itens abstratos numa lista quase sempre são um item real
esticado.

| ❌ não | ✅ sim |
|---|---|
| "Menos janela pra vigiar, menos susto no meio da live e mais tempo pra falar com quem tá assistindo." | "Sem alt-tab pra saber quem ainda tá no ar e quem tá falando com você." |
| "Baixe a Corneta, ligue no seu programa de live e chegue mais longe." | "Sua próxima live já podia estar em três lugares." |

**Quando três está certo:** quando os três itens são coisas concretas e diferentes, não sinônimos
com roupa nova. `"Sem terminal, sem Docker, sem endereço de servidor pra decorar"` fica — cada
item mata um medo distinto.

### 4.3 O substantivo abstrato fazendo o trabalho

*Controle, cuidado, caminho, experiência, jornada, solução, capricho.* Nenhum deles é uma coisa
que existe na tela. Se o substantivo principal da frase for um desses, a frase ainda não foi
escrita.

### 4.4 A gíria que faz cara de voz

O vício mais difícil de pegar, porque ele se **esconde dentro da virtude**: o tom é casual e
brasileiro, então uma expressão feita passa no teste do "isso soa como a gente?" sem dizer nada.
*Não larga do osso · dar conta do recado · tirar de letra · cair como uma luva.*

| ❌ não | ✅ sim |
|---|---|
| "E não larga do osso: segura a live, junta o chat e, no fim, te conta como foi." | "Se o OBS fechar, ela segura a live no ar. O chat das três chega numa janela só. E no fim ela diz em que minuto engasgou." |
| "A Corneta dá conta do recado." | "A Corneta reconecta o destino sozinha, sem derrubar os outros." |

**O teste que resolve: traduza pro inglês.** A LP e o app são bilíngues, e frase feita não
atravessa — ela vira *outra* figura de linguagem, porque não havia fato pra carregar. Aconteceu
exatamente assim: `"não larga do osso"` virou `"it doesn't look away"`, uma imagem completamente
diferente, e ninguém notou porque as duas eram igualmente vazias. Frase com conteúdo chega do
outro lado com o **mesmo** conteúdo, mesmo que com outras palavras.

> Isto não proíbe falar como gente — `"bora cornetar"`, `"tá liso"` e `"segura a corneta"`
> continuam. A diferença é que essas são **nossas** e dizem algo; a expressão feita é de todo
> mundo e não diz nada.

### 4.5 O nome interno na cara do streamer

Palavra que só existe no nosso código ou no nosso design system, escrita como se o streamer
soubesse dela. É o vício que a regra 4.3 **não** pega: `"a linha de latão"` é concretíssima — só
que num vocabulário que quem lê não tem.

| ❌ não | ✅ sim | de onde vazou |
|---|---|---|
| "A linha de latão não desce." | "As três plataformas continuaram recebendo vídeo." | `latão` é o nome da cor no `DESIGN.md` |
| "O compositor segue publicando." | "A live continua no ar mesmo com o OBS fechado." | `compositor` é um módulo do Rust |
| "O slate entrou." | "A tela JÁ VOLTO entrou no ar." | `slate` é o nome no código; na tela está escrito JÁ VOLTO |

**O teste: essa palavra aparece em algum lugar da tela do streamer?** Se ela só existe no
`DESIGN.md`, no nome de um arquivo ou numa conversa nossa, ela não é copy. Lista curta do que
nunca sai daqui: *latão, tomate, breu, papel* (cores), *compositor, splicer, bomba, programa,
slate* (código), *NDJSON, schemaVersion, sessão* (dados).

---

## 5. Regra que ninguém lembra e vale por dez

**Se tem imagem, demonstração ou dado ao lado do texto, o texto tem que apostar no que ela mostra.**

Aconteceu duas vezes na mesma revisão:

- O painel mostrava *Twitch NO AR · YouTube NO AR · Kick RECONECTANDO*, e o título dizia "Chegue
  em mais lugares sem perder o controle". Virou **"Se a Kick cair, a Twitch nem fica sabendo"**.
- A arte ao lado era a tela JÁ VOLTO, que existe pra quando o OBS cai, e o título dizia "Quando
  algo dá errado". Virou **"Sua live não devia acabar porque o OBS travou."**

Nos dois casos o defeito não era escrita ruim: era abstração **desperdiçando uma demonstração que
a página já tinha**.

### A outra beirada da mesma regra

Apostar na demonstração é dizer o que ela **significa** — não descrever como ela é. Descrever o
desenho parece obedecer a regra (o texto está falando da imagem!) e é o erro oposto: obriga o
leitor a decorar a legenda antes de entender a frase.

| ❌ descreve o desenho | ✅ diz o que aconteceu |
|---|---|
| "A linha de latão não desce." | "As três plataformas continuaram recebendo vídeo." |
| "A barra amarela some no minuto 118." | "A Twitch ficou 8s fora à 1h58." |

Regra prática: se a frase deixa de fazer sentido quando alguém troca a cor do gráfico, ela está
falando do desenho.

---

## 6. Mecânica

| item | regra |
|---|---|
| Pessoa | `você`, nunca `usuário` (exceto texto jurídico) |
| Plataforma | sempre **plataforma** — nunca "serviço", "site", "canal de destino" ou "rede" |
| Gênero da plataforma | **a** Twitch, **a** Kick, **o** YouTube — o feminino segue "a plataforma" |
| Contração | `pra` em interface; `para` só em texto legal |
| Travessão | marca a virada da frase — não é vírgula enfeitada |
| Ponto final | frase de apoio leva; título grande de pôster pode dispensar |
| Emoji | raro e funcional (🛡️ no vazamento, 📣 no slate, 💜 em seguidores). Nunca decorativo |
| Reticência | só em estado de espera (`Baixando…`, `Olhando…`) |
| CAPS | só em `BORA AO VIVO` e `JÁ VOLTO` — são nomes, não ênfase |
| Número | escreva o número (`12s`, `25 Mb/s`, `três lugares`), não "alguns" nem "vários" — **se ele existir** (ver abaixo) |

### A precisão inventada

A regra do número tem um contra-veneno, e ele custou duas frases numa revisão só:

| ❌ específico e falso | ✅ o que dava pra afirmar |
|---|---|
| "Tem servidor em São Paulo, no Rio e em Porto Alegre" | "O servidor dela mais perto daqui fica em São Paulo" |
| "se em 10 segundos nada mudar aqui" | "se esta tela não mudar" |

Nos dois casos a frase original era vaga ("servidores em várias regiões", "alguns segundos") e a
correção trocou a vagueza por um número que **não existe**: a Twitch tem um ingest na América do Sul,
e o fluxo do BORA não tem timer de 10s. Ninguém checou porque texto específico *soa* verificado.

> **A regra completa:** escreva o número quando ele estiver no código, na API ou na tela. Quando não
> estiver, não invente — troque o advérbio por uma coisa **observável** ("se esta tela não mudar"),
> que é específico sem afirmar o que você não sabe.

O teste: **onde eu confiro esse número?** Se a resposta não for um arquivo, uma requisição ou um
print, ele não entra.

**Rótulo de botão** é verbo do que vai acontecer: `Atualizar agora`, `Copiar imagem`, `Abrir pasta`.
Nunca `OK`, `Confirmar` ou `Enviar` sozinho.

**`aria-label` e `title`** são funcionais, não bem-humorados — quem depende deles quer saber o que
o controle faz. `"Fechar o aviso da atualização"`, não `"Some daqui"`.

---

## 7. O teste, na ordem

Antes de dar a frase por pronta:

1. **Troque "Corneta" pelo nome de um concorrente.** Continua verdadeira? Então ela não posiciona
   ninguém — reescreva.
2. **A frase tem duas metades espelhadas?** É antítese. Vire uma causa ou corte uma metade.
3. **Tem exatamente três itens?** Confira se os três são coisas diferentes ou o mesmo item três
   vezes.
4. **Qual é o substantivo principal?** Se ele não existe na tela, troque por um que exista.
5. **Toda palavra aparece na tela do streamer?** Nome de cor, de módulo ou de arquivo não é copy.
6. **Tem expressão feita?** Traduza pro inglês de cabeça. Se ela vira outra figura de linguagem
   em vez do mesmo fato, ela não tinha fato nenhum.
7. **Tem imagem ao lado?** O texto aposta no que ela mostra — e diz o que ela significa, não como
   ela é desenhada?
8. **Leia em voz alta.** Se você não falaria assim no Discord, não escreva assim no app.

---

## 8. Cuidado com a repetição

Frase boa vira cacoete quando se repete. Numa revisão, `"a gente prefere te falar isso agora do
que depois do download"` aparecia em **duas** respostas do FAQ — uma vez é honestidade, duas é
tique. Mesma coisa com uma piada: `"a Kick caiu"` no subtítulo e `"Se a Kick cair"` no título
logo abaixo matava as duas.

Ao editar uma seção, releia as vizinhas.
