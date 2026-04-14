use anyhow::{Context, Result};

use crate::api::common::{validate_issue_key};
use crate::models::jira::{JiraTransition, JiraTransitionsResponse};

use super::JiraClient;

impl JiraClient {
    /// Fetch the available workflow transitions for a Jira issue.
    ///
    /// Uses `GET /rest/api/3/issue/{key}/transitions`.
    pub async fn get_issue_transitions(&self, issue_key: &str) -> Result<Vec<JiraTransition>> {
        validate_issue_key(issue_key)?;
        let url = format!(
            "{}/rest/api/3/issue/{}/transitions",
            self.base_url,
            issue_key.trim(),
        );

        let resp: JiraTransitionsResponse = self.track_response(
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
        validate_issue_key(issue_key)?;
        let url = format!(
            "{}/rest/api/3/issue/{}/transitions",
            self.base_url,
            issue_key.trim(),
        );
        let body = serde_json::json!({ "transition": { "id": transition_id } });

        self.track_response(
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
}
