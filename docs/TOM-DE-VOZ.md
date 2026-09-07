# Tom de voz da Corneta

Guia de contribuição para os textos do app, site, Ajuda e Guias. A linguagem
deve ajudar o streamer a entender o estado atual e a próxima ação. Para limites
do produto, consulte [a referência pública](../web/PRODUCT.md); para tokens e
componentes, consulte [o design do app](../DESIGN.md) e [do site](../web/DESIGN.md).

## 1. Para quem escrevemos

Fale com quem prepara cenas no OBS, mas não precisa conhecer Docker, FFmpeg ou
a arquitetura da Corneta para fazer uma live. Use “você” na interface e explique
o resultado antes da tecnologia. Textos técnicos para contribuidores podem usar
os nomes de módulos e protocolos necessários ao assunto.

## 2. Diga a coisa específica

Prefira uma ação, um estado ou uma coisa que aparece na tela a expressões como
“otimizar sua experiência”. Use os nomes reais dos controles e das plataformas.

Um número só entra se puder ser conferido no código, na API, na tela ou em uma
fonte adequada. Não invente tempo de espera, benchmark, estatística de uso ou
garantia para tornar a frase mais convincente. Quando a causa for incerta,
apresente-a como hipótese e explique como conferir.

## 3. Características da voz

- O app fala em primeira pessoa sobre ações que concluiu: “Atualizei a grade no
  OBS”. Não anuncie sucesso antes de a operação terminar.
- Uma falha diz o que não foi possível e o que a pessoa pode fazer:
  “Não consegui atualizar a grade no OBS — vê se ele tá aberto”.
- Em português de interface, contrações como “tá”, “pra” e “vê se” são naturais.
  Textos legais e descrições de permissões usam a precisão exigida pelo assunto.
- Declare limites e custos antes da decisão: upload, carga, atraso, recurso
  experimental ou plataforma não suportada. Uma proteção não é garantia.
- O inglês mantém o mesmo fato e o mesmo registro, sem traduzir expressões
  brasileiras literalmente. Preserve nomes localizados dos controles.

## 4. O que evitar

### 4.1 Antítese sem informação

Frases com duas metades espelhadas não substituem uma explicação. Diga a causa
ou o efeito concreto: “O vídeo sai do seu PC direto para cada plataforma”.

### 4.2 Listas de sinônimos

Cada item precisa acrescentar um fato. Três formas de dizer “mais controle”
continuam sendo uma afirmação vaga.

### 4.3 Abstrações no lugar da ação

“Experiência”, “jornada”, “solução” e “cuidado” não explicam o que um botão faz
nem o que aconteceu com a transmissão.

### 4.4 Gíria sem conteúdo

Informalidade não exige bordão. Se a tradução muda a metáfora e perde o fato,
reescreva a frase. Leia também as seções vizinhas para evitar repetir a mesma
piada ou ressalva.

### 4.5 Nomes internos na cara do streamer

Nomes de cor, arquivo ou módulo não são vocabulário de interface. Escreva “a tela
JÁ VOLTO”, não “o slate”; “a live continua no ar”, não “o compositor segue
publicando”. Termos como latão, tomate, splicer, NDJSON e schemaVersion
pertencem ao código e à documentação técnica, não à explicação para o streamer.

## 5. Texto junto de imagens e dados

Explique o que o visual significa, não sua aparência: “A Twitch ficou 8s fora”
faz sentido se esse dado existe; “a barra amarela sumiu” depende da decoração.
A informação importante também precisa estar disponível em texto.

Uma prévia ilustrativa não prova uma live real. Identifique exemplos e não
apresente métricas sintéticas, screenshots antigos ou recursos experimentais
como resultados atuais. O [protocolo editorial](../web/content/README.md)
define evidências, datas, autoria e cuidados com capturas.

## 6. Mecânica

| Item                   | Regra                                                                             |
| ---------------------- | --------------------------------------------------------------------------------- |
| Pessoa                 | “você” na interface; linguagem técnica ou jurídica quando necessária ao contexto. |
| Plataforma             | Use “plataforma”, e não um nome genérico que esconda qual destino está em causa.  |
| Gênero                 | a Twitch, a Kick, o YouTube.                                                      |
| Contração              | “pra” na interface em português; “para” quando o registro formal for necessário.  |
| Botão                  | Verbo que diga a ação: “Atualizar agora”, “Copiar imagem”, “Abrir pasta”.         |
| Erro                   | O que não foi possível, hipótese quando houver e próximo passo seguro.            |
| `aria-label` e `title` | Funcionais, sem piada: “Fechar o aviso da atualização”.                           |
| Número                 | Valor verificável, com unidade; não inventar precisão.                            |
| Reticência             | Estado de espera, como “Baixando…”.                                               |
| CAPS                   | Nomes de controles/estados como BORA AO VIVO e JÁ VOLTO, não ênfase genérica.     |
| Emoji                  | Raro e funcional; não carrega sozinho uma informação.                             |
| Pontuação              | Frases de apoio levam ponto; títulos curtos podem dispensá-lo.                    |

## 7. Antes de enviar a mudança

- Confira se os nomes coincidem com a versão da interface descrita.
- Confirme fatos e números; se não souber a causa, não afirme um diagnóstico.
- Preserve o sentido e as ressalvas nos dois idiomas.
- Confira estados de espera, falha, ausência de dados e conclusão separadamente.
- Não exponha chaves, caminhos pessoais, conteúdo de chat ou termos internos.
- Leia o texto em voz alta e releia as seções vizinhas.
- Execute os testes de i18n e, para artigos, os checks editoriais pertinentes.
