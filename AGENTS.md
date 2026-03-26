# AGENTS.md — Coding Agent Guidelines

This file provides instructions for agentic coding tools (Claude Code, Cursor, Copilot, etc.)
operating in this repository. Keep it up to date as the project evolves.

---

## Project Overview

**Name:** QAlity Manual Reporting
**Purpose:** Cross-platform desktop app for reading Jira/Xray Cloud test data, marking test runs,
and writing results back to Xray — without a web server.

**Stack:**
- **Desktop shell:** Tauri 2 (Rust backend + OS native WebView)
- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS v4
- **UI primitives:** Radix UI + custom shadcn-style components
- **State:** Zustand (UI/project state) + TanStack Query v5 (server state, caching)
- **Performance:** TanStack Virtual (virtualised lists), optimistic mutations
- **Backend (Rust):** reqwest (HTTP), AES-256-GCM (credential encryption), Tokio (async)
- **Package manager:** npm

---

## Repository Structure

```
.
├── src/                            # React + TypeScript frontend
│   ├── App.tsx                     # Router setup, QueryClient, persister, global reload
│   ├── main.tsx                    # React entry point (mounts <App />)
│   ├── index.css                   # Tailwind entry + global resets
│   ├── components/
│   │   ├── ui/                     # Base UI primitives (Button, Badge, Input, …)
│   │   ├── common/                 # Layout: AppShell, ProjectSelector, modals
│   │   ├── test-execution/         # TestExecutionDetail (virtualised test run table)
│   │   ├── tests/                  # TestsPage sub-components (TestRow, TestsPanel, TestSetDropTarget, health panels)
│   │   ├── coverage/               # CoveragePage sub-components (OverallDashboard, TestSetSection, PresetsBar, analysis panels, htmlReportBuilder)
│   │   ├── versions/               # VersionsPage sub-components (VersionCard, BugsPanel, KpiStrip, VersionDashboard, VersionGroups, …)
│   │   ├── charts/                 # StatusCharts (pie/bar used in Coverage page)
│   │   ├── bugs/                   # Bug-related components
│   │   ├── test-plan/              # Test plan components
│   │   └── settings/               # (reserved — SettingsPage lives in pages/)
│   ├── pages/                      # Route-level pages (one file per route)
│   ├── hooks/                      # Custom React hooks
│   ├── stores/                     # Zustand stores
│   ├── services/
│   │   ├── tauri.ts                # ALL typed wrappers around Tauri invoke()
│   │   └── queries/                # ALL TanStack Query hooks + mutations (barrel re-export)
│   │       ├── index.ts            # Barrel — re-exports everything; existing imports unchanged
│   │       ├── queryKeys.ts        # Single queryKeys object + shared constants
│   │       ├── config.ts           # useConfig, useSaveConfig
│   │       ├── jira.ts             # All Jira query/mutation hooks
│   │       ├── xray-queries.ts     # Xray read hooks (useGetTests, useTestRuns, …)
│   │       ├── xray-mutations.ts   # Xray write hooks (useUpdateTestRunStatus, …)
│   │       └── version-stats.ts    # useVersionRunStats (derived/aggregated stats)
│   ├── types/
│   │   └── index.ts                # ALL shared TypeScript interfaces
│   └── test/
│       └── setup.ts                # Vitest global setup (mocks Tauri invoke)
├── src-tauri/                      # Rust / Tauri backend
│   ├── src/
│   │   ├── main.rs                 # Binary entry point (calls lib::run())
│   │   ├── lib.rs                  # Module wiring + Tauri builder + invoke_handler!
│   │   ├── state.rs                # XrayClientState (Arc<Mutex<Option<XrayClient>>>)
│   │   ├── commands/
│   │   │   ├── mod.rs              # pub mod declarations
│   │   │   ├── config.rs           # get_config, save_config, clear_config + AES-256-GCM
│   │   │   ├── jira.rs             # All Jira REST API command handlers
│   │   │   └── xray.rs             # All Xray GraphQL command handlers
│   │   ├── api/
│   │   │   ├── mod.rs
│   │   │   ├── jira_client.rs      # JiraClient struct + all Jira HTTP methods
│   │   │   └── xray_client.rs      # XrayClient struct + all Xray GraphQL methods
│   │   └── models/
│   │       ├── mod.rs
│   │       ├── config.rs           # AppConfig struct
│   │       ├── jira.rs             # Jira serde structs
│   │       └── xray.rs             # Xray serde structs
│   ├── Cargo.toml
│   └── rustfmt.toml
├── vite.config.ts                  # Vite + Tailwind + Vitest config
├── tsconfig.json
├── eslint.config.js
├── .prettierrc
└── AGENTS.md
```

---

## Prerequisites

```bash
# Node.js 18+ and npm required
node --version

# Rust toolchain (required to build; NOT needed by end users)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"

# Install npm dependencies
npm install
```

---

## Build Commands

```bash
# Development (opens the Tauri window with HMR)
npm run dev

# Production build (creates platform installer in src-tauri/target/release/bundle/)
npm run build

# Frontend-only dev server (no Tauri window — useful for UI-only work)
npm run vite:dev

# Frontend-only production build
npm run vite:build
```

---

## Test Commands

```bash
# Run all frontend tests (Vitest)
npm test

# Run a single test file
npm run test:file src/services/queries.test.ts

# Watch mode — re-runs on file save
npm run test:watch

# Coverage report
npm run test:coverage

# Run all Rust unit tests
cd src-tauri && cargo test

# Run a single Rust test by name pattern
cd src-tauri && cargo test <test_name_substring>
```

> Always run the single-test command first to confirm a new test passes before running the full suite.

---

## Lint & Format Commands

