use super::LatestTestStatus;
use serde::{Deserialize, Serialize};

// ── Test Health (batched last-run fetch) ──────────────────────────────────────

/// A slim test record returned by the batched health query
/// (`getTests(jql: "id in (...)", limit: N)` with `testRuns(limit: 1)` and `latestStatus`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestForHealth {
    #[serde(rename(deserialize = "issueId"))]
    pub issue_id: String,
    /// Cross-version aggregated status — present even when `test_runs` is empty
    /// (i.e. the test was edited after its last run, so the current version has no runs).
    #[serde(rename(deserialize = "status"))]
    pub latest_status: Option<LatestTestStatus>,
    #[serde(rename(deserialize = "testRuns"))]
    pub test_runs: Option<TestRunsForHealth>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestRunsForHealth {
    pub results: Vec<InlineTestRun>,
}

/// A single test run record embedded in health batch results.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InlineTestRun {
    #[serde(rename(deserialize = "finishedOn"))]
    pub finished_on: Option<String>,
    pub status: Option<LatestTestStatus>,
}

/// GraphQL response wrapper for the batched health query.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestsForHealthResult {
    #[serde(rename(deserialize = "getTests"))]
    pub get_tests: TestsForHealthPage,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestsForHealthPage {
    pub results: Vec<TestForHealth>,
}

// ── Test Health (last run per test) ───────────────────────────────────────────

/// Most recent test run for a single test, returned by `get_tests_health_data`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestLastRunEntry {
    pub test_issue_id: String,
    pub finished_on: Option<String>,
    pub started_on: Option<String>,
    pub status: Option<LatestTestStatus>,
}

/// A slim test-run record used internally when fetching health data.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestRunForHealth {
    #[serde(rename(deserialize = "finishedOn"))]
    pub finished_on: Option<String>,
    #[serde(rename(deserialize = "startedOn"))]
    pub started_on: Option<String>,
    pub status: Option<LatestTestStatus>,
    pub test: TestRefInRun,
}

/// The nested `test { issueId }` returned inside a test run.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestRefInRun {
    #[serde(rename(deserialize = "issueId"))]
    pub issue_id: String,
}

/// GraphQL response wrapper for `getTestRuns` when fetching health data.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestRunsForHealthResult {
    #[serde(rename(deserialize = "getTestRuns"))]
    pub get_test_runs: TestRunsForHealthPage,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestRunsForHealthPage {
    pub total: u32,
    pub results: Vec<TestRunForHealth>,
}

/// Event payload emitted by `get_tests_health_data` as each page of runs arrives.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthBatch {
    /// Latest-run entries for the tests seen in this page.
    pub entries: Vec<TestLastRunEntry>,
    /// True when all pages have been fetched.
    pub done: bool,
    /// Total number of test runs across all pages (available after first page).
    pub total: u32,
    /// How many runs have been processed so far.
    pub processed: u32,
}
