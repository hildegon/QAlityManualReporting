use tauri::{AppHandle, Manager};

use crate::{
    api::jira_client::JiraClient,
    commands::config::load_config,
    models::jira::{
        DescriptionBlock, IssueLinkType, JiraBug, JiraComment, JiraCommentFlat, JiraComponent,
        JiraCreatedIssue, JiraIssueDetail, JiraProject, JiraTransition, JiraUserSearchResult,
        JiraVersion, VersionRelatedWork,
    },
    state::ApiUsageState,
};

/// Recursively extract plain text from an Atlassian Document Format (ADF) node.
/// Handles text, mentions, hard breaks, and common block-level elements.
fn adf_to_text(node: &serde_json::Value) -> String {
    let mut text = String::new();
    let Some(obj) = node.as_object() else {
        return text;
    };
    let node_type = obj.get("type").and_then(|v| v.as_str()).unwrap_or("");
    match node_type {
        "text" => {
            if let Some(t) = obj.get("text").and_then(|v| v.as_str()) {
                text.push_str(t);
            }
        }
        "mention" => {
            // { "type": "mention", "attrs": { "text": "@Display Name", ... } }
            if let Some(t) = obj.get("attrs").and_then(|a| a.get("text")).and_then(|v| v.as_str()) {
                text.push_str(t);
            }
        }
        "inlineCard" => {
            // Linked Jira issue or URL card — show the URL as fallback text.
            if let Some(url) = obj.get("attrs").and_then(|a| a.get("url")).and_then(|v| v.as_str()) {
                text.push_str(url);
            }
        }
        "hardBreak" | "rule" => text.push('\n'),
        _ => {}
    }
    if let Some(content) = obj.get("content").and_then(|v| v.as_array()) {
        for child in content {
            text.push_str(&adf_to_text(child));
        }
        match node_type {
            "paragraph" | "heading" | "bulletList" | "orderedList" | "listItem"
            | "blockquote" | "codeBlock" => text.push('\n'),
            _ => {}
        }
    }
    text
}

/// Convert an ADF `doc` node into a sequence of `DescriptionBlock`s.
///
/// Top-level `mediaSingle` nodes (embedded images/files) become `Media` blocks so the
/// frontend can render them inline. Everything else becomes `Text` blocks.
fn adf_to_blocks(doc: &serde_json::Value) -> Vec<DescriptionBlock> {
    let mut blocks: Vec<DescriptionBlock> = Vec::new();
    let Some(content) = doc.get("content").and_then(|v| v.as_array()) else {
        // Fallback: treat entire node as text.
        let text = adf_to_text(doc).trim().to_string();
        if !text.is_empty() {
            blocks.push(DescriptionBlock::Text { content: text });
        }
        return blocks;
    };

    let mut pending_text = String::new();

    let flush = |pending: &mut String, blocks: &mut Vec<DescriptionBlock>| {
        let trimmed = pending.trim_end_matches('\n').to_string();
        if !trimmed.is_empty() {
            blocks.push(DescriptionBlock::Text { content: trimmed });
        }
        pending.clear();
    };

    for node in content {
        let node_type = node.get("type").and_then(|v| v.as_str()).unwrap_or("");
        if node_type == "mediaSingle" {
            // Flush accumulated text before the image.
            flush(&mut pending_text, &mut blocks);
            // Extract filename from the nested media node's `alt` attribute.
            if let Some(media_content) = node.get("content").and_then(|v| v.as_array()) {
                for media_node in media_content {
                    if media_node.get("type").and_then(|v| v.as_str()) == Some("media") {
                        if let Some(alt) = media_node
                            .get("attrs")
                            .and_then(|a| a.get("alt"))
                            .and_then(|v| v.as_str())
                        {
                            if !alt.is_empty() {
                                blocks.push(DescriptionBlock::Media { filename: alt.to_string() });
                            }
                        }
                    }
                }
            }
        } else {
            pending_text.push_str(&adf_to_text(node));
        }
    }
    flush(&mut pending_text, &mut blocks);
    blocks
}

/// Format an anyhow error with its full cause chain for debugging.
fn format_err(e: anyhow::Error) -> String {
    format!("{e:#}")
}

