#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# build-linux.sh — builds the QAlity Linux (x86_64) bundle inside Docker
#
# Usage:  ./build-linux.sh
# Output: dist-linux/  (.AppImage and .deb files)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="$REPO_ROOT/dist-linux"
IMAGE_TAG="qality-linux-build"

echo "==> Building Docker image …"
docker build \
  --platform linux/amd64 \
  -t "$IMAGE_TAG" \
  -f - "$REPO_ROOT" <<'DOCKERFILE'
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# ── System deps required by Tauri on Linux ───────────────────────────────────
RUN apt-get update && apt-get install -y \
    curl git build-essential pkg-config \
    libgtk-3-dev libwebkit2gtk-4.1-dev \
    libappindicator3-dev librsvg2-dev patchelf \
    libssl-dev libglib2.0-dev xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# ── Node.js 20 ────────────────────────────────────────────────────────────────
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# ── Rust (stable) ─────────────────────────────────────────────────────────────
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
ENV PATH="/root/.cargo/bin:$PATH"

WORKDIR /app

# Copy everything (uses .dockerignore if present; node_modules and target are excluded below)
COPY . .

# Remove local build artefacts that may conflict
RUN rm -rf node_modules package-lock.json src-tauri/target

# ── Frontend deps + build ─────────────────────────────────────────────────────
RUN npm install
RUN npm run vite:build

# ── Tauri / Rust build ────────────────────────────────────────────────────────
# AppImage requires FUSE which is unavailable inside Docker — build deb + rpm only.
RUN npm run tauri build -- --target x86_64-unknown-linux-gnu --bundles deb,rpm
DOCKERFILE

echo "==> Extracting bundles …"
mkdir -p "$OUT_DIR"
docker run --rm \
  --platform linux/amd64 \
  -v "$OUT_DIR":/out \
  "$IMAGE_TAG" \
  bash -c "
    find /app/src-tauri/target/x86_64-unknown-linux-gnu/release/bundle \
      \( -name '*.AppImage' -o -name '*.deb' -o -name '*.rpm' \) \
      -exec cp {} /out/ \;
    echo 'Copied files:'; ls /out/
  "

echo ""
echo "✅  Linux build complete — artifacts in dist-linux/"
ls -lh "$OUT_DIR"
