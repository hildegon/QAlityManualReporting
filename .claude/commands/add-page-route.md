# Add a New Page / Route

Step-by-step recipe for adding a new page to the QAlity app.
Describe the page purpose and I will create all required files.

---

## Step 1 — Create the page component

**File:** `src/pages/<PageName>Page.tsx`

```tsx
import { useExecutionProjectKey } from "@/hooks/useProjectKey";
// or useContentProjectKey — pick based on which project key this page needs

export const <PageName>Page = () => {
  const projectKey = useExecutionProjectKey(); // or useContentProjectKey()
  // ... page content
};
```

**Rules:**
- One page per file, PascalCase filename matching export name
- Arrow function, named export (never `export default`)
- Use `useExecutionProjectKey()` if page deals with executions; `useContentProjectKey()` for tests/test-sets/plans
- Page should early-return a prompt if no project key is selected

---

## Step 2 — Add the route

**File:** `src/App.tsx`

Find the `<Routes>` block and add a new `<Route>`:

```tsx
<Route path="/<route-slug>" element={<PageNamePage />} />
```

Add the import at the top of App.tsx with the other page imports.

---

## Step 3 — Add nav entry

**File:** `src/components/common/AppShell.tsx`

Find the `navItems` array and add an entry:

```tsx
{ to: "/<route-slug>", icon: SomeIcon, label: "Page Label" },
```

Import the icon from `lucide-react`.

---

## Step 4 — Create component directory (if page will have extracted components)

**Directory:** `src/components/<feature>/`

Create a directory matching the feature name (lowercase, kebab-case or single word).
Add a `utils.ts` for shared helpers if multiple components will need them.

---

## Step 5 — Wire up data (if page fetches data)

Follow this order:

1. **Rust API method** — Add to `src-tauri/src/api/xray_client.rs` or `jira_client.rs`
2. **Rust model** — Add response struct to `src-tauri/src/models/xray.rs` or `jira.rs`
3. **Rust command** — Add `#[tauri::command]` handler to `src-tauri/src/commands/xray.rs` or `jira.rs`
4. **Register command** — Add to `invoke_handler!` in `src-tauri/src/lib.rs`
5. **Tauri wrapper** — Add typed function to `src/services/tauri.ts`
6. **Query key** — Add to `queryKeys` in `src/services/queries/queryKeys.ts`
7. **Query hook** — Add to appropriate submodule:
   - Jira reads/writes → `src/services/queries/jira.ts`
   - Xray reads → `src/services/queries/xray-queries.ts`
   - Xray writes → `src/services/queries/xray-mutations.ts`
8. **Re-export** — The barrel `src/services/queries/index.ts` must re-export the new hook
9. **TypeScript types** — Add interfaces to `src/types/index.ts` in the appropriate section

---

## Step 6 — Add Zustand store (if page needs local UI state)

**File:** `src/stores/<storeName>Store.ts`

```tsx
import { create } from "zustand";
import { persist } from "zustand/middleware"; // only if state should survive reload

interface StoreNameState {
  // state + actions
}

export const useStoreNameStore = create<StoreNameState>()(
  persist(
    (set, get) => ({
      // ...
    }),
    { name: "store-name-storage" }
  )
);
```

---

## Verification checklist

```bash
npm run typecheck   # No TS errors
npm run lint        # No new lint errors
npm test            # All tests pass
```

Navigate to the route in the dev app to verify rendering.

---

## Reference: Existing routes

| Route | Page | Project key |
|---|---|---|
| `/executions` | TestExecutionsPage | executionProjectKey |
| `/test-plans` | TestPlansPage | contentProjectKey |
| `/tests` | TestsPage | contentProjectKey |
| `/coverage` | CoveragePage | contentProjectKey |
| `/versions` | VersionsPage | executionProjectKey |
| `/create-test` | CreateTestPage | contentProjectKey |
| `/settings` | SettingsPage | — |
