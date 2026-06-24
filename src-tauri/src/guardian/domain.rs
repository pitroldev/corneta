//! Núcleo de domínio do guardião de privacidade — **PURO** (sem tauri/ffmpeg/ort/windows/image).
//!
//! A feature: quando um termo que o usuário DEFINIU EXPLICITAMENTE aparece na tela, a transmissão
//! (atrasada por um buffer) mostra a tela "JÁ VOLTO" ANTES daquele instante ir ao ar — preventivo.
//! Sem regiões/tarjas: a censura é binária (slate na tela toda), o que torna a feature viável (não
//! precisa de OCR preciso de posição, só saber SE o termo está na tela).
//!
//! Três responsabilidades puras:
//! 1. **Regras**: casa os termos da watchlist no texto do OCR (só o que o usuário listou).
//! 2. **Diff**: decide se a tela MUDOU o bastante pra valer um novo OCR (senão reusa — barato).
//! 3. **Linha do tempo binária** (`Timeline`): "tinha segredo no quadro X?" → a máquina do tempo,
//!    agora binária: o buffer segura o quadro N s, então quando ele sai já se sabe se dá slate.

use serde::Serialize;
use std::collections::VecDeque;

/// Um vazamento: o termo (mascarado) do usuário que apareceu na tela (vira toast/log).
#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Leak {
    pub label: String,
    pub snippet: String,
}

/// Mascara um termo pra não repetir o segredo no toast/log (mostra só o começo).
fn mask(s: &str) -> String {
    let n = s.chars().count();
    if n <= 2 {
        return "•".repeat(n.max(1));
    }
    let head: String = s.chars().take(2).collect();
    format!("{head}{}", "•".repeat((n - 2).min(6)))
}

/// Casa os termos EXPLÍCITOS da watchlist no texto do OCR (case-insensitive, substring). Devolve
/// os termos achados (pra avisar/logar). Vazio = nada do usuário na tela → não dá slate.
pub fn find_watchlist(text: &str, watchlist: &[String]) -> Vec<Leak> {
    let hay = text.to_lowercase();
    let mut out = vec![];
    let mut seen = std::collections::HashSet::new();
    for term in watchlist {
        let t = term.trim();
        // Termos curtos demais casariam em qualquer coisa (falso-positivo) → ignora.
        if t.chars().count() < 3 {
            continue;
        }
        let tl = t.to_lowercase();
        if hay.contains(&tl) && seen.insert(tl) {
            out.push(Leak {
                label: "Termo seu".into(),
                snippet: mask(t),
            });
        }
    }
    out
}

/// Mudou o suficiente entre dois quadros cinza reduzidos (mesmas dims) pra valer um novo OCR?
/// Conta pixels que mudaram além de `pix_thresh`; muda se passar de `frac` da área. Sensível de
/// propósito (um termo aparecendo = mudança local pequena, mas tem que pegar) → erra pra MAIS OCR.
pub fn frames_differ(prev: &[u8], cur: &[u8], pix_thresh: u8, frac: f32) -> bool {
    if prev.len() != cur.len() || prev.is_empty() {
        return true;
    }
    let mut changed = 0usize;
    for (a, b) in prev.iter().zip(cur) {
        if a.abs_diff(*b) > pix_thresh {
            changed += 1;
        }
    }
    changed as f32 > frac * prev.len() as f32
}

/// Uma amostra: tinha segredo no quadro `index`?
struct Mark {
    index: u64,
    secret: bool,
}

/// **A máquina do tempo (binária).** Guarda "tinha segredo no quadro X?" por índice. Como o quadro
/// fica N s no buffer, quando ele sai a gente já sabe se dá slate — no momento certo, preventivo.
#[derive(Default)]
pub struct Timeline {
    marks: VecDeque<Mark>,
}

impl Timeline {
    pub fn new() -> Self {
        Self { marks: VecDeque::new() }
    }

