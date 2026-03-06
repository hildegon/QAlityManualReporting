# Commands

## Development
- `npm run dev` — Dev mode (opens Tauri window with HMR)
- `npm run vite:dev` — Frontend-only dev server (no Tauri, useful for UI work)
- `npm run build` — Production build

## Testing
- `npm test` — Run all frontend tests (Vitest)
- `npm run test:file <path>` — Run a single test file
- `npm run test:watch` — Watch mode
- `npm run test:coverage` — Coverage report
- `cd src-tauri && cargo test` — Run all Rust unit tests

## Lint & Format
- `npm run lint` — TypeScript lint
- `npm run lint:fix` — Auto-fix lint issues
- `npm run format` — Format with Prettier
- `npm run format:check` — Check formatting
- `npm run typecheck` — TypeScript type check
- `npm run check` — All checks (typecheck + lint + format)
- `cd src-tauri && cargo clippy -- -D warnings` — Rust linter (must pass with zero warnings)
- `cd src-tauri && cargo fmt` — Rust formatter

## System (macOS/Darwin)
- `git`, `ls`, `grep`, `find` — standard unix utils
