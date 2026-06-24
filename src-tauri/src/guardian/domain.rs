//! Núcleo de domínio do guardião anti-vazamento — **PURO** (sem tauri/ffmpeg/ort/windows/image).
//!
//! Três responsabilidades, todas testáveis em isolamento:
//! 1. **Regras**: acha segredo (e-mail/chave/CPF/cartão/JWT/watchlist) no texto do OCR.
//! 2. **Geometria**: regiões em frações da tela (união, padding, merge, arredondar).
//! 3. **Cobertura temporal** (`Coverage`): a "máquina do tempo". O buffer de N s deixa a gente
//!    OCR um quadro e, quando ESSE MESMO quadro vai ao ar (N depois), cobrir o segredo no lugar
//!    e na hora exatos — o atraso do OCR fica escondido pelo buffer.

use regex::Regex;
use serde::Serialize;
use std::collections::VecDeque;
use std::sync::OnceLock;

/// Região (frações 0–1 da tela): x, y, largura, altura.
pub type Region = (f32, f32, f32, f32);

/// Um vazamento achado na tela (vira toast na UI).
#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Leak {
    pub kind: String,
    pub label: String,
    pub snippet: String,
    pub severity: String, // "high" (pode censurar) | "med" (só avisa)
}

/// Uma "palavra"/linha do OCR: faixa de bytes no texto reconstruído + bbox em frações.
/// Construída pelos adaptadores de OCR e entregue a [`scan`].
pub struct Word {
    pub start: usize,
    pub end: usize,
    pub fx: f32,
    pub fy: f32,
    pub fw: f32,
    pub fh: f32,
}

// --------------------------------- Regras ----------------------------------

struct Pat {
    kind: &'static str,
    label: &'static str,
    re: Regex,
    severity: &'static str,
}

fn patterns() -> &'static [Pat] {
    static P: OnceLock<Vec<Pat>> = OnceLock::new();
    P.get_or_init(|| {
        vec![
            Pat { kind: "apikey", label: "Chave de API", severity: "high",
                  re: Regex::new(r"(sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{30,}|AIza[A-Za-z0-9_\-]{30,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[A-Z0-9]{16})").unwrap() },
            Pat { kind: "jwt", label: "Token (JWT)", severity: "high",
                  re: Regex::new(r"eyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}").unwrap() },
            Pat { kind: "password", label: "Senha exposta", severity: "high",
                  re: Regex::new(r"(?i)(senha|password|passwd|pwd)\s*[:=]\s*\S{4,}").unwrap() },
            Pat { kind: "cpf", label: "CPF", severity: "high",
                  re: Regex::new(r"\d{3}\.?\d{3}\.?\d{3}-?\d{2}").unwrap() },
            Pat { kind: "card", label: "Cartão", severity: "high",
                  re: Regex::new(r"\b(?:\d[ \-]?){13,16}\b").unwrap() },
            Pat { kind: "email", label: "E-mail", severity: "med",
                  re: Regex::new(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}").unwrap() },
            Pat { kind: "phone", label: "Telefone", severity: "med",
                  re: Regex::new(r"(?:\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[\- ]?\d{4}").unwrap() },
        ]
    })
}

fn mask(s: &str) -> String {
    let head: String = s.chars().take(6).collect();
    format!("{head}…")
}

fn digits(s: &str) -> Vec<u32> {
    s.chars().filter_map(|c| c.to_digit(10)).collect()
}

fn valid_cpf(s: &str) -> bool {
    let d = digits(s);
    if d.len() != 11 || d.iter().all(|&x| x == d[0]) {
        return false;
    }
    let dv = |slice: &[u32], start: u32| -> u32 {
        let sum: u32 = slice.iter().enumerate().map(|(i, &x)| x * (start - i as u32)).sum();
        let r = (sum * 10) % 11;
        if r == 10 { 0 } else { r }
    };
    dv(&d[..9], 10) == d[9] && dv(&d[..10], 11) == d[10]
}

fn valid_luhn(s: &str) -> bool {
    let d = digits(s);
    if d.len() < 13 || d.len() > 19 {
        return false;
    }
    let mut sum = 0u32;
    let mut alt = false;
    for &x in d.iter().rev() {
        let mut v = x;
        if alt {
            v *= 2;
            if v > 9 {
                v -= 9;
            }
        }
        sum += v;
        alt = !alt;
    }
    sum % 10 == 0
}

/// Palavras cuja faixa de bytes encosta em [ms, me) → seus bboxes.
fn boxes_for_range(words: &[Word], ms: usize, me: usize) -> Vec<Region> {
    words
        .iter()
        .filter(|w| w.start < me && w.end > ms)
        .map(|w| (w.fx, w.fy, w.fw, w.fh))
        .collect()
}

