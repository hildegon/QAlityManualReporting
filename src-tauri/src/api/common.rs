/// Shared utility functions used by both `JiraClient` and `XrayClient`.
use anyhow::{bail, Result};
use std::time::{SystemTime, UNIX_EPOCH};

#[cfg(test)]
mod tests {
    use super::*;
    use reqwest::header::{HeaderMap, HeaderValue};

    // ── validate_project_key ──────────────────────────────────────────────────

    #[test]
    fn validate_project_key_accepts_uppercase_letters() {
        assert!(validate_project_key("PROJ").is_ok());
        assert!(validate_project_key("MYPROJECT").is_ok());
    }

    #[test]
    fn validate_project_key_accepts_digits_and_underscores() {
        assert!(validate_project_key("PROJ123").is_ok());
        assert!(validate_project_key("MY_PROJECT").is_ok());
        assert!(validate_project_key("P1_2").is_ok());
    }

    #[test]
    fn validate_project_key_rejects_empty_string() {
        let err = validate_project_key("").unwrap_err();
        assert!(err.to_string().contains("empty"));
    }

    #[test]
    fn validate_project_key_rejects_lowercase() {
        assert!(validate_project_key("proj").is_err());
        assert!(validate_project_key("Proj").is_err());
    }

    #[test]
    fn validate_project_key_rejects_special_characters() {
        assert!(validate_project_key("PROJ-1").is_err());
        assert!(validate_project_key("PROJ.1").is_err());
        assert!(validate_project_key("'; DROP TABLE--").is_err());
    }

    // ── escape_jql_string ─────────────────────────────────────────────────────

    #[test]
    fn escape_jql_string_leaves_plain_strings_unchanged() {
        assert_eq!(escape_jql_string("hello world"), "hello world");
        assert_eq!(escape_jql_string(""), "");
    }