fn make_jira_client(app: &AppHandle) -> Result<JiraClient, String> {
    let config = load_config(app).map_err(format_err)?;
    if !config.is_jira_configured() {
        return Err(
            "Jira is not configured. Please set Jira URL, Email, and API Token in Settings.".into(),
        );
    }
    let usage = app.state::<ApiUsageState>();
    Ok(JiraClient::new(
        config.jira_url,
        config.jira_email,
        config.jira_api_token,
        usage.jira_usage(),
    ))
}

#[tauri::command]
pub async fn get_jira_projects(app: AppHandle) -> Result<Vec<JiraProject>, String> {
    let client = make_jira_client(&app)?;
    client.get_projects().await.map_err(format_err)
}

#[tauri::command]
pub async fn validate_jira_credentials(app: AppHandle) -> Result<String, String> {
    let client = make_jira_client(&app)?;
    client.validate_credentials().await.map_err(format_err)
}

#[tauri::command]
pub async fn get_project_components(
    app: AppHandle,
    project_key: String,
) -> Result<Vec<JiraComponent>, String> {
    let client = make_jira_client(&app)?;
    client
        .get_project_components(&project_key)
        .await
        .map_err(format_err)
}

/// Fetch the available workflow transitions for a Jira issue.
#[tauri::command]
pub async fn get_issue_transitions(
    app: AppHandle,
    issue_key: String,
) -> Result<Vec<JiraTransition>, String> {
    let client = make_jira_client(&app)?;
    client
        .get_issue_transitions(&issue_key)
        .await
        .map_err(format_err)
}

/// Apply a workflow transition to a Jira issue.
#[tauri::command]
pub async fn transition_issue(
    app: AppHandle,
    issue_key: String,
    transition_id: String,
) -> Result<(), String> {
    let client = make_jira_client(&app)?;
    client
        .transition_issue(&issue_key, &transition_id)
        .await
        .map_err(format_err)
}

/// Update the assignee of a Jira issue. Pass `None` to unassign.
#[tauri::command]
pub async fn update_assignee(
    app: AppHandle,
    issue_key: String,
    account_id: Option<String>,
) -> Result<(), String> {
    let client = make_jira_client(&app)?;
    client
        .update_assignee(&issue_key, account_id.as_deref())
        .await
        .map_err(format_err)
}

/// Fetch a Jira user's display name by account ID.
#[tauri::command]
pub async fn get_user_display_name(
    app: AppHandle,
    account_id: String,
) -> Result<String, String> {
    let client = make_jira_client(&app)?;
    client
        .get_user_display_name(&account_id)
        .await
        .map_err(format_err)
}

/// Search Jira users by display name or email.
#[tauri::command]
pub async fn search_users(
    app: AppHandle,
    query: String,
) -> Result<Vec<JiraUserSearchResult>, String> {
    let client = make_jira_client(&app)?;
    client.search_users(&query).await.map_err(format_err)
}

/// Fetch all versions for a given Jira project key.
#[tauri::command]
pub async fn get_project_versions(
    app: AppHandle,
    project_key: String,
) -> Result<Vec<JiraVersion>, String> {
    let client = make_jira_client(&app)?;
    client
        .get_project_versions(&project_key)
        .await
        .map_err(format_err)
}

/// Update the summary (name) of any Jira issue (Test Plan, Test Set, Test Execution, etc.).
#[tauri::command]
pub async fn update_issue_summary(
    app: AppHandle,
    issue_key: String,
    summary: String,
) -> Result<(), String> {
    let client = make_jira_client(&app)?;
    client
        .update_issue_summary(&issue_key, &summary)
        .await
        .map_err(format_err)
}

/// Update the fix version of any Jira issue (Test Plan, Test Set, Test Execution, etc.).
///
/// Pass an empty string for `version_id` to clear all fix versions.
#[tauri::command]
pub async fn update_issue_fix_version(
    app: AppHandle,
    issue_key: String,
    version_id: String,
) -> Result<(), String> {
    let client = make_jira_client(&app)?;
    client
        .update_issue_fix_version(&issue_key, &version_id)
        .await
        .map_err(format_err)
}

