//! Only allowlisted Google error codes cross the HTTP boundary; never provider text or URLs.

use crate::i18n::Msg;
use serde_json::Value;
use std::io::Read;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum GoogleReason {
    BroadcastMissing,
    StreamMissing,
    InvalidTransition,
    RedundantTransition,
    Quota,
    Permission,
    StreamingDisabled,
    Backend,
    Unknown,
}

impl GoogleReason {
    fn parse(reason: &str) -> Self {
        match reason {
            "liveBroadcastNotFound" => Self::BroadcastMissing,
            "liveStreamNotFound" => Self::StreamMissing,
            "invalidTransition" => Self::InvalidTransition,
            "redundantTransition" => Self::RedundantTransition,
            "quotaExceeded" | "rateLimitExceeded" | "userRequestsExceedRateLimit" => Self::Quota,
            "insufficientPermissions" | "insufficientLivePermissions" | "forbidden" => {
                Self::Permission
            }
            "liveStreamingNotEnabled" | "livePermissionBlocked" => Self::StreamingDisabled,
            "backendError" | "internalError" | "errorExecutingTransition" => Self::Backend,
            _ => Self::Unknown,
        }
    }

    pub(super) fn code(self) -> &'static str {
        match self {
            Self::BroadcastMissing => "liveBroadcastNotFound",
            Self::StreamMissing => "liveStreamNotFound",
            Self::InvalidTransition => "invalidTransition",
            Self::RedundantTransition => "redundantTransition",
            Self::Quota => "quotaExceeded",
            Self::Permission => "insufficientPermissions",
            Self::StreamingDisabled => "liveStreamingNotEnabled",
            Self::Backend => "backendError",
            Self::Unknown => "requestFailed",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum GoogleError {
    Http { status: u16, reason: GoogleReason },
    Transport,
    InvalidResponse,
}

impl GoogleError {
    pub(super) fn response(status: u16, reader: impl Read) -> Self {
        // Errors can contain reflected request data. Bound parsing and discard every free-text field.
        let mut bytes = Vec::new();
        let reason = if reader.take(16 * 1024 + 1).read_to_end(&mut bytes).is_ok()
            && bytes.len() <= 16 * 1024
        {
            serde_json::from_slice::<Value>(&bytes)
                .ok()
                .and_then(|value| {
                    value
                        .pointer("/error/errors/0/reason")?
                        .as_str()
                        .map(GoogleReason::parse)
                })
                .unwrap_or(GoogleReason::Unknown)
        } else {
            GoogleReason::Unknown
        };
        Self::Http { status, reason }
    }

    pub(super) fn is_missing_broadcast(self) -> bool {
        self == Self::Http {
            status: 404,
            reason: GoogleReason::BroadcastMissing,
        }
    }

    pub(super) fn is_missing_stream(self) -> bool {
        self == Self::Http {
            status: 404,
            reason: GoogleReason::StreamMissing,
        }
    }

    pub(super) fn retryable(self) -> bool {
        match self {
            Self::Transport | Self::InvalidResponse => true,
            Self::Http { status, reason } => {
                matches!(status, 408 | 429 | 500..=599)
                    || matches!(reason, GoogleReason::Quota | GoogleReason::Backend)
            }
        }
    }

    pub(super) fn creation_outcome_unknown(self) -> bool {
        matches!(
            self,
            Self::Transport
                | Self::InvalidResponse
                | Self::Http {
                    status: 408 | 500..=599,
                    ..
                }
        )
    }

    pub(super) fn message(self) -> String {
        match self {
            Self::Http { status, reason } if self.retryable() => Msg::ChatYoutubeApiTemporary {
                c: status,
                reason: reason.code(),
            }
            .now(),
            Self::Http { status, reason } => Msg::ChatYoutubeApiError {
                c: status,
                reason: reason.code(),
            }
            .now(),
            Self::Transport => Msg::ChatYoutubeTransportError.now(),
            Self::InvalidResponse => Msg::AuthYoutubeBadResponse.now(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_allowlisted_reasons_survive_provider_responses() {
        for reason in [
            "liveStreamNotFound",
            "secret-fixture=https://user:password@example.invalid/?token=fixture",
        ] {
            let body = serde_json::json!({"error": {"message": "private title token=fixture", "errors": [{"reason": reason, "message": "private address"}]}}).to_string();
            let error = GoogleError::response(404, body.as_bytes());
            let output = format!("{error:?} {}", error.message());
            for private in ["private", "fixture", "https://", "password", "token="] {
                assert!(!output.contains(private), "{output}");
            }
            assert_eq!(error.is_missing_stream(), reason == "liveStreamNotFound");
            assert!(!error.is_missing_broadcast());
        }
    }

    #[test]
    fn malformed_or_oversized_errors_never_become_missing_resources() {
        for body in ["notFound token=fixture".to_string(), "x".repeat(20_000)] {
            let error = GoogleError::response(404, body.as_bytes());
            assert_eq!(
                error,
                GoogleError::Http {
                    status: 404,
                    reason: GoogleReason::Unknown
                }
            );
        }
        assert!(GoogleError::Transport.retryable());
        assert!(GoogleError::Http {
            status: 403,
            reason: GoogleReason::Quota
        }
        .retryable());
        assert!(!GoogleError::Http {
            status: 401,
            reason: GoogleReason::Permission
        }
        .retryable());
    }
}
