---
name: qality
description: >
  Complete structural and architectural reference for QAlity Manual Reporting —
  a Tauri 2 desktop app for Jira/Xray test management. Covers every file, route,
  Tauri command, TanStack Query hook, mutation pattern, Zustand store, component
  tree, and data flow. Load this skill before working on any part of the codebase.
---

# QAlity Manual Reporting — Architecture & Structure Reference

## Project Overview

Cross-platform desktop app (Tauri 2 + React 19 + TypeScript) for reading Jira/Xray Cloud
test data, marking test runs, and writing results back to Xray — without a web server.

**Stack:** Tauri 2 (Rust backend + OS WebView) | React 19 + TypeScript + Vite | Tailwind CSS v4 |
Radix UI + shadcn-style primitives | Zustand (UI/project state) | TanStack Query v5 (server state) |
TanStack Virtual (virtualised lists) | Rust: reqwest, AES-256-GCM, Tokio | Package manager: npm

**Version:** 2.3.0

---

## Architecture — Data Flow

```
React Component
  → TanStack Query hook (src/services/queries/*.ts)
    → tauri.ts invoke() wrapper (src/services/tauri.ts)
      → Rust #[tauri::command] fn (src-tauri/src/commands/*.rs)
        → JiraClient / XrayClient method (src-tauri/src/api/*.rs)
          → reqwest HTTP call
            → Jira REST / Xray GraphQL / Confluence REST
```

**Never call `fetch` from TypeScript.** Never call Jira/Xray URLs directly. All API calls go
through the Rust backend via `invoke()`.

**Two project keys** — `executionProjectKey` (where test executions live) vs `contentProjectKey`
(where tests/test-sets/test-plans live). Both set independently via `ProjectSelector` in header.

**Credential storage:** AES-256-GCM encryption. Key at `{app_config_dir}/key.bin`, ciphertext
at `{app_config_dir}/config.enc`. Plaintext `AppConfig` only held in memory after decryption.

**Xray auth:** OAuth2 Client Credentials. Bearer token cached in `Arc<Mutex<Option<String>>>`,
auto-refreshed on 401 (one retry).

---

## Route Map

All routes wrapped in `<AppShell>` with sidebar nav. Uses `HashRouter`.

| Route | Page Component | Lazy? | Role Gated? | Description |
|---|---|---|---|---|
| `/` | redirect → `/executions` | — | — | Default redirect |
| `/executions` | `TestExecutionsPage` | Yes | Yes | Browse/create/clone test executions |
| `/test-plans` | `TestPlansPage` | Yes | Yes | Browse test plans + drag tests |
| `/tests` | `TestsPage` | Yes | Yes | Browse tests + drag onto test sets |
| `/coverage` | `CoveragePage` | Yes | Yes | Per-test-set coverage dashboard |
| `/versions` | `VersionsPage` | Yes | No | Version dashboard: bugs, issues, executions |
| `/create-test` | `CreateTestPage` | Yes | Yes | Form to create new Xray test |
| `/settings` | `SettingsPage` | Yes | No | Jira + Xray credential management |

---

## File Manifest — Frontend `src/`

### Entry Points
| File | Exports | Purpose |
|---|---|---|
| `main.tsx` | — | React entry point (mounts `<App />`) |
| `App.tsx` | `makeQueryClient`, `queryClient`, `localStoragePersister`, `App` | Router + QueryClient + persister setup |
| `index.css` | — | Tailwind v4 entry + global resets |

### `src/pages/` — Route-level pages (one file per route)
| File | Export | Key sub-components |
|---|---|---|
| `TestExecutionsPage.tsx` | `TestExecutionsPage` | Inline: `ExecRow` (imported from components), `CreateExecutionDialog`, `EditExecutionDialog`, `CloneExecutionDialog` |
| `TestPlansPage.tsx` | `TestPlansPage` | Inline: `TestSetsSourcePanel`, `TestPlansDropPanel`, `TestSetRow`, `TestPlanDropTarget`, `CreatePlanDialog`, `DragGhost` |
| `TestsPage.tsx` | `TestsPage` | Sub-components in `components/tests/` |
| `CoveragePage.tsx` | `CoveragePage` | Sub-components in `components/coverage/` |
| `VersionsPage.tsx` | `VersionsPage` | Sub-components in `components/versions/` |
| `CreateTestPage.tsx` | `CreateTestPage` | Sub-components in `components/create-test/` |
| `SettingsPage.tsx` | `SettingsPage` | Inline: `Field`, `ValidationIndicator` |

