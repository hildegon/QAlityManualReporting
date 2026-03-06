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
