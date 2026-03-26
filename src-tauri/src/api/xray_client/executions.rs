use anyhow::Result;

use crate::api::common::{escape_jql_string, validate_project_key};
use crate::models::xray::{
    AddTestExecutionsToTestPlanInput, CreateTestExecutionInput, CreateTestExecutionResponse,
    CreateTestExecutionResult, TestExecutionsResult,
};

use super::XrayClient;

impl XrayClient {
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
                        jira(fields: ["key", "summary", "status", "assignee", "fixVersions"])
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
                        jira(fields: ["key", "summary", "status", "assignee", "fixVersions"])
                    }
                }
            }
        "#;
        self.graphql(query, serde_json::json!({ "jql": jql, "limit": limit }))
            .await
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
}