### `src/components/common/` — Layout & shared UI
| File | Export | Purpose |
|---|---|---|
| `AppShell.tsx` | `AppShell` | Sidebar nav + `<Outlet />` for routes |
| `ProjectSelector.tsx` | `ProjectSelector`, `ProjectScope` | Dual project-key pickers (execution vs content) |
| `EmptyState.tsx` | `EmptyState` | Reusable empty list placeholder |
| `ErrorBoundary.tsx` | `ErrorBoundary` | React error boundary (class-based) |
| `GlobalToastList.tsx` | `GlobalToastList` | Toast notification renderer |
| `PageHelpModal.tsx` | `PageHelpButton`, `PageHelpId` | Contextual help modal per page |
| `RateLimitBanner.tsx` | `RateLimitBanner` | Countdown banner for Xray rate-limit |
| `RoleSelectionModal.tsx` | `RoleSelectionModal` | First-launch role picker (QA/Product/Dev/Design) |
| `ThemeToggle.tsx` | `ThemeToggle` | Light/dark toggle |

### `src/components/ui/` — Design-system primitives
| File | Export |
|---|---|
| `badge.tsx` | `Badge`, `BadgeProps` |
| `badge-utils.ts` | `statusVariant` |
| `button.tsx` | `Button`, `ButtonProps` |
| `input.tsx` | `Input`, `InputProps` |
| `label.tsx` | `Label` |
| `skeleton.tsx` | `Skeleton` |
| `spinner.tsx` | `Spinner` |
| `toast.tsx` | `Toast`, `ToastMessage` |
| `toast-utils.ts` | `showToast`, `ToastMessage` |
| `utils.ts` | `cn` (clsx + tailwind-merge) |

### `src/components/test-execution/` — Test run detail view
| File | Export | Lines |
|---|---|---|
| `TestExecutionDetail.tsx` | `TestExecutionDetail` | ~3400 — virtualised test run table with steps/Gherkin/iterations panels, status/assignee/version header controls |
| `StepMarkdown.tsx` | `StepMarkdown` | Renders step text as Markdown |

### `src/components/test-executions/` — Execution CRUD
| File | Export |
|---|---|
| `ExecRow.tsx` | `ExecRow` (memo) — single row in executions table |
| `CreateExecutionDialog.tsx` | `CreateExecutionDialog` |
| `EditExecutionDialog.tsx` | `EditExecutionDialog` |
| `CloneExecutionDialog.tsx` | `CloneExecutionDialog` |

### `src/components/tests/` — Tests & Test Sets page (12 files)
| File | Export | Purpose |
|---|---|---|
| `TestsPanel.tsx` | `TestsPanel` | Virtualised test list with export, select-all, drag |
| `TestRow.tsx` | `TestRow` (memo) | Single test item with membership badges |
| `TestSetDropTarget.tsx` | `TestSetDropTarget` (memo) | Collapsible test set + inline rename + drop target |
| `TestSetsPanel.tsx` | `TestSetsPanel` | List of drop targets with expand-all, search |
| `CreateTestSetDialog.tsx` | `CreateTestSetDialog` | Radix dialog with component picker |
| `TransitionMenu.tsx` | `TransitionMenu` | Portal-based workflow transition dropdown |
| `DragGhost.tsx` | `DragGhost` | Floating drag tooltip |
| `TestHealthPanel.tsx` | `TestHealthPanel` | Virtualised health table with bulk transitions |
| `TestSetsHealthPanel.tsx` | `TestSetsHealthPanel`, `TestSetHealthRow` | Deprecated test cleanup UI |
| `DeprecatedTestsPanel.tsx` | `DeprecatedTestsPanel` | UI for managing tests with deprecating statuses |
| `utils.ts` | `isDeprecatingStatus`, `loadHiddenKeys`, `saveHiddenKeys`, `categoryColor`, `ToastFn`, `DEPRECATING_KEYWORDS` | Shared helpers |
| `utils.test.ts` | — | Vitest tests |

### `src/components/coverage/` — Coverage dashboard (10 files)
| File | Export | Purpose |
|---|---|---|
| `OverallDashboard.tsx` | `OverallDashboard` | Top-level metrics grid + charts |
| `TestSetSection.tsx` | `TestSetSection` (memo) | Per-test-set collapsible section with status bars |
| `PresetsBar.tsx` | `PresetsBar` | Preset management sidebar |
| `AnalysisPanels.tsx` | `InsightsPanel`, `FailureConcentrationPanel`, `NeverRunPanel` | Analysis tab sub-panels |
| `MetricTile.tsx` | `MetricTile`, `CoverageTile` | Small metric cards |
| `StatusBadge.tsx` | `StatusBadge` | Colour-coded status pill |
| `CoverageTestDetailModal.tsx` | `CoverageTestDetailModal` | Test detail popup |
| `htmlReportBuilder.ts` | `buildCoverageHTML`, `buildSvgDonut`, `buildSvgMiniBar`, `buildSvgGauge` | Pure TS HTML report generation |
| `utils.ts` | `passRate`, `hasFail`, `SetQueryMap` | Helpers |
| `utils.test.ts` | — | Vitest tests |

