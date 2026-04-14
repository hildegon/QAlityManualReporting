use anyhow::Result;

use crate::models::xray::{
    GetTestRunResult, LatestTestStatus, TestRunIteration, TestRunsForHealthResult,
    TestRunsResult, TestsForHealthResult, UpdateTestRunStatusInput,
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
                    scenarioType
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
                    evidence {
                        id filename storedInJira downloadLink size createdOn
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
                        evidence {
                            id filename storedInJira downloadLink size createdOn
                        }
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
                        name
                        log
                        duration
                        backgrounds {
                            keyword name status { name color description } error duration
                            embeddings { filename mimeType data downloadLink }
                        }
                        hooks {
                            keyword name status { name color description } error duration
                            embeddings { filename mimeType data downloadLink }
                        }
                        steps {
                            keyword name status { name color description } error duration
                            embeddings { filename mimeType data downloadLink }
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
    /// Two-phase approach (same pattern as `stream_health_batched`):
    ///
    /// **Phase 1** — `getTests(jql: "id in (...)")` with `testRuns(limit: 1)`,
    /// running up to `MAX_CONCURRENT` batches of 100 tests in parallel.
    ///
    /// **Phase 2** — A single consolidated `getTestRuns` fallback for tests
    /// with a cross-version `latestStatus` but no `testRuns` in the current
    /// version (typically because the test was edited after its last run).
    pub async fn get_latest_run_statuses_for_tests(
        &self,
        test_issue_ids: &[String],
    ) -> Result<Vec<(String, LatestTestStatus)>> {
        if test_issue_ids.is_empty() {
            return Ok(vec![]);
        }

        let query = r#"
            query GetTestsStatus($jql: String!, $limit: Int!) {
                getTests(jql: $jql, limit: $limit, start: 0) {
                    results {
                        issueId
                        status { name color description final }
                        testRuns(limit: 1) {
                            results {
                                status { name color description final }
                            }
                        }
                    }
                }
            }
        "#;

        const BATCH_SIZE: usize = 100;
        const MAX_CONCURRENT: usize = 5;

        // ── Phase 1: concurrent primary batches ──────────────────────────────
        let semaphore = std::sync::Arc::new(tokio::sync::Semaphore::new(MAX_CONCURRENT));
        let mut join_set = tokio::task::JoinSet::new();

        for chunk in test_issue_ids.chunks(BATCH_SIZE) {
            let sem = semaphore.clone();
            let client = self.clone();
            let chunk_ids: Vec<String> = chunk.to_vec();
            let query = query.to_owned();

            join_set.spawn(async move {
                let _permit = sem.acquire().await.expect("semaphore closed");
                let ids_jql = chunk_ids.join(", ");
                let jql = format!("id in ({ids_jql})");

                let resp: TestsForHealthResult = client
                    .graphql(
                        &query,
                        serde_json::json!({ "jql": jql, "limit": chunk_ids.len() as u32 }),
                    )
                    .await?;

                let mut entries: Vec<(String, LatestTestStatus)> = Vec::new();
                let mut fallback_ids: Vec<String> = Vec::new();

                for t in resp.get_tests.results {
                    let run_status = t
                        .test_runs
                        .and_then(|tr| tr.results.into_iter().next())
                        .and_then(|r| r.status);

                    if let Some(status) = run_status {
                        entries.push((t.issue_id, status));
                    } else if let Some(agg_status) = t.latest_status {
                        fallback_ids.push(t.issue_id.clone());
                        entries.push((t.issue_id, agg_status));
                    }
                }

                Ok::<_, anyhow::Error>((entries, fallback_ids))
            });
        }

        let mut results: Vec<(String, LatestTestStatus)> = Vec::new();
        let mut all_fallback_ids: Vec<String> = Vec::new();

        while let Some(join_result) = join_set.join_next().await {
            let (entries, fallback_ids) =
                join_result.expect("status batch task should not panic")?;
            results.extend(entries);
            all_fallback_ids.extend(fallback_ids);
        }

        // ── Phase 2: single consolidated fallback ────────────────────────────
        if !all_fallback_ids.is_empty() {
            let fallback_query = r#"
                query GetFallbackRuns($testIssueIds: [String]!, $limit: Int!) {
                    getTestRuns(testIssueIds: $testIssueIds, limit: $limit) {
                        total
                        results {
                            status { name color description final }
                            test { issueId }
                        }
                    }
                }
            "#;

            let fb_limit = (all_fallback_ids.len() as u32).saturating_mul(5).max(50);
            if let Ok(fb) = self
                .graphql::<TestRunsForHealthResult>(
                    fallback_query,
                    serde_json::json!({
                        "testIssueIds": all_fallback_ids,
                        "limit": fb_limit,
                    }),
                )
                .await
            {
                let mut best: std::collections::HashMap<String, LatestTestStatus> =
                    std::collections::HashMap::new();
                for run in fb.get_test_runs.results {
                    if let Some(status) = run.status {
                        best.entry(run.test.issue_id).or_insert(status);
                    }
                }
                for (id, status) in &mut results {
                    if let Some(real) = best.remove(id) {
                        *status = real;
                    }
                }
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
                        scenarioType
                        defects
                        parameters { name value }
                        test {
                            issueId
                            jira(fields: ["key", "summary"])
                        }
                        evidence {
                            id filename storedInJira downloadLink size createdOn
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
                            evidence {
                                id filename storedInJira downloadLink size createdOn
                            }
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
                            name
                            log
                            duration
                            backgrounds {
                                keyword name status { name color description } error duration
                                embeddings { filename mimeType data downloadLink }
                            }
                            hooks {
                                keyword name status { name color description } error duration
                                embeddings { filename mimeType data downloadLink }
                            }
                            steps {
                                keyword name status { name color description } error duration
                                embeddings { filename mimeType data downloadLink }
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

    /// Fetches status + test identity for each test run in an execution.
    ///
    /// Lighter than `get_test_runs` (no steps, iterations, Gherkin, evidence, or
    /// parameters) but includes the test issue ID and Jira key/summary so that
    /// version-stats aggregation can track per-test history across executions.
    /// Page size 100 covers the vast majority of executions in a single call.
    pub async fn get_test_run_stats(
        &self,
        test_execution_issue_id: &str,
        limit: u32,
        start: u32,
    ) -> Result<crate::models::xray::TestRunStatsResult> {
        let query = r#"
            query GetTestRunStats($issueId: String!, $limit: Int!, $start: Int) {
                getTestRuns(testExecIssueIds: [$issueId], limit: $limit, start: $start) {
                    total
                    start
                    limit
                    results {
                        status { name }
                        test {
                            issueId
                            jira(fields: ["key", "summary"])
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
