use tauri::AppHandle;

use crate::{
    api::jira_client::JiraClient,
    commands::config::load_config,
    models::jira::{
        IssueLinkType, JiraBug, JiraComponent, JiraCreatedIssue, JiraProject, JiraTransition,
        JiraUserSearchResult, JiraVersion,
    },
};

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
    Ok(JiraClient::new(
        config.jira_url,
        config.jira_email,
        config.jira_api_token,
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