### `src/components/versions/` — Version dashboard (25 files)
| File | Export | Purpose |
|---|---|---|
| `VersionCard.tsx` | `VersionCard` (memo) | Sidebar version card with health dot, star, badges |
| `VersionContent.tsx` | `VersionContent` | Composite assembling all panels for selected version |
| `VersionDashboard.tsx` | `VersionDashboard` | Charts + failed test analysis |
| `BugsPanel.tsx` | `BugsPanel` | Bug list with filter chips |
| `VersionIssuesPanel.tsx` | `VersionIssuesPanel` | Stories/Tasks/Bugs list |
| `KpiStrip.tsx` | `VersionKpiStrip` | KPI metric strip |
| `FailedTestsAnalysis.tsx` | `FailedTestsAnalysis` | Failed test analysis with status pips |
| `ExecutionListPanel.tsx` | `ExecutionListPanel` | Executions for a version |
| `ExecutionRow.tsx` | `ExecutionRow` (memo) | Single execution row |
| `ExecutionComparison.tsx` | `VersionComparison` | Side-by-side execution comparison |
| `VersionGroups.tsx` | `VersionGroupCard`, `GroupReportPanel` | Version group management |
| `ManageVersionsTab.tsx` | `ManageVersionsTab` | Version CRUD management |
| `ReleaseReadinessChecklist.tsx` | `ReleaseReadinessChecklist` | 5-criteria release checklist |
| `IssueDetailModal.tsx` | `IssueDetailModal`, `AttachmentPreview` | Full issue detail modal |
| `TestDetailModal.tsx` | `TestDetailModal` | Test detail popup |
| `FeedbackPanel.tsx` | `FeedbackPanel`, `parseIssueRows`, `injectCarryOverRows` | Feedback/issue management |
| `FeedbackSummary.tsx` | `FeedbackSummary` | Feedback summary display |
| `CarryOverModal.tsx` | `CarryOverModal` | Carry-over workflow modal |
| `ConfluencePageLinker.tsx` | `ConfluencePageLinker` | Link version to Confluence page |
| `ConfluencePagePicker.tsx` | `ConfluencePagePicker` | Confluence page browser |
| `FetchProgress.tsx` | `FetchProgress` | Loading progress bar |
| `ConfirmModal.tsx` | `ConfirmModal` | Generic confirmation dialog |
| `QaApprovalBanner.tsx` | `QaApprovalBanner`, `parseQaApprovalFromBody` | QA approval banner |
| `htmlVersionReportBuilder.ts` | `buildVersionReportHTML` | Pure TS HTML report generation |
| `utils.ts` | `priorityClass`, `statusCategoryClass`, attachment helpers | Shared helpers |

### `src/components/charts/` — Chart components
| File | Export |
|---|---|
| `StatusCharts.tsx` | `DonutChart`, `StatCard`, `StackedBar`, `MiniStackedBar` |
| `status-utils.ts` | `buildSlicesFromCounts`, `buildSlicesFromTests`, `STATUS_PALETTE` |
| `status-utils.test.ts` | Vitest tests |

### `src/components/test-plans/` — Test Plans page (6 files)
| File | Export |
|---|---|
| `TestSetsSourcePanel.tsx` | `TestSetsSourcePanel` |
| `TestPlansDropPanel.tsx` | `TestPlansDropPanel` |
| `TestPlanDropTarget.tsx` | `TestPlanDropTarget` (memo) |
| `TestSetSourceRow.tsx` | `TestSetSourceRow` (memo) |
| `CreatePlanDialog.tsx` | `CreatePlanDialog` |
| `TestPlanDragGhost.tsx` | `TestPlanDragGhost` |

### `src/components/create-test/` — Create Test page (10 files)
| File | Export |
|---|---|
| `ManualTestCreationForm.tsx` | `ManualTestCreationForm` |
| `BulkTestCreationPanel.tsx` | `BulkTestCreationPanel` |
| `UpdateManualTestPanel.tsx` | `UpdateManualTestPanel` |
| `StepRow.tsx` | `StepRow` |
| `ComponentRow.tsx` | `ComponentRow` |
| `TestSetRow.tsx` | `TestSetRow` |
| `TestSetSelect.tsx` | `TestSetSelect` |
| `CopyKeyButton.tsx` | `CopyKeyButton` |
| `types.ts` | `DraftStep`, `nextId`, `newDraftStep` |
| `types.test.ts` | Vitest tests |

### `src/components/bugs/`
| File | Export |
|---|---|
| `CreateBugModal.tsx` | `CreateBugModal` |

### `src/components/settings/`
| File | Export |
|---|---|
| `ApiUsageTab.tsx` | `ApiUsageTab` |

---

## `src/services/` — API Layer

### `tauri.ts` — Typed invoke wrappers (92 exports)
Every export is a `const` arrow function that maps 1:1 to a Rust Tauri command.
Never `import { invoke } from "@tauri-apps/api/core"` directly — always use a wrapper from this file.

**Adding a new Tauri command requires registration in 4 places:**
1. Rust handler in `src-tauri/src/commands/` (appropriate file)
2. `invoke_handler!` macro in `src-tauri/src/lib.rs`
3. Typed wrapper in `src/services/tauri.ts`
4. TanStack Query hook in `src/services/queries/` (appropriate submodule)

