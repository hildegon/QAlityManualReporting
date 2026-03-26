use tauri::{AppHandle, Manager};

use crate::{
    api::common::validate_project_key,
    models::xray::TestLastRunEntry,
};

/// Persist the health-cache for `project_key` to disk so it survives app restarts.
///
/// Stored at `{app_config_dir}/health_cache/{project_key}.json`.
#[tauri::command]
pub async fn save_health_cache(
    app: AppHandle,
    project_key: String,
    entries: Vec<TestLastRunEntry>,
) -> Result<(), String> {
    validate_project_key(&project_key).map_err(|e| format!("{e:#}"))?;
    let cache_dir = app
        .path()
        .app_config_dir()
        .map_err(|e: tauri::Error| e.to_string())?
        .join("health_cache");
    std::fs::create_dir_all(&cache_dir)
        .map_err(|e: std::io::Error| format!("Failed to create health cache directory: {e}"))?;
    let path = cache_dir.join(format!("{project_key}.json"));
    let json = serde_json::to_string(&entries)
        .map_err(|e: serde_json::Error| format!("Failed to serialize entries: {e}"))?;
    std::fs::write(&path, json.as_bytes())
        .map_err(|e: std::io::Error| format!("Failed to write health cache: {e}"))
}

/// Load the persisted health-cache for `project_key` from disk.
///
/// Returns an empty list if no cache file exists yet.
#[tauri::command]
pub async fn load_health_cache(
    app: AppHandle,
    project_key: String,
) -> Result<Vec<TestLastRunEntry>, String> {
    validate_project_key(&project_key).map_err(|e| format!("{e:#}"))?;
    let path = app
        .path()
        .app_config_dir()
        .map_err(|e: tauri::Error| e.to_string())?
        .join("health_cache")
        .join(format!("{project_key}.json"));
    if !path.exists() {
        return Ok(vec![]);
    }
    let json = std::fs::read_to_string(&path)
        .map_err(|e: std::io::Error| format!("Failed to read health cache: {e}"))?;
    serde_json::from_str::<Vec<TestLastRunEntry>>(&json)
        .map_err(|e: serde_json::Error| format!("Failed to parse health cache: {e}"))
}
