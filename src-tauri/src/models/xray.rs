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
    /// Test type for this run (Manual, Cucumber, Generic).
    #[serde(rename(deserialize = "testType"))]
    pub test_type: Option<TestType>,
    /// Raw Gherkin feature definition string (present for Cucumber tests).
    pub gherkin: Option<String>,
    pub comment: Option<String>,
    pub steps: Option<Vec<TestRunStep>>,
    /// Cucumber scenario results (one entry per scenario / outline row).
    pub results: Option<Vec<CucumberResult>>,
    #[serde(rename(deserialize = "startedOn"))]
    pub started_on: Option<String>,
    #[serde(rename(deserialize = "finishedOn"))]
    pub finished_on: Option<String>,
    #[serde(rename(deserialize = "assigneeId"))]
    pub assignee_id: Option<String>,
    #[serde(rename(deserialize = "executedById"))]
    pub executed_by_id: Option<String>,
    /// Jira issue keys of defects (bugs) linked to this test run via Xray.
    #[serde(default)]
    pub defects: Vec<String>,
    /// Parameter names used by this test run (present when a dataset is attached).
    #[serde(default)]
    pub parameters: Vec<TestRunParameter>,
    /// Iteration results for parametrized manual tests (one entry per dataset row).
    #[serde(default)]
    pub iterations: Option<TestRunIterationsPage>,
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

// ── Test Type ─────────────────────────────────────────────────────────────────

/// The type of an Xray test (Manual, Cucumber, Generic).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestType {
    pub name: String,
    pub kind: Option<String>,
}

// ── Test Run Steps ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestRunStep {
    pub id: String,
    pub status: Option<StepStatus>,
    pub action: Option<String>,
    pub data: Option<String>,
    pub result: Option<String>,
    #[serde(rename(deserialize = "actualResult"))]
    pub actual_result: Option<String>,
    pub comment: Option<String>,
    pub defects: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StepStatus {
    pub name: String,
    pub description: Option<String>,
    pub color: Option<String>,
}

// ── Dataset / Iterations (parametrized manual tests) ─────────────────────────

/// A single parameter name/value pair on a test run or iteration.
/// Returned by `TestRun.parameters` and `TestRunIteration.parameters`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestRunParameter {
    pub name: Option<String>,
    pub value: Option<String>,
}

/// One iteration of a parametrized manual test run.
/// Returned by `TestRun.iterations(limit, start).results`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestRunIteration {
    /// 1-based rank string ("1", "2", …).
    pub rank: Option<String>,
    /// Parameter values for this iteration row.
    #[serde(default)]
    pub parameters: Vec<TestRunParameter>,
    /// Overall status of this iteration.
    pub status: Option<StepStatus>,
    /// Per-step results for this iteration (unwrapped from the paginated wrapper).
    #[serde(rename(deserialize = "stepResults"))]
    pub step_results: Option<TestRunIterationStepResultsPage>,
}

/// Paginated wrapper returned by `TestRunIteration.stepResults(limit, start)`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestRunIterationStepResultsPage {
    pub results: Vec<TestRunIterationStepResult>,
}

/// Paginated wrapper returned by `TestRun.iterations(limit, start)`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestRunIterationsPage {
    pub total: Option<u32>,
    pub start: Option<u32>,
    pub limit: Option<u32>,
    pub results: Vec<TestRunIteration>,
}

/// Per-step result inside a single iteration.
/// Returned by `TestRunIteration.stepResults(limit, start).results`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestRunIterationStepResult {
    /// ID of the test run step this result belongs to.
    pub id: Option<String>,
    pub status: Option<StepStatus>,
    pub comment: Option<String>,
    #[serde(rename(deserialize = "actualResult"))]
    pub actual_result: Option<String>,
    #[serde(default)]
    pub defects: Vec<String>,
}

// ── Cucumber / BDD Results ────────────────────────────────────────────────────

/// A single step within a `CucumberResult` (from `results[].steps`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CucumberResultsStep {
    /// The Gherkin keyword (Given, When, Then, And, But) — may be absent for hooks.
    pub keyword: Option<String>,
    /// The step text (the sentence after the keyword).
    pub name: Option<String>,
    pub status: Option<StepStatus>,
    /// Error message from the test runner when the step failed.
    pub error: Option<String>,
}

/// A single Cucumber scenario result (from `results[]`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CucumberResult {
    pub status: Option<StepStatus>,
    pub steps: Option<Vec<CucumberResultsStep>>,
}

/// Result from `getStepStatuses` query.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StepStatusesResult {
    #[serde(rename(deserialize = "getStepStatuses"))]
    pub step_statuses: Vec<XrayStepStatus>,
}

/// A configured step status returned by `getStepStatuses`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XrayStepStatus {
    pub name: String,
    pub description: Option<String>,
    pub color: Option<String>,
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

/// Data for the full `updateTestRunStep` mutation (comment, actualResult, status).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateTestRunStepData {
    pub comment: Option<String>,
    pub actual_result: Option<String>,
    pub status: Option<String>,
}

