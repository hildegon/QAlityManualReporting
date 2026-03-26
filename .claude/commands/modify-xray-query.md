# Modify an Xray GraphQL Query

Step-by-step recipe for changing an Xray GraphQL query — adding fields, changing parameters,
or modifying the response shape. Describe the change and I will update all affected files.

---

## Overview

An Xray query touches up to 6 files across the stack. Changes must propagate through all layers
or the app will break at runtime with deserialization errors or type mismatches.

```
GraphQL string  (xray_client.rs)
  → Response struct  (models/xray.rs)
  → Command handler  (commands/xray.rs)
  → Tauri wrapper    (tauri.ts)
  → TypeScript type  (types/index.ts)
  → Query hook       (queries/xray-queries.ts or xray-mutations.ts)
```

---

## Step 1 — Find the GraphQL query string

**File:** `src-tauri/src/api/xray_client.rs`

Search for the method name (e.g., `get_test_runs`, `get_tests`). The GraphQL query is
an inline string literal inside the method body. Example:

```rust
pub async fn get_test_runs(&self, ...) -> Result<...> {
    let query = r#"
        query {
            getTestRuns(...) {
                results { ... }
            }
        }
    "#;
    // ...
}
```

**Edit the query string** to add/remove fields or change parameters.

### Gotchas
- Xray GraphQL query names use a `get` prefix (e.g., `getTestRuns`, `getTests`)
- Filter by project using `jql: "project = 'KEY'"` — Xray does NOT accept `projectKey` directly
- The `jira` field in Xray responses is a **JSON-encoded string**, not a nested object
- `remove*` mutations (e.g., `removeTestsFromTestSet`) return a scalar `String` — do NOT select subfields

---

## Step 2 — Update the Rust response model

**File:** `src-tauri/src/models/xray.rs`

Find or create the struct that maps to the GraphQL response shape. Add/remove fields to match.

```rust
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct TestRun {
    pub id: String,
    pub status: TestRunStatusRef,
    pub new_field: Option<String>,  // ← add new field
    // ...
}
```

**Rules:**
- Use `Option<T>` for nullable GraphQL fields
- The `jira` field uses `#[serde(deserialize_with = "deserialize_jira_json")]` — don't change this pattern
- Run `cargo build` after editing to catch deserialization issues early

---

## Step 3 — Update the command handler (if parameters changed)

**File:** `src-tauri/src/commands/xray.rs`

If you added/changed query **parameters** (not just response fields), update the command handler:

```rust
#[tauri::command]
pub async fn get_test_runs(
    state: State<'_, XrayClientState>,
    execution_issue_id: String,
    new_param: String,  // ← add new parameter
) -> Result<..., String> {
    // ...
    client.get_test_runs(&execution_issue_id, &new_param)
        .await
        .map_err(|e| format!("{e:#}"))
}
```

If the command is new, also register it in **`src-tauri/src/lib.rs`** `invoke_handler!`.

---

## Step 4 — Update the Tauri wrapper

**File:** `src/services/tauri.ts`

Update the typed wrapper to match the new Rust command signature:

```typescript
export const getTestRuns = (
  executionIssueId: string,
  newParam: string,  // ← add new parameter
  limit: number,
  start: number
) =>
  invoke<TestRunsPage>("get_test_runs", {
    executionIssueId,
    newParam,
    limit,
    start,
  });
```

**Rules:**
- Parameter names must match the Rust command's parameter names in camelCase
- Return type must match the Rust return type (mapped to the TS interface)

---

## Step 5 — Update the TypeScript type

**File:** `src/types/index.ts`

Add/modify the interface to match the new response shape:

```typescript
export interface TestRun {
  id: string;
  status: TestRunStatus;
  newField?: string;  // ← add new field (optional if nullable)
  // ...
}
```

Check the table of contents at the top of the file to find the right section.

---

## Step 6 — Update the query hook

**File:** `src/services/queries/xray-queries.ts` (for read queries)
**File:** `src/services/queries/xray-mutations.ts` (for mutations)

Update the hook to pass any new parameters and handle new response fields:

```typescript
export const useTestRuns = (executionIssueId: string, newParam: string) =>
  useInfiniteQuery({
    queryKey: queryKeys.testRuns(executionIssueId),
    queryFn: ({ pageParam = 0 }) =>
      getTestRuns(executionIssueId, newParam, TEST_RUNS_PAGE_SIZE, pageParam),
    // ...
  });
```

If you added a new query key pattern, add it to `src/services/queries/queryKeys.ts`:
```typescript
export const queryKeys = {
  // ...
  newKey: (id: string) => ["newKey", id] as const,
};
```

And re-export from `src/services/queries/index.ts` if it's a new hook.

---

## Verification checklist

```bash
# Rust side — must pass both
cd src-tauri && cargo build
cd src-tauri && cargo clippy -- -D warnings

# TypeScript side
npm run typecheck
npm run lint
npm test
```

### Common errors and fixes

| Error | Cause | Fix |
|---|---|---|
| `missing field 'x'` at runtime | Rust struct has required field but GraphQL doesn't return it | Make it `Option<T>` in the struct |
| `400 Bad Request` from Xray | Selecting subfields on a scalar return type | Check if mutation returns `String` (don't select subfields) |
| `invoke` rejects with string | Rust command returned an error | Check error with `String(error)`, not `error.message` |
| TypeScript type error | TS interface doesn't match the actual response | Ensure TS interface mirrors the Rust struct exactly |

---

## Reference: Key query locations

| Query type | Rust method file | Query hook file |
|---|---|---|
| Tests / Test Sets | `xray_client.rs` | `xray-queries.ts` |
| Test Runs / Steps | `xray_client.rs` | `xray-queries.ts` (read), `xray-mutations.ts` (write) |
| Test Plans | `xray_client.rs` | `xray-queries.ts` (read), `xray-mutations.ts` (write) |
| Test Executions | `xray_client.rs` | `xray-queries.ts` (read), `xray-mutations.ts` (write) |
| Jira Projects / Versions / Bugs | `jira_client.rs` | `jira.ts` |
| Config | — | `config.ts` |
| Version Stats | — | `version-stats.ts` |
