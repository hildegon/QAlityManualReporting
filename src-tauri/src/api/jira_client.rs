#![allow(dead_code)]
use anyhow::{Context, Result};
use reqwest::Client;

use crate::models::jira::{JiraIssue, JiraProject, JiraProjectsResponse};

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

            let response: JiraProjectsResponse = self
                .client
                .get(&url)
                .header("Authorization", &self.auth_header)
                .header("Accept", "application/json")
                .send()
                .await
                .context("Failed to send Jira projects request")?
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

    /// Fetch a single Jira issue by key (e.g. "PROJ-123").
    pub async fn get_issue(&self, issue_key: &str) -> Result<JiraIssue> {
        let url = format!(
            "{}/rest/api/3/issue/{}?fields=summary,status,assignee,priority,issuetype",
            self.base_url, issue_key,
        );

        self.client
            .get(&url)
            .header("Authorization", &self.auth_header)
            .header("Accept", "application/json")
            .send()
            .await
            .context("Failed to send Jira issue request")?
            .error_for_status()
            .context("Jira issue request returned error status")?
            .json()
            .await
            .context("Failed to parse Jira issue response")
    }

    /// Validate the credentials by fetching the current user.
    pub async fn validate_credentials(&self) -> Result<String> {
        let url = format!("{}/rest/api/3/myself", self.base_url);
        let value: serde_json::Value = self
            .client
            .get(&url)
            .header("Authorization", &self.auth_header)
            .header("Accept", "application/json")
            .send()
            .await
            .context("Failed to reach Jira")?
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
}