### `src/services/queries/` — TanStack Query hooks (barrel: `index.ts`)

**Submodules:**
| File | Contents |
|---|---|
| `queryKeys.ts` | `queryKeys` object + `TEST_RUNS_PAGE_SIZE` (100), `STATS_PAGE_SIZE` (10), `EXEC_SUMMARY_PAGE_SIZE` (100) |
| `config.ts` | `useConfig`, `useSaveConfig`, `useApiUsage` |
| `jira.ts` | All Jira REST query/mutation hooks (~24 exports) |
| `xray-queries.ts` | Xray read hooks (~15 exports) |
| `version-stats.ts` | `useVersionRunStats`, `useExecutionSummaryBatch`, `useExecutionRunSummary` |
| `confluence.ts` | Confluence query/mutation hooks (~9 exports) |
| `xray-mutations/` | Xray write hooks (5 submodules, 15 exports) |
| `index.ts` | Barrel re-exports from all submodules |

#### Complete Query Keys Object

```
config → ["config"]
jiraProjects → ["jira", "projects"]
projectComponents(key) → ["jira", "components", key]
projectVersions(key) → ["jira", "versions", key]
issueTransitions(key) → ["jira", "transitions", key]
userSearch(q) → ["jira", "user-search", q]
userDisplayName(id) → ["jira", "user-display-name", id]
testPlans(pk) → ["xray", "test-plans", pk]
testExecutions(pk) → ["xray", "test-executions", pk]
testExecutionsByVersion(pk, ver) → ["xray", "test-executions-by-version", pk, ver]
testRuns(execId) → ["xray", "test-runs", execId]
testRunDetail(testId, execId) → ["xray", "test-run-detail", testId, execId]
iterationStepResults(runId) → ["xray", "iteration-step-results", runId]
tests(pk) → ["xray", "tests", pk]
testSets(pk) → ["xray", "test-sets", pk]
testSetTests(id) → ["xray", "test-set-tests", id]
testSetTestsWithStatus(id) → ["xray", "test-set-tests-with-status", id]
coverageBatch(setIds) → ["xray", "coverage-batch", ...sorted(setIds)]
testSetMemberships(pk) → ["xray", "test-set-memberships", pk]
testPlanTests(id) → ["xray", "test-plan-tests", id]
xrayStatuses(projId) → ["xray", "statuses", projId]
stepStatuses(projId) → ["xray", "step-statuses", projId]
bugsByVersion(pk, ver) → ["jira", "bugs-by-version", pk, ver]
versionIssues(pk, ver) → ["jira", "version-issues", pk, ver]
issueLinkTypes → ["jira", "issue-link-types"]
issueDetail(key) → ["jira", "issue-detail", key]
attachment(url) → ["jira", "attachment", url]
execSummary(execId, start) → ["xray", "exec-summary", execId, start]
execSummaryBatch(ids) → ["xray", "exec-summary-batch", ...sorted(ids)]
testDetail(key) → ["xray", "test-detail", key]
testRunsByTestId(testId) → ["xray", "test-runs-by-test-id", testId]
xrayEvidence(url) → ["xray", "evidence", url]
versionProperty(verId, key) → ["jira", "version-property", verId, key]
projectProperty(pk, key) → ["jira", "project-property", pk, key]
versionRelatedWork(verId) → ["jira", "version-related-work", verId]
confluenceSpaces → ["confluence", "spaces"]
confluencePages(spaceId, parentId?) → ["confluence", "pages", spaceId, parentId ?? "root"]
confluenceChildren(parentId, type) → ["confluence", "children", parentId, type]
confluencePage(pageId) → ["confluence", "page", pageId]
confluenceAttachments(pageId) → ["confluence", "attachments", pageId]
confluenceAttachmentFile(url) → ["confluence", "attachment-file", url]
apiUsage → ["api-usage"]
currentJiraUser → ["jira", "current-user"]
```

#### Query Cache Configuration

All queries use `staleTime: 5 * 60 * 1000` (5 minutes) unless noted:
- `useConfig`: staleTime Infinity
- `useProjectComponents`: staleTime 10 min
- `useIssueTransitions`: staleTime 60s
- `useSearchUsers`: staleTime 30s
- `useUserDisplayName`: staleTime Infinity
- `useIssueDetail`: staleTime Infinity
- `useXrayStatuses`/`useStepStatuses`: staleTime Infinity (status enums never change)
- `useConfluencePage`: staleTime 30s
- `useApiUsage`: staleTime 30s, polling every 30s via `refetchInterval`
- Persisted queries have `gcTime: Infinity` and `meta: { persist: true }`

`refetchOnWindowFocus` is `false` globally (set in `App.tsx`).

**Persistence:** QueryClient cache persisted to localStorage via `createSyncStoragePersister`.
Only queries tagged `meta.persist: true` are dehydrated. `maxAge: Infinity` (never expire).
Throttle: 5 seconds.

**Retry:** Max 2 retries for non-rate-limit errors. Rate-limited queries get 1 automatic
retry after block window expires (exponential backoff: 1s, 2s, 4s, up to 30s for queries;
1s flat for mutations).

