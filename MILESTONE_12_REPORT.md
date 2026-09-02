# Milestone 12 Report — CI Workflow Templates and Inventory Stabilization

Date: 2026-09-01
Branch: `arena/01a05e13-v2rayez`

## Goal

Prepare repository-level GitHub Actions automation for V2RayEZ Universal and stabilize the merge inventory so clean checkouts do not drift because of ignored/generated directories.

## Important Permission Blocker

A first attempt to commit active root workflow files under `.github/workflows/` was valid locally, but `git push` was rejected by GitHub:

```text
refusing to allow a GitHub App to create or update workflow `.github/workflows/universal-artifacts.yml` without `workflows` permission
```

Because this Arena GitHub App connection does not currently have the `workflows` permission, active root workflow files cannot be pushed from this session. To avoid hiding the work, the full workflows were preserved as templates under `docs/ci/github-workflows/*.yml.sample`. They can be copied to `.github/workflows/` after the GitHub connection has workflow-write permission.

## Changes Applied

- Added `docs/ci/github-workflows/universal-source-gates.yml.sample`.
  - Intended triggers: pushes and pull requests for `main` and `arena/01a05e13-v2rayez`, plus manual dispatch.
  - Executes V2RayEZ-GUI JavaScript syntax checks, frontend tests, and Tauri config JSON parsing.
  - Blocks legacy AetherGUI/Aethon/Firstham/Hamvex GUI identity strings from V2RayEZ-GUI runtime sources.
  - Runs license crypto and AI Provider Gateway self-tests.
  - Preserves the base V2RayEZ EN/FA/RU localization parity gate.
  - Validates V2RayEZ-GUI Android XML resources.
  - Validates OpenWrt init/license/netifd shell syntax, rpcd ACL JSON, C source syntax, and no `nullptr` regressions.
  - Checks touched iOS Swift source brace balance.
  - Regenerates `MERGE_INVENTORY.json` and fails if inventory drift is uncommitted.
  - Runs dashboard lint/build in a separate job.
- Added `docs/ci/github-workflows/universal-artifacts.yml.sample`.
  - Provides a release artifact pipeline template for Android APKs, Windows installer/portable builds, dashboard bundle, optional OpenWrt `.ipk` builds when an SDK URL is supplied, and an explicit iOS IPA signing gate.
  - Android base debug APK generation creates a CI-only Firebase descriptor so missing local Firebase secrets do not block debug compilation.
  - OpenWrt `.ipk` build remains conditional on an OpenWrt SDK tarball URL.
  - iOS IPA packaging remains intentionally blocked until an Xcode project/workspace and signing/Network Extension entitlements exist.
- Updated `tools/merge_inventory.py` to ignore generated directories such as `node_modules`, `.next`, `dist`, `build`, `target`, and cache folders for both file counts and top-level directory summaries.
- Regenerated `MERGE_INVENTORY.json` to match the clean repository checkout shape without ignored/generated content.

## Validation Run

```bash
python3 tools/merge_inventory.py
python3 - <<'PY'
from pathlib import Path
for p in Path('docs/ci/github-workflows').glob('*.yml.sample'):
    text = p.read_text()
    assert '\t' not in text, f'tab in {p}'
    assert text.endswith('\n')
    print('workflow template basic pass', p, 'lines', len(text.splitlines()))
PY
node --check V2RayEZ-GUI/src/app.js
node --check V2RayEZ-GUI/src/i18n.js
node --check V2RayEZ-GUI/tests/frontend.test.mjs
npm test --prefix V2RayEZ-GUI
node tools/license_crypto_selftest.mjs
node tools/ai_provider_gateway_selftest.mjs
bash "V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)/scripts/gates/string-key-parity.sh"
sh -n MICAFP/openwrt/files/etc/init.d/unifiedshield
sh -n MICAFP/openwrt/files/usr/libexec/unifiedshield/license-gate.sh
sh -n MICAFP/openwrt/files/lib/netifd/proto/unifiedshield.sh
python3 -m json.tool MICAFP/openwrt/files/usr/share/rpcd/acl.d/luci-app-unifiedshield.json >/dev/null
! grep -R "nullptr" -n MICAFP/openwrt/src
gcc -std=gnu99 -Wall -Wextra -fsyntax-only -I MICAFP/openwrt/src \
  MICAFP/openwrt/src/main.c MICAFP/openwrt/src/netifd_proto.c
git diff --check
```

Result: PASS locally for syntax/static checks. Full GitHub-hosted artifact builds still require active workflow placement plus hosted runners/toolchains and, for some targets, signing/SDK inputs as documented by the templates.

## Still Pending

- Active root GitHub Actions cannot be pushed until the GitHub App connection has `workflows` permission.
- Native Android Gradle, Windows Tauri, OpenWrt SDK, and iOS Xcode builds still need actual hosted/installed toolchains.
- iOS `.ipa` packaging still needs an Xcode project/workspace and signing material.
- OpenWrt `.ipk` packaging still needs a real SDK URL or local SDK.
- Real end-to-end connectivity/device/router verification remains pending until target devices or emulators are available.
