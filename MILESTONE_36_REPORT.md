# Milestone 36 Report — Traceability and Inventory Refresh

Date: 2026-09-02
Branch: `arena/01a05e13-v2rayez`

## Goal

Keep the merge inventory and traceability documents accurate after the new AI identity, license hard-cutoff, OpenWrt packaging, and release artifact build-contract work. The user's zero-feature-loss requirement depends on these documents staying in sync with source changes.

## Changes Applied

- Regenerated `MERGE_INVENTORY.json` with `tools/merge_inventory.py`.
  - MICAFP source file count increased from 731 to 732 because the OpenWrt runtime license watchdog script is now part of the tracked package tree.
  - Feature probe count remains 27.
- Appended a new traceability section to `MERGE_TRACEABILITY.md` covering Milestones 30-35:
  - canonical V2RayEZ AI defaults/fallback identity.
  - Android persisted AI settings self-heal/migration.
  - signed serial lifecycle E2E self-test.
  - runtime hard-cutoff watchdog tightening.
  - OpenWrt source pin and SDK `.ipk` build wrapper.
  - universal release artifact build contract.
- Documented that these changes are additive and keep donor capabilities behind the V2RayEZ UI/UX.

## Validation Run

```bash
python3 tools/merge_inventory.py
python3 - <<'PY'
from pathlib import Path
import json
inventory = json.loads(Path('MERGE_INVENTORY.json').read_text())
assert inventory['source_summary']['MICAFP-UnifiedShield']['file_count'] == 732
assert len(inventory['feature_probes']) == 27
trace = Path('MERGE_TRACEABILITY.md').read_text()
for needle in ['Milestones 30-35 additions', 'Universal release artifact build contract', 'OpenWrt source pin and SDK `.ipk` build wrapper', 'Runtime hard-cutoff watchdog tightening']:
    assert needle in trace, needle
print('traceability inventory refresh check pass')
PY
git diff --check
node tools/release_artifact_contract_gate.mjs
node tools/openwrt_packaging_gate.mjs
node tools/android_ai_settings_migration_gate.mjs
node tools/runtime_license_watchdog_gate.mjs
node tools/license_serial_e2e_selftest.mjs
```

Result: PASS.

## Scope Note

This milestone is documentation/traceability synchronization only. It does not mark remaining native builds or real connectivity/device/router/browser testing as complete.
