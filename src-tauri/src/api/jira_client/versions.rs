use anyhow::{Context, Result};

use crate::api::common::{escape_jql_string, validate_project_key};
use crate::models::jira::{JiraBug, JiraSearchResponse, JiraVersion, VersionRelatedWork};

use super::JiraClient;

impl JiraClient {
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

            let resp: JiraSearchResponse = self.track_response(
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

            let resp: JiraSearchResponse = self.track_response(
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

    /// Fetch all versions for a given Jira project key.
    ///
    /// Uses `GET /rest/api/3/project/{key}/versions`.
    pub async fn get_project_versions(&self, project_key: &str) -> Result<Vec<JiraVersion>> {
        let url = format!(
            "{}/rest/api/3/project/{}/versions",
            self.base_url,
            project_key.trim(),
        );

        self.track_response(
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

    /// Create a new project version.
    ///
    /// Uses `POST /rest/api/3/version`. `project_id` is the numeric Jira project ID.
    pub async fn create_version(
        &self,
        project_id: &str,
        name: &str,
        description: Option<&str>,
        start_date: Option<&str>,
        release_date: Option<&str>,
    ) -> Result<JiraVersion> {
        let url = format!("{}/rest/api/3/version", self.base_url);
        let project_id_num: i64 = project_id.parse().context("Invalid project ID")?;
        let mut body = serde_json::json!({ "projectId": project_id_num, "name": name });
        if let Some(d) = description.filter(|s| !s.is_empty()) {
            body["description"] = d.into();
        }
        if let Some(d) = start_date.filter(|s| !s.is_empty()) {
            body["startDate"] = d.into();
        }
        if let Some(d) = release_date.filter(|s| !s.is_empty()) {
            body["releaseDate"] = d.into();
        }
        self.track_response(
            self.client
                .post(&url)
                .header("Authorization", &self.auth_header)
                .header("Content-Type", "application/json")
                .header("Accept", "application/json")
                .json(&body)
                .send()
                .await
                .context("Failed to send create-version request")?,
        )?
        .error_for_status()
        .context("Create-version request returned error status")?
        .json()
        .await
        .context("Failed to parse create-version response")
    }

    /// Update an existing project version.
    ///
    /// Uses `PUT /rest/api/3/version/{id}`. Only fields with `Some(...)` are included in the
    /// request body; `None` fields are left unchanged.
    #[allow(clippy::too_many_arguments)]
    pub async fn update_version(
        &self,
        version_id: &str,
        name: Option<&str>,
        description: Option<&str>,
        released: Option<bool>,
        archived: Option<bool>,
        start_date: Option<&str>,
        release_date: Option<&str>,
    ) -> Result<JiraVersion> {
        let url = format!("{}/rest/api/3/version/{}", self.base_url, version_id.trim());
        let mut body = serde_json::json!({});
        if let Some(v) = name { body["name"] = v.into(); }
        if let Some(v) = description { body["description"] = v.into(); }
        if let Some(v) = released { body["released"] = v.into(); }
        if let Some(v) = archived { body["archived"] = v.into(); }
        if let Some(v) = start_date { body["startDate"] = v.into(); }
        if let Some(v) = release_date { body["releaseDate"] = v.into(); }
        self.track_response(
            self.client
                .put(&url)
                .header("Authorization", &self.auth_header)
                .header("Content-Type", "application/json")
                .header("Accept", "application/json")
                .json(&body)
                .send()
                .await
                .context("Failed to send update-version request")?,
        )?
        .error_for_status()
        .context("Update-version request returned error status")?
        .json()
        .await
        .context("Failed to parse update-version response")
    }

    /// Fetch a custom property stored on a Jira version.
    ///
    /// Uses `GET /rest/api/3/version/{versionId}/properties/{propertyKey}`.
    /// Returns the raw JSON string of the `value` field, or `None` if the property does not
    /// exist (404).
    pub async fn get_version_property(
        &self,
        version_id: &str,
        property_key: &str,
    ) -> Result<Option<String>> {
        let url = format!(
            "{}/rest/api/3/version/{}/properties/{}",
            self.base_url,
            version_id.trim(),
            property_key.trim(),
        );
        let resp = self.track_response(
            self.client
                .get(&url)
                .header("Authorization", &self.auth_header)
                .header("Accept", "application/json")
                .send()
                .await
                .context("Failed to send get-version-property request")?,
        )?;
        if resp.status() == reqwest::StatusCode::NOT_FOUND {
            return Ok(None);
        }
        let body: serde_json::Value = resp
            .error_for_status()
            .context("Get-version-property request returned error status")?
            .json()
            .await
            .context("Failed to parse get-version-property response")?;
        Ok(Some(body["value"].to_string()))
    }

    /// Create or update a custom property on a Jira version.
    ///
    /// Uses `PUT /rest/api/3/version/{versionId}/properties/{propertyKey}`.
    /// `value` must be a valid JSON string; it is sent as the request body directly.
    pub async fn set_version_property(
        &self,
        version_id: &str,
        property_key: &str,
        value: &str,
    ) -> Result<()> {
        let url = format!(
            "{}/rest/api/3/version/{}/properties/{}",
            self.base_url,
            version_id.trim(),
            property_key.trim(),
        );
        self.track_response(
            self.client
                .put(&url)
                .header("Authorization", &self.auth_header)
                .header("Content-Type", "application/json")
                .header("Accept", "application/json")
                .body(value.to_string())
                .send()
                .await
                .context("Failed to send set-version-property request")?,
        )?
        .error_for_status()
        .context("Set-version-property request returned error status")?;
        Ok(())
    }

    /// Delete a custom property from a Jira version.
    ///
    /// Uses `DELETE /rest/api/3/version/{id}/properties/{propertyKey}`.
    pub async fn delete_version_property(
        &self,
        version_id: &str,
        property_key: &str,
    ) -> Result<()> {
        let url = format!(
            "{}/rest/api/3/version/{}/properties/{}",
            self.base_url,
            version_id.trim(),
            property_key.trim(),
        );
        let resp = self
            .client
            .delete(&url)
            .header("Authorization", &self.auth_header)
            .send()
            .await
            .context("Failed to send delete-version-property request")?;
        // 404 is fine — property was already deleted
        if resp.status() == reqwest::StatusCode::NOT_FOUND {
            return Ok(());
        }
        self.track_response(resp)?
            .error_for_status()
            .context("Delete-version-property request returned error status")?;
        Ok(())
    }

    /// Fetch all "Related Work" entries for a Jira version.
    ///
    /// Uses `GET /rest/api/3/version/{id}/relatedwork`.
    pub async fn get_version_related_work(
        &self,
        version_id: &str,
    ) -> Result<Vec<VersionRelatedWork>> {
        let url = format!(
            "{}/rest/api/3/version/{}/relatedwork",
            self.base_url,
            version_id.trim(),
        );
        self.track_response(
            self.client
                .get(&url)
                .header("Authorization", &self.auth_header)
                .header("Accept", "application/json")
                .send()
                .await
                .context("Failed to send get-version-related-work request")?,
        )?
        .error_for_status()
        .context("Get-version-related-work request returned error status")?
        .json()
        .await
        .context("Failed to parse get-version-related-work response")
    }

    /// Create a "Related Work" entry on a Jira version.
    ///
    /// Uses `POST /rest/api/3/version/{id}/relatedwork`.
    pub async fn create_version_related_work(
        &self,
        version_id: &str,
        category: &str,
        title: &str,
        url_value: &str,
    ) -> Result<VersionRelatedWork> {
        let url = format!(
            "{}/rest/api/3/version/{}/relatedwork",
            self.base_url,
            version_id.trim(),
        );
        let body = serde_json::json!({
            "category": category,
            "title": title,
            "url": url_value,
        });
        self.track_response(
            self.client
                .post(&url)
                .header("Authorization", &self.auth_header)
                .header("Content-Type", "application/json")
                .header("Accept", "application/json")
                .json(&body)
                .send()
                .await
                .context("Failed to send create-version-related-work request")?,
        )?
        .error_for_status()
        .context("Create-version-related-work request returned error status")?
        .json()
        .await
        .context("Failed to parse create-version-related-work response")
    }

    /// Delete a "Related Work" entry from a Jira version.
    ///
    /// Uses `DELETE /rest/api/3/version/{versionId}/relatedwork/{relatedWorkId}`.
    pub async fn delete_version_related_work(
        &self,
        version_id: &str,
        related_work_id: &str,
    ) -> Result<()> {
        let url = format!(
            "{}/rest/api/3/version/{}/relatedwork/{}",
            self.base_url,
            version_id.trim(),
            related_work_id.trim(),
        );
        self.track_response(
            self.client
                .delete(&url)
                .header("Authorization", &self.auth_header)
                .send()
                .await
                .context("Failed to send delete-version-related-work request")?,
        )?
        .error_for_status()
        .context("Delete-version-related-work request returned error status")?;
        Ok(())
    }
}
