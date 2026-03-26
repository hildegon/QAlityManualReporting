# Add or Extract a Component

Step-by-step recipe for extracting a component from a page, or adding a new component to an
existing feature. Describe the component and I will create the file in the right place.

---

## Step 1 — Decide where the file goes

Components are organized by feature domain:

| Feature | Directory | Example |
|---|---|---|
| Test Executions | `src/components/test-execution/` | `TestExecutionDetail.tsx` |
| Tests & Test Sets | `src/components/tests/` | `TestRow.tsx`, `TestsPanel.tsx` |
| Coverage | `src/components/coverage/` | `OverallDashboard.tsx`, `TestSetSection.tsx` |
| Versions | `src/components/versions/` | `BugsPanel.tsx`, `VersionCard.tsx` |
| Shared UI primitives | `src/components/ui/` | `Button.tsx`, `Badge.tsx` |
| Layout / app shell | `src/components/common/` | `AppShell.tsx`, `ModalShell.tsx` |
| Charts | `src/components/charts/` | `StatusCharts.tsx` |

**Naming:** PascalCase filename matching the primary export. One component per file.

---

## Step 2 — Identify the interface (props vs hooks)

### Pattern A — Data passed via props (preferred for leaf components)

```tsx
interface MyComponentProps {
  data: SomeType;
  onAction: (id: string) => void;
}

export const MyComponent = ({ data, onAction }: MyComponentProps) => {
  // render
};
```

Use this when the parent already has the data. Keeps the component pure and testable.

### Pattern B — Component owns its data (hooks inside)

```tsx
export const MyComponent = ({ projectKey }: { projectKey: string }) => {
  const { data, isLoading } = useGetTests(projectKey);
  // render
};
```

Use this when the component is a self-contained section of a page (e.g., `BugsPanel`,
`ExecutionListPanel`). Pass only the minimum context (project key, ID) as props.

### Rule of thumb
- **Leaf components** (rows, badges, tiles): props only, no hooks
- **Panel/section components**: own their query hooks, receive project key or ID via props
- **Page components**: orchestrate panels, own project key selection

---

## Step 3 — Extract from an existing page

When extracting code from a large page file:

1. **Identify the boundary** — find the JSX block + its local state/effects/handlers
2. **Move to new file** — cut the component function and its types
3. **Create a props interface** — for any values the component needs from the parent:
   - Data that comes from a query the parent owns → pass as prop
   - Data the component can fetch itself → move the hook into the component
   - Callbacks (e.g., `onDelete`, `onSelect`) → pass as prop
4. **Move local helpers** — if a helper function is only used by this component, move it too.
   If shared between components, put it in the feature's `utils.ts`.
5. **Import in the page** — replace the inline code with `<MyComponent ...props />`

### Shared utils file

Each feature directory has (or can have) a `utils.ts` for shared pure helpers:

```
src/components/tests/utils.ts      — ToastFn type, status helpers, localStorage wrappers
src/components/coverage/utils.ts   — SetQueryMap type, passRate, hasFail
src/components/versions/utils.ts   — priorityClass, statusCategoryClass, attachment helpers
```

---

## Step 4 — Performance: when to memo

Use `React.memo()` when:
- The component renders inside a **virtualised list** (`useVirtualizer` rows)
- The component receives **stable callbacks** (wrapped in `useCallback` by parent)
- The parent re-renders frequently but this component's props rarely change

**Do NOT memo by default.** Only add it when there's a measurable performance benefit.

Example (virtualised row):
```tsx
export const TestRow = memo(({ test, onSelect }: TestRowProps) => {
  // ...
});
TestRow.displayName = "TestRow";
```

---

## Step 5 — Drag and drop (if applicable)

**Never use HTML5 drag API** — it's broken in Tauri's macOS WKWebView.

Use the custom hook from `src/hooks/useDragAndDrop.ts`:
```tsx
import { useDragAndDrop } from "@/hooks/useDragAndDrop";

const { drag, startDrag, ghostRef } = useDragAndDrop();
```

The hook uses mouse events and direct DOM manipulation for the ghost element.

---

## Step 6 — Imports

Follow the project import order (blank line between groups):

```tsx
// 1. React
import { useState, useCallback, memo } from "react";

// 2. Third-party
import { useVirtualizer } from "@tanstack/react-virtual";

// 3. Internal absolute (@/ alias)
import type { XrayTest } from "@/types";
import { useGetTests } from "@/services/queries";
import { Badge } from "@/components/ui/badge";

// 4. Relative (sibling components, utils)
import { categoryColor } from "./utils";
```

Use `import type` for type-only imports.

---

## Verification checklist

```bash
npm run typecheck   # No TS errors
npm run lint        # No new lint errors
npm test            # All tests pass
```

Open the page in the dev app to verify the component renders correctly.