```bash
# TypeScript lint
npm run lint

# Auto-fix TS lint issues
npm run lint:fix

# Format TS/TSX/CSS with Prettier
npm run format

# Check formatting without writing
npm run format:check

# TypeScript type check (no emit)
npm run typecheck

# Run all checks (typecheck + lint + format check)
npm run check

# Rust linter — must pass with zero warnings before committing
cd src-tauri && cargo clippy -- -D warnings

# Rust formatter
cd src-tauri && cargo fmt
```

---

## Routing Map

Routes are defined in `src/App.tsx`. The nav bar is in `src/components/common/AppShell.tsx`.

| Route             | Page file                          | Description                                      |
|-------------------|------------------------------------|--------------------------------------------------|
| `/executions`     | `src/pages/TestExecutionsPage.tsx` | Browse/create/clone test executions              |
| `/test-plans`     | `src/pages/TestPlansPage.tsx`      | Browse test plans + drag tests onto plans/sets   |
| `/tests`          | `src/pages/TestsPage.tsx`          | Browse tests + drag onto test sets               |
| `/coverage`       | `src/pages/CoveragePage.tsx`       | Per-test-set coverage dashboard with presets     |
| `/versions`       | `src/pages/VersionsPage.tsx`       | Version dashboard: bugs, issues, executions      |
| `/create-test`    | `src/pages/CreateTestPage.tsx`     | Form to create a new Xray test                   |
| `/settings`       | `src/pages/SettingsPage.tsx`       | Jira + Xray credential management                |

---

## File Inventory — Frontend

### `src/App.tsx`
- `makeQueryClient()` — factory for TanStack QueryClient with retry/stale config
- `queryClient` — singleton QueryClient instance
- `localStoragePersister` — persists query cache to localStorage (throttle: 5 s)
- `App` — root component; sets up `<QueryClientProvider>`, `<PersistQueryClientProvider>`,
  `<BrowserRouter>`, theme load, and global rate-limit/reload handling

### `src/types/index.ts`
Single source of truth for **all** TypeScript interfaces. Key types:

| Interface | Description |
|---|---|
| `AppConfig` | Jira URL/email/token + Xray client ID/secret |
| `XrayTest` | Test issue: `issueId`, `jira.key`, `jira.summary`, `testType` |
| `XrayTestSet` | Test set issue |
| `TestPlan` | Test plan issue |
| `TestExecution` | Test execution issue |
| `TestRun` | A single test run within an execution |
| `TestRunStep` | A manual step in a test run |
| `TestRunIteration` | A dataset-driven iteration |
| `TestRunIterationStepResult` | Step result inside an iteration |
| `XrayTestRunStatus` | Status enum entry (name, color, final) |
| `XrayStepStatus` | Step status enum entry |
| `JiraProject` / `JiraVersion` / `JiraComponent` | Jira metadata |
| `JiraBug` | Bug issue with status, priority, assignee |
| `TestSetMemberInfo` / `TestSetMembershipsResponse` | Batch membership query result |

### `src/services/tauri.ts`
**All** `invoke()` wrappers live here. Never call `invoke` directly from components.
Each export is a `const` arrow function that maps 1:1 to a Rust Tauri command.

| TS export | Rust command | Purpose |
|---|---|---|
| `getConfig` | `get_config` | Load decrypted config |
| `saveConfig` | `save_config` | Encrypt + persist config |
| `clearConfig` | `clear_config` | Delete config file |
| `validateJiraCredentials` | `validate_jira_credentials` | Test Jira auth |
| `authenticateXray` | `authenticate_xray` | Test Xray OAuth2 |
| `getJiraProjects` | `get_jira_projects` | List Jira projects |
| `getProjectVersions` | `get_project_versions` | Project fix versions |
| `getProjectComponents` | `get_project_components` | Project components |
| `getIssueTransitions` | `get_issue_transitions` | Jira workflow transitions |
| `transitionIssue` | `transition_issue` | Apply workflow transition |
| `updateAssignee` | `update_assignee` | Set/clear assignee |
| `searchUsers` | `search_users` | Search Jira users |
| `updateIssueSummary` | `update_issue_summary` | Rename any Jira issue |
| `updateIssueFixVersion` | `update_issue_fix_version` | Set fix version |
| `getIssueLinkTypes` | `get_issue_link_types` | Link type catalog |
| `createIssueLink` | `create_issue_link` | Link bug → test |
| `getBugsByVersion` | `get_bugs_by_version` | Bugs with affectedVersion |
| `getVersionIssues` | `get_version_issues` | Stories/Tasks/Bugs with fixVersion |
| `getTests` | `get_tests` | All tests in project |
| `createTest` | `create_test` | Create Xray test + steps |
| `getTestExecutions` | `get_test_executions` | Executions in project |
| `getTestExecutionsByVersion` | `get_test_executions_by_version` | Executions filtered by version |
| `createTestExecution` | `create_test_execution` | Create execution (optionally link to plan) |
| `addTestsToTestExecution` | `add_tests_to_test_execution` | Add tests to an execution |
| `getTestRuns` | `get_test_runs` | Paginated test runs in execution |
| `getIterationStepResults` | `get_iteration_step_results` | Step results for all iterations |
| `updateTestRunStatus` | `update_test_run_status` | Set overall test run status |
| `updateTestRunComment` | `update_test_run_comment` | Set test run comment |
| `updateTestRunStepStatus` | `update_test_run_step_status` | Set step status |
| `updateTestRunStep` | `update_test_run_step` | Update step comment/actual/status |
| `updateIterationStatus` | `update_iteration_status` | Set iteration status |
| `addDefectsToTestRun` | `add_defects_to_test_run` | Link bugs as Xray defects |
| `getXrayStatuses` | `get_xray_statuses` | Xray test run status enum |
| `getStepStatuses` | `get_step_statuses` | Xray step status enum |
| `getTestSets` | `get_test_sets` | All test sets in project |
| `createTestSet` | `create_test_set` | Create test set |
| `getTestSetTests` | `get_test_set_tests` | Tests in a test set |
| `getTestSetTestsWithStatus` | `get_test_set_tests_with_status` | Tests + latest status |
| `getAllTestSetMemberships` | `get_all_test_set_memberships` | Batch membership map |
| `addTestsToTestSet` | `add_tests_to_test_set` | Add tests to test set |
| `removeTestsFromTestSet` | `remove_tests_from_test_set` | Remove tests from test set |
| `getTestPlans` | `get_test_plans` | All test plans in project |
| `createTestPlan` | `create_test_plan` | Create test plan |
| `getTestPlanTests` | `get_test_plan_tests` | Tests in a test plan |
| `addTestsToTestPlan` | `add_tests_to_test_plan` | Add tests to test plan |
| `removeTestsFromTestPlan` | `remove_tests_from_test_plan` | Remove tests from test plan |