    #[test]
    fn escape_jql_string_escapes_double_quotes() {
        assert_eq!(escape_jql_string(r#"say "hello""#), r#"say \"hello\""#);
    }

    #[test]
    fn escape_jql_string_handles_multiple_quotes() {
        // Two consecutive double-quotes → each escaped independently.
        assert_eq!(escape_jql_string(r#""""#), r#"\"\""#);
    }

    // ── truncate_body ─────────────────────────────────────────────────────────

    #[test]
    fn truncate_body_leaves_short_strings_unchanged() {
        assert_eq!(truncate_body("hello"), "hello");
        assert_eq!(truncate_body(""), "");
    }

    #[test]
    fn truncate_body_leaves_exactly_200_char_string_unchanged() {
        let s: String = "a".repeat(200);
        assert_eq!(truncate_body(&s).len(), 200);
    }

    #[test]
    fn truncate_body_truncates_strings_longer_than_200_chars() {
        let s: String = "a".repeat(300);
        let result = truncate_body(&s);
        assert!(result.len() <= 200);
    }

    #[test]
    fn truncate_body_produces_valid_utf8_on_multibyte_chars() {
        // Each '日' is 3 bytes; 67 of them = 201 bytes — just over the 200-byte limit.
        let s: String = "日".repeat(67);
        let result = truncate_body(&s);
        assert!(std::str::from_utf8(result.as_bytes()).is_ok());
    }

    // ── rate_limit_until_ms ───────────────────────────────────────────────────

    #[test]
    fn rate_limit_until_ms_returns_none_for_empty_headers() {
        let headers = HeaderMap::new();
        assert!(rate_limit_until_ms(&headers).is_none());
    }

    #[test]
    fn rate_limit_until_ms_parses_x_ratelimit_reset() {
        let mut headers = HeaderMap::new();
        headers.insert(
            "x-ratelimit-reset",
            HeaderValue::from_static("1700000000"),
        );
        let result = rate_limit_until_ms(&headers).unwrap();
        assert_eq!(result, 1_700_000_000_000u64);
    }

    #[test]
    fn rate_limit_until_ms_falls_back_to_retry_after() {
        let mut headers = HeaderMap::new();
        headers.insert("retry-after", HeaderValue::from_static("60"));
        let result = rate_limit_until_ms(&headers).unwrap();
        let now_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;
        // Should be roughly now + 60 seconds, allow ±2s for test execution time.
        assert!(result >= now_ms + 58_000);
        assert!(result <= now_ms + 62_000);
    }

    #[test]
    fn rate_limit_until_ms_returns_none_for_non_numeric_header() {
        let mut headers = HeaderMap::new();
        headers.insert("x-ratelimit-reset", HeaderValue::from_static("not-a-number"));
        headers.insert("retry-after", HeaderValue::from_static("also-bad"));
        assert!(rate_limit_until_ms(&headers).is_none());
    }

    #[test]
    fn rate_limit_until_ms_prefers_x_ratelimit_reset_over_retry_after() {
        let mut headers = HeaderMap::new();
        headers.insert("x-ratelimit-reset", HeaderValue::from_static("2000000000"));
        headers.insert("retry-after", HeaderValue::from_static("1"));
        let result = rate_limit_until_ms(&headers).unwrap();
        // Must come from X-RateLimit-Reset (absolute epoch), not Retry-After (relative).
        assert_eq!(result, 2_000_000_000_000u64);
    }
}

/// Validate that a Jira project key contains only safe characters (`[A-Z0-9_]+`).
///
/// Jira enforces this format server-side, but we validate early to prevent
/// JQL injection attacks.
pub(crate) fn validate_project_key(key: &str) -> Result<()> {
    if key.is_empty() {
        bail!("Project key must not be empty");
    }
    if !key
        .chars()
        .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '_')
    {
        bail!(
            "Invalid project key '{}': must contain only uppercase letters, digits, or underscores",
            key
        );
    }
    Ok(())
}

/// Escape a string for safe embedding inside a double-quoted JQL literal.
///
/// Doubles any `"` characters so they become `\"` within the JQL string.
pub(super) fn escape_jql_string(value: &str) -> String {
    value.replace('"', "\\\"")
}

/// Truncate a response body string for safe inclusion in error messages.
///
/// Limits the snippet to 200 characters to avoid leaking large sensitive
/// payloads into error strings that propagate to the frontend.
pub(super) fn truncate_body(body: &str) -> &str {
    const MAX: usize = 200;
    if body.len() <= MAX {
        body
    } else {
        // Truncate at a char boundary.
        &body[..body
            .char_indices()
            .take_while(|(i, _)| *i < MAX)
            .last()
            .map(|(i, c)| i + c.len_utf8())
            .unwrap_or(MAX)]
    }
}

/// Parse rate-limit headers from a 429 response and return the epoch-millisecond
/// timestamp at which the block is expected to lift.
///
/// Precedence (both headers may be absent on some 429s):
/// 1. `X-RateLimit-Reset` — Unix epoch **seconds** (absolute timestamp).
/// 2. `Retry-After`       — delay in **seconds** from now.
///
/// Returns `None` if neither header is present or parseable.
pub(super) fn rate_limit_until_ms(headers: &reqwest::header::HeaderMap) -> Option<u64> {
    // X-RateLimit-Reset: absolute Unix timestamp in seconds.
    if let Some(val) = headers.get("x-ratelimit-reset") {
        if let Ok(s) = val.to_str() {
            if let Ok(secs) = s.trim().parse::<u64>() {
                return Some(secs * 1_000);
            }
        }
    }
    // Retry-After: relative delay in seconds.
    if let Some(val) = headers.get("retry-after") {
        if let Ok(s) = val.to_str() {
            if let Ok(delay_secs) = s.trim().parse::<u64>() {
                let now_ms = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as u64;
                return Some(now_ms + delay_secs * 1_000);
            }
        }
    }
    None
}

/// Check a response for a 429 (rate-limited) status before consuming it with
/// `error_for_status`.  Returns `Ok(response)` unchanged if not rate-limited.
///
/// The error message uses the `RATE_LIMITED:<epoch_ms>` format understood by
/// the frontend's `parseRateLimitError` helper.
pub(super) fn check_rate_limit(resp: reqwest::Response) -> Result<reqwest::Response> {
    if resp.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
        match rate_limit_until_ms(resp.headers()) {
            Some(until_ms) => bail!("RATE_LIMITED:{until_ms}"),
            None => bail!("RATE_LIMITED"),
        }
    }
    Ok(resp)
}
