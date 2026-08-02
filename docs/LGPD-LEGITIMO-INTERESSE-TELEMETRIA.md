# Teste de balanceamento — telemetria da Corneta (LGPD art. 7º, IX)

> Legitimate Interest Assessment (LIA) das duas finalidades de telemetria do aplicativo,
> que passaram a rodar **ligadas por padrão**. Este é o documento que a ANPD pede ver quando
> alguém invoca legítimo interesse (art. 10 c/c art. 38).

- **Status:** ⚠️ Rascunho de engenharia · precisa de revisão jurídica antes do lançamento
- **Controlador:** ver `LEGAL_OPERATOR`/`LEGAL_CNPJ` em `web/lib/legal.ts`
- **Versão do aviso:** `TELEMETRY_NOTICE_VERSION` em `src/lib/telemetry-schema.ts`
- **Relacionado:** política de privacidade (`web/app/(legal)/[locale]/legal/_content/privacy.*.tsx`),
  `src/lib/telemetry-schema.ts`, `src-tauri/src/telemetry.rs`

> **Este arquivo não é parecer jurídico.** É a documentação técnica do raciocínio e das
> salvaguardas, escrita por quem implementou. Quem assina a base legal é advogado.

---

## 0. O que mudou, e por quê isto existe

Até a versão anterior do aviso, as duas finalidades rodavam por **consentimento** (art. 7º, I) e
vinham desligadas. A decisão de produto passou a ser: **vir ligadas**, com aviso no primeiro uso e
desligamento em um clique.

Consentimento não comporta "ligado por padrão" — o art. 5º, XII exige manifestação **livre e
inequívoca**, e caixa pré-marcada não é manifestação. Logo, a base legal muda junto: passa a ser
**legítimo interesse** (art. 7º, IX). Não é um contorno; é a base correta para a finalidade, desde
que o teste abaixo se sustente.

---

## 1. Finalidade legítima (art. 10, I)

| finalidade | o que responde | por que é legítima |
|---|---|---|
| **Relatórios de falha** | em qual versão, tela e etapa a Corneta quebrou, e em quantas instalações | manter o produto funcionando é atividade-fim do controlador; uma falha não reportada derruba a live de quem paga o preço |
| **Dados de uso** | quantas instalações concluem o onboarding, chegam ao ar, usam cada tela | priorizar correção e simplificação onde a evidência aponta, em vez de onde o autor imagina |

As duas se enquadram em "apoio e promoção das atividades do controlador" (art. 10, I). Nenhuma
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
- `person_profiles: "identified_only"` com bootstrap **não identificado** — o perfil nunca é criado
- `mask_all_text`, sem autocapture, sem session recording, sem heatmap, sem surveys
- `$device_id`/`$session_id` do SDK **não atravessam** a allowlist
- exceções passam por redator de mensagem e de stack antes de sair
- retenção inicial de 90 dias no operador

**Conclusão:** o conjunto é o menor que ainda responde às duas perguntas da §1. Não há como
diagnosticar uma falha sem saber a versão, a etapa e o código — e nada além disso é coletado.

---

## 3. Expectativa legítima do titular (art. 10, §1)

A favor:

- Quem instala um aplicativo de desktop espera que o autor saiba quando ele quebra. Relatório de
  falha é comportamento padrão e amplamente compreendido em software.
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

| risco ao titular | por que é baixo |
|---|---|
| reidentificação | nenhum identificador direto ou indireto sai; o UUID não deriva de hardware, hostname ou conta |
| localização | geoip desligado; IP não é gravado como propriedade |
| exposição de conteúdo | conteúdo da live nunca entra no evento, por allowlist |
| perfil comportamental | não há perfil identificado nem cruzamento com outra base |
| decisão automatizada | não existe (art. 20 não é acionado) |

| direito do titular | como é exercido |
|---|---|
| oposição (art. 18, §2) | interruptor por finalidade em Configurações, efeito imediato |
| confirmação e acesso (art. 18, I e II) | UUID copiável na tela, canal na política |
| eliminação (art. 18, IV) | UUID apagado localmente ao desligar as duas; exclusão no operador pelo canal da política |
| informação (art. 9º) | aviso no primeiro uso + seção dedicada na política |

**Resultado:** o balanceamento se sustenta para **relatórios de falha** com folga. Para **dados de
uso** ele se sustenta apoiado nas salvaguardas da §2 — mas é o item que cairia primeiro num
questionamento, e a decisão de mantê-lo ligado é de negócio, tomada com esse risco à vista.

---

## 5. Salvaguardas que o código garante (e os testes travam)

| garantia | onde |
|---|---|
| oposição atravessa troca de versão do aviso | `Consent::active` (Rust) e `telemetryPurposeActive` (TS); testes nos dois lados |
| arquivo de estado ilegível **não** religa quem desligou | `TelemetryStatus::opposed()`; teste `instalacao_nova_liga_e_arquivo_ilegivel_nao` |
| desligar fecha o portão antes de qualquer I/O | `set_consent` fecha o gate e troca o epoch antes de persistir |
| instância antiga do SDK não revive após revogação | `sdkEpoch` + `before_send` preso à identidade da instalação |
| propriedade fora do catálogo não sai | allowlist por evento + `match` exaustivo no Rust |
| kill switch de release | `TELEMETRY_DISABLED` / `VITE_TELEMETRY_DISABLED`, conferidos pelo gate de release |

---

## 6. Pendências antes de publicar

- [ ] **Revisão jurídica** deste documento e do texto novo da política — a base legal mudou
- [ ] Ligar **"Discard client IP data"** no projeto do PostHog: o app desliga o geoip, mas o IP
      ainda chega pela requisição; descartar na ingestão fecha a lacuna e reforça a §2
- [ ] Revisar se o contrato com o operador (PostHog) cobre o art. 39 e a transferência
      internacional (arts. 33 e ss.) — o processamento é fora do Brasil
- [ ] Decidir se **dados de uso** continuam ligados por padrão ou voltam a opt-in. A §3 registra
      por que este é o item frágil; a escolha é de negócio, mas tem que ser consciente
- [ ] Reavaliar este teste a cada finalidade nova. Finalidade nova **não pode** entrar como
      `Unset`, senão nasce ligada sem ninguém ter sido informado dela
