use anyhow::Result;

use crate::models::xray::{
    AddTestsToTestPlanInput, CreateTestPlanInput, CreateTestPlanResponse, CreateTestPlanResult,
    CreateTestResponse, CreateTestResult, CreateTestSetResponse, CreateTestSetResult,
    CreateXrayTestInput,
};

use super::XrayClient;

impl XrayClient {
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
}
