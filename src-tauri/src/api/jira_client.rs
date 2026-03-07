#![allow(dead_code)]
use anyhow::{bail, Context, Result};
use reqwest::Client;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::models::jira::{
    JiraComponent, JiraIssue, JiraProject, JiraProjectsResponse, JiraTransition,
    JiraTransitionsResponse, JiraUserSearchResult,
};

/// Check a response for 429 (rate-limited) before consuming it with `error_for_status`.
/// Returns `Ok(response)` unchanged if the status is not 429.
fn check_rate_limit(resp: reqwest::Response) -> Result<reqwest::Response> {
    if resp.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
        // X-RateLimit-Reset: absolute Unix timestamp in seconds.
        if let Some(val) = resp.headers().get("x-ratelimit-reset") {
            if let Ok(s) = val.to_str() {
                if let Ok(secs) = s.trim().parse::<u64>() {
                    bail!("RATE_LIMITED:{}", secs * 1_000);
                }
            }
        }
        // Retry-After: relative delay in seconds.
        if let Some(val) = resp.headers().get("retry-after") {
            if let Ok(s) = val.to_str() {
                if let Ok(delay_secs) = s.trim().parse::<u64>() {
                    let now_ms = SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis() as u64;
                    bail!("RATE_LIMITED:{}", now_ms + delay_secs * 1_000);
                }
            }
        }
        bail!("RATE_LIMITED");
    }
    Ok(resp)
}

pub struct JiraClient {
    client: Client,
    base_url: String,
    /// Jira Cloud uses Basic auth: base64(email:api_token)
    auth_header: String,
}

impl JiraClient {
    pub fn new(base_url: String, email: String, api_token: String) -> Self {
        use base64::{engine::general_purpose::STANDARD, Engine};
        let credentials = STANDARD.encode(format!("{email}:{api_token}"));
        Self {
            client: Client::new(),
            base_url: base_url.trim_end_matches('/').to_owned(),
            auth_header: format!("Basic {credentials}"),
        }
    }

    /// Fetch all accessible Jira projects (paginated, collects all pages).
    pub async fn get_projects(&self) -> Result<Vec<JiraProject>> {
        let mut all_projects = Vec::new();
        let mut start_at = 0u32;
        let max_results = 50u32;

        loop {
            let url = format!(
                "{}/rest/api/3/project/search?startAt={}&maxResults={}&orderBy=name",
                self.base_url, start_at, max_results,
            );

            let response: JiraProjectsResponse = check_rate_limit(
                self.client
                    .get(&url)
                    .header("Authorization", &self.auth_header)
                    .header("Accept", "application/json")
                    .send()
                    .await
                    .context("Failed to send Jira projects request")?,
            )?
            .error_for_status()
            .context("Jira projects request returned error status")?
            .json()
            .await
            .context("Failed to parse Jira projects response")?;

            all_projects.extend(response.values);

            if response.is_last {
                break;
            }
            start_at += max_results;
        }

        Ok(all_projects)
    }

    /// Fetch a single project by its key (e.g. "PROJ") and return it.
    /// Uses the direct project endpoint which is faster than paginating all projects.
    pub async fn get_project(&self, project_key: &str) -> Result<JiraProject> {
        let url = format!(
            "{}/rest/api/3/project/{}",
            self.base_url,
            project_key.trim(),
        );

        check_rate_limit(
            self.client
                .get(&url)
                .header("Authorization", &self.auth_header)
                .header("Accept", "application/json")
                .send()
                .await
                .context("Failed to send Jira project request")?,
        )?
        .error_for_status()
        .with_context(|| format!("Jira project '{}' not found or not accessible", project_key))?
        .json()
        .await
        .context("Failed to parse Jira project response")
    }

    /// Fetch a single Jira issue by key (e.g. "PROJ-123").
    pub async fn get_issue(&self, issue_key: &str) -> Result<JiraIssue> {
        let url = format!(
            "{}/rest/api/3/issue/{}?fields=summary,status,assignee,priority,issuetype",
            self.base_url, issue_key,
        );

        check_rate_limit(
            self.client
                .get(&url)
                .header("Authorization", &self.auth_header)
                .header("Accept", "application/json")
                .send()
                .await
                .context("Failed to send Jira issue request")?,
        )?
        .error_for_status()
        .context("Jira issue request returned error status")?
        .json()
        .await
        .context("Failed to parse Jira issue response")
    }

