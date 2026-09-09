# Telemetria da Corneta: consentimento de uso e balanceamento de falhas

> Dados de uso do aplicativo exigem ativação explícita; relatos de falhas ficam ativos
> quando não há escolha anterior. Este rascunho separa o consentimento para uso da avaliação
> de legítimo interesse para falhas; não comprova a adequação jurídica de nenhum tratamento.

- **Status:** ⚠️ Rascunho de engenharia · precisa de revisão jurídica antes do lançamento
- **Escopo:** nenhuma aprovação jurídica ou configuração externa é atestada aqui
- **Controlador:** ver `LEGAL_OPERATOR`/`LEGAL_CNPJ` em `web/lib/legal.ts`
- **Versão do aviso:** `TELEMETRY_NOTICE_VERSION` em `src/lib/telemetry-schema.ts`
- **Relacionado:** política de privacidade (`web/app/(legal)/[locale]/legal/_content/privacy.*.tsx`),
  `src/lib/telemetry-schema.ts`, `src-tauri/src/telemetry.rs`

> **Este arquivo não é parecer jurídico.** É a documentação técnica do raciocínio e das
> salvaguardas, escrita por quem implementou. A avaliação e a decisão do controlador devem
> passar por revisão jurídica apropriada antes de ativar coleta de produção.

---

## 0. Modelo de tratamento avaliado

| Finalidade desktop  | Sem escolha (`unset`) | Condição de envio                            | Base a revisar                               |
| ------------------- | --------------------- | -------------------------------------------- | -------------------------------------------- |
| Dados de uso        | Desativada            | Ativação explícita (`enabled`)               | Consentimento específico (art. 7º, I)        |
| Relatórios de falha | Ativa                 | Ausência de oposição (`disabled` interrompe) | Hipótese de legítimo interesse (art. 7º, IX) |

As escolhas explícitas anteriores, tanto `enabled` quanto `disabled`, permanecem válidas
para o código ao mudar a versão do aviso. O formato local não muda. Isso **não comprova** que
uma escolha antiga satisfaça os requisitos jurídicos de consentimento: sua informação, registro
e finalidade precisam ser avaliados pelo controlador. Fechar o aviso ou aceitar os termos não
ativa dados de uso. Ativar essa finalidade permite somente eventos futuros; não há envio
posterior de etapas ou eventos de uso ocorridos antes da adesão.

O [texto da LGPD](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm)
exige avaliar cada base no contexto do tratamento. Um interruptor opt-in não certifica
consentimento válido, assim como a possibilidade de oposição não certifica legítimo interesse.
A ANPD disponibiliza um [guia e modelo de teste de balanceamento](https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-lanca-guia-orientativo-sobre-legitimo-interesse)
para a segunda hipótese. Ambas as conclusões permanecem pendentes de revisão.

Este default por finalidade é do **desktop**. O site mantém seu controle único de opt-out e
respeita DNT/GPC, sem vincular navegação ao UUID do app. A API mantém suas falhas operacionais
e correlação conforme as finalidades ativas no desktop. Esses tratamentos também precisam de
avaliação própria; não herdam consentimento de uso do aplicativo.

---

## 1. Finalidades e bases separadas

| finalidade              | o que responde                                                           | por que é legítima                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| **Relatórios de falha** | em qual versão, tela e etapa a Corneta quebrou, e em quantas instalações | manter o produto funcionando é atividade-fim do controlador; uma falha não reportada derruba a live de quem paga o preço |
| **Dados de uso**        | quantas instalações concluem o onboarding, chegam ao ar, usam cada tela  | priorizar correção e simplificação onde a evidência aponta, em vez de onde o autor imagina                               |

A hipótese de legítimo interesse a avaliar para **relatórios de falha** é o enquadramento em
"apoio e promoção das atividades do controlador" (art. 10, I). Dados de uso dependem da
ativação específica, sem usar esse balanceamento como substituto de consentimento.
Conforme o catálogo técnico adotado, nenhuma
tem finalidade publicitária, de perfilamento comportamental, de enriquecimento de base, de venda ou
de compartilhamento com terceiro além do operador.

