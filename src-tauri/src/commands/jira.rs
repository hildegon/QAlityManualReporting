use tauri::AppHandle;

use crate::{
    api::jira_client::JiraClient,
    commands::config::load_config,
    models::jira::{
        JiraBug, JiraComponent, JiraProject, JiraTransition, JiraUserSearchResult, JiraVersion,
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
