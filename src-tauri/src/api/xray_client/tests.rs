use anyhow::Result;
use tauri::Emitter;

use crate::api::common::validate_project_key;
use crate::models::xray::{
    FirstPageResult, TestsExportResult, TestsResult, TestsStreamPage, XrayTest, XrayTestDetail,
    XrayTestDetailResult, XrayTestExportData,
};

use super::XrayClient;

impl XrayClient {
    // ── Get Tests ─────────────────────────────────────────────────────────────

    /// Shared GraphQL query string for `getTests` pagination.
    fn tests_gql_query() -> &'static str {
        r#"
            query GetTests($jql: String, $limit: Int!, $start: Int) {
                getTests(jql: $jql, limit: $limit, start: $start) {
                    total
                    start
                    limit
                    results {
                        issueId
                        testType { name }
                        jira(fields: ["key", "summary", "status", "priority", "components", "labels", "created", "assignee"])
                    }
                }
            }
        "#
    }

    /// Fetch the **first page** of tests for a project and return immediately.
    ///
    /// If there are more pages (`done == false`), the caller is responsible for
    /// fetching the rest via [`get_tests_from`] and streaming results to the UI.
    pub async fn get_tests_first_page(
        &self,
        project_key: &str,
    ) -> Result<FirstPageResult<XrayTest>> {
        const PAGE_SIZE: u32 = 100;
        validate_project_key(project_key)?;
        let jql = format!("project = '{project_key}'");
        let result: TestsResult = self
            .graphql(
                Self::tests_gql_query(),
                serde_json::json!({ "jql": jql, "limit": PAGE_SIZE, "start": 0 }),
            )
            .await?;
        let page = result.get_tests;
        let fetched = page.results.len() as u32;
        let total = page.total;
        Ok(FirstPageResult {
            done: fetched >= total,
            results: page.results,
            total,
        })
    }

    /// Fetch all remaining tests starting from `start_offset`.
    ///
    /// Used by the background task after [`get_tests_first_page`] has already
    /// returned the first page to the UI.
    #[allow(dead_code)]
    pub async fn get_tests_from(
        &self,
        project_key: &str,
        mut start: u32,
        total: u32,
    ) -> Result<Vec<XrayTest>> {
        const PAGE_SIZE: u32 = 100;
        let jql = format!("project = '{project_key}'");
        let mut all: Vec<XrayTest> = Vec::new();
        loop {
            let result: TestsResult = self
                .graphql(
                    Self::tests_gql_query(),
                    serde_json::json!({ "jql": jql, "limit": PAGE_SIZE, "start": start }),
                )
                .await?;
            let page = result.get_tests;
            let fetched = page.results.len() as u32;
            all.extend(page.results);
            start += fetched;
            if fetched == 0 || start >= total {
                break;
            }
        }
        Ok(all)
    }

    /// Fetch **all** tests for a project, paginating automatically.
    #[allow(dead_code)]
    pub async fn get_tests(&self, project_key: &str) -> Result<Vec<XrayTest>> {
        let first = self.get_tests_first_page(project_key).await?;
        if first.done {
            return Ok(first.results);
        }
        let mut all = first.results;
        let rest = self
            .get_tests_from(project_key, all.len() as u32, first.total)
            .await?;
        all.extend(rest);
        Ok(all)
    }

    /// Fetch remaining test pages starting at `start`, emitting a `tests:page`
    /// Tauri event for each page so the frontend can render progressively.
    /// Designed to run in a `tokio::spawn` background task.
    pub async fn stream_tests_from(
        &self,
        app: &tauri::AppHandle,
        project_key: &str,
        mut start: u32,
        total: u32,
    ) -> Result<()> {
        const PAGE_SIZE: u32 = 100;
        let jql = format!("project = '{project_key}'");
        loop {
            let result: TestsResult = self
                .graphql(
                    Self::tests_gql_query(),
                    serde_json::json!({ "jql": jql, "limit": PAGE_SIZE, "start": start }),
                )
                .await?;
            let page = result.get_tests;
            let fetched = page.results.len() as u32;
            start += fetched;
            let done = fetched == 0 || start >= total;
            let _ = app.emit(
                "tests:page",
                TestsStreamPage {
                    project_key: project_key.to_string(),
                    tests: page.results,
                    done,
                },
            );
            if done {
                break;
            }
        }
        Ok(())
    }

    // ── Export (tests with steps) ─────────────────────────────────────────────

    /// Fetch full detail (testType, steps, gherkin) for a single test by its Jira key.
    pub async fn get_test_detail(&self, test_key: &str) -> Result<Option<XrayTestDetail>> {
        let query = r#"
            query GetTestDetail($jql: String!, $limit: Int!) {
                getTests(jql: $jql, limit: $limit, start: 0) {
                    results {
                        issueId
                        testType { name kind }
                        steps {
                            id
                            action
                            data
                            result
                        }
                        gherkin
                        unstructured
                    }
                }
            }
        "#;
        let jql = format!("key = \"{test_key}\"");
        let result: XrayTestDetailResult = self
            .graphql(query, serde_json::json!({ "jql": jql, "limit": 1 }))
            .await?;
        Ok(result.get_tests.results.into_iter().next())
    }

    /// Find the latest test execution that a specific test is involved in.
    ///
    /// Uses `getTest(issueId) { testExecutions(limit, start) }` and paginates
    /// all executions, returning the execution with the highest numeric issueId
    /// (= most recently created).
    pub async fn get_latest_execution_for_test(
        &self,
        test_issue_id: &str,
    ) -> Result<Option<String>> {
        #[derive(serde::Deserialize)]
        struct Resp {
            #[serde(rename = "getTest")]
            get_test: Option<TestNode>,
        }
        #[derive(serde::Deserialize)]
        struct TestNode {
            #[serde(rename = "testExecutions")]
            test_executions: Option<ExecPage>,
        }
        #[derive(serde::Deserialize)]
        struct ExecPage {
            total: u32,
            results: Vec<ExecRow>,
        }
        #[derive(serde::Deserialize)]
        struct ExecRow {
            #[serde(rename = "issueId")]
            issue_id: String,
        }

        let query = r#"
            query GetTestExecs($issueId: String!, $limit: Int!, $start: Int) {
                getTest(issueId: $issueId) {
                    testExecutions(limit: $limit, start: $start) {
                        total
                        results {
                            issueId
                        }
                    }
                }
            }
        "#;

        let page_size: u32 = 100;

        // First call: fetch page 0 to discover `total`.
        let resp: Resp = self
            .graphql(
                query,
                serde_json::json!({
                    "issueId": test_issue_id,
                    "limit": page_size,
                    "start": 0u32,
                }),
            )
            .await?;

        let Some(test_node) = resp.get_test else {
            return Ok(None);
        };
        let Some(page) = test_node.test_executions else {
            return Ok(None);
        };

        let total = page.total;

        // Helper: find the highest numeric issueId in a page.
        let best_in = |rows: &[ExecRow]| -> Option<(i64, String)> {
            rows.iter()
                .filter_map(|r| r.issue_id.parse::<i64>().ok().map(|n| (n, r.issue_id.clone())))
                .max_by_key(|(n, _)| *n)
        };

        let mut best = best_in(&page.results);

        // If everything fit in the first page, we're done.
        if total <= page_size {
            return Ok(best.map(|(_, s)| s));
        }

        // Otherwise, jump straight to the LAST page — the highest issueId is
        // almost certainly there since executions are created in order.
        let last_start = total.saturating_sub(page_size);
        let resp2: Resp = self
            .graphql(
                query,
                serde_json::json!({
                    "issueId": test_issue_id,
                    "limit": page_size,
                    "start": last_start,
                }),
            )
            .await?;

        if let Some(test_node) = resp2.get_test {
            if let Some(page2) = test_node.test_executions {
                if let Some(last_best) = best_in(&page2.results) {
                    match &best {
                        Some((prev, _)) if last_best.0 > *prev => best = Some(last_best),
                        None => best = Some(last_best),
                        _ => {}
                    }
                }
            }
        }

        Ok(best.map(|(_, s)| s))
    }

    /// Fetch steps, gherkin, and unstructured content for the given test issue IDs.
    ///
    /// Queries in batches of 50 using `id in (...)` JQL so the main test-list
    /// query stays lean. Returns one entry per test.
    pub async fn get_tests_export_data(
        &self,
        test_issue_ids: &[String],
    ) -> Result<Vec<XrayTestExportData>> {
        const BATCH_SIZE: usize = 50;
        let mut all: Vec<XrayTestExportData> = Vec::new();

        let query = r#"
            query GetTestsExport($jql: String!, $limit: Int!) {
                getTests(jql: $jql, limit: $limit, start: 0) {
                    results {
                        issueId
                        steps {
                            id
                            action
                            data
                            result
                        }
                        gherkin
                        unstructured
                    }
                }
            }
        "#;

        for chunk in test_issue_ids.chunks(BATCH_SIZE) {
            let ids_jql = chunk.join(", ");
            let jql = format!("id in ({ids_jql})");
            let result: TestsExportResult = self
                .graphql(query, serde_json::json!({ "jql": jql, "limit": chunk.len() as u32 }))
                .await?;
            all.extend(result.get_tests.results);
        }

        Ok(all)
    }
}
