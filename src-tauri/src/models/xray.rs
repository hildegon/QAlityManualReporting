#![allow(dead_code)]
use serde::{Deserialize, Deserializer, Serialize};

/// Xray Cloud GraphQL returns the `jira` field as a JSON-encoded string.
/// This deserializer handles both forms: a raw string that needs parsing,
/// or an already-parsed object (for forward-compatibility).
fn deserialize_jira_json<'de, T, D>(deserializer: D) -> Result<T, D::Error>
where
    T: serde::de::DeserializeOwned,
    D: Deserializer<'de>,
{
    let value = serde_json::Value::deserialize(deserializer)?;
    match value {
        serde_json::Value::String(s) => serde_json::from_str(&s).map_err(serde::de::Error::custom),
        other => serde_json::from_value(other).map_err(serde::de::Error::custom),
    }
}

// ── Authentication ────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct XrayAuthRequest {
    #[serde(rename = "client_id")]
    pub client_id: String,
    #[serde(rename = "client_secret")]
    pub client_secret: String,
}

// ── Test Plans ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestPlan {
    #[serde(rename(deserialize = "issueId"))]
    pub issue_id: String,
    #[serde(rename(deserialize = "projectId"))]
    pub project_id: String,
    #[serde(deserialize_with = "deserialize_jira_json")]
    pub jira: TestPlanJira,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestPlanJira {
    pub key: String,
    pub summary: String,
    #[serde(rename(deserialize = "issuetype"))]
    pub issue_type: Option<XrayIssueType>,
    pub status: Option<XrayStatus>,
}

// ── Test Executions ───────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestExecution {
    #[serde(rename(deserialize = "issueId"))]
    pub issue_id: String,
    #[serde(rename(deserialize = "projectId"))]
    pub project_id: String,
    #[serde(deserialize_with = "deserialize_jira_json")]
    pub jira: TestExecutionJira,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestExecutionJira {
    pub key: String,
    pub summary: String,
    pub status: Option<XrayStatus>,
    pub assignee: Option<XrayUser>,
}

// ── Tests in an Execution ─────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestRun {
    pub id: String,
    pub status: TestRunStatus,
    pub test: TestRunTest,
    pub comment: Option<String>,
    #[serde(rename(deserialize = "startedOn"))]
    pub started_on: Option<String>,
    #[serde(rename(deserialize = "finishedOn"))]
    pub finished_on: Option<String>,
    #[serde(rename(deserialize = "assigneeId"))]
    pub assignee_id: Option<String>,
    #[serde(rename(deserialize = "executedById"))]
    pub executed_by_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestRunStatus {
    pub name: String,
    pub color: Option<String>,
    pub description: Option<String>,
    #[serde(rename(deserialize = "final"))]
    pub is_final: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestRunTest {
    #[serde(rename(deserialize = "issueId"))]
    pub issue_id: String,
    #[serde(deserialize_with = "deserialize_jira_json")]
    pub jira: TestRunTestJira,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestRunTestJira {
    pub key: String,
    pub summary: String,
}

// ── Update Test Run ───────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct UpdateTestRunStatusInput {
    pub status: String,
}

#[derive(Debug, Serialize)]
pub struct UpdateTestRunInput {
    pub comment: Option<String>,
}

// ── Create Test Execution ─────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct CreateTestExecutionInput {
    #[serde(rename = "testPlanId")]
    pub test_plan_id: Option<String>,
    #[serde(rename = "projectId")]
    pub project_id: String,
    pub summary: String,
    pub description: Option<String>,
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
    #[serde(deserialize_with = "deserialize_jira_json")]
    pub jira: TestExecutionJira,
}

// ── GraphQL helpers ───────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct GraphQLRequest {
    pub query: String,
    pub variables: serde_json::Value,
}

#[derive(Debug, Deserialize)]
pub struct GraphQLResponse<T> {
    pub data: Option<T>,
    pub errors: Option<Vec<GraphQLError>>,
}

#[derive(Debug, Deserialize)]
pub struct GraphQLError {
    pub message: String,
}

// ── Statuses ──────────────────────────────────────────────────────────────────

/// A configured Xray test run status (from `getStatuses`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XrayTestRunStatus {
    pub name: String,
    pub description: Option<String>,
    #[serde(rename(deserialize = "final"))]
    pub is_final: Option<bool>,
    pub color: Option<String>,
}

// ── Shared ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XrayIssueType {
    pub name: String,
}

/// Jira-level status embedded in `jira(fields: ["status"])` responses.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XrayStatus {
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XrayUser {
    #[serde(rename(deserialize = "accountId"))]
    pub account_id: Option<String>,
    #[serde(rename(deserialize = "displayName"))]
    pub display_name: Option<String>,
}

// ── Paginated results ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XrayPageInfo {
    #[serde(rename(deserialize = "startIndex"))]
    pub start_index: u32,
    pub limit: u32,
    pub total: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestPlansResult {
    #[serde(rename(deserialize = "getTestPlans"))]
    pub test_plans: TestPlansPage,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestPlansPage {
    pub total: u32,
    pub start: Option<u32>,
    pub limit: Option<u32>,
    pub results: Vec<TestPlan>,
}

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestRunsResult {
    #[serde(rename(deserialize = "getTestRuns"))]
    pub test_runs: TestRunsPage,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestRunsPage {
    pub total: u32,
    pub results: Vec<TestRun>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatusesResult {
    #[serde(rename(deserialize = "getStatuses"))]
    pub statuses: Vec<XrayTestRunStatus>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateTestRunResult {
    #[serde(rename(deserialize = "updateTestRun"))]
    pub update_test_run: UpdateTestRunWarnings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateTestRunWarnings {
    pub warnings: Option<Vec<String>>,
}
