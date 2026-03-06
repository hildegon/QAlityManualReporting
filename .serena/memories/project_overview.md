# QAlity Manual Reporting — Project Overview

## Purpose
Cross-platform desktop app for reading Jira/Xray Cloud test data, marking test runs, and writing results back to Xray — without a web server.

## Tech Stack
- **Desktop shell:** Tauri 2 (Rust backend + OS native WebView)
- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS v4
- **UI primitives:** Radix UI + custom shadcn-style components
- **State:** Zustand (UI/project state) + TanStack Query v5 (server state, caching)
- **Performance:** TanStack Virtual (virtualised lists), optimistic mutations
- **Backend (Rust):** reqwest (HTTP), AES-256-GCM (credential encryption), Tokio (async)
- **Package manager:** npm

## Architecture
All API calls go through Rust backend:
`UI component → TanStack Query hook (queries.ts) → tauri.ts invoke() → Rust command → HTTP`

Never import `fetch` or call Jira/Xray URLs directly from TypeScript.

## Key Patterns
- Xray Cloud uses OAuth2 Client Credentials flow
- Jira Cloud uses email + API token (Basic auth)
- Credentials encrypted with AES-256-GCM at OS app-config directory
- Optimistic mutations for test run status updates
- Virtualised lists for large data tables
