# Manutenção editorial da Corneta

Este runbook mantém a Ajuda e os Guias confiáveis depois da publicação. O
objetivo não é trocar datas: é confirmar que instruções, regras, imagens e
links ainda ajudam alguém a resolver a tarefa descrita.

## Relógios usados

- `reviewedAt`: última revisão factual ou técnica, mesmo quando o texto não
  precisou mudar.
- `updatedAt`: última mudança substancial percebida pelo leitor.
- `sources[].reviewedAt`: última vez em que aquela fonte específica foi
  conferida.
- `reviewIntervalDays`: prazo máximo entre revisões. Comparativos usam de 60 a
  90 dias; conteúdo volátil usa no máximo 90; conceitos estáveis podem usar 180.

Alterar uma instrução, conclusão, recomendação, screenshot ou dado relevante
exige avanço de `updatedAt`. Conferir tudo e concluir que continua correto
avança apenas `reviewedAt` e as datas das fontes realmente verificadas. Nunca
se muda `updatedAt` só para aparentar frescor.

## Fila automática

Na raiz de `web`, rode:

```powershell
pnpm content:maintenance
pnpm content:maintenance --as-of 2026-08-02 --warning-days 28
pnpm content:maintenance:check
```

O último comando falha quando existe artigo vencido. O workflow
`Editorial maintenance` está agendado para segunda-feira, publica o resumo na execução e
mantém uma issue com a label `editorial-maintenance`. Um novo ciclo só começa
28 dias depois do encerramento do anterior. Em forks, essa automação externa fica
desligada até configurar `ENABLE_EDITORIAL_AUTOMATION=true`; os checks locais continuam disponíveis.

## Como revisar um artigo

1. Abra o produto e refaça o fluxo com as versões declaradas em `testedWith`.
2. Confira cada fonte oficial, limite, regra e integração. Atualize
   `sources[].reviewedAt` somente para fontes realmente abertas e lidas.
3. Compare screenshots com a interface atual. Substitua a imagem se a diferença
   puder confundir o leitor; preserve os metadados no manifesto de assets.
4. Teste links internos, CTA contextual, artigos relacionados e a busca usada
   como `primaryQuery`.
5. Corrija o conteúdo e avance `updatedAt` se algo mudou. Se nada mudou, avance
   apenas `reviewedAt`.
6. Rode `pnpm content:check` e os testes do site antes de enviar.

Se a revisão se limitar a uma fonte interna alterada, confira suas alegações dependentes e
descreva esse escopo no PR. Avance somente as datas realmente justificadas; não atualize
`testedWith`, fontes externas ou capturas que não foram revalidados. A distinção entre
revisão documental e teste do produto está no [contrato editorial](../web/content/README.md).

## Mudanças de produto e releases

Artigos podem declarar arquivos internos em `sources[].repoPath`. Em pull
requests, o CI cruza esses caminhos com o diff e exige nova revisão do artigo e
da fonte afetada. Na release, o mesmo gate compara a tag atual com a tag
anterior e também exige que `productVersion` corresponda à versão publicada.

Para reproduzir, execute da raiz do repositório. Substitua `BASE_REF` pela tag ou pelo
commit de referência disponível localmente; use a versão do produto que está revisando:

```powershell
pnpm --dir web content:revision:check --base origin/main --head HEAD
pnpm --dir web content:revision:check --base BASE_REF --head HEAD --product-version 0.7.0
```

O diff de fontes usado pelo comando compara as referências Git, não alterações ainda sem
commit. A comparação de conteúdo normaliza formatação nos dois corpos com o Prettier
fixado no lockfile; apenas alinhar tabelas ou quebrar linhas não exige `updatedAt` novo.

Se uma mudança relevante não acionar o gate, adicione ao artigo o `repoPath`
mais próximo do comportamento documentado. Não use um diretório amplo como
atalho: a fonte deve permitir localizar a regra ou tela concreta.

## Ciclo de Search Console e Bing

A issue recorrente é o registro do ciclo. Use sempre os 28 dias completos mais
recentes e, quando houver volume, compare com os 28 dias anteriores.

1. No Google Search Console, registre cliques, impressões, CTR e posição por
   consulta e página.
2. Separe consultas com a marca Corneta das consultas sem marca.
3. Procure páginas perdendo cliques, CTR baixo com boa posição, consultas entre
   as posições 5 e 20 e duas páginas disputando a mesma intenção.
4. No Bing Webmaster Tools, confira sitemap, cobertura e alertas de rastreamento.
5. Escolha pelo menos duas publicações ou revisões substanciais para o ciclo e
   registre a justificativa na issue.
6. Depois das mudanças, anote o que foi publicado e feche a issue. O workflow
   abrirá o próximo ciclo após 28 dias.

Não use uma variação pequena sem demanda como motivo para criar uma página.
Prefira melhorar o artigo que já resolve aquela intenção e manter uma resposta
mais completa.

## Preparação externa

Depois do deploy, ainda é necessário validar a propriedade de
`https://www.corneta.live` no Google Search Console e no Bing Webmaster Tools,
enviar `/sitemap.xml` e confirmar que `/robots.txt` aponta para o sitemap. Essa
etapa depende das contas e do DNS de produção e não é executada pelo CI.
