//! Platforms the app knows: destination presets shared with the frontend through
//! `src/platforms/<id>/destination.json`, and the chat and account providers registered below.

pub mod cinefy;
pub mod kick;
pub mod provider;
pub mod twitch;
pub mod youtube;

use crate::config::VideoPreset;
use provider::{AccountProvider, ChatProvider};
use serde::Deserialize;
use std::sync::OnceLock;

static CHAT_PROVIDERS: [&dyn ChatProvider; 4] = [
    &twitch::Twitch,
    &youtube::Youtube,
    &kick::Kick,
    &cinefy::Cinefy,
];

static ACCOUNT_PROVIDERS: [&dyn AccountProvider; 3] =
    [&twitch::Twitch, &youtube::Youtube, &kick::Kick];

pub fn chat_providers() -> &'static [&'static dyn ChatProvider] {
    &CHAT_PROVIDERS
}

pub fn chat_provider(id: &str) -> Option<&'static dyn ChatProvider> {
    CHAT_PROVIDERS.iter().copied().find(|p| p.id() == id)
}

pub fn account_providers() -> &'static [&'static dyn AccountProvider] {
    &ACCOUNT_PROVIDERS
}

pub fn account_provider(id: &str) -> Option<&'static dyn AccountProvider> {
    ACCOUNT_PROVIDERS.iter().copied().find(|p| p.id() == id)
}

// build.rs assembles every src/platforms/<id>/destination.json into one document.
const CATALOG: &str = include_str!(concat!(env!("OUT_DIR"), "/destinations.json"));

/// The most a destination takes as-is; beyond it, a copy is refused or degrades viewers.
#[derive(Clone, Copy, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CopyLimits {
    /// Limits the shorter side, so a 2560×1440 canvas counts as 1440p.
    pub max_height: u32,
    pub max_fps: u32,
    pub max_kbps: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Destination {
    pub id: String,
    order: u32,
    /// Account provider that can sign in and fill this destination.
    #[serde(default)]
    account: Option<String>,
    pub recommended: VideoPreset,
    #[serde(default)]
    pub copy_limits: Option<CopyLimits>,
    /// Custom ingests may need OBS-style publisher metadata and a separate playpath.
    #[serde(default)]
    pub publisher_compat: bool,
    /// Stands in for destination ids the catalog no longer knows.
    #[serde(default)]
    fallback: bool,
}

#[derive(Deserialize)]
struct Catalog {
    destinations: Vec<Destination>,
}

fn catalog() -> &'static [Destination] {
    static DESTINATIONS: OnceLock<Vec<Destination>> = OnceLock::new();
    DESTINATIONS.get_or_init(|| {
        let mut destinations = serde_json::from_str::<Catalog>(CATALOG)
            .expect("destination.json files are embedded at build time and covered by tests")
            .destinations;
        destinations.sort_by(|a, b| a.order.cmp(&b.order).then_with(|| a.id.cmp(&b.id)));
        destinations
    })
}

fn fallback() -> &'static Destination {
    catalog()
        .iter()
        .find(|d| d.fallback)
        .expect("the catalog has a fallback destination")
}

pub fn destination(id: &str) -> Option<&'static Destination> {
    catalog().iter().find(|d| d.id == id)
}

pub fn is_destination(id: &str) -> bool {
    destination(id).is_some()
}

/// Unknown ids fall back to the fallback destination's preset.
pub fn recommended_preset(id: &str) -> VideoPreset {
    destination(id).unwrap_or_else(fallback).recommended.clone()
}

/// A catalog id safe to report; anything else is reported as the fallback destination.
pub fn known_destination_id(id: &str) -> &'static str {
    destination(id).unwrap_or_else(fallback).id.as_str()
}

pub fn destination_account(id: &str) -> Option<&'static str> {
    destination(id).and_then(|d| d.account.as_deref())
}

pub fn copy_limits(id: &str) -> Option<CopyLimits> {
    destination(id).and_then(|d| d.copy_limits)
}

pub fn is_vertical(id: &str) -> bool {
    let preset = recommended_preset(id);
    preset.height > preset.width
}

pub fn needs_publisher_compat(id: &str) -> bool {
    destination(id).is_some_and(|d| d.publisher_compat)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_parses_with_unique_ids_and_a_custom_fallback() {
        let ids: Vec<&str> = catalog().iter().map(|d| d.id.as_str()).collect();
        let unique: std::collections::HashSet<&str> = ids.iter().copied().collect();
        assert_eq!(ids.len(), unique.len(), "{ids:?}");
        // Folders load in any order; the catalog sorts them by `order`.
        let orders: Vec<u32> = catalog().iter().map(|d| d.order).collect();
        assert!(
            orders.windows(2).all(|pair| pair[0] <= pair[1]),
            "{orders:?}"
        );
        assert_eq!(ids.first(), Some(&"twitch"));
        assert_eq!(catalog().iter().filter(|d| d.fallback).count(), 1);
        assert_eq!(
            recommended_preset("nao-existe"),
            recommended_preset("custom")
        );
        assert_eq!(known_destination_id("kick"), "kick");
        assert_eq!(known_destination_id("nao-existe"), "custom");
    }

    #[test]
    fn presets_and_limits_keep_their_values() {
        let p = recommended_preset("youtube");
        assert_eq!(
            (
                p.width,
                p.height,
                p.fps,
                p.video_bitrate_kbps,
                p.audio_bitrate_kbps,
                p.keyframe_sec
            ),
            (1920, 1080, 60, 9000, 192, 2)
        );
        assert_eq!(
            copy_limits("twitch"),
            Some(CopyLimits {
                max_height: 1080,
                max_fps: 60,
                max_kbps: 6000
            })
        );
        assert_eq!(copy_limits("kick").map(|l| l.max_kbps), Some(8000));
        assert_eq!(copy_limits("facebook").map(|l| l.max_kbps), Some(9000));
        assert_eq!(copy_limits("youtube").map(|l| l.max_height), Some(2160));
        assert_eq!(copy_limits("tiktok"), None);
    }

    #[test]
    fn verticality_and_publisher_compat_come_from_the_catalog() {
        assert!(is_vertical("tiktok"));
        assert!(is_vertical("instagram"));
        assert!(!is_vertical("x"));
        assert!(!is_vertical("twitch"));
        assert!(needs_publisher_compat("custom"));
        assert!(!needs_publisher_compat("twitch"));
    }
}
