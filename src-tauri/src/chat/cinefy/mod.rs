mod adapter;
mod audience;
mod domain;
mod ports;

pub(crate) use adapter::run;
#[cfg(test)]
pub(crate) use audience::AudienceOrigin;
pub(crate) use audience::{normalize_slug, AudiencePoller, AudienceSnapshot, AudienceStatus};
pub(crate) use domain::{ConnectionStatus, Event};
pub(crate) use ports::OutputPort;
