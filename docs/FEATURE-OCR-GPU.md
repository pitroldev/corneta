# OCR por GPU (guardião mais rápido, sem roubar CPU) — planejamento

> Hoje o guardião usa o **Windows.Media.Ocr**, que roda na **CPU** — justo o recurso que os encoders
> brigam por durante a live. Dá pra fazer OCR na **GPU** (mais rápido e libera a CPU). Aqui estão as
> opções e o plano. **Só planejamento — nada implementado.** Ver [`FEATURE-ANTI-VAZAMENTO.md`](./FEATURE-ANTI-VAZAMENTO.md).

- **Status:** ❌ **Descartado na prática (2026-06-24)** — ver desfecho abaixo.
- **Relacionado:** [`MONETIZACAO.md`](./MONETIZACAO.md) (OCR local = grátis, na CPU **ou** GPU)

> **DESFECHO:** a GPU pro OCR foi testada (PaddleOCR/DirectML) e **degradou ao vivo**: o decode
> (NVDEC) e o encode (NVENC) já ocupam a GPU, e o OCR na GPU (DirectML) **disputava o codec** —
> os scans foram pra **5-15s e CRESCENDO**, então a tarja nunca aparecia (amostras longe demais da
> janela de cobertura). A premissa "OCR na CPU briga com os encoders" caiu porque os encoders foram
> pra GPU (NVENC) e o decode pra NVDEC → **a CPU sobrou**. Produção usa **PaddleOCR na CPU** (~300ms,
> previsível). Ver `FEATURE-PROTETOR-BUFFER.md`.

---

## 0. O problema

O OCR roda ~1 vez/1,5s num frame. No `Windows.Media.Ocr` isso é **CPU**. Transmitir já é
**CPU-intensivo** (encoders), então o OCR competindo pode causar engasgo. Mandar o OCR pra **GPU**:
- **libera a CPU** pros encoders, e
- costuma ser **mais rápido e mais preciso** (modelos PP-OCR).

> Ressalva já: a **GPU também pode estar ocupada** (NVENC + o jogo). OCR é leve (1 frame pequeno a
> cada 1,5s → carga mínima na GPU), então o ganho real é **quando o gargalo é CPU**. Por isso a
> escolha do motor deve ser **configurável** (auto).

---

## 1. As opções

### A) Windows.Media.Ocr — **atual** (CPU, 0 de bundle)
Nativo do Windows, sem baixar nada, dá bounding boxes. **Mantém como default e fallback** — é a base
"funciona em qualquer Windows sem peso".

### B) ONNX Runtime + DirectML + PP-OCR — ⭐ **o caminho GPU portável**
A crate **`ort`** (pykeio) roda modelos ONNX em Rust com vários *execution providers*, incluindo
**DirectML** — que usa **DirectX 12** e funciona em **qualquer GPU no Windows (NVIDIA / AMD / Intel),
sem CUDA**. Rodando os modelos **PP-OCR (PaddleOCR convertidos pra ONNX)** dá um OCR rápido e preciso,
com **detecção (boxes) + reconhecimento** — então a **tarja por região** continua funcionando.

Crates Rust prontas que já fazem esse pipeline: **`oar-ocr`** (PP-OCR, suporte a GPU), **`paddle-ocr-rs`**,
e o **RapidOCR** (referência: PP-OCR em ONNX, sem dependência do PaddlePaddle, ~50–80 MB).

- **Prós:** **qualquer GPU** (DirectML), sem CUDA; libera CPU; mais preciso (fontes pequenas/de jogo);
  dá boxes (mantém a tarja).
- **Contras:** **bundle ~50–80 MB** (runtime + modelos); pipeline mais complexo que a chamada única do
  Windows OCR.

### C) ONNX Runtime + CUDA/TensorRT — NVIDIA, o mais rápido
Mesmo `ort`, EP `cuda`/`tensorrt`. **Mais rápido** em NVIDIA.
- **Contras:** **só NVIDIA**; exige runtime CUDA (bundle **enorme**) ou o usuário instalar. Não serve
  como default de app de consumidor.

### D) ONNX Runtime + OpenVINO — Intel
EP `openvino` → **2–3× em CPUs/iGPUs Intel**. Bom como aceleração **extra em Intel** (a base é a B).

### E) OCR puro-Rust (CPU, SIMD) — meio-termo sem GPU
`ocrs`/`rten` (Rust): mais rápido que o Tesseract, **sem GPU e sem bundle pesado**. Não é GPU, mas é
uma alternativa se a meta for só "tirar peso da CPU sem baixar 80 MB". (Ainda CPU, então ganho menor.)

---

## 2. Comparação

| Opção | GPU | Vendors | Velocidade | Bundle | Boxes (tarja) | Complexidade |
|---|---|---|---|---|---|---|
| **A) Windows.Media.Ocr** (atual) | ❌ CPU | — | 🟡 ok | 🟢 0 | ✅ | 🟢 trivial |
| **B) ort + DirectML + PP-OCR** ⭐ | ✅ | **todos** (DX12) | 🟢🟢 | 🔴 ~50–80 MB | ✅ | 🟡 média |
| **C) ort + CUDA/TensorRT** | ✅ | só NVIDIA | 🟢🟢🟢 | 🔴🔴 enorme | ✅ | 🔴 alta |
| **D) ort + OpenVINO** | iGPU | só Intel | 🟢 (Intel) | 🔴 | ✅ | 🟡 |
| **E) ocrs/rten (puro-Rust)** | ❌ CPU | — | 🟡🟢 | 🟢 leve | ✅ | 🟡 |

