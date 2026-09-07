# Teste de balanceamento — telemetria da Corneta (LGPD art. 7º, IX)

> Legitimate Interest Assessment (LIA) das duas finalidades de telemetria do aplicativo,
> **ligadas por padrão**. Este rascunho reúne evidências técnicas para
> avaliar a hipótese de legítimo interesse; não comprova a adequação jurídica do tratamento.

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

As duas finalidades vêm ligadas por padrão, com aviso no primeiro uso e controles independentes
para desligá-las. Esse é o comportamento técnico avaliado neste documento.

A intenção registrada é usar **legítimo interesse** (art. 7º, IX), não apresentar o padrão
ativo como consentimento. Mudar um default no software não valida automaticamente uma base
legal: é necessário avaliar finalidade, necessidade, direitos, expectativas e salvaguardas no
contexto real. A ANPD disponibiliza um [guia e modelo de teste de balanceamento](https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-lanca-guia-orientativo-sobre-legitimo-interesse)
para essa avaliação. A conclusão abaixo permanece pendente de revisão.

---

## 1. Finalidade legítima (art. 10, I)

| finalidade              | o que responde                                                           | por que é legítima                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| **Relatórios de falha** | em qual versão, tela e etapa a Corneta quebrou, e em quantas instalações | manter o produto funcionando é atividade-fim do controlador; uma falha não reportada derruba a live de quem paga o preço |
| **Dados de uso**        | quantas instalações concluem o onboarding, chegam ao ar, usam cada tela  | priorizar correção e simplificação onde a evidência aponta, em vez de onde o autor imagina                               |

A hipótese a avaliar é o enquadramento em "apoio e promoção das atividades do controlador"
(art. 10, I). Conforme o catálogo técnico adotado, nenhuma
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
- O aviso aparece **no primeiro uso**, antes de qualquer uso real, e diz que está ligado.
- O desligamento é um clique, na mesma tela, e vale imediatamente.
- O projeto é aberto: a afirmação é verificável, não é promessa.

Contra, e é preciso registrar:

- A Corneta se posiciona como **"roda no seu PC, não na nuvem de ninguém"**. Uma parcela do público
  chega justamente por isso, e para essa pessoa a expectativa de "nada sai daqui" é real.
- Dados de uso têm expectativa mais frágil que relatório de falha. A ANPD, no Guia Orientativo
  sobre Cookies (2022), trata analytics como não essencial e puxa para o consentimento. O guia é
  sobre cookies e não se aplica diretamente a aplicativo de desktop, mas indica a **postura** da
  autoridade sobre a finalidade.

**Mitigação adotada:** o aviso não pede permissão nem esconde o padrão — a primeira frase da tela é
"Já estou mandando dados técnicos", e o botão de fechar diz "Fechar (segue enviando)". A
transparência compensa parte da fragilidade da expectativa, mas **não a elimina** no caso de dados
de uso. Este é o ponto mais atacável do teste, e está aqui explicitamente.

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
| confirmação e acesso (art. 18, I e II) | UUID copiável na tela, canal na política                                                                                                        |
| eliminação (art. 18, IV)               | desativar ambas interrompe novos envios; copiar UUID antes de regenerar/reiniciar permite solicitar exclusão no operador pelo canal da política |
| informação (art. 9º)                   | aviso no primeiro uso + seção dedicada na política                                                                                              |

**Resultado: pendente.** Este documento descreve salvaguardas e riscos, não uma conclusão de
conformidade. A revisão deve avaliar separadamente **relatórios de falha** e **dados de uso**,
registrar sua conclusão e decidir se o padrão ativo é adequado para cada finalidade.

---

## 5. Salvaguardas que o código garante (e os testes travam)

| garantia                                                | onde                                                                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| oposição atravessa troca de versão do aviso             | `Consent::active` (Rust) e `telemetryPurposeActive` (TS); testes nos dois lados                               |
| arquivo de estado ilegível **não** religa quem desligou | `TelemetryStatus::opposed()`; teste `instalacao_nova_liga_e_arquivo_ilegivel_nao`                             |
| desligar fecha o portão antes de qualquer I/O           | `set_consent` fecha o gate e troca o epoch antes de persistir                                                 |
| instância antiga do SDK não revive após revogação       | `sdkEpoch` + `before_send` preso à identidade da instalação                                                   |
| propriedade fora do catálogo não sai                    | allowlist por evento + `match` exaustivo no Rust                                                              |
| evento nativo não solicita processamento de perfil      | `final_before_send` sobrescreve `$process_person_profile=false`; testes do envelope serializado e do SDK real |
| kill switch de release                                  | `TELEMETRY_DISABLED` / `VITE_TELEMETRY_DISABLED`, conferidos pelo gate de release                             |

---

## 6. Pendências antes de ativar coleta de produção

Publicar este rascunho junto do código é transparência, não aprovação do tratamento. Não
confundir abertura do repositório com autorização para coletar dados de usuários em produção.

- [ ] **Revisão jurídica** deste documento e da política, incluindo a base legal por finalidade
- [ ] Ligar **"Discard client IP data"** no projeto do PostHog: o app desliga o geoip, mas o IP
      ainda chega pela requisição; descartar na ingestão fecha a lacuna e reforça a §2
- [ ] Revisar se o contrato com o operador (PostHog) cobre o art. 39 e a transferência
      internacional (arts. 33 e ss.) — o processamento é fora do Brasil
- [ ] Decidir se **dados de uso** continuam ligados por padrão ou voltam a opt-in. A §3 registra
      por que este é o item frágil; a escolha é de negócio, mas tem que ser consciente
- [ ] Reavaliar este teste a cada finalidade nova. Finalidade nova **não pode** entrar como
      `Unset`, senão nasce ligada sem ninguém ter sido informado dela
