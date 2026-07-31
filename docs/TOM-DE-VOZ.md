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

## 4. Os três vícios

São os defeitos que aparecem quando a escrita entra no piloto automático — e os três dão o mesmo
cheiro de texto gerado por máquina.

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

---

## 6. Mecânica

| item | regra |
|---|---|
| Pessoa | `você`, nunca `usuário` (exceto texto jurídico) |
| Plataforma | sempre **plataforma** — nunca "serviço", "canal de destino" ou "rede" |
| Contração | `pra` em interface; `para` só em texto legal |
| Travessão | marca a virada da frase — não é vírgula enfeitada |
| Ponto final | frase de apoio leva; título grande de pôster pode dispensar |
| Emoji | raro e funcional (🛡️ no vazamento, 📣 no slate, 💜 em seguidores). Nunca decorativo |
| Reticência | só em estado de espera (`Baixando…`, `Olhando…`) |
| CAPS | só em `BORA AO VIVO` e `JÁ VOLTO` — são nomes, não ênfase |
| Número | escreva o número (`12s`, `25 Mb/s`, `três lugares`), não "alguns" nem "vários" |

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
5. **Tem imagem ao lado?** O texto aposta no que ela mostra?
6. **Leia em voz alta.** Se você não falaria assim no Discord, não escreva assim no app.

---

## 8. Cuidado com a repetição

Frase boa vira cacoete quando se repete. Numa revisão, `"a gente prefere te falar isso agora do
que depois do download"` aparecia em **duas** respostas do FAQ — uma vez é honestidade, duas é
tique. Mesma coisa com uma piada: `"a Kick caiu"` no subtítulo e `"Se a Kick cair"` no título
logo abaixo matava as duas.

Ao editar uma seção, releia as vizinhas.
