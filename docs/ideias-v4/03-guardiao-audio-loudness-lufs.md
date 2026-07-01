# Guardião de áudio — Loudness / normalização (LUFS) — sugestão de implementação

> O áudio é o problema técnico **mais reportado** em live: "tá baixo demais", "explode quando
> troca de cena", "no celular nem dá pra ouvir". Quem assiste perdoa vídeo feio, mas fecha a aba
> quando o som varia. E quase **só a Corneta** pode resolver: o áudio **passa por ela** (OBS →
> MediaMTX → FFmpeg por destino). O v3 fez o guardião **visual** ("já volto" preventivo); este é o
> guardião **auditivo** — mede o loudness, avisa quando foge do alvo e, no máximo, normaliza. Sem o
> streamer precisar entender de compressor.

- **Status:** Sugestão de implementação · 2026-06-29
- **Relacionado:** [`../IDEIAS-v4.md`](../IDEIAS-v4.md) §3, [`./04-guardiao-audio-balance-mic-game.md`](./04-guardiao-audio-balance-mic-game.md), [`./05-guardiao-audio-dmca-musica.md`](./05-guardiao-audio-dmca-musica.md), [`../FEATURE-ANTI-VAZAMENTO.md`](../FEATURE-ANTI-VAZAMENTO.md) (amostrador / parse de stderr)

---

## 0. Objetivo

Garantir que o som **chega no nível certo** em cada plataforma, sem virar mesa de som:
- **Medir** o loudness integrado (LUFS) do output com FFmpeg `ebur128` e mostrar um **medidor ao
  vivo** na UI.
- **Avisar** quando ficar muito longe do alvo (~-14 LUFS integrado) por **tempo prolongado**.
- **Normalizar (opt-in)** pro alvo da plataforma com `loudnorm` no caminho do encoder.

Tudo **local** (filtros de FFmpeg) → **grátis**. Default: **só medir + avisar** (normalizar é opt-in).

---

## 1. Arquitetura

```
                          ┌─ parse stderr (I / M / S / LRA / TPK) ─┐
MediaMTX ──> FFmpeg [-af ebur128] ──────────────────────────────────┤
  (áudio)    (leitura, não toca o sinal)                            ├─> medidor UI (app.emit)
                                                                    └─> lógica (alvo + janela) ─> notify()

  ── e o ramo OPCIONAL de normalização, dentro do encoder de saída ──
config (por destino) ──> ffmpeg_args_for_encoder() injeta  -af loudnorm=I=-14:TP=-1.5:LRA=11
```

1. **Medir (sempre, leve).** Um FFmpeg de leitura roda `-af ebur128` (ou `ebur128=peak=true`) no
   áudio do MediaMTX, igual ao dead-air faz com `silencedetect`. O stderr emite linhas com
   `I:` (integrated), `M:`/`S:` (momentary/short-term), `LRA` (loudness range) e `TPK` (true peak).
   Parse contínuo no mesmo molde do pump em tempo real do [`guardian/pipeline.rs`](../../src-tauri/src/guardian/pipeline.rs).
2. **Medidor + aviso.** Os valores viram evento Tauri (`app.emit`) → medidor ao vivo (igual ao
   [`Toaster.tsx`](../../src/components/Toaster.tsx) consome eventos). A lógica compara o `I:` com o
   alvo e, se passar de uma **janela de tempo**, dispara `notify(app, …)` (nativo, em
   [`commands.rs`](../../src-tauri/src/commands.rs)).
3. **Normalizar (opcional).** Quando ligado por destino, `engine::ffmpeg_args_for_encoder()` em
   [`engine.rs`](../../src-tauri/src/engine.rs) injeta `loudnorm=I=-14:TP=-1.5:LRA=11` no áudio
   **daquele** encoder de saída. Aí o sinal sai já corrigido pra plataforma.

> O ramo de medição é **leitura pura** (não altera o que vai pro ar); o ramo de normalização é o
> único que toca o sinal, e fica **dentro** do encoder, por-destino.

---

## 2. Detalhes & decisões

- **Medir sempre, normalizar opt-in.** Medir é barato e nunca estraga o som → liga por padrão.
  Normalizar ao vivo pode bombear/respirar → **default DESLIGADA**, opt-in e **por destino**.
