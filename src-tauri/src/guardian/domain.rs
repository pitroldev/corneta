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
    let mut out = String::with_capacity(s.len());
    let mut prev_space = true;
    for c in s.chars().flat_map(char::to_lowercase) {
        if c.is_alphanumeric() {
            out.push(c);
            prev_space = false;
        } else if !prev_space {
            out.push(' ');
            prev_space = true;
        }
    }
    if out.ends_with(' ') {
        out.pop();
    }
    out
}

/// Distância de edição ≤ `max_d`? (Levenshtein com saída antecipada — tolera erro do OCR.)
fn within_edit(a: &str, b: &str, max_d: usize) -> bool {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    if a.len().abs_diff(b.len()) > max_d {
        return false;
    }
    let mut prev: Vec<usize> = (0..=b.len()).collect();
    let mut cur = vec![0; b.len() + 1];
    for (i, &ca) in a.iter().enumerate() {
        cur[0] = i + 1;
        let mut row_min = cur[0];
        for (j, &cb) in b.iter().enumerate() {
            let cost = usize::from(ca != cb);
            cur[j + 1] = (prev[j] + cost).min(prev[j + 1] + 1).min(cur[j] + 1);
            row_min = row_min.min(cur[j + 1]);
        }
        if row_min > max_d {
            return false; // nenhuma continuação cabe no orçamento
        }
        std::mem::swap(&mut prev, &mut cur);
    }
    prev[b.len()] <= max_d
}

/// O `needle` aparece no `hay` como SUBSTRING dentro de `max_k` edições, começando em QUALQUER
/// posição? (Levenshtein com a 1ª linha zerada → o casamento pode começar em qualquer ponto do
/// hay.) Pega o nome/endereço lido com 1-2 erros de OCR em qualquer lugar, na ordem.
fn fuzzy_contains(needle: &[char], hay: &[char], max_k: usize) -> bool {
    if needle.is_empty() {
        return true;
    }
    let mut prev = vec![0usize; hay.len() + 1]; // i=0: casar needle vazio = 0 em qualquer coluna
    let mut cur = vec![0usize; hay.len() + 1];
    for (i, &nc) in needle.iter().enumerate() {
        cur[0] = i + 1; // needle[..i+1] vs hay vazio = i+1 inserções
        let mut row_min = cur[0];
        for (j, &hc) in hay.iter().enumerate() {
            let cost = usize::from(nc != hc);
            cur[j + 1] = (prev[j] + cost).min(prev[j + 1] + 1).min(cur[j] + 1);
            row_min = row_min.min(cur[j + 1]);
        }
        if row_min > max_k {
            return false; // nenhuma continuação cabe no orçamento
        }
        std::mem::swap(&mut prev, &mut cur);
    }
    prev.iter().any(|&c| c <= max_k)
}

