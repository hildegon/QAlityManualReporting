use anyhow::{bail, Context, Result};
use reqwest::Client;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::{Mutex, Semaphore};

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

/// Maximum number of concurrent in-flight Xray GraphQL requests.
/// Keeps us well below the Xray Cloud rate limit (~10-20 req/s).
const MAX_CONCURRENT_REQUESTS: usize = 6;

/// Thread-safe Xray Cloud client with token caching.
/// Cloning is cheap — the token cache and semaphore are shared via `Arc`.
#[derive(Clone)]
pub struct XrayClient {
    client: Client,
    client_id: String,
    client_secret: String,
    /// Cached bearer token — refreshed on 401 or on explicit call.
    token: Arc<Mutex<Option<String>>>,
    /// Limits how many GraphQL requests can be in-flight at once.
    request_semaphore: Arc<Semaphore>,
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
            request_semaphore: Arc::new(Semaphore::new(MAX_CONCURRENT_REQUESTS)),
        }
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
    /// Concurrency is limited by the shared semaphore so multiple callers
    /// (e.g. parallel status enrichment) don't overwhelm the API.
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
            // Acquire a permit before sending the request.
            let _permit = self
                .request_semaphore
                .acquire()
                .await
                .context("Request semaphore closed")?;

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
                // Drop permit before sleeping/retrying.
                drop(_permit);
                if auth_retried {
                    bail!("Xray authentication failed after token refresh");
                }
                auth_retried = true;
                *self.token.lock().await = None;
                continue;
            }

            // ── 429: sleep until the rate-limit window resets, then retry ────
            if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
                // Drop the permit so other waiters don't queue behind our sleep.
                drop(_permit);
                let wait_ms = match rate_limit_until_ms(resp.headers()) {
                    Some(until_ms) => {
                        let now_ms = SystemTime::now()
                            .duration_since(UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_millis() as u64;
                        // Add a 1 s buffer so we don't hit the boundary.
                        until_ms.saturating_sub(now_ms) + 1_000
                    }
                    // No header — wait 30 s as a safe default.
                    None => 30_000,
                };
                tokio::time::sleep(tokio::time::Duration::from_millis(wait_ms)).await;
                continue;
            }

            let raw_body = resp
                .text()
                .await
                .context("Failed to read Xray GraphQL response body")?;

            // Release the permit before doing CPU-bound parsing.
            drop(_permit);

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
}
