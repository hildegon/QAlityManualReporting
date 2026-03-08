mod api;
mod commands;
mod models;
mod state;

use commands::{
    config::{clear_config, get_config, save_config_cmd},
    jira::{
        get_bugs_by_version, get_issue_transitions, get_jira_projects, get_project_components,
        get_project_versions, search_users, transition_issue, update_assignee,
        update_issue_summary, validate_jira_credentials,
    },
    xray::{
        add_tests_to_test_plan, add_tests_to_test_set, authenticate_xray, create_test,
        create_test_execution, create_test_plan, create_test_set, get_all_test_set_memberships,
        get_step_statuses, get_test_executions, get_test_executions_by_version,
        get_test_plan_tests, get_test_plans, get_test_runs, get_test_set_tests,
        get_test_set_tests_with_status, get_test_sets, get_tests, get_xray_statuses,
        remove_tests_from_test_plan, remove_tests_from_test_set, update_test_run_comment,
        update_test_run_status, update_test_run_step, update_test_run_step_status,
    },
};
use state::XrayClientState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(XrayClientState::new())
        .invoke_handler(tauri::generate_handler![
            // Config
            get_config,
            save_config_cmd,
            clear_config,
            // Jira
            get_jira_projects,
            validate_jira_credentials,
            get_project_components,
            get_project_versions,
            get_bugs_by_version,
            get_issue_transitions,
            transition_issue,
            update_assignee,
            update_issue_summary,
            search_users,
            // Xray
            authenticate_xray,
            get_test_plans,
            get_test_executions,
            get_test_executions_by_version,
            get_test_runs,
            update_test_run_status,
            update_test_run_comment,
            get_xray_statuses,
            get_step_statuses,
            update_test_run_step_status,
            update_test_run_step,
            create_test_execution,
            get_tests,
            get_test_sets,
            get_test_set_tests,
            get_test_set_tests_with_status,
            get_all_test_set_memberships,
            get_test_plan_tests,
            create_test,
            add_tests_to_test_set,
            remove_tests_from_test_set,
            create_test_set,
            create_test_plan,
            add_tests_to_test_plan,
            remove_tests_from_test_plan,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