---

## Complete Mutation Pattern Table

### With optimistic updates (instant UI, rollback on error):

| Mutation Hook | Optimistic Patch Target | Rollback? | Debounced Invalidation? |
|---|---|---|---|
| `useUpdateTestRunStatus` | `testRuns` infinite cache → status on matching run across all pages | Yes | Yes (500ms) |
| `useUpdateTestRunComment` | `testRuns` infinite cache → comment on matching run | Yes | Yes (500ms) |
| `useUpdateTestRunStepStatus` | `testRuns` infinite cache → step status | Yes | Yes (500ms) |
| `useUpdateTestRunStep` | `testRuns` infinite cache → step fields | Yes | Yes (500ms) |
| `useUpdateIterationStatus` | `testRuns` infinite cache → iteration status | Yes | Yes (500ms) |
| `useAddDefectsToTestRun` | `testRuns` infinite cache → append defect keys | Yes | Yes (500ms) |
| `useTransitionIssue` | `testExecutions` array → `jira.status.name` | Yes | No (direct invalidate on settle) |
| `useUpdateAssignee` | `testExecutions` array → `jira.assignee` | Yes | No |
| `useUpdateExecutionFixVersion` | `testExecutions` array → `jira.fix_versions` | Yes | No |
| `useRenameIssue` | Any list array → `jira.summary` on matching item | Yes | No |
| `useLinkBugToTest` | `bugsByVersion` array → append optimistic link | Yes | No |
| `useCreateBug` | `bugsByVersion` array → prepend optimistic bug | Yes | No |
| `useSaveConfig` | `config` cache → new config | Yes | No |
| `useDeleteVersionRelatedWork` | `versionRelatedWork` array → filter out deleted entry | Yes | No |
| `useUpdateTestType` | `tests` list + `testDetail` cache → new type | Yes | No |
| `useCreateTestSet` (partial) | `testSets` cache → append directly (no refetch) | No | No |

### Without optimistic updates (wait for server response):

| Mutation Hook | What it invalidates on success/settle |
|---|---|
| `useCreateTestExecution` | `testExecutions(projectKey)` |
| `useAddTestsToTestExecution` | `testRuns(execId)`, `testExecutions(projectKey)` |
| `useAddTestsToTestSet` | `testSetTests(setId)`, `testSetMemberships(projectKey)` |
| `useRemoveTestsFromTestSet` | `testSetTests(setId)`, `testSetMemberships(projectKey)` |
| `useCreateTestPlan` | `testPlans(projectKey)` |
| `useAddTestsToTestPlan` | `testPlanTests(planId)`, `testPlans(projectKey)` |
| `useRemoveTestsFromTestPlan` | `testPlanTests(planId)`, `testPlans(projectKey)` |
| `useCreateTestSet` | `testSets(projectKey)` |
| `useCreateTest` | `tests(projectKey)` |
| `useCreateVersion` | `projectVersions(projectKey)` |
| `useUpdateVersion` | `projectVersions(projectKey)` |
| `useAddJiraComment` | `issueDetail(issueKey)` |
| `useApplyTransition` | `issueTransitions(issueKey)` |
| `useUpdateTestStep` | `testDetail(testKey)` |
| `useAddTestStep` | `testDetail(testKey)` |
| `useRemoveTestStep` | `testDetail(testKey)` |
| `useSetVersionProperty` | `versionProperty(verId, key)` |
| `useSetProjectProperty` | `projectProperty(pk, key)` |

### Debounce Pattern (for test-run mutations)

`debouncedInvalidateTestRuns` in `helpers.ts` coalesces multiple invalidation calls within 500ms
into a single `invalidateQueries`. This prevents thundering herd during bulk operations (e.g.,
50 status changes each calling onSettled). Keyed by `executionIssueId`.

Also invalidates `execSummary(execId)` and `execSummaryBatch` alongside `testRuns`.

`debouncedInvalidateStepResults` does the same for iteration step results, keyed by `testRunId`.

### Optimistic Update Helper

`mapRunsAcrossPages(old, mapper)` traverses all pages of `InfiniteData<TestRunsPage>` and applies
a mapper function to every `TestRun`. Used by all test-run mutations in `onMutate`.

---

## Zustand State Stores