---

## 2. Necessidade (art. 10, §1) — o tratamento é o mínimo?

O que **sai** é uma lista fechada, verificável em `EVENT_KEYS`/`COMMON_KEYS`
(`src/lib/telemetry-schema.ts`) e no `match` exaustivo de `src-tauri/src/telemetry.rs`:

- versão do app, SHA do build, ambiente, idioma, família do SO
- tela/etapa, resultado em enum, código de erro do catálogo
- categorias do sistema (fabricante da GPU, tipo de encoder) — nunca o modelo exato
- UUID aleatório de instalação (CSPRNG, `Uuid::new_v4`), regenerável pela pessoa

O que **nunca** sai, e é barrado por allowlist e não por filtro de saída:

- chave de transmissão, token, chat, alerta, título, categoria, OCR
- imagem, áudio, vídeo, qualquer conteúdo da live
- caminho local, hostname, e-mail, IP como propriedade
- log cru, mensagem de exceção original ou stack não redigida

Salvaguardas técnicas relevantes para a necessidade:

- `disable_geoip(true)` — sem inferência de localização
- no cliente JavaScript, `person_profiles: "identified_only"` com bootstrap **não identificado** e sem chamadas de identificação
- no Rust, `final_before_send` fixa `$process_person_profile=false`, inclusive em exceções e quando o SDK recebe `true`
- `mask_all_text`, sem autocapture, sem session recording, sem heatmap, sem surveys
- `$device_id`/`$session_id` do SDK **não atravessam** a allowlist
- exceções passam por redator de mensagem e de stack antes de sair
- retenção inicial planejada de 90 dias no operador, cuja configuração precisa ser comprovada

