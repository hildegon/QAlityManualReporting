use anyhow::{bail, Context, Result};
use reqwest::Client;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::models::xray::{
    CreateTestExecutionInput, CreateTestExecutionResult, GraphQLRequest, GraphQLResponse,
    StatusesResult, TestExecutionsResult, TestPlansResult, TestRunsResult,
    UpdateTestRunStatusInput, XrayAuthRequest, XrayTestRunStatus,
};

const XRAY_AUTH_URL: &str = "https://xray.cloud.getxray.app/api/v2/authenticate";
const XRAY_GRAPHQL_URL: &str = "https://xray.cloud.getxray.app/api/v2/graphql";

/// Thread-safe Xray Cloud client with token caching.
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

            let gql: GraphQLResponse<T> = serde_json::from_str(&raw_body)
                .with_context(|| {
                    format!(
                        "Failed to parse Xray GraphQL response (status {status}). Raw body:\n{raw_body}"
                    )
                })?;

            if let Some(errors) = gql.errors {
                let messages: Vec<_> = errors.iter().map(|e| e.message.as_str()).collect();
                bail!("Xray GraphQL errors: {}", messages.join("; "));
            }

            return gql.data.context("Xray GraphQL response contained no data");
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
    ) -> Result<TestRunsResult> {
        let query = r#"
            query GetTestRuns($issueId: String!, $limit: Int!) {
                getTestRuns(testExecIssueIds: [$issueId], limit: $limit) {
                    total
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
                    }
                }
            }
        "#;
        self.graphql(
            query,
            serde_json::json!({ "issueId": test_execution_issue_id, "limit": limit }),
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

    // ── Create Test Execution ─────────────────────────────────────────────────

    pub async fn create_test_execution(
        &self,
        input: CreateTestExecutionInput,
    ) -> Result<CreateTestExecutionResult> {
        let query = r#"
            mutation CreateTestExecution($testPlanId: String, $projectId: String!, $summary: String!, $description: String) {
                createTestExecution(
                    testPlanId: $testPlanId
                    jira: {
                        fields: {
                            project: { id: $projectId }
                            summary: $summary
                            description: $description
                        }
                    }
                ) {
                    testExecution {
                        issueId
                        jira(fields: ["key", "summary", "status"])
                    }
                }
            }
        "#;
        self.graphql(
            query,
            serde_json::json!({
                "testPlanId": input.test_plan_id,
                "projectId": input.project_id,
                "summary": input.summary,
                "description": input.description,
            }),
        )
        .await
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
}
