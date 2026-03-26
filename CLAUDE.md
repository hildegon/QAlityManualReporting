# QAlity Manual Reporting — Claude Code Context

Cross-platform desktop app (Tauri 2) for reading Jira/Xray Cloud test data and writing results back — no web server required.

**Full guidelines:** `AGENTS.md`

---

## Build Verification
When generating code changes, always verify compilation/build succeeds before presenting the solution. For TypeScript, run `npx tsc --noEmit`. For Rust, run `cargo check`. For Java/Kotlin Android, run `./gradlew assembleDebug` or the relevant build task.

## Unit Tests

Run the full test suite after any significant change to business logic, utilities, models, or data transformations:

```bash
npm test              # TypeScript/React — Vitest (67 tests)
cd src-tauri && cargo test   # Rust backend — 30 tests
```

**When to run tests:**
- After modifying any utility function in `src/components/*/utils.ts`, `src/constants/`, or `src/components/charts/`
- After changing serde structs in `src-tauri/src/models/xray/`
- After editing `src-tauri/src/api/common.rs` (validation, escaping, truncation, rate-limit parsing)
- After any refactor that touches multiple files
- Before committing a feature or bug fix

**Where tests live:**
| File | What it covers |
|---|---|
| `src/components/charts/status-utils.test.ts` | `findSlice`, `buildSlicesFromCounts`, `buildSlicesFromTests` |
| `src/constants/statuses.test.ts` | `normalizeStatusKey`, status sets, `CRITICAL_PRIORITIES` |
| `src/components/tests/utils.test.ts` | `isDeprecatingStatus`, `categoryColor`, `loadHiddenKeys`, `saveHiddenKeys` |
| `src/components/coverage/utils.test.ts` | `passRate`, `hasFail` |
| `src/components/create-test/types.test.ts` | `newDraftStep`, ID uniqueness |
| `src/services/queries.test.ts` | Tauri invoke wrappers (mocked) |
| `src-tauri/src/api/common.rs` (inline) | `validate_project_key`, `escape_jql_string`, `truncate_body`, `rate_limit_until_ms` |
| `src-tauri/src/models/xray/mod.rs` (inline) | `deserialize_jira_json`, serde round-trips for xray model structs |

## Architecture

```
React 19 + TanStack Query
  → src/services/queries/      (all hooks, barrel re-export)
  → src/services/tauri.ts     (all invoke() wrappers)
  → Rust Tauri IPC
  → HTTP: Jira REST API v3 / Xray Cloud GraphQL
```

**State layers:**
- Server state: TanStack Query (cached, persisted to localStorage)
- UI state: Zustand stores in `src/stores/`
- Credentials: AES-256-GCM encrypted, stored at OS app-config dir

This project uses a Tauri stack: Rust backend + TypeScript/React frontend. When making changes, check both sides compile. GraphQL schema changes must be validated against both backend resolvers and frontend queries.

---

## Behavioral Rules 
When the user asks to fix something, do NOT refactor or make new changes — apply the minimal targeted fix first. Ask before taking a different approach than what was requested.

## Key Files

| File | Role |
|---|---|
| `src/services/tauri.ts` | Every `invoke()` call — never call `invoke` from components |
| `src/services/queries/` | Every TanStack Query hook and mutation (barrel: `jira.ts`, `xray-queries.ts`, `xray-mutations.ts`, …) |
| `src/types/index.ts` | All shared TypeScript interfaces |
| `src-tauri/src/lib.rs` | `invoke_handler!` — register new commands here |
| `src-tauri/src/commands/xray/` | Xray Tauri command handlers (submodules: executions, plans, runs, sets, tests, health, statuses) |
| `src-tauri/src/commands/jira.rs` | All Jira Tauri command handlers |
| `src-tauri/src/api/xray_client/` | XrayClient HTTP methods (submodules: executions, mutations, runs, sets, tests, health, statuses, test_plans) |
| `src-tauri/src/api/jira_client/` | JiraClient HTTP methods (submodules: auth, issues, links, projects, transitions, versions, attachments) |
| `src-tauri/src/models/xray/` | Serde structs for Xray API responses (submodules: shared, test, test_run, test_set, test_plan, test_execution, test_health) |

---

## Adding a New Tauri Command (4-file checklist)

1. **`src-tauri/src/commands/xray/<submodule>.rs`** (or `jira.rs`) — write the `#[tauri::command]` handler and re-export it in `xray/mod.rs`
2. **`src-tauri/src/lib.rs`** — add the function to `invoke_handler!`
3. **`src/services/tauri.ts`** — add a typed `invoke(...)` wrapper function
4. **`src/services/queries/`** — add a `useQuery` / `useMutation` hook in the appropriate submodule (`jira.ts`, `xray-queries.ts`, or `xray-mutations.ts`)

All four must be updated or the command is inaccessible from the UI.

---

## Critical Gotchas

1. **Tauri `invoke` rejects with a plain `string`** — not an Error object. Always `String(error)`, never `error.message`.

2. **Xray `jira` field is a JSON-encoded string** — not a nested object. Deserialized via custom `deserialize_jira_json` in `src-tauri/src/models/xray/mod.rs`. Never try to parse it as nested JSON directly in GraphQL.

3. **HTML5 drag-and-drop is broken in macOS WKWebView** — always use the custom `useDragAndDrop` hook. Never use `draggable` / `ondragstart`.

4. **Two project keys exist** — `executionProjectKey` (where executions live) vs `contentProjectKey` (tests/test-sets/plans). Each has its own hook: `useExecutionProjectKey()` / `useContentProjectKey()`.

5. **Xray `remove` mutations return a scalar `String`** — do NOT select subfields on `removeTestsFromTestSet` / `removeTestsFromTestPlan`.

6. **Rust errors** — use `format!("{e:#}")` (not `.to_string()`) in command handlers to get the full anyhow error chain.

7. **New commands** need to be in `invoke_handler!` in `lib.rs` — easy to forget, causes runtime panic.

---

## Commands

```bash
npm run dev          # Tauri dev window with HMR
npm run check        # typecheck + lint + format check
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint
npm test             # Vitest
npm run build        # Production build

cd src-tauri && cargo build
cd src-tauri && cargo clippy -- -D warnings
cd src-tauri && cargo test
cd src-tauri && cargo fmt
```

---

## Domain Model Summary

| Entity | Where stored | Key identifiers |
|---|---|---|
| `XrayTest` | Xray | `issue_id`, `jira.key` |
| `XrayTestSet` | Xray | `issue_id`, `jira.key` |
| `TestPlan` | Xray | `issue_id`, `jira.key` |
| `TestExecution` | Xray | `issue_id`, `jira.key` |
| `TestRun` | Xray (inside execution) | `id`, `test.issue_id` |
| `JiraVersion` | Jira | `id`, `name` |
| `JiraBug` | Jira | `id`, `key` |
| `JiraProject` | Jira | `id`, `key` |
