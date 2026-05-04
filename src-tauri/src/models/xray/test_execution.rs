use super::{XrayStatus, XrayUser};
use serde::{Deserialize, Serialize};

// ── Test Executions ───────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestExecution {
    #[serde(rename(deserialize = "issueId"))]
    pub issue_id: String,
    #[serde(rename(deserialize = "projectId"))]
    pub project_id: String,
    #[serde(deserialize_with = "super::deserialize_jira_json")]
    pub jira: TestExecutionJira,
}

/// A slim version reference as returned inside `jira(fields: ["fixVersions"])` from Xray.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FixVersion {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestExecutionJira {
    pub key: String,
    pub summary: String,
    pub status: Option<XrayStatus>,
    pub assignee: Option<XrayUser>,
    #[serde(rename(deserialize = "fixVersions"))]
    pub fix_versions: Option<Vec<FixVersion>>,
}

/// Paginated result from `getTestExecutions`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestExecutionsResult {
    #[serde(rename(deserialize = "getTestExecutions"))]
    pub test_executions: TestExecutionsPage,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestExecutionsPage {
    pub total: u32,
    pub start: Option<u32>,
    pub limit: Option<u32>,
    pub results: Vec<TestExecution>,
}

// ── Create Test Execution ─────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct CreateTestExecutionInput {
    /// Jira project key (e.g. "PROJ").
    pub project_key: String,
    pub summary: String,
    pub description: Option<String>,
    /// Xray test issue IDs to add to the execution at creation time.
    #[serde(rename = "testIssueIds")]
    pub test_issue_ids: Option<Vec<String>>,
}

/// Outer wrapper matching the `data.createTestExecution` key in the GraphQL response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateTestExecutionResponse {
    #[serde(rename(deserialize = "createTestExecution"))]
    pub create_test_execution: CreateTestExecutionResult,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateTestExecutionResult {
    #[serde(rename(deserialize = "testExecution"))]
    pub test_execution: CreatedTestExecution,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatedTestExecution {
    #[serde(rename(deserialize = "issueId"))]
    pub issue_id: String,
    #[serde(deserialize_with = "super::deserialize_jira_json")]
    pub jira: TestExecutionJira,
}
