use anyhow::{Context, Result};

use crate::api::common::check_rate_limit;
use crate::models::jira::{IssueLinkType, IssueLinkTypesResponse, JiraCreatedIssue};

use super::JiraClient;

impl JiraClient {
    /// Create an issue link between two Jira issues.
    ///
    /// Uses `POST /rest/api/3/issueLink`.
    /// `link_type_name` is the **type name** as configured in Jira (not a direction label),
    /// e.g. `"Tests"` (directions: inward = "is tested by", outward = "tests").
    /// Returns 201 Created on success.
    pub async fn create_issue_link(
        &self,
        inward_issue_key: &str,
        outward_issue_key: &str,
        link_type_name: &str,
    ) -> Result<()> {
        let url = format!("{}/rest/api/3/issueLink", self.base_url);
        let body = serde_json::json!({
            "type": { "name": link_type_name },
            "inwardIssue": { "key": inward_issue_key },
            "outwardIssue": { "key": outward_issue_key },
        });

        let resp = check_rate_limit(
            self.client
                .post(&url)
                .header("Authorization", &self.auth_header)
                .header("Content-Type", "application/json")
                .header("Accept", "application/json")
                .json(&body)
                .send()
                .await
                .context("Failed to send Jira create-issue-link request")?,
        )?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp
                .text()
                .await
                .unwrap_or_else(|_| "<no response body>".to_string());
            return Err(anyhow::anyhow!(
                "Jira create-issue-link failed (HTTP {}) for '{}' → '{}': {}",
                status.as_u16(),
                inward_issue_key,
                outward_issue_key,
                body
            ));
        }

        Ok(())
    }

    /// Fetch all issue link types configured in the Jira instance.
    ///
    /// Uses `GET /rest/api/3/issueLinkType`.
    pub async fn get_issue_link_types(&self) -> Result<Vec<IssueLinkType>> {
        let url = format!("{}/rest/api/3/issueLinkType", self.base_url);
        let resp: IssueLinkTypesResponse = check_rate_limit(
            self.client
                .get(&url)
                .header("Authorization", &self.auth_header)
                .header("Accept", "application/json")
                .send()
                .await
                .context("Failed to send Jira get-issue-link-types request")?,
        )?
        .error_for_status()
        .context("Jira get-issue-link-types request returned error status")?
        .json()
        .await
        .context("Failed to parse Jira get-issue-link-types response")?;
        Ok(resp.issue_link_types)
    }

    /// Create a new Bug issue in a Jira project.
    ///
    /// Uses `POST /rest/api/3/issue`.
    /// `affected_version_id` is set as `versions` (affectedVersions) on the bug.
    /// `component_id` and `assignee_account_id` are optional.
    pub async fn create_bug(
        &self,
        project_key: &str,
        summary: &str,
        description: Option<&str>,
        affected_version_id: &str,
        component_id: Option<&str>,
        assignee_account_id: Option<&str>,
    ) -> Result<JiraCreatedIssue> {
        let url = format!("{}/rest/api/3/issue", self.base_url);

        let mut fields = serde_json::json!({
            "project": { "key": project_key },
            "summary": summary,
            "issuetype": { "name": "Bug" },
            "versions": [{ "id": affected_version_id }],
        });

        if let Some(desc) = description {
            if !desc.trim().is_empty() {
                fields["description"] = serde_json::json!({
                    "version": 1,
                    "type": "doc",
                    "content": [{
                        "type": "paragraph",
                        "content": [{ "type": "text", "text": desc }]
                    }]
                });
            }
        }

        if let Some(comp_id) = component_id {
            if !comp_id.trim().is_empty() {
                fields["components"] = serde_json::json!([{ "id": comp_id }]);
            }
        }

        if let Some(account_id) = assignee_account_id {
            if !account_id.trim().is_empty() {
                fields["assignee"] = serde_json::json!({ "accountId": account_id });
            }
        }

        let body = serde_json::json!({ "fields": fields });

        let resp = check_rate_limit(
            self.client
                .post(&url)
                .header("Authorization", &self.auth_header)
                .header("Content-Type", "application/json")
                .header("Accept", "application/json")
                .json(&body)
                .send()
                .await
                .context("Failed to send Jira create-bug request")?,
        )?;

        let status = resp.status();
        if !status.is_success() {
            let text = resp
                .text()
                .await
                .unwrap_or_else(|_| "<no body>".to_string());
            return Err(anyhow::anyhow!(
                "Jira create-bug failed (HTTP {}) for project '{}': {}",
                status.as_u16(),
                project_key,
                text
            ));
        }

        resp.json::<JiraCreatedIssue>()
            .await
            .context("Failed to parse Jira create-bug response")
    }
}
