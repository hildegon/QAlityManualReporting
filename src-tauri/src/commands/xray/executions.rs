use tauri::{AppHandle, State};

use crate::{
    models::xray::{CreateTestExecutionInput, CreateTestExecutionResult, TestExecution},
    state::XrayClientState,
};

use super::{format_err, get_xray_client};

#[tauri::command]
pub async fn get_test_executions(
    app: AppHandle,
    state: State<'_, XrayClientState>,
    project_key: String,
    limit: Option<u32>,
) -> Result<Vec<TestExecution>, String> {
    let client = get_xray_client(&app, &state).await?;
    let result = client
        .get_test_executions(&project_key, limit.unwrap_or(50))
        .await
        .map_err(format_err)?;
    Ok(result.test_executions.results)
}

/// Fetch test executions for a project filtered by a Jira fix version name.
#[tauri::command]
pub async fn get_test_executions_by_version(
    app: AppHandle,
    state: State<'_, XrayClientState>,
    project_key: String,
    version_name: String,
    limit: Option<u32>,
) -> Result<Vec<TestExecution>, String> {
    let client = get_xray_client(&app, &state).await?;
    let result = client
        .get_test_executions_by_version(&project_key, &version_name, limit.unwrap_or(100))
        .await
        .map_err(format_err)?;
    Ok(result.test_executions.results)
}

#[tauri::command]
pub async fn create_test_execution(
    app: AppHandle,
    state: State<'_, XrayClientState>,
    project_key: String,
    summary: String,
    test_plan_id: Option<String>,
    test_issue_ids: Option<Vec<String>>,
    description: Option<String>,
) -> Result<CreateTestExecutionResult, String> {
    let client = get_xray_client(&app, &state).await?;
    let result = client
        .create_test_execution(CreateTestExecutionInput {
            project_key,
            summary,
            description,
            test_issue_ids,
        })
        .await
        .map_err(format_err)?;

    // If a test plan was specified, associate the new execution with it.
    if let Some(plan_id) = test_plan_id {
        client
            .add_test_executions_to_test_plan(
                crate::models::xray::AddTestExecutionsToTestPlanInput {
                    test_plan_issue_id: plan_id,
                    test_exec_issue_ids: vec![result.test_execution.issue_id.clone()],
                },
            )
            .await
            .map_err(format_err)?;
    }

    Ok(result)
}

/// Add test issues to an existing test execution.
#[tauri::command]
pub async fn add_tests_to_test_execution(
    app: AppHandle,
    state: State<'_, XrayClientState>,
    test_exec_issue_id: String,
    test_issue_ids: Vec<String>,
) -> Result<(), String> {
    let client = get_xray_client(&app, &state).await?;
    client
        .add_tests_to_test_execution(&test_exec_issue_id, &test_issue_ids)
        .await
        .map_err(format_err)
}
