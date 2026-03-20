#![allow(dead_code)]
use anyhow::{bail, Context, Result};
use reqwest::Client;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::models::jira::{
    IssueLinkType, IssueLinkTypesResponse, JiraBug, JiraComponent, JiraCreatedIssue, JiraIssue,
    JiraProject, JiraProjectsResponse, JiraSearchResponse, JiraTransition, JiraTransitionsResponse,
    JiraUserSearchResult, JiraVersion,
};

/// Validate that a Jira project key contains only safe characters (`[A-Z0-9_]+`).
fn validate_project_key(key: &str) -> Result<()> {
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
fn escape_jql_string(value: &str) -> String {
    value.replace('"', "\\\"")
}

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

    /// Fetch bugs with `affectedVersion` matching `version_name` in the given project.
    ///
    /// Uses `POST /rest/api/3/search/jql` (enhanced search, cursor-based pagination) with JQL:
    /// `project = "{key}" AND issuetype = Bug AND affectedVersion = "{name}" ORDER BY priority ASC`
    ///
    /// Collects all pages (max 100 per page), following `nextPageToken` until `isLast` is `true`.
    pub async fn get_bugs_by_version(
        &self,
        project_key: &str,
        version_name: &str,
    ) -> Result<Vec<JiraBug>> {
        validate_project_key(project_key)?;
        let safe_version = escape_jql_string(version_name);
        let jql = format!(
            "project = \"{}\" AND issuetype = Bug AND affectedVersion = \"{}\" ORDER BY priority ASC",
            project_key, safe_version,
        );
        let url = format!("{}/rest/api/3/search/jql", self.base_url);
        let mut all_bugs: Vec<JiraBug> = Vec::new();
        let mut next_page_token: Option<String> = None;

        loop {
            let mut body = serde_json::json!({
                "jql": jql,
                "fields": ["summary", "status", "priority", "assignee", "issuelinks"],
                "maxResults": 100,
            });
            if let Some(ref token) = next_page_token {
                body["nextPageToken"] = serde_json::Value::String(token.clone());
            }

            let resp: JiraSearchResponse = check_rate_limit(
                self.client
                    .post(&url)
                    .header("Authorization", &self.auth_header)
                    .header("Accept", "application/json")
                    .header("Content-Type", "application/json")
                    .json(&body)
                    .send()
                    .await
                    .context("Failed to send Jira bug search request")?,
            )?
            .error_for_status()
            .context("Jira bug search request returned error status")?
            .json()
            .await
            .context("Failed to parse Jira bug search response")?;

            let is_last = resp.is_last;
            next_page_token = resp.next_page_token.clone();
            all_bugs.extend(resp.issues);

            if is_last || next_page_token.is_none() {
                break;
            }
        }

        Ok(all_bugs)
    }

    /// Fetch Story, Task, and Bug issues with `fixVersion` matching `version_name` in the given
    /// project.
    ///
    /// Uses `POST /rest/api/3/search/jql` with JQL:
    /// `project = "<key>" AND issuetype in (Story, Task, Bug)
    ///  AND fixVersion = "<name>" ORDER BY priority ASC`
    ///
    /// Returns all pages. Each issue includes `summary`, `status`, `priority`, `assignee`,
    /// and `issuetype` so the caller can split them into groups (e.g. Done vs. In Acceptance).
    pub async fn get_version_issues(
        &self,
        project_key: &str,
        version_name: &str,
    ) -> Result<Vec<JiraBug>> {
        validate_project_key(project_key)?;
        let safe_version = escape_jql_string(version_name);
        let jql = format!(
            "project = \"{}\" AND issuetype in (Story, Task, Bug) \
             AND fixVersion = \"{}\" ORDER BY priority ASC",
            project_key, safe_version,
        );
        let url = format!("{}/rest/api/3/search/jql", self.base_url);
        let mut all_issues: Vec<JiraBug> = Vec::new();
        let mut next_page_token: Option<String> = None;

        loop {
            let mut body = serde_json::json!({
                "jql": jql,
                "fields": ["summary", "status", "priority", "assignee", "issuetype"],
                "maxResults": 100,
            });
            if let Some(ref token) = next_page_token {
                body["nextPageToken"] = serde_json::Value::String(token.clone());
            }

            let resp: JiraSearchResponse = check_rate_limit(
                self.client
                    .post(&url)
                    .header("Authorization", &self.auth_header)
                    .header("Accept", "application/json")
                    .header("Content-Type", "application/json")
                    .json(&body)
                    .send()
                    .await
                    .context("Failed to send Jira version-issues search request")?,
            )?
            .error_for_status()
            .context("Jira version-issues search request returned error status")?
            .json()
            .await
            .context("Failed to parse Jira version-issues search response")?;

            let is_last = resp.is_last;
            next_page_token = resp.next_page_token.clone();
            all_issues.extend(resp.issues);

            if is_last || next_page_token.is_none() {
                break;
            }
        }

        Ok(all_issues)
    }

    /// Update the summary (name) of any Jira issue.
    ///
    /// Works for Test Plans, Test Sets, Test Executions — all are Jira issues.
    /// Uses `PUT /rest/api/3/issue/{key}` with body `{"fields":{"summary":"…"}}`.
    /// Returns 204 No Content on success.
    pub async fn update_issue_summary(&self, issue_key: &str, summary: &str) -> Result<()> {
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

    /// Add a file attachment to an existing Jira issue.
    ///
    /// Uses `POST /rest/api/3/issue/{key}/attachments` with `multipart/form-data`.
    /// Reads the file from `file_path` on disk.
    pub async fn add_attachment(&self, issue_key: &str, file_path: &str) -> Result<()> {
        let path = std::path::Path::new(file_path);
        let file_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("attachment")
            .to_string();

        let bytes = tokio::fs::read(path)
            .await
            .with_context(|| format!("Failed to read attachment file: {}", file_path))?;

        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();

        let mime = match ext.as_str() {
            "jpg" | "jpeg" => "image/jpeg",
            "png" => "image/png",
            "gif" => "image/gif",
            "webp" => "image/webp",
            "bmp" => "image/bmp",
            "svg" => "image/svg+xml",
            "mp4" => "video/mp4",
            "mov" => "video/quicktime",
            "avi" => "video/x-msvideo",
            "mkv" => "video/x-matroska",
            "webm" => "video/webm",
            _ => "application/octet-stream",
        };

        let url = format!(
            "{}/rest/api/3/issue/{}/attachments",
            self.base_url,
            issue_key.trim()
        );

        let part = reqwest::multipart::Part::bytes(bytes)
            .file_name(file_name)
            .mime_str(mime)
            .context("Invalid MIME type")?;

        let form = reqwest::multipart::Form::new().part("file", part);

        check_rate_limit(
            self.client
                .post(&url)
                .header("Authorization", &self.auth_header)
                .header("X-Atlassian-Token", "no-check")
                .multipart(form)
                .send()
                .await
                .context("Failed to send Jira add-attachment request")?,
        )?
        .error_for_status()
        .with_context(|| format!("Jira add-attachment failed for '{}'", issue_key))?;

        Ok(())
    }

    /// Fetch all versions for a given Jira project key.
    /// Add a plain-text comment to an existing Jira issue.
    ///
    /// Uses `POST /rest/api/3/issue/{key}/comment` with an ADF body.
    pub async fn add_comment(&self, issue_key: &str, body: &str) -> Result<()> {
        let url = format!(
            "{}/rest/api/3/issue/{}/comment",
            self.base_url,
            issue_key.trim()
        );
        let payload = serde_json::json!({
            "body": {
                "version": 1,
                "type": "doc",
                "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": body }] }]
            }
        });
        let resp = check_rate_limit(
            self.client
                .post(&url)
                .header("Authorization", &self.auth_header)
                .header("Content-Type", "application/json")
                .header("Accept", "application/json")
                .json(&payload)
                .send()
                .await
                .context("Failed to send Jira add-comment request")?,
        )?;
        let status = resp.status();
        if !status.is_success() {
            let text = resp.text().await.unwrap_or_else(|_| "<no body>".to_string());
            return Err(anyhow::anyhow!(
                "Jira add-comment failed (HTTP {}) for '{}': {}",
                status.as_u16(),
                issue_key,
                text
            ));
        }
        Ok(())
    }

    ///
    /// Uses `GET /rest/api/3/project/{key}/versions`.
    pub async fn get_project_versions(&self, project_key: &str) -> Result<Vec<JiraVersion>> {
        let url = format!(
            "{}/rest/api/3/project/{}/versions",
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
                .context("Failed to send Jira project versions request")?,
        )?
        .error_for_status()
        .with_context(|| format!("Jira project versions request failed for '{}'", project_key))?
        .json()
        .await
        .context("Failed to parse Jira project versions response")
    }
}
