use anyhow::Result;
use tauri::Emitter;

use crate::models::xray::{
    HealthBatch, LatestTestStatus, TestLastRunEntry, TestRunsForHealthResult, TestsForHealthResult,
};

use super::XrayClient;

impl XrayClient {
    // ── Test Health (batched last-run fetch) ──────────────────────────────────

    /// Fetches the most-recent run for each test by querying `getTests` in
    /// small batches using `jql: "id in (...)"` with `testRuns(limit: 1)`.
    ///
    /// Batches are processed with bounded concurrency (`MAX_CONCURRENT` in
    /// flight at a time) so multiple API calls overlap without triggering
    /// rate limits. Each batch emits a `tests:health:batch` event as soon as
    /// it resolves, so the frontend sees incremental progress.
    pub async fn stream_health_batched(
        &self,
        app: &tauri::AppHandle,
        test_issue_ids: &[String],
    ) -> Result<()> {
        if test_issue_ids.is_empty() {
            let _ = app.emit(
                "tests:health:batch",
                HealthBatch { entries: vec![], done: true, total: 0, processed: 0 },
            );
            return Ok(());
        }

        // Primary query: get the most recent test run AND the cross-version latestStatus.
        let query = r#"
            query GetTestsHealth($jql: String!, $limit: Int!) {
                getTests(jql: $jql, limit: $limit, start: 0) {
                    results {
                        issueId
                        status { name color final }
                        testRuns(limit: 1) {
                            results {
                                finishedOn
                                status { name color final }
                            }
                        }
                    }
                }
            }
        "#;

        // Fallback query: for tests that have a latestStatus but no testRuns (version mismatch),
        // fetch their most recent run by testIssueId across ALL versions.
        let fallback_query = r#"
            query GetFallbackRuns($testIssueIds: [String]!, $limit: Int!) {
                getTestRuns(testIssueIds: $testIssueIds, limit: $limit) {
                    total
                    results {
                        finishedOn
                        status { name color final }
                        test { issueId }
                    }
                }
            }
        "#;

        const BATCH_SIZE: usize = 50;
        /// Max parallel API calls to avoid 429 rate-limit errors.
        const MAX_CONCURRENT: usize = 3;

        let total = test_issue_ids.len() as u32;
        let chunks: Vec<&[String]> = test_issue_ids.chunks(BATCH_SIZE).collect();
        let num_chunks = chunks.len();
        #[cfg(not(debug_assertions))]
        let _ = num_chunks;

        #[cfg(debug_assertions)]
        eprintln!(
            "[health] starting: {} tests, batch size {}, {} chunks, concurrency {}",
            total, BATCH_SIZE, num_chunks, MAX_CONCURRENT
        );

        // Semaphore-gated concurrency: up to MAX_CONCURRENT in-flight requests.
        let semaphore = std::sync::Arc::new(tokio::sync::Semaphore::new(MAX_CONCURRENT));
        let mut join_set = tokio::task::JoinSet::new();

        // Spawn all batch tasks — each acquires a semaphore permit before
        // hitting the API, so at most MAX_CONCURRENT are in flight.
        for (idx, chunk) in chunks.into_iter().enumerate() {
            let sem = semaphore.clone();
            let client = self.clone();
            let app_handle = app.clone();
            let chunk_ids: Vec<String> = chunk.to_vec();
            let query = query.to_owned();
            let fallback_query = fallback_query.to_owned();

            join_set.spawn(async move {
                let _permit = sem
                    .acquire()
                    .await
                    .expect("semaphore should not be closed");

                #[cfg(debug_assertions)]
                eprintln!("[health] batch {}/{}: querying {} tests", idx + 1, num_chunks, chunk_ids.len());

                let result = Self::process_health_batch(
                    &client,
                    &query,
                    &fallback_query,
                    &chunk_ids,
                )
                .await;

                (idx, chunk_ids.len() as u32, result, app_handle)
            });
        }

        // Collect results as they complete and emit progress events.
        let mut processed: u32 = 0;
        let mut first_error: Option<anyhow::Error> = None;

        while let Some(join_result) = join_set.join_next().await {
            let (idx, chunk_len, batch_result, app_handle) = join_result
                .expect("health batch task should not panic");
            #[cfg(not(debug_assertions))]
            let _ = idx;

            processed += chunk_len;
            let done = processed >= total;

            match batch_result {
                Ok(entries) => {
                    #[cfg(debug_assertions)]
                    eprintln!(
                        "[health] batch {} done: {} entries, {}/{} processed, done={}",
                        idx + 1, entries.len(), processed, total, done
                    );
                    let _ = app_handle.emit(
                        "tests:health:batch",
                        HealthBatch { entries, done, total, processed },
                    );
                }
                Err(e) => {
                    #[cfg(debug_assertions)]
                    eprintln!("[health] batch {} error: {:#}", idx + 1, e);
                    // Emit an empty batch so the frontend still tracks progress.
                    let _ = app_handle.emit(
                        "tests:health:batch",
                        HealthBatch { entries: vec![], done, total, processed },
                    );
                    if first_error.is_none() {
                        first_error = Some(e);
                    }
                }
            }
        }

        if let Some(e) = first_error {
            return Err(e);
        }
        Ok(())
    }

