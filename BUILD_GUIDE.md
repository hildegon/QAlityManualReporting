# QAlity — Build Guide

This guide explains how to compile QAlity from source and produce a distributable installer
for macOS, Windows, or Linux.

QAlity is a [Tauri 2](https://tauri.app) application. The frontend is built with Vite and the
backend is a Rust binary. Both must be compiled together to produce the final executable.

The examples below use the current application version:

```bash
VERSION=2.3.0
```

---

## Quick Start: Download Pre-Built Executables

Pre-built installers for **macOS**, **Windows**, and **Linux** are automatically built on every push via GitHub Actions.

**Latest builds:** [GitHub Releases](../../releases) or [GitHub Actions Artifacts](../../actions)

| Platform | Installer Format | Download |
|---|---|---|
| **macOS ARM64** | `.dmg` | `QAlity-v${VERSION}-macos-aarch64` |
| **Windows** | `.exe` or `.msi` | `QAlity-v${VERSION}-windows` |
| **Linux** | `.AppImage` or `.deb` | `QAlity-v${VERSION}-linux` |

---

## Table of Contents

1. [Quick Start](#quick-start-download-pre-built-executables)
2. [Prerequisites](#prerequisites)
   - [All platforms](#all-platforms)
   - [macOS](#macos)
   - [Windows](#windows)
   - [Linux](#linux)
3. [Clone and install dependencies](#clone-and-install-dependencies)
4. [Development build (with HMR)](#development-build-with-hmr)
5. [Production build](#production-build)
6. [Build outputs](#build-outputs)
   - [macOS](#macos-1)
   - [Windows](#windows-1)
   - [Linux](#linux-1)
7. [Automated multi-platform builds (CI/CD)](#automated-multi-platform-builds-cicd)
8. [Frontend-only build (no Tauri)](#frontend-only-build-no-tauri)
9. [Code signing and notarisation](#code-signing-and-notarisation)
10. [Useful scripts reference](#useful-scripts-reference)

---

## Prerequisites

### All platforms

| Tool | Version | Install |
|---|---|---|
| **Node.js** | 18 or later | https://nodejs.org |
| **npm** | bundled with Node.js | — |
| **Rust** | stable, latest | https://rustup.rs |

After installing Rust, make sure the toolchain is active:

```bash
rustup update stable
rustc --version   # should print 1.70+ 
```

### macOS

Install **Xcode Command Line Tools** (provides `clang`, `make`, and related utilities):

```bash
xcode-select --install
```

WebView is provided by the OS (WKWebView) — no additional installation needed.

### Windows

- **WebView2 Runtime** — pre-installed on Windows 10 (1803+) and Windows 11.
  If missing, download from https://developer.microsoft.com/en-us/microsoft-edge/webview2/.
- **Visual Studio Build Tools** (C++ workload) or a full Visual Studio installation is
  required by Rust.
  Download from https://visualstudio.microsoft.com/visual-cpp-build-tools/.
- **NSIS** — required to produce the `.exe` NSIS installer.
  Download from https://nsis.sourceforge.io/Download.
  Add the NSIS directory to your `PATH`.

### Linux

QAlity uses the GTK/WebKit2GTK stack. Install system dependencies before building.

**Debian / Ubuntu:**

```bash
sudo apt update
sudo apt install -y \
  libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

**Fedora / RHEL:**

```bash
sudo dnf install -y \
  webkit2gtk4.1-devel \
  openssl-devel \
  curl \
  wget \
  file \
  libxdo-devel \
  libappindicator-gtk3-devel \
  librsvg2-devel
```

**Arch Linux:**

```bash
sudo pacman -S --needed \
  webkit2gtk-4.1 \
  base-devel \
  curl \
  wget \
  file \
  openssl \
  appmenu-gtk-module \
  libappindicator-gtk3 \
  librsvg
```

---

## Clone and install dependencies

Clone the repository from its Git hosting page, then run:

```bash
cd QAlityManualReporting

# Install JavaScript/TypeScript dependencies
npm install
```

> **Note:** The Rust crates are fetched automatically by Cargo during the first build.
> This requires an internet connection and may take a few minutes on the first run.

---

## Development build (with HMR)

Run the full Tauri development environment. This opens a native desktop window with
**Hot Module Replacement** — the frontend updates instantly on file save while the Rust
backend recompiles only when its files change.

```bash
npm run dev
```

- The Vite dev server starts first (`npm run vite:dev` internally).
- Tauri waits for Vite, then compiles the Rust binary and opens the window.
- Rust recompilation takes 10–30 seconds; subsequent rebuilds are incremental and faster.

---

## Production build

```bash
npm run build
```

Internally this runs:

1. `npm run vite:build` — TypeScript check + Vite production bundle → `dist/`
2. `tauri build` — Rust release compilation + bundling of the frontend into the binary

The first production build will take several minutes (Rust compiles all dependencies in
release mode). Subsequent builds are faster due to incremental compilation.

---

## Build outputs

All installers are written to `src-tauri/target/release/bundle/`.

### macOS

| Format | Path | Notes |
|---|---|---|
| `.app` bundle | `bundle/macos/QAlity.app` | Can be run directly or distributed |
| `.dmg` disk image | `bundle/dmg/QAlity_${VERSION}_aarch64.dmg` | Standard macOS distribution format |

The `.app` bundle uses the system **WKWebView** (no Chromium dependency).

CI currently produces an Apple Silicon ARM64 build. To build the same target locally:

```bash
rustup target add aarch64-apple-darwin
npm run build -- --target aarch64-apple-darwin
```

### Windows

| Format | Path | Notes |
|---|---|---|
| `.msi` installer | `bundle/msi/QAlity_${VERSION}_x64_en-US.msi` | Windows Installer package |
| `.exe` NSIS installer | `bundle/nsis/QAlity_${VERSION}_x64-setup.exe` | Standalone installer |

Both use the system **WebView2** runtime.

To cross-compile for 32-bit Windows add the target first:

```bash
rustup target add i686-pc-windows-msvc
npm run build -- --target i686-pc-windows-msvc
```

### Linux

| Format | Path | Notes |
|---|---|---|
| `.deb` package | `bundle/deb/qality_${VERSION}_amd64.deb` | Debian / Ubuntu |
| `.AppImage` | `bundle/appimage/QAlity_${VERSION}_amd64.AppImage` | Portable, any distro |

Install the `.deb`:

```bash
sudo dpkg -i "bundle/deb/qality_${VERSION}_amd64.deb"
```

Run the AppImage directly (no installation needed):

```bash
chmod +x "QAlity_${VERSION}_amd64.AppImage"
./"QAlity_${VERSION}_amd64.AppImage"
```

---

## Automated multi-platform builds (CI/CD)

Pushes to `main`, tags matching `v*` (for example, `v${VERSION}`), or a manual workflow dispatch trigger a GitHub Actions workflow that builds QAlity for all three platforms: **macOS**, **Windows**, and **Linux**.

**How it works:**

1. GitHub Actions runs on three separate machines (macOS, Ubuntu, Windows)
2. Each machine compiles the app natively for its platform
3. Finished builds (`.dmg`, `.exe`, `.deb`, `.AppImage`, etc.) are uploaded as artifacts
4. On tagged releases, builds are automatically created as draft releases for review; they are not published automatically

**To download the latest builds:**

1. Go to [GitHub Actions](../../actions) and select the latest workflow run
2. Download the artifact for your platform: `QAlity-v${VERSION}-macos-aarch64`,
   `QAlity-v${VERSION}-windows`, or `QAlity-v${VERSION}-linux`
3. Or: Go to [GitHub Releases](../../releases) and download the final installer

**To build locally on your machine:**

Simply run:

```bash
npm run build
```

This compiles QAlity natively for your current OS. To cross-compile for other platforms, see the sections below.

---

## Frontend-only build (no Tauri)

Use this when you only need to work on the React/TypeScript frontend without the Rust backend.

**Dev server:**

```bash
npm run vite:dev
```

Opens a browser at `http://localhost:1420` (Tauri-specific `invoke()` calls will fail since
the Rust backend is absent, but layout and UI work can be done).

**Production bundle:**

```bash
npm run vite:build
```

Outputs to `dist/`. Not a distributable app on its own — requires Tauri's `tauri build` to
produce an executable.

---

## Code signing and notarisation

The default `tauri.conf.json` does **not** include signing configuration. Unsigned builds
work for local use and testing.

For distribution:

**macOS** — Refer to the Tauri signing documentation:
https://tauri.app/distribute/sign/macos/

Set the following environment variables to values from your Apple Developer
account and signing setup before running `npm run build`:

- `APPLE_SIGNING_IDENTITY` — the Developer ID Application certificate identity.
- `APPLE_ID` — the Apple Developer account identifier used for notarisation.
- `APPLE_PASSWORD` — an app-specific password for notarisation.
- `APPLE_TEAM_ID` — the Apple Developer Team ID.

**Windows** — Refer to:
https://tauri.app/distribute/sign/windows/

For Tauri updater signing, set `TAURI_SIGNING_PRIVATE_KEY` and
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` as environment variables. Windows Authenticode signing
is separate; configure the Windows certificate settings in `tauri.conf.json` as described in
the Tauri signing documentation.

**Linux** — Signing is not required for `.deb` or `.AppImage` distribution.

---

## Troubleshooting

### macOS: "QAlity is damaged and can't be opened"

If you download a built `.app` or `.dmg` from GitHub Actions and see this error, macOS has quarantined the app because it's not code-signed.

**Fix — Run this command:**

```bash
APP_PATH="$HOME/Downloads/QAlity.app"
xattr -cr "$APP_PATH"
```

Example:

```bash
xattr -cr ~/Downloads/QAlity.app
# or for DMG:
xattr -cr /Applications/QAlity.app
```

**Alternative — Open via right-click:**

1. Right-click on QAlity.app
2. Select "Open"
3. Click "Open" in the dialog

You only need to do this once per downloaded version. After that, the app launches normally.

**Note:** To fully fix this for distribution to other users, you need to join the Apple Developer Program ($99/year) and code-sign the app. See the [Code signing and notarisation](#code-signing-and-notarisation) section above.

---

## Useful scripts reference

| Command | Description |
|---|---|
| `npm run dev` | Development: Tauri window + HMR |
| `npm run build` | Production: compile and bundle installer |
| `npm run vite:dev` | Frontend dev server only (no Tauri) |
| `npm run vite:build` | Frontend production bundle only |
| `npm test` | Run all Vitest frontend tests |
| `npm run test:watch` | Re-run tests on file save |
| `npm run test:coverage` | Generate coverage report |
| `npm run typecheck` | TypeScript type check (no emit) |
| `npm run lint` | ESLint |
| `npm run lint:fix` | ESLint with auto-fix |
| `npm run format` | Prettier format |
| `npm run check` | Typecheck + lint + format check |
| `cd src-tauri && cargo test` | Run all Rust unit tests |
| `cd src-tauri && cargo clippy -- -D warnings` | Rust linter |
| `cd src-tauri && cargo fmt` | Rust formatter |
