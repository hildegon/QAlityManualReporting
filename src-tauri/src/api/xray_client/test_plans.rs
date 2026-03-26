use anyhow::Result;

use crate::api::common::validate_project_key;
use crate::models::xray::{TestPlanResult, TestPlansResult, XrayTest};

use super::XrayClient;

impl XrayClient {
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
}
