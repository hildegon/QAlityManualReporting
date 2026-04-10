use anyhow::Result;

use crate::models::xray::{
    GetTestRunResult, TestRunIteration, TestRunsResult, UpdateTestRunStatusInput,
};

use super::XrayClient;

impl XrayClient {
    // ── Test Runs (tests inside an execution) ─────────────────────────────────

    /// Fetch a single test run for a specific test in a specific execution.
    ///
    /// Uses the `getTestRun(testIssueId, testExecIssueId)` GraphQL query which
    /// returns exactly one `TestRun` (or null if the test isn't in that execution).
    pub async fn get_single_test_run(
        &self,
        test_issue_id: &str,
        test_exec_issue_id: &str,
    ) -> Result<Option<crate::models::xray::TestRun>> {
        let query = r#"
            query GetSingleTestRun($testIssueId: String!, $testExecIssueId: String!) {
                getTestRun(testIssueId: $testIssueId, testExecIssueId: $testExecIssueId) {
                    id
                    status { name color description final }
                    comment
                    startedOn
                    finishedOn
                    assigneeId
                    executedById
                    testType { name kind }
                    gherkin
                    defects
                    parameters { name value }
                    test {
                        issueId
                        jira(fields: ["key", "summary"])
                    }
                    testExecution {
                        issueId
                        jira(fields: ["key", "summary"])
                    }
                    steps {
                        id
                        action
                        data
                        result
                        actualResult
                        comment
                        defects
                        status { name color description }
                    }
                    iterations(limit: 100) {
                        total
                        results {
                            rank
                            parameters { name value }
                            status { name color description }
                        }
                    }
                    results {
                        status { name color description }
                        steps {
                            keyword
                            name
                            status { name color description }
                            error
                        }
                    }
                }
            }
        "#;

        #[derive(serde::Deserialize)]
        struct Resp {
            #[serde(rename = "getTestRun")]
            get_test_run: Option<crate::models::xray::TestRun>,
        }

        let resp: Resp = self
            .graphql(
                query,
                serde_json::json!({
                    "testIssueId": test_issue_id,
                    "testExecIssueId": test_exec_issue_id,
                }),
            )
            .await?;

        Ok(resp.get_test_run)
    }

    /// Fetch the latest test run for a specific test across all executions.
    ///
    /// Uses an execution-based approach to guarantee we always get the status
    /// from the most recently created execution:
    ///   1. `getTest(issueId) → testExecutions` — find the latest execution
    ///      this test participates in (highest numeric issueId).
    ///   2. `getTestRun(testIssueId, testExecIssueId)` — fetch the single run
    ///      in that execution with full details.
    ///
    /// Returns a `TestRunsResult` with a single result (the latest run) or an
    /// empty `results` vec if no runs exist.
    pub async fn get_test_runs_by_test_id(
        &self,
        test_issue_id: &str,
        _limit: u32,
    ) -> Result<TestRunsResult> {
        let empty = || TestRunsResult {
            test_runs: crate::models::xray::TestRunsPage {
                total: 0,
                start: Some(0),
                limit: Some(0),
                results: vec![],
            },
        };

        // Step 1: Find the latest execution this test is part of.
        let Some(latest_exec_id) = self
            .get_latest_execution_for_test(test_issue_id)
            .await?
        else {
            return Ok(empty());
        };

        // Step 2: Fetch the single run for this test in that execution.
        let Some(run) = self
            .get_single_test_run(test_issue_id, &latest_exec_id)
            .await?
        else {
            return Ok(empty());
        };

        Ok(TestRunsResult {
            test_runs: crate::models::xray::TestRunsPage {
                total: 1,
                start: Some(0),
                limit: Some(1),
                results: vec![run],
            },
        })
    }

    /// Fetch the latest run status for each test in a batch.
    ///
    /// For each test, finds its latest execution via
    /// `getTest(issueId) → testExecutions`, then fetches the run status via
    /// `getTestRun(testIssueId, testExecIssueId)`.
    ///
    /// Tests within each chunk are processed concurrently using `join_all`.
    pub async fn get_latest_run_statuses_for_tests(
        &self,
        test_issue_ids: &[String],
    ) -> Result<Vec<(String, crate::models::xray::LatestTestStatus)>> {
        if test_issue_ids.is_empty() {
            return Ok(vec![]);
        }

        // Lightweight query to get just the status from a single test run.
        let run_query = r#"
            query GetRunStatus($testIssueId: String!, $testExecIssueId: String!) {
                getTestRun(testIssueId: $testIssueId, testExecIssueId: $testExecIssueId) {
                    status { name color description final }
                }
            }
        "#;

        #[derive(serde::Deserialize)]
        struct RunResp {
            #[serde(rename = "getTestRun")]
            get_test_run: Option<RunRow>,
        }
        #[derive(serde::Deserialize)]
        struct RunRow {
            status: crate::models::xray::LatestTestStatus,
        }

        let mut results: Vec<(String, crate::models::xray::LatestTestStatus)> = Vec::new();

        // Process in chunks, each chunk runs all tests concurrently.
        let chunk_size = 10;
        for chunk in test_issue_ids.chunks(chunk_size) {
            let futures: Vec<_> = chunk
                .iter()
                .map(|test_id| {
                    let test_id = test_id.clone();
                    async move {
                        // Step 1: Find the latest execution for this test.
                        let exec_id = match self
                            .get_latest_execution_for_test(&test_id)
                            .await
                        {
                            Ok(Some(id)) => id,
                            _ => return None,
                        };

                        // Step 2: Get the run status in that execution.
                        let resp: RunResp = match self
                            .graphql(
                                run_query,
                                serde_json::json!({
                                    "testIssueId": &test_id,
                                    "testExecIssueId": &exec_id,
                                }),
                            )
                            .await
                        {
                            Ok(r) => r,
                            Err(_) => return None,
                        };

                        resp.get_test_run
                            .map(|row| (test_id, row.status))
                    }
                })
                .collect();

            let chunk_results = futures::future::join_all(futures).await;
            for result in chunk_results.into_iter().flatten() {
                results.push(result);
            }
        }

        Ok(results)
    }

