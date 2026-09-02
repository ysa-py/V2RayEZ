# Windows Build - End-User Executables

This directory now produces **installable end-user binaries**, not just raw `.dll`.

## Outputs

- `v2rayez-license-gate.exe` - Standalone license verification + tunnel gate (from `cargo build --bin v2rayez-license-gate`)
- `V2RayEZ.exe` - Main GUI executable (from Tauri build `V2RayEZ-GUI`)
- `V2RayEZ-<version>-setup.exe` - NSIS installer (created via `installer.nsi` or Tauri NSIS bundle)
- `V2RayEZ-<version>.msi` - WiX MSI installer (from Tauri `msi` bundle)
- `v2rayez_universal_core.dll` - FFI cdylib for C# / C++ consumers (preserved)

## Build Flags Preserved

From `Cargo.toml`:
```toml
[profile.release]
opt-level = "s"  # or 3 for core
lto = true
codegen-units = 1
strip = true
panic = "abort"
```

## CI Pipeline (GitHub Actions)

`release.yml` job `build-windows` runs on `windows-latest`:

1. Setup Rust stable + target `x86_64-pc-windows-msvc`
2. Cache cargo registry + target
3. Setup Node 20 + npm cache
4. Install NSIS + WiX via choco
5. Build core binary with retry (3 attempts):
   ```bash
   cargo build --release --bin v2rayez-license-gate --features "std,post-quantum-lab"
   ```
6. Build Tauri GUI with retry:
   ```bash
   cd V2RayEZ-GUI
   npm ci
   node scripts/prepare-sidecar.mjs
   npx tauri build --bundles nsis,msi
   ```
7. Custom NSIS installer fallback via `build-windows.ps1`:
   ```powershell
   makensis installer.nsi
   ```
8. Rename assets to `V2RayEZ-<version>.exe`, `V2RayEZ-<version>-setup.exe`, `V2RayEZ-<version>.msi`
9. Upload artifacts + generate SHA256SUMS

## Local Build

```powershell
# PowerShell
.\universal-core\windows\build-windows.ps1 -Version 2.0.0

# Or bash (Git Bash / WSL)
bash universal-core/windows/build-windows.sh
```

## Installer Details

- **NSIS**: Current user install, Start Menu + Desktop shortcuts, uninstaller
- **WiX**: MSI for enterprise deployment (via Tauri)
- Both include `v2rayez_universal_core.dll` if present

## Verification

```powershell
sha256sum -c SHA256SUMS.txt
```
