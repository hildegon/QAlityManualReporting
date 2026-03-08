# Key Discoveries

1. **Xray Cloud GraphQL API uses `get` prefix on query names** AND does NOT accept `projectKey` as a parameter. Must use `getTestPlans`, `getTestExecutions`, `getTestRuns`. These queries accept `jql`, `issueIds`, `projectId`, `limit`, `start`, `modifiedSince` — use `jql: "project = 'KEY'"` to filter by project key.

2. **The `jira` field in Xray GraphQL responses is a JSON-encoded string**, not a nested object. Fixed with custom `deserialize_jira_json` deserializer.

3. **Tauri `invoke` rejects with a plain string, not an Error object** — `error instanceof Error` is always false. Use `String(error)`.

4. **tauri.conf.json had circular loop** — `beforeDevCommand` was `"npm run dev"` which calls `tauri dev`. Fixed to `"npm run vite:dev"`.

5. **Error propagation** — `.map_err(|e| e.to_string())` only shows outermost message. Use `format!("{e:#}")` for full chain.

6. **Mutation names may also need verification** — `updateTestRunStatus` and `createTestExecution` need checking against actual Xray schema.

7. **Xray `remove` mutations return a scalar `String`, NOT an object.** `removeTestsFromTestSet` and `removeTestsFromTestPlan` both return `String`. Selecting subfields (e.g. `{ removedTests warning }`) causes a 400 Bad Request: `"Field must not have a selection since type String has no subfields"`. By contrast, `addTestsToTestSet` and `addTestsToTestPlan` DO return objects with `addedTests`/`warning` subfields.

8. **Two queries files must be kept in sync.** `src/services/queries.ts` (flat file) takes precedence over `src/services/queries/index.ts` (barrel) in TypeScript module resolution. Imports of `"@/services/queries"` resolve to the flat file, NOT the directory. New hooks must be added to `queries.ts` directly — AND also to `src/services/queries/xray.ts` (with re-export from `queries/index.ts`) to keep the modular tree consistent.

9. **HTML5 DnD does not work in Tauri's macOS WKWebView.** Use the custom mouse-based drag via `useDragAndDrop` hook instead.

10. **Rate limit optimization (completed):**
   - `useTestSetMembership` N+1 fixed via `get_all_test_set_memberships` Rust batch command.
   - `useVersionRunStats` staleTime increased from 30s → 5min.
   - `useTestRuns` staleTime increased from 30s → 2min.
   - Global `invalidateQueries()` in App.tsx now scoped to error-state queries only.
   - All mutation `onSettled` invalidations debounced (500ms coalescing window).