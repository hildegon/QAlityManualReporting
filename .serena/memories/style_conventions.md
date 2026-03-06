# Code Style & Conventions

## TypeScript / React
- 2 spaces indentation, max 100 chars, double quotes, semicolons required, trailing commas
- `interface` over `type` for object shapes; no `any`
- Use `type` imports: `import type { Foo } from "./types"`
- Components: arrow functions, named exports, one per file, PascalCase filename
- Import order: React → third-party → @/ alias → relative

## Rust
- 4 spaces (rustfmt), max 100 chars
- All public functions must have doc comments
- `anyhow::Result` in library code; `String` errors only in Tauri command handlers
- Never `unwrap()` in non-test code — use `?` or `context()`

## Error Handling
- TS: Never swallow errors. Tauri invoke rejects with plain string. Use `String(error)` not `error instanceof Error`
- Rust: Use `?` with `context()`. Command handlers: `.map_err(|e| format!("{e:#}"))` for full chain

## Git
- Branches: feature/, fix/, chore/
- Commits: Conventional Commits (feat, fix, chore, docs, test, refactor, perf, ci)
