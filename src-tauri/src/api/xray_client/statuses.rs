use anyhow::Result;

use crate::models::xray::{StatusesResult, StepStatusesResult, XrayStepStatus, XrayTestRunStatus};

use super::XrayClient;

impl XrayClient {
    // ── Get Statuses ──────────────────────────────────────────────────────────

    /// Fetch all configured test run statuses for the project.
    pub async fn get_statuses(&self, project_id: Option<&str>) -> Result<Vec<XrayTestRunStatus>> {
        let query = r#"
            query GetStatuses($projectId: String) {
                getStatuses(projectId: $projectId) {
                    name
                    description
                    final
                    color
                }
            }
        "#;
        let result: StatusesResult = self
            .graphql(query, serde_json::json!({ "projectId": project_id }))
            .await?;
        Ok(result.statuses)
    }

    // ── Step Statuses ─────────────────────────────────────────────────────────

    /// Fetch all configured step statuses for the project.
    pub async fn get_step_statuses(&self, project_id: Option<&str>) -> Result<Vec<XrayStepStatus>> {
        let query = r#"
            query GetStepStatuses($projectId: String) {
                getStepStatuses(projectId: $projectId) {
                    name
                    description
                    color
                }
            }
        "#;
        let result: StepStatusesResult = self
            .graphql(query, serde_json::json!({ "projectId": project_id }))
            .await?;
        Ok(result.step_statuses)
    }
}
