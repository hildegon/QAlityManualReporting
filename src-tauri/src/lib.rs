mod api;
mod commands;
mod models;
mod state;

use commands::{
    config::{clear_config, get_config, save_config_cmd},
    confluence::{
        create_confluence_page, fetch_confluence_attachment, get_confluence_page,
        list_confluence_attachments, list_confluence_children, list_confluence_pages,
        list_confluence_spaces, update_confluence_page, upload_confluence_attachment,
    },
    jira::{
        add_attachment, add_jira_comment, create_bug, create_issue_link, create_version,
        create_version_related_work, delete_version_related_work,
        get_bugs_by_version,
        fetch_attachment_to_temp, get_issue_detail, get_issue_link_types, get_issue_transitions,
        get_jira_projects,
        get_project_components, get_project_versions, get_user_display_name, get_version_issues,
        get_version_property, get_version_related_work, set_version_property,
        delete_version_property,
        search_users,
        transition_issue, update_assignee, update_issue_fix_version, update_issue_summary,
        update_version, validate_jira_credentials,
    },
    usage::get_api_usage,
    utils::write_text_file,
    xray::{
        add_defects_to_test_run, add_tests_to_test_execution, add_tests_to_test_plan,
        fetch_xray_evidence,
        add_tests_to_test_set, authenticate_xray, create_test, create_test_execution,
        create_test_plan, create_test_set, get_all_test_set_memberships,
        get_iteration_step_results, get_step_statuses, get_test_detail, get_test_executions,
        get_test_executions_by_version, get_test_plan_tests, get_test_plans, get_test_runs,
        get_test_run_stats, get_test_run_statuses, get_test_runs_by_test_id, get_test_set_tests,
        get_test_set_tests_with_status, get_test_sets, get_tests,
        get_tests_export_data, get_tests_health_data, load_health_cache, save_health_cache,
        get_xray_statuses, remove_tests_from_test_plan, remove_tests_from_test_set,
        update_iteration_status, update_test_run_comment, update_test_run_status,
        update_test_run_step, update_test_run_step_status,
        update_test_step, add_test_step, remove_test_step,
    },
};
use state::XrayClientState;
use state::ApiUsageState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(XrayClientState::new())
        .manage(ApiUsageState::new())
        .setup(|app| {
            // Restore persisted all-time API usage counters from disk.
            use tauri::Manager;
            let managed = app.state::<ApiUsageState>();

            // Wire up the app handle so TrackedUsage can emit events.
            managed.set_app_handle(app.handle().clone());

            if let Ok(dir) = app.path().app_config_dir() {
                let path = dir.join("api_usage.json");
                if path.exists() {
                    let fresh = ApiUsageState::load_from_file(&path);
                    // Extract the persisted values before borrowing managed state.
                    let jira_all = fresh.jira.lock().map(|u| (u.calls_all_time, u.rate_limit_hits_all_time)).ok();
                    let xray_all = fresh.xray.lock().map(|u| (u.calls_all_time, u.rate_limit_hits_all_time)).ok();
                    let conf_all = fresh.confluence.lock().map(|u| (u.calls_all_time, u.rate_limit_hits_all_time)).ok();

                    if let Some((calls, hits)) = jira_all {
                        if let Ok(mut u) = managed.jira.lock() {
                            u.calls_all_time = calls;
                            u.rate_limit_hits_all_time = hits;
                        }
                    }
                    if let Some((calls, hits)) = xray_all {
                        if let Ok(mut u) = managed.xray.lock() {
                            u.calls_all_time = calls;
                            u.rate_limit_hits_all_time = hits;
                        }
                    }
                    if let Some((calls, hits)) = conf_all {
                        if let Ok(mut u) = managed.confluence.lock() {
                            u.calls_all_time = calls;
                            u.rate_limit_hits_all_time = hits;
                        }
                    }
                }
            }
            Ok(())
        })
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
            get_version_issues,
            get_issue_link_types,
            create_issue_link,
            get_issue_transitions,
            transition_issue,
            update_assignee,
            update_issue_summary,
            update_issue_fix_version,
            search_users,
            get_user_display_name,
            create_bug,
            create_version,
            update_version,
            get_version_property,
            set_version_property,
            delete_version_property,
            get_version_related_work,
            create_version_related_work,
            delete_version_related_work,
            add_attachment,
            add_jira_comment,
            get_issue_detail,
            fetch_attachment_to_temp,
            // Xray
            authenticate_xray,
            get_test_plans,
            get_test_executions,
            get_test_executions_by_version,
            get_test_runs,
            get_test_run_stats,
            get_test_run_statuses,
            get_test_runs_by_test_id,
            get_iteration_step_results,
            update_test_run_status,
            update_test_run_comment,
            update_iteration_status,
            get_xray_statuses,
            get_step_statuses,
            update_test_run_step_status,
            update_test_run_step,
            create_test_execution,
            get_tests,
            get_tests_health_data,
            get_tests_export_data,
            save_health_cache,
            load_health_cache,
            get_test_sets,
            get_test_set_tests,
            get_test_set_tests_with_status,
            get_all_test_set_memberships,
            get_test_plan_tests,
            create_test,
            add_tests_to_test_set,
            add_tests_to_test_execution,
            remove_tests_from_test_set,
            create_test_set,
            create_test_plan,
            add_tests_to_test_plan,
            remove_tests_from_test_plan,
            add_defects_to_test_run,
            fetch_xray_evidence,
            get_test_detail,
            update_test_step,
            add_test_step,
            remove_test_step,
            // Confluence
            list_confluence_spaces,
            list_confluence_pages,
            list_confluence_children,
            get_confluence_page,
            create_confluence_page,
            update_confluence_page,
            upload_confluence_attachment,
            list_confluence_attachments,
            fetch_confluence_attachment,
            // Utils
            write_text_file,
            // Usage
            get_api_usage,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
