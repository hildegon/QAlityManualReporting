# Key Discoveries

1. **Xray Cloud GraphQL API uses `get` prefix on query names** AND does NOT accept `projectKey` as a parameter. Must use `getTestPlans`, `getTestExecutions`, `getTestRuns`. These queries accept `jql`, `issueIds`, `projectId`, `limit`, `start`, `modifiedSince` — use `jql: "project = 'KEY'"` to filter by project key.

2. **The `jira` field in Xray GraphQL responses is a JSON-encoded string**, not a nested object. Fixed with custom `deserialize_jira_json` deserializer.

3. **Tauri `invoke` rejects with a plain string, not an Error object** — `error instanceof Error` is always false. Use `String(error)`.

4. **tauri.conf.json had circular loop** — `beforeDevCommand` was `"npm run dev"` which calls `tauri dev`. Fixed to `"npm run vite:dev"`.

5. **Error propagation** — `.map_err(|e| e.to_string())` only shows outermost message. Use `format!("{e:#}")` for full chain.

6. **Mutation names may also need verification** — `updateTestRunStatus` and `createTestExecution` need checking against actual Xray schema.

7. **Rate limit optimization (completed):**
   - `useTestSetMembership` N+1 fixed via `get_all_test_set_memberships` Rust batch command.
   - `useVersionRunStats` staleTime increased from 30s → 5min.
   - `useTestRuns` staleTime increased from 30s → 2min.
   - Global `invalidateQueries()` in App.tsx now scoped to error-state queries only.
   - All mutation `onSettled` invalidations debounced (500ms coalescing window).