### `src/services/queries/` _(barrel — import from `@/services/queries`)_
TanStack Query hooks and mutations, split by domain. The barrel `index.ts` re-exports
everything, so all existing imports (`from "@/services/queries"`) continue to work.

| Submodule | Contents |
|---|---|
| `queryKeys.ts` | `queryKeys` object, `TEST_RUNS_PAGE_SIZE`, `STATS_PAGE_SIZE` |
| `config.ts` | `useConfig`, `useSaveConfig` |
| `jira.ts` | All Jira hooks: `useJiraProjects`, `useProjectVersions`, `useSearchUsers`, `useBugsByVersion`, `useVersionIssues`, `useIssueTransitions`, mutations (`useTransitionIssue`, `useUpdateAssignee`, `useRenameIssue`, `useLinkBugToTest`, …) |
| `xray-queries.ts` | Xray read hooks: `useGetTests`, `useGetTestSets`, `useTestRuns`, `useTestExecutions`, `useGetTestSetTestsWithStatus`, streaming state helpers (`useIsTestsStreaming`, `useReloadTests`, `useApplyTransition`) |
| `xray-mutations.ts` | Xray write hooks: `useUpdateTestRunStatus` _(optimistic)_, `useUpdateTestRunStep`, `useCreateTestExecution`, `useAddTestsToTestExecution`, `useCreateTestSet`, `useAddTestsToTestSet`, `useRemoveTestsFromTestSet`, `useCreateTestPlan`, `useAddTestsToTestPlan`, `useRemoveTestsFromTestPlan`, etc. |
| `version-stats.ts` | `useVersionRunStats` — windowed multi-phase aggregation of test runs across executions |

**Where to add new hooks:**
- Jira REST hooks → `jira.ts`
- Xray read hooks → `xray-queries.ts`
- Xray write hooks → `xray-mutations.ts`
- New query key → `queryKeys.ts` (add to `queryKeys` object)
- Complex derived/aggregated hooks → `version-stats.ts` or a new domain file

**Query hooks** (all use `queryKeys` from `queryKeys.ts`):

| Hook | Key | Description |
|---|---|---|
| `useConfig` | `config` | Load app credentials |
| `useJiraProjects` | `jiraProjects` | All Jira projects |
| `useProjectVersions(key)` | `projectVersions(key)` | Fix versions |
| `useProjectComponents(key)` | `projectComponents(key)` | Components |
| `useIssueTransitions(key)` | `issueTransitions(key)` | Workflow transitions |
| `useSearchUsers(q)` | `userSearch(q)` | User search |
| `useBugsByVersion(key,ver)` | `bugsByVersion(key,ver)` | Bugs in version |
| `useVersionIssues(key,ver)` | `versionIssues(key,ver)` | Issues in version |
| `useIssueLinkTypes` | `issueLinkTypes` | Link type catalog |
| `useTestPlans(key)` | `testPlans(key)` | Test plans |
| `useTestExecutions(key)` | `testExecutions(key)` | Test executions |
| `useTestExecutionsByVersion(key,ver)` | `testExecutionsByVersion(key,ver)` | Executions by version |
| `useTestRuns(execId)` | `testRuns(execId)` | Infinite paginated test runs |
| `useIterationStepResults(runId)` | `iterationStepResults(runId)` | Iteration steps (lazy) |
| `useGetTests(key)` | `tests(key)` | All tests in project |
| `useGetTestSets(key)` | `testSets(key)` | All test sets |
| `useGetTestSetTests(id)` | `testSetTests(id)` | Tests in test set |
| `useGetTestSetTestsWithStatus(id)` | `testSetTestsWithStatus(id)` | Tests + status |
| `useTestSetMembership(key)` | `testSetMemberships(key)` | Batch membership map |
| `useGetTestPlanTests(id)` | `testPlanTests(id)` | Tests in test plan |
| `useXrayStatuses(projectId)` | `xrayStatuses(projectId)` | Run status enum |
| `useStepStatuses(projectId)` | `stepStatuses(projectId)` | Step status enum |
| `useVersionRunStats(key,ver)` | derived from `testRuns` | Aggregated pass/fail stats |

**Mutation hooks:** `useSaveConfig`, `useCreateTest`, `useCreateTestExecution`,
`useAddTestsToTestExecution`, `useUpdateTestRunStatus` _(optimistic)_, `useUpdateTestRunComment`,
`useUpdateTestRunStepStatus`, `useUpdateTestRunStep`, `useUpdateIterationStatus`,
`useCreateTestSet`, `useAddTestsToTestSet`, `useRemoveTestsFromTestSet`,
`useCreateTestPlan`, `useAddTestsToTestPlan`, `useRemoveTestsFromTestPlan`,
`useRenameIssue`, `useTransitionIssue`, `useUpdateAssignee`,
`useUpdateExecutionFixVersion`, `useLinkBugToTest`, `useIssueLinkTypes`

Single `queryKeys` object defined in `src/services/queries/queryKeys.ts`. All query hooks must use these keys — never hardcode arrays.

### `src/stores/`