/// Caixa que envolve todos os boxes, com uma folga (padding) — None se vazio.
fn union(boxes: &[Region]) -> Option<Region> {
    if boxes.is_empty() {
        return None;
    }
    let x0 = boxes.iter().map(|b| b.0).fold(f32::MAX, f32::min);
    let y0 = boxes.iter().map(|b| b.1).fold(f32::MAX, f32::min);
    let x1 = boxes.iter().map(|b| b.0 + b.2).fold(f32::MIN, f32::max);
    let y1 = boxes.iter().map(|b| b.1 + b.3).fold(f32::MIN, f32::max);
    let pad = 0.02; // folga generosa pra cobrir o segredo todo
    let fx = (x0 - pad).clamp(0.0, 1.0);
    let fy = (y0 - pad).clamp(0.0, 1.0);
    let fw = ((x1 + pad) - fx).clamp(0.0, 1.0 - fx);
    let fh = ((y1 + pad) - fy).clamp(0.0, 1.0 - fy);
    Some((fx, fy, fw, fh))
}

/// Procura segredos no texto do OCR. Devolve os vazamentos (dedup por valor, pro toast)
/// + UMA REGIÃO por OCORRÊNCIA (cobre cada aparição, mesmo valor repetido).
pub fn scan(text: &str, words: &[Word], watchlist: &[String]) -> (Vec<Leak>, Vec<Region>) {
    let mut out: Vec<Leak> = vec![];
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut regions: Vec<Region> = vec![];
    for p in patterns() {
        for m in p.re.find_iter(text) {
            let raw = m.as_str();
            if p.kind == "cpf" && !valid_cpf(raw) {
                continue;
            }
            if p.kind == "card" && !valid_luhn(raw) {
                continue;
            }
            if let Some(r) = union(&boxes_for_range(words, m.start(), m.end())) {
                regions.push(r);
            }
            if seen.insert(format!("{}:{raw}", p.kind)) {
                out.push(Leak {
                    kind: p.kind.into(),
                    label: p.label.into(),
                    snippet: mask(raw),
                    severity: p.severity.into(),
                });
            }
        }
    }
    for term in watchlist {
        let t = term.trim();
        if t.len() < 3 {
            continue;
        }
        if let Ok(re) = Regex::new(&format!("(?i){}", regex::escape(t))) {
            let mut found = false;
            for m in re.find_iter(text) {
                if let Some(r) = union(&boxes_for_range(words, m.start(), m.end())) {
                    regions.push(r);
                }
                found = true;
            }
            if found && seen.insert(format!("watch:{t}")) {
                out.push(Leak {
                    kind: "watchlist".into(),
                    label: "Dado pessoal".into(),
                    snippet: mask(t),
                    severity: "high".into(),
                });
            }
        }
    }
    (out, regions)
}

// -------------------------------- Geometria --------------------------------

/// Arredonda as frações pra uma grade ~0.5% — ignora o jitter sub-pixel do OCR.
pub fn round_region(r: Region) -> Region {
    let q = |v: f32| (v.clamp(-1.0, 2.0) * 200.0).round() / 200.0;
    (q(r.0), q(r.1), q(r.2), q(r.3))
}

/// Dois retângulos se tocam/cruzam? (com uma tolerância pra juntar boxes coladas — ex.: o
/// segredo quebrado em duas linhas/colunas vira UMA tarja limpa.)
fn overlaps(a: Region, b: Region) -> bool {
    let tol = 0.012;
    let (ax0, ay0, ax1, ay1) = (a.0 - tol, a.1 - tol, a.0 + a.2 + tol, a.1 + a.3 + tol);
    let (bx0, by0, bx1, by1) = (b.0, b.1, b.0 + b.2, b.1 + b.3);
    ax0 < bx1 && bx0 < ax1 && ay0 < by1 && by0 < ay1
}

/// Caixa que envolve duas regiões.
fn envelope(a: Region, b: Region) -> Region {
    let x0 = a.0.min(b.0);
    let y0 = a.1.min(b.1);
    let x1 = (a.0 + a.2).max(b.0 + b.2);
    let y1 = (a.1 + a.3).max(b.1 + b.3);
    (x0, y0, x1 - x0, y1 - y0)
}

/// Funde regiões que se sobrepõem, no lugar (O(n²), mas n é pequeno).
pub fn merge_overlapping(regs: &mut Vec<Region>) {
    let mut changed = true;
    while changed {
        changed = false;
        'scan: for i in 0..regs.len() {
            for j in (i + 1)..regs.len() {
                if overlaps(regs[i], regs[j]) {
                    regs[i] = envelope(regs[i], regs[j]);
                    regs.remove(j);
                    changed = true;
                    break 'scan;
                }
            }
        }
    }
}

// --------------------------- Cobertura temporal ----------------------------

