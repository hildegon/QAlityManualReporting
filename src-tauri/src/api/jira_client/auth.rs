use anyhow::{Context, Result};

use crate::api::common::{validate_issue_key};
use crate::models::jira::JiraUserSearchResult;

use super::JiraClient;

impl JiraClient {
    /// Validate the credentials by fetching the current user.
    pub async fn validate_credentials(&self) -> Result<String> {
        let url = format!("{}/rest/api/3/myself", self.base_url);
        let value: serde_json::Value = self.track_response(
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

    /// Return the full profile of the authenticated Jira user.
    ///
    /// Uses `GET /rest/api/3/myself` — same endpoint as credential validation but
    /// returns the full `JiraUser` struct (account ID + display name + avatar).
    pub async fn get_current_user(&self) -> Result<JiraUserSearchResult> {
        let url = format!("{}/rest/api/3/myself", self.base_url);
        self.track_response(
            self.client
                .get(&url)
                .header("Authorization", &self.auth_header)
                .header("Accept", "application/json")
                .send()
                .await
                .context("Failed to reach Jira /myself")?,
        )?
        .error_for_status()
        .context("Jira /myself request failed")?
        .json()
        .await
        .context("Failed to parse Jira /myself response")
    }

    /// Search Jira users by display name or email (up to 20 results).
    ///
    /// Uses `GET /rest/api/3/user/search?query=<q>&maxResults=20`.
    pub async fn search_users(&self, query: &str) -> Result<Vec<JiraUserSearchResult>> {
        let url = format!("{}/rest/api/3/user/search", self.base_url);

        self.track_response(
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

    /// Fetch a Jira user's display name by account ID.
    ///
    /// Uses `GET /rest/api/3/user?accountId=<id>`.
    pub async fn get_user_display_name(&self, account_id: &str) -> Result<String> {
        let url = format!("{}/rest/api/3/user", self.base_url);

        let resp: serde_json::Value = self.track_response(
            self.client
                .get(&url)
                .query(&[("accountId", account_id)])
                .header("Authorization", &self.auth_header)
                .header("Accept", "application/json")
                .send()
                .await
                .context("Failed to send Jira get-user request")?,
        )?
        .error_for_status()
        .context("Jira get-user request failed")?
        .json()
        .await
        .context("Failed to parse Jira get-user response")?;

        resp.get("displayName")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .ok_or_else(|| anyhow::anyhow!("No displayName in Jira user response"))
    }

    /// Update the assignee of a Jira issue.
    ///
    /// Uses `PUT /rest/api/3/issue/{key}/assignee` with body `{"accountId":"<id>"}`.
    /// Pass `account_id = None` to unassign.
    /// Returns 204 No Content on success.
    pub async fn update_assignee(&self, issue_key: &str, account_id: Option<&str>) -> Result<()> {
        validate_issue_key(issue_key)?;
        let url = format!(
            "{}/rest/api/3/issue/{}/assignee",
            self.base_url,
            issue_key.trim(),
        );
        let body = match account_id {
            Some(id) => serde_json::json!({ "accountId": id }),
            None => serde_json::json!({ "accountId": serde_json::Value::Null }),
        };

        self.track_response(
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
}