| Store | File | Key State |
|---|---|---|
| `useProjectStore` | `projectStore.ts` | `activeContentProject`, `activeExecutionProject` (JiraProject), setters. Persisted: `qality-active-project` |
| `useUiStore` | `uiStore.ts` | `toasts`, `addToast`, `removeToast`, `rateLimitUntil`, `setRateLimit`, `theme` (light/dark), `toggleTheme`. Partially persisted (theme). Also exports `parseRateLimitError` |
| `useVersionsStore` | `versionsStore.ts` | `favourites`, `executionFavourites`, `selectedVersionId`, `healthDots`, `qaApprovedVersions`, `comparisonVersionId`, `versionGroups`. Persisted: `qality-version-favourites` |
| `useCoveragePresetsStore` | `coveragePresetsStore.ts` | `presets` (CoveragePreset[]), `savePreset`, `deletePreset`, `renamePreset`. Persisted: `qality-coverage-presets` |
| `useCoverageHistoryStore` | `coverageHistoryStore.ts` | `history` (map), `recordSnapshot` (throttled 1h min interval, max 90 per view). Persisted: `qality-coverage-history` |
| `useHealthStore` | `healthStore.ts` | `healthMap`, `loading`, `progress`, `startHealthFetch` (background streaming). In-memory only |
| `useCommentTemplatesStore` | `commentTemplatesStore.ts` | `recentByProject` (deduplicated, max 10/project). Persisted: `qality-comment-templates` |
| `useConfluenceStore` | `confluenceStore.ts` | `versionPageMap`. Persisted: `qality-confluence-store` |
| `useExecutionResumeStore` | `executionResumeStore.ts` | `lastRunByExecution`. Persisted: `qality-execution-resume` |
| `useUserRoleStore` | `userRoleStore.ts` | `userRole` (QA/Product/Developer/Design), `getAllowedRoutes`, `getDefaultRoute`. Persisted: `qality-user-role` |

---

## `src/hooks/`

| File | Export | Purpose |
|---|---|---|
| `useProjectKey.ts` | `useExecutionProjectKey`, `useContentProjectKey` | Convenience wrappers returning effective project keys from projectStore |
| `useDragAndDrop.ts` | `useDragAndDrop`, `DragState` | Custom mouse-based DnD engine. HTML5 DnD is BROKEN in Tauri's macOS WKWebView — always use this hook. Returns `{ drag, ghostRef, hoveredTargetId, startDrag }`. Ghost element updated via direct DOM manipulation (not React state) for 60fps. |

---

## `src/constants/`

| File | Exports |
|---|---|
| `statuses.ts` | `STATUS_PASS`, `STATUS_FAIL`, `STATUS_TODO`, `STATUS_EXECUTING`, `STATUS_BLOCKED`, `STATUS_ABORTED`, `STATUS_NA`, `PASS_STATUSES`, `FAIL_STATUSES`, `TODO_STATUSES`, `EXECUTING_STATUSES` (Sets), `normalizeStatusKey` (fn), `CRITICAL_PRIORITIES` (Set) |
| `statuses.test.ts` | Vitest tests for status normalization |

---

## `src/types/index.ts` — Key Type Interfaces

~48 interfaces. Most important:
- `AppConfig` — Jira URL/email/token + Xray client ID/secret
- `TestExecution` — `issue_id, project_id, jira: { key, summary, status, assignee, fix_versions }`
- `TestRun` — Full run with id, status, test, steps, comment, results, defects, iterations, evidence
- `TestRunStep` — Manual step with id, status, action, data, result, actual_result, comment
- `TestRunIteration` — Dataset iteration with rank, parameters, status, step_results
- `XrayTest` — Test issue: `issue_id, test_type, jira: { key, summary, status, priority, components }`
- `XrayTestWithStatus` — Test + `latest_status` for coverage
- `XrayTestSet` — Test set: `issue_id, jira: { key, summary, status }`
- `TestPlan` — Test plan: `issue_id, project_id, jira: { key, summary, status }`
- `JiraBug` — Bug/Story/Task with fields, priority, assignee, issue_links
- `JiraIssueDetail` — Full issue with description_blocks, attachments, comments
- `TestRunsPage` — `{ total, start, limit, results: TestRun[] }`
- `XrayTestRunStatus` — Status enum: name, color, is_final
- `XrayStepStatus` — Step status enum: name, color, description

---

## File Inventory — Rust Backend `src-tauri/src/`

### Entry Points
| File | Purpose |
|---|---|
| `main.rs` | Binary entry point (calls `lib::run()`) |
| `lib.rs` | Module wiring + Tauri builder + `invoke_handler!` macro registering ALL commands |
| `state.rs` | `XrayClientState(Arc<Mutex<Option<XrayClient>>>)`, `ApiUsageState` |

### `api/` — HTTP client implementations
| File | Key struct |
|---|---|
| `common.rs` | `validate_project_key`, `validate_issue_key`, `escape_jql_string`, `check_rate_limit` |
| `jira_client.rs` | `JiraClient` — all Jira REST API methods (Basic auth: email + API token) |
| `xray_client.rs` | `XrayClient` — all Xray GraphQL methods (OAuth2 Bearer) |
| `confluence_client.rs` | `ConfluenceClient` — Confluence REST API methods |

### `commands/` — Tauri command handlers
| File | Handlers |
|---|---|
| `config.rs` | `get_config`, `save_config_cmd`, `clear_config` — AES-256-GCM encrypt/decrypt |
| `jira.rs` | 31 Jira REST command handlers |
| `xray.rs` / directory — `xray/{mod, tests, sets, plans, executions, runs, statuses, health}.rs` | 37 Xray GraphQL command handlers |
| `confluence.rs` | 10 Confluence REST command handlers |
| `usage.rs` | `get_api_usage` |
| `utils.rs` | `write_text_file` |

