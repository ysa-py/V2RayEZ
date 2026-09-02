# Milestone 15 Report — Dashboard V2RayEZ Identity Preservation

Date: 2026-09-01
Branch: `arena/01a05e13-v2rayez`

## Goal

Continue the final-product identity correction so the web dashboard presents V2RayEZ Universal, not the donor UnifiedShield/MICAFP name, while preserving donor implementation APIs and store identifiers for traceability and low-risk integration.

## Changes Applied

- Rebranded dashboard package metadata:
  - `MICAFP/dashboard/package.json` package name is now `v2rayez-universal-dashboard`.
  - `MICAFP/package-lock.json` workspace metadata/link was updated accordingly.
- Rebranded public Next.js metadata in `MICAFP/dashboard/src/app/layout.tsx`:
  - Title/openGraph title: `V2RayEZ — کنسول فرماندهی امنیت سایبری`.
  - Application/author identity: V2RayEZ.
  - Keywords now prioritize V2RayEZ/V2RayEZ Universal.
- Preserved old localStorage keys as migration fallbacks while using V2RayEZ keys going forward:
  - New locale key: `v2rayez-locale` with fallback to `shield-locale`.
  - New theme key: `v2rayez-theme` with fallback to `shield-theme`.
- Rebranded dashboard runtime copy in `MICAFP/dashboard/src/lib/i18n.tsx`:
  - App title: `V2RayEZ Universal`.
  - Protection/loading messages now name V2RayEZ.
- Rebranded user-visible diagnostic/export/client copy from UnifiedShield/MICAFP client to V2RayEZ client in:
  - `MICAFP/dashboard/src/lib/auto-scanner-engine.ts`.
  - `MICAFP/dashboard/src/components/auto-scanner-engine-panel.tsx`.
  - `MICAFP/dashboard/src/lib/unified-shield-store.ts`.

## Validation Run

```bash
npm ci --ignore-scripts --workspace dashboard
npm run lint --workspace dashboard
npm run build --workspace dashboard
node -e "JSON.parse(require('fs').readFileSync('MICAFP/dashboard/package.json','utf8')); JSON.parse(require('fs').readFileSync('MICAFP/package-lock.json','utf8')); console.log('dashboard package json pass')"
python3 tools/merge_inventory.py
git diff --exit-code MERGE_INVENTORY.json
git diff --check
```

Result: PASS.

Observed:

- `npm ci --ignore-scripts --workspace dashboard` installed 859 packages successfully. npm reported 9 dependency vulnerabilities (4 moderate, 5 high), which are upstream dependency audit findings and were not introduced by these identity-string edits.
- Dashboard ESLint PASS.
- Dashboard production build PASS with Next.js 16/Turbopack and all app/API routes compiled.
- Dashboard package JSON and package-lock JSON parse PASS.
- Merge inventory regeneration produced no drift.
- `git diff --check` PASS.

## Still Pending

- Runtime API/DB validation remains blocked until Prisma engine generation and a real `DATABASE_URL` are available.
- User-visible donor comments/internal TypeScript symbol names remain intentionally preserved where they are implementation/provenance identifiers rather than final product branding.
