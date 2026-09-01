# Milestone 20 Report — Native License Gate CLI Wiring

Date: 2026-09-02
Branch: `arena/01a05e13-v2rayez`

## Goal

Close the OpenWrt/native license consistency gap: the shell license gate already preferred `/usr/bin/v2rayez-license-gate`, but the repository did not build or install such a native verifier. The product needs local anti-forgery, per-user account binding, expiry enforcement, and offline grace hard cutoff paths.

## Changes Applied

- Added `universal-core/src/bin/v2rayez-license-gate.rs`.
  - Uses the shared `LicenseVerifier` from `universal-core`.
  - Verifies signed V2RayEZ license tokens with Ed25519 public keys.
  - Enforces account binding, active status, and expiry before any allow decision.
  - Supports online validation via `curl`, `uclient-fetch`, or `wget` without adding another Rust HTTP dependency.
  - Stores returned signed grace tokens at the provided grace path.
  - Supports offline signed-grace validation through `offline_start_decision()`.
  - Computes a hard cutoff from the license expiry and signed grace expiry.
  - Updates OpenWrt UCI status fields used by LuCI.
  - Prints a redaction-safe JSON decision and exits nonzero on deny.
- Registered the binary in `universal-core/Cargo.toml` as `v2rayez-license-gate`.
- Updated `MICAFP/openwrt/Makefile`:
  - Builds `v2rayez-license-gate` from `universal-core` when the V2RayEZ repository source layout is present.
  - Installs it to `/usr/bin/v2rayez-license-gate` when the binary is produced.
  - Keeps the donor-source fallback path intact.
- Updated CI workflow templates to test/build the universal Rust core and license gate when workflows can be activated with GitHub workflow-write permission.

## Validation Run

```bash
python3 - <<'PY'
from pathlib import Path
import tomllib
cargo = tomllib.loads(Path('universal-core/Cargo.toml').read_text())
assert any(bin.get('name') == 'v2rayez-license-gate' for bin in cargo.get('bin', [])), 'license gate bin missing'
text = Path('universal-core/src/bin/v2rayez-license-gate.rs').read_text()
for needle in ['LicenseVerifier::new', 'verify_license_key', 'offline_start_decision', 'fn validate_online', 'fn update_uci', 'license_expires_at', 'license_offline_grace_until']:
    assert needle in text, needle
print('universal-core license gate static checks pass')
PY
python3 - <<'PY'
from pathlib import Path
text = Path('MICAFP/openwrt/Makefile').read_text()
for needle in ['--bin v2rayez-license-gate', '/usr/bin/v2rayez-license-gate', '--features platform-openwrt', '--features std']:
    assert needle in text, needle
assert '--features openwrt' not in text
print('openwrt native license gate wiring checks pass')
PY
python3 - <<'PY'
from pathlib import Path
for p in Path('docs/ci/github-workflows').glob('*.yml.sample'):
    text = p.read_text()
    assert '\t' not in text, f'tab in {p}'
    assert text.endswith('\n')
    print('workflow template basic pass', p, 'lines', len(text.splitlines()))
PY
git diff --check
```

Result: PASS for local static validation.

Blocked locally:

- `cargo build` / `cargo test` cannot run in this sandbox because Rust/Cargo are unavailable and package installation was previously blocked by unreachable Debian mirrors.

## Still Pending

- Native compile/test of `v2rayez-license-gate` on Rust toolchains.
- OpenWrt `.ipk` compile with a real SDK/toolchain.
- End-to-end license server validation against a real dashboard database and router runtime.
