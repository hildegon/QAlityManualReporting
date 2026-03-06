mod api;
mod commands;
mod models;

use commands::{
    config::{clear_config, get_config, save_config_cmd},
    jira::{get_jira_projects, validate_jira_credentials},
    xray::{
        authenticate_xray, create_test_execution, get_step_statuses, get_test_executions,
        get_test_plans, get_test_runs, get_xray_statuses, update_test_run_comment,
        update_test_run_status, update_test_run_step_status,
    },
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            // Config
            get_config,
            save_config_cmd,
            clear_config,
            // Jira
            get_jira_projects,
            validate_jira_credentials,
            // Xray
            authenticate_xray,
            get_test_plans,
            get_test_executions,
            get_test_runs,
            update_test_run_status,
            update_test_run_comment,
            get_xray_statuses,
            get_step_statuses,
            update_test_run_step_status,
            create_test_execution,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