| File | Store | State |
|---|---|---|
| `projectStore.ts` | `useProjectStore` | `executionProjectKey`, `contentProjectKey`, `setExecutionProjectKey`, `setContentProjectKey` |
| `uiStore.ts` | `useUiStore` | `theme`, `toasts`, `rateLimitUntil`, `addToast`, `removeToast`, `setRateLimitUntil` |
| `versionsStore.ts` | `useVersionsStore` | `favouriteVersions`, `toggleFavourite`, `versionGroups`, `healthDots` |
| `coveragePresetsStore.ts` | `useCoveragePresetsStore` | `presets`, `savePreset`, `deletePreset`, `renamePreset` (persisted to localStorage) |
| `healthStore.ts` | `useHealthStore` | `getProjectHealth`, `startHealthFetch`, `resetProject` — test health data cache |
| `coverageHistoryStore.ts` | `useCoverageHistoryStore` | Historical coverage snapshots |

### `src/hooks/`

| File | Exports | Description |
|---|---|---|
| `useProjectKey.ts` | `useProjectKey`, `useExecutionProjectKey`, `useContentProjectKey` | Convenience wrappers over `useProjectStore` |
| `useDragAndDrop.ts` | `useDragAndDrop`, `DragState` | Custom mouse-based DnD (HTML5 DnD does NOT work in Tauri's macOS WKWebView) |

### `src/pages/`

| File | Main exports | Sub-components location |
|---|---|---|
| `TestExecutionsPage.tsx` | `TestExecutionsPage` | Inline: `ExecRow`, `CreateExecutionDialog`, `EditExecutionDialog`, `CloneExecutionDialog` |
| `TestPlansPage.tsx` | `TestPlansPage` | Inline: `TestSetsSourcePanel`, `TestPlansDropPanel`, `TestSetRow`, `TestPlanDropTarget`, `CreatePlanDialog`, `DragGhost` |
| `TestsPage.tsx` | `TestsPage` | Extracted → `src/components/tests/` (10 files: `TestRow`, `TestsPanel`, `TestSetDropTarget`, `TestSetsPanel`, `CreateTestSetDialog`, `TestHealthPanel`, `TestSetsHealthPanel`, `TransitionMenu`, `DragGhost`, `utils`) |
| `CoveragePage.tsx` | `CoveragePage` | Extracted → `src/components/coverage/` (8 files: `OverallDashboard`, `TestSetSection`, `PresetsBar`, `AnalysisPanels`, `MetricTile`, `StatusBadge`, `htmlReportBuilder`, `utils`) |
| `VersionsPage.tsx` | `VersionsPage` | Extracted → `src/components/versions/` (16 files: `VersionCard`, `VersionDashboard`, `VersionContent`, `BugsPanel`, `KpiStrip`, `VersionIssuesPanel`, `FailedTestsAnalysis`, `ExecutionListPanel`, `VersionGroups`, `ManageVersionsTab`, `ReleaseReadinessChecklist`, `IssueDetailModal`, `ConfirmModal`, `FetchProgress`, `utils`) |
| `SettingsPage.tsx` | `SettingsPage` | Inline: `Field`, `ValidationIndicator` |
| `CreateTestPage.tsx` | `CreateTestPage` | Inline step editor form |

### `src/components/common/`

| File | Exports | Description |
|---|---|---|
| `AppShell.tsx` | `AppShell` | Sidebar nav + page outlet. Nav routes: `/executions`, `/test-plans`, `/tests`, `/coverage`, `/versions`, `/create-test`, `/settings` |
| `ProjectSelector.tsx` | `ProjectSelector` | Dual project-key pickers (execution vs content) shown in header |
| `ModalShell.tsx` | `ModalShell` | Radix Dialog wrapper for all modal dialogs |
| `RateLimitBanner.tsx` | `RateLimitBanner` | Displays rate-limit countdown from `uiStore` |
| `ErrorBoundary.tsx` | `ErrorBoundary` | React error boundary for page-level crashes |
| `EmptyState.tsx` | `EmptyState` | Reusable empty list placeholder |
| `ThemeToggle.tsx` | `ThemeToggle` | Light/dark toggle |

### `src/components/test-execution/`

| File | Exports | Key sub-components |
|---|---|---|
| `TestExecutionDetail.tsx` | `TestExecutionDetail` | `StepsPanel`, `GherkinPanel`, `IterationsPanel` — renders the expanded view of a test execution with virtualised test run list |
| `StepMarkdown.tsx` | `StepMarkdown` | Renders step text as Markdown |

### `src/components/tests/`

| File | Exports | Description |
|---|---|---|
| `utils.ts` | `ToastFn`, `DEPRECATING_KEYWORDS`, `isDeprecatingStatus`, `loadHiddenKeys`, `saveHiddenKeys`, `categoryColor` | Shared helpers and types for tests components |
| `TransitionMenu.tsx` | `TransitionMenu` | Portal-based dropdown for Jira workflow transitions |
| `DragGhost.tsx` | `DragGhost` | Floating drag tooltip for DnD operations |
| `TestRow.tsx` | `TestRow` | Single test item with membership badges (memo) |
| `TestsPanel.tsx` | `TestsPanel` | Virtualised test list with export, select-all, drag |
| `TestSetDropTarget.tsx` | `TestSetDropTarget` | Collapsible test set with inline rename, member table, drop target (memo) |
| `TestSetsPanel.tsx` | `TestSetsPanel` | List of drop targets with expand-all, search, hidden count |
| `CreateTestSetDialog.tsx` | `CreateTestSetDialog` | Radix dialog with component picker |
| `TestSetsHealthPanel.tsx` | `TestSetHealthRow`, `TestSetsHealthPanel` | Deprecated test cleanup UI |
| `TestHealthPanel.tsx` | `TestHealthPanel` | Virtualised health table with bulk transitions |

### `src/components/coverage/`

| File | Exports | Description |
|---|---|---|
| `htmlReportBuilder.ts` | `buildCoverageHTML`, `buildSvgDonut`, `buildSvgMiniBar`, `buildSvgGauge` | Pure TS — generates printable HTML coverage report (no React) |
| `utils.ts` | `SetQueryMap`, `passRate`, `hasFail` | Shared types and helpers for coverage components |
| `StatusBadge.tsx` | `StatusBadge` | Colour-coded status pill using Xray status palette |
| `MetricTile.tsx` | `MetricTile`, `CoverageTile`, `TileColor`, `tileColors` | Small metric cards used in OverallDashboard grid |
| `AnalysisPanels.tsx` | `InsightsPanel`, `FailureConcentrationPanel`, `NeverRunPanel` | Analysis tab sub-panels |
| `OverallDashboard.tsx` | `OverallDashboard` | Top-level coverage summary with charts and metrics grid |
| `TestSetSection.tsx` | `TestSetSection` | Collapsible per-test-set section with status bars and sortable test list |
| `PresetsBar.tsx` | `PresetsBar` | Preset management sidebar (save, load, rename, delete) |

### `src/components/versions/`

| File | Exports | Description |
|---|---|---|
| `utils.ts` | `priorityClass`, `statusCategoryClass`, attachment helpers | Shared pure helpers for versions components |
| `FetchProgress.tsx` | `FetchProgress` | Loading progress bar |
| `ConfirmModal.tsx` | `ConfirmModal` | Generic confirmation dialog |
| `VersionCard.tsx` | `VersionCard` | Version sidebar card with health dot, star, badges |
| `KpiStrip.tsx` | `KpiTile`, `VersionKpiStrip` | KPI metric strip |
| `ReleaseReadinessChecklist.tsx` | `ReleaseReadinessChecklist` | 5-criteria release readiness checklist |
| `FailedTestsAnalysis.tsx` | `StatusPip`, `FailedTestRow`, `FailedTestsAnalysis` | Failed test analysis panel |
| `BugsPanel.tsx` | `FilterChip`, `BugsPanel` | Bug list with filters |
| `IssueDetailModal.tsx` | `IssueDetailModal`, `StatusTransitionDropdown`, `CommentItem` | Full issue detail modal (attachments, transitions, comments) |
| `VersionIssuesPanel.tsx` | `VersionIssueRow`, `VersionIssuesPanel` | Version issues list |
| `VersionDashboard.tsx` | `VersionDashboard` | Charts + failed test analysis |
| `VersionContent.tsx` | `VersionContent` | Composite assembling all version panels |
| `ExecutionListPanel.tsx` | `ExecutionListPanel` | Wraps useTestExecutionsByVersion |
| `VersionGroups.tsx` | `VersionGroupCard`, `GroupVersionContent`, `GroupReportPanel` | Version group management |
| `ManageVersionsTab.tsx` | `VersionRow`, `ManageVersionsTab` | Version CRUD management |

### `src/components/ui/`
Primitive design-system components: `Button`, `Badge`, `Input`, `Label`, `Spinner`,
`Skeleton`, `Toast`. Follow shadcn patterns; all accept `className` override via `cn()` from `utils.ts`.

### `src/components/charts/`
| File | Exports |
|---|---|
| `StatusCharts.tsx` | `StatusCharts` — pie/bar chart for pass/fail/todo breakdown (used by CoveragePage) |

---

## File Inventory — Rust Backend

### `src-tauri/src/lib.rs`
Tauri application builder. `invoke_handler!` lists every command that must be registered here
when a new Tauri command is added.

### `src-tauri/src/state.rs`
`XrayClientState` = `pub struct XrayClientState(pub Mutex<Option<XrayClient>>)`.
Registered as managed state in `lib.rs`. Lazily initialises `XrayClient` on first use.

### `src-tauri/src/commands/config.rs`
`get_config`, `save_config`, `clear_config` — AES-256-GCM encryption/decryption of `AppConfig`.
Key stored at `{app_config_dir}/key.bin`; ciphertext at `{app_config_dir}/config.enc`.

### `src-tauri/src/commands/jira.rs`
All Jira REST API commands. Each handler calls `make_jira_client()` which reads config and
constructs a `JiraClient`. Commands: `get_jira_projects`, `validate_jira_credentials`,
`get_project_components`, `get_issue_transitions`, `transition_issue`, `update_assignee`,
`search_users`, `get_project_versions`, `update_issue_summary`, `update_issue_fix_version`,
`get_issue_link_types`, `create_issue_link`, `get_bugs_by_version`, `get_version_issues`.

### `src-tauri/src/commands/xray.rs`
All Xray GraphQL commands. Each handler calls `get_xray_client()` which lazily initialises
the shared `XrayClient` (stored in `XrayClientState`). Commands: `get_test_plans`,
`get_test_executions`, `get_test_executions_by_version`, `get_test_runs`,
`get_iteration_step_results`, `update_test_run_status`, `update_test_run_comment`,
`get_xray_statuses`, `create_test_execution`, `add_tests_to_test_execution`,
`get_step_statuses`, `update_test_run_step_status`, `update_test_run_step`,
`create_test`, `create_test_set`, `add_tests_to_test_set`, `remove_tests_from_test_set`,
`authenticate_xray`, `get_tests`, `get_test_sets`, `get_test_set_tests`,
`get_test_set_tests_with_status`, `get_all_test_set_memberships`, `get_test_plan_tests`,
`create_test_plan`, `add_tests_to_test_plan`, `remove_tests_from_test_plan`,
`get_test_executions_by_version`, `update_iteration_status`, `add_defects_to_test_run`.

### `src-tauri/src/api/jira_client.rs`
`JiraClient` struct — raw HTTP calls to Jira REST API v3 using Basic auth (email + API token).

### `src-tauri/src/api/xray_client.rs`
`XrayClient` struct — Xray Cloud GraphQL API via OAuth2 Bearer token. Token cached in
`Arc<Mutex<Option<String>>>`, auto-refreshed on 401.

### `src-tauri/src/models/`
Serde structs mirroring API shapes. `config.rs` → `AppConfig`. `jira.rs` → Jira response types.
`xray.rs` → Xray GraphQL response types (incl. custom `deserialize_jira_json` deserializer because
the `jira` field in Xray responses is a JSON-encoded string, not a nested object).

---

## Feature Area → File Map

Quick-reference: given a feature, which files do you touch? Each area lists the full stack
from UI to Rust. Hooks import via `@/services/queries`; tauri wrappers via `@/services/tauri`.

### Test Executions
| Layer | File(s) | Key exports |
|---|---|---|
| Page | `src/pages/TestExecutionsPage.tsx` | `TestExecutionsPage` (1,327 lines — not yet split; inline: `ExecRow`, `CreateExecutionDialog`, `EditExecutionDialog`, `CloneExecutionDialog`) |
| Components | `src/components/test-execution/TestExecutionDetail.tsx`, `StepMarkdown.tsx` | Virtualised test run table, step panels |
| Queries | `src/services/queries/xray-queries.ts` | `useTestExecutions`, `useTestExecutionsByVersion`, `useTestRuns`, `useIterationStepResults` |
| Mutations | `src/services/queries/xray-mutations.ts` | `useUpdateTestRunStatus` _(optimistic)_, `useUpdateTestRunComment`, `useUpdateTestRunStepStatus`, `useUpdateTestRunStep`, `useUpdateIterationStatus`, `useCreateTestExecution`, `useAddTestsToTestExecution` |
| Tauri | `src/services/tauri.ts` | `getTestExecutions`, `getTestExecutionsByVersion`, `getTestRuns`, `getIterationStepResults`, `updateTestRunStatus`, `updateTestRunComment`, `updateTestRunStepStatus`, `updateTestRunStep`, `updateIterationStatus`, `createTestExecution`, `addTestsToTestExecution` |
| Rust cmds | `src-tauri/src/commands/xray.rs` | Same names in snake_case |
| Rust API | `src-tauri/src/api/xray_client.rs` | `XrayClient` methods |
| Models | `src-tauri/src/models/xray.rs` | `TestExecution`, `TestRun`, `TestRunStep`, `TestRunIteration` |

### Coverage
| Layer | File(s) | Key exports |
|---|---|---|
| Page | `src/pages/CoveragePage.tsx` (545 lines) | `CoveragePage` |
| Components | `src/components/coverage/` | `OverallDashboard`, `TestSetSection`, `PresetsBar`, `AnalysisPanels` (`InsightsPanel`, `FailureConcentrationPanel`, `NeverRunPanel`), `MetricTile`, `StatusBadge`, `htmlReportBuilder` (pure TS), `utils` |
| Queries | `src/services/queries/xray-queries.ts` | `useGetTestSetTestsWithStatus`, `useTestSetMembership`, `useXrayStatuses`, `useStepStatuses` |
| Store | `src/stores/coveragePresetsStore.ts` | `useCoveragePresetsStore` — saved presets |
| Store | `src/stores/coverageHistoryStore.ts` | `useCoverageHistoryStore` — historical snapshots |
| Tauri | `src/services/tauri.ts` | `getTestSetTestsWithStatus`, `getAllTestSetMemberships`, `getXrayStatuses`, `getStepStatuses` |
| Rust cmds | `src-tauri/src/commands/xray.rs` | Same names in snake_case |
| Charts | `src/components/charts/StatusCharts.tsx` | `StatusCharts` — pie/bar charts |

### Tests & Test Sets
| Layer | File(s) | Key exports |
|---|---|---|
| Page | `src/pages/TestsPage.tsx` (427 lines) | `TestsPage` |
| Components | `src/components/tests/` | `TestRow`, `TestsPanel` (virtualised), `TestSetDropTarget`, `TestSetsPanel`, `CreateTestSetDialog`, `TestHealthPanel`, `TestSetsHealthPanel`, `TransitionMenu`, `DragGhost`, `utils` |
| Queries | `src/services/queries/xray-queries.ts` | `useGetTests`, `useIsTestsStreaming`, `useReloadTests`, `useGetTestSets`, `useGetTestSetTests`, `useGetTestSetTestsWithStatus` |
| Mutations | `src/services/queries/xray-mutations.ts` | `useCreateTest`, `useCreateTestSet`, `useAddTestsToTestSet`, `useRemoveTestsFromTestSet` |
| Store | `src/stores/healthStore.ts` | `useHealthStore` — test health data cache |
| Tauri | `src/services/tauri.ts` | `getTests`, `getTestSets`, `getTestSetTests`, `getTestSetTestsWithStatus`, `createTest`, `createTestSet`, `addTestsToTestSet`, `removeTestsFromTestSet` |
| Rust cmds | `src-tauri/src/commands/xray.rs` | Same names in snake_case |
| Models | `src-tauri/src/models/xray.rs` | `XrayTest`, `XrayTestSet` |

### Test Plans
| Layer | File(s) | Key exports |
|---|---|---|
| Page | `src/pages/TestPlansPage.tsx` (1,280 lines — not yet split; inline: `TestSetsSourcePanel`, `TestPlansDropPanel`, `CreatePlanDialog`, `DragGhost`) | `TestPlansPage` |
| Queries | `src/services/queries/xray-queries.ts` | `useTestPlans`, `useGetTestPlanTests` |
| Mutations | `src/services/queries/xray-mutations.ts` | `useCreateTestPlan`, `useAddTestsToTestPlan`, `useRemoveTestsFromTestPlan` |
| Tauri | `src/services/tauri.ts` | `getTestPlans`, `getTestPlanTests`, `createTestPlan`, `addTestsToTestPlan`, `removeTestsFromTestPlan` |
| Rust cmds | `src-tauri/src/commands/xray.rs` | Same names in snake_case |
| Models | `src-tauri/src/models/xray.rs` | `TestPlan` |

### Versions
| Layer | File(s) | Key exports |
|---|---|---|
| Page | `src/pages/VersionsPage.tsx` (360 lines) | `VersionsPage` |
| Components | `src/components/versions/` | `VersionCard`, `VersionDashboard`, `VersionContent`, `BugsPanel`, `KpiStrip`, `VersionIssuesPanel`, `FailedTestsAnalysis`, `ExecutionListPanel`, `VersionGroups`, `ManageVersionsTab`, `ReleaseReadinessChecklist`, `IssueDetailModal`, `ConfirmModal`, `FetchProgress`, `ExecutionRow`, `utils` |
| Queries | `src/services/queries/jira.ts` | `useProjectVersions`, `useCreateVersion`, `useUpdateVersion`, `useBugsByVersion`, `useVersionIssues` |
| Queries | `src/services/queries/xray-queries.ts` | `useTestExecutionsByVersion` |
| Stats | `src/services/queries/version-stats.ts` | `useVersionRunStats` |
| Store | `src/stores/versionsStore.ts` | `useVersionsStore` — favourites, health dots, version groups |
| Tauri | `src/services/tauri.ts` | `getProjectVersions`, `createVersion`, `updateVersion`, `getBugsByVersion`, `getVersionIssues`, `getTestExecutionsByVersion`, `updateIssueFixVersion` |
| Rust cmds | `src-tauri/src/commands/jira.rs` | `get_project_versions`, `create_version`, `update_version`, `get_bugs_by_version`, `get_version_issues`, `update_issue_fix_version` |
| Rust cmds | `src-tauri/src/commands/xray.rs` | `get_test_executions_by_version` |
| Rust API | `src-tauri/src/api/jira_client.rs` | `JiraClient` methods |
| Models | `src-tauri/src/models/jira.rs` | `JiraVersion`, `JiraBug`, `VersionIssue` |

### Settings
| Layer | File(s) | Key exports |
|---|---|---|
| Page | `src/pages/SettingsPage.tsx` | `SettingsPage` (inline: `Field`, `ValidationIndicator`) |
| Queries | `src/services/queries/config.ts` | `useConfig`, `useSaveConfig` |
| Tauri | `src/services/tauri.ts` | `getConfig`, `saveConfig`, `clearConfig`, `validateJiraCredentials`, `authenticateXray` |
| Rust cmds | `src-tauri/src/commands/config.rs` | `get_config`, `save_config`, `clear_config` |
| Rust cmds | `src-tauri/src/commands/jira.rs` | `validate_jira_credentials` |
| Rust cmds | `src-tauri/src/commands/xray.rs` | `authenticate_xray` |
| Models | `src-tauri/src/models/config.rs` | `AppConfig` |

### Create Test
| Layer | File(s) | Key exports |
|---|---|---|
| Page | `src/pages/CreateTestPage.tsx` | `CreateTestPage` (inline step editor form) |
| Mutations | `src/services/queries/xray-mutations.ts` | `useCreateTest` |
| Tauri | `src/services/tauri.ts` | `createTest` |
| Rust cmds | `src-tauri/src/commands/xray.rs` | `create_test` |
| Models | `src-tauri/src/models/xray.rs` | `CreateTestInput` |

### Cross-cutting (Jira utilities used by multiple features)
| Layer | File(s) | Key exports |
|---|---|---|
| Queries | `src/services/queries/jira.ts` | `useJiraProjects`, `useSearchUsers`, `useIssueTransitions`, `useProjectComponents`, `useIssueLinkTypes` |
| Mutations | `src/services/queries/jira.ts` | `useTransitionIssue`, `useUpdateAssignee`, `useRenameIssue`, `useLinkBugToTest`, `useUpdateExecutionFixVersion` |
| Tauri | `src/services/tauri.ts` | `getJiraProjects`, `searchUsers`, `getIssueTransitions`, `transitionIssue`, `updateAssignee`, `updateIssueSummary`, `getIssueLinkTypes`, `createIssueLink` |
| Rust cmds | `src-tauri/src/commands/jira.rs` | Same names in snake_case |
| Constants | `src/constants/statuses.ts` | `TestRunStatusName`, `normalizeStatusKey()`, `CRITICAL_PRIORITIES` |

---

## Architecture Notes

### Data flow
All API calls go through the Rust backend:
`UI component → TanStack Query hook (queries/) → tauri.ts invoke() → Rust command → HTTP`

Never import `fetch` or call Jira/Xray URLs directly from TypeScript.

### Credential storage
Credentials are encrypted with AES-256-GCM and stored at the OS app-config directory
(`~/.config/qality/config.enc` on Linux, `~/Library/Application Support/qality/config.enc` on macOS).
A random 32-byte key is generated on first run and stored at `key.bin` in the same directory.
The plaintext `AppConfig` struct is only held in memory after decryption.

### Xray authentication
`XrayClient` uses OAuth2 Client Credentials flow. The Bearer token is cached in a
`Arc<Mutex<Option<String>>>` and automatically refreshed on 401 responses (one retry).

### Optimistic mutations
`useUpdateTestRunStatus` (`queries/xray-mutations.ts`) applies the new status in the TanStack Query cache
instantly and rolls back on error. This keeps the UI snappy even on slow connections.

### Virtualised lists
`TestExecutionDetail` and `TestsPanel` use `@tanstack/react-virtual` (`useVirtualizer`) to
render only visible rows. All large data tables should use this pattern.

### Drag and drop
Custom mouse-event DnD via `useDragAndDrop` hook — **do not use HTML5 drag API** as it does not
work in Tauri's macOS WKWebView. The hook returns `{ drag, startDrag, ghostRef }`. Ghost elements
are updated via direct DOM manipulation on `mousemove` (not React state) for performance.

### Rate limiting
`uiStore.rateLimitUntil` (ms timestamp) is set by `parseRateLimitError()` when Xray returns 429.
`RateLimitBanner` shows the countdown. Mutations debounce `invalidateQueries` calls via a 500 ms
coalescing window (`pendingInvalidations` in `queries/xray-mutations.ts`, `DEBOUNCE_MS = 500`).

---

## Known Gotchas (read before editing)

1. **`src/services/queries/` is the barrel** for all TanStack Query hooks. New hooks go
   into the appropriate submodule: `jira.ts`, `xray-queries.ts`, `xray-mutations.ts`, etc.

2. **Xray GraphQL query names** use a `get` prefix and do NOT accept `projectKey` — use `jql` filter
   e.g. `jql: "project = 'KEY'"`.

3. **Xray `jira` field is a JSON-encoded string** — not a nested object. Deserialized via custom
   `deserialize_jira_json` in `src-tauri/src/models/xray.rs`.

4. **Xray `remove` mutations return a scalar `String`**, not an object. Do NOT select subfields on
   `removeTestsFromTestSet` or `removeTestsFromTestPlan` — causes 400 Bad Request.

5. **Tauri `invoke` rejects with a plain string**, not an `Error` object. `error instanceof Error`
   is always `false`. Use `String(error)` to get the message.

6. **New Tauri commands** must be added to three places:
   - Rust handler function in the appropriate `commands/*.rs` file
   - `invoke_handler!` macro in `src-tauri/src/lib.rs`
   - Typed wrapper in `src/services/tauri.ts`
   - TanStack Query hook in `src/services/queries/` (appropriate submodule)

7. **Rust error formatting** — use `format!("{e:#}")` (not `.to_string()`) in command handlers to
   get the full anyhow error chain in the frontend error message.

8. **HTML5 DnD is broken in Tauri macOS WKWebView** — always use the `useDragAndDrop` hook.

9. **Two project keys** — `executionProjectKey` (where test executions live) vs
   `contentProjectKey` (where tests/test-sets/test-plans live). Both are set independently in the
   header via `ProjectSelector`. Hooks in pages use `useExecutionProjectKey()` or
   `useContentProjectKey()` from `src/hooks/useProjectKey.ts`.

---

## Code Style Guidelines

### TypeScript / React

- **Indentation:** 2 spaces
- **Max line length:** 100 characters
- **Quotes:** double (`"`)
- **Semicolons:** required
- **Trailing commas:** required in multi-line expressions
- Prefer `interface` over `type` for object shapes
- No `any` — use proper types or generics
- Use `type` imports: `import type { Foo } from "./types"`
- Components are arrow functions exported as named exports (not `export default`)
- One component per file; filename matches the export name (PascalCase)

### Imports (TypeScript)

Group in this order, blank line between each group:
1. React
2. Third-party packages
3. `@/` alias imports (internal absolute)
4. Relative imports

### Rust

- **Indentation:** 4 spaces (rustfmt)
- **Max line width:** 100 characters
- All public functions must have doc comments
- Use `anyhow::Result` in library/API code; `String` errors only in Tauri command handlers
- Never use `unwrap()` in non-test code — use `?` or `context()`

### Naming

| Construct          | Convention       | Example                    |
|--------------------|------------------|----------------------------|
| TS variables       | camelCase        | `testRunId`                |
| TS functions       | camelCase        | `getTestExecutions()`      |
| React components   | PascalCase       | `TestExecutionDetail`      |
| TS interfaces      | PascalCase       | `TestRun`                  |
| TS constants       | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT`          |
| TS files (src)     | PascalCase       | `TestExecutionDetail.tsx`  |
| TS files (service) | camelCase        | `tauri.ts`, `queryKeys.ts`   |
| Test files         | `*.test.ts`      | `queries.test.ts`          |
| Rust modules       | snake_case       | `xray_client.rs`           |
| Rust structs       | PascalCase       | `TestRunStatus`            |
| Rust functions     | snake_case       | `get_test_runs()`          |
| Tauri commands     | snake_case       | `update_test_run_status`   |

### Error handling

**TypeScript:**
- Never swallow errors silently — always propagate or surface to the UI
- Tauri `invoke()` rejects with a plain `string` from Rust; use `String(error)`, not `error instanceof Error`
- Use TanStack Query's `isError` + `error` state to show error UI; do not `console.error` in components

**Rust:**
- Use `?` for propagation; `context()`/`with_context()` to add call-site information
- Tauri command handlers convert `anyhow::Error` → `String` via `.map_err(|e| format!("{e:#}"))`
- Never `panic!` in command handlers

---

## Git Conventions

### Branch naming
```
feature/<short-description>
fix/<short-description>
chore/<short-description>
```

### Commit messages (Conventional Commits)
```
feat(xray): add test plan filtering by status
fix(config): handle missing config dir on first launch
chore(deps): update reqwest to 0.13
```

Types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `perf`, `ci`
Subject line: ≤ 72 characters.

---

## Notes for AI Coding Agents

- **Read before writing.** Use `get_symbols_overview` or `find_symbol` before editing.
- **All API calls go through Rust.** Never call Jira/Xray from TypeScript directly.
- **After editing Rust**, run `cargo build` + `cargo clippy -- -D warnings` to verify.
- **After editing TypeScript**, run `npm run typecheck` + `npm test` to verify.
- **Prefer editing** an existing file over creating a new one.
- **Do not modify `AGENTS.md`** unless explicitly asked.
- **Ask before broad refactors** that touch more than 3 files.
- **New Tauri commands** must be registered in `src-tauri/src/lib.rs` `invoke_handler!`.
- **New frontend data calls** go in `src/services/tauri.ts` (invoke wrapper) +
  `src/services/queries/` (appropriate submodule: `jira.ts`, `xray-queries.ts`, or `xray-mutations.ts`).
- **`@/` path alias** maps to `src/` (configured in `tsconfig.json` and `vite.config.ts`).
- **Check the Known Gotchas section** before touching Xray GraphQL, drag-and-drop, or queries.
