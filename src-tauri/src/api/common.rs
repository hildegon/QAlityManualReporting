/// Shared utility functions used by both `JiraClient` and `XrayClient`.
use anyhow::{bail, Result};
use std::time::{SystemTime, UNIX_EPOCH};

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
