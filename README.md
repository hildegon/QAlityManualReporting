# QAlity — Manual Reporting

> A cross-platform desktop app for reading Jira and Xray Cloud test data, marking test
> runs, and writing results back to Xray — without a web server or browser extension.

---

## What it does

QAlity gives QA engineers a fast, offline-capable desktop interface to manage their Xray
test work without leaving the desktop:

- **Mark test runs** — update status (Pass / Fail / Executing / Blocked / …) with a single
  click; updates apply optimistically and roll back on error.
- **Step-level results** — expand any test run to view its manual steps, set per-step
  status, and leave step comments.
- **Manage test sets** — browse all test sets, drag tests onto them to add members, and
  remove members with a hover-reveal trash button.
- **Manage test plans** — drag whole test sets onto test plans to bulk-add their tests;
  remove individual tests the same way.
- **Create test executions** — pick a test plan and/or individual tests to include.
- **Create tests** — with numbered steps, component, and test-set links in one form.
- **Encrypted credentials** — Jira and Xray credentials are stored locally, encrypted with
  AES-256-GCM. Nothing is sent to any third-party server.

---

## Tech stack

| Layer | Technology |
|---|---|
| Desktop shell | [Tauri 2](https://tauri.app) (Rust + OS native WebView) |
| Frontend | React 19 · TypeScript · Vite · Tailwind CSS v4 |
| UI primitives | Radix UI · shadcn-style components |
| Server state | TanStack Query v5 (caching, optimistic mutations) |
| UI state | Zustand |
| Virtualised lists | TanStack Virtual |
| HTTP client | reqwest (Rust) |
| Encryption | AES-256-GCM (Rust) |
| Async runtime | Tokio (Rust) |
| Tests | Vitest (frontend) · cargo test (Rust) |

---

## Quick start

### Prerequisites

| Tool | Version |
|---|---|
| Node.js | 18 or later |
| Rust (stable) | latest — [rustup.rs](https://rustup.rs) |
| macOS | Xcode Command Line Tools (`xcode-select --install`) |
| Windows | WebView2 Runtime · Visual Studio Build Tools (C++ workload) · NSIS |
| Linux | `libwebkit2gtk-4.1-dev` and related packages (see [BUILD_GUIDE.md](BUILD_GUIDE.md)) |

### Install and run

```bash
git clone <repository-url>
cd QAlityManualReporting
npm install
npm run dev          # opens the Tauri desktop window with HMR
```

The first build downloads and compiles all Rust crates — this takes a few minutes. Subsequent
builds are incremental.

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Dev mode — Tauri window with Hot Module Replacement |
| `npm run build` | Production build → installer in `src-tauri/target/release/bundle/` |
| `npm run vite:dev` | Frontend-only dev server (no Tauri window) |
| `npm run vite:build` | Frontend-only production bundle |
| `npm test` | Run all Vitest frontend tests |
| `npm run test:watch` | Re-run tests on file save |
| `npm run test:coverage` | Coverage report |
| `npm run typecheck` | TypeScript type check (no emit) |
| `npm run lint` | ESLint |
| `npm run lint:fix` | ESLint with auto-fix |
| `npm run format` | Prettier |
| `npm run check` | Typecheck + lint + format check (run before committing) |
| `cd src-tauri && cargo test` | Rust unit tests |
| `cd src-tauri && cargo clippy -- -D warnings` | Rust linter (zero warnings required) |
| `cd src-tauri && cargo fmt` | Rust formatter |

---

## Architecture

All API calls flow through the Rust backend — TypeScript never calls Jira or Xray directly:

```
UI component
  └─ TanStack Query hook  (src/services/queries.ts)
       └─ tauri invoke()  (src/services/tauri.ts)
            └─ Rust command handler  (src-tauri/src/commands/)
                 └─ HTTP client  (src-tauri/src/api/)
                      └─ Jira REST API / Xray Cloud GraphQL
```

### Key modules

```
src/
├── services/
│   ├── tauri.ts          # typed invoke() wrappers — one function per Tauri command
│   └── queries.ts        # TanStack Query hooks + mutations (canonical file)
├── stores/
│   ├── projectStore.ts   # active project, credentials flag
│   └── uiStore.ts        # toast, modal state
├── pages/                # route-level pages (one per nav item)
├── components/
│   ├── ui/               # base primitives (Button, Badge, Input, …)
│   ├── common/           # AppShell, ProjectSelector
│   └── test-execution/   # TestExecutionDetail (virtualised list)
└── hooks/
    └── useDragAndDrop.ts # mouse-based drag-and-drop (HTML5 DnD broken in WKWebView)

src-tauri/src/
├── commands/
│   ├── config.rs         # AES-256-GCM credential storage
│   ├── jira.rs           # Jira REST API commands
│   └── xray.rs           # Xray Cloud GraphQL commands
└── api/
    ├── jira_client.rs    # raw Jira HTTP client
    └── xray_client.rs    # raw Xray GraphQL client (OAuth2, token cache)
```

### Credential storage

Credentials are encrypted with AES-256-GCM and stored at the OS app-config directory.
A 32-byte random key is generated on first run and stored alongside the encrypted config.

| Platform | Path |
|---|---|
| macOS | `~/Library/Application Support/qality/config.enc` |
| Windows | `%APPDATA%\qality\config.enc` |
| Linux | `~/.config/qality/config.enc` |

---

## Documentation

| Document | Contents |
|---|---|
| [USER_GUIDE.md](USER_GUIDE.md) | End-user guide — settings, all screens, features |
| [BUILD_GUIDE.md](BUILD_GUIDE.md) | Build from source, platform-specific prerequisites, code signing |

---

## Development notes

- **Drag and drop** — HTML5 DnD does not work in Tauri's macOS WKWebView. A custom
  mouse-event-based implementation (`useDragAndDrop`) is used instead.
- **Optimistic mutations** — `useUpdateTestRunStatus` (and remove-tests mutations) update
  the TanStack Query cache immediately and roll back on API error.
- **Virtualised lists** — `TestExecutionDetail` uses `@tanstack/react-virtual`; all large
  data tables should follow this pattern.
- **Rate limiting** — background page-loads are staggered 300 ms apart; a sticky banner
  with a live countdown appears when Xray's rate limit is hit.
- **Two queries files** — `src/services/queries.ts` (flat) takes precedence over
  `src/services/queries/index.ts` (barrel) in TypeScript module resolution. New hooks must
  be added to the flat file.

---

## Contributing

1. Create a branch: `feature/<desc>`, `fix/<desc>`, or `chore/<desc>`.
2. Follow the code style in [AGENTS.md](AGENTS.md).
3. Before opening a PR, run `npm run check` and `cargo clippy -- -D warnings` — both must
   pass with zero warnings/errors.
4. Use [Conventional Commits](https://www.conventionalcommits.org/): `feat(scope): …`,
   `fix(scope): …`, etc. Subject line ≤ 72 characters.

---

## License

Private repository — all rights reserved.