    /// Fetch all components for a given Jira project key or numeric ID.
    pub async fn get_project_components(&self, project_key: &str) -> Result<Vec<JiraComponent>> {
        let url = format!(
            "{}/rest/api/3/project/{}/components",
            self.base_url,
            project_key.trim(),
        );

        check_rate_limit(
            self.client
                .get(&url)
                .header("Authorization", &self.auth_header)
                .header("Accept", "application/json")
                .send()
                .await
                .context("Failed to send Jira project components request")?,
        )?
        .error_for_status()
        .with_context(|| {
            format!(
                "Jira project components request failed for '{}'",
                project_key
            )
        })?
        .json()
        .await
        .context("Failed to parse Jira project components response")
    }

    /// Validate the credentials by fetching the current user.
    pub async fn validate_credentials(&self) -> Result<String> {
        let url = format!("{}/rest/api/3/myself", self.base_url);
        let value: serde_json::Value = check_rate_limit(
            self.client
                .get(&url)
                .header("Authorization", &self.auth_header)
                .header("Accept", "application/json")
                .send()
                .await
                .context("Failed to reach Jira")?,
        )?
        .error_for_status()
        .context("Jira credential validation failed")?
        .json()
        .await
        .context("Failed to parse Jira /myself response")?;

        Ok(value["displayName"]
            .as_str()
            .unwrap_or("Unknown")
            .to_owned())
    }

    /// Fetch the available workflow transitions for a Jira issue.
    ///
    /// Uses `GET /rest/api/3/issue/{key}/transitions`.
    pub async fn get_issue_transitions(&self, issue_key: &str) -> Result<Vec<JiraTransition>> {
        let url = format!(
            "{}/rest/api/3/issue/{}/transitions",
            self.base_url,
            issue_key.trim(),
        );

        let resp: JiraTransitionsResponse = check_rate_limit(
            self.client
                .get(&url)
                .header("Authorization", &self.auth_header)
                .header("Accept", "application/json")
                .send()
                .await
                .context("Failed to send Jira transitions request")?,
        )?
        .error_for_status()
        .with_context(|| format!("Jira transitions request failed for '{}'", issue_key))?
        .json()
        .await
        .context("Failed to parse Jira transitions response")?;

        Ok(resp.transitions)
    }

    /// Apply a workflow transition to a Jira issue.
    ///
    /// Uses `POST /rest/api/3/issue/{key}/transitions` with body `{"transition":{"id":"<id>"}}`.
    /// Returns 204 No Content on success.
    pub async fn transition_issue(&self, issue_key: &str, transition_id: &str) -> Result<()> {
        let url = format!(
            "{}/rest/api/3/issue/{}/transitions",
            self.base_url,
            issue_key.trim(),
        );
        let body = serde_json::json!({ "transition": { "id": transition_id } });

        check_rate_limit(
            self.client
                .post(&url)
                .header("Authorization", &self.auth_header)
                .header("Content-Type", "application/json")
                .json(&body)
                .send()
                .await
                .context("Failed to send Jira transition request")?,
        )?
        .error_for_status()
        .with_context(|| {
            format!(
                "Jira transition '{}' on '{}' failed",
                transition_id, issue_key
            )
        })?;

        Ok(())
    }

    /// Update the assignee of a Jira issue.
    ///
    /// Uses `PUT /rest/api/3/issue/{key}/assignee` with body `{"accountId":"<id>"}`.
    /// Pass `account_id = None` to unassign.
    /// Returns 204 No Content on success.
    pub async fn update_assignee(&self, issue_key: &str, account_id: Option<&str>) -> Result<()> {
        let url = format!(
            "{}/rest/api/3/issue/{}/assignee",
            self.base_url,
            issue_key.trim(),
        );
        let body = match account_id {
            Some(id) => serde_json::json!({ "accountId": id }),
            None => serde_json::json!({ "accountId": serde_json::Value::Null }),
        };

        check_rate_limit(
            self.client
                .put(&url)
                .header("Authorization", &self.auth_header)
                .header("Content-Type", "application/json")
                .json(&body)
                .send()
                .await
                .context("Failed to send Jira update-assignee request")?,
        )?
        .error_for_status()
        .with_context(|| format!("Jira update-assignee request failed for '{}'", issue_key))?;

        Ok(())
    }

    /// Search Jira users by display name or email (up to 20 results).
    ///
    /// Uses `GET /rest/api/3/user/search?query=<q>&maxResults=20`.
    pub async fn search_users(&self, query: &str) -> Result<Vec<JiraUserSearchResult>> {
        let url = format!("{}/rest/api/3/user/search", self.base_url);

        check_rate_limit(
            self.client
                .get(&url)
                .query(&[("query", query), ("maxResults", "20")])
                .header("Authorization", &self.auth_header)
                .header("Accept", "application/json")
                .send()
                .await
                .context("Failed to send Jira user search request")?,
        )?
        .error_for_status()
        .context("Jira user search request failed")?
        .json()
        .await
        .context("Failed to parse Jira user search response")
    }
}
