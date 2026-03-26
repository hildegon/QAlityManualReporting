# QAlity Manual Reporting — Developer Documentation

> Cross-platform desktop app for reading Jira/Xray Cloud test data, marking test runs, and
> writing results back to Xray — without a web server.

---

## Table of Contents

1. [Project Purpose](#1-project-purpose)
2. [Tech Stack](#2-tech-stack)
3. [Repository Structure](#3-repository-structure)
4. [Architecture and Data Flow](#4-architecture-and-data-flow)
5. [Configuration System](#5-configuration-system)
6. [Rust Backend Deep-Dive](#6-rust-backend-deep-dive)
7. [Frontend Deep-Dive](#7-frontend-deep-dive)
8. [Tauri Command Reference](#8-tauri-command-reference)
9. [Xray Cloud API Integration](#9-xray-cloud-api-integration)
10. [Jira REST API Integration](#10-jira-rest-api-integration)
11. [State Management](#11-state-management)
12. [Testing](#12-testing)
13. [Known Limitations and Gotchas](#13-known-limitations-and-gotchas)
14. [How to Add a New Feature](#14-how-to-add-a-new-feature)
15. [Running, Building, and Testing](#15-running-building-and-testing)

---

## 1. Project Purpose

QAlity Manual Reporting is a **Tauri 2** desktop application. It runs entirely locally — there is
no server, no hosted backend, no database. The app:

- Reads **Test Plans**, **Test Sets**, and **Tests** from Xray Cloud via GraphQL
- Lists **Test Executions** for a project
- Opens an execution and lets a tester mark each **Test Run** as PASS / FAIL / BLOCKED / etc.
- Allows editing per-run and per-step **comments** and **actual results**
- Creates new **Test Executions** (with optional test plan association and test selection)
- Stores credentials encrypted on disk; no credentials are ever transmitted except to
  Atlassian/Xray endpoints

---

## 2. Tech Stack

| Layer | Technology | Version | Reason |
|---|---|---|---|
| Desktop shell | Tauri | 2 | Rust-native OS webview; tiny bundle, no Electron overhead |
| Frontend language | TypeScript | 5.x | Type safety across the whole UI |
| Frontend framework | React | 19 | Component model; concurrent features |
| Build tool | Vite | 6.x | Fast HMR; Tauri-compatible dev server |
| CSS | Tailwind CSS | v4 | Utility-first; zero runtime |
| UI primitives | Radix UI | — | Accessible headless components (Select, Dialog) |
| Server state | TanStack Query | v5 | Caching, pagination, optimistic mutations |
| UI state | Zustand | 5.x | Minimal global state (active project, toasts) |
| Virtualised lists | TanStack Virtual | v3 | Render only visible rows in large test-run tables |
| Icons | Lucide React | — | Consistent icon set |
| Routing | React Router | v7 | Hash-based client routing inside the WebView |
| Rust async | Tokio | 1 | Async runtime for reqwest |
| HTTP | reqwest | 0.12 | Rust HTTP client; rustls-tls, no OpenSSL dependency |
| Encryption | aes-gcm | 0.10 | AES-256-GCM credential encryption at rest |
| Error handling | anyhow | 1 | Propagation with context; `{e:#}` full cause chains |
| Package manager | npm | — | Standard JS package management |

---

## 3. Repository Structure

```
.
├── src/                            # React + TypeScript frontend
│   ├── App.tsx                     # Root: QueryClient, HashRouter, routes
│   ├── main.tsx                    # React entry point (ReactDOM.createRoot)
│   ├── index.css                   # Tailwind entry + global CSS resets
│   ├── types/
│   │   └── index.ts                # All shared TypeScript interfaces
│   ├── services/
│   │   ├── tauri.ts                # Typed invoke() wrappers for every Tauri command
│   │   ├── queries.ts              # All TanStack Query hooks + mutations
│   │   └── queries.test.ts         # Vitest unit tests (11 tests)
│   ├── hooks/
│   │   └── useProjectKey.ts        # useContentProjectKey / useExecutionProjectKey
│   ├── stores/
│   │   ├── projectStore.ts         # Zustand: activeProject (persisted)
│   │   └── uiStore.ts              # Zustand: toast notifications
│   ├── pages/
│   │   ├── SettingsPage.tsx        # Config form (Jira + Xray credentials, project keys)
│   │   ├── TestExecutionsPage.tsx  # Execution list + CreateExecutionDialog
│   │   ├── TestPlansPage.tsx       # Accordion list; lazy-loads tests per plan
│   │   └── TestSetsPage.tsx        # Accordion list; lazy-loads tests per set
│   ├── components/
│   │   ├── ui/                     # Base UI primitives (Button, Badge, Input, Spinner, …)
│   │   ├── common/
│   │   │   ├── AppShell.tsx        # Top nav bar, project label/selector, <Outlet />
│   │   │   ├── ProjectSelector.tsx # Radix Select populated from Jira project list
│   │   │   └── ErrorBoundary.tsx   # React error boundary
│   │   ├── test-execution/
│   │   │   └── TestExecutionDetail.tsx  # Full execution detail: virtualised runs + steps
│   │   ├── test-plan/              # (Reserved for future plan-specific components)
│   │   └── settings/               # (Reserved for future settings sub-components)
│   └── test/
│       └── setup.ts                # Vitest global setup (mocks Tauri invoke)
│
├── src-tauri/                      # Rust / Tauri backend
│   ├── src/
│   │   ├── main.rs                 # Binary entry point (calls lib::run())
│   │   ├── lib.rs                  # Module wiring + Tauri builder + invoke_handler!
│   │   ├── commands/
│   │   │   ├── config.rs           # AES-256-GCM encrypt/decrypt; get/save/clear config
│   │   │   ├── jira.rs             # get_jira_projects, validate_jira_credentials
│   │   │   └── xray.rs             # All 15 Xray Tauri command handlers
│   │   ├── api/
│   │   │   ├── jira_client.rs      # JiraClient: Basic auth, paginated projects, validate
│   │   │   └── xray_client.rs      # XrayClient: OAuth2 token cache, graphql<T>(), all queries
│   │   └── models/
│   │       ├── config.rs           # AppConfig, EncryptedConfig structs
│   │       ├── jira.rs             # Jira REST response structs
│   │       └── xray.rs             # Xray GraphQL request/response structs
│   ├── Cargo.toml                  # Rust dependencies
│   └── rustfmt.toml                # Rust formatting config (4 spaces, 100 chars)
│
├── vite.config.ts                  # Vite + Tailwind + Vitest config
├── tsconfig.json                   # TypeScript config (exactOptionalPropertyTypes: true)
├── eslint.config.js                # ESLint flat config
├── .prettierrc                     # Prettier config
├── AGENTS.md                       # Instructions for AI coding agents
└── DOCUMENTATION.md                # This file
```

---

## 4. Architecture and Data Flow

### Overview

```
┌──────────────────────────────────────────────────────────┐
│  React UI (WebView)                                      │
│                                                          │
│  Page Component                                          │
│      │ renders                                           │
│  TanStack Query hook   ←── cache / optimistic update     │
│      │ calls                                             │
│  src/services/tauri.ts  (typed invoke wrappers)          │
│      │ Tauri IPC                                         │
└──────────────────────┬───────────────────────────────────┘
                       │ invoke("command_name", { ...args })
┌──────────────────────▼───────────────────────────────────┐
│  Rust (Tauri commands)                                   │
│                                                          │
│  src-tauri/src/commands/*.rs                             │
│      │ builds client from config                         │
│  src-tauri/src/api/{jira,xray}_client.rs                 │
│      │ HTTPS                                             │
└──────────────────────┬───────────────────────────────────┘
                       │
          ┌────────────┴────────────┐
          ▼                         ▼
  Jira REST API              Xray Cloud GraphQL API
  /rest/api/3/...            /api/v2/graphql
```

### Key rules

1. **All API calls go through Rust.** TypeScript never calls `fetch()` or any external URL.
2. **Tauri IPC** is the only bridge. Each call maps to exactly one `#[tauri::command]` function.
3. **TanStack Query** owns the client-side cache. Components only read from the cache; they never
   manage loading flags manually.
4. **Optimistic mutations** update the cache immediately and roll back on error.
5. **Config is decrypted in memory** on each Rust command invocation; the plaintext `AppConfig`
   is never written to disk unencrypted.

### Request lifecycle (example: update a test run status)

```
1. User clicks "PASS" button in TestExecutionDetail
2. handleStatusChange() calls updateStatus.mutate({ testRunId, status, executionIssueId })
3. useUpdateTestRunStatus onMutate():
     - Cancels in-flight queries for this execution
     - Snapshots the current cache
     - Applies the new status to every matching run in the cache (optimistic)
4. mutationFn calls api.updateTestRunStatus(testRunId, status)
     → invoke("update_test_run_status", { testRunId, status })
5. Rust update_test_run_status command:
     - Loads and decrypts config
     - Creates XrayClient
     - Calls xray_client.update_test_run_status(id, UpdateTestRunStatusInput { status })
     - XrayClient sends GraphQL mutation to Xray Cloud
6. On success: onSettled() invalidates the test-runs cache → refetch confirms server state
7. On error: onError() restores the snapshot (rollback)
```

---

## 5. Configuration System

### Storage

Credentials are stored at the OS application config directory:

| OS | Path |
|---|---|
| macOS | `~/Library/Application Support/qality/config.enc` |
| Linux | `~/.config/qality/config.enc` |
| Windows | `%APPDATA%\qality\config.enc` |

An AES-256-GCM key is generated on first run and stored as `key.bin` in the same directory.
The key never leaves the machine. The encrypted file is JSON: `{ "nonce": "<base64>", "ciphertext": "<base64>" }`.

### AppConfig fields

| Field | Type | Purpose |
|---|---|---|
| `jira_url` | `String` | Base URL, e.g. `https://myorg.atlassian.net` |
| `jira_email` | `String` | Atlassian account email (Basic auth username) |
| `jira_api_token` | `String` | Jira API token (from id.atlassian.com) |
| `xray_client_id` | `String` | Xray Cloud OAuth2 Client ID |
| `xray_client_secret` | `String` | Xray Cloud OAuth2 Client Secret |
| `content_project_key` | `String` | Project for Test Plans, Test Sets, Tests |
| `execution_project_key` | `String` | Project for Test Executions (falls back to `content_project_key` if empty) |

Both project key fields have `#[serde(default)]` so existing configs without them deserialize cleanly.

### Dual project keys

The app supports organisations where test content (Plans, Sets, Tests) lives in a different Jira
project than test execution. The frontend resolves the effective key via:

```typescript
// src/hooks/useProjectKey.ts
useContentProjectKey()   // Plans, Sets, Tests
useExecutionProjectKey() // Executions — falls back to content key if execution key is empty
```

Priority for content key: `activeProject.key > config.content_project_key > null`
Priority for execution key: `config.execution_project_key > activeProject.key > config.content_project_key > null`

### Encryption implementation

`src-tauri/src/commands/config.rs`:
- `get_or_create_key()` — reads `key.bin` or generates 32 random bytes with `OsRng`
- `save_config()` — serializes `AppConfig` to JSON, encrypts with `Aes256Gcm`, base64-encodes both
  nonce and ciphertext, writes JSON to `config.enc`
- `load_config()` — reverse of the above; returns `AppConfig::default()` if file does not exist

---

## 6. Rust Backend Deep-Dive

### `src-tauri/src/main.rs`

Minimal binary entry point. Delegates to `lib::run()`.

### `src-tauri/src/lib.rs`

Wires all modules and registers every command with `invoke_handler!`. If you add a new Tauri
command, **you must add it here** or it will not be callable from TypeScript.

### `src-tauri/src/models/`

Plain Rust data structs used for serialization/deserialization.

#### `config.rs`

- `AppConfig` — the plaintext configuration. All fields public; derives `Default`.
- `EncryptedConfig` — `{ nonce: String, ciphertext: String }` as stored on disk.
- `is_jira_configured()` / `is_xray_configured()` — guard methods used by command handlers to
  fail fast with a helpful error instead of an HTTP 401.

#### `jira.rs`

Serde structs mirroring Jira REST API responses:
- `JiraProject`, `AvatarUrls`, `JiraProjectsResponse` — project list pagination
- `JiraIssue`, `JiraIssueFields`, `JiraStatus`, `JiraStatusCategory` — issue detail
- `JiraUser`, `JiraPriority`, `JiraIssueType` — issue sub-fields

All camelCase JSON fields are renamed with `#[serde(rename(deserialize = "camelCase"))]`.

#### `xray.rs`

The most complex model file. Key patterns:

**`deserialize_jira_json` custom deserializer** — Xray's GraphQL API returns the `jira` field as
a JSON-encoded *string* (not a nested object). This deserializer handles both forms:

```rust
fn deserialize_jira_json<'de, T, D>(deserializer: D) -> Result<T, D::Error> {
    let value = serde_json::Value::deserialize(deserializer)?;
    match value {
        serde_json::Value::String(s) => serde_json::from_str(&s)...,
        other => serde_json::from_value(other)...,
    }
}
```

Applied to every struct that has a `jira` field (`TestPlan`, `TestExecution`, `TestRun`,
`XrayTest`, `XrayTestSet`, `CreatedTestExecution`).

**Naming convention**: Xray responses use camelCase (`issueId`, `projectId`, `startedOn`).
Rust structs use snake_case. Handled with `#[serde(rename(deserialize = "camelCase"))]`.
When serialized *back* to the frontend, fields are already snake_case so no rename is needed
for serialization.

**Key structs:**

| Struct | Purpose |
|---|---|
| `TestPlan` / `TestPlanJira` | List of test plans from `getTestPlans` |
| `TestExecution` / `TestExecutionJira` | List of test executions from `getTestExecutions` |
| `TestRun` / `TestRunStatus` / `TestRunStep` | Individual test run with steps |
| `XrayTest` | A single test (used in lists, sets, plans) |
| `XrayTestSet` | A single test set |
| `CreateTestExecutionResponse` / `CreateTestExecutionResult` / `CreatedTestExecution` | Mutation result wrapper chain |
| `TestPlansResult`, `TestExecutionsResult`, `TestRunsResult`, `TestsResult`, `TestSetsResult` | Top-level GraphQL response wrappers (field name matches the GraphQL query name) |
| `TestSetResult` / `TestSetDetail` / `TestSetTestsPage` | Singular test set detail |
| `TestPlanResult` / `TestPlanDetail` / `TestPlanTestsPage` | Singular test plan detail |
| `GraphQLRequest` / `GraphQLResponse<T>` / `GraphQLError` | Generic GraphQL envelope |
| `XrayTestRunStatus` / `XrayStepStatus` | Status metadata from `getStatuses` / `getStepStatuses` |

### `src-tauri/src/api/xray_client.rs`

`XrayClient` — the core HTTP client for Xray Cloud.

**Constants:**
```
XRAY_AUTH_URL   = "https://xray.cloud.getxray.app/api/v2/authenticate"
XRAY_GRAPHQL_URL = "https://xray.cloud.getxray.app/api/v2/graphql"
```

**Token caching:**
```rust
pub struct XrayClient {
    client: Client,
    client_id: String,
    client_secret: String,
    token: Arc<Mutex<Option<String>>>,  // shared, lazily populated
}
```

`authenticate()` POSTs `{ client_id, client_secret }` to the auth URL. Xray returns the token as
a quoted JSON string — the response is trimmed and unquoted before storing.

`get_token()` returns the cached token or calls `authenticate()` if it is missing.

**`graphql<T>()`** — generic method for all Xray operations:
1. Sends a `POST` with `Authorization: Bearer <token>` and the JSON body
2. On `401`, clears the cached token and retries once (automatic re-authentication)
3. On success, parses the response as `GraphQLResponse<serde_json::Value>` first (to surface
   `errors` before attempting typed deserialization)
4. Deserializes `data` into `T` — the caller provides the correct response wrapper type

**Methods:** `authenticate`, `get_test_plans`, `get_test_executions`, `get_test_runs`,
`update_test_run_status`, `get_tests`, `get_test_sets`, `get_test_set_tests`,
`get_test_plan_tests`, `create_test_execution`, `add_test_executions_to_test_plan`,
`get_statuses`, `update_test_run_comment`, `get_step_statuses`, `update_test_run_step`,
`update_test_run_step_status`

**`create_test_execution()` special case:** The `jira` argument to the GraphQL mutation is a
JSON object with a `fields` key. The `project` value can be either `{ "key": "PROJ" }` or
`{ "id": "10428" }` — the code detects numeric-only strings and uses the `id` form:

```rust
let project_value = if pk.chars().all(|c| c.is_ascii_digit()) {
    serde_json::json!({ "id": pk })
} else {
    serde_json::json!({ "key": pk })
};
```

### `src-tauri/src/api/jira_client.rs`

`JiraClient` — HTTP client for Jira REST API v3.

Uses HTTP Basic auth: `base64(email:api_token)` in the `Authorization` header.

**Methods:**
- `get_projects()` — paginates `/rest/api/3/project/search` (50 per page), collects all results
- `get_project(key)` — single project by key via `/rest/api/3/project/{key}`
- `get_issue(key)` — single issue via `/rest/api/3/issue/{key}?fields=...`
- `validate_credentials()` — `GET /rest/api/3/myself`, returns `displayName`

### `src-tauri/src/commands/xray.rs`

Each function is a `#[tauri::command]`. The pattern is always:

```rust
#[tauri::command]
pub async fn my_command(app: AppHandle, arg: String) -> Result<ReturnType, String> {
    let client = make_xray_client(&app)?;
    client.some_method(&arg).await.map_err(format_err)
}
```

`make_xray_client()` — loads config, checks `is_xray_configured()`, constructs `XrayClient`.
`format_err()` — converts `anyhow::Error` to `String` using `format!("{e:#}")` (full chain).

`create_test_execution` is slightly more complex: after creating the execution, if `test_plan_id`
is provided, it calls `add_test_executions_to_test_plan` to link them.

### `src-tauri/src/commands/jira.rs`

Same pattern as xray.rs but uses `make_jira_client()` and `JiraClient`.

### `src-tauri/src/commands/config.rs`

Three commands: `get_config`, `save_config_cmd`, `clear_config`.
All synchronous filesystem operations wrapped in `async` for Tauri compatibility.
`clear_config` deletes `config.enc` but leaves `key.bin` intact.

---

## 7. Frontend Deep-Dive

### `src/main.tsx`

Standard React 19 entry point. Mounts `<App />` into `#root`.

### `src/App.tsx`

- Creates a singleton `QueryClient` with `retry: 1` and `refetchOnWindowFocus: false`
- Wraps everything in `<QueryClientProvider>`, `<ErrorBoundary>`, `<HashRouter>`
- Defines routes using `<AppShell>` as the layout outlet:

| Path | Component |
|---|---|
| `/` | Redirect → `/executions` |
| `/executions` | `TestExecutionsPage` |
| `/test-plans` | `TestPlansPage` |
| `/test-sets` | `TestSetsPage` |
| `/settings` | `SettingsPage` |

**Why HashRouter?** Tauri's WebView serves the app from a custom protocol URL. Hash-based routing
avoids issues with path resolution in this environment.

### `src/types/index.ts`

All TypeScript interfaces used across the app. Groups:
- `AppConfig` — mirrors `models/config.rs::AppConfig`
- `JiraProject` — mirrors `models/jira.rs::JiraProject`
- `TestPlan`, `TestExecution`, `TestRun`, `TestRunStatus`, `TestRunStep`, `StepStatus` — Xray run data
- `XrayTestRunStatus`, `XrayStepStatus` — status metadata
- `CreateTestExecutionResult` — mutation response
- `XrayTest`, `XrayTestSet` — content items
- `TestRunsPage` — paginated response
- `TestStatusName`, `SelectOption` — UI helpers

### `src/services/tauri.ts`

One typed wrapper per Tauri command. Example:

```typescript
export const updateTestRunStatus = (testRunId: string, status: string): Promise<void> =>
  invoke("update_test_run_status", { testRunId, status });
```

The argument object keys must **exactly match** the Rust command's parameter names (Tauri
converts them automatically via camelCase → snake_case, but keeping them consistent avoids
confusion).

> **Important:** `invoke()` rejects with a plain `string` (not an `Error` object). Use
> `String(error)` instead of `error.message` when catching errors from Tauri commands.

### `src/services/queries/` (barrel)

TanStack Query hooks, split by domain into submodules. Import via `@/services/queries`.
Submodules: `queryKeys.ts`, `config.ts`, `jira.ts`, `xray-queries.ts`, `xray-mutations.ts`, `version-stats.ts`.

**Query hooks (read):**

| Hook | Query key | Backend call | Stale time |
|---|---|---|---|
| `useConfig()` | `["config"]` | `getConfig` | `Infinity` |
| `useJiraProjects()` | `["jira","projects"]` | `getJiraProjects` | 5 min |
| `useTestPlans(key)` | `["xray","test-plans",key]` | `getTestPlans` | 2 min |
| `useTestExecutions(key)` | `["xray","test-executions",key]` | `getTestExecutions` | 1 min |
| `useTestRuns(id)` | `["xray","test-runs",id]` | `getTestRuns` (infinite) | 30 s |
| `useXrayStatuses(id)` | `["xray","statuses",id]` | `getXrayStatuses` | 10 min |
| `useStepStatuses(id)` | `["xray","step-statuses",id]` | `getStepStatuses` | 10 min |
| `useGetTests(key)` | `["xray","tests",key]` | `getTests` | 5 min |
| `useGetTestSets(key)` | `["xray","test-sets",key]` | `getTestSets` | 5 min |
| `useGetTestSetTests(id)` | `["xray","test-set-tests",id]` | `getTestSetTests` | 5 min |
| `useGetTestPlanTests(id)` | `["xray","test-plan-tests",id]` | `getTestPlanTests` | 5 min |

`useTestRuns` is an **infinite query** with `pageSize = 50`, using the Xray `start` offset for
pagination. The next-page param is computed from `start + fetched < total`.

**Mutation hooks (write):**

| Hook | Optimistic? | Invalidates |
|---|---|---|
| `useSaveConfig()` | No (sets cache directly on success) | — |
| `useUpdateTestRunStatus()` | Yes | `testRuns(executionId)` |
| `useUpdateTestRunComment()` | Yes | `testRuns(executionId)` |
| `useUpdateTestRunStepStatus()` | Yes | `testRuns(executionId)` |
| `useUpdateTestRunStep()` | Yes | `testRuns(executionId)` |
| `useCreateTestExecution()` | No | `testExecutions(projectKey)` |

**Optimistic mutation pattern** (`mapRunsAcrossPages` helper):
```typescript
// Applies a mapper function to every TestRun across all infinite pages
function mapRunsAcrossPages(old, mapper) {
  return { ...old, pages: old.pages.map(page => ({ ...page, results: page.results.map(mapper) })) };
}
```

### `src/hooks/useProjectKey.ts`

Three hooks, one file:
- `useContentProjectKey()` — for Test Plans, Test Sets, Tests
- `useExecutionProjectKey()` — for Test Executions
- `useProjectKey()` — deprecated alias for `useContentProjectKey()`

Priority logic is described in [Section 5](#5-configuration-system).

### `src/stores/projectStore.ts`

Zustand store with `persist` middleware (key: `"qality-active-project"`). Stores the selected
`JiraProject | null`. Used by `ProjectSelector` (to set) and `useContentProjectKey` (to read).

### `src/stores/uiStore.ts`

Zustand store for toast notifications. Stores an array of `{ id, message, type }`. Not persisted.
`addToast(message, type?)` / `removeToast(id)`.

### Pages

#### `SettingsPage`

- Loads config with `useConfig()`, populates a controlled form
- Two credential sections: **Jira Cloud** and **Xray Cloud**
- Each section has a "Test connection" button that saves the form first, then calls the
  validation command (`validateJiraCredentials` / `authenticateXray`)
- "Save settings" calls `useSaveConfig()` and invalidates all `["xray"]` queries so data
  reloads with the new project key
- **Project key fields:** "Content Project Key" (Plans, Sets, Tests) and "Execution Project Key"
  (Executions — leave blank to reuse the content key)

#### `TestExecutionsPage`

- Uses `useExecutionProjectKey()` and `useTestExecutions()`
- **Filter:** text search on key/summary
- **Show done toggle:** hides executions whose Jira status is in `DONE_STATUSES`
  (`done`, `won't do`, `wont do`, `closed`, `resolved`). Shows a count badge of hidden items.
- Clicking a row sets `selected` state → renders `TestExecutionDetail` (replaces the list)
- **CreateExecutionDialog:** a Radix `Dialog.Root` with a scrollable form body:
  - Summary (required), Description (optional)
  - Test Plan dropdown (loaded with `useTestPlans(contentProjectKey)`)
  - Test Sets filterable list with per-row "Add" button (fetches tests via `api.getTestSetTests()` and adds their IDs to selection)
  - Individual Tests multi-select with search filter
  - Uses `useContentProjectKey()` for loading Plans/Sets/Tests, `executionProjectKey` for creating

#### `TestPlansPage`

- Uses `useContentProjectKey()` and `useTestPlans()`
- Accordion: one row per plan; click expands `TestPlanPanel`
- `TestPlanPanel` calls `useGetTestPlanTests(plan.issue_id)` (lazy — only when expanded)
- Status badge shown in the row header using `statusVariant(name)` from the Badge component
- Inline filter for tests within the expanded panel

#### `TestSetsPage`

- Same structure as `TestPlansPage` but for test sets
- Uses `useGetTestSets()` / `useGetTestSetTests()`
- No status badge (test sets don't have a meaningful workflow status)
- Inline filter for tests within the expanded panel

### Key Components

#### `AppShell` (`src/components/common/AppShell.tsx`)

Top-level layout with a fixed header and scrollable `<main>`. The header contains:
- Brand label "QAlity"
- Either `<ProjectSelector>` (if Jira is configured) or a plain text label showing the project
  key(s). When both `content_project_key` and `execution_project_key` are set and different,
  shows `CONTENT / EXEC`
- Navigation links (Executions, Test Plans, Test Sets, Settings)

#### `ProjectSelector` (`src/components/common/ProjectSelector.tsx`)

Radix Select populated from `useJiraProjects()`. Selecting a project calls
`setActiveProject()` on `projectStore`, which overrides the config-based project key for content
queries.

#### `TestExecutionDetail` (`src/components/test-execution/TestExecutionDetail.tsx`)

The most complex component:
- Fetches test runs with `useTestRuns(execution.issue_id)` (infinite scroll)
- Fetches status metadata with `useXrayStatuses(execution.project_id)` and
  `useStepStatuses(execution.project_id)`
- Falls back to hardcoded statuses (`TODO`, `EXECUTING`, `PASS`, `FAIL`, `BLOCKED`) while
  metadata loads
- **Virtualised list** with `@tanstack/react-virtual`: renders only the visible rows
- Auto-loads the next page when the last visible row is within 5 rows of the end
- **Progress bar**: coloured segments for passed / executing / blocked / failed / todo
- **Bulk actions**: "Set all:" buttons apply a status to every run in the current page set
- Per-run: status quick-actions, comment icon (toggles inline editor)
- **StepsPanel**: per-run expandable panel showing each step with action, data, expected result,
  actual result (editable), comment (editable), and status buttons
- Keyboard navigation in `StepsPanel`: `↑`/`↓` or `j`/`k` moves focus between steps

---

## 8. Tauri Command Reference

All commands are registered in `src-tauri/src/lib.rs` `invoke_handler!`.

| Command (JS name) | Rust function | File | Parameters | Returns |
|---|---|---|---|---|
| `get_config` | `get_config` | `commands/config.rs` | — | `AppConfig` |
| `save_config_cmd` | `save_config_cmd` | `commands/config.rs` | `config: AppConfig` | `void` |
| `clear_config` | `clear_config` | `commands/config.rs` | — | `void` |
| `get_jira_projects` | `get_jira_projects` | `commands/jira.rs` | — | `JiraProject[]` |
| `validate_jira_credentials` | `validate_jira_credentials` | `commands/jira.rs` | — | `string` (displayName) |
| `authenticate_xray` | `authenticate_xray` | `commands/xray.rs` | — | `void` |
| `get_test_plans` | `get_test_plans` | `commands/xray.rs` | `projectKey: string`, `limit?: number` | `TestPlan[]` |
| `get_test_executions` | `get_test_executions` | `commands/xray.rs` | `projectKey: string`, `limit?: number` | `TestExecution[]` |
| `get_test_runs` | `get_test_runs` | `commands/xray.rs` | `testExecutionIssueId: string`, `limit?: number`, `start?: number` | `TestRunsPage` |
| `update_test_run_status` | `update_test_run_status` | `commands/xray.rs` | `testRunId: string`, `status: string` | `void` |
| `update_test_run_comment` | `update_test_run_comment` | `commands/xray.rs` | `testRunId: string`, `comment: string` | `void` |
| `get_xray_statuses` | `get_xray_statuses` | `commands/xray.rs` | `projectId?: string` | `XrayTestRunStatus[]` |
| `get_step_statuses` | `get_step_statuses` | `commands/xray.rs` | `projectId?: string` | `XrayStepStatus[]` |
| `update_test_run_step_status` | `update_test_run_step_status` | `commands/xray.rs` | `testRunId`, `stepId`, `status` | `void` |
| `update_test_run_step` | `update_test_run_step` | `commands/xray.rs` | `testRunId`, `stepId`, `comment?`, `actualResult?`, `status?` | `void` |
| `create_test_execution` | `create_test_execution` | `commands/xray.rs` | `projectKey`, `summary`, `testPlanId?`, `testIssueIds?`, `description?` | `CreateTestExecutionResult` |
| `get_tests` | `get_tests` | `commands/xray.rs` | `projectKey: string`, `limit?: number` | `XrayTest[]` |
| `get_test_sets` | `get_test_sets` | `commands/xray.rs` | `projectKey: string`, `limit?: number` | `XrayTestSet[]` |
| `get_test_set_tests` | `get_test_set_tests` | `commands/xray.rs` | `issueId: string` | `XrayTest[]` |
| `get_test_plan_tests` | `get_test_plan_tests` | `commands/xray.rs` | `issueId: string` | `XrayTest[]` |

**Default limits:** `get_test_plans` and `get_test_executions` default to `50`. `get_tests` and
`get_test_sets` default to `100`. `get_test_set_tests` and `get_test_plan_tests` hard-code `500`.

---

## 9. Xray Cloud API Integration

### Authentication

Xray Cloud uses **OAuth2 Client Credentials**:

```
POST https://xray.cloud.getxray.app/api/v2/authenticate
Content-Type: application/json

{ "client_id": "...", "client_secret": "..." }

Response: "<token>"   ← quoted JSON string, not a JSON object
```

The token is cached in `Arc<Mutex<Option<String>>>`. On any `401` response, the cache is cleared
and a single retry is made.

### GraphQL endpoint

```
POST https://xray.cloud.getxray.app/api/v2/graphql
Authorization: Bearer <token>
Content-Type: application/json

{ "query": "...", "variables": { ... } }
```

### The `jira` field quirk

Xray's GraphQL API returns the `jira` field (which contains Jira issue metadata) as a
**JSON-encoded string**, not a nested object:

```json
{ "issueId": "10001", "jira": "{\"key\":\"PROJ-1\",\"summary\":\"My test\"}" }
```

This is handled by the `deserialize_jira_json` custom deserializer in `models/xray.rs`.

### GraphQL queries used

**`getTestPlans`** — list of test plans by JQL
```graphql
query GetTestPlans($jql: String!, $limit: Int!) {
    getTestPlans(jql: $jql, limit: $limit) {
        total start limit
        results { issueId projectId jira(fields: ["key","summary","status","issuetype"]) }
    }
}
```

**`getTestExecutions`** — list of test executions by JQL
```graphql
query GetTestExecutions($jql: String!, $limit: Int!) {
    getTestExecutions(jql: $jql, limit: $limit) {
        total start limit
        results { issueId projectId jira(fields: ["key","summary","status","assignee"]) }
    }
}
```

**`getTestRuns`** — paginated test runs for an execution
```graphql
query GetTestRuns($issueId: String!, $limit: Int!, $start: Int) {
    getTestRuns(testExecIssueIds: [$issueId], limit: $limit, start: $start) {
        total start limit
        results {
            id status { name color description final } comment
            startedOn finishedOn assigneeId executedById
            test { issueId jira(fields: ["key","summary"]) }
            steps { id action data result actualResult comment defects
                    status { name color description } }
        }
    }
}
```

**`getTests`** — tests by JQL
```graphql
query GetTests($jql: String, $limit: Int!) {
    getTests(jql: $jql, limit: $limit) {
        total start limit
        results { issueId jira(fields: ["key","summary"]) }
    }
}
```

**`getTestSets`** — test sets by JQL (same structure as getTests)

**`getTestSet(issueId)`** — tests inside a specific test set
```graphql
query GetTestSet($issueId: String!, $limit: Int!) {
    getTestSet(issueId: $issueId) {
        issueId
        tests(limit: $limit) { results { issueId jira(fields: ["key","summary"]) } }
    }
}
```

**`getTestPlan(issueId)`** — tests inside a specific test plan (same structure as getTestSet)

**`getStatuses`** / **`getStepStatuses`** — project-specific status configurations

### GraphQL mutations used

**`updateTestRunStatus`**
```graphql
mutation UpdateTestRunStatus($id: String!, $status: String!) {
    updateTestRunStatus(id: $id, status: $status)
}
```

**`updateTestRun`** (for comments)
```graphql
mutation UpdateTestRun($id: String!, $comment: String) {
    updateTestRun(id: $id, comment: $comment) { warnings }
}
```

**`updateTestRunStep`** (full step update: comment, actualResult, status)
```graphql
mutation UpdateTestRunStep($testRunId: String!, $stepId: String!, $updateData: UpdateTestRunStepInput!) {
    updateTestRunStep(testRunId: $testRunId, stepId: $stepId, updateData: $updateData) { warnings }
}
```

**`updateTestRunStepStatus`** (step status only — simpler variant)

**`createTestExecution`**
```graphql
mutation CreateTestExecution($testIssueIds: [String], $jira: JSON!) {
    createTestExecution(testIssueIds: $testIssueIds, jira: $jira) {
        testExecution { issueId jira(fields: ["key","summary","status"]) }
        warnings
    }
}
```
The `jira` variable must be `{ "fields": { "summary": "...", "project": { "key": "PROJ" }, ... } }`.

**`addTestExecutionsToTestPlan`** — associates an execution with a test plan after creation

### Response wrapper pattern

The `graphql<T>()` method strips the outer `data` key. The type parameter `T` must be a struct
whose fields match the GraphQL query/mutation name:

```rust
// GraphQL returns: { "data": { "getTestPlans": { "total": ..., "results": [...] } } }
// graphql<T>() strips "data", so T must be:
struct TestPlansResult {
    #[serde(rename(deserialize = "getTestPlans"))]
    pub test_plans: TestPlansPage,
}
```

---

## 10. Jira REST API Integration

**Base URL:** configurable (e.g. `https://myorg.atlassian.net`)
**Auth:** `Authorization: Basic base64(email:api_token)`

| Endpoint | Method | Purpose |
|---|---|---|
| `/rest/api/3/project/search?startAt=N&maxResults=50&orderBy=name` | GET | Paginated project list |
| `/rest/api/3/project/{key}` | GET | Single project by key |
| `/rest/api/3/issue/{key}?fields=summary,status,...` | GET | Single issue detail |
| `/rest/api/3/myself` | GET | Validate credentials — returns `displayName` |

Jira credentials are **optional**. The app functions without them (using Xray-only mode) with
the following degradation:
- `ProjectSelector` is hidden (no project dropdown in the header)
- `get_jira_projects` returns an error; `useJiraProjects` enters error state
- The project key must be set manually in Settings

> **Note:** There is no Jira REST API call to update test execution workflow status. Test
> execution Jira status changes (e.g. moving from "In Progress" to "Done") are workflow
> transitions that require Jira REST API credentials. This is a known limitation.

---

## 11. State Management

### TanStack Query (server state)

The `QueryClient` is created once in `App.tsx` with:
- `retry: 1` — one automatic retry on failure
- `refetchOnWindowFocus: false` — avoids spamming the Xray API when switching windows

Query keys are centralized in `queryKeys` (exported from `queries.ts`) for consistent
invalidation. All keys are `as const` tuples.

### Zustand stores

**`projectStore`** — persisted to `localStorage` under `"qality-active-project"`:
```typescript
{ activeProject: JiraProject | null, setActiveProject: (p) => void }
```

**`uiStore`** — in-memory only:
```typescript
{ toasts: Toast[], addToast(msg, type?), removeToast(id) }
```

### Local component state

Pages and complex components use `useState` for purely local UI state (search filters, expanded
accordion rows, dialog open/close, comment editor values). None of this is persisted or shared.

---

## 12. Testing

### Frontend tests (`src/services/queries.test.ts`)

Run with **Vitest**. The test setup in `src/test/setup.ts` mocks `@tauri-apps/api/core`'s
`invoke` function so tests run in a Node environment without a real Tauri window.

11 tests cover the TanStack Query hooks:
- Config load, save
- Jira projects fetch
- Test plans / executions / runs fetch
- Optimistic status mutation (rollback on error)
- Optimistic comment mutation
- Optimistic step status mutation
- Create execution mutation

**Commands:**
```bash
npm test                              # run all
npm run test:file src/services/queries.test.ts  # single file
npm run test:watch                    # watch mode
npm run test:coverage                 # coverage report
```

### Rust tests

```bash
cd src-tauri && cargo test            # all unit tests
cd src-tauri && cargo test <pattern>  # tests matching pattern
```

### Type checking and linting

```bash
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint
npm run format:check # Prettier check
npm run check        # all three combined

cd src-tauri && cargo clippy -- -D warnings  # Rust linter (zero warnings required)
cd src-tauri && cargo fmt                    # Rust formatter
```

---

## 13. Known Limitations and Gotchas

1. **No test execution workflow status update.** Changing a Jira issue status (e.g. "In Progress"
   → "Done") requires Jira REST API credentials and is not implemented. The Xray test run status
   (PASS / FAIL / etc.) is separate from the Jira workflow status.

2. **Pagination limits.** `get_test_plans`, `get_test_executions`, `get_tests`, `get_test_sets`
   default to 50 or 100 items and do not auto-paginate. Very large projects may not show all items.
   The only fully-paginated query is `get_test_runs` (via infinite scroll).

3. **`project_key` may be a numeric ID.** Xray internally uses numeric project IDs (e.g. `"10428"`).
   The `create_test_execution` command detects all-digit values and passes `{ "id": "10428" }` to
   the Jira fields, while string keys use `{ "key": "PROJ" }`.

4. **Tauri `invoke` rejects with a `string`, not an `Error`.** `error instanceof Error` is always
   `false` in a `catch` block for Tauri invocations. Use `String(error)` to safely get the message.

5. **`exactOptionalPropertyTypes: true` in tsconfig.** When building objects with optional keys,
   use conditional spreading: `...(value ? { key: value } : {})` rather than `{ key: undefined }`.

6. **Token not persisted across app restarts.** The Xray Bearer token lives in memory only.
   The first Xray API call after launch will trigger authentication. This is intentional — tokens
   should not be written to disk.

7. **Xray `jira` field is a JSON string.** The Xray GraphQL API wraps Jira metadata as a
   JSON-encoded string, not a nested object. The `deserialize_jira_json` custom deserializer
   handles this transparently on the Rust side.

8. **`tauri.conf.json` `beforeDevCommand`** must be `"npm run vite:dev"` (not `"npm run dev"`).
   Using `"npm run dev"` causes an infinite loop because `npm run dev` calls `tauri dev` which
   then re-runs `beforeDevCommand`.

9. **Jira credentials are optional.** The app works with Xray credentials only. Jira credentials
   unlock the `ProjectSelector` dropdown but are not required to browse or update test data.

---

## 14. How to Add a New Feature

### Adding a new Xray GraphQL query

1. **Add the GraphQL query to `XrayClient`** (`src-tauri/src/api/xray_client.rs`):
   ```rust
   pub async fn get_something(&self, param: &str) -> Result<Vec<SomeType>> {
       let query = r#"query GetSomething($param: String!) { ... }"#;
       let result: SomethingResult = self.graphql(query, serde_json::json!({ "param": param })).await?;
       Ok(result.something.results)
   }
   ```

2. **Add response structs** (`src-tauri/src/models/xray.rs`):
   ```rust
   #[derive(Debug, Clone, Serialize, Deserialize)]
   pub struct SomethingResult {
       #[serde(rename(deserialize = "getSomething"))]
       pub something: SomethingPage,
   }
   // ...
   ```
   Use `#[serde(deserialize_with = "deserialize_jira_json")]` on any `jira` field.
   Use `#[serde(rename(deserialize = "camelCase"))]` for camelCase JSON fields.

3. **Add a Tauri command** (`src-tauri/src/commands/xray.rs`):
   ```rust
   #[tauri::command]
   pub async fn get_something(app: AppHandle, param: String) -> Result<Vec<SomeType>, String> {
       let client = make_xray_client(&app)?;
       client.get_something(&param).await.map_err(format_err)
   }
   ```

4. **Register the command** in `src-tauri/src/lib.rs` `invoke_handler!`.

5. **Add the TypeScript interface** to `src/types/index.ts`.

6. **Add the invoke wrapper** to `src/services/tauri.ts`:
   ```typescript
   export const getSomething = (param: string): Promise<SomeType[]> =>
     invoke("get_something", { param });
   ```

7. **Add the TanStack Query hook** to the appropriate submodule in `src/services/queries/`
   (`xray-queries.ts` for reads, `xray-mutations.ts` for writes, `jira.ts` for Jira):
   ```typescript
   export function useGetSomething(param: string | null) {
     return useQuery<SomeType[]>({
       queryKey: ["xray", "something", param ?? ""],
       queryFn: () => api.getSomething(param!),
       enabled: !!param,
       staleTime: 5 * 60 * 1_000,
     });
   }
   ```

8. **Use the hook in a page or component.**

9. **Verify:** `cargo build && cargo clippy -- -D warnings && npm run typecheck && npm test`

### Adding a new page/route

1. Create `src/pages/MyNewPage.tsx` (named export, PascalCase filename).
2. Add the route in `src/App.tsx`: `<Route path="/my-page" element={<MyNewPage />} />`.
3. Add a nav item to `navItems` in `src/components/common/AppShell.tsx`.

### Adding a new mutation with optimistic updates

Follow the pattern in `useUpdateTestRunStatus` in `queries.ts`:
1. `onMutate`: cancel queries, snapshot cache, apply optimistic update, return snapshot
2. `onError`: restore snapshot from context
3. `onSettled`: always invalidate to re-sync with server

---

## 15. Running, Building, and Testing

### Prerequisites

```bash
# Node.js 18+
node --version

# Rust toolchain (for building the Tauri backend)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"

# Install npm dependencies
npm install
```

### Development

```bash
# Full app (Tauri window with HMR)
npm run dev

# Frontend-only (no Tauri window — faster for UI-only work)
npm run vite:dev
```

### Production build

```bash
npm run build
# Outputs installer to: src-tauri/target/release/bundle/
```

### Tests

```bash
npm test                 # all frontend tests (Vitest)
npm run test:watch       # watch mode
npm run test:coverage    # coverage report

cd src-tauri && cargo test           # all Rust tests
cd src-tauri && cargo test <pattern> # single Rust test
```

### Lint and format

```bash
npm run check        # typecheck + lint + format check (all at once)
npm run lint:fix     # auto-fix TS lint
npm run format       # Prettier write

cd src-tauri && cargo clippy -- -D warnings  # must pass before committing
cd src-tauri && cargo fmt                    # Rust format
```

### Commit conventions

Branch naming: `feature/<desc>`, `fix/<desc>`, `chore/<desc>`

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):
```
feat(xray): add test plan filtering by status
fix(config): handle missing config dir on first launch
chore(deps): update reqwest to 0.13
```

Types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `perf`, `ci`
Subject line: ≤ 72 characters.
