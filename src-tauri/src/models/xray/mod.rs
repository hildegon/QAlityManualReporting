#![allow(dead_code)]

use serde::Deserialize;

mod shared;
mod test;
mod test_execution;
mod test_health;
mod test_plan;
mod test_run;
mod test_set;

pub use shared::*;
pub use test::*;
pub use test_execution::*;
pub use test_health::*;
pub use test_plan::*;
pub use test_run::*;
pub use test_set::*;

use serde::Deserializer;

/// Deserialize a sequence that may be `null` in JSON as an empty `Vec`.
/// `#[serde(default)]` only handles *missing* fields; if the field is present
/// but explicitly `null`, this helper treats it as an empty collection instead.
fn deserialize_null_default<'de, D, T>(deserializer: D) -> Result<T, D::Error>
where
    D: Deserializer<'de>,
    T: Default + Deserialize<'de>,
{
    Ok(Option::deserialize(deserializer)?.unwrap_or_default())
}

/// Xray Cloud GraphQL returns the `jira` field as a JSON-encoded string.
/// This deserializer handles both forms: a raw string that needs parsing,
/// or an already-parsed object (for forward-compatibility).
fn deserialize_jira_json<'de, T, D>(deserializer: D) -> Result<T, D::Error>
where
    T: serde::de::DeserializeOwned,
    D: Deserializer<'de>,
{
    let value = serde_json::Value::deserialize(deserializer)?;
    match value {
        serde_json::Value::String(s) => serde_json::from_str(&s).map_err(serde::de::Error::custom),
        other => serde_json::from_value(other).map_err(serde::de::Error::custom),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Shared struct deserialization ─────────────────────────────────────────

    #[test]
    fn xray_status_deserializes_from_json() {
        let json = r#"{"name": "PASS"}"#;
        let status: XrayStatus = serde_json::from_str(json).unwrap();
        assert_eq!(status.name, "PASS");
    }

    #[test]
    fn xray_user_maps_camel_case_fields() {
        let json = r#"{"accountId": "abc123", "displayName": "Jane Doe"}"#;
        let user: XrayUser = serde_json::from_str(json).unwrap();
        assert_eq!(user.account_id.as_deref(), Some("abc123"));
        assert_eq!(user.display_name.as_deref(), Some("Jane Doe"));
    }

    #[test]
    fn xray_user_handles_null_optional_fields() {
        let json = r#"{"accountId": null, "displayName": null}"#;
        let user: XrayUser = serde_json::from_str(json).unwrap();
        assert!(user.account_id.is_none());
        assert!(user.display_name.is_none());
    }

    #[test]
    fn xray_page_info_maps_start_index() {
        let json = r#"{"startIndex": 10, "limit": 50, "total": 200}"#;
        let page: XrayPageInfo = serde_json::from_str(json).unwrap();
        assert_eq!(page.start_index, 10);
        assert_eq!(page.limit, 50);
        assert_eq!(page.total, 200);
    }

    #[test]
    fn latest_test_status_maps_final_field() {
        let json = r##"{"name": "PASS", "color": "#0f0", "description": "ok", "final": true}"##;
        let status: LatestTestStatus = serde_json::from_str(json).unwrap();
        assert_eq!(status.name, "PASS");
        assert_eq!(status.is_final, Some(true));
    }

    #[test]
    fn latest_test_status_handles_missing_optional_fields() {
        let json = r#"{"name": "TODO"}"#;
        let status: LatestTestStatus = serde_json::from_str(json).unwrap();
        assert_eq!(status.name, "TODO");
        assert!(status.color.is_none());
        assert!(status.is_final.is_none());
    }

    // ── deserialize_jira_json ─────────────────────────────────────────────────

    #[test]
    fn deserialize_jira_json_parses_json_encoded_string() {
        // Xray returns the `jira` field as a JSON-encoded string.
        let outer = r#"{"key": "{\"key\":\"T-1\",\"summary\":\"My test\"}"}"#;

        #[derive(serde::Deserialize)]
        struct Outer {
            #[serde(deserialize_with = "super::deserialize_jira_json")]
            key: Inner,
        }
        #[derive(serde::Deserialize, Debug)]
        struct Inner {
            key: String,
            summary: String,
        }

        let result: Outer = serde_json::from_str(outer).unwrap();
        assert_eq!(result.key.key, "T-1");
        assert_eq!(result.key.summary, "My test");
    }

    #[test]
    fn deserialize_jira_json_accepts_pre_parsed_object() {
        // Forward-compat path: field is already a JSON object, not a string.
        let outer = r#"{"key": {"key":"T-2","summary":"Another"}}"#;

        #[derive(serde::Deserialize)]
        struct Outer {
            #[serde(deserialize_with = "super::deserialize_jira_json")]
            key: Inner,
        }
        #[derive(serde::Deserialize, Debug)]
        struct Inner {
            key: String,
            summary: String,
        }

        let result: Outer = serde_json::from_str(outer).unwrap();
        assert_eq!(result.key.key, "T-2");
    }

    #[test]
    fn deserialize_jira_json_returns_error_on_invalid_inner_json() {
        let outer = r#"{"key": "not-valid-json{"}"#;

        #[derive(serde::Deserialize)]
        struct Outer {
            #[serde(deserialize_with = "super::deserialize_jira_json")]
            key: Inner,
        }
        #[derive(serde::Deserialize, Debug)]
        struct Inner {
            key: String,
        }

        let result: serde_json::Result<Outer> = serde_json::from_str(outer);
        assert!(result.is_err());
    }

    // ── TestRun serde ─────────────────────────────────────────────────────────

    #[test]
    fn test_run_status_deserializes_is_final() {
        let json = r#"{"name": "FAIL", "final": false}"#;
        let status: TestRunStatus = serde_json::from_str(json).unwrap();
        assert_eq!(status.name, "FAIL");
        assert_eq!(status.is_final, Some(false));
    }

    #[test]
    fn test_run_defects_defaults_to_empty_vec() {
        // Verify the #[serde(default)] on the defects field works correctly.
        let json = r#"{
            "id": "run-1",
            "status": {"name": "PASS"},
            "test": {"issueId": "t-1", "jira": "{\"key\":\"T-1\",\"summary\":\"s\"}"}
        }"#;
        let run: TestRun = serde_json::from_str(json).unwrap();
        assert!(run.defects.is_empty());
        assert!(run.parameters.is_empty());
    }

    // ── TestExecution serde ───────────────────────────────────────────────────

    #[test]
    fn fix_version_deserializes_id_and_name() {
        let json = r#"{"id": "10001", "name": "v2.0.0"}"#;
        let fv: FixVersion = serde_json::from_str(json).unwrap();
        assert_eq!(fv.id, "10001");
        assert_eq!(fv.name, "v2.0.0");
    }

    // ── TestPlan serde ────────────────────────────────────────────────────────

    #[test]
    fn test_plan_result_is_optional_with_warnings() {
        let json = r#"{"testPlan": null, "warnings": ["no tests added"]}"#;
        let result: CreateTestPlanResult = serde_json::from_str(json).unwrap();
        assert!(result.test_plan.is_none());
        assert_eq!(result.warnings.as_deref().unwrap(), &["no tests added"]);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // GraphQL Response Resilience Tests
    //
    // These tests validate that our serde models can correctly deserialize
    // realistic Xray Cloud GraphQL responses, including edge cases with
    // null fields, missing optionals, empty arrays, and the jira-as-string
    // encoding that Xray uses.
    // ══════════════════════════════════════════════════════════════════════════

    // ── getTests full response ────────────────────────────────────────────────

    #[test]
    fn tests_result_deserializes_full_response() {
        let json = r#"{
            "getTests": {
                "total": 2,
                "start": 0,
                "limit": 100,
                "results": [
                    {
                        "issueId": "12345",
                        "testType": {"name": "Manual", "kind": "Steps"},
                        "jira": "{\"key\":\"PROJ-10\",\"summary\":\"Login test\",\"status\":{\"name\":\"Open\"},\"priority\":{\"name\":\"High\"},\"components\":[{\"name\":\"Auth\"}],\"labels\":[\"smoke\",\"regression\"],\"created\":\"2024-01-15T10:00:00.000+0000\",\"assignee\":{\"accountId\":\"abc123\",\"displayName\":\"Jane Doe\"}}"
                    },
                    {
                        "issueId": "12346",
                        "testType": {"name": "Cucumber", "kind": "Gherkin"},
                        "jira": "{\"key\":\"PROJ-11\",\"summary\":\"Checkout flow\"}"
                    }
                ]
            }
        }"#;

        let result: TestsResult = serde_json::from_str(json).unwrap();
        assert_eq!(result.get_tests.total, 2);
        assert_eq!(result.get_tests.results.len(), 2);

        let t0 = &result.get_tests.results[0];
        assert_eq!(t0.issue_id, "12345");
        assert_eq!(t0.jira.key, "PROJ-10");
        assert_eq!(t0.jira.summary, "Login test");
        assert_eq!(t0.jira.status.as_ref().unwrap().name, "Open");
        assert_eq!(t0.jira.priority.as_ref().unwrap().name, "High");
        assert_eq!(t0.jira.components.as_ref().unwrap().len(), 1);
        assert_eq!(t0.jira.labels.as_ref().unwrap(), &["smoke", "regression"]);
        assert!(t0.jira.created.is_some());
        assert_eq!(
            t0.jira.assignee.as_ref().unwrap().display_name.as_deref(),
            Some("Jane Doe")
        );
        assert_eq!(t0.test_type.as_ref().unwrap().name, "Manual");

        let t1 = &result.get_tests.results[1];
        assert_eq!(t1.issue_id, "12346");
        assert_eq!(t1.jira.key, "PROJ-11");
        // Optional fields absent from the jira JSON string
        assert!(t1.jira.status.is_none());
        assert!(t1.jira.priority.is_none());
        assert!(t1.jira.components.is_none());
        assert!(t1.jira.labels.is_none());
        assert!(t1.jira.assignee.is_none());
    }

    #[test]
    fn tests_result_empty_results() {
        let json = r#"{"getTests": {"total": 0, "start": 0, "limit": 100, "results": []}}"#;
        let result: TestsResult = serde_json::from_str(json).unwrap();
        assert_eq!(result.get_tests.total, 0);
        assert!(result.get_tests.results.is_empty());
    }

    #[test]
    fn tests_result_missing_pagination_fields() {
        let json = r#"{"getTests": {"total": 5, "results": []}}"#;
        let result: TestsResult = serde_json::from_str(json).unwrap();
        assert_eq!(result.get_tests.total, 5);
        assert!(result.get_tests.start.is_none());
        assert!(result.get_tests.limit.is_none());
    }

    #[test]
    fn xray_test_with_null_test_type() {
        let json = r#"{
            "issueId": "99",
            "testType": null,
            "jira": "{\"key\":\"T-1\",\"summary\":\"s\"}"
        }"#;
        let test: XrayTest = serde_json::from_str(json).unwrap();
        assert!(test.test_type.is_none());
    }

    // ── getTestExecutions full response ───────────────────────────────────────

    #[test]
    fn test_executions_result_full_response() {
        let json = r#"{
            "getTestExecutions": {
                "total": 1,
                "start": 0,
                "limit": 100,
                "results": [
                    {
                        "issueId": "ex-1",
                        "projectId": "proj-1",
                        "jira": "{\"key\":\"PROJ-100\",\"summary\":\"Sprint 5 Execution\",\"status\":{\"name\":\"In Progress\"},\"assignee\":{\"accountId\":\"u1\",\"displayName\":\"John\"},\"fixVersions\":[{\"id\":\"10001\",\"name\":\"v2.0.0\"}]}"
                    }
                ]
            }
        }"#;

        let result: TestExecutionsResult = serde_json::from_str(json).unwrap();
        let exec = &result.test_executions.results[0];
        assert_eq!(exec.issue_id, "ex-1");
        assert_eq!(exec.project_id, "proj-1");
        assert_eq!(exec.jira.key, "PROJ-100");
        assert_eq!(exec.jira.summary, "Sprint 5 Execution");
        assert_eq!(exec.jira.status.as_ref().unwrap().name, "In Progress");
        assert_eq!(
            exec.jira.assignee.as_ref().unwrap().display_name.as_deref(),
            Some("John")
        );
        let fv = &exec.jira.fix_versions.as_ref().unwrap()[0];
        assert_eq!(fv.id, "10001");
        assert_eq!(fv.name, "v2.0.0");
    }

    #[test]
    fn test_execution_with_null_optional_jira_fields() {
        let json = r#"{
            "issueId": "ex-2",
            "projectId": "proj-1",
            "jira": "{\"key\":\"PROJ-101\",\"summary\":\"Bare Execution\"}"
        }"#;
        let exec: TestExecution = serde_json::from_str(json).unwrap();
        assert!(exec.jira.status.is_none());
        assert!(exec.jira.assignee.is_none());
        assert!(exec.jira.fix_versions.is_none());
    }

    // ── getTestRuns full response (manual, steps, iterations, defects) ────────

    #[test]
    fn test_runs_result_full_manual_response() {
        let json = r##"{
            "getTestRuns": {
                "total": 1,
                "start": 0,
                "limit": 50,
                "results": [
                    {
                        "id": "run-1",
                        "status": {"name": "FAIL", "color": "#FF0000", "description": "Failed", "final": true},
                        "test": {
                            "issueId": "t-1",
                            "jira": "{\"key\":\"T-1\",\"summary\":\"Login test\"}"
                        },
                        "testType": {"name": "Manual", "kind": "Steps"},
                        "comment": "Failed on step 3",
                        "startedOn": "2024-03-01T10:00:00.000+0000",
                        "finishedOn": "2024-03-01T10:15:00.000+0000",
                        "assigneeId": "user-1",
                        "executedById": "user-2",
                        "defects": ["BUG-1", "BUG-2"],
                        "parameters": [{"name": "browser", "value": "Chrome"}],
                        "steps": [
                            {
                                "id": "step-1",
                                "status": {"name": "PASS", "description": "Passed", "color": "#00FF00"},
                                "action": "Open login page",
                                "data": "URL: /login",
                                "result": "Page loads",
                                "actualResult": "Page loaded in 2s",
                                "comment": null,
                                "defects": null,
                                "evidence": []
                            },
                            {
                                "id": "step-2",
                                "status": {"name": "FAIL", "color": "#FF0000"},
                                "action": "Enter credentials",
                                "data": null,
                                "result": "Redirected to dashboard",
                                "actualResult": "Error 500 shown",
                                "comment": "Server crashed",
                                "defects": ["BUG-1"],
                                "evidence": [
                                    {
                                        "id": "ev-1",
                                        "filename": "screenshot.png",
                                        "storedInJira": false,
                                        "downloadLink": "https://xray.cloud.getxray.app/api/v2/evidence/ev-1",
                                        "size": 54321,
                                        "createdOn": "2024-03-01T10:14:00.000+0000"
                                    }
                                ]
                            }
                        ],
                        "evidence": [
                            {
                                "id": "ev-run-1",
                                "filename": "full-log.txt",
                                "downloadLink": "https://xray.cloud.getxray.app/api/v2/evidence/ev-run-1"
                            }
                        ]
                    }
                ]
            }
        }"##;

        let result: TestRunsResult = serde_json::from_str(json).unwrap();
        assert_eq!(result.test_runs.total, 1);
        let run = &result.test_runs.results[0];
        assert_eq!(run.id, "run-1");
        assert_eq!(run.status.name, "FAIL");
        assert_eq!(run.status.is_final, Some(true));
        assert_eq!(run.test.issue_id, "t-1");
        assert_eq!(run.test.jira.key, "T-1");
        assert_eq!(run.test_type.as_ref().unwrap().name, "Manual");
        assert_eq!(run.comment.as_deref(), Some("Failed on step 3"));
        assert!(run.started_on.is_some());
        assert!(run.finished_on.is_some());
        assert_eq!(run.assignee_id.as_deref(), Some("user-1"));
        assert_eq!(run.executed_by_id.as_deref(), Some("user-2"));
        assert_eq!(run.defects, vec!["BUG-1", "BUG-2"]);
        assert_eq!(run.parameters.len(), 1);
        assert_eq!(run.parameters[0].name.as_deref(), Some("browser"));
        assert_eq!(run.evidence.len(), 1);
        assert_eq!(run.evidence[0].filename.as_deref(), Some("full-log.txt"));

        let steps = run.steps.as_ref().unwrap();
        assert_eq!(steps.len(), 2);
        assert_eq!(steps[0].id, "step-1");
        assert_eq!(steps[0].status.as_ref().unwrap().name, "PASS");
        assert_eq!(steps[0].action.as_deref(), Some("Open login page"));
        assert!(steps[0].evidence.is_empty());
        assert_eq!(steps[1].evidence.len(), 1);
        assert_eq!(steps[1].defects.as_ref().unwrap(), &["BUG-1"]);
    }

    #[test]
    fn test_run_with_null_defects_and_parameters() {
        let json = r#"{
            "id": "run-2",
            "status": {"name": "TODO"},
            "test": {"issueId": "t-2", "jira": "{\"key\":\"T-2\",\"summary\":\"s\"}"},
            "defects": null,
            "parameters": null,
            "evidence": null
        }"#;
        let run: TestRun = serde_json::from_str(json).unwrap();
        assert!(run.defects.is_empty(), "null defects should deserialize to empty Vec");
        assert!(run.parameters.is_empty(), "null parameters should deserialize to empty Vec");
        assert!(run.evidence.is_empty(), "null evidence should deserialize to empty Vec");
    }

    #[test]
    fn test_run_with_missing_defects_and_parameters() {
        let json = r#"{
            "id": "run-3",
            "status": {"name": "PASS"},
            "test": {"issueId": "t-3", "jira": "{\"key\":\"T-3\",\"summary\":\"s\"}"}
        }"#;
        let run: TestRun = serde_json::from_str(json).unwrap();
        assert!(run.defects.is_empty(), "missing defects should default to empty Vec");
        assert!(run.parameters.is_empty(), "missing parameters should default to empty Vec");
        assert!(run.evidence.is_empty(), "missing evidence should default to empty Vec");
        assert!(run.steps.is_none());
        assert!(run.gherkin.is_none());
        assert!(run.comment.is_none());
        assert!(run.started_on.is_none());
        assert!(run.finished_on.is_none());
        assert!(run.assignee_id.is_none());
        assert!(run.executed_by_id.is_none());
        assert!(run.iterations.is_none());
        assert!(run.test_execution.is_none());
        assert!(run.results.is_none());
        assert!(run.scenario_type.is_none());
        assert!(run.test_type.is_none());
    }

    // ── Test run with iterations (parametrized) ──────────────────────────────

    #[test]
    fn test_run_with_iterations() {
        let json = r##"{
            "id": "run-iter",
            "status": {"name": "PASS"},
            "test": {"issueId": "t-iter", "jira": "{\"key\":\"T-50\",\"summary\":\"Param test\"}"},
            "iterations": {
                "total": 2,
                "start": 0,
                "limit": 50,
                "results": [
                    {
                        "rank": "1",
                        "parameters": [{"name": "user", "value": "admin"}],
                        "status": {"name": "PASS", "color": "#00FF00"},
                        "stepResults": {
                            "results": [
                                {
                                    "id": "sr-1",
                                    "status": {"name": "PASS"},
                                    "comment": null,
                                    "actualResult": "OK",
                                    "defects": []
                                }
                            ]
                        }
                    },
                    {
                        "rank": "2",
                        "parameters": [{"name": "user", "value": "guest"}],
                        "status": {"name": "FAIL"},
                        "stepResults": null
                    }
                ]
            }
        }"##;
        let run: TestRun = serde_json::from_str(json).unwrap();
        let iters = run.iterations.as_ref().unwrap();
        assert_eq!(iters.total, Some(2));
        assert_eq!(iters.results.len(), 2);

        let i0 = &iters.results[0];
        assert_eq!(i0.rank.as_deref(), Some("1"));
        assert_eq!(i0.parameters[0].name.as_deref(), Some("user"));
        assert_eq!(i0.parameters[0].value.as_deref(), Some("admin"));
        assert_eq!(i0.status.as_ref().unwrap().name, "PASS");
        let sr = &i0.step_results.as_ref().unwrap().results;
        assert_eq!(sr.len(), 1);
        assert_eq!(sr[0].actual_result.as_deref(), Some("OK"));

        let i1 = &iters.results[1];
        assert!(i1.step_results.is_none(), "null stepResults should be None");
    }

    // ── Test run with Cucumber/BDD results ───────────────────────────────────

    #[test]
    fn test_run_cucumber_results() {
        let json = r#"{
            "id": "run-cuke",
            "status": {"name": "PASS"},
            "test": {"issueId": "t-cuke", "jira": "{\"key\":\"T-C\",\"summary\":\"BDD\"}"},
            "testType": {"name": "Cucumber", "kind": "Gherkin"},
            "gherkin": "Feature: Login\n  Scenario: Valid login",
            "scenarioType": "Scenario",
            "results": [
                {
                    "status": {"name": "PASS"},
                    "name": "Valid login",
                    "log": null,
                    "duration": 1.234,
                    "backgrounds": [],
                    "hooks": [
                        {
                            "keyword": null,
                            "name": "Before hook",
                            "status": {"name": "PASS"},
                            "error": null,
                            "duration": 0.01,
                            "log": null,
                            "embeddings": []
                        }
                    ],
                    "steps": [
                        {
                            "keyword": "Given",
                            "name": "the user is on the login page",
                            "status": {"name": "PASS"},
                            "error": null,
                            "duration": 0.5,
                            "log": null,
                            "embeddings": [
                                {
                                    "filename": "step1.png",
                                    "mimeType": "image/png",
                                    "data": "iVBORw0KGgo=",
                                    "downloadLink": null
                                }
                            ]
                        }
                    ]
                }
            ]
        }"#;

        let run: TestRun = serde_json::from_str(json).unwrap();
        assert_eq!(run.gherkin.as_deref(), Some("Feature: Login\n  Scenario: Valid login"));
        assert_eq!(run.scenario_type.as_deref(), Some("Scenario"));
        let results = run.results.as_ref().unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name.as_deref(), Some("Valid login"));
        assert_eq!(results[0].duration, Some(1.234));
        assert!(results[0].backgrounds.is_empty());
        assert_eq!(results[0].hooks.len(), 1);
        let steps = results[0].steps.as_ref().unwrap();
        assert_eq!(steps[0].keyword.as_deref(), Some("Given"));
        assert_eq!(steps[0].embeddings.len(), 1);
        assert_eq!(steps[0].embeddings[0].mime_type.as_deref(), Some("image/png"));
        assert!(steps[0].embeddings[0].data.is_some());
    }

    // ── Test run with testExecution reference ────────────────────────────────

    #[test]
    fn test_run_with_execution_reference() {
        let json = r#"{
            "id": "run-ref",
            "status": {"name": "PASS"},
            "test": {"issueId": "t-1", "jira": "{\"key\":\"T-1\",\"summary\":\"s\"}"},
            "testExecution": {
                "issueId": "exec-99",
                "jira": "{\"key\":\"EXEC-99\",\"summary\":\"Sprint 10\"}"
            }
        }"#;
        let run: TestRun = serde_json::from_str(json).unwrap();
        let exec = run.test_execution.as_ref().unwrap();
        assert_eq!(exec.issue_id, "exec-99");
        assert_eq!(exec.jira.key, "EXEC-99");
        assert_eq!(exec.jira.summary, "Sprint 10");
    }

    // ── getTestSets full response ────────────────────────────────────────────

    #[test]
    fn test_sets_result_full_response() {
        let json = r#"{
            "getTestSets": {
                "total": 1,
                "start": 0,
                "limit": 100,
                "results": [
                    {
                        "issueId": "ts-1",
                        "jira": "{\"key\":\"TS-1\",\"summary\":\"Auth test set\",\"status\":{\"name\":\"Open\"}}"
                    }
                ]
            }
        }"#;
        let result: TestSetsResult = serde_json::from_str(json).unwrap();
        assert_eq!(result.get_test_sets.total, 1);
        let ts = &result.get_test_sets.results[0];
        assert_eq!(ts.issue_id, "ts-1");
        assert_eq!(ts.jira.key, "TS-1");
        assert_eq!(ts.jira.summary, "Auth test set");
        assert_eq!(ts.jira.status.as_ref().unwrap().name, "Open");
    }

    #[test]
    fn test_set_detail_with_tests() {
        let json = r#"{
            "getTestSet": {
                "issueId": "ts-detail",
                "tests": {
                    "results": [
                        {
                            "issueId": "t-in-set",
                            "testType": null,
                            "jira": "{\"key\":\"T-99\",\"summary\":\"Nested test\"}"
                        }
                    ]
                }
            }
        }"#;
        let result: TestSetResult = serde_json::from_str(json).unwrap();
        assert_eq!(result.get_test_set.issue_id, "ts-detail");
        assert_eq!(result.get_test_set.tests.results.len(), 1);
        assert_eq!(result.get_test_set.tests.results[0].jira.key, "T-99");
    }

    // ── getTestPlans full response ───────────────────────────────────────────

    #[test]
    fn test_plans_result_full_response() {
        let json = r#"{
            "getTestPlans": {
                "total": 1,
                "start": 0,
                "limit": 100,
                "results": [
                    {
                        "issueId": "tp-1",
                        "projectId": "proj-1",
                        "jira": "{\"key\":\"TP-1\",\"summary\":\"Release 2.0 plan\",\"issuetype\":{\"name\":\"Test Plan\"},\"status\":{\"name\":\"Draft\"}}"
                    }
                ]
            }
        }"#;
        let result: TestPlansResult = serde_json::from_str(json).unwrap();
        assert_eq!(result.test_plans.total, 1);
        let tp = &result.test_plans.results[0];
        assert_eq!(tp.issue_id, "tp-1");
        assert_eq!(tp.project_id, "proj-1");
        assert_eq!(tp.jira.key, "TP-1");
        assert_eq!(tp.jira.issue_type.as_ref().unwrap().name, "Test Plan");
        assert_eq!(tp.jira.status.as_ref().unwrap().name, "Draft");
    }

    #[test]
    fn test_plan_with_null_optional_jira_fields() {
        let json = r#"{
            "issueId": "tp-2",
            "projectId": "proj-1",
            "jira": "{\"key\":\"TP-2\",\"summary\":\"Bare plan\"}"
        }"#;
        let tp: TestPlan = serde_json::from_str(json).unwrap();
        assert!(tp.jira.issue_type.is_none());
        assert!(tp.jira.status.is_none());
    }

    // ── Test health (batched) responses ──────────────────────────────────────

    #[test]
    fn tests_for_health_result_full_response() {
        let json = r##"{
            "getTests": {
                "results": [
                    {
                        "issueId": "h-1",
                        "status": {"name": "PASS", "color": "#00FF00", "final": true},
                        "testRuns": {
                            "results": [
                                {"finishedOn": "2024-03-01T10:00:00.000+0000", "status": {"name": "PASS"}}
                            ]
                        }
                    },
                    {
                        "issueId": "h-2",
                        "status": {"name": "TODO", "color": "#888"},
                        "testRuns": {"results": []}
                    },
                    {
                        "issueId": "h-3",
                        "status": null,
                        "testRuns": null
                    }
                ]
            }
        }"##;
        let result: TestsForHealthResult = serde_json::from_str(json).unwrap();
        assert_eq!(result.get_tests.results.len(), 3);

        let h1 = &result.get_tests.results[0];
        assert_eq!(h1.issue_id, "h-1");
        assert_eq!(h1.latest_status.as_ref().unwrap().name, "PASS");
        assert_eq!(h1.latest_status.as_ref().unwrap().is_final, Some(true));
        assert_eq!(h1.test_runs.as_ref().unwrap().results.len(), 1);
        assert!(h1.test_runs.as_ref().unwrap().results[0].finished_on.is_some());

        let h2 = &result.get_tests.results[1];
        assert!(h2.test_runs.as_ref().unwrap().results.is_empty());

        let h3 = &result.get_tests.results[2];
        assert!(h3.latest_status.is_none());
        assert!(h3.test_runs.is_none());
    }

    #[test]
    fn test_runs_for_health_result_response() {
        let json = r#"{
            "getTestRuns": {
                "total": 2,
                "results": [
                    {
                        "finishedOn": "2024-06-01T12:00:00.000+0000",
                        "startedOn": "2024-06-01T11:00:00.000+0000",
                        "status": {"name": "PASS"},
                        "test": {"issueId": "t-health-1"}
                    },
                    {
                        "finishedOn": null,
                        "startedOn": null,
                        "status": null,
                        "test": {"issueId": "t-health-2"}
                    }
                ]
            }
        }"#;
        let result: TestRunsForHealthResult = serde_json::from_str(json).unwrap();
        assert_eq!(result.get_test_runs.total, 2);
        let r0 = &result.get_test_runs.results[0];
        assert!(r0.finished_on.is_some());
        assert!(r0.started_on.is_some());
        assert_eq!(r0.status.as_ref().unwrap().name, "PASS");
        assert_eq!(r0.test.issue_id, "t-health-1");

        let r1 = &result.get_test_runs.results[1];
        assert!(r1.finished_on.is_none());
        assert!(r1.started_on.is_none());
        assert!(r1.status.is_none());
    }

    // ── Statuses responses ───────────────────────────────────────────────────

    #[test]
    fn statuses_result_full_response() {
        let json = r##"{
            "getStatuses": [
                {"name": "PASS", "description": "Passed", "final": true, "color": "#00FF00"},
                {"name": "FAIL", "description": "Failed", "final": true, "color": "#FF0000"},
                {"name": "TODO", "description": "Not started", "final": false, "color": "#888888"},
                {"name": "EXECUTING", "description": null, "final": false, "color": null}
            ]
        }"##;
        let result: StatusesResult = serde_json::from_str(json).unwrap();
        assert_eq!(result.statuses.len(), 4);
        assert_eq!(result.statuses[0].name, "PASS");
        assert_eq!(result.statuses[0].is_final, Some(true));
        assert_eq!(result.statuses[3].description.as_deref(), None);
        assert_eq!(result.statuses[3].color.as_deref(), None);
    }

    #[test]
    fn step_statuses_result_response() {
        let json = r##"{
            "getStepStatuses": [
                {"name": "PASS", "description": "Step passed", "color": "#0f0"},
                {"name": "FAIL", "description": null, "color": null}
            ]
        }"##;
        let result: StepStatusesResult = serde_json::from_str(json).unwrap();
        assert_eq!(result.step_statuses.len(), 2);
        assert_eq!(result.step_statuses[0].name, "PASS");
        assert!(result.step_statuses[1].description.is_none());
    }

    // ── Test run stats (lightweight projections) ─────────────────────────────

    #[test]
    fn test_run_stats_result_response() {
        let json = r##"{
            "getTestRuns": {
                "total": 2,
                "start": 0,
                "limit": 100,
                "results": [
                    {
                        "status": {"name": "PASS"},
                        "test": {"issueId": "t-stat-1", "jira": "{\"key\":\"T-1\",\"summary\":\"A\"}"}
                    },
                    {
                        "status": {"name": "FAIL", "color": "#f00", "final": true},
                        "test": {"issueId": "t-stat-2", "jira": "{\"key\":\"T-2\",\"summary\":\"B\"}"}
                    }
                ]
            }
        }"##;
        let result: TestRunStatsResult = serde_json::from_str(json).unwrap();
        assert_eq!(result.test_runs.total, 2);
        assert_eq!(result.test_runs.results[0].status.name, "PASS");
        assert_eq!(result.test_runs.results[1].test.jira.key, "T-2");
    }

    #[test]
    fn test_run_statuses_result_response() {
        let json = r#"{
            "getTestRuns": {
                "total": 3,
                "start": 0,
                "limit": 100,
                "results": [
                    {"status": {"name": "PASS"}},
                    {"status": {"name": "FAIL"}},
                    {"status": {"name": "TODO"}}
                ]
            }
        }"#;
        let result: TestRunStatusesResult = serde_json::from_str(json).unwrap();
        assert_eq!(result.test_runs.total, 3);
        assert_eq!(result.test_runs.results.len(), 3);
    }

    // ── Create mutation responses ────────────────────────────────────────────

    #[test]
    fn create_test_response_full() {
        let json = r#"{
            "createTest": {
                "test": {
                    "issueId": "new-t-1",
                    "jira": "{\"key\":\"PROJ-500\",\"summary\":\"New test\"}",
                    "steps": [
                        {"id": "s1", "action": "Do something", "data": null, "result": "OK"}
                    ]
                },
                "warnings": null
            }
        }"#;
        let result: CreateTestResponse = serde_json::from_str(json).unwrap();
        let test = result.create_test.test.as_ref().unwrap();
        assert_eq!(test.issue_id, "new-t-1");
        assert_eq!(test.jira.key, "PROJ-500");
        assert_eq!(test.steps.as_ref().unwrap().len(), 1);
        assert!(result.create_test.warnings.is_none());
    }

    #[test]
    fn create_test_response_with_warnings() {
        let json = r#"{
            "createTest": {
                "test": {
                    "issueId": "new-t-2",
                    "jira": "{\"key\":\"PROJ-501\",\"summary\":\"Warn test\"}",
                    "steps": null
                },
                "warnings": ["Component not found", "Label ignored"]
            }
        }"#;
        let result: CreateTestResponse = serde_json::from_str(json).unwrap();
        assert!(result.create_test.test.is_some());
        let warnings = result.create_test.warnings.as_ref().unwrap();
        assert_eq!(warnings.len(), 2);
    }

    #[test]
    fn create_test_execution_response() {
        let json = r#"{
            "createTestExecution": {
                "testExecution": {
                    "issueId": "new-exec-1",
                    "jira": "{\"key\":\"PROJ-600\",\"summary\":\"New exec\"}"
                }
            }
        }"#;
        let result: CreateTestExecutionResponse = serde_json::from_str(json).unwrap();
        assert_eq!(
            result.create_test_execution.test_execution.issue_id,
            "new-exec-1"
        );
        assert_eq!(result.create_test_execution.test_execution.jira.key, "PROJ-600");
    }

    #[test]
    fn create_test_set_response() {
        let json = r#"{
            "createTestSet": {
                "testSet": {
                    "issueId": "new-ts-1",
                    "jira": "{\"key\":\"TS-50\",\"summary\":\"New set\",\"status\":{\"name\":\"Open\"}}"
                },
                "warnings": null
            }
        }"#;
        let result: CreateTestSetResponse = serde_json::from_str(json).unwrap();
        let ts = result.create_test_set.test_set.as_ref().unwrap();
        assert_eq!(ts.issue_id, "new-ts-1");
        assert_eq!(ts.jira.key, "TS-50");
    }

    #[test]
    fn create_test_plan_response() {
        let json = r#"{
            "createTestPlan": {
                "testPlan": {
                    "issueId": "new-tp-1",
                    "jira": "{\"key\":\"TP-50\",\"summary\":\"New plan\",\"issuetype\":{\"name\":\"Test Plan\"}}"
                },
                "warnings": null
            }
        }"#;
        let result: CreateTestPlanResponse = serde_json::from_str(json).unwrap();
        let tp = result.create_test_plan.test_plan.as_ref().unwrap();
        assert_eq!(tp.issue_id, "new-tp-1");
        assert_eq!(tp.jira.key, "TP-50");
    }

    // ── Update test run responses ────────────────────────────────────────────

    #[test]
    fn update_test_run_result_with_warnings() {
        let json = r#"{
            "updateTestRun": {
                "warnings": ["status transition not allowed"]
            }
        }"#;
        let result: UpdateTestRunResult = serde_json::from_str(json).unwrap();
        let warnings = result.update_test_run.warnings.as_ref().unwrap();
        assert_eq!(warnings.len(), 1);
    }

    #[test]
    fn update_test_run_result_no_warnings() {
        let json = r#"{"updateTestRun": {"warnings": null}}"#;
        let result: UpdateTestRunResult = serde_json::from_str(json).unwrap();
        assert!(result.update_test_run.warnings.is_none());
    }

    // ── Coverage: test set with status response ──────────────────────────────

    #[test]
    fn test_set_with_status_result_response() {
        let json = r##"{
            "getTestSet": {
                "issueId": "ts-cov",
                "tests": {
                    "results": [
                        {
                            "issueId": "t-cov-1",
                            "jira": "{\"key\":\"T-C1\",\"summary\":\"Coverage test\"}",
                            "status": {"name": "PASS", "color": "#0f0", "final": true}
                        },
                        {
                            "issueId": "t-cov-2",
                            "jira": "{\"key\":\"T-C2\",\"summary\":\"Never run\"}",
                            "status": null
                        }
                    ]
                }
            }
        }"##;
        let result: TestSetWithStatusResult = serde_json::from_str(json).unwrap();
        assert_eq!(result.get_test_set.issue_id, "ts-cov");
        let tests = &result.get_test_set.tests.results;
        assert_eq!(tests.len(), 2);
        assert_eq!(tests[0].latest_status.as_ref().unwrap().name, "PASS");
        assert!(tests[1].latest_status.is_none(), "null status = never run");
    }

    // ── GraphQL wrapper response (simulating full API response) ──────────────

    #[test]
    fn graphql_response_with_data() {
        let json = r#"{
            "data": {"getStatuses": [{"name": "PASS", "final": true}]},
            "errors": null
        }"#;
        let resp: GraphQLResponse<StatusesResult> = serde_json::from_str(json).unwrap();
        assert!(resp.data.is_some());
        assert!(resp.errors.is_none());
        assert_eq!(resp.data.unwrap().statuses[0].name, "PASS");
    }

    #[test]
    fn graphql_response_with_errors() {
        let json = r#"{
            "data": null,
            "errors": [
                {"message": "Field 'getTests' not found"},
                {"message": "Authentication failed"}
            ]
        }"#;
        let resp: GraphQLResponse<TestsResult> = serde_json::from_str(json).unwrap();
        assert!(resp.data.is_none());
        let errors = resp.errors.as_ref().unwrap();
        assert_eq!(errors.len(), 2);
        assert_eq!(errors[0].message, "Field 'getTests' not found");
    }

    #[test]
    fn graphql_response_missing_errors_field() {
        let json = r#"{"data": {"getStatuses": []}}"#;
        let resp: GraphQLResponse<StatusesResult> = serde_json::from_str(json).unwrap();
        assert!(resp.errors.is_none());
        assert!(resp.data.unwrap().statuses.is_empty());
    }

    // ── deserialize_null_default edge cases ──────────────────────────────────

    #[test]
    fn test_run_step_with_null_evidence() {
        let json = r#"{
            "id": "step-null-ev",
            "status": {"name": "PASS"},
            "action": "click",
            "evidence": null
        }"#;
        let step: TestRunStep = serde_json::from_str(json).unwrap();
        assert!(step.evidence.is_empty());
    }

    #[test]
    fn test_run_step_with_missing_evidence() {
        let json = r#"{"id": "step-no-ev", "action": "click"}"#;
        let step: TestRunStep = serde_json::from_str(json).unwrap();
        assert!(step.evidence.is_empty());
    }

    #[test]
    fn test_run_step_with_populated_evidence() {
        let json = r#"{
            "id": "step-ev",
            "evidence": [
                {"id": "e1", "filename": "shot.png", "storedInJira": true, "size": 1024}
            ]
        }"#;
        let step: TestRunStep = serde_json::from_str(json).unwrap();
        assert_eq!(step.evidence.len(), 1);
        assert_eq!(step.evidence[0].stored_in_jira, Some(true));
        assert_eq!(step.evidence[0].size, Some(1024));
    }

    // ── jira JSON string with special characters ─────────────────────────────

    #[test]
    fn jira_json_string_with_unicode_and_escapes() {
        let json = r#"{
            "issueId": "unicode-1",
            "testType": null,
            "jira": "{\"key\":\"PROJ-1\",\"summary\":\"Test with \\\"quotes\\\" and accénts\",\"assignee\":{\"accountId\":\"a1\",\"displayName\":\"José García\"}}"
        }"#;
        let test: XrayTest = serde_json::from_str(json).unwrap();
        assert!(test.jira.summary.contains("quotes"));
        assert!(test.jira.summary.contains("accénts"));
        assert_eq!(
            test.jira.assignee.as_ref().unwrap().display_name.as_deref(),
            Some("José García")
        );
    }

    // ── FirstPageResult / TestsStreamPage ────────────────────────────────────

    #[test]
    fn first_page_result_for_tests() {
        let json = r#"{
            "results": [
                {
                    "issueId": "fp-1",
                    "testType": {"name": "Manual"},
                    "jira": "{\"key\":\"FP-1\",\"summary\":\"First page test\"}"
                }
            ],
            "total": 50,
            "done": false
        }"#;
        let result: FirstPageResult<XrayTest> = serde_json::from_str(json).unwrap();
        assert_eq!(result.total, 50);
        assert!(!result.done);
        assert_eq!(result.results.len(), 1);
    }

    #[test]
    fn tests_stream_page_event() {
        let json = r#"{
            "project_key": "PROJ",
            "tests": [
                {
                    "issueId": "sp-1",
                    "testType": null,
                    "jira": "{\"key\":\"SP-1\",\"summary\":\"Streamed\"}"
                }
            ],
            "done": true
        }"#;
        let page: TestsStreamPage = serde_json::from_str(json).unwrap();
        assert_eq!(page.project_key, "PROJ");
        assert!(page.done);
        assert_eq!(page.tests.len(), 1);
    }

    // ── Test export data ─────────────────────────────────────────────────────

    #[test]
    fn tests_export_result_with_steps_and_gherkin() {
        let json = r#"{
            "getTests": {
                "results": [
                    {
                        "issueId": "exp-1",
                        "steps": [
                            {"id": "s1", "action": "Do X", "data": "input", "result": "output"}
                        ],
                        "gherkin": null,
                        "unstructured": null
                    },
                    {
                        "issueId": "exp-2",
                        "steps": null,
                        "gherkin": "Feature: Export",
                        "unstructured": null
                    }
                ]
            }
        }"#;
        let result: TestsExportResult = serde_json::from_str(json).unwrap();
        assert_eq!(result.get_tests.results.len(), 2);
        assert!(result.get_tests.results[0].steps.is_some());
        assert!(result.get_tests.results[0].gherkin.is_none());
        assert!(result.get_tests.results[1].steps.is_none());
        assert!(result.get_tests.results[1].gherkin.is_some());
    }

    // ── Health batch event payload ───────────────────────────────────────────

    #[test]
    fn health_batch_event_payload() {
        let json = r#"{
            "entries": [
                {
                    "test_issue_id": "hb-1",
                    "finished_on": "2024-06-01T00:00:00.000+0000",
                    "started_on": null,
                    "status": {"name": "PASS"}
                }
            ],
            "done": false,
            "total": 100,
            "processed": 25
        }"#;
        let batch: HealthBatch = serde_json::from_str(json).unwrap();
        assert!(!batch.done);
        assert_eq!(batch.total, 100);
        assert_eq!(batch.processed, 25);
        assert_eq!(batch.entries.len(), 1);
        assert_eq!(batch.entries[0].test_issue_id, "hb-1");
    }

    #[test]
    fn health_batch_done_with_empty_entries() {
        let json = r#"{"entries": [], "done": true, "total": 0, "processed": 0}"#;
        let batch: HealthBatch = serde_json::from_str(json).unwrap();
        assert!(batch.done);
        assert!(batch.entries.is_empty());
    }

    // ── TestRunIterationsResponse (getTestRun single-run) ────────────────────

    #[test]
    fn get_test_run_result_with_iterations() {
        let json = r#"{
            "getTestRun": {
                "iterations": {
                    "total": 1,
                    "start": 0,
                    "limit": 50,
                    "results": [
                        {
                            "rank": "1",
                            "parameters": [],
                            "status": {"name": "PASS"},
                            "stepResults": {"results": []}
                        }
                    ]
                }
            }
        }"#;
        let result: GetTestRunResult = serde_json::from_str(json).unwrap();
        let iters = result.get_test_run.as_ref().unwrap().iterations.as_ref().unwrap();
        assert_eq!(iters.results.len(), 1);
    }

    #[test]
    fn get_test_run_result_null() {
        let json = r#"{"getTestRun": null}"#;
        let result: GetTestRunResult = serde_json::from_str(json).unwrap();
        assert!(result.get_test_run.is_none());
    }

    // ── TestSetMembershipsResponse ───────────────────────────────────────────

    #[test]
    fn test_set_memberships_response() {
        let json = r#"{
            "memberships": {
                "t-1": [{"issue_id": "ts-1", "key": "TS-1", "summary": "Set A"}],
                "t-2": []
            },
            "test_sets": [
                {
                    "issueId": "ts-1",
                    "jira": "{\"key\":\"TS-1\",\"summary\":\"Set A\"}"
                }
            ]
        }"#;
        let resp: TestSetMembershipsResponse = serde_json::from_str(json).unwrap();
        assert_eq!(resp.memberships.len(), 2);
        assert_eq!(resp.memberships["t-1"].len(), 1);
        assert!(resp.memberships["t-2"].is_empty());
        assert_eq!(resp.test_sets.len(), 1);
    }

    // ── TestSetsWithMembersResult (inline membership query) ──────────────────

    #[test]
    fn test_sets_with_members_deserializes() {
        let json = r#"{
            "getTestSets": {
                "total": 2,
                "start": 0,
                "limit": 100,
                "results": [
                    {
                        "issueId": "ts-100",
                        "jira": "{\"key\":\"PROJ-10\",\"summary\":\"Login Tests\"}",
                        "tests": {
                            "total": 3,
                            "results": [
                                { "issueId": "t-1" },
                                { "issueId": "t-2" },
                                { "issueId": "t-3" }
                            ]
                        }
                    },
                    {
                        "issueId": "ts-200",
                        "jira": "{\"key\":\"PROJ-20\",\"summary\":\"Payment Tests\"}",
                        "tests": {
                            "total": 2,
                            "results": [
                                { "issueId": "t-2" },
                                { "issueId": "t-4" }
                            ]
                        }
                    }
                ]
            }
        }"#;
        let result: TestSetsWithMembersResult = serde_json::from_str(json).unwrap();
        let page = result.get_test_sets;
        assert_eq!(page.total, 2);
        assert_eq!(page.results.len(), 2);

        let first = &page.results[0];
        assert_eq!(first.issue_id, "ts-100");
        assert_eq!(first.jira.key, "PROJ-10");
        assert_eq!(first.jira.summary, "Login Tests");
        assert_eq!(first.tests.results.len(), 3);
        assert_eq!(first.tests.results[0].issue_id, "t-1");

        let second = &page.results[1];
        assert_eq!(second.issue_id, "ts-200");
        assert_eq!(second.tests.results.len(), 2);
    }

    #[test]
    fn test_sets_with_members_empty_tests() {
        let json = r#"{
            "getTestSets": {
                "total": 1,
                "start": 0,
                "limit": 100,
                "results": [
                    {
                        "issueId": "ts-300",
                        "jira": "{\"key\":\"PROJ-30\",\"summary\":\"Empty Set\"}",
                        "tests": {
                            "results": []
                        }
                    }
                ]
            }
        }"#;
        let result: TestSetsWithMembersResult = serde_json::from_str(json).unwrap();
        assert_eq!(result.get_test_sets.results[0].tests.results.len(), 0);
    }
}

