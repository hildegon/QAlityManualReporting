use super::{XrayIssueType, XrayStatus, XrayTest};
use serde::{Deserialize, Serialize};

// ── Test Plans ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestPlan {
    #[serde(rename(deserialize = "issueId"))]
    pub issue_id: String,
    #[serde(rename(deserialize = "projectId"))]
    pub project_id: String,
    #[serde(deserialize_with = "super::deserialize_jira_json")]
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

/// Paginated result from `getTestPlans`.
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

/// Wrapper for the `getTestPlan(issueId)` query (singular).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestPlanResult {
    #[serde(rename(deserialize = "getTestPlan"))]
    pub get_test_plan: TestPlanDetail,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestPlanDetail {
    #[serde(rename(deserialize = "issueId"))]
    pub issue_id: String,
    pub tests: TestPlanTestsPage,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestPlanTestsPage {
    pub results: Vec<XrayTest>,
}

// ── Create Test Plan ──────────────────────────────────────────────────────────

/// Input for the `createTestPlan` Tauri command.
#[derive(Debug, Serialize)]
pub struct CreateTestPlanInput {
    /// Jira project key (e.g. "PROJ") or numeric ID.
    pub project_key: String,
    pub summary: String,
    pub description: Option<String>,
    /// Optional Jira component name to tag the plan (e.g. "Auth").
    pub component: Option<String>,
    /// Optional Jira fix version name to tag the plan (e.g. "v2.1.0").
    pub fix_version: Option<String>,
}

/// The test plan object returned inside `CreateTestPlanResult`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatedTestPlan {
    #[serde(rename(deserialize = "issueId"))]
    pub issue_id: String,
    #[serde(deserialize_with = "super::deserialize_jira_json")]
    pub jira: TestPlanJira,
}

/// `data.createTestPlan` from the Xray GraphQL response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateTestPlanResult {
    #[serde(rename(deserialize = "testPlan"))]
    pub test_plan: Option<CreatedTestPlan>,
    pub warnings: Option<Vec<String>>,
}

/// Outer wrapper matching the `data.createTestPlan` key.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateTestPlanResponse {
    #[serde(rename(deserialize = "createTestPlan"))]
    pub create_test_plan: CreateTestPlanResult,
}

/// Input for adding test issues directly to a test plan's test list.
/// Distinct from `AddTestExecutionsToTestPlanInput` which links executions.
#[derive(Debug, Serialize)]
pub struct AddTestsToTestPlanInput {
    /// The Xray issue ID of the test plan.
    pub test_plan_issue_id: String,
    /// The Xray issue IDs of the tests to add.
    pub test_issue_ids: Vec<String>,
}

/// Used to link an execution to a test plan after creation.
#[derive(Debug, Serialize)]
pub struct AddTestExecutionsToTestPlanInput {
    /// The Xray issue ID of the test plan.
    pub test_plan_issue_id: String,
    /// The Xray issue IDs of the test executions to link.
    pub test_exec_issue_ids: Vec<String>,
}
