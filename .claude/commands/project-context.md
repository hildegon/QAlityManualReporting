Output a structured summary of the QAlity Manual Reporting project for the current session. Include:

## 1. File Size Inventory

Run `wc -l src/pages/*.tsx src/services/queries/*.ts src/types/index.ts` and list the results so I know which files are large.

Also run `wc -l src-tauri/src/api/*.rs src-tauri/src/commands/*.rs src-tauri/src/models/*.rs` for the Rust side.

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
Rust command handler (src-tauri/src/commands/xray.rs or jira.rs)
  │  calls client method
  ▼
API client (src-tauri/src/api/xray_client.rs or jira_client.rs)
  │  HTTP
  ▼
Jira REST API v3 / Xray Cloud GraphQL
```

## 3. Query Key Namespace

Read the `queryKeys` object from `src/services/queries/queryKeys.ts` and list all keys grouped by domain (jira vs xray).

## 4. Store Inventory

List all Zustand stores in `src/stores/` with their responsibilities:
- `projectStore.ts` — active project keys (executionProjectKey, contentProjectKey)
- `uiStore.ts` — toast, rate limit, reload state
- `healthStore.ts` — test health data cache
- `versionsStore.ts` — version favourites, health dots, version groups
- `coverageHistoryStore.ts` — historical coverage snapshots
- `coveragePresetsStore.ts` — saved coverage preset configurations

## 5. Current Modified Files

Run `git status` to show what's currently changed.

## 6. Recent Commits

Run `git log --oneline -10` to show recent commit history for context.
