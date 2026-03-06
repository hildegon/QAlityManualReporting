# AGENTS.md — Coding Agent Guidelines

This file provides instructions for agentic coding tools (Claude Code, Cursor, Copilot, etc.)
operating in this repository. Keep it up to date as the project evolves.

---

## Project Overview

**Name:** QAlity Manual Reporting
**Purpose:** Cross-platform desktop app for reading Jira/Xray Cloud test data, marking test runs,
and writing results back to Xray — without a web server.

**Stack:**
- **Desktop shell:** Tauri 2 (Rust backend + OS native WebView)
- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS v4
- **UI primitives:** Radix UI + custom shadcn-style components
- **State:** Zustand (UI/project state) + TanStack Query v5 (server state, caching)
- **Performance:** TanStack Virtual (virtualised lists), optimistic mutations
- **Backend (Rust):** reqwest (HTTP), AES-256-GCM (credential encryption), Tokio (async)
- **Package manager:** npm

---

## Repository Structure

```
.
├── src/                            # React + TypeScript frontend
│   ├── components/
│   │   ├── ui/                     # Base UI primitives (Button, Badge, Input, …)
│   │   ├── common/                 # Layout: AppShell, ProjectSelector
│   │   ├── test-execution/         # TestExecutionDetail (virtualised test run table)
│   │   ├── test-plan/              # Test plan components
│   │   └── settings/               # Settings form components
│   ├── pages/                      # Route-level pages
│   ├── hooks/                      # Custom React hooks
│   ├── stores/                     # Zustand stores (projectStore, uiStore)
│   ├── services/
│   │   ├── tauri.ts                # Typed wrappers around Tauri invoke()
│   │   └── queries.ts              # TanStack Query hooks + mutations
│   ├── types/
│   │   └── index.ts                # Shared TypeScript interfaces
│   ├── test/
│   │   └── setup.ts                # Vitest global setup (mocks Tauri invoke)
│   ├── index.css                   # Tailwind entry + global resets
│   └── main.tsx                    # React entry point
├── src-tauri/                      # Rust / Tauri backend
│   ├── src/
│   │   ├── main.rs                 # Binary entry point
│   │   ├── lib.rs                  # Module wiring + Tauri builder
│   │   ├── commands/               # Tauri command handlers
│   │   │   ├── config.rs           # AES-256-GCM credential encryption
│   │   │   ├── jira.rs             # Jira REST API commands
│   │   │   └── xray.rs             # Xray Cloud GraphQL commands
│   │   ├── api/                    # Raw HTTP clients
│   │   │   ├── jira_client.rs
│   │   │   └── xray_client.rs
│   │   └── models/                 # Serde structs for API data
│   │       ├── config.rs
│   │       ├── jira.rs
│   │       └── xray.rs
│   ├── Cargo.toml
│   └── rustfmt.toml
├── vite.config.ts                  # Vite + Tailwind + Vitest config
├── tsconfig.json
├── eslint.config.js
├── .prettierrc
└── AGENTS.md
```

---

## Prerequisites

```bash
# Node.js 18+ and npm required
node --version

# Rust toolchain (required to build; NOT needed by end users)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"

# Install npm dependencies
npm install
```

---

## Build Commands

```bash
# Development (opens the Tauri window with HMR)
npm run dev

# Production build (creates platform installer in src-tauri/target/release/bundle/)
npm run build

# Frontend-only dev server (no Tauri window — useful for UI-only work)
npm run vite:dev

# Frontend-only production build
npm run vite:build
```

---

## Test Commands

```bash
# Run all frontend tests (Vitest)
npm test

# Run a single test file
npm run test:file src/services/queries.test.ts

# Watch mode — re-runs on file save
npm run test:watch

# Coverage report
npm run test:coverage

# Run all Rust unit tests
cd src-tauri && cargo test

# Run a single Rust test by name pattern
cd src-tauri && cargo test <test_name_substring>
```

> Always run the single-test command first to confirm a new test passes before running the full suite.

---

## Lint & Format Commands

```bash
# TypeScript lint
npm run lint

# Auto-fix TS lint issues
npm run lint:fix

# Format TS/TSX/CSS with Prettier
npm run format

# Check formatting without writing
npm run format:check

# TypeScript type check (no emit)
npm run typecheck

# Run all checks (typecheck + lint + format check)
npm run check

# Rust linter — must pass with zero warnings before committing
cd src-tauri && cargo clippy -- -D warnings

# Rust formatter
cd src-tauri && cargo fmt
```

---

## Architecture Notes

