use serde::{Deserialize, Serialize};
use super::{XrayStatus, XrayTest};

// ── Test Sets ─────────────────────────────────────────────────────────────────

/// A single Xray test set returned by `getTestSets`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XrayTestSet {
    #[serde(rename(deserialize = "issueId"))]
    pub issue_id: String,
    #[serde(deserialize_with = "super::deserialize_jira_json")]
    pub jira: XrayTestSetJira,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XrayTestSetJira {
    pub key: String,
    pub summary: String,
    pub status: Option<XrayStatus>,
}

/// Paginated result from `getTestSets`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestSetsResult {
    #[serde(rename(deserialize = "getTestSets"))]
    pub get_test_sets: TestSetsPage,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestSetsPage {
    pub total: u32,
    pub start: Option<u32>,
    pub limit: Option<u32>,
    pub results: Vec<XrayTestSet>,
}

/// Wrapper for the `getTestSet(issueId)` query (singular).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestSetResult {
    #[serde(rename(deserialize = "getTestSet"))]
    pub get_test_set: TestSetDetail,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestSetDetail {
    #[serde(rename(deserialize = "issueId"))]
    pub issue_id: String,
    pub tests: TestSetTestsPage,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestSetTestsPage {
    pub results: Vec<XrayTest>,
}

// ── Test Set Membership (batch) ───────────────────────────────────────────────

/// Lightweight info about a test set, used in membership maps.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestSetMemberInfo {
    pub issue_id: String,
    pub key: String,
    pub summary: String,
}

/// Response from `get_all_test_set_memberships`.
/// Maps `test_issue_id → Vec<TestSetMemberInfo>` (which test sets each test belongs to).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestSetMembershipsResponse {
    /// Map from test issue ID to the list of test sets it belongs to.
    pub memberships: std::collections::HashMap<String, Vec<TestSetMemberInfo>>,
    /// The full list of test sets in the project.
    pub test_sets: Vec<XrayTestSet>,
}

// ── Test Sets with nested member tests (for batched membership) ──────────────

/// A test set including its nested member tests (only `issueId` per test).
/// Used by `get_all_test_set_memberships` to avoid N+1 queries.
#[derive(Debug, Clone, Deserialize)]
pub struct TestSetWithMembers {
    #[serde(rename(deserialize = "issueId"))]
    pub issue_id: String,
    #[serde(deserialize_with = "super::deserialize_jira_json")]
    pub jira: XrayTestSetJira,
    /// Nested member tests — only issue IDs needed for membership mapping.
    pub tests: TestSetMemberIds,
}

/// Just the test issue IDs inside a test set (no other fields needed).
#[derive(Debug, Clone, Deserialize)]
pub struct TestSetMemberIds {
    pub total: Option<u32>,
    pub results: Vec<TestMemberId>,
}

/// Minimal test reference (issue ID only) for membership mapping.
#[derive(Debug, Clone, Deserialize)]
pub struct TestMemberId {
    #[serde(rename(deserialize = "issueId"))]
    pub issue_id: String,
}

/// Paginated result from `getTestSets` with nested member tests.
#[derive(Debug, Clone, Deserialize)]
pub struct TestSetsWithMembersResult {
    #[serde(rename(deserialize = "getTestSets"))]
    pub get_test_sets: TestSetsWithMembersPage,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TestSetsWithMembersPage {
    pub total: u32,
    pub start: Option<u32>,
    pub limit: Option<u32>,
    pub results: Vec<TestSetWithMembers>,
}

// ── Create Test Set ───────────────────────────────────────────────────────────

/// The test set object returned inside `CreateTestSetResult`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatedTestSet {
    #[serde(rename(deserialize = "issueId"))]
    pub issue_id: String,
    #[serde(deserialize_with = "super::deserialize_jira_json")]
    pub jira: XrayTestSetJira,
}

/// `data.createTestSet` from the Xray GraphQL response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateTestSetResult {
    #[serde(rename(deserialize = "testSet"))]
    pub test_set: Option<CreatedTestSet>,
    pub warnings: Option<Vec<String>>,
}

/// Outer wrapper matching the `data.createTestSet` key.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateTestSetResponse {
    #[serde(rename(deserialize = "createTestSet"))]
    pub create_test_set: CreateTestSetResult,
}
