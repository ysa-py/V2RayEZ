# Milestone 28 Report — V2RayEZ Runtime Identity Guard

Date: 2026-09-02
Branch: `arena/01a05e13-v2rayez`

## Goal

Turn the user's correction into an automated source gate: V2RayEZ UI/UX must remain the product interface, while AetherGUI/Aethon/Firstham donor UI identity must not leak into runtime surfaces. Donor capabilities and internal adapter names can still remain where required for compatibility/provenance.

## Changes Applied

- Added `tools/v2rayez_identity_gate.mjs`.
  - Scans runtime UI/app surfaces only:
    - Desktop V2RayEZ GUI frontend and Tauri sources.
    - Android V2RayEZ app sources/resources.
    - Dashboard sources.
    - Chrome/Firefox extension sources.
    - iOS app and Network Extension sources.
  - Fails on legacy GUI/product identity tokens:
    - `AetherGUI`
    - `Aether GUI`
    - `Aethon`
    - `Firstham`
    - `com.firstham`
    - `@hamvex`
  - Ignores binary/generated/build outputs and donor/provenance documentation.
- Updated `docs/ci/github-workflows/universal-source-gates.yml.sample` to call the identity gate once workflow-write permission is available.

## Validation Run

```bash
node --check tools/v2rayez_identity_gate.mjs
node tools/v2rayez_identity_gate.mjs
python3 - <<'PY'
from pathlib import Path
text = Path('docs/ci/github-workflows/universal-source-gates.yml.sample').read_text()
assert 'node tools/v2rayez_identity_gate.mjs' in text
assert 'Assert legacy GUI identity is absent from runtime UI surfaces' in text
assert '\t' not in text
print('identity gate workflow template check pass')
PY
git diff --check
```

Result: PASS.

## Important Scope Note

This gate does **not** delete donor capabilities. It only prevents legacy donor GUI/product naming from surfacing in V2RayEZ runtime UI/UX. Internal adapter names and third-party notices remain allowed when they are needed to preserve features, build compatibility, and legal provenance.

## Still Pending

- Activation of the workflow template as a real GitHub Actions workflow remains blocked by the existing GitHub App workflow-write permission limitation.