### Data flow
All API calls go through the Rust backend:
`UI component → TanStack Query hook (queries.ts) → tauri.ts invoke() → Rust command → HTTP`

Never import `fetch` or call Jira/Xray URLs directly from TypeScript.

### Credential storage
Credentials are encrypted with AES-256-GCM and stored at the OS app-config directory
(`~/.config/qality/config.enc` on Linux, `~/Library/Application Support/qality/config.enc` on macOS).
A random 32-byte key is generated on first run and stored at `key.bin` in the same directory.
The plaintext `AppConfig` struct is only held in memory after decryption.

### Xray authentication
`XrayClient` uses OAuth2 Client Credentials flow. The Bearer token is cached in a
`Arc<Mutex<Option<String>>>` and automatically refreshed on 401 responses (one retry).

### Optimistic mutations
`useUpdateTestRunStatus` (queries.ts) applies the new status in the TanStack Query cache
instantly and rolls back on error. This keeps the UI snappy even on slow connections.

### Virtualised lists
`TestExecutionDetail` uses `@tanstack/react-virtual` to render only visible test run rows.
All large data tables should use this pattern.

---

## Code Style Guidelines

### TypeScript / React

- **Indentation:** 2 spaces
- **Max line length:** 100 characters
- **Quotes:** double (`"`)
- **Semicolons:** required
- **Trailing commas:** required in multi-line expressions
- Prefer `interface` over `type` for object shapes
- No `any` — use proper types or generics
- Use `type` imports: `import type { Foo } from "./types"`
- Components are arrow functions exported as named exports (not `export default`)
- One component per file; filename matches the export name (PascalCase)

### Imports (TypeScript)

Group in this order, blank line between each group:
1. React
2. Third-party packages
3. `@/` alias imports (internal absolute)
4. Relative imports

### Rust

- **Indentation:** 4 spaces (rustfmt)
- **Max line width:** 100 characters
- All public functions must have doc comments
- Use `anyhow::Result` in library/API code; `String` errors only in Tauri command handlers
- Never use `unwrap()` in non-test code — use `?` or `context()`

### Naming

| Construct          | Convention       | Example                    |
|--------------------|------------------|----------------------------|
| TS variables       | camelCase        | `testRunId`                |
| TS functions       | camelCase        | `getTestExecutions()`      |
| React components   | PascalCase       | `TestExecutionDetail`      |
| TS interfaces      | PascalCase       | `TestRun`                  |
| TS constants       | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT`          |
| TS files (src)     | PascalCase       | `TestExecutionDetail.tsx`  |
| TS files (service) | camelCase        | `queries.ts`               |
| Test files         | `*.test.ts`      | `queries.test.ts`          |
| Rust modules       | snake_case       | `xray_client.rs`           |
| Rust structs       | PascalCase       | `TestRunStatus`            |
| Rust functions     | snake_case       | `get_test_runs()`          |
| Tauri commands     | snake_case       | `update_test_run_status`   |

### Error handling

**TypeScript:**
- Never swallow errors silently — always propagate or surface to the UI
- Tauri `invoke()` rejects with a plain `string` from Rust; wrap with `Error` when re-throwing
- Use TanStack Query's `isError` + `error` state to show error UI; do not `console.error` in components

**Rust:**
- Use `?` for propagation; `context()`/`with_context()` to add call-site information
- Tauri command handlers convert `anyhow::Error` → `String` via `.map_err(|e| e.to_string())`
- Never `panic!` in command handlers

---

## Git Conventions

### Branch naming
```
feature/<short-description>
fix/<short-description>
chore/<short-description>
```

### Commit messages (Conventional Commits)
```
feat(xray): add test plan filtering by status
fix(config): handle missing config dir on first launch
chore(deps): update reqwest to 0.13
```

Types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `perf`, `ci`
Subject line: ≤ 72 characters.

---

## Notes for AI Coding Agents

- **Read before writing.** Use `get_symbols_overview` or `find_symbol` before editing.
- **All API calls go through Rust.** Never call Jira/Xray from TypeScript directly.
- **After editing Rust**, run `cargo build` + `cargo clippy -- -D warnings` to verify.
- **After editing TypeScript**, run `npm run typecheck` + `npm test` to verify.
- **Prefer editing** an existing file over creating a new one.
- **Do not modify `AGENTS.md`** unless explicitly asked.
- **Ask before broad refactors** that touch more than 3 files.
- **New Tauri commands** must be registered in `src-tauri/src/lib.rs` `invoke_handler!`.
- **New frontend data calls** go in `src/services/tauri.ts` (invoke wrapper) +
  `src/services/queries.ts` (TanStack Query hook).