/// O resultado do OCR de UM quadro: o índice do quadro + as regiões achadas nele.
struct Sample {
    index: u64,
    regions: Vec<Region>,
}

/// **A máquina do tempo.** Guarda as amostras de OCR por índice de quadro e responde
/// "quais regiões cobrir no quadro que vai AO AR agora". Como o quadro fica N s no buffer,
/// a amostra dele já está pronta quando sai → tarja no lugar e na hora exatos, sem deriva
/// e sem vazar (o atraso do OCR fica todo escondido pelo buffer).
#[derive(Default)]
pub struct Coverage {
    samples: VecDeque<Sample>,
}

impl Coverage {
    pub fn new() -> Self {
        Self { samples: VecDeque::new() }
    }

    /// Registra o resultado do OCR do quadro `index`. Mantém ordenado por índice
    /// (o normal é chegar crescente — empurra no fim; fora de ordem, insere no lugar).
    // `map_or` (não `is_none_or`) de propósito: compat com Rust < 1.82.
    #[allow(clippy::unnecessary_map_or)]
    pub fn record(&mut self, index: u64, regions: Vec<Region>) {
        if self.samples.back().map_or(true, |s| index >= s.index) {
            self.samples.push_back(Sample { index, regions });
        } else {
            let pos = self
                .samples
                .iter()
                .position(|s| s.index > index)
                .unwrap_or(self.samples.len());
            self.samples.insert(pos, Sample { index, regions });
        }
    }

    /// Descarta amostras com índice abaixo de `min_keep` (já saíram do buffer).
    #[allow(clippy::unnecessary_map_or)] // `map_or` (não `is_some_and`): compat Rust < 1.82.
    pub fn prune(&mut self, min_keep: u64) {
        while self.samples.front().map_or(false, |s| s.index < min_keep) {
            self.samples.pop_front();
        }
    }

    /// Regiões a desenhar no quadro `index`: a UNIÃO das amostras que BRACKETAM o índice — a
    /// vizinha mais próxima COM índice ≤ `index` e a mais próxima COM índice > `index`, cada uma
    /// só se estiver dentro de `max_gap` (senão o OCR travou → não segura uma tarja velha pra
    /// sempre). `cap` limita o nº de tarjas.
    ///
    /// Por que bracket (e não uma janela ±fixa): cobre TODO o intervalo entre duas amostras sem
    /// buraco (preventivo — se o segredo está em qualquer ponta, aparece), se ADAPTA ao espaçamento
    /// real do OCR (rápido → tarja justa; lento → cobre mais, seguro) sem janela/EMA com atraso, e
    /// ainda atravessa uma detecção perdida no meio (a ponta seguinte cobre). Aparece no máx.
    /// `gap` antes / some no máx. `gap` depois — sempre pra MAIS censura, nunca expõe.
    pub fn regions_at(&self, index: u64, max_gap: u64, cap: usize) -> Vec<Region> {
        let mut out: Vec<Region> = Vec::new();
        // Vizinha mais próxima com índice ≤ index (inclui a exata).
        if let Some(s) = self.samples.iter().rev().find(|s| s.index <= index) {
            if index - s.index <= max_gap {
                out.extend(s.regions.iter().map(|&r| round_region(r)));
            }
        }
        // Vizinha mais próxima com índice > index.
        if let Some(s) = self.samples.iter().find(|s| s.index > index) {
            if s.index - index <= max_gap {
                out.extend(s.regions.iter().map(|&r| round_region(r)));
            }
        }
        merge_overlapping(&mut out);
        if out.len() > cap {
            out.truncate(cap);
        }
        out
    }

