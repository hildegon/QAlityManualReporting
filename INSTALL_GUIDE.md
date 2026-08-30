# QAlity — Release & Distribution Guide

This guide explains how to obtain and use QAlity executables across all platforms.

In filename examples, `${VERSION}` denotes the release version.

---

## For Users: Download & Install

### macOS

**Option 1: DMG Installer (Recommended)**
1. Download the `QAlity-v${VERSION}-macos-aarch64` CI artifact and open its ARM64 installer
2. Double-click the `.dmg` file
3. Drag "QAlity" to the Applications folder
4. Open Applications → QAlity to launch

**Option 2: Direct App Bundle**
- Download the `QAlity.app` bundle
- Extract and move to Applications folder
- Double-click to launch

### Windows

**Option 1: NSIS Installer**
1. Download the `QAlity-v${VERSION}-windows` CI artifact and run its `QAlity_${VERSION}_x64-setup.exe` installer
2. Run the installer
3. Follow the on-screen prompts
4. Launch from Start Menu → QAlity

**Option 2: MSI Installer**
1. Download the `QAlity-v${VERSION}-windows` CI artifact and open its `QAlity_${VERSION}_x64_en-US.msi` installer
2. Double-click to open Windows Installer
3. Follow prompts to install
4. Launch from Start Menu → QAlity

### Linux

**Option 1: AppImage (Works on any distro, no installation)**
```bash
chmod +x "QAlity_${VERSION}_amd64.AppImage"
./"QAlity_${VERSION}_amd64.AppImage"
```

**Option 2: Debian/Ubuntu**
```bash
sudo apt install "./qality_${VERSION}_amd64.deb"
qality  # Launch from command line
```

**Option 3: Other Linux Distros**
Use the AppImage for widest compatibility.

---

## For Developers: Obtain Latest Builds

### From GitHub Actions (Recommended for CI/CD)

1. Go to [Actions](../../actions)
2. Click on the latest workflow run
3. Scroll to "Artifacts" section
4. Download the artifact for your platform. The current macOS CI artifact is ARM64-only:
   - `QAlity-v${VERSION}-macos-aarch64` — macOS ARM64 (Apple Silicon)
   - `QAlity-v${VERSION}-windows` — Windows installers
   - `QAlity-v${VERSION}-linux` — Linux AppImage + deb

### From GitHub Releases

1. Go to [Releases](../../releases)
2. Download installers from the latest release
3. Checksums and signatures available if configured

### Build Locally

To create builds on your machine:

Obtain the source from its Git hosting page and open a terminal in the repository directory,
then run:

```bash
cd QAlityManualReporting
npm install

# Build for your platform
npm run build

# Find outputs in:
# macOS: src-tauri/target/release/bundle/dmg/ and bundle/macos/
# Windows: src-tauri/target/release/bundle/msi/ and bundle/nsis/
# Linux: src-tauri/target/release/bundle/deb/ and bundle/appimage/
```

---

## Build Artifacts Overview

| Platform | Installer Format | Size | Use Case |
|---|---|---|---|
| **macOS** | `.dmg` (disk image) | ~5 MB | Standard macOS distribution |
| **macOS** | `.app` (bundle) | ~50 MB | Direct execution, portable |
| **Windows** | `.exe` (NSIS) | ~80 MB | Standalone installer |
| **Windows** | `.msi` | ~80 MB | Windows Installer package |
| **Linux** | `.AppImage` | ~100 MB | Portable, any distro |
| **Linux** | `.deb` | ~20 MB | Debian/Ubuntu package |

---

## System Requirements

### macOS
- **OS:** macOS 10.13 or later
- **Architecture:** Apple Silicon (ARM64)
- **RAM:** 2 GB minimum

### Windows
- **OS:** Windows 10 (1803+) or Windows 11
- **Architecture:** x86_64 only (32-bit not supported)
- **WebView2:** Pre-installed on most Windows systems
- **RAM:** 2 GB minimum

### Linux
- **OS:** Any modern Linux distro (Ubuntu 20.04+, Fedora 33+, etc.)
- **Architecture:** x86_64 only
- **WebKit2GTK:** Bundled in AppImage; Debian/Ubuntu provides via system package manager
- **RAM:** 2 GB minimum

---

## Troubleshooting

### macOS
**"QAlity is damaged and can't be opened"**
- Right-click → Open (bypass Gatekeeper)
- Or: `sudo xattr -rd com.apple.quarantine /Applications/QAlity.app`

### Windows
**"Windows protected your PC"**
- Click "More info" → "Run anyway"
- Or: Disable SmartScreen warnings in Windows Defender settings

### Linux
**AppImage won't run**
```bash
chmod +x QAlity_*.AppImage
./QAlity_*.AppImage
```

**Missing dependencies (if not using AppImage)**
```bash
# Ubuntu/Debian
sudo apt install webkit2gtk-4.1

# Fedora
sudo dnf install webkit2gtk4.1

# Arch
sudo pacman -S webkit2gtk
```

---

## Signing & Verification (Enterprise)

For organizations requiring code-signed binaries:

- **macOS:** Configure signing in tauri.conf.json (see BUILD_GUIDE.md)
- **Windows:** Configure certificate signing in tauri.conf.json
- **Linux:** Not required, but `.deb` can be GPG-signed

Contact the development team for signed release builds.

---

## Feedback & Support

- **Issues:** [GitHub Issues](../../issues)
- **Discussions:** [GitHub Discussions](../../discussions)
- **Documentation:** See [README.md](../../README.md) and [USER_GUIDE.md](../../USER_GUIDE.md)
