use serde::{Deserialize, Serialize};

// ── Authentication ────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct XrayAuthRequest {
    #[serde(rename = "client_id")]
    pub client_id: String,
    #[serde(rename = "client_secret")]
    pub client_secret: String,
}

// ── GraphQL helpers ───────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct GraphQLRequest {
    pub query: String,
    pub variables: serde_json::Value,
}

#[derive(Debug, Deserialize)]
pub struct GraphQLResponse<T> {
    pub data: Option<T>,
    pub errors: Option<Vec<GraphQLError>>,
}

#[derive(Debug, Deserialize)]
pub struct GraphQLError {
    pub message: String,
}

// ── Shared value types ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XrayIssueType {
    pub name: String,
}

/// Jira-level status embedded in `jira(fields: ["status"])` responses.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XrayStatus {
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XrayUser {
    #[serde(rename(deserialize = "accountId"))]
    pub account_id: Option<String>,
    #[serde(rename(deserialize = "displayName"))]
    pub display_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XrayPageInfo {
    #[serde(rename(deserialize = "startIndex"))]
    pub start_index: u32,
    pub limit: u32,
    pub total: u32,
}

/// The type of an Xray test (Manual, Cucumber, Generic).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestType {
    pub name: String,
    pub kind: Option<String>,
}

/// Step-level status used by manual step results, iteration steps, and Cucumber steps.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StepStatus {
    pub name: String,
    pub description: Option<String>,
    pub color: Option<String>,
}

/// The `status` object returned by Xray GraphQL for test-level latest status.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LatestTestStatus {
    pub name: String,
    pub color: Option<String>,
    pub description: Option<String>,
    #[serde(rename(deserialize = "final"))]
    pub is_final: Option<bool>,
}
