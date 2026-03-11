use anyhow::{bail, Context, Result};
use reqwest::Client;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::Mutex;

use crate::models::xray::{
    AddTestExecutionsToTestPlanInput, AddTestsToTestPlanInput, CreateTestExecutionInput,
    CreateTestExecutionResponse, CreateTestExecutionResult, CreateTestPlanInput,
    CreateTestPlanResponse, CreateTestPlanResult, CreateTestResponse, CreateTestResult,
    CreateTestSetResponse, CreateTestSetResult, CreateXrayTestInput, FirstPageResult,
    GetTestRunResult, GraphQLRequest, GraphQLResponse, StatusesResult, StepStatusesResult,
    TestExecutionsResult, TestPlanResult, TestPlansResult, TestRunIteration, TestRunsResult,
    TestSetMemberInfo, TestSetMembershipsResponse, TestSetResult, TestSetWithStatusResult,
    TestSetsResult, TestsResult, UpdateTestRunStatusInput, XrayAuthRequest, XrayStepStatus,
    XrayTest, XrayTestRunStatus, XrayTestSet, XrayTestWithStatus,
};

const XRAY_AUTH_URL: &str = "https://xray.cloud.getxray.app/api/v2/authenticate";
const XRAY_GRAPHQL_URL: &str = "https://xray.cloud.getxray.app/api/v2/graphql";

/// Validate that a Jira project key contains only safe characters (`[A-Z0-9_]+`).
///
/// Jira enforces this format server-side, but we validate early to prevent JQL injection.
fn validate_project_key(key: &str) -> Result<()> {
    if key.is_empty() {
        bail!("Project key must not be empty");
    }
    if !key
        .chars()
        .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '_')
    {
        bail!(
            "Invalid project key '{}': must contain only uppercase letters, digits, or underscores",
            key
        );
    }
    Ok(())
}

/// Escape a version name for safe use inside a double-quoted JQL string literal.
///
/// Doubles any `"` characters so they become `\"` within the JQL string.
fn escape_jql_string(value: &str) -> String {
    value.replace('"', "\\\"")
}

/// Truncate a response body string for safe inclusion in error messages.
///
/// Limits the snippet to 200 characters to avoid leaking large sensitive payloads
/// into error strings that propagate to the frontend.
fn truncate_body(body: &str) -> &str {
    const MAX: usize = 200;
    if body.len() <= MAX {
        body
    } else {
        // Truncate at a char boundary.
        &body[..body
            .char_indices()
            .take_while(|(i, _)| *i < MAX)
            .last()
            .map(|(i, c)| i + c.len_utf8())
            .unwrap_or(MAX)]
    }
}

/// Parse rate-limit headers from a 429 response and return the epoch-millisecond
/// timestamp at which the block is expected to lift.
///
/// Precedence (both headers may be absent on some 429s):
/// 1. `X-RateLimit-Reset` — Unix epoch **seconds** (absolute timestamp).
/// 2. `Retry-After`       — delay in **seconds** from now.
///
/// Returns `None` if neither header is present or parseable.
fn rate_limit_until_ms(headers: &reqwest::header::HeaderMap) -> Option<u64> {
    // X-RateLimit-Reset: absolute Unix timestamp in seconds.
    if let Some(val) = headers.get("x-ratelimit-reset") {
        if let Ok(s) = val.to_str() {
            if let Ok(secs) = s.trim().parse::<u64>() {
                return Some(secs * 1_000);
            }
        }
    }
    // Retry-After: relative delay in seconds.
    if let Some(val) = headers.get("retry-after") {
        if let Ok(s) = val.to_str() {
            if let Ok(delay_secs) = s.trim().parse::<u64>() {
                let now_ms = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as u64;
                return Some(now_ms + delay_secs * 1_000);
            }
        }
    }
    None
}

/// Thread-safe Xray Cloud client with token caching.
/// Cloning is cheap — the token cache is shared via `Arc`.
#[derive(Clone)]
pub struct XrayClient {
    client: Client,
    client_id: String,
    client_secret: String,
    /// Cached bearer token — refreshed on 401 or on explicit call.
    token: Arc<Mutex<Option<String>>>,
}

impl XrayClient {
    pub fn new(client_id: String, client_secret: String) -> Self {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .expect("Failed to build HTTP client");
        Self {
            client,
            client_id,
            client_secret,
            token: Arc::new(Mutex::new(None)),
        }
    }

