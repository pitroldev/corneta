//! Delivers Cinefy adapter events to the shared chat runtime.

use crate::chat::{
    chat_status_gen, delete_message, emit_chat_gen, next_id, now_ms, text_frag, ChatBadge,
    ChatMessage, CHAT_GEN,
};
use std::sync::atomic::Ordering;
use tauri::AppHandle;

pub(super) struct CinefySink {
    pub app: AppHandle,
    pub source: String,
    pub gen: u64,
}

impl super::OutputPort for CinefySink {
    fn status(&self, status: super::ConnectionStatus) {
        let status = match status {
            super::ConnectionStatus::Connected => "connected",
            super::ConnectionStatus::Disconnected => "disconnected",
            super::ConnectionStatus::Error => "error",
        };
        chat_status_gen(&self.app, self.gen, "cinefy", &self.source, status);
    }

    fn publish(&self, event: super::Event) {
        if CHAT_GEN.load(Ordering::SeqCst) != self.gen {
            return;
        }
        match event {
            super::Event::Message(message) => {
                let text = message.text;
                emit_chat_gen(
                    &self.app,
                    self.gen,
                    ChatMessage {
                        id: next_id(),
                        platform: "cinefy".into(),
                        source: self.source.clone(),
                        author: message.author,
                        author_id: message.author_id,
                        native_id: Some(message.native_id),
                        color: message.color,
                        fragments: vec![text_frag(&text)],
                        badges: message
                            .badges
                            .into_iter()
                            .map(|badge| ChatBadge {
                                label: badge.label,
                                kind: badge.kind,
                                title: badge.title,
                                ..Default::default()
                            })
                            .collect(),
                        text,
                        ts: if message.published_at_ms == 0 {
                            now_ms()
                        } else {
                            message.published_at_ms
                        },
                        ..Default::default()
                    },
                );
            }
            super::Event::DeleteMessage { native_id } => {
                delete_message(&self.app, "cinefy", &native_id);
            }
        }
    }
}
