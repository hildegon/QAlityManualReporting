use tauri::{AppHandle, State};

use crate::{
    api::xray_client::XrayClient,
    commands::config::load_config,
    models::xray::{
        AddTestsToTestPlanInput, CreateTestExecutionInput, CreateTestExecutionResult,
        CreateTestPlanInput, CreateTestPlanResult, CreateTestResult, CreateTestSetResult,
        CreateTestStepInput, CreateXrayTestInput, TestExecution, TestPlan, TestRunIteration,
        TestRunsPage, TestSetMembershipsResponse, UpdateTestRunStatusInput, UpdateTestRunStepData,
        XrayStepStatus, XrayTest, XrayTestRunStatus, XrayTestSet, XrayTestWithStatus,
    },
    state::XrayClientState,
};

/// Format an anyhow error with its full cause chain for debugging.
fn format_err(e: anyhow::Error) -> String {
    format!("{e:#}")
}

/// Return a clone of the shared `XrayClient`, constructing it from config on
/// first use.  Cloning is cheap — the bearer-token cache is shared via `Arc`.
async fn get_xray_client(
    app: &AppHandle,
    state: &State<'_, XrayClientState>,
) -> Result<XrayClient, String> {
    let mut guard = state.0.lock().await;
    if guard.is_none() {
        let config = load_config(app).map_err(format_err)?;
        if !config.is_xray_configured() {
            return Err(
                "Xray is not configured. Please set Client ID and Client Secret in Settings."
                    .into(),
            );
        }
        *guard = Some(XrayClient::new(
            config.xray_client_id,
            config.xray_client_secret,
        ));
    }
    // Unwrap is safe: we just ensured it is Some.
    Ok(guard.as_ref().unwrap().clone())
}

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

#[tauri::command]
/// Fetch step results for all iterations of a single test run (lazy load).
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

/// A step as received from the frontend for `create_test`.
#[derive(Debug, serde::Deserialize)]
pub struct StepPayload {
    pub action: String,
    pub data: Option<String>,
    pub result: Option<String>,
}

#[tauri::command]
pub async fn create_test(
    app: AppHandle,
    state: State<'_, XrayClientState>,
    project_key: String,
    summary: String,
    steps: Vec<StepPayload>,
    component: Option<String>,
) -> Result<CreateTestResult, String> {
    let client = get_xray_client(&app, &state).await?;
    let input = CreateXrayTestInput {
        project_key,
        summary,
        component,
        steps: steps
            .into_iter()
            .map(|s| CreateTestStepInput {
                action: s.action,
                data: s.data,
                result: s.result,
            })
            .collect(),
    };
    client.create_test(input).await.map_err(format_err)
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

#[tauri::command]
pub async fn authenticate_xray(
    app: AppHandle,
    state: State<'_, XrayClientState>,
) -> Result<(), String> {
    let client = get_xray_client(&app, &state).await?;
    client.authenticate().await.map_err(format_err)
}

#[tauri::command]
pub async fn get_tests(
    app: AppHandle,
    state: State<'_, XrayClientState>,
    project_key: String,
    limit: Option<u32>,
) -> Result<Vec<XrayTest>, String> {
    let client = get_xray_client(&app, &state).await?;
    client
        .get_tests(&project_key, limit.unwrap_or(100))
        .await
        .map_err(format_err)
}

#[tauri::command]
pub async fn get_test_sets(
    app: AppHandle,
    state: State<'_, XrayClientState>,
    project_key: String,
    limit: Option<u32>,
) -> Result<Vec<XrayTestSet>, String> {
    let client = get_xray_client(&app, &state).await?;
    client
        .get_test_sets(&project_key, limit.unwrap_or(100))
        .await
        .map_err(format_err)
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
    limit: Option<u32>,
) -> Result<TestSetMembershipsResponse, String> {
    let client = get_xray_client(&app, &state).await?;
    client
        .get_all_test_set_memberships(&project_key, limit.unwrap_or(100))
        .await
        .map_err(format_err)
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
