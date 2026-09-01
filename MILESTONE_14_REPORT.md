# Milestone 14 Report — Cross-Platform V2RayEZ-GUI Sidecar Staging

Date: 2026-09-01
Branch: `arena/01a05e13-v2rayez`

## Goal

Remove a Windows-only bottleneck in the V2RayEZ desktop GUI packaging path. Tauri external binaries must be staged with the correct target triple for Windows and Linux/native package builds, while preserving the Aether/MSN core adapter and sing-box routing engine.

## Changes Applied

- Rewrote `V2RayEZ-GUI/scripts/prepare-sidecar.mjs` to stage both required Tauri sidecars:
  - Aether core (`aether-*`).
  - sing-box routing engine (`sing-box-*`).
- Added target-triple detection from Tauri/build environment variables:
  - `TAURI_ENV_TARGET_TRIPLE`.
  - `TARGET`.
  - `npm_config_target`.
  - Host fallback mapping for Windows, Linux, and macOS on x64/arm64.
- Added per-sidecar environment overrides:
  - `AETHER_CORE_BINARY`.
  - `SING_BOX_BINARY`.
- Added vendor fallback support for `V2RayEZ-GUI/vendor/aether(.exe)` and `V2RayEZ-GUI/vendor/sing-box(.exe)`.
- Added package scripts:
  - `prepare:sidecars` for direct validation/use.
  - `build:linux` for Tauri Linux native package bundles.
  - `build:windows` for explicit Windows target builds.
- Updated CI workflow template to syntax-check and exercise the sidecar staging script with temporary sidecar files.

## Validation Run

```bash
tmp=$(mktemp -d)
printf 'aether' > "$tmp/aether"
printf 'sing-box' > "$tmp/sing-box"
(
  cd V2RayEZ-GUI
  TAURI_ENV_TARGET_TRIPLE=x86_64-unknown-linux-gnu AETHER_CORE_BINARY="$tmp/aether" SING_BOX_BINARY="$tmp/sing-box" node scripts/prepare-sidecar.mjs
  test -f src-tauri/binaries/aether-x86_64-unknown-linux-gnu
  test -f src-tauri/binaries/sing-box-x86_64-unknown-linux-gnu
  rm -rf src-tauri/binaries
  TAURI_ENV_TARGET_TRIPLE=x86_64-pc-windows-msvc AETHER_CORE_BINARY="$tmp/aether" SING_BOX_BINARY="$tmp/sing-box" node scripts/prepare-sidecar.mjs
  test -f src-tauri/binaries/aether-x86_64-pc-windows-msvc.exe
  test -f src-tauri/binaries/sing-box-x86_64-pc-windows-msvc.exe
  rm -rf src-tauri/binaries
)
rm -rf "$tmp"
node --check V2RayEZ-GUI/scripts/prepare-sidecar.mjs
npm test --prefix V2RayEZ-GUI
git diff --check
```

Result: PASS.

Observed:

- Linux target-triple sidecar staging PASS.
- Windows target-triple sidecar staging PASS.
- `prepare-sidecar.mjs` syntax PASS.
- V2RayEZ-GUI frontend tests PASS — 14/14.
- `git diff --check` PASS.

## Still Pending

- Actual Tauri Windows/Linux package builds still require Rust/Cargo/Tauri system dependencies and real sidecar binaries.
- Verified Linux Aether binary acquisition still needs an upstream source or a signed build pipeline for the shared Rust core.
