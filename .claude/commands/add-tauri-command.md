Guide me through adding a new Tauri command end-to-end. I will describe what the command should do, and you will implement all four required changes.

## The 4-File Checklist

Every new command requires changes in exactly these four places:

### Step 1 — Rust command handler
**File:** `src-tauri/src/commands/xray.rs` (for Xray) or `src-tauri/src/commands/jira.rs` (for Jira)

Pattern:
```rust
/// Brief description of what this command does.
#[tauri::command]
pub async fn my_command_name(
    app: AppHandle,
    state: State<'_, XrayClientState>,  // only for Xray commands
    param_one: String,
    param_two: Option<String>,
) -> Result<ReturnType, String> {
    let client = get_xray_client(&app, &state).await.map_err(|e| format!("{e:#}"))?;
    client
        .my_api_method(param_one, param_two)
        .await
        .map_err(|e| format!("{e:#}"))
}
```

Key rules:
- Return type is always `Result<T, String>` for Tauri commands
- Use `format!("{e:#}")` — NOT `.to_string()` — to get the full anyhow error chain
- Jira commands call `make_jira_client(&app)` instead of `get_xray_client`

### Step 2 — Register in invoke_handler
**File:** `src-tauri/src/lib.rs`

Add `my_command_name` to the `invoke_handler!` macro:
```rust
invoke_handler!(tauri::generate_handler![
    // ... existing commands ...
    commands::xray::my_command_name,
])
```

Forgetting this causes a runtime panic when the frontend calls the command.

### Step 3 — TypeScript invoke wrapper
**File:** `src/services/tauri.ts`

```typescript
/** JSDoc: what this does, what params mean. */
export const myCommandName = (paramOne: string, paramTwo?: string): Promise<ReturnType> =>
  invoke("my_command_name", { paramOne, paramTwo });
```

Rules:
- Export name is camelCase; Tauri command name is snake_case
- Return type must match the Rust return type (T from `Result<T, String>`)
- All params passed as an object `{ paramOne, paramTwo }`

### Step 4 — TanStack Query hook
**File:** `src/services/queries/` (appropriate submodule)

For a read (query):
```typescript
export function useMyCommandName(paramOne: string) {
  return useQuery<ReturnType>({
    queryKey: queryKeys.myKey(paramOne),
    queryFn: () => api.myCommandName(paramOne),
    enabled: !!paramOne,
  });
}
```

For a write (mutation):
```typescript
export function useMyCommandName() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ paramOne, paramTwo }: { paramOne: string; paramTwo?: string }) =>
      api.myCommandName(paramOne, paramTwo),
    onSuccess: (_, { paramOne }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.myKey(paramOne) });
    },
  });
}
```

Also add the query key to the `queryKeys` object if it's a new resource.

## Verification

After implementing all four steps:
```bash
npm run typecheck          # TypeScript must compile cleanly
cd src-tauri && cargo build  # Rust must compile cleanly
cd src-tauri && cargo clippy -- -D warnings  # No new Clippy warnings
```

## Now — describe the command you want to add

Tell me: what data does it fetch or what action does it perform? I'll implement all four changes.
