//! Streamer-made combos: a named list of steps the phone runs in order.

use std::collections::HashSet;

use crate::config::{DeckCombo, DeckComboStep};

pub const MAX_COMBOS: usize = 8;
pub const MAX_STEPS: usize = 8;
const MAX_NAME: usize = 24;

fn clip(text: &str, max: usize) -> String {
    text.trim()
        .chars()
        .take(max)
        .collect::<String>()
        .trim()
        .to_string()
}

fn valid_id(id: &str) -> bool {
    (3..=32).contains(&id.len())
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}

/// The step with only the fields its action uses, or None when the phone could not run it.
fn step(raw: DeckComboStep) -> Option<DeckComboStep> {
    let base = DeckComboStep {
        action: raw.action.clone(),
        ..DeckComboStep::default()
    };
    match raw.action.as_str() {
        "mark" => Some(DeckComboStep {
            label: raw.label.map(|l| clip(&l, 80)).filter(|l| !l.is_empty()),
            ..base
        }),
        "brb" => Some(DeckComboStep {
            on: Some(raw.on.unwrap_or(true)),
            ..base
        }),
        "mic" => Some(DeckComboStep {
            muted: Some(raw.muted.unwrap_or(true)),
            ..base
        }),
        "scene" => {
            let scene = clip(raw.scene.as_deref()?, 200);
            (!scene.is_empty()).then_some(DeckComboStep {
                scene: Some(scene),
                ..base
            })
        }
        "say" => {
            let text = clip(raw.text.as_deref()?, 200);
            if text.is_empty() {
                return None;
            }
            // An unknown platform falls back to every chat rather than dropping the message.
            let platform = raw
                .platform
                .filter(|p| crate::platforms::chat_provider(p).is_some());
            Some(DeckComboStep {
                text: Some(text),
                platform,
                ..base
            })
        }
        "pause" => {
            let platform = raw
                .platform
                .filter(|p| crate::platforms::is_destination(p))?;
            Some(DeckComboStep {
                platform: Some(platform),
                paused: Some(raw.paused.unwrap_or(true)),
                ..base
            })
        }
        "wait" => Some(DeckComboStep {
            seconds: Some(raw.seconds.unwrap_or(3).clamp(1, 30)),
            ..base
        }),
        _ => None,
    }
}

/// Keeps combos the phone can run; a combo left without a name or steps is dropped.
pub fn normalize(combos: &mut Vec<DeckCombo>) {
    let mut ids = HashSet::new();
    combos.retain_mut(|combo| {
        combo.name = clip(&combo.name, MAX_NAME);
        combo.steps = std::mem::take(&mut combo.steps)
            .into_iter()
            .filter_map(step)
            .take(MAX_STEPS)
            .collect();
        valid_id(&combo.id)
            && !combo.name.is_empty()
            && !combo.steps.is_empty()
            && ids.insert(combo.id.clone())
    });
    combos.truncate(MAX_COMBOS);
}

/// A key the deck layout may hold: a built-in action or one of these combos.
pub fn is_layout_key(id: &str, combos: &[DeckCombo]) -> bool {
    super::is_action(id)
        || id
            .strip_prefix("combo:")
            .is_some_and(|combo| combos.iter().any(|c| c.id == combo))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn raw(action: &str) -> DeckComboStep {
        DeckComboStep {
            action: action.into(),
            ..DeckComboStep::default()
        }
    }

    #[test]
    fn steps_keep_only_what_their_action_needs() {
        let platform = crate::platforms::known_destination_id("");
        let mut combos = vec![DeckCombo {
            id: "c_sponsor".into(),
            name: "  Patrocínio de um nome bem comprido demais  ".into(),
            steps: vec![
                DeckComboStep {
                    scene: Some("Conversa".into()),
                    text: Some("ignored".into()),
                    ..raw("scene")
                },
                DeckComboStep {
                    label: Some("  ".into()),
                    ..raw("mark")
                },
                DeckComboStep {
                    text: Some("Link na bio!".into()),
                    platform: Some("nowhere".into()),
                    ..raw("say")
                },
                DeckComboStep {
                    platform: Some(platform.into()),
                    ..raw("pause")
                },
                DeckComboStep {
                    seconds: Some(500),
                    ..raw("wait")
                },
                raw("say"),
                raw("start"),
                raw("scene"),
            ],
        }];
        normalize(&mut combos);
        let combo = &combos[0];
        assert_eq!(combo.name.chars().count(), MAX_NAME);
        assert_eq!(combo.steps.len(), 5);
        assert_eq!(combo.steps[0].text, None);
        assert_eq!(combo.steps[1].label, None);
        assert_eq!(
            combo.steps[2].platform, None,
            "unknown chat means every chat"
        );
        assert_eq!(combo.steps[3].paused, Some(true));
        assert_eq!(combo.steps[4].seconds, Some(30));
    }

    #[test]
    fn empty_duplicate_and_extra_combos_are_dropped() {
        let combo = |id: &str, steps: Vec<DeckComboStep>| DeckCombo {
            id: id.into(),
            name: "Combo".into(),
            steps,
        };
        let mut combos = vec![
            combo("c_one", vec![raw("mark")]),
            combo("c_one", vec![raw("mark")]),
            combo("c_empty", vec![raw("start")]),
            combo("bad id!", vec![raw("mark")]),
        ];
        combos.extend((0..20).map(|i| combo(&format!("c_{i:02}"), vec![raw("wait")])));
        normalize(&mut combos);
        assert_eq!(combos[0].id, "c_one");
        assert_eq!(combos[1].id, "c_00");
        assert_eq!(combos.len(), MAX_COMBOS);
    }

    #[test]
    fn layout_takes_combos_that_exist() {
        let combos = vec![DeckCombo {
            id: "c_sponsor".into(),
            name: "Patrocínio".into(),
            steps: vec![raw("mark")],
        }];
        assert!(is_layout_key("mark", &combos));
        assert!(is_layout_key("combo:c_sponsor", &combos));
        assert!(!is_layout_key("combo:c_gone", &combos));
        assert!(!is_layout_key("combo:", &combos));
    }
}
