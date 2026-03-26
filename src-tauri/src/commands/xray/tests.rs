use tauri::{AppHandle, Emitter, State};

use crate::{
    models::xray::{
        CreateTestResult, CreateTestStepInput, CreateXrayTestInput, TestsStreamPage,
        XrayTest, XrayTestDetail, XrayTestExportData,
    },
    state::XrayClientState,
};

use super::{format_err, get_xray_client, StepPayload};

/// Returns the first page of tests immediately so the UI can start rendering.
/// If there are more pages the remaining tests are emitted as `tests:page` events
/// from a background task — the frontend listens for these and appends them to
/// the cache, so they appear progressively without blocking the UI.
#[tauri::command]
pub async fn get_tests(
    app: AppHandle,
    state: State<'_, XrayClientState>,
    project_key: String,
) -> Result<Vec<XrayTest>, String> {
    let client = get_xray_client(&app, &state).await?;
    let first = client.get_tests_first_page(&project_key).await.map_err(format_err)?;

    if first.done {
        // All tests fit in the first page — emit a done event so the frontend
        // knows streaming is complete, then return.
        let _ = app.emit(
            "tests:page",
            TestsStreamPage { project_key, tests: vec![], done: true },
        );
    } else {
        let start = first.results.len() as u32;
        let total = first.total;
        let key = project_key.clone();
        tokio::spawn(async move {
            if client.stream_tests_from(&app, &key, start, total).await.is_err() {
                // Emit a done signal so the frontend doesn't wait forever.
                let _ = app.emit(
                    "tests:page",
                    TestsStreamPage { project_key: key, tests: vec![], done: true },
                );
            }
        });
    }

    Ok(first.results)
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

/// Fetch full Xray test detail (testType, manual steps, gherkin) for a single test by its Jira key.
#[tauri::command]
pub async fn get_test_detail(
    app: AppHandle,
    state: State<'_, XrayClientState>,
    test_key: String,
) -> Result<Option<XrayTestDetail>, String> {
    let client = get_xray_client(&app, &state).await?;
    client.get_test_detail(&test_key).await.map_err(format_err)
}

/// Fetch steps, gherkin, and unstructured content for the given test issue IDs.
///
/// Used by the export flow to enrich test data without bloating the main test-list query.
#[tauri::command]
pub async fn get_tests_export_data(
    app: AppHandle,
    state: State<'_, XrayClientState>,
    test_issue_ids: Vec<String>,
) -> Result<Vec<XrayTestExportData>, String> {
    let client = get_xray_client(&app, &state).await?;
    client.get_tests_export_data(&test_issue_ids).await.map_err(format_err)
}

/// Start fetching the most-recent test run for each of the given test issue IDs.
///
/// Returns immediately. Results arrive as `tests:health:batch` Tauri events,
/// each carrying a `{ entries, done, total, processed }` payload. The final event
/// has `done: true` so the frontend knows when all pages have been processed.
#[tauri::command]
pub async fn get_tests_health_data(
    app: AppHandle,
    state: State<'_, XrayClientState>,
    test_issue_ids: Vec<String>,
) -> Result<(), String> {
    let client = get_xray_client(&app, &state).await?;
    tokio::spawn(async move {
        if let Err(e) = client.stream_health_batched(&app, &test_issue_ids).await {
            let _ = app.emit(
                "tests:health:error",
                format!("Failed to load test health data: {e:#}"),
            );
        }
    });
    Ok(())
}

#[tauri::command]
pub async fn authenticate_xray(
    app: AppHandle,
    state: State<'_, XrayClientState>,
) -> Result<(), String> {
    let client = get_xray_client(&app, &state).await?;
    client.authenticate().await.map_err(format_err)
}
