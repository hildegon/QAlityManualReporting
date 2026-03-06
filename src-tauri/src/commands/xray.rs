use tauri::AppHandle;

use crate::{
    api::xray_client::XrayClient,
    commands::config::load_config,
    models::xray::{
        CreateTestExecutionInput, CreateTestExecutionResult, TestExecution, TestPlan, TestRunsPage,
        UpdateTestRunStatusInput, UpdateTestRunStepData, XrayStepStatus, XrayTest,
        XrayTestRunStatus,
    },
};

/// Format an anyhow error with its full cause chain for debugging.
fn format_err(e: anyhow::Error) -> String {
    format!("{e:#}")
}

fn make_xray_client(app: &AppHandle) -> Result<XrayClient, String> {
    let config = load_config(app).map_err(format_err)?;
    if !config.is_xray_configured() {
        return Err(
            "Xray is not configured. Please set Client ID and Client Secret in Settings.".into(),
        );
    }
    Ok(XrayClient::new(
        config.xray_client_id,
        config.xray_client_secret,
    ))
}

#[tauri::command]
pub async fn get_test_plans(
    app: AppHandle,
    project_key: String,
    limit: Option<u32>,
) -> Result<Vec<TestPlan>, String> {
    let client = make_xray_client(&app)?;
    let result = client
        .get_test_plans(&project_key, limit.unwrap_or(50))
        .await
        .map_err(format_err)?;
    Ok(result.test_plans.results)
}

#[tauri::command]
pub async fn get_test_executions(
    app: AppHandle,
    project_key: String,
    limit: Option<u32>,
) -> Result<Vec<TestExecution>, String> {
    let client = make_xray_client(&app)?;
    let result = client
        .get_test_executions(&project_key, limit.unwrap_or(50))
        .await
        .map_err(format_err)?;
    Ok(result.test_executions.results)
}

#[tauri::command]
pub async fn get_test_runs(
    app: AppHandle,
    test_execution_issue_id: String,
    limit: Option<u32>,
    start: Option<u32>,
) -> Result<TestRunsPage, String> {
    let client = make_xray_client(&app)?;
    let result = client
        .get_test_runs(
            &test_execution_issue_id,
            limit.unwrap_or(50),
            start.unwrap_or(0),
        )
        .await
        .map_err(format_err)?;
    Ok(result.test_runs)
}

#[tauri::command]
pub async fn update_test_run_status(
    app: AppHandle,
    test_run_id: String,
    status: String,
) -> Result<(), String> {
    let client = make_xray_client(&app)?;
    client
        .update_test_run_status(&test_run_id, UpdateTestRunStatusInput { status })
        .await
        .map_err(format_err)
}

#[tauri::command]
pub async fn update_test_run_comment(
    app: AppHandle,
    test_run_id: String,
    comment: String,
) -> Result<(), String> {
    let client = make_xray_client(&app)?;
    client
        .update_test_run_comment(&test_run_id, &comment)
        .await
        .map_err(format_err)
}

#[tauri::command]
pub async fn get_xray_statuses(
    app: AppHandle,
    project_id: Option<String>,
) -> Result<Vec<XrayTestRunStatus>, String> {
    let client = make_xray_client(&app)?;
    client
        .get_statuses(project_id.as_deref())
        .await
        .map_err(format_err)
}

#[tauri::command]
pub async fn create_test_execution(
    app: AppHandle,
    project_key: String,
    summary: String,
    test_plan_id: Option<String>,
    test_issue_ids: Option<Vec<String>>,
    description: Option<String>,
) -> Result<CreateTestExecutionResult, String> {
    let client = make_xray_client(&app)?;
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

#[tauri::command]
pub async fn get_step_statuses(
    app: AppHandle,
    project_id: Option<String>,
) -> Result<Vec<XrayStepStatus>, String> {
    let client = make_xray_client(&app)?;
    client
        .get_step_statuses(project_id.as_deref())
        .await
        .map_err(format_err)
}

#[tauri::command]
pub async fn update_test_run_step_status(
    app: AppHandle,
    test_run_id: String,
    step_id: String,
    status: String,
) -> Result<(), String> {
    let client = make_xray_client(&app)?;
    client
        .update_test_run_step_status(&test_run_id, &step_id, &status)
        .await
        .map_err(format_err)
}

#[tauri::command]
pub async fn update_test_run_step(
    app: AppHandle,
    test_run_id: String,
    step_id: String,
    comment: Option<String>,
    actual_result: Option<String>,
    status: Option<String>,
) -> Result<(), String> {
    let client = make_xray_client(&app)?;
    let data = UpdateTestRunStepData {
        comment,
        actual_result,
        status,
    };
    client
        .update_test_run_step(&test_run_id, &step_id, &data)
        .await
        .map_err(format_err)
}

#[tauri::command]
pub async fn authenticate_xray(app: AppHandle) -> Result<(), String> {
    let client = make_xray_client(&app)?;
    client.authenticate().await.map_err(format_err)
}

#[tauri::command]
pub async fn get_tests(
    app: AppHandle,
    project_key: String,
    limit: Option<u32>,
) -> Result<Vec<XrayTest>, String> {
    let client = make_xray_client(&app)?;
    client
        .get_tests(&project_key, limit.unwrap_or(100))
        .await
        .map_err(format_err)
}
