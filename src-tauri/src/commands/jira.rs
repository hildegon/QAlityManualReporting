use tauri::AppHandle;

use crate::{
    api::jira_client::JiraClient,
    commands::config::load_config,
    models::jira::{JiraComponent, JiraProject},
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
