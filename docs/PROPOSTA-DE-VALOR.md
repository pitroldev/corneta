# Proposta de valor da Corneta

> A decisão de posicionamento, escrita pra ser discutida e contestada. Não é copy — é o que a copy
> tem que servir. O slogan, a LP e a ordem das features derivam deste documento.

- **Status:** proposta · 2026-07-31
- **Base:** [`ANALISE-CONCORRENCIA.md`](./ANALISE-CONCORRENCIA.md) (o mapa),
  [`MONETIZACAO.md`](./MONETIZACAO.md) (o litmus), [`TOM-DE-VOZ.md`](./TOM-DE-VOZ.md) (a régua),
  [`PLANO-SEO-AEO-GEO.md`](./PLANO-SEO-AEO-GEO.md) (a captura — ver §11)
- **Deriva daqui:** [`SLOGAN.md`](./SLOGAN.md)

---

## 1. A decisão, em uma frase

> **A Corneta não é um jeito de mandar sua live pra vários lugares. É a única coisa que fica
> olhando a live inteira — e a única que, no dia seguinte, sabe dizer o que aconteceu.**

Mandar pra vários lugares é commodity: existe plugin grátis dentro do OBS que faz isso. Se a nossa
promessa for essa, estamos brigando pelo menor diferencial com o maior atrito de entrada (app
separado, download, SmartScreen). A `ANALISE-CONCORRENCIA.md` chegou nessa mesma conclusão pelo
caminho dos dados; este documento a transforma em decisão.

**O multistream é o meio. A promessa é a vigília.**

---

## 2. Para quem, exatamente

Não é "streamer". É:

> **Quem já transmite pra mais de um lugar (ou quer), sozinho, num PC Windows — e já perdeu uma
> live sem entender por quê.**

Três marcadores que separam esse público do resto:

| marcador | por que importa |
|---|---|
| **Transmite sozinho** | Não tem operador olhando o painel. Se a Kick cair, ninguém avisa — ele descobre pelo chat |
| **Já perdeu uma live** | A dor é memória, não hipótese. Quem nunca perdeu não compra seguro |
| **Acompanha número** | O beta pediu métrica por canal, seguidor ganho e exportação. Isso é gente tratando live como carreira, não como hobby |

**A cabeça de ponte é o terceiro marcador.** Streamer que olha número é quem sente falta do
relatório — e o relatório é a única linha da tabela de concorrência onde não achamos ninguém.

**Quem NÃO é o público (e tudo bem):** quem transmite pra um lugar só; quem quer estúdio no
navegador com convidado e cenário (é StreamYard); quem quer o mosaico de melhores-da-categoria e
tem paciência de configurar quatro contas.

---

## 3. O trabalho que a pessoa está contratando

Não é "distribuir vídeo". Em ordem de dor:

1. **Não perder a live.** O OBS trava, a internet oscila, a plataforma recusa a chave.
2. **Não ser o último a saber.** Descobrir pelo chat que você está fora há vinte minutos é pior
   que a queda em si.
3. **Não perder a galera.** Três chats abertos significa não responder ninguém direito.
4. **Entender depois.** "Travou" sem causa vira superstição: baixa o bitrate no chute, troca de
   encoder no chute, e o problema volta.

O fan-out não está nessa lista. Ele é **pré-requisito**, não trabalho — é o que precisa existir
pra que os quatro acima façam sentido.

---

## 4. A vantagem estrutural — e por que ela não é uma feature

Aqui está o argumento que sustenta tudo, e é um argumento de **arquitetura**, não de roadmap.

A Corneta roda **na máquina do streamer**. Todo concorrente de nuvem roda no datacenter dele. Isso
tem duas consequências, e a segunda é a que quase ninguém enxerga:

### 4.1 Consequência óbvia: custo marginal zero

O vídeo nunca passa por servidor nosso. Logo, cada usuário novo custa **R$ 0** de banda. Grátis
não é promoção nem isca: é o que a arquitetura permite. O Restream **precisa** cobrar — cada minuto
transmitido é banda que ele paga.

