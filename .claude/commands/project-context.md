Output a structured summary of the QAlity Manual Reporting project for the current session. Include:

## 1. File Size Inventory

Run `wc -l src/pages/*.tsx src/services/queries/*.ts src/types/index.ts` and list the results so I know which files are large.

Also list the xray-mutations submodules:
```
wc -l src/services/queries/xray-mutations/*.ts
```

Also run the following for the Rust side (modules are now split into subdirectories):
```
find src-tauri/src -name "*.rs" | xargs wc -l | sort -rn | head -30
```

## 2. Data Flow Diagram

```
User Action
  │
  ▼
React Component (src/pages/*.tsx or src/components/**/*.tsx)
  │  calls hook
  ▼
TanStack Query hook (src/services/queries/)
  │  calls wrapper
  ▼
Tauri invoke wrapper (src/services/tauri.ts)
  │  IPC call
  ▼
Rust command handler (src-tauri/src/commands/xray/<submodule>.rs or jira.rs)
  │  calls client method
  ▼
API client (src-tauri/src/api/xray_client/<submodule>.rs or jira_client/<submodule>.rs)
  │  HTTP
  ▼
Jira REST API v3 / Xray Cloud GraphQL
```

## 3. Queries Layer Structure (TypeScript)

`src/services/queries/` is a barrel-export directory. Key submodules:

```
src/services/queries/
  index.ts           — barrel re-export of everything below
  queryKeys.ts       — all TanStack Query cache keys
  config.ts          — query client configuration
  jira.ts            — Jira query hooks
  xray-queries.ts    — Xray query hooks (tests, test sets, executions, plans, etc.)
  version-stats.ts   — version statistics hooks
  xray-mutations/    — Xray mutation hooks (split by domain)
    index.ts         — barrel re-export
    helpers.ts       — shared helpers (TestRunsInfiniteData, mapRunsAcrossPages, debounced invalidators)
    test-runs.ts     — useUpdateTestRunStatus, useUpdateTestRunComment, useUpdateTestRunStepStatus, useUpdateTestRunStep, useUpdateIterationStatus, useAddDefectsToTestRun
    executions.ts    — useCreateTestExecution, useAddTestsToTestExecution
    test-sets.ts     — useCreateTestSet, useAddTestsToTestSet, useRemoveTestsFromTestSet
    test-plans.ts    — useCreateTestPlan, useAddTestsToTestPlan, useRemoveTestsFromTestPlan
    tests.ts         — useCreateTest, useUpdateTestStep, useAddTestStep, useRemoveTestStep
```

## 4. Module Structure (Rust)

The Rust side is now fully modularized. Describe the layout:

```
src-tauri/src/
  commands/
    xray/
      mod.rs          — re-exports all xray command submodules
      executions.rs   — test execution commands
      health.rs       — test health commands
      plans.rs        — test plan commands
      runs.rs         — test run commands
      sets.rs         — test set commands
      statuses.rs     — status commands
      tests.rs        — test CRUD commands
    jira.rs           — all Jira command handlers (single file, ~457 lines)
    config.rs         — credential/config commands
    utils.rs          — utility commands
    mod.rs
  api/
    xray_client/
      mod.rs          — XrayClient struct + post_graphql helper
      executions.rs   — execution queries/mutations
      health.rs       — health batch queries
      mutations.rs    — create/update/add/remove mutations
      runs.rs         — test run queries/mutations
      sets.rs         — test set queries
      statuses.rs     — status/step-status queries
      test_plans.rs   — test plan queries
      tests.rs        — test queries
    jira_client/
      mod.rs          — JiraClient struct
      attachments.rs  — attachment upload/download
      auth.rs         — auth/credential validation
      issues.rs       — issue search/update
      links.rs        — issue link management
      projects.rs     — project/component queries
      transitions.rs  — issue transitions
      versions.rs     — fix version queries
    common.rs         — shared HTTP helpers
    mod.rs
  models/
    xray/
      mod.rs          — declares submodules, pub use * re-exports, deserialize_jira_json
      shared.rs       — GraphQL request/response wrappers, XrayStatus, XrayUser, TestType, StepStatus, etc.
      test.rs         — XrayTest, export structs, create-test structs, TestWithStatus structs
      test_execution.rs — TestExecution, FixVersion, CreateTestExecution structs
      test_health.rs  — TestForHealth, HealthBatch, TestLastRunEntry structs
      test_plan.rs    — TestPlan, CreateTestPlan, AddTests structs
      test_run.rs     — TestRun, steps, iterations, Cucumber results, update inputs
      test_set.rs     — XrayTestSet, membership structs, CreateTestSet structs
    jira.rs           — all Jira model structs (~309 lines)
    config.rs         — credential/config structs
    mod.rs
  lib.rs              — invoke_handler! registration
  state.rs            — AppState
```

## 5. Frontend Component Structure

Pages are thin shells; logic lives in focused component subdirectories:

```
src/
  pages/
    TestExecutionsPage.tsx   — shell (~388 lines); renders ExecRow + 3 dialogs
    TestPlansPage.tsx        — shell (~229 lines); drag-and-drop orchestration
    CreateTestPage.tsx       — shell (~80 lines); tab nav + shared queries
    TestsPage.tsx            — tests browser (~430 lines)
    CoveragePage.tsx         — coverage dashboard (~549 lines)
    VersionsPage.tsx         — versions dashboard (~486 lines)
    SettingsPage.tsx         — settings (~283 lines)
  components/
    test-executions/         — ExecRow, CreateExecutionDialog, CloneExecutionDialog, EditExecutionDialog
    test-plans/              — TestPlanDropTarget, TestPlansDropPanel, TestSetsSourcePanel, TestSetSourceRow, TestPlanDragGhost, CreatePlanDialog
    create-test/             — types.ts, StepRow, TestSetSelect, TestSetRow, ComponentRow, CopyKeyButton, ManualTestCreationForm, BulkTestCreationPanel, UpdateManualTestPanel
    test-execution/          — TestExecutionDetail (single-execution detail view, ~2621 lines — largest file)
    tests/                   — TestHealthPanel, TestSetsHealthPanel, TestsPanel, TestSetDropTarget, CreateTestSetDialog
    versions/                — VersionIssuesPanel, ManageVersionsTab, BugsPanel, FailedTestsAnalysis, IssueDetailModal, TestDetailModal, VersionContent, VersionGroups
    coverage/                — TestSetSection, AnalysisPanels, PresetsBar, OverallDashboard
    bugs/                    — CreateBugModal
    common/                  — AppShell, RateLimitBanner, GlobalToastList
    charts/                  — StatusCharts, MiniStackedBar
```

## 6. Query Key Namespace

Read the `queryKeys` object from `src/services/queries/queryKeys.ts` and list all keys grouped by domain (jira vs xray).

## 7. Store Inventory

List all Zustand stores in `src/stores/` with their responsibilities:
- `projectStore.ts` — active project keys (executionProjectKey, contentProjectKey)
- `uiStore.ts` — toast, rate limit, reload state, confirmedLoadProjects (shared load-confirmation across views)
- `healthStore.ts` — test health data cache
- `versionsStore.ts` — version favourites, health dots, version groups
- `coverageHistoryStore.ts` — historical coverage snapshots
- `coveragePresetsStore.ts` — saved coverage preset configurations

## 8. Current Modified Files

Run `git status` to show what's currently changed.

## 9. Recent Commits

Run `git log --oneline -10` to show recent commit history for context.