/// Fetch all issue link types configured in the Jira instance.
#[tauri::command]
pub async fn get_issue_link_types(app: AppHandle) -> Result<Vec<IssueLinkType>, String> {
    let client = make_jira_client(&app)?;
    client.get_issue_link_types().await.map_err(format_err)
}

/// Create an issue link between two Jira issues.
///
/// `link_type_name` is the Jira link type name, e.g. `"is detected by"`.
/// The bug is the inward issue and the test is the outward issue by convention.
#[tauri::command]
pub async fn create_issue_link(
    app: AppHandle,
    inward_issue_key: String,
    outward_issue_key: String,
    link_type_name: String,
) -> Result<(), String> {
    let client = make_jira_client(&app)?;
    client
        .create_issue_link(&inward_issue_key, &outward_issue_key, &link_type_name)
        .await
        .map_err(format_err)
}

/// Fetch all Bug issues with the given `affectedVersion` in the project.
#[tauri::command]
pub async fn get_bugs_by_version(
    app: AppHandle,
    project_key: String,
    version_name: String,
) -> Result<Vec<JiraBug>, String> {
    let client = make_jira_client(&app)?;
    client
        .get_bugs_by_version(&project_key, &version_name)
        .await
        .map_err(format_err)
}

/// Create a new Bug issue in the given Jira project.
/// `affected_version_id` becomes the `versions` (affectedVersions) field.
#[tauri::command]
pub async fn create_bug(
    app: AppHandle,
    project_key: String,
    summary: String,
    description: Option<String>,
    affected_version_id: String,
    component_id: Option<String>,
    assignee_account_id: Option<String>,
) -> Result<JiraCreatedIssue, String> {
    let client = make_jira_client(&app)?;
    client
        .create_bug(
            &project_key,
            &summary,
            description.as_deref(),
            &affected_version_id,
            component_id.as_deref(),
            assignee_account_id.as_deref(),
        )
        .await
        .map_err(format_err)
}

/// Add a plain-text comment to an existing Jira issue.
#[tauri::command]
pub async fn add_jira_comment(
    app: AppHandle,
    issue_key: String,
    body: String,
) -> Result<(), String> {
    let client = make_jira_client(&app)?;
    client.add_comment(&issue_key, &body).await.map_err(format_err)
}

/// Attach a local file to an existing Jira issue.
#[tauri::command]
pub async fn add_attachment(
    app: AppHandle,
    issue_key: String,
    file_path: String,
) -> Result<(), String> {
    let client = make_jira_client(&app)?;
    client
        .add_attachment(&issue_key, &file_path)
        .await
        .map_err(format_err)
}

/// Fetch Story, Task, and Bug issues with the given `fixVersion` in the project.
#[tauri::command]
pub async fn get_version_issues(
    app: AppHandle,
    project_key: String,
    version_name: String,
) -> Result<Vec<JiraBug>, String> {
    let client = make_jira_client(&app)?;
    client
        .get_version_issues(&project_key, &version_name)
        .await
        .map_err(format_err)
}

/// Fetch a single Jira issue with its description converted from ADF to plain text.
#[tauri::command]
pub async fn get_issue_detail(
    app: AppHandle,
    issue_key: String,
) -> Result<JiraIssueDetail, String> {
    let client = make_jira_client(&app)?;
    let issue = client.get_issue(&issue_key).await.map_err(format_err)?;
    Ok(JiraIssueDetail {
        key: issue.key,
        summary: issue.fields.summary,
        description_blocks: issue.fields.description
            .map(|d| adf_to_blocks(&d))
            .unwrap_or_default(),
        assignee: issue.fields.assignee.map(|a| a.display_name),
        status: issue.fields.status.map(|s| s.name),
        issue_type: issue.fields.issue_type.map(|t| t.name),
        priority: issue.fields.priority.map(|p| p.name),
        attachments: issue.fields.attachments,
        comments: issue
            .fields
            .comment
            .map(|c| c.comments.into_iter().map(flat_comment).collect())
            .unwrap_or_default(),
    })
}

