# Guardião de áudio — DMCA: música protegida ao vivo — sugestão de implementação

> O DMCA da Twitch virou **tempo real**: a detecção integra bases das gravadoras e roda **ao vivo**;
> poucos segundos de música protegida já **mutam uma janela de 6 min**, e **3 strikes = conta
> encerrada**. O mercado só vende *música segura* (DMCA-safe libraries) — **ninguém avisa ao vivo**
> que a faixa tocando AGORA é arriscada. Só a Corneta tem como: o áudio **passa por ela** (OBS →
> MediaMTX → FFmpeg por destino) **e** cada destino tem seu **próprio FFmpeg** → dá pra agir **por
> plataforma** (mutar só na Twitch, manter no YouTube). Esta é a **aposta ambiciosa** do guardião —
> e a gente vende como **rede de segurança** (pega muito, não tudo), **nunca como garantia**.

- **Status:** Sugestão de implementação · 2026-06-29
- **Relacionado:** [`../IDEIAS-v4.md`](../IDEIAS-v4.md) §0/§3/§8, [`./03-guardiao-audio-loudness-lufs.md`](./03-guardiao-audio-loudness-lufs.md), [`../FEATURE-ANTI-VAZAMENTO.md`](../FEATURE-ANTI-VAZAMENTO.md) (worker lateral / parse de stderr), [`../MONETIZACAO.md`](../MONETIZACAO.md)

---

## 0. Objetivo

Pegar **música protegida tocando ao vivo** antes que ela vire strike — e dar a saída certa **por
plataforma**:
- **Fingerprint do áudio** que está passando → casar contra uma base de risco.
- **Avisar antes do strike** ("essa faixa pode dar DMCA na Twitch") com `notify(app, …)`.
- **Mutar/abaixar só no destino arriscado** (ex.: Twitch) **mantendo no YouTube** — ou sugerir trocar
  por uma faixa segura.

Torna **automático** o *"áudio por plataforma DMCA-safe"* que o v1 só desenhou **manual**: agora o
sistema **detecta e age**. Default: **só avisar**; mutar é opt-in. **Rede de segurança, não garantia.**

---

## 1. Arquitetura

```
                       ┌─ fingerprint LOCAL (fpcalc / Chromaprint) ─┐
MediaMTX ──> captura ──┤                                            ├─> casa base de risco ─> risco?
 (áudio)   janela ~10s └─ fingerprint NUVEM opt-in (ACRCloud/AM) ───┘         │
                                                                              ├── não ─> segue a vida
                                                                              │
                                                                              └── sim ─> notify(app,…)
                                                                                          │
                                          (opt-in) muta SÓ no destino arriscado ──────────┘
                                          ffmpeg_args_for_encoder(Twitch) injeta -af volume=0
                                          → reinicia SÓ aquele encoder (a live não cai)
```

1. **Captura da janela.** Um worker lateral lê o áudio do MediaMTX e fatia em janelas curtas
   (ex.: 8–12s), no mesmo molde do pump em tempo real do
   [`guardian/pipeline.rs`](../../src-tauri/src/guardian/pipeline.rs) (que já abre FFmpeg via
   `std::process` e consome a saída continuamente). Leitura pura — **não** toca o sinal no ar.
2. **Fingerprint local primeiro.** Cada janela passa pelo `fpcalc` (Chromaprint/AcoustID) → gera a
   impressão acústica. Casa contra uma base de risco local (ver §2). Custo desprezível, **sem rede**.
3. **Nuvem opt-in (quando ligada).** Se o usuário ativar, a janela vai pra uma API comercial
   (ACRCloud / Audible Magic) que reconhece a gravação melhor. Token guardado no keychain via
   [`keys.rs`](../../src-tauri/src/keys.rs) (`set_key`/`get_key`) — **opt-in**, nunca no `config.json`.
4. **Risco?** Casou com algo "comercial conhecido" → dispara `notify(app, …)` (nativo, em
   [`commands.rs`](../../src-tauri/src/commands.rs)) + evento Tauri (`app.emit`) pro
   [`Toaster.tsx`](../../src/components/Toaster.tsx): *"faixa X pode dar DMCA na Twitch"*.
5. **Ação por plataforma (opt-in).** Como **cada destino tem seu próprio FFmpeg**,
   `engine::ffmpeg_args_for_encoder()` em [`engine.rs`](../../src-tauri/src/engine.rs) injeta
   `-af volume=0` (ou drop do `-map 1:a`) **só no encoder da Twitch** e a gente **reinicia só aquele
   encoder** — o YouTube continua com som e a live não cai.

> Detecção é **leitura** (não altera o ar). A **única** coisa que toca o sinal é o mute, e ele vive
> **dentro** do encoder do destino alvo — por isso dá pra mutar Twitch e manter YouTube.

---

## 2. Detalhes & decisões

- **O que "risco" significa (honestidade).** AcoustID/`fpcalc` identificam a **gravação**, não dizem
  "isso é DMCA-arriscado". Então "risco" = **heurística**: casou com uma faixa **comercial conhecida**
  (base de risco = catálogo de gravadoras / lista de hits) → risco. Música **própria**, *royalty-free*
  ou DMCA-safe → não casa → silêncio. A base local cobre o óbvio; a nuvem cobre muito mais.
- **Local vs nuvem.** Local (`fpcalc` + base embarcada/atualizável) = **grátis, offline, cobertura
  limitada**. Nuvem (ACRCloud/Audible Magic) = **identificação muito melhor, paga, opt-in** — mantém
  o espírito da casa: **sem login, sem servidor nosso** por padrão; a nuvem é escolha consciente do
  usuário (§8 do v4).
