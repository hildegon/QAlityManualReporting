use anyhow::{bail, Context, Result};
use reqwest::Client;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Emitter;
use tokio::sync::Mutex;

use super::common::{rate_limit_until_ms, truncate_body};
use crate::models::xray::{GraphQLRequest, GraphQLResponse, XrayAuthRequest};

mod executions;
mod health;
mod mutations;
mod runs;
mod statuses;
mod test_plans;
mod test_sets;
mod tests;

const XRAY_AUTH_URL: &str = "https://xray.cloud.getxray.app/api/v2/authenticate";
const XRAY_GRAPHQL_URL: &str = "https://xray.cloud.getxray.app/api/v2/graphql";

/// Thread-safe Xray Cloud client with token caching.
/// Cloning is cheap — the token cache is shared via `Arc`.
#[derive(Clone)]
pub struct XrayClient {
    client: Client,
    client_id: String,
    client_secret: String,
    /// Cached bearer token — refreshed on 401 or on explicit call.
    token: Arc<Mutex<Option<String>>>,
    /// Tauri app handle for emitting events to the frontend.
    app_handle: Option<tauri::AppHandle>,
}

impl XrayClient {
    pub fn new(client_id: String, client_secret: String) -> Self {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .expect("Failed to build HTTP client");
        Self {
            client,
            client_id,
            client_secret,
            token: Arc::new(Mutex::new(None)),
            app_handle: None,
        }
    }

    /// Attach a Tauri `AppHandle` so the client can emit events (e.g. rate-limit
    /// notifications) to the frontend.
    pub fn with_app_handle(mut self, handle: tauri::AppHandle) -> Self {
        self.app_handle = Some(handle);
        self
    }

    /// Exchange client_id/client_secret for a Bearer token and cache it.
    pub async fn authenticate(&self) -> Result<()> {
        let body = XrayAuthRequest {
            client_id: self.client_id.clone(),
            client_secret: self.client_secret.clone(),
        };

        let response = self
            .client
            .post(XRAY_AUTH_URL)
            .json(&body)
            .send()
            .await
            .context("Failed to reach Xray authentication endpoint")?
            .error_for_status()
            .context("Xray authentication returned error status")?
            .text()
            .await
            .context("Failed to read Xray auth response")?;

        // Xray returns the token as a quoted JSON string: "\"<token>\""
        let token = response.trim().trim_matches('"').to_owned();
        *self.token.lock().await = Some(token);
        Ok(())
    }

    /// Get the cached token, authenticating if not yet available.
    async fn get_token(&self) -> Result<String> {
        {
            let guard = self.token.lock().await;
            if let Some(ref t) = *guard {
                return Ok(t.clone());
            }
        }
        self.authenticate().await?;
        let guard = self.token.lock().await;
        guard.clone().context("Token missing after authentication")
    }

    /// Execute a GraphQL query against the Xray Cloud API.
    ///
    /// Retry behaviour:
    /// - **401 Unauthorized** – clears the cached token and retries once.
    /// - **429 Too Many Requests** – sleeps until the rate-limit window resets
    ///   (honouring `X-RateLimit-Reset` / `Retry-After` headers, defaulting to
    ///   30 s) and retries indefinitely until the request succeeds.
    pub(super) async fn graphql<T: serde::de::DeserializeOwned>(
        &self,
        query: &str,
        variables: serde_json::Value,
    ) -> Result<T> {
        let body = GraphQLRequest {
            query: query.to_owned(),
            variables,
        };

        let mut auth_retried = false;

        loop {
            let token = self.get_token().await?;
            let resp = self
                .client
                .post(XRAY_GRAPHQL_URL)
                .bearer_auth(&token)
                .json(&body)
                .send()
                .await
                .context("Failed to send Xray GraphQL request")?;

            let status = resp.status();

            // ── 401: refresh token and retry once ────────────────────────────
            if status == reqwest::StatusCode::UNAUTHORIZED {
                if auth_retried {
                    bail!("Xray authentication failed after token refresh");
                }
                auth_retried = true;
                *self.token.lock().await = None;
                continue;
            }

            // ── 429: notify the frontend, then sleep until the window resets ──
            if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
                let until_ms = rate_limit_until_ms(resp.headers()).unwrap_or_else(|| {
                    let now = SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis() as u64;
                    now + 30_000
                });
                // Emit event so the frontend can show the rate-limit banner.
                if let Some(ref handle) = self.app_handle {
                    let _ = handle.emit(
                        "xray:rate-limited",
                        serde_json::json!({ "until_ms": until_ms }),
                    );
                }
                let now_ms = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as u64;
                let wait_ms = until_ms.saturating_sub(now_ms) + 1_000;
                tokio::time::sleep(tokio::time::Duration::from_millis(wait_ms)).await;
                continue;
            }

            let raw_body = resp
                .text()
                .await
                .context("Failed to read Xray GraphQL response body")?;

            if !status.is_success() {
                bail!(
                    "Xray GraphQL request failed with status {status}: {}",
                    truncate_body(&raw_body)
                );
            }

            // Parse into a raw-value response first so we can check errors
            // before attempting to deserialize the typed data field.
            let gql: GraphQLResponse<serde_json::Value> = serde_json::from_str(&raw_body)
                .with_context(|| {
                    format!(
                        "Failed to parse Xray GraphQL response (status {status}). Body snippet: {}",
                        truncate_body(&raw_body)
                    )
                })?;

            // Surface GraphQL application-level errors before attempting
            // to deserialize the data payload.
            if let Some(errors) = gql.errors {
                let messages: Vec<_> = errors.iter().map(|e| e.message.as_str()).collect();
                bail!("Xray GraphQL errors: {}", messages.join("; "));
            }

            let data = gql
                .data
                .context("Xray GraphQL response contained no data")?;
            let typed: T = serde_json::from_value(data).with_context(|| {
                format!(
                    "Failed to deserialize Xray GraphQL data. Body snippet: {}",
                    truncate_body(&raw_body)
                )
            })?;
            return Ok(typed);
        }
    }

    /// Fetch an evidence/attachment file from Xray Cloud and return it as a
    /// `data:<mime>;base64,<content>` URI that can be used directly in `<img src>`.
    ///
    /// Only URLs on the Xray Cloud domain (`xray.cloud.getxray.app`) are allowed
    /// to prevent SSRF leaks.
    pub async fn fetch_evidence_as_data_uri(
        &self,
        download_url: &str,
        mime_type: &str,
    ) -> Result<String> {
        use base64::{engine::general_purpose::STANDARD, Engine};

        if !download_url.starts_with("https://xray.cloud.getxray.app/") {
            bail!(
                "Evidence URL must belong to Xray Cloud (expected prefix 'https://xray.cloud.getxray.app/')"
            );
        }

        let token = self.get_token().await?;
        let bytes = self
            .client
            .get(download_url)
            .bearer_auth(&token)
            .send()
            .await
            .context("Failed to fetch Xray evidence")?
            .error_for_status()
            .context("Xray evidence fetch returned an error status")?
            .bytes()
            .await
            .context("Failed to read evidence bytes")?;

        let b64 = STANDARD.encode(&bytes);
        Ok(format!("data:{mime_type};base64,{b64}"))
    }
}
