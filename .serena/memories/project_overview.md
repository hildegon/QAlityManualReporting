# QAlity Manual Reporting — Project Overview

## Purpose
Cross-platform desktop app for reading Jira/Xray Cloud test data, marking test runs, and writing results back to Xray — without a web server.

## Tech Stack
- **Desktop shell:** Tauri 2 (Rust backend + OS native WebView)
- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS v4
- **UI primitives:** Radix UI + custom shadcn-style components
- **State:** Zustand (UI/project state) + TanStack Query v5 (server state, caching)
- **Performance:** TanStack Virtual (virtualised lists), optimistic mutations
- **Backend (Rust):** reqwest (HTTP), AES-256-GCM (credential encryption), Tokio (async)
- **Package manager:** npm

## Architecture
All API calls go through Rust backend:
`UI component → TanStack Query hook (queries.ts) → tauri.ts invoke() → Rust command → HTTP`

Never import `fetch` or call Jira/Xray URLs directly from TypeScript.

## Key Patterns
- Xray Cloud uses OAuth2 Client Credentials flow
- Jira Cloud uses email + API token (Basic auth)
- Credentials encrypted with AES-256-GCM at OS app-config directory
- Optimistic mutations for test run status updates
- Virtualised lists for large data tables

## Implemented Features (cumulative)

### Test Execution
- View test executions per project/version
- Mark test run status (optimistic UI update with rollback)
- Update test run step status
- Update test run comment

### Test Sets
- Browse test sets by project
- Drag-and-drop tests onto test sets to add them (`addTestsToTestSet`)
- Remove individual tests from a test set via hover-reveal Trash2 button (`removeTestsFromTestSet`)
- Batch membership query (`get_all_test_set_memberships`) to avoid N+1 API calls
- Create new test sets

### Test Plans
- Browse test plans by project
- Drag-and-drop tests onto test plans to add them (`addTestsToTestPlan`)
- Remove individual tests from a test plan via hover-reveal Trash2 button (`removeTestsFromTestPlan`)
- Create new test plans

### Tests
- Browse and search tests by project
- Create new tests

### Settings
- Save/load Jira + Xray credentials (AES-256-GCM encrypted)
- Validate credentials against live API

## Tauri Commands (Rust → TypeScript)

| Command | Description |
|---|---|
| `get_config` / `save_config` / `clear_config` | Credential storage |
| `validate_jira_credentials` | Test Jira auth |
| `authenticate_xray` | Test Xray OAuth2 |
| `get_jira_projects` | List projects |
| `get_project_versions` / `get_project_components` | Project metadata |
| `get_tests` / `create_test` | Tests CRUD |
| `get_test_executions` / `get_test_executions_by_version` | Test executions |
| `get_test_runs` | Test runs within an execution |
| `update_test_run_status` / `update_test_run_comment` | Update test run |
| `update_test_run_step_status` / `update_test_run_step` | Update step |
| `get_step_statuses` / `get_xray_statuses` | Status enums |
| `get_test_sets` / `create_test_set` | Test sets CRUD |
| `get_test_set_tests` / `get_test_set_tests_with_status` | Test set members |
| `get_all_test_set_memberships` | Batch membership query |
| `add_tests_to_test_set` / `remove_tests_from_test_set` | Test set membership mutations |
| `get_test_plans` / `create_test_plan` | Test plans CRUD |
| `get_test_plan_tests` | Test plan members |
| `add_tests_to_test_plan` / `remove_tests_from_test_plan` | Test plan membership mutations |
| `get_bugs_by_version` | Jira bugs |
| `search_users` / `update_assignee` | User management |
| `get_issue_transitions` / `transition_issue` / `update_issue_summary` | Jira issue ops |
