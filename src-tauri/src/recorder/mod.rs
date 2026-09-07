//! Gravação do PROGRAMA em disco — o vídeo que alimenta o replay do relatório.
//!
//! ------------------------------------------------------------
//! A REGRA QUE MANDA NO DESENHO
//! ------------------------------------------------------------
//! A gravação NUNCA pode derrubar a live. Este módulo é um filho isolado que lê o programa
//! como se fosse mais um espectador: disco cheio, pasta sumida, unidade arrancada — ele
//! morre, escreve o motivo na sessão, avisa por toast, e a transmissão não sente nada.
//! Nenhum erro daqui sobe pro caminho que decide o estado do motor.
//!
//! A hierarquia de sacrifício, quando duas coisas não cabem:
//!   1. a transmissão · 2. o relatório · 3. o chat gravado · 4. o vídeo (o primeiro a cair)
//!
//! ------------------------------------------------------------
//! POR QUE fMP4 E NÃO MP4 COMUM
//! ------------------------------------------------------------
//! MP4 normal só fica legível quando o `moov` é escrito no FIM: falta de energia às 3h de
//! live transforma o arquivo inteiro em lixo. Com `frag_keyframe+empty_moov` cada fragmento
//! já é reproduzível. O preço é a navegação (sem índice global, pular pro minuto 187 é
//! ruim), e quem paga é o REMUX DE FINALIZAÇÃO: `-c copy +faststart` depois da live, que
//! devolve o índice sem re-encode. Melhor dos dois mundos.
//!
//! ------------------------------------------------------------
//! ESTRUTURA DO CÓDIGO (arquitetura hexagonal)
//! ------------------------------------------------------------
//! - [`domain`] — núcleo PURO (sem processo, sem disco, sem relógio, sem tauri): nomes de
//!   segmento, argumentos do FFmpeg, leitura do `-progress`, e a POLÍTICA de supervisão —
//!   quando ancorar, quando considerar morto, quando retomar e quando desistir.
//! - `mod.rs` (aqui) — a API pública que o resto do app usa.
//! - [`ffmpeg`] — adaptador do encoder: sidecar, `-progress`, remux, matar a árvore.
//! - [`disk`] — adaptador do volume: espaço livre (Win32) e a sondagem real da pasta.
//!
//! Não há `trait` de porta aqui, e é de propósito: cada externo tem UMA implementação, e a
//! substituição que valeria teste — a política — já é pura e roda sem nenhum deles. Um
//! `trait Encoder` sobre o fluxo assíncrono de eventos do sidecar Tauri teria uma
//! implementação e nenhum duplo capaz de exercitar algo que o núcleo puro não exercite
//! melhor. Inverter as dependências Tauri de [`ffmpeg::run`] (AppHandle, AppState) é o
//! próximo passo se um dia o laço em si precisar de teste.

pub mod disk;
pub mod domain;
pub mod ffmpeg;

pub use disk::{check_dir, free_bytes, resolve_dir};
pub use domain::{DirCheck, DISK_START_FLOOR};
pub use ffmpeg::{run, test_record};

/// Chave do gravador no mapa de filhos do motor. Estar lá é o que faz TODOS os caminhos de
/// encerramento que já existem (`kill_engine`, `taskkill /T /F`) levarem o gravador junto.
pub const RECORDER_KEY: &str = "__recorder";

#[cfg(test)]
mod tests;