    pub async fn get_test_runs(
        &self,
        test_execution_issue_id: &str,
        limit: u32,
        start: u32,
    ) -> Result<TestRunsResult> {
        let query = r#"
            query GetTestRuns($issueId: String!, $limit: Int!, $start: Int) {
                getTestRuns(testExecIssueIds: [$issueId], limit: $limit, start: $start) {
                    total
                    start
                    limit
                    results {
                        id
                        status { name color description final }
                        comment
                        startedOn
                        finishedOn
                        assigneeId
                        executedById
                        testType { name kind }
                        gherkin
                        defects
                        parameters { name value }
                        test {
                            issueId
                            jira(fields: ["key", "summary"])
                        }
                        steps {
                            id
                            action
                            data
                            result
                            actualResult
                            comment
                            defects
                            status { name color description }
                        }
                        iterations(limit: 100) {
                            total
                            results {
                                rank
                                parameters { name value }
                                status { name color description }
                            }
                        }
                        results {
                            status { name color description }
                            steps {
                                keyword
                                name
                                status { name color description }
                                error
                            }
                        }
                    }
                }
            }
        "#;
        self.graphql(
            query,
            serde_json::json!({ "issueId": test_execution_issue_id, "limit": limit, "start": start }),
        )
        .await
    }

    /// Fetches only the status name for each test run in an execution.
    ///
    /// Much lighter than `get_test_runs` — no steps, iterations, Gherkin, or
    /// comments — so a single page of 100 covers most executions in one call.
    pub async fn get_test_run_statuses(
        &self,
        test_execution_issue_id: &str,
        limit: u32,
        start: u32,
    ) -> Result<crate::models::xray::TestRunStatusesResult> {
        let query = r#"
            query GetTestRunStatuses($issueId: String!, $limit: Int!, $start: Int) {
                getTestRuns(testExecIssueIds: [$issueId], limit: $limit, start: $start) {
                    total
                    start
                    limit
                    results {
                        status { name color description final }
                    }
                }
            }
        "#;
        self.graphql(
            query,
            serde_json::json!({ "issueId": test_execution_issue_id, "limit": limit, "start": start }),
        )
        .await
    }

    // ── Get Iteration Step Results (lazy, per test run) ───────────────────────

    /// Fetch step results for all iterations of a single test run.
    /// Called lazily when the user expands an iteration in the UI.
    pub async fn get_iteration_step_results(
        &self,
        test_run_id: &str,
    ) -> Result<Vec<TestRunIteration>> {
        let query = r#"
            query GetIterationStepResults($id: String!) {
                getTestRun(id: $id) {
                    iterations(limit: 100) {
                        results {
                            rank
                            stepResults(limit: 100) {
                                results {
                                    id
                                    status { name color description }
                                    comment
                                    actualResult
                                    defects
                                }
                            }
                        }
                    }
                }
            }
        "#;
        let result: GetTestRunResult = self
            .graphql(query, serde_json::json!({ "id": test_run_id }))
            .await?;
        Ok(result
            .get_test_run
            .and_then(|r| r.iterations)
            .map(|p| p.results)
            .unwrap_or_default())
    }

    // ── Update Iteration Status ───────────────────────────────────────────────

    /// Set the overall status of a single dataset iteration within a test run.
    ///
    /// `iteration_rank` is a 1-based string (e.g. `"1"`, `"2"`).
    pub async fn update_iteration_status(
        &self,
        test_run_id: &str,
        iteration_rank: &str,
        status: &str,
    ) -> Result<()> {
        let query = r#"
            mutation UpdateIterationStatus(
                $testRunId: String!,
                $iterationRank: String!,
                $status: String!
            ) {
                updateIterationStatus(
                    testRunId: $testRunId,
                    iterationRank: $iterationRank,
                    status: $status
                ) {
                    warnings
                }
            }
        "#;
        let _: serde_json::Value = self
            .graphql(
                query,
                serde_json::json!({
                    "testRunId": test_run_id,
                    "iterationRank": iteration_rank,
                    "status": status,
                }),
            )
            .await?;
        Ok(())
    }

