use tauri::{AppHandle, State};

use crate::{
    models::xray::{
        CreateTestSetResult, TestSetMembershipsResponse, XrayTest, XrayTestSet, XrayTestWithStatus,
    },
    state::XrayClientState,
};

use super::{format_err, get_xray_client};

#[tauri::command]
pub async fn get_test_sets(
    app: AppHandle,
    state: State<'_, XrayClientState>,
    project_key: String,
) -> Result<Vec<XrayTestSet>, String> {
    let client = get_xray_client(&app, &state).await?;
    client.get_test_sets(&project_key).await.map_err(format_err)
}

#[tauri::command]
pub async fn get_test_set_tests(
    app: AppHandle,
    state: State<'_, XrayClientState>,
    issue_id: String,
) -> Result<Vec<XrayTest>, String> {
    let client = get_xray_client(&app, &state).await?;
    client
        .get_test_set_tests(&issue_id)
        .await
        .map_err(format_err)
}

/// Fetch all tests in a test set, including each test's latest execution status.
/// Used by the Coverage page to show per-test status without requiring a specific
/// test execution to be selected.
#[tauri::command]
pub async fn get_test_set_tests_with_status(
    app: AppHandle,
    state: State<'_, XrayClientState>,
    issue_id: String,
) -> Result<Vec<XrayTestWithStatus>, String> {
    let client = get_xray_client(&app, &state).await?;
    client
        .get_test_set_tests_with_status(&issue_id)
        .await
        .map_err(format_err)
}

/// Fetch all test sets for a project and build a membership map
/// (test_issue_id → list of test sets) in a single backend round-trip.
#[tauri::command]
pub async fn get_all_test_set_memberships(
    app: AppHandle,
    state: State<'_, XrayClientState>,
    project_key: String,
) -> Result<TestSetMembershipsResponse, String> {
    let client = get_xray_client(&app, &state).await?;
    client
        .get_all_test_set_memberships(&project_key)
        .await
        .map_err(format_err)
}

#[tauri::command]
pub async fn create_test_set(
    app: AppHandle,
    state: State<'_, XrayClientState>,
    project_key: String,
    summary: String,
    component: Option<String>,
) -> Result<CreateTestSetResult, String> {
    let client = get_xray_client(&app, &state).await?;
    client
        .create_test_set(&project_key, &summary, component.as_deref(), None)
        .await
        .map_err(format_err)
}

#[tauri::command]
pub async fn add_tests_to_test_set(
    app: AppHandle,
    state: State<'_, XrayClientState>,
    test_set_issue_id: String,
    test_issue_ids: Vec<String>,
) -> Result<(), String> {
    let client = get_xray_client(&app, &state).await?;
    client
        .add_tests_to_test_set(&test_set_issue_id, &test_issue_ids)
        .await
        .map_err(format_err)
}

/// Remove test issues from a test set.
#[tauri::command]
pub async fn remove_tests_from_test_set(
    app: AppHandle,
    state: State<'_, XrayClientState>,
    test_set_issue_id: String,
    test_issue_ids: Vec<String>,
) -> Result<(), String> {
    let client = get_xray_client(&app, &state).await?;
    client
        .remove_tests_from_test_set(&test_set_issue_id, &test_issue_ids)
        .await
        .map_err(format_err)
}
