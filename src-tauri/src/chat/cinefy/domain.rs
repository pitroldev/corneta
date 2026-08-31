//! Tipos do domínio do conector Cinefy.
//!
//! Eles não conhecem Tauri, WebSocket, HTTP nem o formato de eventos da interface.

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct Badge {
    pub label: String,
    pub kind: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct ChatMessage {
    pub native_id: String,
    pub author: String,
    pub author_id: Option<String>,
    pub color: Option<String>,
    pub text: String,
    pub badges: Vec<Badge>,
    pub published_at_ms: u64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum Event {
    Message(ChatMessage),
    DeleteMessage { native_id: String },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum ConnectionStatus {
    Connected,
    Disconnected,
    Error,
}
