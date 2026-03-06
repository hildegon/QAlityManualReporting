# Task Completion Checklist

After editing TypeScript:
1. `npm run typecheck`
2. `npm test`

After editing Rust:
1. `cd src-tauri && cargo build`
2. `cd src-tauri && cargo clippy -- -D warnings`

Before committing:
1. `npm run check` (typecheck + lint + format check)
2. `cd src-tauri && cargo fmt`
3. `cd src-tauri && cargo clippy -- -D warnings`

New Tauri commands must be registered in `src-tauri/src/lib.rs` invoke_handler!
New frontend data calls go in `src/services/tauri.ts` + `src/services/queries.ts`