### `models/` — Serde structs
| File | Key structs |
|---|---|
| `config.rs` | `AppConfig`, `EncryptedConfig` |
| `jira.rs` | `JiraProject`, `JiraVersion`, `JiraBug`, `JiraIssueDetail`, `JiraUser`, etc. |
| `xray/` — shared, test, test_set, test_plan, test_execution, test_run, test_health | `XrayTest`, `XrayTestSet`, `TestPlan`, `TestExecution`, `TestRun`, `TestRunStep`, etc. |
| `confluence.rs` | `ConfluenceSpace`, `ConfluencePage`, etc. |

---

## Key Design Patterns & Architecture Decisions

### 1. Custom Drag-and-Drop
HTML5 DnD API does NOT work in Tauri's macOS WKWebView. Use `useDragAndDrop` hook from
`src/hooks/useDragAndDrop.ts`. Ghost elements updated via direct DOM manipulation on `mousemove`
for 60fps performance (not React state).

### 2. Streaming Test Lists
`useGetTests` in `xray-queries.ts` uses background Tauri events (`tests:page`) to progressively
load test pages. `useIsTestsStreaming` guards while pages arrive. `useReloadTests` resets and
re-streams. Health data uses similar pattern via `tests:health:batch` events.

### 3. Optimistic Mutations for Test Runs
All 6 test-run mutations in `xray-mutations/test-runs.ts` use `onMutate` to patch the
`InfiniteData<TestRunsPage>` cache instantly, roll back on error, and debounce (500ms)
invalidation on settle. This keeps the UI snappy even on slow connections.

### 4. Two Project Keys
`executionProjectKey` (where executions live) vs `contentProjectKey` (where tests/test-sets/
test-plans live). Pages use `useExecutionProjectKey()` or `useContentProjectKey()` from
`src/hooks/useProjectKey.ts`. Both are set independently via `ProjectSelector` in the header.

### 5. Rate Limiting
Xray returns 429 → Rust `check_rate_limit` → frontend `parseRateLimitError` → `uiStore.setRateLimit`
→ `RateLimitBanner` shows countdown. Mutations debounce `invalidateQueries` via 500ms coalescing.

### 6. AES-256-GCM Credential Encryption
Random 32-byte key at `key.bin`. Config encrypted to `config.enc`. Plaintext only in memory
after decryption. Key file never checked into git (.gitignore).

### 7. Virtualised Lists
`TestExecutionDetail` and `TestsPanel` use `@tanstack/react-virtual` (`useVirtualizer`) to
render only visible rows. All large data tables should use this pattern.

### 8. Lazy-Loaded Pages
All 7 pages in `App.tsx` use `React.lazy()` + `<Suspense>`. Each page's JS is code-split and
only loaded on first navigation.

### 9. Confluence Page Update with 409 Retry
`useUpdateConfluencePage` handles version conflicts by re-fetching the current page version
when a 409 Conflict is detected, then retrying the update.

### 10. Custom `jira` Field Deserializer
Xray GraphQL returns the `jira` field as a JSON-encoded STRING (not a nested object). Custom
`deserialize_jira_json` in `src-tauri/src/models/xray/shared.rs` handles this.

---

## Known Gotchas

1. **No direct HTTP from frontend.** All API calls go through Rust backend via `invoke()`.

2. **Xray GraphQL query names** use a `get` prefix and do NOT accept `projectKey` — use `jql` filter:
   `jql: "project = 'KEY'"`.

3. **Xray `jira` field is a JSON-encoded string** — not a nested object. Deserialized via custom
   `deserialize_jira_json` in `src-tauri/src/models/xray/`.

4. **Xray `remove` mutations return a scalar `String`**, not an object. Do NOT select subfields on
   `removeTestsFromTestSet` or `removeTestsFromTestPlan` — causes 400 Bad Request.

5. **Tauri `invoke` rejects with a plain string**, not an `Error` object. `error instanceof Error`
   is always `false`. Use `String(error)` to get the message.

6. **New Tauri commands** must be added to 4 places: Rust handler, `invoke_handler!` in `lib.rs`,
   typed wrapper in `tauri.ts`, and TanStack Query hook.

7. **Rust error formatting** — use `format!("{e:#}")` (not `.to_string()`) in command handlers
   to get the full anyhow error chain in the frontend.

8. **HTML5 DnD is broken in Tauri macOS WKWebView** — always use `useDragAndDrop` hook.

9. **Two project keys** — `executionProjectKey` vs `contentProjectKey`. Use the right one for
   each page/query.

10. **`src/services/queries/` is the barrel** for all TanStack Query hooks. New hooks go into
    the appropriate submodule (`jira.ts`, `xray-queries.ts`, `xray-mutations/{file}.ts`).

11. **`@/` path alias** maps to `src/` (configured in both `tsconfig.json` and `vite.config.ts`).

