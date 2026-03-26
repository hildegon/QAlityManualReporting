use tauri::{AppHandle, State};

use crate::{
    models::xray::{
        AddTestsToTestPlanInput, CreateTestPlanInput, CreateTestPlanResult, TestPlan, XrayTest,
    },
    state::XrayClientState,
};

use super::{format_err, get_xray_client};

#[tauri::command]
pub async fn get_test_plans(
    app: AppHandle,
    state: State<'_, XrayClientState>,
    project_key: String,
    limit: Option<u32>,
) -> Result<Vec<TestPlan>, String> {
    let client = get_xray_client(&app, &state).await?;
    let result = client
        .get_test_plans(&project_key, limit.unwrap_or(50))
        .await
        .map_err(format_err)?;
    Ok(result.test_plans.results)
}

#[tauri::command]
pub async fn get_test_plan_tests(
    app: AppHandle,
    state: State<'_, XrayClientState>,
    issue_id: String,
) -> Result<Vec<XrayTest>, String> {
    let client = get_xray_client(&app, &state).await?;
    client
        .get_test_plan_tests(&issue_id)
        .await
        .map_err(format_err)
}

/// Create a new Test Plan in the configured content project.
#[tauri::command]
pub async fn create_test_plan(
    app: AppHandle,
    state: State<'_, XrayClientState>,
    project_key: String,
    summary: String,
    description: Option<String>,
    component: Option<String>,
    fix_version: Option<String>,
) -> Result<CreateTestPlanResult, String> {
    let client = get_xray_client(&app, &state).await?;
    client
        .create_test_plan(CreateTestPlanInput {
            project_key,
            summary,
            description,
            component,
            fix_version,
        })
        .await
        .map_err(format_err)
}

/// Add test issues directly to a test plan's test scope.
#[tauri::command]
pub async fn add_tests_to_test_plan(
    app: AppHandle,
    state: State<'_, XrayClientState>,
    test_plan_issue_id: String,
    test_issue_ids: Vec<String>,
) -> Result<(), String> {
    let client = get_xray_client(&app, &state).await?;
    client
        .add_tests_to_test_plan(AddTestsToTestPlanInput {
            test_plan_issue_id,
            test_issue_ids,
        })
        .await
        .map_err(format_err)
}

/// Remove test issues from a test plan.
#[tauri::command]
pub async fn remove_tests_from_test_plan(
    app: AppHandle,
    state: State<'_, XrayClientState>,
    test_plan_issue_id: String,
    test_issue_ids: Vec<String>,
) -> Result<(), String> {
    let client = get_xray_client(&app, &state).await?;
    client
        .remove_tests_from_test_plan(&test_plan_issue_id, &test_issue_ids)
        .await
        .map_err(format_err)
}
