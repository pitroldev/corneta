//! Cinefy (cinefy.gg): an experimental chat and audience source, not a streaming destination.

mod adapter;
mod audience;
mod domain;
mod ports;
mod sink;

use serde_json::{json, Map};
use std::collections::HashSet;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use super::provider::{AudienceReader, AudienceSetup, ChatProvider, Connection};
use crate::chat::ChannelCounts;
use crate::config::ChatSource;

pub(crate) use adapter::run;
#[cfg(test)]
pub(crate) use audience::AudienceOrigin;
pub(crate) use audience::{normalize_slug, AudiencePoller, AudienceSnapshot, AudienceStatus};
pub(crate) use domain::{ConnectionStatus, Event};
pub(crate) use ports::OutputPort;

pub struct Cinefy;

impl ChatProvider for Cinefy {
    fn id(&self) -> &'static str {
        "cinefy"
    }

    fn connect(&self, c: &Connection) -> bool {
        let sink = sink::CinefySink {
            app: c.app.clone(),
            source: c.label.to_string(),
            gen: c.gen,
        };
        run(&c.source.value, c.running.clone(), &sink)
    }

    fn audience(&self, setup: &AudienceSetup) -> Option<Box<dyn AudienceReader>> {
        Some(Box::new(Reader {
            poller: AudiencePoller::new(setup.sources.iter().map(|src| src.value.as_str())),
            running: setup.running.clone(),
            read_this_cycle: HashSet::new(),
        }))
    }
}

struct Reader {
    poller: AudiencePoller,
    running: Arc<AtomicBool>,
    read_this_cycle: HashSet<String>,
}

impl AudienceReader for Reader {
    fn begin_cycle(&mut self) {
        self.poller.begin_cycle();
        self.read_this_cycle.clear();
    }

    fn read(&mut self, source: &ChatSource) -> Option<ChannelCounts> {
        if already_read_this_cycle(&mut self.read_this_cycle, &source.value) {
            return None;
        }
        Some(counts(self.poller.poll(&source.value, &self.running)))
    }
}

/// Aliases of one room (URL, slug, popout) are read once per cycle.
pub(crate) fn already_read_this_cycle(read: &mut HashSet<String>, value: &str) -> bool {
    normalize_slug(value).is_some_and(|slug| !read.insert(slug))
}

/// Embedded players belong to the upstream platform, so their viewers are reported but not counted.
pub(crate) fn counts(audience: AudienceSnapshot) -> ChannelCounts {
    let viewers = match audience.audience_status {
        AudienceStatus::Live if audience.live => audience.viewers,
        AudienceStatus::Offline => Some(0),
        _ => None,
    };
    let embedded = matches!(audience.audience_status, AudienceStatus::Embedded);
    let mut details = Map::new();
    details.insert("audienceStatus".into(), json!(audience.audience_status));
    if let Some(origin) = audience.audience_origin.filter(|_| embedded) {
        details.insert("audienceOrigin".into(), json!(origin));
    }
    if let Some(viewers) = audience.embedded_viewers.filter(|_| embedded) {
        details.insert("embeddedViewers".into(), json!(viewers));
    }
    if let Some(title) = audience.title {
        details.insert("title".into(), json!(title));
    }
    if let Some(started_at) = audience.started_at {
        details.insert("startedAt".into(), json!(started_at));
    }
    ChannelCounts {
        viewers,
        followers: None,
        live: Some(audience.live),
        details,
    }
}