12. **Xray `remove` mutations return a scalar String**, not an object. Do not select subfields.

13. **TestExecutionDetail receives execution as a prop** from `TestExecutionsPage` which stores it
    as React state. After mutations (status/assignee/version), the page uses `useEffect` to re-derive
    `selected` from the live query data so the detail view stays current.

14. **Optimistic updates for Jira-level mutations** (status/assignee/version) were added via
    `onMutate`/`onError`/`onSettled` pattern. They patch the `testExecutions` array cache.
    Callers must pass optional `toStatusName`, `displayName`, `versionName` fields.

15. **Never use `unwrap()` in Rust non-test code** — use `?` or `context()`.

16. **React components are named exports** (no `export default`).

17. **Import grouping:** React → third-party → `@/` aliases → relative. Blank line between groups.

---

## Conventions

### TypeScript
- **Indentation:** 2 spaces
- **Max line length:** 100 characters
- **Quotes:** double (`"`), **Semicolons:** required, **Trailing commas:** required
- Prefer `interface` over `type` for object shapes. No `any` — proper types.
- Use `type` imports: `import type { Foo } from "./types"`
- Components are arrow functions, named exports. One component per file.
- Strict TypeScript: `strict: true`, `noUnusedLocals`, `noUnusedParameters`, `exactOptionalPropertyTypes`

### Rust
- **Indentation:** 4 spaces, **Max line width:** 100 characters, **Edition:** 2021
- Public functions must have doc comments. Use `anyhow::Result` in library code.
- Tauri command handlers convert errors: `.map_err(|e| format!("{e:#}"))`

### Naming
| Construct | Convention | Example |
|---|---|---|
| TS variables/functions | camelCase | `testRunId`, `getTestExecutions()` |
| React components | PascalCase | `TestExecutionDetail` |
| TS interfaces | PascalCase | `TestRun` |
| TS constants | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT` |
| TS files (src) | PascalCase | `TestExecutionDetail.tsx` |
| TS service files | camelCase | `tauri.ts`, `queryKeys.ts` |
| Rust modules | snake_case | `xray_client.rs` |
| Rust structs | PascalCase | `TestRunStatus` |
| Rust functions/Tauri commands | snake_case | `update_test_run_status` |

### Git
- Branch: `feature/<desc>`, `fix/<desc>`, `chore/<desc>`
- Commits: Conventional Commits (`feat(xray): ...`, `fix(config): ...`), subject ≤ 72 chars

---

## Commands

### Development
```bash
npm run dev          # Open Tauri window with HMR
npm run vite:dev     # Frontend-only dev server (no Tauri)
npm run build        # Production build (platform installer)
npm run vite:build   # Frontend-only production build
```

### Testing
```bash
npm test                           # All frontend tests (Vitest)
npm run test:file <file>           # Single test file
npm run test:watch                 # Watch mode
npm run test:coverage              # Coverage report
cd src-tauri && cargo test         # All Rust tests
cd src-tauri && cargo test <name>  # Single Rust test
```

### Lint & Format
```bash
npm run lint          # ESLint on src/**/*.{ts,tsx}
npm run lint:fix      # ESLint auto-fix
npm run format        # Prettier write
npm run format:check  # Prettier check
npm run typecheck     # tsc --noEmit
npm run check         # typecheck + lint + format:check (all 3)
cd src-tauri && cargo clippy -- -D warnings  # Rust linter (zero warnings required)
cd src-tauri && cargo fmt                    # Rust formatter
```

### Task Completion Checklist

After any TypeScript change, run: `npm run check && npm test`

After any Rust change, run: `cd src-tauri && cargo build && cargo clippy -- -D warnings && cargo fmt && cargo test`

---

## Agent Instructions

### When adding a new feature:
1. **If it needs new API data:** Add Tauri command → Rust handler → `tauri.ts` wrapper → TanStack Query hook
2. **New page:** Create file in `src/pages/`, add route in `src/App.tsx`, add nav link in `AppShell.tsx`
3. **New component:** Create in appropriate `src/components/<feature>/` directory. Named export, one per file.
4. **New mutation:** Add to `src/services/queries/{jira|confluence}.ts` or `xray-mutations/{file}.ts`.
   Consider optimistic updates if the change should be instant in the UI.
5. **New query key:** Add to `queryKeys` object in `queryKeys.ts`.
6. **New store:** Add to `src/stores/`, consider localStorage persistence.

### When modifying existing code:
- Check `useExecutionProjectKey()` vs `useContentProjectKey()` — use the right one
- For lists in the coverage/execution pages, check if optimistic updates exist
- For test-run mutations, use `mapRunsAcrossPages` helper and `debouncedInvalidateTestRuns`
- Never call `fetch` or Jira/Xray URLs from TypeScript
- Never use HTML5 drag-and-drop — use `useDragAndDrop` hook
- Tauri `invoke` errors are plain strings — use `String(error)`, not `error instanceof Error`
- Xray remove mutations return scalars — don't select subfields in GraphQL