Essas opções não solicitam a criação de perfis para novos identificadores. Não apagam perfis
anteriores: segundo a [documentação do PostHog](https://posthog.com/docs/data/anonymous-vs-identified-events),
um `distinct_id` já identificado continua associado ao perfil existente. O código preserva o
UUID de instalação; versões anteriores e dados já recebidos precisam ser avaliados pelo
operador antes de afirmar ausência de perfis no projeto. Isso não transforma o UUID em dado
anônimo nem substitui a revisão jurídica.

**Avaliação técnica preliminar:** versão, etapa e código ajudam a diagnosticar falhas. O
catálogo também inclui as categorias e identificadores acima; sua necessidade e retenção devem
ser justificadas por finalidade, sem presumir que tudo no catálogo seja indispensável.

---

## 3. Expectativa legítima do titular (art. 10, §1)

A favor:

- Relatórios técnicos podem ajudar a corrigir falhas, mas a expectativa do público quanto ao
  envio automático precisa ser avaliada, não presumida a partir de outros softwares.
- O aviso informa os defaults separados e mantém escolhas anteriores visíveis. Relatos de
  falha e um marcador mínimo de abertura podem sair antes da primeira escolha; uso não pode.
- O desligamento é um clique, na mesma tela, e vale imediatamente.
- O projeto é aberto: a afirmação é verificável, não é promessa.

Contra, e é preciso registrar:

- A Corneta se posiciona como **"roda no seu PC, não na nuvem de ninguém"**. Uma parcela do público
  chega justamente por isso, e para essa pessoa a expectativa de "nada sai daqui" é real.
- Não escolher não equivale a consentir. Mesmo para relatos de falha, ter um controle de
  oposição e um aviso não demonstra, por si só, uma expectativa legítima de envio automático.

**Mitigação adotada:** o aviso é neutro, não afirma estar enviando dados de uso e não confunde
fechamento com adesão. Uso começa desligado quando não há escolha anterior; falhas têm seu
próprio controle de oposição. O aviso atualizado não força novas escolhas nem reativa uma
finalidade desligada. Isso reduz riscos técnicos, mas não encerra a análise jurídica das
falhas automáticas ou das escolhas explícitas preservadas.

---

## 4. Balanceamento

| risco ao titular      | por que é baixo                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| reidentificação       | o UUID é um identificador pseudônimo, não anonimização; não deriva de hardware, hostname ou conta, mas permite correlacionar eventos |
| localização           | geoip desligado; IP não é gravado como propriedade                                                                                   |
| exposição de conteúdo | conteúdo da live nunca entra no evento, por allowlist                                                                                |
| perfil comportamental | o código não solicita criação de perfil nem cruza outras bases; perfis anteriormente associados ao UUID exigem revisão no operador   |
| decisão automatizada  | não existe (art. 20 não é acionado)                                                                                                  |

| direito do titular                     | como é exercido                                                                                                                                 |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| oposição (art. 18, §2)                 | interruptor por finalidade em Configurações, efeito imediato                                                                                    |
| revogação do consentimento de uso      | desligar dados de uso interrompe novos envios dessa finalidade, sem impedir o uso da Corneta                                                    |
| confirmação e acesso (art. 18, I e II) | UUID copiável na tela, canal na política                                                                                                        |
| eliminação (art. 18, IV)               | desativar ambas interrompe novos envios; copiar UUID antes de regenerar/reiniciar permite solicitar exclusão no operador pelo canal da política |
| informação (art. 9º)                   | aviso no primeiro uso + seção dedicada na política                                                                                              |

**Resultado: pendente.** Este documento descreve salvaguardas e riscos, não uma conclusão de
conformidade. A revisão deve avaliar **legítimo interesse para relatos de falha** e
**consentimento para dados de uso**, registrar as conclusões e examinar o tratamento de
escolhas anteriores. O opt-in não autoriza automaticamente coletar categorias desnecessárias.

---

## 5. Salvaguardas que o código garante (e os testes travam)

| garantia                                                 | onde                                                                                                          |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| escolhas explícitas atravessam troca de versão do aviso  | `src/lib/telemetry-schema.ts` e `src-tauri/src/telemetry.rs`; testes de preferências nos dois lados           |
| uso sem adesão não envia nem recupera eventos anteriores | gate de uso e captura em `src/lib/telemetry.ts`; gate correspondente em `src-tauri/src/telemetry.rs`          |
| arquivo de estado ilegível **não** religa quem desligou  | `TelemetryStatus::opposed()` e testes na mesma unidade                                                        |
| desligar fecha o portão antes de qualquer I/O            | `set_consent` fecha o gate e troca o epoch antes de persistir                                                 |
| instância antiga do SDK não revive após revogação        | `sdkEpoch` + `before_send` preso à identidade da instalação                                                   |
| propriedade fora do catálogo não sai                     | allowlist por evento + `match` exaustivo no Rust                                                              |
| evento nativo não solicita processamento de perfil       | `final_before_send` sobrescreve `$process_person_profile=false`; testes do envelope serializado e do SDK real |
| kill switch de release                                   | `TELEMETRY_DISABLED` / `VITE_TELEMETRY_DISABLED`, conferidos pelo gate de release                             |

---

## 6. Pendências antes de ativar coleta de produção

Publicar este rascunho junto do código é transparência, não aprovação do tratamento. Não
confundir abertura do repositório com autorização para coletar dados de usuários em produção.

- [ ] **Revisão jurídica** deste documento e da política, incluindo a base legal por finalidade
- [ ] Validar informação, manifestação e registro das escolhas de uso, incluindo escolhas
      `enabled` preservadas de avisos anteriores; a migração técnica não é uma aprovação
- [ ] Ligar **"Discard client IP data"** no projeto do PostHog: o app desliga o geoip, mas o IP
      ainda chega pela requisição; descartar na ingestão fecha a lacuna e reforça a §2
- [ ] Revisar se o contrato com o operador (PostHog) cobre o art. 39 e a transferência
      internacional (arts. 33 e ss.) — o processamento é fora do Brasil
- [ ] Comprovar retenção, exclusão por UUID e revisão de identificadores já associados a perfis
      no operador, usando dados sintéticos antes de declarar a configuração pronta
- [ ] Reavaliar este teste a cada finalidade nova. Não herdar o default de falhas nem escolhas
      existentes para outra finalidade sem migração, informação e avaliação específicas
