//! Only allowlisted Google error codes cross the HTTP boundary; never provider text or URLs.

use crate::i18n::Msg;
use chrono::{DateTime, Datelike, Local, NaiveDate, TimeDelta, Utc, Weekday};
use serde_json::Value;
use std::io::Read;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum GoogleReason {
    BroadcastMissing,
    StreamMissing,
    InvalidTransition,
    RedundantTransition,
    DailyQuota,
    RateLimit,
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
            "quotaExceeded" | "dailyLimitExceeded" => Self::DailyQuota,
            "rateLimitExceeded" | "userRequestsExceedRateLimit" => Self::RateLimit,
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
            Self::DailyQuota => "quotaExceeded",
            Self::RateLimit => "rateLimitExceeded",
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
                    || matches!(
                        reason,
                        GoogleReason::DailyQuota | GoogleReason::RateLimit | GoogleReason::Backend
                    )
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
            // Retrying cannot help before the reset, so say when it comes back.
            Self::Http {
                reason: GoogleReason::DailyQuota,
                ..
            } => Msg::YoutubeDailyQuota {
                at: &next_quota_reset(Utc::now())
                    .with_timezone(&Local)
                    .format("%H:%M")
                    .to_string(),
            }
            .now(),
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

/// US daylight saving runs from 02:00 PST on the second Sunday of March to 02:00 PDT on the
/// first Sunday of November.
fn pacific_daylight_at(instant: DateTime<Utc>) -> bool {
    let sunday = |month, nth| {
        NaiveDate::from_weekday_of_month_opt(instant.year(), month, Weekday::Sun, nth)
            .expect("every month has a second Sunday")
    };
    let starts = sunday(3, 2)
        .and_hms_opt(10, 0, 0)
        .expect("valid time")
        .and_utc();
    let ends = sunday(11, 1)
        .and_hms_opt(9, 0, 0)
        .expect("valid time")
        .and_utc();
    instant >= starts && instant < ends
}

/// The YouTube Data API quota resets at midnight Pacific time.
fn next_quota_reset(now: DateTime<Utc>) -> DateTime<Utc> {
    let hours_behind = |instant| if pacific_daylight_at(instant) { 7 } else { 8 };
    let pacific_date = (now - TimeDelta::hours(hours_behind(now))).date_naive();
    let midnight = pacific_date
        .succ_opt()
        .expect("date in range")
        .and_hms_opt(0, 0, 0)
        .expect("valid time")
        .and_utc();
    // Daylight saving switches at 02:00, so midnight itself is never ambiguous.
    let daylight = midnight + TimeDelta::hours(7);
    if pacific_daylight_at(daylight) {
        daylight
    } else {
        midnight + TimeDelta::hours(8)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn daily_quota_is_told_apart_from_rate_limits() {
        for (reason, expected, code) in [
            ("quotaExceeded", GoogleReason::DailyQuota, "quotaExceeded"),
            (
                "dailyLimitExceeded",
                GoogleReason::DailyQuota,
                "quotaExceeded",
            ),
            (
                "rateLimitExceeded",
                GoogleReason::RateLimit,
                "rateLimitExceeded",
            ),
            (
                "userRequestsExceedRateLimit",
                GoogleReason::RateLimit,
                "rateLimitExceeded",
            ),
        ] {
            assert_eq!(GoogleReason::parse(reason), expected, "{reason}");
            assert_eq!(expected.code(), code);
        }
    }

    #[test]
    fn quota_resets_at_the_next_pacific_midnight() {
        let utc = |text: &str| {
            DateTime::parse_from_rfc3339(text)
                .expect("valid fixture")
                .with_timezone(&Utc)
        };
        for (now, reset) in [
            // Daylight time: midnight PDT is 07:00 UTC.
            ("2026-10-18T15:00:00Z", "2026-10-19T07:00:00Z"),
            // Standard time: midnight PST is 08:00 UTC.
            ("2026-12-01T12:00:00Z", "2026-12-02T08:00:00Z"),
            // Saturday evening before daylight saving starts on 2027-03-14 at 02:00.
            ("2027-03-14T06:00:00Z", "2027-03-14T08:00:00Z"),
            ("2027-03-14T12:00:00Z", "2027-03-15T07:00:00Z"),
            // Daylight saving ends on 2026-11-01 at 02:00 PDT.
            ("2026-10-31T20:00:00Z", "2026-11-01T07:00:00Z"),
            ("2026-11-01T12:00:00Z", "2026-11-02T08:00:00Z"),
            // Exactly at the reset, the next one is a day later.
            ("2026-10-19T07:00:00Z", "2026-10-20T07:00:00Z"),
        ] {
            assert_eq!(next_quota_reset(utc(now)), utc(reset), "now {now}");
        }
    }

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
            reason: GoogleReason::DailyQuota
        }
        .retryable());
        assert!(!GoogleError::Http {
            status: 401,
            reason: GoogleReason::Permission
        }
        .retryable());
    }
}
