#![allow(dead_code)]
use reqwest::Client;

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
}

impl JiraClient {
    pub fn new(base_url: String, email: String, api_token: String) -> Self {
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
        }
    }
}
