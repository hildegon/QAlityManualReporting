#![allow(dead_code)]
use reqwest::Client;

use super::common::check_rate_limit;
use crate::state::TrackedUsage;

mod attachments;
mod auth;
mod issues;
mod links;
mod projects;
mod transitions;
mod versions;

pub struct JiraClient {
    pub(super) client: Client,
    pub(super) base_url: String,
    /// Jira Cloud uses Basic auth: base64(email:api_token)
    pub(super) auth_header: String,
    /// Shared API-usage counter updated on every HTTP response.
    pub(super) usage: TrackedUsage,
}

impl JiraClient {
    pub fn new(
        base_url: String,
        email: String,
        api_token: String,
        usage: TrackedUsage,
    ) -> Self {
        use base64::{engine::general_purpose::STANDARD, Engine};
        let credentials = STANDARD.encode(format!("{email}:{api_token}"));
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .expect("Failed to build HTTP client");
        Self {
            client,
            base_url: base_url.trim_end_matches('/').to_owned(),
            auth_header: format!("Basic {credentials}"),
            usage,
        }
    }

    /// Record an API call in the usage counter then delegate to
    /// `check_rate_limit` for 429 handling.
    pub(super) fn track_response(
        &self,
        resp: reqwest::Response,
    ) -> anyhow::Result<reqwest::Response> {
        if resp.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
            self.usage.record_rate_limit(resp.headers());
        } else {
            self.usage.record_call(resp.headers());
        }
        check_rate_limit(resp)
    }
}
