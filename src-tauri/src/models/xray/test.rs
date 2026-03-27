use serde::{Deserialize, Serialize};
use super::{LatestTestStatus, TestType, XrayStatus, XrayUser};

// ── Tests ─────────────────────────────────────────────────────────────────────

/// A single Xray test returned by `getTests`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XrayTest {
    #[serde(rename(deserialize = "issueId"))]
    pub issue_id: String,
    /// Xray test type (Manual, Cucumber, Generic).
    #[serde(rename(deserialize = "testType"))]
    pub test_type: Option<TestType>,
    #[serde(deserialize_with = "super::deserialize_jira_json")]
    pub jira: XrayTestJira,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XrayTestJira {
    pub key: String,
    pub summary: String,
    /// Jira workflow status — present when `"status"` is included in the jira fields query.
    pub status: Option<XrayStatus>,
    pub priority: Option<XrayStatus>,
    pub components: Option<Vec<XrayStatus>>,
    pub labels: Option<Vec<String>>,
    pub created: Option<String>,
    pub assignee: Option<XrayUser>,
}

/// Paginated result from `getTests`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestsResult {
    #[serde(rename(deserialize = "getTests"))]
    pub get_tests: TestsPage,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestsPage {
    pub total: u32,
    pub start: Option<u32>,
    pub limit: Option<u32>,
    pub results: Vec<XrayTest>,
}

/// Returned by `get_tests` / `get_test_sets` commands.
///
/// Contains the first page of results so the UI can render immediately.
/// If `done` is `false`, remaining pages will be emitted as Tauri events
/// (`tests:page` / `test-sets:page`) in the background.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FirstPageResult<T> {
    /// Tests/test-sets in the first page.
    pub results: Vec<T>,
    /// Total number of items across all pages.
    pub total: u32,
    /// `true` when all items fit in the first page (no background fetching needed).
    pub done: bool,
}

/// Event payload emitted on `tests:page` as each page of tests arrives in the background.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestsStreamPage {
    /// The project this batch belongs to (used by the frontend to route to the right cache key).
    pub project_key: String,
    pub tests: Vec<XrayTest>,
    /// True when all pages have been fetched for this project.
    pub done: bool,
}

// ── Test Export (steps + content) ─────────────────────────────────────────────

/// A single manual step definition on a test (from `getTests { steps }`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XrayTestStep {
    pub id: Option<String>,
    pub action: Option<String>,
    pub data: Option<String>,
    pub result: Option<String>,
}

/// Subset of a test returned by the export batch query (steps + content).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XrayTestExportData {
    #[serde(rename(deserialize = "issueId"))]
    pub issue_id: String,
    pub steps: Option<Vec<XrayTestStep>>,
    pub gherkin: Option<String>,
    pub unstructured: Option<String>,
}

/// Full test detail including type, steps/gherkin — returned by `get_test_detail`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XrayTestDetail {
    #[serde(rename(deserialize = "issueId"))]
    pub issue_id: String,
    #[serde(rename(deserialize = "testType"))]
    pub test_type: Option<TestType>,
    pub steps: Option<Vec<XrayTestStep>>,
    pub gherkin: Option<String>,
    pub unstructured: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XrayTestDetailPage {
    pub results: Vec<XrayTestDetail>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XrayTestDetailResult {
    #[serde(rename(deserialize = "getTests"))]
    pub get_tests: XrayTestDetailPage,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestsExportResult {
    #[serde(rename(deserialize = "getTests"))]
    pub get_tests: TestsExportPage,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestsExportPage {
    pub results: Vec<XrayTestExportData>,
}

// ── Update Test Step ──────────────────────────────────────────────────────────

/// Input for `updateTestStep` / `addTestStep` Tauri commands.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateTestStepInput {
    /// Updated action text (pass `None` to leave unchanged).
    pub action: Option<String>,
    /// Updated test-data text (pass `None` to leave unchanged).
    pub data: Option<String>,
    /// Updated expected-result text (pass `None` to leave unchanged).
    pub result: Option<String>,
}

// ── Create Test ───────────────────────────────────────────────────────────────

/// A single manual step passed to `createTest`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateTestStepInput {
    /// The action/instruction for this step.
    pub action: String,
    /// Optional test data for this step.
    pub data: Option<String>,
    /// Optional expected result for this step.
    pub result: Option<String>,
}

/// Input for the `createTest` Tauri command.
#[derive(Debug, Serialize, Deserialize)]
pub struct CreateXrayTestInput {
    /// Jira project key or numeric ID (e.g. "PROJ" or "10428").
    pub project_key: String,
    /// Jira issue summary (title).
    pub summary: String,
    /// Steps for a Manual test (empty for Generic/Unstructured).
    pub steps: Vec<CreateTestStepInput>,
    /// Optional Jira component name to assign to the created test issue.
    pub component: Option<String>,
}

/// The `Step` object returned by `createTest { test { steps { ... } } }`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatedTestStep {
    pub id: Option<String>,
    pub action: Option<String>,
    pub data: Option<String>,
    pub result: Option<String>,
}

/// The `Test` object nested inside `CreateTestResult`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatedTestInner {
    #[serde(rename(deserialize = "issueId"))]
    pub issue_id: String,
    #[serde(deserialize_with = "super::deserialize_jira_json")]
    pub jira: XrayTestJira,
    pub steps: Option<Vec<CreatedTestStep>>,
}

/// `data.createTest` from Xray GraphQL response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateTestResult {
    pub test: Option<CreatedTestInner>,
    pub warnings: Option<Vec<String>>,
}

/// Outer wrapper matching the `data.createTest` key.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateTestResponse {
    #[serde(rename(deserialize = "createTest"))]
    pub create_test: CreateTestResult,
}

// ── Test with latest status (for Coverage page) ───────────────────────────────

/// An Xray test enriched with its latest execution status.
/// Returned by `get_test_set_tests_with_status`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XrayTestWithStatus {
    #[serde(rename(deserialize = "issueId"))]
    pub issue_id: String,
    #[serde(deserialize_with = "super::deserialize_jira_json")]
    pub jira: XrayTestJira,
    /// Most recent test run result, or None if the test has never been executed.
    #[serde(rename(deserialize = "status"))]
    pub latest_status: Option<LatestTestStatus>,
}

/// Wrapper for the `getTestSet(issueId)` query when `latestStatus` is requested.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestSetWithStatusResult {
    #[serde(rename(deserialize = "getTestSet"))]
    pub get_test_set: TestSetDetailWithStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestSetDetailWithStatus {
    #[serde(rename(deserialize = "issueId"))]
    pub issue_id: String,
    pub tests: TestSetTestsWithStatusPage,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestSetTestsWithStatusPage {
    pub results: Vec<XrayTestWithStatus>,
}
