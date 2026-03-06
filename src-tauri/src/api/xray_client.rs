use anyhow::{bail, Context, Result};
use reqwest::Client;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::models::xray::{
    AddTestExecutionsToTestPlanInput, CreateTestExecutionInput, CreateTestExecutionResponse,
    CreateTestExecutionResult, CreateTestResponse, CreateTestResult, CreateTestSetResponse,
    CreateTestSetResult, CreateXrayTestInput, GraphQLRequest, GraphQLResponse, StatusesResult,
    StepStatusesResult, TestExecutionsResult, TestPlanResult, TestPlansResult, TestRunsResult,
    TestSetResult, TestSetsResult, TestsResult, UpdateTestRunStatusInput, XrayAuthRequest,
    XrayStepStatus, XrayTest, XrayTestRunStatus, XrayTestSet,
};

const XRAY_AUTH_URL: &str = "https://xray.cloud.getxray.app/api/v2/authenticate";
const XRAY_GRAPHQL_URL: &str = "https://xray.cloud.getxray.app/api/v2/graphql";

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
        Self {
            client: Client::new(),
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

            let status = resp.status();
            let raw_body = resp
                .text()
                .await
                .context("Failed to read Xray GraphQL response body")?;

            if !status.is_success() {
                bail!("Xray GraphQL request failed with status {status}: {raw_body}");
            }

            // Parse into a raw-value response first so we can check errors
            // before attempting to deserialize the typed data field.
            let gql: GraphQLResponse<serde_json::Value> = serde_json::from_str(&raw_body)
                .with_context(|| {
                    format!(
                        "Failed to parse Xray GraphQL response (status {status}). Raw body:\n{raw_body}"
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
                format!("Failed to deserialize Xray GraphQL data. Raw body:\n{raw_body}")
            })?;
            return Ok(typed);
        }
        bail!("Xray authentication failed after retry");
    }

    // ── Test Plans ────────────────────────────────────────────────────────────

    pub async fn get_test_plans(&self, project_key: &str, limit: u32) -> Result<TestPlansResult> {
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

    /// Fetch tests for a project using JQL.
    pub async fn get_tests(&self, project_key: &str, limit: u32) -> Result<Vec<XrayTest>> {
        let jql = format!("project = '{project_key}'");
        let query = r#"
            query GetTests($jql: String, $limit: Int!) {
                getTests(jql: $jql, limit: $limit) {
                    total
                    start
                    limit
                    results {
                        issueId
                        jira(fields: ["key", "summary"])
                    }
                }
            }
        "#;
        let result: TestsResult = self
            .graphql(query, serde_json::json!({ "jql": jql, "limit": limit }))
            .await?;
        Ok(result.get_tests.results)
    }

    // ── Test Sets ─────────────────────────────────────────────────────────────

    /// Fetch test sets for a project using JQL.
    pub async fn get_test_sets(&self, project_key: &str, limit: u32) -> Result<Vec<XrayTestSet>> {
        let jql = format!("project = '{project_key}'");
        let query = r#"
            query GetTestSets($jql: String!, $limit: Int!) {
                getTestSets(jql: $jql, limit: $limit) {
                    total
                    start
                    limit
                    results {
                        issueId
                        jira(fields: ["key", "summary"])
                    }
                }
            }
        "#;
        let result: TestSetsResult = self
            .graphql(query, serde_json::json!({ "jql": jql, "limit": limit }))
            .await?;
        Ok(result.get_test_sets.results)
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

    // ── Create Test Set ───────────────────────────────────────────────────────

    /// Create a new Test Set in Xray. Optionally link existing tests at creation time.
    pub async fn create_test_set(
        &self,
        project_key: &str,
        summary: &str,
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
        let jira = serde_json::json!({
            "fields": {
                "summary": summary.trim(),
                "project": project_value,
            }
        });

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