    /// Process a single health batch: run the primary query, then the fallback
    /// query for tests with `latestStatus` but no `testRuns`.
    async fn process_health_batch(
        client: &XrayClient,
        query: &str,
        fallback_query: &str,
        chunk_ids: &[String],
    ) -> Result<Vec<TestLastRunEntry>> {
        let ids_jql = chunk_ids.join(", ");
        let jql = format!("id in ({ids_jql})");

        let result: TestsForHealthResult = client
            .graphql(
                query,
                serde_json::json!({ "jql": jql, "limit": chunk_ids.len() as u32 }),
            )
            .await?;

        let mut entries: Vec<TestLastRunEntry> = Vec::new();
        let mut fallback_ids: Vec<String> = Vec::new();

        for t in result.get_tests.results {
            let run = t.test_runs.and_then(|tr| tr.results.into_iter().next());
            if let Some(run) = run {
                entries.push(TestLastRunEntry {
                    test_issue_id: t.issue_id,
                    finished_on: run.finished_on,
                    started_on: None,
                    status: run.status.or(t.latest_status),
                });
            } else if t.latest_status.is_some() {
                fallback_ids.push(t.issue_id.clone());
                entries.push(TestLastRunEntry {
                    test_issue_id: t.issue_id,
                    finished_on: None,
                    started_on: None,
                    status: t.latest_status,
                });
            }
        }

        // Secondary pass: retrieve finishedOn for version-mismatched tests.
        if !fallback_ids.is_empty() {
            #[cfg(debug_assertions)]
            eprintln!(
                "[health] fallback query for {} tests with latestStatus but no testRuns",
                fallback_ids.len()
            );
            let fallback_limit = (fallback_ids.len() as u32).saturating_mul(5).max(50);
            match client
                .graphql::<TestRunsForHealthResult>(
                    fallback_query,
                    serde_json::json!({ "testIssueIds": fallback_ids, "limit": fallback_limit }),
                )
                .await
            {
                Err(e) => {
                    #[cfg(debug_assertions)]
                    eprintln!("[health] fallback query error (non-fatal): {:#}", e);
                    #[cfg(not(debug_assertions))]
                    let _ = e;
                }
                Ok(fb) => {
                    let mut best: std::collections::HashMap<
                        String,
                        (Option<String>, Option<LatestTestStatus>),
                    > = std::collections::HashMap::new();
                    for run in fb.get_test_runs.results {
                        let entry = best.entry(run.test.issue_id).or_insert((None, None));
                        // Prefer runs that have a finished_on timestamp. A run without a
                        // timestamp only sets the status if no timestamped run has been seen yet.
                        if run.finished_on.is_some() || entry.0.is_none() {
                            *entry = (run.finished_on, run.status);
                        }
                    }
                    #[cfg(debug_assertions)]
                    eprintln!(
                        "[health] fallback resolved dates for {}/{} tests",
                        best.len(),
                        fallback_ids.len()
                    );
                    for entry in &mut entries {
                        if entry.finished_on.is_none() {
                            if let Some((finished_on, status)) = best.get(&entry.test_issue_id) {
                                entry.finished_on = finished_on.clone();
                                // Always override the aggregated status with the
                                // actual run status from the fallback query.
                                if let Some(real_status) = status {
                                    entry.status = Some(real_status.clone());
                                }
                            }
                        }
                    }
                }
            }
        }

        Ok(entries)
    }
}
