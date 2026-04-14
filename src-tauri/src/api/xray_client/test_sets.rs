use anyhow::Result;
use std::collections::HashMap;

use crate::api::common::validate_project_key;
use crate::models::xray::{
    FirstPageResult, TestSetMemberInfo, TestSetMembershipsResponse, TestSetResult,
    TestSetWithStatusResult, TestSetsResult, TestSetsWithMembersResult, XrayTest, XrayTestSet,
    XrayTestWithStatus,
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
                        tests(limit: 500) {
                            results {
                                issueId
                            }
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

        Ok(TestSetMembershipsResponse {
            memberships,
            test_sets,
        })
    }
}
