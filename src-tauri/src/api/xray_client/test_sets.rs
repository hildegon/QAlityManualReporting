use anyhow::Result;
use std::collections::HashMap;

use crate::api::common::validate_project_key;
use crate::models::xray::{
    FirstPageResult, TestSetMemberIds, TestSetMemberInfo, TestSetMembershipsResponse,
    TestSetResult, TestSetWithStatusResult, TestSetsResult, TestSetsWithMembersResult, XrayTest,
    XrayTestSet, XrayTestWithStatus,
};

use super::XrayClient;

impl XrayClient {
    // ── Test Sets ─────────────────────────────────────────────────────────────

    /// Shared GraphQL query string for `getTestSets` pagination.
    fn test_sets_gql_query() -> &'static str {
        r#"
            query GetTestSets($jql: String!, $limit: Int!, $start: Int) {
                getTestSets(jql: $jql, limit: $limit, start: $start) {
                    total
                    start
                    limit
                    results {
                        issueId
                        jira(fields: ["key", "summary", "status"])
                    }
                }
            }
        "#
    }

    /// Fetch the **first page** of test sets for a project and return immediately.
    pub async fn get_test_sets_first_page(
        &self,
        project_key: &str,
    ) -> Result<FirstPageResult<XrayTestSet>> {
        const PAGE_SIZE: u32 = 100;
        validate_project_key(project_key)?;
        let jql = format!("project = '{project_key}'");
        let result: TestSetsResult = self
            .graphql(
                Self::test_sets_gql_query(),
                serde_json::json!({ "jql": jql, "limit": PAGE_SIZE, "start": 0 }),
            )
            .await?;
        let page = result.get_test_sets;
        let fetched = page.results.len() as u32;
        let total = page.total;
        Ok(FirstPageResult {
            done: fetched >= total,
            results: page.results,
            total,
        })
    }

    /// Fetch all remaining test sets starting from `start_offset`.
    pub async fn get_test_sets_from(
        &self,
        project_key: &str,
        mut start: u32,
        total: u32,
    ) -> Result<Vec<XrayTestSet>> {
        const PAGE_SIZE: u32 = 100;
        let jql = format!("project = '{project_key}'");
        let mut all: Vec<XrayTestSet> = Vec::new();
        loop {
            let result: TestSetsResult = self
                .graphql(
                    Self::test_sets_gql_query(),
                    serde_json::json!({ "jql": jql, "limit": PAGE_SIZE, "start": start }),
                )
                .await?;
            let page = result.get_test_sets;
            let fetched = page.results.len() as u32;
            all.extend(page.results);
            start += fetched;
            if fetched == 0 || start >= total {
                break;
            }
        }
        Ok(all)
    }

    /// Fetch **all** test sets for a project, paginating automatically.
    pub async fn get_test_sets(&self, project_key: &str) -> Result<Vec<XrayTestSet>> {
        let first = self.get_test_sets_first_page(project_key).await?;
        if first.done {
            return Ok(first.results);
        }
        let mut all = first.results;
        let rest = self
            .get_test_sets_from(project_key, all.len() as u32, first.total)
            .await?;
        all.extend(rest);
        Ok(all)
    }

    /// Fetch all tests belonging to a specific test set, including each test's
    /// latest execution status (for the Coverage page).
    pub async fn get_test_set_tests_with_status(
        &self,
        issue_id: &str,
    ) -> Result<Vec<XrayTestWithStatus>> {
        let query = r#"
            query GetTestSetWithStatus($issueId: String!, $limit: Int!) {
                getTestSet(issueId: $issueId) {
                    issueId
                    tests(limit: $limit) {
                        results {
                            issueId
                            jira(fields: ["key", "summary", "status"])
                            status {
                                name
                                color
                                description
                                final
                            }
                        }
                    }
                }
            }
        "#;
        let result: TestSetWithStatusResult = self
            .graphql(
                query,
                serde_json::json!({ "issueId": issue_id, "limit": 500 }),
            )
            .await?;
        Ok(result.get_test_set.tests.results)
    }

    /// Fetch tests-with-status for **multiple** test sets concurrently, then
    /// do a single consolidated `get_latest_run_statuses_for_tests` across ALL
    /// test IDs.  This replaces the N+1 pattern where each set triggered its
    /// own status-lookup round-trip.
    ///
    /// Returns a map of `set_issue_id → Vec<XrayTestWithStatus>`.
    pub async fn get_test_sets_tests_with_status_batch(
        &self,
        set_issue_ids: &[String],
    ) -> Result<HashMap<String, Vec<XrayTestWithStatus>>> {
        use tokio::task::JoinSet;

        if set_issue_ids.is_empty() {
            return Ok(HashMap::new());
        }

        // ── Phase 1: fetch tests per set concurrently ────────────────────────
        const MAX_CONCURRENT: usize = 6;
        let semaphore = std::sync::Arc::new(tokio::sync::Semaphore::new(MAX_CONCURRENT));
        let mut join_set = JoinSet::new();

        for set_id in set_issue_ids {
            let sem = semaphore.clone();
            let client = self.clone();
            let sid = set_id.clone();

            join_set.spawn(async move {
                let _permit = sem.acquire().await.expect("semaphore closed");
                let tests = client.get_test_set_tests_with_status(&sid).await?;
                Ok::<_, anyhow::Error>((sid, tests))
            });
        }

        let mut per_set: HashMap<String, Vec<XrayTestWithStatus>> = HashMap::new();
        while let Some(join_result) = join_set.join_next().await {
            let (sid, tests) = join_result.expect("set-fetch task should not panic")?;
            per_set.insert(sid, tests);
        }

        // ── Phase 2: single consolidated status lookup ───────────────────────
        // Collect every unique test ID across all sets.
        let mut all_test_ids: Vec<String> = Vec::new();
        let mut seen = std::collections::HashSet::new();
        for tests in per_set.values() {
            for t in tests {
                if seen.insert(t.issue_id.clone()) {
                    all_test_ids.push(t.issue_id.clone());
                }
            }
        }

        if !all_test_ids.is_empty() {
            match self.get_latest_run_statuses_for_tests(&all_test_ids).await {
                Ok(statuses) => {
                    let map: HashMap<String, _> = statuses.into_iter().collect();
                    for tests in per_set.values_mut() {
                        for test in tests.iter_mut() {
                            if let Some(real_status) = map.get(&test.issue_id) {
                                test.latest_status = Some(real_status.clone());
                            }
                        }
                    }
                }
                Err(e) => {
                    // Non-fatal: fall back to Xray's aggregated status.
                    eprintln!(
                        "Warning: batch status fetch failed, using aggregated statuses: {e:#}"
                    );
                }
            }
        }

        Ok(per_set)
    }

    /// Fetch all tests belonging to a specific test set.
    pub async fn get_test_set_tests(&self, issue_id: &str) -> Result<Vec<XrayTest>> {
        let query = r#"
            query GetTestSet($issueId: String!, $limit: Int!) {
                getTestSet(issueId: $issueId) {
                    issueId
                    tests(limit: $limit) {
                        results {
                            issueId
                            jira(fields: ["key", "summary"])
                        }
                    }
                }
            }
        "#;
        let result: TestSetResult = self
            .graphql(
                query,
                serde_json::json!({ "issueId": issue_id, "limit": 500 }),
            )
            .await?;
        Ok(result.get_test_set.tests.results)
    }

    /// Fetch all test sets for a project and their member tests in one backend
    /// call, building a membership map keyed by test issue ID.
    ///
    /// Uses a `getTestSets` query with nested `tests(limit: 500)` to avoid the
    /// N+1 problem — all membership data arrives in 1–2 paginated requests
    /// instead of one request per test set.
    pub async fn get_all_test_set_memberships(
        &self,
        project_key: &str,
    ) -> Result<TestSetMembershipsResponse> {
        let query = r#"
            query GetTestSetsWithMembers($jql: String!, $limit: Int!, $start: Int) {
                getTestSets(jql: $jql, limit: $limit, start: $start) {
                    total
                    start
                    limit
                    results {
                        issueId
                        jira(fields: ["key", "summary", "status"])
                        tests(limit: 100) {
                            total
                            results {
                                issueId
                            }
                        }
                    }
                }
            }
        "#;

        // Query used to paginate remaining members for test sets with >100 tests.
        let overflow_query = r#"
            query GetTestSetTests($issueId: String!, $limit: Int!, $start: Int) {
                getTestSet(issueId: $issueId) {
                    tests(limit: $limit, start: $start) {
                        total
                        results {
                            issueId
                        }
                    }
                }
            }
        "#;

        const PAGE_SIZE: u32 = 100;
        validate_project_key(project_key)?;
        let jql = format!("project = '{project_key}'");

        let mut memberships: HashMap<String, Vec<TestSetMemberInfo>> = HashMap::new();
        let mut test_sets: Vec<XrayTestSet> = Vec::new();
        let mut start: u32 = 0;

        // Collect test set IDs that need follow-up queries (>100 members).
        let mut overflow_sets: Vec<(String, TestSetMemberInfo, u32)> = Vec::new();

        loop {
            let result: TestSetsWithMembersResult = self
                .graphql(
                    query,
                    serde_json::json!({ "jql": jql, "limit": PAGE_SIZE, "start": start }),
                )
                .await?;
            let page = result.get_test_sets;
            let fetched = page.results.len() as u32;

            for ts in page.results {
                let info = TestSetMemberInfo {
                    issue_id: ts.issue_id.clone(),
                    key: ts.jira.key.clone(),
                    summary: ts.jira.summary.clone(),
                };

                for member in &ts.tests.results {
                    memberships
                        .entry(member.issue_id.clone())
                        .or_default()
                        .push(info.clone());
                }

                // If this test set has more than 100 members, queue follow-up.
                let members_total = ts.tests.total.unwrap_or(ts.tests.results.len() as u32);
                if members_total > PAGE_SIZE {
                    overflow_sets.push((ts.issue_id.clone(), info.clone(), members_total));
                }

                test_sets.push(XrayTestSet {
                    issue_id: ts.issue_id,
                    jira: ts.jira,
                });
            }

            start += fetched;
            if fetched == 0 || start >= page.total {
                break;
            }
        }

        // Fetch remaining members for test sets with >100 tests.
        for (set_issue_id, info, total) in overflow_sets {
            let mut member_start: u32 = PAGE_SIZE; // first 100 already fetched
            while member_start < total {
                #[derive(serde::Deserialize)]
                struct OverflowWrapper {
                    tests: TestSetMemberIds,
                }

                #[derive(serde::Deserialize)]
                struct OverflowRoot {
                    #[serde(rename = "getTestSet")]
                    get_test_set: OverflowWrapper,
                }

                let resp: OverflowRoot = self
                    .graphql(
                        overflow_query,
                        serde_json::json!({
                            "issueId": set_issue_id,
                            "limit": PAGE_SIZE,
                            "start": member_start,
                        }),
                    )
                    .await?;

                let page_results = resp.get_test_set.tests.results;
                let fetched = page_results.len() as u32;
                for member in &page_results {
                    memberships
                        .entry(member.issue_id.clone())
                        .or_default()
                        .push(info.clone());
                }

                member_start += fetched;
                if fetched == 0 {
                    break;
                }
            }
        }

        Ok(TestSetMembershipsResponse {
            memberships,
            test_sets,
        })
    }
}
