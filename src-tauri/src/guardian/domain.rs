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

/// Minúsculas + troca tudo que não é alfanumérico por espaço (junta espaços). Assim "joao@email.com"
/// e "joao @ emaiI . com" (jeito que o OCR às vezes lê) viram comparáveis por TOKEN.
fn normalize(s: &str) -> String {
    let lowered = s.to_lowercase();
    let mut out = String::with_capacity(lowered.len());
    let mut prev_space = true;
    for c in lowered.chars() {
        if c.is_alphanumeric() {
            out.push(c);
            prev_space = false;
        } else if !prev_space {
            out.push(' ');
            prev_space = true;
        }
    }
    out.trim_end().to_string()
}

/// Distância de edição ≤ `max_d`? (Levenshtein com saída antecipada — tolera erro do OCR.)
fn within_edit(a: &str, b: &str, max_d: usize) -> bool {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    if a.len().abs_diff(b.len()) > max_d {
        return false;
    }
    let mut prev: Vec<usize> = (0..=b.len()).collect();
    for (i, &ca) in a.iter().enumerate() {
        let mut cur = vec![i + 1; b.len() + 1];
        let mut row_min = cur[0];
        for (j, &cb) in b.iter().enumerate() {
            let cost = usize::from(ca != cb);
            cur[j + 1] = (prev[j] + cost).min(prev[j + 1] + 1).min(cur[j] + 1);
            row_min = row_min.min(cur[j + 1]);
        }
        if row_min > max_d {
            return false; // nenhuma continuação cabe no orçamento
        }
        prev = cur;
    }
    prev[b.len()] <= max_d
}

/// O termo aparece no texto do OCR? Casa por TOKEN (tolera espaço/pontuação/ordem) e por
/// proximidade (1 erro de OCR em tokens distintivos). Recall alto de propósito — é dado do usuário.
fn matches_term(term: &str, hay: &str, hay_words: &[&str]) -> bool {
    let toks: Vec<String> = normalize(term)
        .split_whitespace()
        .filter(|w| w.chars().count() >= 3)
        .map(String::from)
        .collect();
    if toks.is_empty() {
        return false;
    }
    let token_hit = |tok: &str| -> bool {
        if hay.contains(tok) {
            return true;
        }
        // Fuzzy só em tokens distintivos (≥5) — tolera 1 erro de OCR sem virar falso-positivo.
        tok.chars().count() >= 5 && hay_words.iter().any(|w| within_edit(tok, w, 1))
    };
    // Um token DISTINTIVO (≥6) sozinho já casa (ex.: "growthedge", "cardoso").
    if toks.iter().any(|tok| tok.chars().count() >= 6 && token_hit(tok)) {
        return true;
    }
    // Senão, a MAIORIA (~60%) dos tokens precisa casar.
    let matched = toks.iter().filter(|tok| token_hit(tok)).count();
    matched * 5 >= toks.len() * 3
}

/// Casa os termos EXPLÍCITOS da watchlist no texto do OCR. Devolve os termos achados (pra
/// avisar/logar). Vazio = nada do usuário na tela → não dá slate.
pub fn find_watchlist(text: &str, watchlist: &[String]) -> Vec<Leak> {
    let hay = normalize(text);
    let hay_words: Vec<&str> = hay.split_whitespace().collect();
    let mut out = vec![];
    let mut seen = std::collections::HashSet::new();
    for term in watchlist {
        let t = term.trim();
        // Termos curtos demais casariam em qualquer coisa (falso-positivo) → ignora.
        if t.chars().count() < 3 {
            continue;
        }
        if matches_term(t, &hay, &hay_words) && seen.insert(t.to_lowercase()) {
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
    fn casa_com_erro_de_ocr_fuzzy() {
        // OCR leu "Cardozo" (s→z) — fuzzy ≤1 ainda casa "Cardoso" (token distintivo).
        let leaks = find_watchlist("usuario: Petro Cardozo, online", &["Petro Cardoso".into()]);
        assert_eq!(leaks.len(), 1);
    }

    #[test]
    fn casa_com_espacos_e_pontuacao_do_ocr() {
        // OCR às vezes separa o e-mail com espaços/pontuação — o casamento por token pega.
        let leaks = find_watchlist("contato joao @ email . com br", &["joao@email.com".into()]);
        assert_eq!(leaks.len(), 1);
    }

    #[test]
    fn nao_casa_texto_qualquer() {
        let leaks = find_watchlist("resultados da busca sobre receitas de bolo", &["Petro Cardoso".into()]);
        assert!(leaks.is_empty());
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
    fn timeline_false_perto_nao_mascara_true_dentro_do_gap() {
        // O bracket é OR (vizinha ≤ OU vizinha >). Uma detecção FALSE perto NÃO mascara a TRUE
        // seguinte (dentro do max_gap) → o slate dispara. (Era o bug: pulos gravavam false perto.)
        let mut t = Timeline::new();
        t.record(100, false); // último OCR antes do termo aparecer
        t.record(160, true); // detecção (diff/rede de segurança) depois
        assert!(t.should_censor(130, 90), "false perto não pode mascarar a true dentro do gap");
        assert!(t.should_censor(105, 90), "logo após o false, a true seguinte cobre");
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
