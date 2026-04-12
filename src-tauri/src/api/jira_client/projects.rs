use anyhow::{Context, Result};

use crate::api::common::validate_project_key;
use crate::models::jira::{JiraComponent, JiraProject, JiraProjectsResponse};

use super::JiraClient;

impl JiraClient {
    /// Fetch all accessible Jira projects (paginated, collects all pages).
    pub async fn get_projects(&self) -> Result<Vec<JiraProject>> {
        use crate::api::common::check_rate_limit;
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
        use crate::api::common::check_rate_limit;
        validate_project_key(project_key)?;
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

    /// Fetch all components for a given Jira project key or numeric ID.
    pub async fn get_project_components(&self, project_key: &str) -> Result<Vec<JiraComponent>> {
        use crate::api::common::check_rate_limit;
        validate_project_key(project_key)?;
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
}