    // ── Update Test Run Status ────────────────────────────────────────────────

    pub async fn update_test_run_status(
        &self,
        test_run_id: &str,
        input: UpdateTestRunStatusInput,
    ) -> Result<()> {
        let query = r#"
            mutation UpdateTestRunStatus($id: String!, $status: String!) {
                updateTestRunStatus(id: $id, status: $status)
            }
        "#;
        let _: serde_json::Value = self
            .graphql(
                query,
                serde_json::json!({
                    "id": test_run_id,
                    "status": input.status,
                }),
            )
            .await?;
        Ok(())
    }

    // ── Update Test Run (comment) ─────────────────────────────────────────────

    /// Update the comment (and optionally started/finished timestamps) on a test run.
    pub async fn update_test_run_comment(&self, test_run_id: &str, comment: &str) -> Result<()> {
        let query = r#"
            mutation UpdateTestRun($id: String!, $comment: String) {
                updateTestRun(id: $id, comment: $comment) {
                    warnings
                }
            }
        "#;
        let _: serde_json::Value = self
            .graphql(
                query,
                serde_json::json!({
                    "id": test_run_id,
                    "comment": comment,
                }),
            )
            .await?;
        Ok(())
    }

    // ── Update Test Run Step ──────────────────────────────────────────────────

    /// Update a step within a test run (comment, actualResult, status).
    /// Uses the full `updateTestRunStep` mutation with `UpdateTestRunStepInput`.
    pub async fn update_test_run_step(
        &self,
        test_run_id: &str,
        step_id: &str,
        update_data: &crate::models::xray::UpdateTestRunStepData,
    ) -> Result<()> {
        let query = r#"
            mutation UpdateTestRunStep(
                $testRunId: String!,
                $stepId: String!,
                $updateData: UpdateTestRunStepInput!
            ) {
                updateTestRunStep(
                    testRunId: $testRunId,
                    stepId: $stepId,
                    updateData: $updateData
                ) {
                    warnings
                }
            }
        "#;
        let mut data = serde_json::Map::new();
        if let Some(ref comment) = update_data.comment {
            data.insert("comment".to_owned(), serde_json::json!(comment));
        }
        if let Some(ref actual_result) = update_data.actual_result {
            data.insert("actualResult".to_owned(), serde_json::json!(actual_result));
        }
        if let Some(ref status) = update_data.status {
            data.insert("status".to_owned(), serde_json::json!(status));
        }
        let _: serde_json::Value = self
            .graphql(
                query,
                serde_json::json!({
                    "testRunId": test_run_id,
                    "stepId": step_id,
                    "updateData": data,
                }),
            )
            .await?;
        Ok(())
    }

    // ── Add Defects to Test Run ───────────────────────────────────────────────

    /// Link one or more Jira bug keys to a test run as defects.
    ///
    /// Uses Xray's `addDefectsToTestRun` GraphQL mutation. Returns the list of
    /// defect issue keys that were actually added (may be a subset if some were
    /// already linked).
    pub async fn add_defects_to_test_run(
        &self,
        run_id: &str,
        issue_keys: &[String],
    ) -> Result<Vec<String>> {
        #[derive(serde::Deserialize)]
        #[allow(non_snake_case)]
        struct AddDefectsData {
            addDefectsToTestRun: AddDefectsPayload,
        }
        #[derive(serde::Deserialize)]
        #[allow(non_snake_case)]
        struct AddDefectsPayload {
            addedDefects: Option<Vec<String>>,
            #[allow(dead_code)]
            warnings: Option<Vec<String>>,
        }

        let query = r#"
            mutation AddDefectsToTestRun($id: String!, $issues: [String]!) {
                addDefectsToTestRun(id: $id, issues: $issues) {
                    addedDefects
                    warnings
                }
            }
        "#;
        let result: AddDefectsData = self
            .graphql(
                query,
                serde_json::json!({
                    "id": run_id,
                    "issues": issue_keys,
                }),
            )
            .await?;
        Ok(result.addDefectsToTestRun.addedDefects.unwrap_or_default())
    }

    /// Update the status of a single step within a test run.
    pub async fn update_test_run_step_status(
        &self,
        test_run_id: &str,
        step_id: &str,
        status: &str,
    ) -> Result<()> {
        let query = r#"
            mutation UpdateTestRunStepStatus(
                $testRunId: String!,
                $stepId: String!,
                $status: String!
            ) {
                updateTestRunStepStatus(
                    testRunId: $testRunId,
                    stepId: $stepId,
                    status: $status
                ) {
                    warnings
                }
            }
        "#;
        let _: serde_json::Value = self
            .graphql(
                query,
                serde_json::json!({
                    "testRunId": test_run_id,
                    "stepId": step_id,
                    "status": status,
                }),
            )
            .await?;
        Ok(())
    }
}