> Isto também é uma trava contra nós mesmos: no dia em que colocarmos relay de vídeo nosso no
> caminho, viramos um Restream pior e perdemos o único preço que não dá pra copiar.

### 4.2 Consequência não-óbvia: ponto de observação

**Um relay de nuvem só enxerga os bytes que chegam nele.** Ele sabe que a transmissão parou. Ele
não sabe *por quê*, porque a causa ficou do outro lado do cabo.

A Corneta está **dentro** da máquina onde a causa acontece. No mesmo relógio, ela vê:

- o **OBS** (render lag, congestionamento, cena pesada) — via obs-websocket
- a **CPU e a GPU** reais
- o **bitrate e o estado de cada destino** — um FFmpeg por plataforma, nosso
- o **chat e a audiência** de cada canal

Cruzar essas quatro coisas é o que permite dizer *"aos 23:40 sua CPU estava em 98% e a Twitch
reconectou — troque o encoder pro da placa de vídeo"* em vez de *"a transmissão caiu"*.

**Nenhum produto de nuvem pode fazer isso, por mais dinheiro que tenha.** Não é uma feature que
eles não priorizaram; é uma informação que não passa pelo cabo deles.

> **O fosso não é a lista de features. É o ponto de observação.** É a única vantagem nossa que não
> some quando um concorrente decide copiar.

---

## 5. A proposta, na forma canônica

> Para o **streamer que transmite sozinho pra mais de uma plataforma no Windows**
> e que **já perdeu uma live sem descobrir o motivo**,
> a **Corneta** é um **app que roda no PC dele** que
> **mantém a live no ar, junta a galera numa tela e, no dia seguinte, aponta o minuto e a causa do
> que deu errado**.
> Diferente do **Restream e afins**, ela **não põe servidor nenhum no meio** — o que a torna grátis
> de verdade e a única capaz de ver a causa, que mora na máquina dele.
> Diferente do **plugin grátis do OBS**, ela **não é um cano** — ela acompanha, segura e conta.

---

## 6. As três colunas (e é nesta ordem)

Tudo que a Corneta faz cabe em três promessas. A ordem é de dor, não de dificuldade técnica.

### 🛟 Coluna 1 — A live não cai junto

Cada plataforma tem sua própria conexão e sua própria reconexão. Uma cai, as outras não sabem. Se o
OBS morre, o **JÁ VOLTO** segura o ar em vez de encerrar a transmissão. Se a banda aperta, o
bitrate cede em vez de derrubar.

*Prova:* um FFmpeg por destino · JÁ VOLTO · auto-bitrate · pausar/retomar por plataforma.

### 👥 Coluna 2 — A galera vira uma só

O chat, os alertas e a audiência das plataformas chegam numa tela. Você responde de um lugar e o
recado sai pra quem falou com você, onde ele estiver.

*Prova:* chat unificado com emote e moderação · alertas nativos + Streamlabs/StreamElements ·
audiência somada.

### 📋 Coluna 3 — No dia seguinte você sabe

O relatório cruza máquina, OBS, destino e público na mesma linha do tempo, e diz o minuto e a
causa. **É a coluna sem concorrente.**

*Prova:* janelas problemáticas com causa e recomendação · métricas por canal · seguidores ganhos ·
exportação em HTML/CSV/JSON.

> As três colunas não são um bundle: elas se alimentam. O relatório só existe porque as colunas 1 e
> 2 são nossas. Recortar qualquer uma destrói as outras.

---

## 7. O que a proposta cobra da pessoa (dito antes do download)

Uma proposta de valor que só lista ganhos é folheto. Estes são os custos reais:

