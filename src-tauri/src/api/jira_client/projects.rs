use anyhow::{Context, Result};

use crate::api::common::validate_project_key;
use crate::models::jira::{JiraComponent, JiraProject, JiraProjectsResponse};

use super::JiraClient;

impl JiraClient {
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

            let response: JiraProjectsResponse = self.track_response(
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
        
        validate_project_key(project_key)?;
        let url = format!(
            "{}/rest/api/3/project/{}",
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
                .context("Failed to send Jira project request")?,
        )?
        .error_for_status()
        .with_context(|| format!("Jira project '{}' not found or not accessible", project_key))?
        .json()
        .await
        .context("Failed to parse Jira project response")
    }

    /// Fetch all components for a given Jira project key or numeric ID.
    pub async fn get_project_components(&self, project_key: &str) -> Result<Vec<JiraComponent>> {
        
        validate_project_key(project_key)?;
        let url = format!(
            "{}/rest/api/3/project/{}/components",
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

    /// Fetch a custom property stored on a Jira project.
    ///
    /// Uses `GET /rest/api/3/project/{projectIdOrKey}/properties/{propertyKey}`.
    /// Returns the raw JSON string of the `value` field, or `None` if the property
    /// does not exist (404).
    pub async fn get_project_property(
        &self,
        project_key: &str,
        property_key: &str,
    ) -> Result<Option<String>> {
        let url = format!(
            "{}/rest/api/3/project/{}/properties/{}",
            self.base_url,
            project_key.trim(),
            property_key.trim(),
        );
        let resp = self.track_response(
            self.client
                .get(&url)
                .header("Authorization", &self.auth_header)
                .header("Accept", "application/json")
                .send()
                .await
                .context("Failed to send get-project-property request")?,
        )?;
        if resp.status() == reqwest::StatusCode::NOT_FOUND {
            return Ok(None);
        }
        let body: serde_json::Value = resp
            .error_for_status()
            .context("Get-project-property request returned error status")?
            .json()
            .await
            .context("Failed to parse get-project-property response")?;
        Ok(Some(body["value"].to_string()))
    }

    /// Create or update a custom property on a Jira project.
    ///
    /// Uses `PUT /rest/api/3/project/{projectIdOrKey}/properties/{propertyKey}`.
    /// `value` must be a valid JSON string; it is sent as the request body directly.
    pub async fn set_project_property(
        &self,
        project_key: &str,
        property_key: &str,
        value: &str,
    ) -> Result<()> {
        let url = format!(
            "{}/rest/api/3/project/{}/properties/{}",
            self.base_url,
            project_key.trim(),
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
                .context("Failed to send set-project-property request")?,
        )?
        .error_for_status()
        .context("Set-project-property request returned error status")?;
        Ok(())
    }

    /// Delete a custom property from a Jira project.
    ///
    /// Uses `DELETE /rest/api/3/project/{projectIdOrKey}/properties/{propertyKey}`.
    pub async fn delete_project_property(
        &self,
        project_key: &str,
        property_key: &str,
    ) -> Result<()> {
        let url = format!(
            "{}/rest/api/3/project/{}/properties/{}",
            self.base_url,
            project_key.trim(),
            property_key.trim(),
        );
        let resp = self.track_response(
            self.client
                .delete(&url)
                .header("Authorization", &self.auth_header)
                .header("Accept", "application/json")
                .send()
                .await
                .context("Failed to send delete-project-property request")?,
        )?;
        // A 404 means the property was already absent — treat as success.
        if resp.status() == reqwest::StatusCode::NOT_FOUND {
            return Ok(());
        }
        resp.error_for_status()
            .context("Delete-project-property request returned error status")?;
        Ok(())
    }
}
