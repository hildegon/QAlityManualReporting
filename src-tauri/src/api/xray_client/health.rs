use anyhow::Result;
use std::collections::HashMap;
use tauri::Emitter;

use crate::models::xray::{
    HealthBatch, LatestTestStatus, TestLastRunEntry, TestRunsForHealthResult, TestsForHealthResult,
};

use super::XrayClient;

impl XrayClient {
    // ── Test Health (batched last-run fetch) ──────────────────────────────────

    /// Fetches the most-recent run for each test in two phases:
    ///
    /// **Phase 1** — Query `getTests(jql: "id in (...)")` with `testRuns(limit: 1)`
    /// in batches of 100, running up to `MAX_CONCURRENT` in parallel. Each batch
    /// emits a `tests:health:batch` event so the frontend sees incremental progress.
    ///
    /// **Phase 2** — For tests whose aggregated `status` is set but `testRuns` is
    /// empty (version mismatch after editing), a **single** consolidated
    /// `getTestRuns` query resolves the actual `finishedOn` timestamps and run
    /// statuses. This replaces the old per-batch fallback pattern, eliminating
    /// up to N−1 redundant API calls.
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

        const BATCH_SIZE: usize = 100;
        const MAX_CONCURRENT: usize = 5;

        let total = test_issue_ids.len() as u32;
        let chunks: Vec<&[String]> = test_issue_ids.chunks(BATCH_SIZE).collect();

        #[cfg(debug_assertions)]
        eprintln!(
            "[health] starting: {} tests, batch size {}, {} chunks, concurrency {}",
            total, BATCH_SIZE, chunks.len(), MAX_CONCURRENT
        );

        // ── Phase 1: primary queries (concurrent) ────────────────────────────
        let semaphore = std::sync::Arc::new(tokio::sync::Semaphore::new(MAX_CONCURRENT));
        let mut join_set = tokio::task::JoinSet::new();

        for (idx, chunk) in chunks.into_iter().enumerate() {
            let sem = semaphore.clone();
            let client = self.clone();
            let app_handle = app.clone();
            let chunk_ids: Vec<String> = chunk.to_vec();
            let query = query.to_owned();

            join_set.spawn(async move {
                let _permit = sem
                    .acquire()
                    .await
                    .expect("semaphore should not be closed");

                #[cfg(debug_assertions)]
                eprintln!("[health] batch {}: querying {} tests", idx + 1, chunk_ids.len());

                let result = Self::run_primary_batch(&client, &query, &chunk_ids).await;
                (idx, chunk_ids.len() as u32, result, app_handle)
            });
        }

        // Collect primary results and emit progress events.
        let mut all_entries: Vec<TestLastRunEntry> = Vec::new();
        let mut all_fallback_ids: Vec<String> = Vec::new();
        let mut processed: u32 = 0;
        let mut first_error: Option<anyhow::Error> = None;

        while let Some(join_result) = join_set.join_next().await {
            let (idx, chunk_len, batch_result, app_handle) = join_result
                .expect("health batch task should not panic");
            #[cfg(not(debug_assertions))]
            let _ = idx;

            processed += chunk_len;

            match batch_result {
                Ok((entries, fallback_ids)) => {
                    #[cfg(debug_assertions)]
                    eprintln!(
                        "[health] batch {} done: {} entries, {} need fallback, {}/{} processed",
                        idx + 1, entries.len(), fallback_ids.len(), processed, total
                    );
                    // Emit progress (not done yet — fallback phase still pending).
                    let _ = app_handle.emit(
                        "tests:health:batch",
                        HealthBatch {
                            entries: entries.clone(),
                            done: false,
                            total,
                            processed,
                        },
                    );
                    all_entries.extend(entries);
                    all_fallback_ids.extend(fallback_ids);
                }
                Err(e) => {
                    #[cfg(debug_assertions)]
                    eprintln!("[health] batch {} error: {:#}", idx + 1, e);
                    let _ = app_handle.emit(
                        "tests:health:batch",
                        HealthBatch { entries: vec![], done: false, total, processed },
                    );
                    if first_error.is_none() {
                        first_error = Some(e);
                    }
                }
            }
        }

        // ── Phase 2: single consolidated fallback ────────────────────────────
        if !all_fallback_ids.is_empty() {
            #[cfg(debug_assertions)]
            eprintln!(
                "[health] fallback: resolving finishedOn for {} version-mismatched tests",
                all_fallback_ids.len()
            );

            let patched = self
                .run_fallback_query(&all_fallback_ids, &mut all_entries)
                .await;

            if let Err(e) = patched {
                #[cfg(debug_assertions)]
                eprintln!("[health] fallback query error (non-fatal): {:#}", e);
                // Non-fatal: entries already have latestStatus from phase 1.
            }
        }

        // Emit final "done" event with the patched entries from fallback.
        // Send only the entries that were updated by the fallback so the
        // frontend merges them into the accumulator.
        let _ = app.emit(
            "tests:health:batch",
            HealthBatch {
                entries: if all_fallback_ids.is_empty() {
                    vec![]
                } else {
                    // Re-send only fallback-patched entries.
                    all_entries
                        .iter()
                        .filter(|e| all_fallback_ids.contains(&e.test_issue_id))
                        .cloned()
                        .collect()
                },
                done: true,
                total,
                processed: total,
            },
        );

        if let Some(e) = first_error {
            return Err(e);
        }
        Ok(())
    }

    /// Run a single primary batch: `getTests(jql: "id in (...)")` with nested `testRuns(limit: 1)`.
    /// Returns `(entries, fallback_ids)` — entries for all tests found, and the IDs of tests
    /// that have `latestStatus` but no `testRuns` (need fallback for `finishedOn`).
    async fn run_primary_batch(
        client: &XrayClient,
        query: &str,
        chunk_ids: &[String],
    ) -> Result<(Vec<TestLastRunEntry>, Vec<String>)> {
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

        Ok((entries, fallback_ids))
    }

    /// Run a single consolidated fallback query for all version-mismatched tests.
    /// Patches `finished_on` and `status` in-place on the entries that need it.
    async fn run_fallback_query(
        &self,
        fallback_ids: &[String],
        entries: &mut [TestLastRunEntry],
    ) -> Result<()> {
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

        // Request enough results to cover all fallback tests (5 runs per test should
        // be more than sufficient to find the latest for each).
        let limit = (fallback_ids.len() as u32).saturating_mul(5).max(50);
        let fb: TestRunsForHealthResult = self
            .graphql(
                fallback_query,
                serde_json::json!({ "testIssueIds": fallback_ids, "limit": limit }),
            )
            .await?;

        // Build a map of best (most recent) run per test.
        let mut best: HashMap<String, (Option<String>, Option<LatestTestStatus>)> = HashMap::new();
        for run in fb.get_test_runs.results {
            let entry = best.entry(run.test.issue_id).or_insert((None, None));
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

        // Patch entries in-place.
        for entry in entries.iter_mut() {
            if entry.finished_on.is_none() {
                if let Some((finished_on, status)) = best.get(&entry.test_issue_id) {
                    entry.finished_on = finished_on.clone();
                    if let Some(real_status) = status {
                        entry.status = Some(real_status.clone());
                    }
                }
            }
        }

        Ok(())
    }
}
