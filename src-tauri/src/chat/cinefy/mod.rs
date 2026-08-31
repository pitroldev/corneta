//! Integração hexagonal da Cinefy.
//!
//! `adapter` contém todos os detalhes instáveis da API/Pusher. O restante da aplicação
//! depende somente dos tipos de domínio e da porta de saída expostos aqui.

mod adapter;
mod domain;
mod ports;

pub(crate) use adapter::run;
pub(crate) use domain::{ConnectionStatus, Event};
pub(crate) use ports::OutputPort;
