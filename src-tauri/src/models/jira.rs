#![allow(dead_code)]
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JiraProject {
    pub id: String,
    pub key: String,
    pub name: String,
    #[serde(rename(deserialize = "avatarUrls"))]
    pub avatar_urls: Option<AvatarUrls>,
    #[serde(rename(deserialize = "projectTypeKey"))]
    pub project_type_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AvatarUrls {
    #[serde(rename = "48x48")]
    pub size_48: Option<String>,
    #[serde(rename = "16x16")]
    pub size_16: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JiraProjectsResponse {
    pub values: Vec<JiraProject>,
    #[serde(rename(deserialize = "isLast"))]
    pub is_last: bool,
    #[serde(rename(deserialize = "maxResults"))]
    pub max_results: u32,
    #[serde(rename(deserialize = "startAt"))]
    pub start_at: u32,
    pub total: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JiraIssue {
    pub id: String,
    pub key: String,
    pub fields: JiraIssueFields,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JiraIssueFields {
    pub summary: String,
    pub status: Option<JiraStatus>,
    pub assignee: Option<JiraUser>,
    pub priority: Option<JiraPriority>,
    #[serde(rename(deserialize = "issuetype"))]
    pub issue_type: Option<JiraIssueType>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JiraStatus {
    pub name: String,
    #[serde(rename(deserialize = "statusCategory"))]
    pub category: Option<JiraStatusCategory>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JiraStatusCategory {
    pub key: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JiraUser {
    #[serde(rename(deserialize = "accountId"))]
    pub account_id: String,
    #[serde(rename(deserialize = "displayName"))]
    pub display_name: String,
    #[serde(rename(deserialize = "avatarUrls"))]
    pub avatar_urls: Option<AvatarUrls>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JiraPriority {
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JiraIssueType {
    pub name: String,
}

/// A Jira project component returned by `GET /rest/api/3/project/{key}/components`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JiraComponent {
    pub id: String,
    pub name: String,
}

/// The target status of a workflow transition.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JiraTransitionTo {
    pub name: String,
    #[serde(rename(deserialize = "statusCategory"))]
    pub category: Option<JiraStatusCategory>,
}

/// A single workflow transition available on a Jira issue.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JiraTransition {
    pub id: String,
    pub name: String,
    pub to: JiraTransitionTo,
}

/// Response wrapper for `GET /rest/api/3/issue/{key}/transitions`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JiraTransitionsResponse {
    pub transitions: Vec<JiraTransition>,
}

/// A Jira user returned by `GET /rest/api/3/user/search`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JiraUserSearchResult {
    #[serde(rename(deserialize = "accountId"))]
    pub account_id: String,
    #[serde(rename(deserialize = "displayName"))]
    pub display_name: String,
    #[serde(rename(deserialize = "avatarUrls"))]
    pub avatar_urls: Option<AvatarUrls>,
}

/// A Jira project version returned by `GET /rest/api/3/project/{key}/versions`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JiraVersion {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub archived: Option<bool>,
    pub released: Option<bool>,
    #[serde(rename(deserialize = "releaseDate"))]
    pub release_date: Option<String>,
}

/// Fields returned for a bug issue from JQL search.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JiraBugFields {
    pub summary: String,
    pub status: Option<JiraStatus>,
    pub priority: Option<JiraPriority>,
    pub assignee: Option<JiraUser>,
}

/// A single bug issue returned by a JQL search.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JiraBug {
    pub id: String,
    pub key: String,
    pub fields: JiraBugFields,
}

/// Response from `POST /rest/api/3/search/jql` (enhanced search, cursor-based).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JiraSearchResponse {
    /// `true` when this is the last page of results.
    #[serde(rename = "isLast")]
    pub is_last: bool,
    pub issues: Vec<JiraBug>,
    /// Cursor token to pass as `nextPageToken` in the next request.
    /// `None` when `is_last` is `true`.
    #[serde(rename = "nextPageToken")]
    pub next_page_token: Option<String>,
}
