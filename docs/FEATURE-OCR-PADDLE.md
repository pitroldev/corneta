# OCR PaddleOCR (oar-ocr) — mais preciso + na CPU (libera a GPU)

## Por quê
O Windows.Media.Ocr usa a GPU (somava com o NVENC do compositor) e erra texto
pequeno/estilizado. PaddleOCR (PP-OCRv5) é mais preciso e roda rápido na CPU →
libera a GPU.

## VALIDADO ✅ (scratchpad/ocrtest)
Crate `oar-ocr` 0.2.2 (PaddleOCR PP-OCRv5 via ONNX Runtime). Numa imagem com e-mail
+ chave:
- pipeline pronto em ~190ms; **predict ~60-100ms na CPU** (dá ~10×/s).
- "Email:joao@teste.com" conf 0.97, "token sk-ABC…" conf 0.98 — texto exato + boxes.

### Detalhe crítico de build
`oar-ocr 0.2.2` só compila com **`ort = "=2.0.0-rc.10"`** fixo (rc.11+ tornou
`Session.inputs` privado → não compila). Pinar o ort resolve.

### API
```rust
use oar_ocr::prelude::*;
let ocr = OAROCRBuilder::new(det.to_string(), rec.to_string(), dict.to_string()).build()?;
let results = ocr.predict(&[rgb_image])?;          // &[RgbImage]
for region in &results[0].text_regions {
    if let Some(text) = &region.text {              // Option<String>
        let bb = &region.bounding_box;              // BoundingBox { points: [Point{x,y}; 4] }
        // region.confidence: Option<f32>
    }
}
```

### Modelos (GitHub Releases oar-ocr v0.3.0, ~21MB)
- pp-ocrv5_mobile_det.onnx (4.8MB)
- pp-ocrv5_mobile_rec.onnx (16.5MB)
- ppocrv5_dict.txt (74KB)
`https://github.com/GreatV/oar-ocr/releases/download/v0.3.0/<arquivo>`

GPU opcional: feature `directml` (Windows). Mas a CPU já é rápida E libera a GPU → CPU.

## Plano de integração
1. **Cargo:** `oar-ocr = "0.2"` + `ort = "=2.0.0-rc.10"`.
2. **Modelos:** baixar na 1ª vez (censura ligada) pra `app_config_dir/ocr-models/`
   via `ureq` se faltar; OU empacotar como resource. Também o **ONNX Runtime DLL**
   (o `ort` baixa pro lado do exe em dev; em produção, empacotar).
3. **guardian.rs:** `paddle_scan_gray(ocr, gray, w, h, watchlist) -> (Vec<Leak>,
   Vec<Region>)`: cinza → RgbImage (g→g,g,g) → predict → monta `full` + `Word`s e
   reusa `scan`. Box: bounding-rect dos 4 pontos → frações. Pra tarja mais justa,
   dividir a linha em palavras com box proporcional ao range de chars.
4. **compositor.rs:** a thread de OCR constrói o pipeline UMA vez (com fallback pro
   Windows OCR se baixar/abrir falhar) e usa `paddle_scan_gray` no lugar do
   `ocr_scan_gray`.

Mantém o Windows OCR como fallback → o app nunca quebra se o Paddle falhar.
