//! Portas pelas quais o adaptador Cinefy conversa com o núcleo do chat.

use super::domain::{ConnectionStatus, Event};

pub(crate) trait OutputPort {
    fn status(&self, status: ConnectionStatus);
    fn publish(&self, event: Event);
}