    /// Exchange client_id/client_secret for a Bearer token and cache it.
    pub async fn authenticate(&self) -> Result<()> {
        let body = XrayAuthRequest {
            client_id: self.client_id.clone(),
            client_secret: self.client_secret.clone(),
        };

        let response = self
            .client
            .post(XRAY_AUTH_URL)
            .json(&body)
            .send()
            .await
            .context("Failed to reach Xray authentication endpoint")?
            .error_for_status()
            .context("Xray authentication returned error status")?
            .text()
            .await
            .context("Failed to read Xray auth response")?;

        // Xray returns the token as a quoted JSON string: "\"<token>\""
        let token = response.trim().trim_matches('"').to_owned();
        *self.token.lock().await = Some(token);
        Ok(())
    }

    /// Get the cached token, authenticating if not yet available.
    async fn get_token(&self) -> Result<String> {
        {
            let guard = self.token.lock().await;
            if let Some(ref t) = *guard {
                return Ok(t.clone());
            }
        }
        self.authenticate().await?;
        let guard = self.token.lock().await;
        guard.clone().context("Token missing after authentication")
    }

    /// Execute a GraphQL query against the Xray Cloud API.
    /// Automatically retries once on 401 by re-authenticating.
    async fn graphql<T: serde::de::DeserializeOwned>(
        &self,
        query: &str,
        variables: serde_json::Value,
    ) -> Result<T> {
        let body = GraphQLRequest {
            query: query.to_owned(),
            variables,
        };

        for attempt in 0..2u8 {
            let token = self.get_token().await?;
            let resp = self
                .client
                .post(XRAY_GRAPHQL_URL)
                .bearer_auth(&token)
                .json(&body)
                .send()
                .await
                .context("Failed to send Xray GraphQL request")?;

            if resp.status() == reqwest::StatusCode::UNAUTHORIZED && attempt == 0 {
                // Clear the cached token and retry once.
                *self.token.lock().await = None;
                continue;
            }

            if resp.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
                let until_ms = rate_limit_until_ms(resp.headers());
                match until_ms {
                    Some(ms) => bail!("RATE_LIMITED:{ms}"),
                    None => bail!("RATE_LIMITED"),
                }
            }

            let status = resp.status();
            let raw_body = resp
                .text()
                .await
                .context("Failed to read Xray GraphQL response body")?;

            if !status.is_success() {
                bail!(
                    "Xray GraphQL request failed with status {status}: {}",
                    truncate_body(&raw_body)
                );
            }

            // Parse into a raw-value response first so we can check errors
            // before attempting to deserialize the typed data field.
            let gql: GraphQLResponse<serde_json::Value> = serde_json::from_str(&raw_body)
                .with_context(|| {
                    format!(
                        "Failed to parse Xray GraphQL response (status {status}). Body snippet: {}",
                        truncate_body(&raw_body)
                    )
                })?;

            // Surface GraphQL application-level errors before attempting
            // to deserialize the data payload.
            if let Some(errors) = gql.errors {
                let messages: Vec<_> = errors.iter().map(|e| e.message.as_str()).collect();
                bail!("Xray GraphQL errors: {}", messages.join("; "));
            }

            let data = gql
                .data
                .context("Xray GraphQL response contained no data")?;
            let typed: T = serde_json::from_value(data).with_context(|| {
                format!(
                    "Failed to deserialize Xray GraphQL data. Body snippet: {}",
                    truncate_body(&raw_body)
                )
            })?;
            return Ok(typed);
        }
        bail!("Xray authentication failed after retry");
    }

    // ── Test Plans ────────────────────────────────────────────────────────────

    pub async fn get_test_plans(&self, project_key: &str, limit: u32) -> Result<TestPlansResult> {
        validate_project_key(project_key)?;
        let jql = format!("project = '{project_key}'");
        let query = r#"
            query GetTestPlans($jql: String!, $limit: Int!) {
                getTestPlans(jql: $jql, limit: $limit) {
                    total
                    start
                    limit
                    results {
                        issueId
                        projectId
                        jira(fields: ["key", "summary", "status", "issuetype"])
                    }
                }
            }
        "#;
        self.graphql(query, serde_json::json!({ "jql": jql, "limit": limit }))
            .await
    }

    // ── Test Executions ───────────────────────────────────────────────────────

    pub async fn get_test_executions(
        &self,
        project_key: &str,
        limit: u32,
    ) -> Result<TestExecutionsResult> {
        validate_project_key(project_key)?;
        let jql = format!("project = '{project_key}'");
        let query = r#"
            query GetTestExecutions($jql: String!, $limit: Int!) {
                getTestExecutions(jql: $jql, limit: $limit) {
                    total
                    start
                    limit
                    results {
                        issueId
                        projectId
                        jira(fields: ["key", "summary", "status", "assignee"])
                    }
                }
            }
        "#;
        self.graphql(query, serde_json::json!({ "jql": jql, "limit": limit }))
            .await
    }

    /// Fetch test executions filtered by a specific Jira fix version name.
    pub async fn get_test_executions_by_version(
        &self,
        project_key: &str,
        version_name: &str,
        limit: u32,
    ) -> Result<TestExecutionsResult> {
        validate_project_key(project_key)?;
        let safe_version = escape_jql_string(version_name);
        let jql = format!("project = '{project_key}' AND fixVersion = \"{safe_version}\"");
        let query = r#"
            query GetTestExecutions($jql: String!, $limit: Int!) {
                getTestExecutions(jql: $jql, limit: $limit) {
                    total
                    start
                    limit
                    results {
                        issueId
                        projectId
                        jira(fields: ["key", "summary", "status", "assignee"])
                    }
                }
            }
        "#;
        self.graphql(query, serde_json::json!({ "jql": jql, "limit": limit }))
            .await
    }

    // ── Test Runs (tests inside an execution) ─────────────────────────────────

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
                        jira(fields: ["key", "summary"])
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
                        jira(fields: ["key", "summary"])
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
                            jira(fields: ["key", "summary"])
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
    /// This avoids the N+1 problem where the frontend would fire one query per
    /// test set.  Requests are issued sequentially with a small delay to stay
    /// within Xray rate limits.
    pub async fn get_all_test_set_memberships(
        &self,
        project_key: &str,
    ) -> Result<TestSetMembershipsResponse> {
        // 1. Fetch all test sets in the project (paginated automatically).
        let test_sets = self.get_test_sets(project_key).await?;

        // 2. For each test set, fetch its member tests sequentially.
        let mut memberships: HashMap<String, Vec<TestSetMemberInfo>> = HashMap::new();

        for ts in &test_sets {
            let info = TestSetMemberInfo {
                issue_id: ts.issue_id.clone(),
                key: ts.jira.key.clone(),
                summary: ts.jira.summary.clone(),
            };

            match self.get_test_set_tests(&ts.issue_id).await {
                Ok(tests) => {
                    for t in tests {
                        memberships
                            .entry(t.issue_id)
                            .or_default()
                            .push(info.clone());
                    }
                }
                Err(e) => {
                    // If one test set fails (e.g. rate limit), propagate the
                    // error so the frontend can handle it uniformly.
                    return Err(e).with_context(|| {
                        format!(
                            "Failed to fetch tests for test set {} ({})",
                            ts.jira.key, ts.issue_id
                        )
                    });
                }
            }

            // Small delay between requests to avoid hammering the API.
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        }

        Ok(TestSetMembershipsResponse {
            memberships,
            test_sets,
        })
    }

    /// Fetch all tests belonging to a specific test plan.
    pub async fn get_test_plan_tests(&self, issue_id: &str) -> Result<Vec<XrayTest>> {
        let query = r#"
            query GetTestPlan($issueId: String!, $limit: Int!) {
                getTestPlan(issueId: $issueId) {
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
        let result: TestPlanResult = self
            .graphql(
                query,
                serde_json::json!({ "issueId": issue_id, "limit": 500 }),
            )
            .await?;
        Ok(result.get_test_plan.tests.results)
    }

    // ── Create Test Execution ─────────────────────────────────────────────────
    pub async fn create_test_execution(
        &self,
        input: CreateTestExecutionInput,
    ) -> Result<CreateTestExecutionResult> {
        let query = r#"
            mutation CreateTestExecution(
                $testIssueIds: [String],
                $jira: JSON!
            ) {
                createTestExecution(
                    testIssueIds: $testIssueIds
                    jira: $jira
                ) {
                    testExecution {
                        issueId
                        jira(fields: ["key", "summary", "status"])
                    }
                    warnings
                }
            }
        "#;

        let mut fields = serde_json::Map::new();
        fields.insert(
            "summary".to_owned(),
            serde_json::json!(input.summary.trim()),
        );
        // The config field may contain either a project key (e.g. "PROJ")
        // or a numeric project ID (e.g. "10428"). Jira's issue-create API
        // uses `project.key` for the former and `project.id` for the latter.
        let pk = input.project_key.trim();
        let project_value = if pk.chars().all(|c| c.is_ascii_digit()) {
            serde_json::json!({ "id": pk })
        } else {
            serde_json::json!({ "key": pk })
        };
        fields.insert("project".to_owned(), project_value);
        if let Some(desc) = &input.description {
            fields.insert("description".to_owned(), serde_json::json!(desc));
        }

        let jira = serde_json::json!({ "fields": fields });

        let variables = serde_json::json!({
            "testIssueIds": input.test_issue_ids,
            "jira": jira,
        });

        let resp: CreateTestExecutionResponse = self.graphql(query, variables).await?;
        Ok(resp.create_test_execution)
    }

    // ── Add Test Executions to Test Plan ──────────────────────────────────────

    /// Associate one or more test executions with a test plan.
    pub async fn add_test_executions_to_test_plan(
        &self,
        input: AddTestExecutionsToTestPlanInput,
    ) -> Result<()> {
        let query = r#"
            mutation AddTestExecutionsToTestPlan(
                $issueId: String!,
                $testExecIssueIds: [String]!
            ) {
                addTestExecutionsToTestPlan(
                    issueId: $issueId,
                    testExecIssueIds: $testExecIssueIds
                ) {
                    addedTestExecutions
                    warning
                }
            }
        "#;
        let _: serde_json::Value = self
            .graphql(
                query,
                serde_json::json!({
                    "issueId": input.test_plan_issue_id,
                    "testExecIssueIds": input.test_exec_issue_ids,
                }),
            )
            .await?;
        Ok(())
    }

    // ── Get Statuses ──────────────────────────────────────────────────────────

    /// Fetch all configured test run statuses for the project.
    pub async fn get_statuses(&self, project_id: Option<&str>) -> Result<Vec<XrayTestRunStatus>> {
        let query = r#"
            query GetStatuses($projectId: String) {
                getStatuses(projectId: $projectId) {
                    name
                    description
                    final
                    color
                }
            }
        "#;
        let result: StatusesResult = self
            .graphql(query, serde_json::json!({ "projectId": project_id }))
            .await?;
        Ok(result.statuses)
    }

    // ── Update Test Run (comment / dates) ─────────────────────────────────────

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

    // ── Step Statuses ─────────────────────────────────────────────────────────

    /// Fetch all configured step statuses for the project.
    pub async fn get_step_statuses(&self, project_id: Option<&str>) -> Result<Vec<XrayStepStatus>> {
        let query = r#"
            query GetStepStatuses($projectId: String) {
                getStepStatuses(projectId: $projectId) {
                    name
                    description
                    color
                }
            }
        "#;
        let result: StepStatusesResult = self
            .graphql(query, serde_json::json!({ "projectId": project_id }))
            .await?;
        Ok(result.step_statuses)
    }

    // ── Update Test Run Step Status ───────────────────────────────────────────

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

    // ── Add Tests to Test Set ─────────────────────────────────────────────────

    /// Associate one or more tests with an existing test set.
    pub async fn add_tests_to_test_set(
        &self,
        test_set_issue_id: &str,
        test_issue_ids: &[String],
    ) -> Result<()> {
        let query = r#"
            mutation AddTestsToTestSet($issueId: String!, $testIssueIds: [String]!) {
                addTestsToTestSet(issueId: $issueId, testIssueIds: $testIssueIds) {
                    addedTests
                    warning
                }
            }
        "#;
        let _: serde_json::Value = self
            .graphql(
                query,
                serde_json::json!({
                    "issueId": test_set_issue_id,
                    "testIssueIds": test_issue_ids,
                }),
            )
            .await?;
        Ok(())
    }

    /// Remove one or more tests from an existing test set.
    pub async fn remove_tests_from_test_set(
        &self,
        test_set_issue_id: &str,
        test_issue_ids: &[String],
    ) -> Result<()> {
        let query = r#"
            mutation RemoveTestsFromTestSet($issueId: String!, $testIssueIds: [String]!) {
                removeTestsFromTestSet(issueId: $issueId, testIssueIds: $testIssueIds)
            }
        "#;
        let _: serde_json::Value = self
            .graphql(
                query,
                serde_json::json!({
                    "issueId": test_set_issue_id,
                    "testIssueIds": test_issue_ids,
                }),
            )
            .await?;
        Ok(())
    }

    // ── Add Tests to Test Execution ───────────────────────────────────────────

    /// Add one or more tests to an existing test execution.
    pub async fn add_tests_to_test_execution(
        &self,
        test_exec_issue_id: &str,
        test_issue_ids: &[String],
    ) -> Result<()> {
        let query = r#"
            mutation AddTestsToTestExecution($issueId: String!, $testIssueIds: [String]!) {
                addTestsToTestExecution(issueId: $issueId, testIssueIds: $testIssueIds) {
                    addedTests
                    warning
                }
            }
        "#;
        let _: serde_json::Value = self
            .graphql(
                query,
                serde_json::json!({
                    "issueId": test_exec_issue_id,
                    "testIssueIds": test_issue_ids,
                }),
            )
            .await?;
        Ok(())
    }

    // ── Create Test Set ───────────────────────────────────────────────────────

    /// Create a new Test Set in Xray. Optionally link existing tests at creation time.
    pub async fn create_test_set(
        &self,
        project_key: &str,
        summary: &str,
        component: Option<&str>,
        test_issue_ids: Option<&[String]>,
    ) -> Result<CreateTestSetResult> {
        let query = r#"
            mutation CreateTestSet($testIssueIds: [String], $jira: JSON!) {
                createTestSet(testIssueIds: $testIssueIds, jira: $jira) {
                    testSet {
                        issueId
                        jira(fields: ["key", "summary"])
                    }
                    warnings
                }
            }
        "#;

        let pk = project_key.trim();
        let project_value = if pk.chars().all(|c| c.is_ascii_digit()) {
            serde_json::json!({ "id": pk })
        } else {
            serde_json::json!({ "key": pk })
        };

        let mut fields = serde_json::Map::new();
        fields.insert("summary".to_owned(), serde_json::json!(summary.trim()));
        fields.insert("project".to_owned(), project_value);
        if let Some(name) = component {
            if !name.trim().is_empty() {
                fields.insert(
                    "components".to_owned(),
                    serde_json::json!([{ "name": name.trim() }]),
                );
            }
        }

        let jira = serde_json::json!({ "fields": fields });
        let variables = serde_json::json!({
            "testIssueIds": test_issue_ids,
            "jira": jira,
        });

        let resp: CreateTestSetResponse = self.graphql(query, variables).await?;
        Ok(resp.create_test_set)
    }

    // ── Create Test ───────────────────────────────────────────────────────────

    /// Create a new Manual test in Xray with optional manual steps.
    pub async fn create_test(&self, input: CreateXrayTestInput) -> Result<CreateTestResult> {
        let query = r#"
            mutation CreateTest(
                $testType: UpdateTestTypeInput,
                $steps: [CreateStepInput],
                $jira: JSON!
            ) {
                createTest(
                    testType: $testType,
                    steps: $steps,
                    jira: $jira
                ) {
                    test {
                        issueId
                        jira(fields: ["key", "summary"])
                        steps {
                            id
                            action
                            data
                            result
                        }
                    }
                    warnings
                }
            }
        "#;

        // Build the Jira fields object (same numeric-vs-key logic as createTestExecution).
        let pk = input.project_key.trim();
        let project_value = if pk.chars().all(|c| c.is_ascii_digit()) {
            serde_json::json!({ "id": pk })
        } else {
            serde_json::json!({ "key": pk })
        };
        let mut fields = serde_json::Map::new();
        fields.insert(
            "summary".to_owned(),
            serde_json::json!(input.summary.trim()),
        );
        fields.insert("project".to_owned(), project_value);
        if let Some(ref component_name) = input.component {
            if !component_name.trim().is_empty() {
                fields.insert(
                    "components".to_owned(),
                    serde_json::json!([{ "name": component_name.trim() }]),
                );
            }
        }
        let jira = serde_json::json!({ "fields": fields });

        // Map steps to the GraphQL CreateStepInput shape.
        let steps: Vec<serde_json::Value> = input
            .steps
            .into_iter()
            .map(|s| {
                let mut m = serde_json::Map::new();
                m.insert("action".to_owned(), serde_json::json!(s.action));
                if let Some(ref data) = s.data {
                    m.insert("data".to_owned(), serde_json::json!(data));
                }
                if let Some(ref result) = s.result {
                    m.insert("result".to_owned(), serde_json::json!(result));
                }
                serde_json::Value::Object(m)
            })
            .collect();

        let variables = serde_json::json!({
            "testType": { "name": "Manual" },
            "steps": steps,
            "jira": jira,
        });

        let resp: CreateTestResponse = self.graphql(query, variables).await?;
        Ok(resp.create_test)
    }

    // ── Create Test Plan ──────────────────────────────────────────────────────

    /// Create a new Test Plan in Xray.
    pub async fn create_test_plan(
        &self,
        input: CreateTestPlanInput,
    ) -> Result<CreateTestPlanResult> {
        let query = r#"
            mutation CreateTestPlan($jira: JSON!) {
                createTestPlan(jira: $jira) {
                    testPlan {
                        issueId
                        jira(fields: ["key", "summary", "status"])
                    }
                    warnings
                }
            }
        "#;

        let pk = input.project_key.trim();
        let project_value = if pk.chars().all(|c| c.is_ascii_digit()) {
            serde_json::json!({ "id": pk })
        } else {
            serde_json::json!({ "key": pk })
        };

        let mut fields = serde_json::Map::new();
        fields.insert(
            "summary".to_owned(),
            serde_json::json!(input.summary.trim()),
        );
        fields.insert("project".to_owned(), project_value);
        if let Some(ref desc) = input.description {
            fields.insert("description".to_owned(), serde_json::json!(desc));
        }
        if let Some(ref component_name) = input.component {
            if !component_name.trim().is_empty() {
                fields.insert(
                    "components".to_owned(),
                    serde_json::json!([{ "name": component_name.trim() }]),
                );
            }
        }
        if let Some(ref version_name) = input.fix_version {
            if !version_name.trim().is_empty() {
                fields.insert(
                    "fixVersions".to_owned(),
                    serde_json::json!([{ "name": version_name.trim() }]),
                );
            }
        }

        let jira = serde_json::json!({ "fields": fields });
        let variables = serde_json::json!({ "jira": jira });

        let resp: CreateTestPlanResponse = self.graphql(query, variables).await?;
        Ok(resp.create_test_plan)
    }

    // ── Add Tests to Test Plan ─────────────────────────────────────────────────

    /// Associate one or more tests directly with a test plan's test list.
    ///
    /// This is distinct from `add_test_executions_to_test_plan`, which links
    /// executions.  This mutation populates the plan's test scope.
    pub async fn add_tests_to_test_plan(&self, input: AddTestsToTestPlanInput) -> Result<()> {
        let query = r#"
            mutation AddTestsToTestPlan($issueId: String!, $testIssueIds: [String]!) {
                addTestsToTestPlan(issueId: $issueId, testIssueIds: $testIssueIds) {
                    addedTests
                    warning
                }
            }
        "#;
        let _: serde_json::Value = self
            .graphql(
                query,
                serde_json::json!({
                    "issueId": input.test_plan_issue_id,
                    "testIssueIds": input.test_issue_ids,
                }),
            )
            .await?;
        Ok(())
    }

    /// Remove one or more tests from an existing test plan.
    pub async fn remove_tests_from_test_plan(
        &self,
        test_plan_issue_id: &str,
        test_issue_ids: &[String],
    ) -> Result<()> {
        let query = r#"
            mutation RemoveTestsFromTestPlan($issueId: String!, $testIssueIds: [String]!) {
                removeTestsFromTestPlan(issueId: $issueId, testIssueIds: $testIssueIds)
            }
        "#;
        let _: serde_json::Value = self
            .graphql(
                query,
                serde_json::json!({
                    "issueId": test_plan_issue_id,
                    "testIssueIds": test_issue_ids,
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
