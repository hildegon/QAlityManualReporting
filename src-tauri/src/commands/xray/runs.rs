use tauri::{AppHandle, State};

use crate::{
    models::xray::{
        TestRunIteration, TestRunStatusesPage, TestRunsPage, UpdateTestRunStatusInput,
        UpdateTestRunStepData,
    },
    state::XrayClientState,
};

use super::{format_err, get_xray_client};

#[tauri::command]
pub async fn get_test_runs(
    app: AppHandle,
    state: State<'_, XrayClientState>,
    test_execution_issue_id: String,
    limit: Option<u32>,
    start: Option<u32>,
) -> Result<TestRunsPage, String> {
    let client = get_xray_client(&app, &state).await?;
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

/// Fetch only the status of each test run in an execution (lightweight summary).
/// Used to render the mini progress bar on the ExecRow card without the overhead
/// of fetching steps, iterations, and Gherkin content.
#[tauri::command]
pub async fn get_test_run_statuses(
    app: AppHandle,
    state: State<'_, XrayClientState>,
    test_execution_issue_id: String,
    limit: Option<u32>,
    start: Option<u32>,
) -> Result<TestRunStatusesPage, String> {
    let client = get_xray_client(&app, &state).await?;
    let result = client
        .get_test_run_statuses(
            &test_execution_issue_id,
            limit.unwrap_or(100),
            start.unwrap_or(0),
        )
        .await
        .map_err(format_err)?;
    Ok(result.test_runs)
}

/// Fetch step results for all iterations of a single test run (lazy load).
#[tauri::command]
pub async fn get_iteration_step_results(
    app: AppHandle,
    state: State<'_, XrayClientState>,
    test_run_id: String,
) -> Result<Vec<TestRunIteration>, String> {
    let client = get_xray_client(&app, &state).await?;
    client
        .get_iteration_step_results(&test_run_id)
        .await
        .map_err(format_err)
}

#[tauri::command]
pub async fn update_test_run_status(
    app: AppHandle,
    state: State<'_, XrayClientState>,
    test_run_id: String,
    status: String,
) -> Result<(), String> {
    let client = get_xray_client(&app, &state).await?;
    client
        .update_test_run_status(&test_run_id, UpdateTestRunStatusInput { status })
        .await
        .map_err(format_err)
}

#[tauri::command]
pub async fn update_test_run_comment(
    app: AppHandle,
    state: State<'_, XrayClientState>,
    test_run_id: String,
    comment: String,
) -> Result<(), String> {
    let client = get_xray_client(&app, &state).await?;
    client
        .update_test_run_comment(&test_run_id, &comment)
        .await
        .map_err(format_err)
}

/// Set the overall status of a single dataset iteration within a test run.
///
/// `iteration_rank` is a 1-based string such as `"1"` or `"2"`.
#[tauri::command]
pub async fn update_iteration_status(
    app: AppHandle,
    state: State<'_, XrayClientState>,
    test_run_id: String,
    iteration_rank: String,
    status: String,
) -> Result<(), String> {
    let client = get_xray_client(&app, &state).await?;
    client
        .update_iteration_status(&test_run_id, &iteration_rank, &status)
        .await
        .map_err(format_err)
}

#[tauri::command]
pub async fn update_test_run_step_status(
    app: AppHandle,
    state: State<'_, XrayClientState>,
    test_run_id: String,
    step_id: String,
    status: String,
) -> Result<(), String> {
    let client = get_xray_client(&app, &state).await?;
    client
        .update_test_run_step_status(&test_run_id, &step_id, &status)
        .await
        .map_err(format_err)
}

#[tauri::command]
pub async fn update_test_run_step(
    app: AppHandle,
    state: State<'_, XrayClientState>,
    test_run_id: String,
    step_id: String,
    comment: Option<String>,
    actual_result: Option<String>,
    status: Option<String>,
) -> Result<(), String> {
    let client = get_xray_client(&app, &state).await?;
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

/// Link one or more Jira bug keys to a test run as Xray defects.
///
/// Returns the list of issue keys that were actually added to the run.
#[tauri::command]
pub async fn add_defects_to_test_run(
    app: AppHandle,
    state: State<'_, XrayClientState>,
    run_id: String,
    issue_keys: Vec<String>,
) -> Result<Vec<String>, String> {
    let client = get_xray_client(&app, &state).await?;
    client
        .add_defects_to_test_run(&run_id, &issue_keys)
        .await
        .map_err(format_err)
}
