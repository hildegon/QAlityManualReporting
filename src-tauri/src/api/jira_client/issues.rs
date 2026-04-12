use anyhow::{Context, Result};

use crate::api::common::{check_rate_limit, validate_issue_key};
use crate::models::jira::JiraIssue;

use super::JiraClient;

impl JiraClient {
    /// Fetch a single Jira issue by key (e.g. "PROJ-123").
    pub async fn get_issue(&self, issue_key: &str) -> Result<JiraIssue> {
        validate_issue_key(issue_key)?;
        let url = format!(
            "{}/rest/api/3/issue/{}?fields=summary,status,assignee,priority,issuetype,description,attachment,comment",
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

    /// Update the summary (name) of any Jira issue.
    ///
    /// Works for Test Plans, Test Sets, Test Executions — all are Jira issues.
    /// Uses `PUT /rest/api/3/issue/{key}` with body `{"fields":{"summary":"…"}}`.
    /// Returns 204 No Content on success.
    pub async fn update_issue_summary(&self, issue_key: &str, summary: &str) -> Result<()> {
        validate_issue_key(issue_key)?;
        let url = format!("{}/rest/api/3/issue/{}", self.base_url, issue_key.trim(),);
        let body = serde_json::json!({ "fields": { "summary": summary } });

        check_rate_limit(
            self.client
                .put(&url)
                .header("Authorization", &self.auth_header)
                .header("Content-Type", "application/json")
                .json(&body)
                .send()
                .await
                .context("Failed to send Jira update-summary request")?,
        )?
        .error_for_status()
        .with_context(|| format!("Jira update-summary failed for '{}'", issue_key))?;

        Ok(())
    }

    /// Update the fix version(s) of any Jira issue.
    ///
    /// Replaces the existing `fixVersions` array with a single entry identified
    /// by `version_id`.  Pass an empty string for `version_id` to clear all
    /// fix versions (`fixVersions: []`).
    /// Uses `PUT /rest/api/3/issue/{key}` with body `{"fields":{"fixVersions":[{"id":"…"}]}}`.
    /// Returns 204 No Content on success.
    pub async fn update_issue_fix_version(&self, issue_key: &str, version_id: &str) -> Result<()> {
        validate_issue_key(issue_key)?;
        let url = format!("{}/rest/api/3/issue/{}", self.base_url, issue_key.trim());
        let fix_versions = if version_id.trim().is_empty() {
            serde_json::json!([])
        } else {
            serde_json::json!([{ "id": version_id.trim() }])
        };
        let body = serde_json::json!({ "fields": { "fixVersions": fix_versions } });

        check_rate_limit(
            self.client
                .put(&url)
                .header("Authorization", &self.auth_header)
                .header("Content-Type", "application/json")
                .json(&body)
                .send()
                .await
                .context("Failed to send Jira update-fix-version request")?,
        )?
        .error_for_status()
        .with_context(|| format!("Jira update-fix-version failed for '{}'", issue_key))?;

        Ok(())
    }
}