| custo | tamanho | resposta honesta |
|---|---|---|
| **Upload multiplicado** | 3 plataformas a 6 Mbps = 18 Mbps saindo de casa | Estrutural. Dinheiro não resolve. O auto-bitrate ameniza. **Quem tem upload ruim deve usar nuvem** |
| **Só Windows** | exclui macOS e Linux | Por enquanto, não |
| **Instalador sem assinatura** | SmartScreen no primeiro contato | É o item que mais custa conversão hoje. Está no caminho |
| **Ponto único de falha** | se a Corneta cai, cai tudo junto | Verdade. Ferramentas separadas falham separadas |
| **É um app a mais** | contra um plugin que já mora no OBS | Só compensa se as três colunas importarem. Pra quem só quer o cano, o plugin resolve |

Dizer isso antes é a **coluna 4 não escrita**: é o que o `TOM-DE-VOZ.md` chama de assumir o limite
antes de a pessoa descobrir sozinha, e é o que faz o resto do documento ter crédito.

---

## 8. O que a gente decide NÃO fazer

Estratégia é o que se recusa.

1. **Não competir em alertas.** Streamlabs e StreamElements são mais fundos e são o padrão.
   **Integrar** — já integramos. Duplicar seria gastar meses pra empatar.
2. **Não competir em co-stream.** VDO.Ninja resolveu anos de casos de borda de WebRTC. A Mesa só
   existe pelo que eles não fazem: layout com slot fixo dentro do OBS.
3. **Nunca colocar relay de vídeo nosso no caminho.** Destruiria o custo marginal zero **e** o
   ponto de observação. É a linha que não se cruza.
4. **Não virar estúdio de navegador.** É outro produto, outro público.
5. **Não ligar tudo no lançamento.** Onze frentes num app grátis mantido por uma pessoa são onze
   filas de suporte. A Mesa já está atrás de flag; o resto deve seguir o mesmo critério.

---

## 9. Como isso vira dinheiro (sem trair a proposta)

O litmus da `MONETIZACAO.md` já está certo e este documento o confirma:

> **Precisa de um servidor nosso pra existir?** Não → grátis, pra sempre. Sim → pago, medido.

- **Grátis pra sempre:** as três colunas inteiras. Custam R$ 0 de infraestrutura.
- **Pago:** só o que exige banda ou compute nosso — TURN da Mesa, SFU, sinalização gerenciada.

A consequência estratégica: **o produto principal nunca entra em conflito com a receita.** Não
existe versão capada pra empurrar upgrade, porque não existe custo pra recuperar. Isso é o que
permite a honestidade do §7 — a gente não precisa esconder defeito pra vender.

---

## 10. Hierarquia de mensagem

O que cada nível tem que fazer. É o contrato que o [`SLOGAN.md`](./SLOGAN.md) tem que cumprir.

| nível | trabalho | onde |
|---|---|---|
| **1 · Promessa** | Em 2 segundos: você não fica sozinho na sua live | H1 do hero |
| **2 · Mecanismo** | Como isso é possível sem custar nada | subtítulo do hero |
| **3 · Colunas** | As três, na ordem do §6 | seções da LP |
| **4 · Prova** | Demonstração real na tela, não ilustração | painéis ao lado de cada seção |
| **5 · Limite** | O que ela não faz | FAQ e §7 |

**A regra que o H1 precisa obedecer:** ele é o nível 1. Se ele descrever o mecanismo (fan-out), ele
roubou o trabalho do nível 2 e deixou a promessa sem dono — que é exatamente o defeito do slogan
atual.

---

## 11. Posicionamento não é captura

O §6 e o §10 respondem *"por que escolher a Corneta depois que a pessoa chegou"*. Eles **não**
respondem *"como a pessoa chega"* — e confundir as duas coisas estraga as duas.

### A tensão, em uma frase

> **O que diferencia não tem busca. O que tem busca não diferencia.**

Ninguém digita "minha live não cai junto" — a pessoa não busca a solução de um problema que ela
não sabe que tem nome. Ela digita *"transmitir na twitch e no youtube ao mesmo tempo"*, que é
exatamente o **mecanismo commodity** que o §1 diz não ser a promessa.

Isso não é defeito do posicionamento. Busca é **captura** de demanda existente, não **criação**.
Não se ranqueia numa categoria que ainda não existe.

### A inversão que importa

