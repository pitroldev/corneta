//! Explicit watchlist matching and frame-indexed privacy coverage.

use serde::Serialize;
use std::collections::VecDeque;

/// Only masked snippets may cross the UI boundary.
#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Leak {
    pub label: String,
    pub snippet: String,
}

/// Never repeat the full matched term in UI events.
fn mask(s: &str) -> String {
    let n = s.chars().count();
    if n <= 2 {
        return "•".repeat(n.max(1));
    }
    let head: String = s.chars().take(2).collect();
    format!("{head}{}", "•".repeat((n - 2).min(6)))
}

/// Normalize case and punctuation so OCR-separated tokens remain comparable.
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

/// Bounded Levenshtein distance tolerates OCR errors.
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
            return false; // No continuation can fit the edit budget.
        }
        std::mem::swap(&mut prev, &mut cur);
    }
    prev[b.len()] <= max_d
}

/// A zero first row allows the match to begin at any haystack position.
fn fuzzy_contains(needle: &[char], hay: &[char], max_k: usize) -> bool {
    if needle.is_empty() {
        return true;
    }
    let mut prev = vec![0usize; hay.len() + 1];
    let mut cur = vec![0usize; hay.len() + 1];
    for (i, &nc) in needle.iter().enumerate() {
        cur[0] = i + 1;
        let mut row_min = cur[0];
        for (j, &hc) in hay.iter().enumerate() {
            let cost = usize::from(nc != hc);
            cur[j + 1] = (prev[j] + cost).min(prev[j + 1] + 1).min(cur[j] + 1);
            row_min = row_min.min(cur[j + 1]);
        }
        if row_min > max_k {
            return false;
        }
        std::mem::swap(&mut prev, &mut cur);
    }
    prev.iter().any(|&c| c <= max_k)
}

/// Prefer recall: match a fuzzy phrase or distinctive tokens, even if OCR reorders them.
fn matches_term(term: &PreparedTerm, hay: &str, hay_chars: &[char], hay_words: &[&str]) -> bool {
    // Short terms require exact matching to avoid broad false positives.
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
        // Limit fuzzy token matching to distinctive words.
        tok.chars().count() >= 5 && hay_words.iter().any(|w| within_edit(tok, w, 1))
    };
    // One distinctive token is enough to cover a potentially exposed secret.
    if term
        .tokens
        .iter()
        .any(|tok| tok.chars().count() >= 6 && token_hit(tok))
    {
        return true;
    }
    // Otherwise require at least 60% of tokens.
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

/// Prepare once per session rather than per OCR result.
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

#[cfg(test)]
pub fn find_watchlist(text: &str, watchlist: &[String]) -> Vec<Leak> {
    find_prepared_watchlist(text, &prepare_watchlist(watchlist))
}

/// Rescan if enough pixels exceed the noise threshold.
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

struct Mark {
    index: u64,
    secret: bool,
}

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

    /// Results usually arrive in frame order; late results remain sorted.
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

    /// Either neighboring positive sample within max_gap covers the frame; unverified frames stay covered.
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
    fn matches_explicit_watchlist_terms() {
        let wl = vec!["Rua das Flores".into(), "meu@email.com".into()];
        let leaks = find_watchlist("moro na rua das FLORES, 42", &wl);
        assert_eq!(leaks.len(), 1);
        assert!(leaks[0].snippet.starts_with("Ru"));
    }

    #[test]
    fn matches_single_character_ocr_errors() {
        let leaks = find_watchlist("usuario: Petro Cardozo, online", &["Petro Cardoso".into()]);
        assert_eq!(leaks.len(), 1);
    }

    #[test]
    fn matches_two_character_name_errors_without_unrelated_matches() {
        let leaks = find_watchlist("perfil de Petro Cordosa no feed", &["Petro Cardoso".into()]);
        assert_eq!(leaks.len(), 1);
        assert!(find_watchlist("perfil de Joana Ferreira", &["Petro Cardoso".into()]).is_empty());
    }

    #[test]
    fn matches_ocr_separated_email_tokens() {
        let leaks = find_watchlist("contato joao @ email . com br", &["joao@email.com".into()]);
        assert_eq!(leaks.len(), 1);
    }

    #[test]
    fn ignores_unrelated_text() {
        let leaks = find_watchlist(
            "resultados da busca sobre receitas de bolo",
            &["Petro Cardoso".into()],
        );
        assert!(leaks.is_empty());
    }

    #[test]
    fn ignores_terms_below_minimum_length() {
        let wl = vec!["ab".into(), "Petro Cardoso".into()];
        assert!(find_watchlist("texto qualquer ab ab", &wl).is_empty());
    }

    #[test]
    fn empty_watchlist_does_not_detect_generic_secrets() {
        assert!(find_watchlist("contato: alguem@empresa.com chave sk-ABCDEF", &[]).is_empty());
    }

    #[test]
    fn diff_detects_changed_frames_and_skips_identical_frames() {
        let a = vec![100u8; 1000];
        assert!(
            !frames_differ(&a, &a, 24, 0.002),
            "identical frames should not trigger OCR"
        );
        let mut b = a.clone();
        for p in b.iter_mut().take(50) {
            *p = 0;
        }
        assert!(
            frames_differ(&a, &b, 24, 0.002),
            "changed frames should trigger OCR"
        );
    }

    #[test]
    fn timeline_covers_adjacent_frames_within_the_gap() {
        let mut t = Timeline::new();
        t.record(100, true);
        assert!(t.should_censor(90, 15));
        assert!(t.should_censor(110, 15));
        assert!(!t.should_censor(60, 15));
        assert!(!t.should_censor(130, 15));
    }

    #[test]
    fn timeline_preserves_coverage_between_slow_samples() {
        let mut t = Timeline::new();
        t.record(100, true);
        t.record(160, true);
        for idx in 100..=160 {
            assert!(t.should_censor(idx, 90), "frame {idx} must remain covered");
        }
    }

    #[test]
    fn nearby_clear_sample_does_not_mask_a_positive_neighbor() {
        let mut t = Timeline::new();
        t.record(100, false);
        t.record(160, true);
        assert!(
            t.should_censor(130, 90),
            "a nearby clear sample must not hide a positive within the gap"
        );
        assert!(
            t.should_censor(105, 90),
            "the next positive sample covers frames after the clear sample"
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