- **Alvo por plataforma.** Twitch/YouTube ~-14 LUFS integrado, TP -1.5 dBTP. Como o alvo varia, ele
  mora no `Settings` ([`config.rs`](../../src-tauri/src/config.rs)) **por destino** — junto do delay
  e do codec de cada encoder.
- **Janela de tempo (anti-alarme-à-toa).** O `I:` integrado já é estável, mas o aviso só dispara se
  o som ficar fora da faixa (ex.: alvo ±3 LU) por **N segundos** (ex.: 20–30s). Picos curtos de uma
  risada ou um susto **não** geram toast.
- **Reuso do parser.** O parser de stderr do dead-air já lê eventos linha-a-linha do FFmpeg; o
  `ebur128` é o mesmo padrão (regex em `I:`, `LRA:`, `TPK:`). Não inventa pipeline novo — reaproveita
  o pump.
- **`loudnorm` de uma passada.** Ao vivo não dá pra fazer as duas passadas (a 2ª precisaria do áudio
  inteiro), então é o modo **dinâmico** de passada única. Bom o bastante pra "puxar pro alvo", não é
  masterização de estúdio.

---

## 3. Casos de borda

- **Stream de música quer alvo diferente.** Música respira mais (LRA alto) e às vezes mira mais alto
  que -14. O alvo é por destino/perfil → um preset "música" desliga o aviso agressivo ou afrouxa a
  faixa.
- **Silêncio proposital.** Pausa, "já volto", momento sem fala → o `I:` despenca, mas isso **não** é
  "baixo demais". O guardião de loudness deve **respeitar o estado de dead-air / mute** e não avisar
  durante silêncio intencional (cruza com o [`04`](./04-guardiao-audio-balance-mic-game.md) e o dead-air).
- **`loudnorm` dinâmico com pouco áudio.** Em trechos muito quietos, o modo de passada única pode
  "puxar" ruído de fundo pra cima (chiado audível). Por isso: normalizar é opt-in, com TP travado em
  -1.5, e o aviso "tá baixo" continua sendo o caminho **default** (deixa o humano decidir).
- **Dobrar correção.** Se o streamer já normaliza no OBS/VoiceMeeter, ligar `loudnorm` por cima pode
  brigar. A medição mostra isso (I já no alvo) → recomende **só medir**.

---

## 4. Grátis vs pago

- **Grátis (local):** medição (`ebur128`), medidor ao vivo, aviso (`notify`) e normalização
  (`loudnorm`). Tudo roda na máquina, nos FFmpeg que já abrimos — custo desprezível.
- **Pago (nuvem):** nada específico aqui — loudness é 100% local por natureza. (Eventual histórico/
  relatório de loudness na nuvem seria um extra, não o núcleo.)

---

## 5. Próximo passo

MVP: subir um FFmpeg `-af ebur128` no áudio do MediaMTX → parse de `I:`/`LRA:`/`TPK:` no mesmo molde
do dead-air → **medidor ao vivo** (evento Tauri) + **aviso** quando o `I:` ficar fora da faixa por
N segundos. `Settings` com alvo por destino e on/off do aviso. Normalização fica pra Fase 2.

---

## 6. TODO (implementação)

**MVP**
- [ ] FFmpeg de leitura com `-af ebur128` (ou `ebur128=peak=true`) no áudio do MediaMTX
- [ ] Parser de stderr (`I:`, `M:`/`S:`, `LRA:`, `TPK:`) reusando o pump do dead-air / `guardian/pipeline.rs`
- [ ] Evento Tauri (`app.emit`) com os valores → medidor ao vivo na UI (molde do `Toaster.tsx`)
- [ ] Lógica de alvo + janela de tempo (ex.: alvo ±3 LU por 20–30s) → `notify(app, …)`
- [ ] `Settings` (`config.rs`): alvo LUFS **por destino**, faixa de tolerância, on/off do aviso
- [ ] Respeitar dead-air / mute (não avisar em silêncio proposital)

**Fase 2**
- [ ] Normalização opt-in, **por destino:** injetar `loudnorm=I=-14:TP=-1.5:LRA=11` em `ffmpeg_args_for_encoder`
- [ ] Presets de alvo por plataforma (Twitch/YouTube/etc.) e perfil "música"
- [ ] Detectar "já normalizado lá fora" (I no alvo) e recomendar **só medir**
- [ ] Histórico/gráfico de loudness da sessão (pós-live)