    /// Registra o resultado do quadro `index` (índices chegam ~crescentes).
    #[allow(clippy::unnecessary_map_or)] // `map_or` (não `is_none_or`): compat Rust < 1.82.
    pub fn record(&mut self, index: u64, secret: bool) {
        if self.marks.back().map_or(true, |m| index >= m.index) {
            self.marks.push_back(Mark { index, secret });
        } else {
            let pos = self
                .marks
                .iter()
                .position(|m| m.index > index)
                .unwrap_or(self.marks.len());
            self.marks.insert(pos, Mark { index, secret });
        }
    }

    /// Descarta amostras já airadas (índice < min_keep).
    #[allow(clippy::unnecessary_map_or)]
    pub fn prune(&mut self, min_keep: u64) {
        while self.marks.front().map_or(false, |m| m.index < min_keep) {
            self.marks.pop_front();
        }
    }

    /// Cobrir (slate) o quadro `index`? Sim se a amostra vizinha mais próxima (≤ ou >), dentro de
    /// `max_gap`, tinha segredo. Bracket → cobre todo o intervalo entre amostras (sem buraco mesmo
    /// com OCR lento), aparece um tico ANTES (preventivo) e some um tico depois (seguro).
    pub fn should_censor(&self, index: u64, max_gap: u64) -> bool {
        if let Some(m) = self.marks.iter().rev().find(|m| m.index <= index) {
            if index - m.index <= max_gap && m.secret {
                return true;
            }
        }
        if let Some(m) = self.marks.iter().find(|m| m.index > index) {
            if m.index - index <= max_gap && m.secret {
                return true;
            }
        }
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn casa_termo_da_watchlist() {
        let wl = vec!["Rua das Flores".into(), "meu@email.com".into()];
        let leaks = find_watchlist("moro na rua das FLORES, 42", &wl);
        assert_eq!(leaks.len(), 1);
        assert!(leaks[0].snippet.starts_with("Ru"));
    }

    #[test]
    fn ignora_termo_curto_e_fora() {
        let wl = vec!["ab".into(), "Petro Cardoso".into()];
        assert!(find_watchlist("texto qualquer ab ab", &wl).is_empty()); // "ab" curto demais
    }

    #[test]
    fn so_termos_explicitos_nao_pega_email_generico() {
        // Sem watchlist → NADA dispara (a feature só age no que o usuário definiu).
        assert!(find_watchlist("contato: alguem@empresa.com chave sk-ABCDEF", &[]).is_empty());
    }

    #[test]
    fn diff_pega_mudanca_e_pula_igual() {
        let a = vec![100u8; 1000];
        assert!(!frames_differ(&a, &a, 24, 0.002), "igual → não re-OCR");
        let mut b = a.clone();
        for p in b.iter_mut().take(50) {
            *p = 0;
        } // 5% mudou
        assert!(frames_differ(&a, &b, 24, 0.002), "mudou → re-OCR");
    }

    #[test]
    fn timeline_cobre_antes_e_depois_some_fora() {
        let mut t = Timeline::new();
        t.record(100, true);
        assert!(t.should_censor(90, 15)); // antes (preventivo)
        assert!(t.should_censor(110, 15)); // depois (seguro)
        assert!(!t.should_censor(60, 15)); // longe
        assert!(!t.should_censor(130, 15));
    }

    #[test]
    fn timeline_sem_buraco_entre_amostras_lentas() {
        let mut t = Timeline::new();
        t.record(100, true);
        t.record(160, true); // OCR lento: 60 quadros depois
        for idx in 100..=160 {
            assert!(t.should_censor(idx, 90), "quadro {idx} sem slate (vazaria)");
        }
    }

    #[test]
    fn timeline_prune() {
        let mut t = Timeline::new();
        t.record(10, true);
        t.record(90, false);
        t.prune(60);
        assert!(!t.should_censor(10, 5));
    }
}
