# QAlity Manual Reporting — Claude Code Context

Cross-platform desktop app (Tauri 2) for reading Jira/Xray Cloud test data and writing results back — no web server required.

**Full guidelines:** `AGENTS.md`

---

## Build Verification 
When generating code changes, always verify compilation/build succeeds before presenting the solution. For TypeScript, run `npx tsc --noEmit`. For Rust, run `cargo check`. For Java/Kotlin Android, run `./gradlew assembleDebug` or the relevant build task.

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
| `src-tauri/src/commands/xray.rs` | All Xray Tauri command handlers |
| `src-tauri/src/commands/jira.rs` | All Jira Tauri command handlers |
| `src-tauri/src/api/xray_client.rs` | XrayClient HTTP methods (GraphQL) |
| `src-tauri/src/api/jira_client.rs` | JiraClient HTTP methods (REST) |
| `src-tauri/src/models/xray.rs` | Serde structs for Xray API responses |

---

## Adding a New Tauri Command (4-file checklist)

1. **`src-tauri/src/commands/xray.rs`** (or `jira.rs`) — write the `#[tauri::command]` handler
2. **`src-tauri/src/lib.rs`** — add the function to `invoke_handler!`
3. **`src/services/tauri.ts`** — add a typed `invoke(...)` wrapper function
4. **`src/services/queries/`** — add a `useQuery` / `useMutation` hook in the appropriate submodule (`jira.ts`, `xray-queries.ts`, or `xray-mutations.ts`)

All four must be updated or the command is inaccessible from the UI.

---

## Critical Gotchas

1. **Tauri `invoke` rejects with a plain `string`** — not an Error object. Always `String(error)`, never `error.message`.

2. **Xray `jira` field is a JSON-encoded string** — not a nested object. Deserialized via custom `deserialize_jira_json` in `src-tauri/src/models/xray.rs`. Never try to parse it as nested JSON directly in GraphQL.

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
