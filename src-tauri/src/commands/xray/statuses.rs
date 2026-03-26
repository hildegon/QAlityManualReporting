use tauri::{AppHandle, State};

use crate::{
    models::xray::{XrayStepStatus, XrayTestRunStatus},
    state::XrayClientState,
};

use super::{format_err, get_xray_client};

#[tauri::command]
pub async fn get_xray_statuses(
    app: AppHandle,
    state: State<'_, XrayClientState>,
    project_id: Option<String>,
) -> Result<Vec<XrayTestRunStatus>, String> {
    let client = get_xray_client(&app, &state).await?;
    client
        .get_statuses(project_id.as_deref())
        .await
        .map_err(format_err)
}

#[tauri::command]
pub async fn get_step_statuses(
    app: AppHandle,
    state: State<'_, XrayClientState>,
    project_id: Option<String>,
) -> Result<Vec<XrayStepStatus>, String> {
    let client = get_xray_client(&app, &state).await?;
    client
        .get_step_statuses(project_id.as_deref())
        .await
        .map_err(format_err)
}
