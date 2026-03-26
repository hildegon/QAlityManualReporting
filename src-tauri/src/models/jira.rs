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
    /// Description in Atlassian Document Format (ADF). Present when fetched with `description` field.
    pub description: Option<serde_json::Value>,
    /// File attachments. Present when fetched with `attachment` field.
    #[serde(default, rename(deserialize = "attachment"))]
    pub attachments: Vec<JiraAttachment>,
    /// Comments. Present when fetched with `comment` field.
    pub comment: Option<JiraCommentField>,
}

/// A comment with its ADF body pre-converted to plain text.
#[derive(Debug, Clone, Serialize)]
pub struct JiraCommentFlat {
    pub id: String,
    pub author: Option<String>,
    pub body: Option<String>,
    pub created: Option<String>,
    pub updated: Option<String>,
}

/// A single block in a rendered description.
/// Text blocks carry plain text; Media blocks reference an attachment by filename.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum DescriptionBlock {
    Text { content: String },
    Media { filename: String },
}

/// Flattened issue detail returned by the `get_issue_detail` command.
#[derive(Debug, Clone, Serialize)]
pub struct JiraIssueDetail {
    pub key: String,
    pub summary: String,
    /// Structured description: interleaved text and media blocks.
    pub description_blocks: Vec<DescriptionBlock>,
    pub assignee: Option<String>,
    pub status: Option<String>,
    pub issue_type: Option<String>,
    pub priority: Option<String>,
    pub attachments: Vec<JiraAttachment>,
    pub comments: Vec<JiraCommentFlat>,
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
    #[serde(rename(deserialize = "startDate"))]
    pub start_date: Option<String>,
}

/// The "type" sub-object of an issue link (holds the link direction name).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JiraIssueLinkType {
    /// Human-readable name of the outward direction, e.g. "is detected by".
    #[serde(rename(deserialize = "outward"))]
    pub outward: Option<String>,
    /// Human-readable name of the inward direction, e.g. "detects".
    #[serde(rename(deserialize = "inward"))]
    pub inward: Option<String>,
}

/// Slim representation of the linked issue inside an issue link.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JiraLinkedIssue {
    pub id: String,
    pub key: String,
    pub fields: JiraLinkedIssueFields,
}

/// Minimal fields we need from a linked issue.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JiraLinkedIssueFields {
    pub summary: String,
    #[serde(rename(deserialize = "issuetype"))]
    pub issue_type: Option<JiraIssueType>,
}

/// A single issue link as returned by Jira's `issuelinks` field.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JiraIssueLink {
    pub id: String,
    #[serde(rename(deserialize = "type"))]
    pub link_type: JiraIssueLinkType,
    /// Present when this issue is the "outward" side of the link.
    #[serde(rename(deserialize = "outwardIssue"))]
    pub outward_issue: Option<JiraLinkedIssue>,
    /// Present when this issue is the "inward" side of the link.
    #[serde(rename(deserialize = "inwardIssue"))]
    pub inward_issue: Option<JiraLinkedIssue>,
}

/// A single comment on a Jira issue.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JiraComment {
    pub id: String,
    pub author: Option<JiraUser>,
    /// Comment body in ADF format — converted to plain text before sending to the frontend.
    pub body: Option<serde_json::Value>,
    pub created: Option<String>,
    pub updated: Option<String>,
}

/// The `comment` field wrapper returned by Jira's issue API.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JiraCommentField {
    pub comments: Vec<JiraComment>,
}

/// A file attachment returned inside issue fields.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JiraAttachment {
    pub id: String,
    #[serde(rename(deserialize = "filename"))]
    pub filename: String,
    #[serde(rename(deserialize = "mimeType"))]
    pub mime_type: String,
    /// Authenticated download URL for the full attachment content.
    pub content: String,
    /// Thumbnail download URL (only present for image attachments).
    pub thumbnail: Option<String>,
}

/// Fields returned for a bug issue from JQL search.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JiraBugFields {
    pub summary: String,
    pub status: Option<JiraStatus>,
    pub priority: Option<JiraPriority>,
    pub assignee: Option<JiraUser>,
    /// Issue type — present when fetched via `get_version_issues`.
    #[serde(rename(deserialize = "issuetype"))]
    pub issue_type: Option<JiraIssueType>,
    /// Issue links — used to find which Xray tests are linked to this bug.
    #[serde(default, rename(deserialize = "issuelinks"))]
    pub issue_links: Vec<JiraIssueLink>,
}

/// A single bug issue returned by a JQL search.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JiraBug {
    pub id: String,
    pub key: String,
    pub fields: JiraBugFields,
}

/// A single issue link type as returned by `GET /rest/api/3/issueLinkType`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IssueLinkType {
    pub id: String,
    pub name: String,
    pub inward: String,
    pub outward: String,
}

/// Response from `GET /rest/api/3/issueLinkType`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IssueLinkTypesResponse {
    #[serde(rename = "issueLinkTypes")]
    pub issue_link_types: Vec<IssueLinkType>,
}

/// Response from `POST /rest/api/3/issue` — the created issue reference.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JiraCreatedIssue {
    pub id: String,
    pub key: String,
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
