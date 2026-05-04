use super::{StepStatus, TestType};
use serde::{Deserialize, Serialize};

// ── Test Runs ─────────────────────────────────────────────────────────────────

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
    /// "Scenario" or "Scenario Outline" — present for Cucumber tests.
    #[serde(rename(deserialize = "scenarioType"))]
    pub scenario_type: Option<String>,
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
    #[serde(default, deserialize_with = "super::deserialize_null_default")]
    pub defects: Vec<String>,
    /// Parameter names used by this test run (present when a dataset is attached).
    #[serde(default, deserialize_with = "super::deserialize_null_default")]
    pub parameters: Vec<TestRunParameter>,
    /// Iteration results for parametrized manual tests (one entry per dataset row).
    #[serde(default)]
    pub iterations: Option<TestRunIterationsPage>,
    /// The test execution this run belongs to (only populated by queries that
    /// select `testExecution`; absent when querying runs within a known execution).
    #[serde(default, rename(deserialize = "testExecution"))]
    pub test_execution: Option<TestRunExecution>,
    /// Evidence files (screenshots, logs, etc.) attached to this test run.
    #[serde(default, deserialize_with = "super::deserialize_null_default")]
    pub evidence: Vec<Evidence>,
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
    /// Current test type from the test entity — present only when the query
    /// explicitly requests `test { testType { name kind } }`.  This reflects
    /// the test's live type and overrides the snapshot `testType` stored on the
    /// test run (which is frozen at execution-creation time).
    #[serde(rename(deserialize = "testType"), default)]
    pub test_type: Option<super::TestType>,
    #[serde(deserialize_with = "super::deserialize_jira_json")]
    pub jira: TestRunTestJira,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestRunTestJira {
    pub key: String,
    pub summary: String,
}

/// Lightweight test execution info embedded in a `TestRun` response.
/// Used when the caller needs to know *which* execution a run belongs to
/// (e.g. "latest run for test X came from execution EXEC-42").
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestRunExecution {
    #[serde(rename(deserialize = "issueId"))]
    pub issue_id: String,
    #[serde(deserialize_with = "super::deserialize_jira_json")]
    pub jira: TestRunExecutionJira,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestRunExecutionJira {
    pub key: String,
    pub summary: String,
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
    /// Evidence files (screenshots, logs, etc.) attached to this step.
    #[serde(default, deserialize_with = "super::deserialize_null_default")]
    pub evidence: Vec<Evidence>,
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

// ── Evidence / Attachments ────────────────────────────────────────────────────

/// A file attached as evidence to a test run or test run step.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Evidence {
    pub id: Option<String>,
    pub filename: Option<String>,
    /// Whether the file is stored in Jira (vs Xray storage).
    #[serde(default, rename(deserialize = "storedInJira"))]
    pub stored_in_jira: Option<bool>,
    /// Direct download URL for the evidence file.
    #[serde(rename(deserialize = "downloadLink"))]
    pub download_link: Option<String>,
    /// File size in bytes.
    pub size: Option<u32>,
    /// ISO-8601 creation timestamp.
    #[serde(rename(deserialize = "createdOn"))]
    pub created_on: Option<String>,
}

// ── Cucumber / BDD Results ────────────────────────────────────────────────────

/// Inline embedding on a Cucumber step (usually a screenshot).
/// `data` is base64-encoded; falls back to `download_link` when absent.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResultsEmbedding {
    pub filename: Option<String>,
    #[serde(rename(deserialize = "mimeType"))]
    pub mime_type: Option<String>,
    /// Base64-encoded file content — may be absent for large files.
    pub data: Option<String>,
    /// Fallback download URL when inline `data` is not provided.
    #[serde(rename(deserialize = "downloadLink"))]
    pub download_link: Option<String>,
}

/// A single step within a Cucumber scenario result (`results[].steps[]`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CucumberResultsStep {
    /// The Gherkin keyword (Given, When, Then, And, But) — may be absent for hooks.
    pub keyword: Option<String>,
    /// The step text (the sentence after the keyword).
    pub name: Option<String>,
    pub status: Option<StepStatus>,
    /// Error message from the test runner when the step failed.
    pub error: Option<String>,
    /// Execution duration in seconds.
    pub duration: Option<f64>,
    /// Robot Framework log output.
    pub log: Option<String>,
    /// Inline embeddings (screenshots, files) attached to this step.
    #[serde(default)]
    pub embeddings: Vec<ResultsEmbedding>,
}

/// A single Cucumber scenario result (from `results[]`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CucumberResult {
    pub status: Option<StepStatus>,
    /// Scenario name.
    pub name: Option<String>,
    /// Error/failure log output (JUnit, xUnit, NUnit, TestNG).
    pub log: Option<String>,
    /// Execution duration in seconds.
    pub duration: Option<f64>,
    /// Background steps (run before each scenario).
    #[serde(default)]
    pub backgrounds: Vec<CucumberResultsStep>,
    /// Hook steps (before/after each scenario).
    #[serde(default)]
    pub hooks: Vec<CucumberResultsStep>,
    /// Scenario steps.
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

// ── Configured statuses ───────────────────────────────────────────────────────

/// A configured Xray test run status (from `getStatuses`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XrayTestRunStatus {
    pub name: String,
    pub description: Option<String>,
    #[serde(rename(deserialize = "final"))]
    pub is_final: Option<bool>,
    pub color: Option<String>,
}

// ── Paginated results ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestRunsResult {
    #[serde(rename(deserialize = "getTestRuns"))]
    pub test_runs: TestRunsPage,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestRunsPage {
    pub total: u32,
    pub start: Option<u32>,
    pub limit: Option<u32>,
    pub results: Vec<TestRun>,
}

/// Response wrapper for the `getTestRun(id:)` single-run query.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetTestRunResult {
    #[serde(rename(deserialize = "getTestRun"))]
    pub get_test_run: Option<TestRunIterationsResponse>,
}

/// Minimal test-run projection for the execution summary bar (status only).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestRunStatusEntry {
    pub status: TestRunStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestRunStatusesPage {
    pub total: u32,
    pub start: Option<u32>,
    pub limit: Option<u32>,
    pub results: Vec<TestRunStatusEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestRunStatusesResult {
    #[serde(rename(deserialize = "getTestRuns"))]
    pub test_runs: TestRunStatusesPage,
}

/// Lightweight test-run projection for version-stats aggregation.
/// Returns only status + test identity — no steps, iterations, or Gherkin.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestRunStatEntry {
    pub status: TestRunStatus,
    #[serde(rename(deserialize = "testType"))]
    pub test_type: Option<TestType>,
    pub test: TestRunTest,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestRunStatsPage {
    pub total: u32,
    pub start: Option<u32>,
    pub limit: Option<u32>,
    pub results: Vec<TestRunStatEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestRunStatsResult {
    #[serde(rename(deserialize = "getTestRuns"))]
    pub test_runs: TestRunStatsPage,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestRunIterationsResponse {
    pub iterations: Option<TestRunIterationsPage>,
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