O instinto diz que a coluna mais forte é a melhor pra tudo. É o contrário:

| coluna | força de **diferenciação** | força de **captura** |
|---|---|---|
| 1 · A live não cai junto | média — Aitum também reconecta | **alta** |
| 2 · A galera vira uma só | média — Restream Chat existe | **alta** |
| 3 · No dia seguinte você sabe | **máxima** — sem concorrente | **baixa** |

**A coluna 3 é a melhor pra convencer e a pior pra ser encontrada.** Ninguém procura um relatório
que não sabe que existe.

**E a coluna 1 é o oposto:** o *nome* dela não tem busca nenhuma, mas a **dor** dela é uma das mais
buscadas que o produto toca — "por que minha live trava", "obs travou no meio da live", "live caiu
sozinha". É busca de quem está com o problema na mão, que é a intenção mais alta que existe.

> Ou seja: a crítica de que "a live não cair junto" é fraca pra SEO está certa **sobre o rótulo** e
> invertida **sobre a coluna**. O rótulo é interno; a dor é o que se digita.

### Quem faz cada trabalho

| superfície | trabalho | organizada por |
|---|---|---|
| **Home / hero** | converter quem já chegou | diferenciação (§6) |
| **Páginas de conteúdo** | ser encontrada | demanda existente (termos) |
| **Repositório, agregadores, vídeo** | ser citada | consenso entre fontes |

A ponte entre elas é sempre a mesma: **captura no termo commodity, conversão no diferencial.** A
página `/guides/quality/why-stream-lags` do [`PLANO-SEO-AEO-GEO.md`](./PLANO-SEO-AEO-GEO.md) §P3 é
literalmente isso — entra pela dor buscada e sai na coluna 3, que é onde não temos concorrente.

### As duas regras que saem daqui

1. **SEO não escreve o H1.** Se o hero for otimizado pra "multistream grátis", ele passa a dizer o
   que todo concorrente diz e para de converter. O hero é nível 1 (§10).
2. **Posicionamento não escreve o título das páginas de conteúdo.** Uma página chamada "A live não
   cai junto" não é encontrada por ninguém. Lá o H1 é **a pergunta que a pessoa digitou**.

> **Ressalva de método:** este documento não tem número de volume de busca. As frases acima são as
> que a dor produz, não medição — antes de investir em qualquer página, confirmar em ferramenta de
> palavra-chave. O `PLANO-SEO-AEO-GEO.md` segue a mesma disciplina de não inventar número.

---

## 12. Riscos que mudam a premissa

| risco | o que faz | atenuação |
|---|---|---|
| Plataformas absorverem as features | Stream Health nativo, chat unificado nativo — cada um apaga uma linha nossa | A coluna 3 depende de ver a máquina; a plataforma não vê |
| **Kick corta 50%** do pagamento por hora simultânea | Pro parceiro Kick, multistream tem preço em dinheiro | Fora do nosso controle. Precisa estar no FAQ |
| Twitch exige paridade de qualidade | Limita o "Caprichado" na direção mais atraente | Já refletido nos modos |
| Um mantenedor só | Onze frentes, uma pessoa | Flags e escopo (§8.5) |
| Sem assinatura de código | SmartScreen barra a conversão na porta | É o item de maior retorno hoje |

---

## 13. Como saber se a proposta está certa

Sinais que confirmam, em ordem de força:

1. Alguém diz **"o relatório me mostrou uma coisa que eu não sabia"** — a coluna 3 pegou.
2. Alguém **volta pro relatório** dias depois da live sem ser lembrado.
3. O pedido de feature vem das colunas (mais métrica, mais exportação) e não do cano.
4. Alguém troca o mosaico (Aitum + Restream Chat) pela Corneta e diz por quê.

Sinais que **refutam**:

- As pessoas ligam a Corneta, usam o fan-out e nunca abrem Relatórios. Aí a promessa é outra e este
  documento está errado.
- O upload multiplicado derruba a maioria antes da segunda live. Aí o público é outro.
