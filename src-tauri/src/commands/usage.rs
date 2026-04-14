use tauri::{AppHandle, Manager, State};

use crate::state::{ApiUsageSnapshot, ApiUsageState};

/// Return a point-in-time snapshot of Jira, Xray, and Confluence API usage
/// counters.  Also persists the current counters to disk so all-time totals
/// survive app restarts.
#[tauri::command]
pub async fn get_api_usage(
    app: AppHandle,
    state: State<'_, ApiUsageState>,
) -> Result<ApiUsageSnapshot, String> {
    let snapshot = state.snapshot();

    // Persist to disk (best-effort — non-blocking since the file is tiny).
    if let Ok(dir) = app.path().app_config_dir() {
        let _ = std::fs::create_dir_all(&dir);
        state.save_to_file(&dir.join("api_usage.json"));
    }

    Ok(snapshot)
}