    #[cfg(test)]
    fn len(&self) -> usize {
        self.samples.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn word(start: usize, end: usize, fx: f32, fy: f32) -> Word {
        Word { start, end, fx, fy, fw: 0.2, fh: 0.05 }
    }

    #[test]
    fn pega_chave_e_email() {
        let t = "meu token sk-ABCDEFGHIJKLMNOPQRSTUVWX e email joao@teste.com";
        let (leaks, _) = scan(t, &[], &[]);
        assert!(leaks.iter().any(|l| l.kind == "apikey" && l.severity == "high"));
        assert!(leaks.iter().any(|l| l.kind == "email"));
    }

    #[test]
    fn cpf_invalido_nao_conta() {
        let (leaks, _) = scan("CPF 123.456.789-00", &[], &[]);
        assert!(leaks.iter().all(|l| l.kind != "cpf"));
    }

    #[test]
    fn watchlist_casa() {
        let (leaks, _) = scan("moro na Rua das Flores 42", &[], &["Rua das Flores".into()]);
        assert!(leaks.iter().any(|l| l.kind == "watchlist"));
    }

    #[test]
    fn regiao_uniao_com_padding() {
        let words = [word(0, 5, 0.2, 0.3), word(6, 11, 0.35, 0.32)];
        let (_, regions) = scan("aaaaa@bbbbb.com", &words, &[]);
        // o e-mail casa nas duas palavras → uma região que cobre as duas, com padding.
        let r = regions[0];
        assert!(r.0 < 0.2 && r.1 < 0.3, "padding empurra a borda pra fora");
        assert!(r.2 > 0.25, "cobre os dois boxes");
    }

    #[test]
    fn merge_junta_boxes_coladas() {
        let mut regs = vec![(0.10, 0.10, 0.10, 0.05), (0.205, 0.10, 0.10, 0.05)];
        merge_overlapping(&mut regs);
        assert_eq!(regs.len(), 1, "duas linhas coladas viram uma tarja");
        assert!(regs[0].2 > 0.19);
    }

    #[test]
    fn cobertura_aparece_antes_e_some_depois() {
        let mut cov = Coverage::new();
        cov.record(100, vec![(0.3, 0.3, 0.2, 0.05)]);
        // max_gap 15: a amostra 100 bracketa o quadro 90 (antes) e o 110 (depois) — preventivo.
        assert_eq!(cov.regions_at(90, 15, 8).len(), 1);
        assert_eq!(cov.regions_at(110, 15, 8).len(), 1);
        // Longe da amostra (> max_gap) → nada (não segura tarja velha pra sempre).
        assert!(cov.regions_at(60, 15, 8).is_empty());
        assert!(cov.regions_at(130, 15, 8).is_empty());
    }

    #[test]
    fn cobertura_funde_amostras_vizinhas() {
        let mut cov = Coverage::new();
        cov.record(100, vec![(0.30, 0.30, 0.10, 0.05)]);
        cov.record(108, vec![(0.31, 0.30, 0.10, 0.05)]); // mesmo segredo, ligeiro scroll
        let regs = cov.regions_at(104, 12, 8);
        assert_eq!(regs.len(), 1, "amostras vizinhas do mesmo segredo fundem");
    }

    #[test]
    fn cobertura_sem_buraco_entre_amostras_esparsas() {
        // OCR lento: amostras a 60 quadros de distância (latência ~2s). NENHUM quadro do intervalo
        // pode ficar descoberto — o bracket cobre tudo (era o bug crítico da janela com EMA).
        let mut cov = Coverage::new();
        let secret = (0.3, 0.3, 0.2, 0.05);
        cov.record(100, vec![secret]);
        cov.record(160, vec![secret]);
        for idx in 100..=160 {
            assert!(
                !cov.regions_at(idx, 90, 8).is_empty(),
                "quadro {idx} ficou sem tarja entre amostras esparsas (vazamento)"
            );
        }
    }

    #[test]
    fn cobertura_atravessa_deteccao_perdida() {
        // Segredo presente, mas o OCR PERDEU a amostra do meio (confiança baixa num quadro).
        // O bracket pega a próxima amostra com o segredo → o quadro do meio fica coberto.
        let mut cov = Coverage::new();
        let secret = (0.3, 0.3, 0.2, 0.05);
        cov.record(100, vec![secret]);
        cov.record(130, vec![]); // miss
        cov.record(160, vec![secret]);
        assert!(!cov.regions_at(130, 60, 8).is_empty(), "miss do meio coberto pela próxima");
    }

    #[test]
    fn cobertura_nao_segura_tarja_se_ocr_travou() {
        // Sem amostra nova há muito tempo (> max_gap) → para de desenhar (não trava uma tarja
        // velha na tela pra sempre se o OCR morreu).
        let mut cov = Coverage::new();
        cov.record(100, vec![(0.3, 0.3, 0.2, 0.05)]);
        assert!(cov.regions_at(100 + 200, 90, 8).is_empty());
    }

    #[test]
    fn prune_descarta_amostras_velhas() {
        let mut cov = Coverage::new();
        cov.record(10, vec![(0.1, 0.1, 0.1, 0.1)]);
        cov.record(50, vec![(0.1, 0.1, 0.1, 0.1)]);
        cov.record(90, vec![(0.1, 0.1, 0.1, 0.1)]);
        cov.prune(60);
        assert_eq!(cov.len(), 1, "só a amostra >= 60 sobra");
    }

    #[test]
    fn record_aceita_fora_de_ordem() {
        let mut cov = Coverage::new();
        cov.record(100, vec![(0.1, 0.1, 0.1, 0.1)]);
        cov.record(80, vec![(0.5, 0.5, 0.1, 0.1)]); // atrasada
        // a janela em torno de 80 acha a amostra inserida no lugar certo.
        assert_eq!(cov.regions_at(80, 5, 8).len(), 1);
    }
}
