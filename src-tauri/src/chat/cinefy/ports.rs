use super::domain::{ConnectionStatus, Event};

pub(crate) trait OutputPort {
    fn status(&self, status: ConnectionStatus);
    fn publish(&self, event: Event);
}