---

## 3. Recomendação

1. **Manter o Windows.Media.Ocr como default** (0 bundle, funciona sempre). É a base.
2. **Adicionar um motor opcional `ort` + DirectML + PP-OCR** como o caminho **GPU portável** (qualquer
   GPU). Selecionável nas settings: **Auto / CPU (Windows) / GPU (DirectML)**.
3. **Auto** = usa GPU (DirectML) se houver GPU compatível **e** o usuário ativou; senão cai pro Windows OCR.
4. CUDA/TensorRT e OpenVINO ficam como *tunings* avançados (fase futura), não o default.

> Em resumo: **Windows OCR = base zero-peso; DirectML+PP-OCR = o "modo turbo" opcional** que libera CPU
> e funciona em NVIDIA/AMD/Intel.

---

## 4. Antes de ir pra GPU: o barato que talvez já resolva

A GPU custa 50–80 MB + complexidade. Vale medir/tentar primeiro o que é **de graça**:
- **Baixar a frequência** (1,5s → 2–3s) ou só quando o frame muda (skip por **hash** rápido — já está
  no plano do anti-vazamento).
- **Reduzir mais a resolução** antes do OCR (ex.: 960px de largura).
- **OCR só numa ROI** (ex.: ignorar a face-cam) se o usuário marcar.
- **Thread de baixa prioridade** pro OCR não disputar com os encoders.
- Talvez o **(E) puro-Rust** já tire bastante peso sem baixar nada.

> Plano: **medir** o custo real do OCR atual durante uma live antes de comprometer com a GPU. Pode ser
> que ajuste de frequência/resolução já resolva o engasgo.

---

## 5. Plano de implementação (fases)

- **Fase 0 — Medir.** Instrumentar quanto tempo/CPU o OCR atual consome por frame numa live real.
  Decidir se a GPU é necessária ou se basta afinar frequência/resolução.
- **Fase 1 — Abstrair o motor.** Trait `Ocr { fn recognize(&self, jpeg) -> (String, Vec<Word>) }`. Hoje
  o `guardian.rs` já tem `ocr_words(bytes) -> (texto, palavras+bbox)` — é só extrair pro trait. O resto
  (regras, região, tarja) **não muda**.
- **Fase 2 — Backend ort + DirectML + PP-OCR.** Implementar `Ocr` com `ort` (EP DirectML) + os modelos
  PP-OCR (det+rec). Reaproveitar uma crate (`oar-ocr`/`paddle-ocr-rs`) se couber, ou `ort` direto.
- **Fase 3 — Seleção + fallback.** Setting "Motor do OCR: Auto / CPU / GPU". Auto detecta GPU DX12; se
  o init do DirectML falhar, **cai pro Windows OCR** sem quebrar.
- **Fase 4 (opt) — Tunings.** OpenVINO (Intel), CUDA/TensorRT (NVIDIA) como avançado.

---

## 6. Distribuição dos modelos (bundle)

Os modelos PP-OCR + o runtime pesam ~50–80 MB. Pra não inchar o instalador base:
- **Baixar o "pacote de OCR GPU" no 1º uso** (de um CDN), só pra quem ligar o modo GPU. É um **download
  único**, não um servidor nosso no caminho — mantém o espírito local-first. Alternativa: empacotar
  (instalador maior).

---

## 7. Monetização

**Não muda a regra.** OCR roda **local** seja na CPU ou na GPU → **grátis**. A GPU é do usuário, não um
servidor nosso. (Um OCR/visão **na nuvem** seria o caminho pago — mas não é isso aqui.) Ver
[`MONETIZACAO.md`](./MONETIZACAO.md).

---

## 8. Riscos

- **GPU já ocupada** (NVENC + jogo) → em setup GPU-bound, OCR na GPU pode competir. Mitiga: é **opt-in**
  e leve; o "Auto" pode preferir CPU se a GPU estiver saturada (medir).
- **DirectML não é tão rápido quanto CUDA** em NVIDIA — mas é o preço da portabilidade. Aceitável.
- **Bundle 50–80 MB** — mitiga com download sob demanda.
- **Complexidade do pipeline PP-OCR** (det → crop → rec → decode) vs a chamada única do Windows OCR —
  mitiga reusando uma crate pronta.
- **Drivers/DX12** ausentes em máquina muito antiga → fallback pro Windows OCR.

---

## 9. Próximo passo sugerido

**Fase 0 (medir)** antes de tudo: ver o custo real do OCR atual numa live. Se for o gargalo, **Fase 1
(abstrair) + Fase 2/3 (DirectML opt-in com fallback)**. O `ocr_words` de hoje já é o ponto de extensão
perfeito — o backend GPU encaixa sem mexer no resto (regras/tarja/delay).

---

## Fontes
- [`ort` — ONNX Runtime em Rust (EPs: directml, cuda, tensorrt, openvino, rocm…)](https://github.com/pykeio/ort)
- [`oar-ocr` — OCR em Rust com `ort` + PP-OCR (suporte a GPU)](https://github.com/greatv/oar-ocr) · [`paddle-ocr-rs`](https://crates.io/crates/paddle-ocr-rs)
- [RapidOCR — PP-OCR em ONNX Runtime (sem PaddlePaddle, ~50–80 MB)](https://github.com/RapidAI/RapidOCR)
- [ONNX Runtime — DirectML execution provider](https://onnxruntime.ai/docs/execution-providers/DirectML-ExecutionProvider.html)
