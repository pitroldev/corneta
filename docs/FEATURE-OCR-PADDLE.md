# OCR PaddleOCR (oar-ocr) — preciso e executado na CPU

## Decisão

A Corneta usa `oar-ocr` **0.8.1** com ONNX Runtime `ort`
**`=2.0.0-rc.12`**. O pin de `ort` é intencional: a RC 13 removeu
`CPUExecutionProvider`, API ainda usada pelo `oar-ocr` 0.8.1. Essa versão do OCR exige Rust
1.95; o projeto, o CI e os artefatos oficiais usam Rust **1.97.1**.

O PaddleOCR roda na CPU para não disputar GPU com NVDEC/NVENC durante a live. O
`Windows.Media.Ocr` permanece como fallback local e é usado imediatamente na primeira sessão
enquanto os modelos são baixados em background.

## Implementação atual

- `OAROCRBuilder` recebe os caminhos de detecção, reconhecimento e dicionário.
- `OrtSessionConfig` força o execution provider de CPU e limita as threads.
- A imagem em tons de cinza é redimensionada, convertida para RGB e passada a `predict`.
- O pipeline é criado uma única vez dentro da thread que o utiliza.
- Falha de download, integridade, criação da sessão ou inferência degrada para o motor nativo;
  ela não impede o início da live.

## Modelos fixados

Os assets PP-OCRv6 Tiny vêm do release oficial `oar-ocr` **v0.7.0**:

| Arquivo                  |     Bytes | SHA-256                                                            |
| ------------------------ | --------: | ------------------------------------------------------------------ |
| `pp-ocrv6_tiny_det.onnx` | 1.780.590 | `193bab7a04fca699a6c82e6abb5b81bdb28177f0abd4062552b04908dafb19f8` |
| `pp-ocrv6_tiny_rec.onnx` | 4.462.639 | `9ef676d6ed3c88256a2d92c640c44f25b0c40947e111b14b8be8f594091563e6` |
| `ppocrv6_tiny_dict.txt`  |    27.156 | `c5cbe34ef40c29c4df07ed012bf96569cb69a2d2a01a07027e9f13cb832bd9cd` |

Base de download:
`https://github.com/GreatV/oar-ocr/releases/download/v0.7.0/<arquivo>`.

Cada arquivo é baixado em streaming com limite de tamanho, validado por tamanho e SHA-256 e
gravado primeiro como `.part`; somente então a troca para o nome definitivo é feita. O cache em
`app_config_dir/ocr-models/` é revalidado antes do uso.

## Validação histórica

O protótipo inicial mediu aproximadamente 60–100 ms por inferência na CPU em uma imagem de
teste com texto pequeno e confirmou texto e regiões. Os números são referência histórica, não
um SLA: resolução, CPU, quantidade de linhas e modelos atuais alteram o tempo real.

O comportamento vigente e seus testes ficam em `src-tauri/src/guardian/ocr.rs`; este documento
deve ser atualizado junto de qualquer mudança de `oar-ocr`, `ort` ou dos três assets fixados.