fn flat_comment(c: JiraComment) -> JiraCommentFlat {
    JiraCommentFlat {
        id: c.id,
        author: c.author.map(|a| a.display_name),
        body: c.body.and_then(|b| {
            let text = adf_to_text(&b);
            let trimmed = text.trim().to_string();
            if trimmed.is_empty() { None } else { Some(trimmed) }
        }),
        created: c.created,
        updated: c.updated,
    }
}

/// Create a new project version in Jira.
#[tauri::command]
pub async fn create_version(
    app: AppHandle,
    project_id: String,
    name: String,
    description: Option<String>,
    start_date: Option<String>,
    release_date: Option<String>,
) -> Result<JiraVersion, String> {
    let client = make_jira_client(&app)?;
    client
        .create_version(
            &project_id,
            &name,
            description.as_deref(),
            start_date.as_deref(),
            release_date.as_deref(),
        )
        .await
        .map_err(format_err)
}

/// Update an existing Jira project version.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn update_version(
    app: AppHandle,
    version_id: String,
    name: Option<String>,
    description: Option<String>,
    released: Option<bool>,
    archived: Option<bool>,
    start_date: Option<String>,
    release_date: Option<String>,
) -> Result<JiraVersion, String> {
    let client = make_jira_client(&app)?;
    client
        .update_version(
            &version_id,
            name.as_deref(),
            description.as_deref(),
            released,
            archived,
            start_date.as_deref(),
            release_date.as_deref(),
        )
        .await
        .map_err(format_err)
}

/// Fetch a custom property stored on a Jira version.
/// Returns the raw JSON value string, or `None` if the property does not exist.
#[tauri::command]
pub async fn get_version_property(
    app: AppHandle,
    version_id: String,
    property_key: String,
) -> Result<Option<String>, String> {
    let client = make_jira_client(&app)?;
    client
        .get_version_property(&version_id, &property_key)
        .await
        .map_err(format_err)
}

/// Create or update a custom property on a Jira version.
#[tauri::command]
pub async fn set_version_property(
    app: AppHandle,
    version_id: String,
    property_key: String,
    value: String,
) -> Result<(), String> {
    let client = make_jira_client(&app)?;
    client
        .set_version_property(&version_id, &property_key, &value)
        .await
        .map_err(format_err)
}

/// Delete a custom property from a Jira version.
#[tauri::command]
pub async fn delete_version_property(
    app: AppHandle,
    version_id: String,
    property_key: String,
) -> Result<(), String> {
    let client = make_jira_client(&app)?;
    client
        .delete_version_property(&version_id, &property_key)
        .await
        .map_err(format_err)
}

/// Fetch a Jira attachment by its authenticated URL and return it as a base64 data URI.
///
/// The returned string can be used directly as `<img src>` or `<video src>` without
/// requiring any filesystem access permissions.
#[tauri::command]
pub async fn fetch_attachment_to_temp(
    app: AppHandle,
    content_url: String,
    mime_type: String,
) -> Result<String, String> {
    let client = make_jira_client(&app)?;
    client
        .fetch_attachment_as_data_uri(&content_url, &mime_type)
        .await
        .map_err(format_err)
}

/// Fetch all "Related Work" entries for a Jira version.
#[tauri::command]
pub async fn get_version_related_work(
    app: AppHandle,
    version_id: String,
) -> Result<Vec<VersionRelatedWork>, String> {
    let client = make_jira_client(&app)?;
    client
        .get_version_related_work(&version_id)
        .await
        .map_err(format_err)
}

/// Create a "Related Work" entry on a Jira version.
#[tauri::command]
pub async fn create_version_related_work(
    app: AppHandle,
    version_id: String,
    category: String,
    title: String,
    url: String,
) -> Result<VersionRelatedWork, String> {
    let client = make_jira_client(&app)?;
    client
        .create_version_related_work(&version_id, &category, &title, &url)
        .await
        .map_err(format_err)
}

/// Delete a "Related Work" entry from a Jira version.
#[tauri::command]
pub async fn delete_version_related_work(
    app: AppHandle,
    version_id: String,
    related_work_id: String,
) -> Result<(), String> {
    let client = make_jira_client(&app)?;
    client
        .delete_version_related_work(&version_id, &related_work_id)
        .await
        .map_err(format_err)
}