// ── Tests ─────────────────────────────────────────────────────────────────────

/// A single Xray test returned by `getTests`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XrayTest {
    #[serde(rename(deserialize = "issueId"))]
    pub issue_id: String,
    #[serde(deserialize_with = "deserialize_jira_json")]
    pub jira: XrayTestJira,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XrayTestJira {
    pub key: String,
    pub summary: String,
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

// ── Test with latest status (for Coverage page) ───────────────────────────────

/// An Xray test enriched with its latest execution status.
/// Returned by `get_test_set_tests_with_status`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XrayTestWithStatus {
    #[serde(rename(deserialize = "issueId"))]
    pub issue_id: String,
    #[serde(deserialize_with = "deserialize_jira_json")]
    pub jira: XrayTestJira,
    /// Most recent test run result, or None if the test has never been executed.
    #[serde(rename(deserialize = "status"))]
    pub latest_status: Option<LatestTestStatus>,
}

/// The `status` object returned by the Xray GraphQL `getTestSet(…).tests` field.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LatestTestStatus {
    pub name: String,
    pub color: Option<String>,
    pub description: Option<String>,
    #[serde(rename(deserialize = "final"))]
    pub is_final: Option<bool>,
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

/// Used to link an execution to a test plan after creation.
#[derive(Debug, Serialize)]
pub struct AddTestExecutionsToTestPlanInput {
    /// The Xray issue ID of the test plan.
    pub test_plan_issue_id: String,
    /// The Xray issue IDs of the test executions to link.
    pub test_exec_issue_ids: Vec<String>,
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
    #[serde(deserialize_with = "deserialize_jira_json")]
    pub jira: TestExecutionJira,
}

// ── Test Set Membership (batch) ───────────────────────────────────────────────

/// Lightweight info about a test set, used in membership maps.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestSetMemberInfo {
    pub issue_id: String,
    pub key: String,
    pub summary: String,
}

/// Response from `get_all_test_set_memberships`.
/// Maps `test_issue_id → Vec<TestSetMemberInfo>` (which test sets each test belongs to).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestSetMembershipsResponse {
    /// Map from test issue ID to the list of test sets it belongs to.
    pub memberships: std::collections::HashMap<String, Vec<TestSetMemberInfo>>,
    /// The full list of test sets in the project.
    pub test_sets: Vec<XrayTestSet>,
}

// ── Test Sets ─────────────────────────────────────────────────────────────────

/// A single Xray test set returned by `getTestSets`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XrayTestSet {
    #[serde(rename(deserialize = "issueId"))]
    pub issue_id: String,
    #[serde(deserialize_with = "deserialize_jira_json")]
    pub jira: XrayTestSetJira,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XrayTestSetJira {
    pub key: String,
    pub summary: String,
}

/// Paginated result from `getTestSets`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestSetsResult {
    #[serde(rename(deserialize = "getTestSets"))]
    pub get_test_sets: TestSetsPage,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestSetsPage {
    pub total: u32,
    pub start: Option<u32>,
    pub limit: Option<u32>,
    pub results: Vec<XrayTestSet>,
}

/// Wrapper for the `getTestSet(issueId)` query (singular).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestSetResult {
    #[serde(rename(deserialize = "getTestSet"))]
    pub get_test_set: TestSetDetail,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestSetDetail {
    #[serde(rename(deserialize = "issueId"))]
    pub issue_id: String,
    pub tests: TestSetTestsPage,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestSetTestsPage {
    pub results: Vec<XrayTest>,
}

// ── Test Plan detail (singular) ───────────────────────────────────────────────

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

// ── Create Test Set ───────────────────────────────────────────────────────────

/// The test set object returned inside `CreateTestSetResult`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatedTestSet {
    #[serde(rename(deserialize = "issueId"))]
    pub issue_id: String,
    #[serde(deserialize_with = "deserialize_jira_json")]
    pub jira: XrayTestSetJira,
}

/// `data.createTestSet` from the Xray GraphQL response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateTestSetResult {
    #[serde(rename(deserialize = "testSet"))]
    pub test_set: Option<CreatedTestSet>,
    pub warnings: Option<Vec<String>>,
}

/// Outer wrapper matching the `data.createTestSet` key.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateTestSetResponse {
    #[serde(rename(deserialize = "createTestSet"))]
    pub create_test_set: CreateTestSetResult,
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
    #[serde(deserialize_with = "deserialize_jira_json")]
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
    #[serde(deserialize_with = "deserialize_jira_json")]
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

/// Response wrapper for the `getTestRun(id:)` single-run query.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetTestRunResult {
    #[serde(rename(deserialize = "getTestRun"))]
    pub get_test_run: Option<TestRunIterationsResponse>,
}

/// Minimal test-run projection returned by the lazy iteration step-results query.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestRunIterationsResponse {
    pub iterations: Option<TestRunIterationsPage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestRunsPage {
    pub total: u32,
    pub start: Option<u32>,
    pub limit: Option<u32>,
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