- **Mutar só na Twitch.** Twitch tem detecção ao vivo agressiva; YouTube/Kick costumam tratar áudio
  diferente. A ação é **por destino** no `Settings` ([`config.rs`](../../src-tauri/src/config.rs)):
  "ao detectar risco → avisar / mutar Twitch / abaixar / trocar faixa". Reaproveita o fato de o
  encoder já ser por-destino — nada de mexer na live inteira.
- **Reiniciar 1 encoder, não a live.** Aplicar o mute = re-montar os args daquele target e dar
  bounce **só nele** (o mesmo gesto que `start_engine` já faz por destino). Blip de poucos segundos
  só na Twitch; YouTube intacto.
- **Janela vs latência (o trade-off honesto).** Fingerprint precisa de alguns segundos de áudio pra
  casar; a janela de mute da Twitch também tem inércia. Janela **curta** = reage rápido, mas casa
  pior (menos áudio); janela **longa** = casa melhor, reage mais devagar. O default mira "rápido o
  bastante pra cortar antes da janela de 6 min fechar de vez", **assumindo** que alguns segundos já
  vão ao ar. Por isso: **rede de segurança, não garantia.**
- **Avisar antes de mutar.** Default = **só toast**. O streamer decide cortar — a gente não silencia
  a live dele sozinho sem ele pedir (mutar automático é opt-in explícito).

---

## 3. Casos de borda

- **Falso negativo** (não pegou). Música nova, remix, gravação obscura, base desatualizada → **não
  casa**. É o limite da rede de segurança: cobre muito, não tudo. Mensagem da UI deixa isso claro.
- **Falso positivo** (avisou à toa). Casou com algo que na verdade é seguro (licença própria,
  *royalty-free* que por acaso bate). Por isso o **default é avisar**, com botão "ignorar esta faixa"
  / whitelist — nunca mutar cego.
- **Música nova / pré-release.** Ainda não está nas bases → passa batido. Honestidade: não prometemos
  cobertura total; sugerimos faixa segura quando em dúvida.
- **Cover / versão ao vivo.** Fingerprint casa a **gravação**, não a composição — um cover pode não
  casar (risco autoral ainda existe, mas a detecção não vê). Limite explícito.
- **Latência da janela.** Os primeiros segundos da faixa **vão ao ar** antes do mute. Não tem como
  zerar ao vivo — é o trade-off de §2. Vender como "corta cedo", não "corta antes do primeiro
  compasso".
- **Jogo com trilha licenciada.** Trilha do próprio jogo pode casar e gerar aviso "DMCA na Twitch" —
  o que às vezes **é verdade** (jogos avisam pra mutar em VOD). Whitelist por jogo/faixa + o aviso
  como informação, não como pânico.
- **Stream de música proposital** (DJ set, react). Aí o risco é o **modelo de negócio** do streamer;
  o guardião deve poder ficar em "só avisar" ou desligado por perfil.

---

## 4. Grátis vs pago

- **Grátis (local):** captura da janela + `fpcalc`/Chromaprint + base de risco local + aviso
  (`notify`) + mute por-destino (`-af volume=0` no `ffmpeg_args_for_encoder`). Roda na máquina, nos
  FFmpeg que já abrimos. **Cobertura limitada** — assumida.
- **Pago (nuvem, opt-in):** reconhecimento via ACRCloud / Audible Magic → **identificação muito
  melhor** e base sempre atualizada. Token no [`keys.rs`](../../src-tauri/src/keys.rs). Encaixa em
  [`MONETIZACAO.md`](../MONETIZACAO.md) como recurso premium "rede de segurança turbinada" — sem
  servidor nosso, é o usuário falando direto com a API dele.

---

## 5. Próximo passo

MVP = **avisar primeiro, mutar depois**. Subir o worker lateral que fatia o áudio do MediaMTX em
janelas, roda `fpcalc` local contra uma base de risco, e quando casa dispara `notify(app, …)` +
toast ("pode dar DMCA na Twitch"). **Sem** mutar nada ainda — só a rede de aviso. A ação por
plataforma (mute só-na-Twitch reiniciando 1 encoder) e a nuvem opt-in vêm na Fase 2.

---

## 6. TODO (implementação)

**MVP**
- [ ] Worker lateral lendo áudio do MediaMTX em janelas (8–12s), molde do `guardian/pipeline.rs`
- [ ] Integrar `fpcalc` (Chromaprint) como sidecar → gerar fingerprint por janela
- [ ] Base de risco **local** (catálogo/lista de faixas comerciais) + casamento por fingerprint
- [ ] Aviso: `notify(app, …)` + evento Tauri (`app.emit`) → `Toaster.tsx` ("faixa X pode dar DMCA na Twitch")
- [ ] `Settings` (`config.rs`): on/off do guardião DMCA, modo (só avisar / sugerir mute), whitelist de faixas
- [ ] UI deixa **explícito**: rede de segurança, não garantia (cobertura limitada, latência)

**Fase 2**
- [ ] Ação **por destino:** injetar `-af volume=0` (ou drop de áudio) **só** no `ffmpeg_args_for_encoder` do destino alvo
- [ ] Reiniciar **só aquele encoder** (bounce por-destino, igual `start_engine` faz) — sem derrubar a live
- [ ] Modo "mutar só na Twitch / manter no YouTube" + sugestão "trocar por faixa segura"
- [ ] Nuvem **opt-in** (ACRCloud / Audible Magic): token no `keys.rs`, identificação melhor — premium em `MONETIZACAO.md`
- [ ] Ajuste fino de janela vs latência (perfis: "rápido" vs "casa melhor") por plataforma
- [ ] Whitelist por jogo/faixa e perfil "stream de música" (desliga o aviso agressivo)