/// O termo aparece no texto do OCR? (1) frase inteira por substring FUZZY (pega erro de OCR em
/// qualquer ponto, na ordem — caso comum: nome/endereço); (2) fallback por TOKEN (reordenado/
/// separado). Recall alto de propósito — é dado do usuário.
fn matches_term(term: &PreparedTerm, hay: &str, hay_chars: &[char], hay_words: &[&str]) -> bool {
    // Orçamento de erro ∝ tamanho (≥6 chars). Termo curto exige exato (senão casa qualquer coisa).
    let max_k = if term.char_len >= 6 {
        (term.char_len / 6).clamp(1, 3)
    } else {
        0
    };
    if hay.contains(&term.normalized)
        || (max_k > 0 && fuzzy_contains(&term.normalized_chars, hay_chars, max_k))
    {
        return true;
    }
    if term.tokens.is_empty() {
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
    if term
        .tokens
        .iter()
        .any(|tok| tok.chars().count() >= 6 && token_hit(tok))
    {
        return true;
    }
    // Senão, a MAIORIA (~60%) dos tokens precisa casar.
    let matched = term.tokens.iter().filter(|tok| token_hit(tok)).count();
    matched * 5 >= term.tokens.len() * 3
}

pub(crate) struct PreparedTerm {
    original: String,
    normalized: String,
    normalized_chars: Vec<char>,
    char_len: usize,
    tokens: Vec<String>,
}

/// Normaliza e tokeniza a watchlist uma vez por sessão, não uma vez por resultado do OCR.
pub(crate) fn prepare_watchlist(watchlist: &[String]) -> Vec<PreparedTerm> {
    let mut seen = std::collections::HashSet::new();
    watchlist
        .iter()
        .filter_map(|term| {
            let original = term.trim();
            let normalized = normalize(original);
            let char_len = normalized.chars().count();
            if char_len < 3 || !seen.insert(normalized.clone()) {
                return None;
            }
            let tokens = normalized
                .split_whitespace()
                .filter(|word| word.chars().count() >= 3)
                .map(String::from)
                .collect();
            let normalized_chars = normalized.chars().collect();
            Some(PreparedTerm {
                original: original.to_owned(),
                normalized,
                normalized_chars,
                char_len,
                tokens,
            })
        })
        .collect()
}

pub(crate) fn find_prepared_watchlist(text: &str, watchlist: &[PreparedTerm]) -> Vec<Leak> {
    let hay = normalize(text);
    let hay_chars: Vec<char> = hay.chars().collect();
    let hay_words: Vec<&str> = hay.split_whitespace().collect();
    watchlist
        .iter()
        .filter(|term| matches_term(term, &hay, &hay_chars, &hay_words))
        .map(|term| Leak {
            label: "Termo seu".into(),
            snippet: mask(&term.original),
        })
        .collect()
}

/// Casa os termos EXPLÍCITOS da watchlist no texto do OCR. Devolve os termos achados (pra
/// avisar/logar). Vazio = nada do usuário na tela → não dá slate.
#[cfg(test)]
pub fn find_watchlist(text: &str, watchlist: &[String]) -> Vec<Leak> {
    find_prepared_watchlist(text, &prepare_watchlist(watchlist))
}

/// Mudou o suficiente entre dois quadros cinza reduzidos (mesmas dims) pra valer um novo OCR?
/// Conta pixels que mudaram além de `pix_thresh`; muda se passar de `frac` da área. Sensível de
/// propósito (um termo aparecendo = mudança local pequena, mas tem que pegar) → erra pra MAIS OCR.
pub fn frames_differ(prev: &[u8], cur: &[u8], pix_thresh: u8, frac: f32) -> bool {
    if prev.len() != cur.len() || prev.is_empty() {
        return true;
    }
    let mut changed = 0usize;
    let limit = frac * prev.len() as f32;
    for (a, b) in prev.iter().zip(cur) {
        if a.abs_diff(*b) > pix_thresh {
            changed += 1;
            if changed as f32 > limit {
                return true;
            }
        }
    }
    false
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
    unknown: VecDeque<(u64, Option<u64>)>,
    verifying: bool,
    last_verified: Option<u64>,
}

impl Timeline {
    pub fn new() -> Self {
        Self::default()
    }

    /// Until a real frame is read, there is no evidence that its image is safe.
    pub fn start_verification(&mut self) {
        self.verifying = true;
        self.record_unavailable();
    }

    pub fn record_unavailable(&mut self) {
        if self.unknown.back().is_none_or(|(_, end)| end.is_some()) {
            self.unknown
                .push_back((self.last_verified.map_or(0, |i| i.saturating_add(1)), None));
        }
    }

    pub fn unverified(&self, index: u64, max_gap: u64) -> bool {
        (self.verifying
            && !self
                .marks
                .iter()
                .any(|mark| mark.index.abs_diff(index) <= max_gap))
            || self
                .unknown
                .iter()
                .any(|(start, end)| index >= *start && end.is_none_or(|end| index < end))
    }

    pub fn has_verified(&self) -> bool {
        self.last_verified.is_some()
    }

    /// Registra o resultado do quadro `index` (índices chegam ~crescentes).
    pub fn record(&mut self, index: u64, secret: bool) {
        if self.last_verified.is_none_or(|last| index >= last) {
            self.last_verified = Some(index);
            if let Some((_, end)) = self.unknown.back_mut() {
                if end.is_none() {
                    *end = Some(index);
                }
            }
        }
        if self.marks.back().is_none_or(|m| index >= m.index) {
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
    pub fn prune(&mut self, min_keep: u64) {
        while self
            .unknown
            .front()
            .is_some_and(|(_, end)| end.is_some_and(|end| end <= min_keep))
        {
            self.unknown.pop_front();
        }
        while self.marks.front().is_some_and(|m| m.index < min_keep) {
            self.marks.pop_front();
        }
    }

    /// Cobrir (slate) o quadro `index`? Sim se a amostra vizinha mais próxima (≤ ou >), dentro de
    /// `max_gap`, tinha segredo. Bracket → cobre todo o intervalo entre amostras (sem buraco mesmo
    /// com OCR lento), aparece um tico ANTES (preventivo) e some um tico depois (seguro).
    pub fn should_censor(&self, index: u64, max_gap: u64) -> bool {
        if self.unverified(index, max_gap) {
            return true;
        }
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
    fn failed_ocr_never_marks_frames_safe_and_recovers_at_verified_frame() {
        let mut t = Timeline::new();
        t.start_verification();
        assert!(t.should_censor(0, 90));
        t.record(10, false);
        assert!(t.should_censor(9, 90));
        assert!(!t.should_censor(10, 90));
        t.record(20, true);
        t.record_unavailable();
        for i in [20, 21, 500, 10_000] {
            assert!(t.should_censor(i, 90));
        }
        t.prune(200);
        assert!(t.should_censor(500, 90));
        t.record(600, false);
        assert!(t.should_censor(599, 90));
        assert!(!t.should_censor(600, 90));
        assert!(
            t.should_censor(691, 90),
            "stalled worker must not leave coverage green forever"
        );
    }

    #[test]
    fn repeated_failures_are_bounded_and_closed_ranges_are_pruned() {
        let mut t = Timeline::new();
        t.start_verification();
        for _ in 0..10_000 {
            t.record_unavailable();
        }
        assert_eq!(t.unknown.len(), 1);
        t.record(100, false);
        t.prune(101);
        assert!(t.unknown.is_empty());
    }

    #[test]
    fn resumed_worker_does_not_retroactively_verify_a_long_gap() {
        let mut t = Timeline::new();
        t.start_verification();
        t.record(10, false);
        assert!(t.unverified(500, 90));
        t.record(600, false);
        assert!(t.unverified(500, 90));
        assert!(t.should_censor(500, 90));
        assert!(!t.unverified(600, 90));
    }

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
    fn casa_nome_com_dois_erros_de_ocr() {
        // OCR leu "Cordosa" (2 erros: a→o, o→a) — a frase fuzzy ainda casa "Petro Cardoso".
        let leaks = find_watchlist("perfil de Petro Cordosa no feed", &["Petro Cardoso".into()]);
        assert_eq!(leaks.len(), 1);
        // Mas um nome totalmente diferente NÃO casa (sem falso-positivo).
        assert!(find_watchlist("perfil de Joana Ferreira", &["Petro Cardoso".into()]).is_empty());
    }

    #[test]
    fn casa_com_espacos_e_pontuacao_do_ocr() {
        // OCR às vezes separa o e-mail com espaços/pontuação — o casamento por token pega.
        let leaks = find_watchlist("contato joao @ email . com br", &["joao@email.com".into()]);
        assert_eq!(leaks.len(), 1);
    }

    #[test]
    fn nao_casa_texto_qualquer() {
        let leaks = find_watchlist(
            "resultados da busca sobre receitas de bolo",
            &["Petro Cardoso".into()],
        );
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
        assert!(
            t.should_censor(130, 90),
            "false perto não pode mascarar a true dentro do gap"
        );
        assert!(
            t.should_censor(105, 90),
            "logo após o false, a true seguinte cobre"
        );
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
