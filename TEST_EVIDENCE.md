# V2RayEZ Universal — Test Evidence Log

**Date:** 2026-09-01  
**Milestone:** 0 — baseline inventory and environment validation  
**Note:** This log records commands actually run in the current sandbox. It does not claim final platform/build/E2E completion.

---

## 1) Environment checks

| Check | Command | Result | Notes |
|---|---|---|---|
| Branch | `git branch --show-current` | `arena/01a05e13-v2rayez` | Correct Arena branch. |
| Python | `python3 --version` | `Python 3.11.2` | Available. |
| Node | `node --version` | `v22.22.3` | Available. |
| npm | `npm --version` | `10.9.8` | Available. |
| Go | `go test ./...` in EasySNI/MasterDnsVPN | failed: `/bin/bash: go: command not found` | Toolchain missing; validation blocked locally. |
| Rust | `cargo --version`, `rustc --version` | failed: `cargo: command not found`, `rustc: command not found` | Toolchain missing; validation blocked locally. |
| Java/Gradle | `java -version`, `./gradlew --version` in base V2RayEZ | failed: `java: command not found`; `./gradlew: Permission denied` | Java/Android SDK missing; wrapper chmod needed before Gradle use. |

---

## 2) Commands run

### 2.1 Inventory generation

```bash
python3 tools/merge_inventory.py
```

Result:

```text
Wrote MERGE_INVENTORY.json
Sources: 8
Feature probes: 27
```

Output artifact:

- `MERGE_INVENTORY.json`

### 2.2 V2RayEZ localization parity gate

Command:

```bash
bash "V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)/scripts/gates/string-key-parity.sh"
```

Result:

```text
=== I1 string-key-parity ===
base (values/strings.xml): 967 keys

-- values-fa: 967 keys --
OK: full parity with base

-- values-ru: 967 keys --
OK: full parity with base

GATE_STATUS=PASS
```

### 2.3 UAC-Windows Python syntax check

Command:

```bash
python3 -m compileall -q uac_desktop
```

Working directory:

```text
UAC-SNI-Spoofer-Windows- Make sure to fully add all features to the V2RayEZ app/
```

Result: exit code `0`, no syntax errors reported.

Cleanup performed afterwards:

```bash
find . -type d -name __pycache__ -prune -exec rm -rf {} +
```

### 2.4 Go test attempts

Commands:

```bash
go test ./...
```

Working directories:

- `EasySNI- Make sure to fully add all features to the V2RayEZ app/`
- `MasterDnsVPN-main/`

Result for both:

```text
/bin/bash: line 1: go: command not found
```

Status: `blocked` until Go 1.24+ is available.

### 2.5 Rust toolchain check

Command:

```bash
cargo --version || true; rustc --version || true
```

Result:

```text
/bin/bash: line 1: cargo: command not found
/bin/bash: line 1: rustc: command not found
```

Status: `blocked` until Rust stable and target toolchains are available.

### 2.6 Android baseline build attempt

Command:

```bash
java -version 2>&1 | head -20; ./gradlew --version
```

Working directory:

```text
V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)/
```

Result:

```text
/bin/bash: line 1: java: command not found
/bin/bash: line 1: ./gradlew: Permission denied
```

Status: `blocked` until Java 17/Android SDK/NDK are installed and Gradle wrapper executable bit is fixed or invoked through `bash gradlew`.

---

## 3) E2E connectivity evidence

No real tunnel E2E traffic test was run in Milestone 0 because:

1. No real test server credentials/configs are available in this sandbox.
2. Required toolchains for building transport binaries are missing.
3. Mobile/iOS/OpenWrt/Windows runtime environments are not present in this Linux sandbox.

Required future E2E proof per transport family:

| Family | Required probe | Status |
|---|---|---|
| TCP/TLS VLESS/VMess/Trojan/Shadowsocks/REALITY/NaïveProxy/ShadowTLS | HTTP 204 + DNS + throughput through tunnel | pending |
| QUIC Hysteria2/TUIC/MASQUE/WebTransport | HTTP 204 + DNS + throughput through tunnel | pending |
| WireGuard/AmneziaWG/WARP | HTTP 204 + DNS + throughput through tunnel | pending |
| Tor/Psiphon/PT/WebTunnel | HTTP 204 + DNS + throughput through tunnel | pending |
| MasterDnsVPN DNS tunnel/DoH/DoQ | HTTP 204 + DNS + throughput through DNS tunnel | pending |
| Domain fronting/CDN workers | fronted request + DoH + logs | pending |
| Mesh/P2P/National Intranet | lab shutdown simulation + mesh/P2P checks | pending |

---

## 4) Artifact checksum log

Milestone 0 produced documentation/inventory artifacts only. No release binary artifacts were produced.

Future binary artifacts must list:

- filename
- target platform/ABI
- build command
- SHA-256
- signing identity/status
- E2E test reference

---

## 5) Current blockers

| Blocker | Impact | Next action |
|---|---|---|
| Missing Go | EasySNI and MasterDnsVPN cannot be test-built locally | Install Go 1.24+ in CI/dev image. |
| Missing Rust | MICAFP/Aether/wasm-obfuscator cannot be test-built locally | Install Rust stable plus Android/iOS/wasm targets. |
| Missing Java/Android SDK/NDK | APK cannot be built locally | Install Java 17, Android SDK, NDK 27.x; fix wrapper permission. |
| Missing Xcode/signing | IPA cannot be built in Linux sandbox | Run on macOS runner with Apple signing and Network Extension entitlements. |
| Missing Windows toolchain | EXE installer/portable cannot be built locally | Run on Windows x64 CI runner with MSVC/WiX/Tauri/PyInstaller/Npcap packaging. |
| Missing OpenWrt SDK | IPK cannot be built locally | Provide generic OpenWrt SDK/container. |
| Missing real test endpoints | E2E cannot prove traffic | Provide/create reproducible lab servers for each transport family. |

---

## 6) Milestone 1 evidence — license and AI gateway core APIs

### 6.1 License crypto self-test

Command:

```bash
node tools/license_crypto_selftest.mjs
```

Result:

```text
license_crypto_selftest: PASS
```

Validated behaviors:

- Generates Ed25519 key pair for test.
- Signs a V2RayEZ license token.
- Verifies the compact token signature and payload.
- Rejects a tampered payload/signature.
- Hashes device IDs with a salt.
- Signs/verifies offline grace token.
- Calculates active vs expired license state.

### 6.2 AI Provider Gateway self-test

Command:

```bash
node tools/ai_provider_gateway_selftest.mjs
```

Result:

```text
ai_provider_gateway_selftest: PASS
```

Validated behaviors:

- Builds a provider request from JSON configuration.
- Expands `${model}`, `${prompt}`, and `${system}` templates in endpoint paths and bodies.
- Detects OpenAI, Anthropic, Gemini, and generic REST response shapes from a real local HTTP test server.
- Redacts API keys/secrets in provider configs.
- Returns local MICAFP AI fallback descriptor when external AI is unavailable.

### 6.3 JavaScript syntax checks

Command:

```bash
node --check MICAFP/dashboard/src/lib/license-crypto.mjs
node --check MICAFP/dashboard/src/lib/ai-provider-gateway.mjs
```

Result: pass.

### 6.4 Localization regression gate after Milestone 1 additions

Command:

```bash
bash "V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)/scripts/gates/string-key-parity.sh"
```

Result: pass; EN/FA/RU remain at 967 keys each.

### 6.5 UAC-Windows Python syntax regression

Command:

```bash
python3 -m compileall -q uac_desktop
```

Result: pass; `__pycache__` output removed.

### 6.6 Rust universal core build status

Files added under `universal-core/`:

- `Cargo.toml`
- `src/lib.rs`
- `src/license.rs`
- `src/ai_provider.rs`
- `src/config.rs`
- `src/core_manager.rs`

Local compilation remains blocked because `cargo`/`rustc` are not installed in the sandbox. The Rust code includes real implementations and unit tests, but must be compiled in a Rust-enabled CI/dev image before any completion claim.

---

## 7) Milestone 2 Android wiring checks

### 7.1 Localization parity after Android License/AI strings

Command:

```bash
bash "V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)/scripts/gates/string-key-parity.sh"
```

Result:

```text
GATE_STATUS=PASS
base (values/strings.xml): 1017 keys
values-fa: 1017 keys
values-ru: 1017 keys
```

### 7.2 Android Gradle build status after wiring

Command:

```bash
bash "V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)/gradlew" --version
```

Result: blocked locally because Java is absent:

```text
ERROR: JAVA_HOME is not set and no 'java' command could be found in your PATH.
```

No APK/build/connectivity completion claim is made from this sandbox. The new Android code still requires a Java/Android SDK environment and device or emulator validation.

### 7.3 Regression self-tests rerun after Android wiring

Commands:

```bash
node tools/license_crypto_selftest.mjs
node tools/ai_provider_gateway_selftest.mjs
python3 -m compileall -q "UAC-SNI-Spoofer-Windows- Make sure to fully add all features to the V2RayEZ app/uac_desktop"
```

Results:

```text
license_crypto_selftest: PASS
ai_provider_gateway_selftest: PASS
UAC Windows compileall: PASS
```

The first attempted UAC compileall rerun used an obsolete directory name and printed `Can't list ...`; the corrected path above passed and generated cache directories were removed.

### 7.4 Android string XML parse check

Command:

```bash
python3 - <<'PY'
from xml.etree import ElementTree as ET
from pathlib import Path
for p in Path('V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)/app/src/main/res').glob('values*/strings.xml'):
    ET.parse(p)
print('xml_strings_parse: PASS')
PY
```

Result: `xml_strings_parse: PASS`.

---

## Milestone 3 desktop/Tauri + Android controller validation — 2026-09-01

### Desktop frontend/static checks

Command:

```bash
cd "V2RayEZ-GUI"
node --check src/app.js && node --check src/i18n.js && npm test
node -e "JSON.parse(require('fs').readFileSync('src-tauri/tauri.conf.json','utf8')); console.log('tauri config json pass')"
```

Result: PASS.

Observed TAP summary:

- 14 tests executed.
- 14 passed.
- 0 failed.

New coverage includes License + AI Engine UI controls, EN/FA translation completeness, Tauri command references, connected-session license watchdog reference, and normal settings staying secret-free.

### Android controller license preflight gates

Command:

```bash
bash "V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)/scripts/gates/string-key-parity.sh"
```

Result: PASS.

Observed output:

```text
base (values/strings.xml): 1017 keys
values-fa: 1017 keys — OK
values-ru: 1017 keys — OK
GATE_STATUS=PASS
```

Command:

```bash
python3 - <<'PY'
import xml.etree.ElementTree as ET
from pathlib import Path
base=Path('V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)/app/src/main/res')
for path in sorted(base.glob('values*/strings.xml')):
    ET.parse(path)
    print(f'PASS {path}')
PY
```

Result: PASS for `values/strings.xml`, `values-fa/strings.xml`, and `values-ru/strings.xml`.

Command:

```bash
git diff --check
```

Result: PASS.

### Toolchain blockers rechecked

Command:

```bash
cargo --version
```

Result: BLOCKED — `/bin/bash: line 1: cargo: command not found`.

Command:

```bash
cd "V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)"
bash gradlew --version
```

Result: BLOCKED — `JAVA_HOME is not set and no 'java' command could be found in your PATH`.

---

## Milestone 4 OpenWrt LuCI checks — 2026-09-01

Command:

```bash
sh -n MICAFP/openwrt/files/usr/libexec/unifiedshield/license-gate.sh
sh -n MICAFP/openwrt/files/etc/init.d/unifiedshield
```

Result: PASS — OpenWrt shell helper/init syntax accepted by `/bin/sh -n`.

Command:

```bash
lua -v
```

Result: BLOCKED — Lua/LuCI runtime is not installed in the sandbox, so `ai-provider-test.lua` and LuCI CBI/controller files could not be parsed/executed locally.

OpenWrt package build result: BLOCKED — OpenWrt SDK/toolchain is absent, so no `.ipk` artifact was generated locally.

---

## Milestone 5 iOS static checks — 2026-09-01

Command:

```bash
python3 - <<'PY'
from pathlib import Path
files=[
'MICAFP/ios/UnifiedShield/App/LicenseManager.swift',
'MICAFP/ios/UnifiedShield/App/AIProviderGateway.swift',
'MICAFP/ios/UnifiedShield/App/SettingsView.swift',
'MICAFP/ios/UnifiedShield/NetworkExtension/TunnelManager.swift',
'MICAFP/ios/UnifiedShield/NetworkExtension/PacketTunnelProvider.swift',
'MICAFP/ios/UnifiedShield/NetworkExtension/ExtensionLicenseGate.swift',
'MICAFP/ios/UnifiedShield/NetworkExtension/ExtensionAIAdvisor.swift',
]
for f in files:
    text=Path(f).read_text()
    bal=0
    for ch in text:
        if ch=='{': bal+=1
        elif ch=='}': bal-=1
    print(f, 'brace_balance=', bal, 'lines=', len(text.splitlines()))
PY
```

Result: PASS — brace balance 0 for all seven iOS files touched/added in Milestone 5.

Command:

```bash
swift --version
```

Result: BLOCKED — `swift` is not installed in this Linux sandbox; no Xcode build or `.ipa` export was run.

---

## Milestone 6 dashboard UI validation attempt — 2026-09-01

Command:

```bash
cd MICAFP/dashboard
npm run lint
```

Result: BLOCKED — dashboard dependencies are not installed in the sandbox; command failed with `sh: 1: eslint: not found`.

Static integration added but not fully validated:

- `src/components/license-admin-panel.tsx`
- `src/components/ai-provider-gateway-panel.tsx`
- `src/app/page.tsx` tabs for `license` and `ai-gateway`

Next required validation after dependency installation: `npm ci`, `npm run lint`, `npm run build`, `prisma validate`, Prisma client generation, and route-level API tests.

### Milestone 6 helper self-test rerun

Command:

```bash
node tools/license_crypto_selftest.mjs
node tools/ai_provider_gateway_selftest.mjs
git diff --check
```

Result: PASS.

Observed output:

```text
license_crypto_selftest: PASS
ai_provider_gateway_selftest: PASS
```

`git diff --check` also passed with no whitespace errors.

---

## Consolidated local rerun after Milestones 3–6 — 2026-09-01

Commands rerun:

```bash
cd "V2RayEZ-GUI"
node --check src/app.js
node --check src/i18n.js
node --check tests/frontend.test.mjs
npm test
node -e "JSON.parse(require('fs').readFileSync('src-tauri/tauri.conf.json','utf8')); console.log('tauri config json pass')"

cd /home/user/V2RayEZ
bash "V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)/scripts/gates/string-key-parity.sh"
python3 - <<'PY'
import xml.etree.ElementTree as ET
from pathlib import Path
base=Path('V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)/app/src/main/res')
for path in sorted(base.glob('values*/strings.xml')):
    ET.parse(path)
    print(f'PASS {path}')
PY
node tools/license_crypto_selftest.mjs
node tools/ai_provider_gateway_selftest.mjs
sh -n MICAFP/openwrt/files/usr/libexec/unifiedshield/license-gate.sh
sh -n MICAFP/openwrt/files/etc/init.d/unifiedshield
git diff --check
```

Results:

- V2RayEZ desktop GUI JS syntax checks — PASS.
- V2RayEZ desktop GUI frontend tests — PASS, 14/14.
- Tauri config JSON parse — PASS.
- Android EN/FA/RU string parity — PASS, 1017 keys each.
- Android string XML parse — PASS.
- License crypto MJS self-test — PASS.
- AI provider gateway MJS self-test — PASS.
- OpenWrt shell helper/init syntax — PASS.
- Swift static brace balance for Milestone 5 files — PASS.
- `git diff --check` — PASS.

---

## Milestone 7 V2RayEZ GUI correction validation — 2026-09-01

User correction: legacy Aether GUI donor must not be the final GUI; the final GUI must be V2RayEZ.

Commands:

```bash
cd "V2RayEZ-GUI"
node --check src/app.js
node --check src/i18n.js
node --check tests/frontend.test.mjs
npm test
node -e "JSON.parse(require('fs').readFileSync('src-tauri/tauri.conf.json','utf8')); console.log('tauri config json pass')"

grep -RE "Ae(thon|therGUI)|AetherGui|aether_gui_lib|aether-gui" -n src src-tauri tests --exclude-dir=target
```

Result: PASS for syntax/tests/config JSON.

Observed:

- `npm test` PASS — 14/14.
- Package identity is `@v2rayez/universal-gui`.
- Tauri product name is `V2RayEZ` and identifier is `app.v2rayez.universal`.
- Static tests assert no legacy donor GUI product strings remain in the desktop GUI HTML/JS/Tauri metadata/Cargo metadata.
- Grep across `src`, `src-tauri`, and `tests` only finds the negative-regression assertion itself; no runtime product string remains.

---

## Milestone 8 dashboard build/lint recovery — 2026-09-01

Commands:

```bash
cd MICAFP/dashboard
npm install --ignore-scripts
npm run lint
npm run build
```

Initial failure 1: `next/font/google` could not fetch `Geist Mono` and `Vazirmatn` from Google Fonts. Fixed by removing remote font dependency and using offline-safe CSS font variables.

Initial failure 2: Prisma client generation was unavailable offline and strict TypeScript surfaced license-service typing errors. Fixed by lazy-loading Prisma at API runtime, preserving a clear runtime error if `npm run db:generate` has not been run, and adding typed crypto-helper boundaries.

Final result: PASS.

Observed:

- `npm run lint` PASS.
- `npm run build` PASS.
- Next.js compiled successfully, TypeScript finished, and static generation completed 27/27 pages.
- License and AI Provider Gateway API routes were included in the production route manifest.
- `npm run db:generate` remains blocked by `binaries.prisma.sh` engine download/TLS failure; runtime DB API tests still require generated Prisma client plus `DATABASE_URL`.

---

## Milestone 9 V2RayEZ-GUI path and legacy brand removal — 2026-09-01

User reiterated that the GUI must be V2RayEZ GUI and not the old donor GUI identity.

Commands:

```bash
cd V2RayEZ-GUI
node --check src/app.js
node --check src/i18n.js
node --check tests/frontend.test.mjs
npm test
node -e "JSON.parse(require('fs').readFileSync('src-tauri/tauri.conf.json','utf8')); console.log('tauri config json pass')"

cd ..
python3 - <<'PY'
from pathlib import Path
import xml.etree.ElementTree as ET
for p in [Path('V2RayEZ-GUI/android/app/src/main/res/values/strings.xml'), Path('V2RayEZ-GUI/android/app/src/main/res/values-fa/strings.xml'), Path('V2RayEZ-GUI/android/app/src/main/AndroidManifest.xml')]:
    ET.parse(p)
    print('xml pass', p)
PY
python3 tools/merge_inventory.py
grep -R -i "firstham\|hamvex\|aethon\|aethergui\|aether-gui\|com.firstham" -n V2RayEZ-GUI --exclude-dir=target --exclude-dir=node_modules --exclude='*.png' --exclude='*.ico' --exclude='*.icns'
find . -maxdepth 1 -type d -name 'AetherGUI*' -print
git diff --check
```

Final result: PASS.

Observed:

- Desktop GUI tests PASS — 14/14.
- Tauri config JSON parse PASS.
- V2RayEZ-GUI Android manifest/strings XML parse PASS.
- Case-insensitive legacy donor GUI/user/channel/package grep under `V2RayEZ-GUI/` returned no matches.
- No root directory matching the old donor GUI prefix remains.
- Inventory regeneration PASS: 8 sources, 27 feature probes.
- `git diff --check` PASS.

---

## Milestone 10 OpenWrt LuCI packaging preservation — 2026-09-01

Commands:

```bash
sh -n MICAFP/openwrt/files/etc/init.d/unifiedshield
sh -n MICAFP/openwrt/files/usr/libexec/unifiedshield/license-gate.sh
python3 -m json.tool MICAFP/openwrt/files/usr/share/rpcd/acl.d/luci-app-unifiedshield.json >/dev/null
grep -n "view/unifiedshield/status.htm\|view/unifiedshield/advanced.htm\|luci-app-unifiedshield.json\|model/unifiedshield.lua\|model/cbi/unifiedshield.lua\|iran_ip_ranges.txt" MICAFP/openwrt/Makefile
python3 - <<'PY'
from pathlib import Path
checks = {
    Path('MICAFP/openwrt/src/luci-app-unifiedshield/luasrc/controller/unifiedshield.lua'): [
        '{"admin", "services", "unifiedshield", "api", "resilience"}',
        'template("unifiedshield/advanced")',
        'template("unifiedshield/status")',
        'function action_api_resilience()'
    ],
    Path('MICAFP/openwrt/files/usr/lib/lua/luci/view/unifiedshield/advanced.htm'): [
        'admin/services/unifiedshield/api/resilience',
        '<%+header%>',
        '<%+footer%>'
    ],
}
for path, needles in checks.items():
    text=path.read_text()
    for needle in needles:
        assert needle in text, (path, needle)
    print('openwrt static pass', path)
PY
git diff --check
```

Result: PASS.

Observed:

- OpenWrt init and license gate shell syntax PASS.
- LuCI rpcd ACL JSON parse PASS.
- Package Makefile now installs LuCI status and advanced templates, model helper, both CBI model paths, ACL, and Iran IP range asset.
- Controller exposes template pages plus API endpoints for status/start/stop/restart/resilience/log.
- Advanced LuCI view uses LuCI header/footer syntax and LuCI API path.
- `git diff --check` PASS.

Toolchain unblock attempt:

```bash
sudo apt-get update && sudo apt-get install -y openjdk-17-jdk-headless cargo rustc golang-go lua5.4
```

Result: BLOCKED. Debian package mirrors were unreachable from the sandbox, so Java/Rust/Go/Lua native build tools could not be installed.

---

## Milestone 11 OpenWrt netifd integration and C source repair — 2026-09-01

Commands:

```bash
sh -n MICAFP/openwrt/files/etc/init.d/unifiedshield
sh -n MICAFP/openwrt/files/usr/libexec/unifiedshield/license-gate.sh
sh -n MICAFP/openwrt/files/lib/netifd/proto/unifiedshield.sh
grep -R "nullptr" -n MICAFP/openwrt/src || true
gcc -std=gnu99 -Wall -Wextra -fsyntax-only -I MICAFP/openwrt/src \
  MICAFP/openwrt/src/main.c MICAFP/openwrt/src/netifd_proto.c
grep -n "lib/netifd/proto/unifiedshield.sh" MICAFP/openwrt/Makefile
git diff --check
```

Result: PASS.

Observed:

- Init script, license gate, and new netifd protocol script pass `sh -n`.
- OpenWrt C sources no longer contain `nullptr`.
- `main.c` and `netifd_proto.c` pass local GCC syntax checks with `-std=gnu99 -Wall -Wextra -fsyntax-only`.
- Package Makefile installs `/lib/netifd/proto/unifiedshield.sh` and declares `+netifd`.
- `git diff --check` PASS.

---

## Milestone 12 CI workflow templates and inventory stabilization — 2026-09-01

Commands:

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

Result: PASS locally for syntax/static checks.

Observed:

- Active root `.github/workflows/*.yml` files were prepared but cannot be pushed by the current Arena GitHub App connection because GitHub rejects workflow updates without `workflows` permission.
- The full workflows were preserved as templates under `docs/ci/github-workflows/*.yml.sample` for later activation.
- `MERGE_INVENTORY.json` was regenerated, and `tools/merge_inventory.py` now ignores generated/cache directories for stable clean-checkout results.
- Full artifact builds remain dependent on active workflow placement, GitHub-hosted toolchains, and target-specific signing/SDK inputs.

---

## Milestone 13 iOS V2RayEZ identity and IPA project preparation — 2026-09-01

Commands:

```bash
python3 - <<'PY'
from pathlib import Path
import plistlib
for path in [Path('MICAFP/ios/Info.plist'), Path('MICAFP/ios/V2RayEZPacketTunnel/Info.plist'), Path('MICAFP/ios/ExportOptions.plist'), Path('MICAFP/ios/V2RayEZ.entitlements'), Path('MICAFP/ios/V2RayEZPacketTunnel.entitlements')]:
    with path.open('rb') as fh:
        data = plistlib.load(fh)
    print('plist pass', path, data.get('CFBundleIdentifier', 'entitlements/export'))
for path in [Path('MICAFP/ios/project.yml'), *Path('docs/ci/github-workflows').glob('*.yml.sample')]:
    text = path.read_text()
    assert '\t' not in text, f'tab in {path}'
    assert text.endswith('\n')
    print('yaml basic pass', path, len(text.splitlines()))
PY
python3 - <<'PY'
from pathlib import Path
files = [
    Path('MICAFP/ios/UnifiedShield/App/AIProviderGateway.swift'),
    Path('MICAFP/ios/UnifiedShield/App/LicenseManager.swift'),
    Path('MICAFP/ios/UnifiedShield/App/SettingsView.swift'),
    Path('MICAFP/ios/UnifiedShield/App/StatusView.swift'),
    Path('MICAFP/ios/UnifiedShield/NetworkExtension/ExtensionAIAdvisor.swift'),
    Path('MICAFP/ios/UnifiedShield/NetworkExtension/ExtensionLicenseGate.swift'),
    Path('MICAFP/ios/UnifiedShield/NetworkExtension/PacketTunnelProvider.swift'),
    Path('MICAFP/ios/UnifiedShield/NetworkExtension/TunnelManager.swift'),
]
for path in files:
    text = path.read_text()
    assert text.count('{') == text.count('}'), f'brace imbalance: {path}'
    print('swift brace pass', path)
PY
grep -R -n "hamvex" "EasySNI- Make sure to fully add all features to the V2RayEZ app/Configs/Spoof-Configs.txt" || true
grep -R -n "com\.shield\|com\.unifiedshield\.packet-tunnel\|UnifiedShield VPN\|serverAddress: \"UnifiedShield\"\|navigationTitle(\"UnifiedShield\")" MICAFP/ios/Info.plist MICAFP/ios/UnifiedShield || true
git diff --check
```

Result: PASS locally.

Observed:

- Active iOS app/extension plist files and entitlements parse successfully.
- XcodeGen/project workflow templates pass basic whitespace/newline checks.
- Active touched Swift files pass brace-balance checks.
- No `hamvex` marker remains in the EasySNI sample config after relabeling the fragment to V2RayEZ.
- Active iOS product-identity grep returned no old bundle/user-visible names except donor provenance comments.
- `git diff --check` PASS.

---

## Milestone 14 cross-platform V2RayEZ-GUI sidecar staging — 2026-09-01

Commands:

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

- `prepare-sidecar.mjs` staged Aether and sing-box for Linux and Windows Tauri target triples using environment-provided sidecar binaries.
- No generated sidecar binaries were left in the worktree after validation.
- V2RayEZ-GUI frontend tests PASS — 14/14.
- `git diff --check` PASS.

---

## Milestone 15 dashboard V2RayEZ identity preservation — 2026-09-01

Commands:

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

- `npm ci --ignore-scripts --workspace dashboard` installed 859 packages successfully. npm reported 9 dependency vulnerabilities (4 moderate, 5 high), which are upstream dependency audit findings and not caused by the branding edits.
- Dashboard ESLint PASS.
- Dashboard Next.js production build PASS.
- Dashboard package JSON and package-lock JSON parse PASS.
- Merge inventory regeneration produced no drift.
- `git diff --check` PASS.

---

## Milestone 16 browser extension V2RayEZ packaging path — 2026-09-01

Commands:

```bash
npm ci --ignore-scripts --workspace extensions/chrome --workspace extensions/firefox
npm run lint --workspace extensions/chrome
npm run lint --workspace extensions/firefox
npm run build --workspace extensions/chrome
npm run build --workspace extensions/firefox
node --check MICAFP/extensions/scripts/build-extension.mjs
python3 -m json.tool MICAFP/extensions/chrome/manifest.json >/dev/null
python3 -m json.tool MICAFP/extensions/firefox/manifest.json >/dev/null
python3 -m json.tool MICAFP/extensions/chrome/package.json >/dev/null
python3 -m json.tool MICAFP/extensions/firefox/package.json >/dev/null
node - <<'NODE'
const fs = require('fs');
for (const path of ['MICAFP/extensions/chrome/dist/manifest.json', 'MICAFP/extensions/firefox/dist/manifest.json']) {
  const manifest = JSON.parse(fs.readFileSync(path, 'utf8'));
  if (manifest.name !== 'V2RayEZ Universal' || manifest.version !== '2.0.0') throw new Error(`${path} identity drift`);
  console.log('extension manifest pass', path, manifest.name, manifest.version, manifest.action?.default_popup || manifest.browser_action?.default_popup);
}
NODE
(cd MICAFP/extensions/chrome/dist && zip -qr ../../v2rayez-chrome-extension.zip .)
(cd MICAFP/extensions/firefox/dist && zip -qr ../../v2rayez-firefox-extension.zip .)
ls -l MICAFP/extensions/v2rayez-*-extension.zip
rm -f MICAFP/extensions/v2rayez-chrome-extension.zip MICAFP/extensions/v2rayez-firefox-extension.zip
python3 tools/merge_inventory.py
git diff --check
```

Result: PASS, with the expected warning that the real WASM obfuscator artifact is missing and fallback packaging was used.

Observed:

- Chrome and Firefox extension dependencies installed successfully.
- Chrome and Firefox TypeScript lint/typecheck PASS.
- Chrome and Firefox package builds PASS.
- Packaged manifests validate as V2RayEZ Universal v2.0.0.
- Extension ZIP packaging smoke test PASS; generated zips were removed after validation.
- `MERGE_INVENTORY.json` regenerated.
- `git diff --check` PASS.

---

## Milestone 17 OpenWrt LuCI serial install controls — 2026-09-01

Commands:

```bash
python3 - <<'PY'
from pathlib import Path
path = Path('MICAFP/openwrt/src/luci-app-unifiedshield/luasrc/model/cbi/unifiedshield/config.lua')
text = path.read_text()
for needle in ['_license_serial', 'license_token_file', 'fs.writefile(license_token_file', 'util.shellquote', '_license_clear_serial']:
    assert needle in text, needle
assert 'LuCI never displays the serial value' in text
print('openwrt cbi license serial controls pass')
PY
sh -n MICAFP/openwrt/files/usr/libexec/unifiedshield/license-gate.sh
sh -n MICAFP/openwrt/files/lib/netifd/proto/unifiedshield.sh
git diff --check
```

Result: PASS.

Observed:

- OpenWrt CBI serial install/clear controls are present.
- The serial control writes `/etc/unifiedshield/license.token`, uses `0600`, and never echoes the serial back through LuCI/UCI.
- License gate and netifd shell syntax still pass.
- `git diff --check` PASS.

---

## Milestone 18 OpenWrt LuCI AI secret rotation controls — 2026-09-02

Commands:

```bash
python3 - <<'PY'
from pathlib import Path
path = Path('MICAFP/openwrt/src/luci-app-unifiedshield/luasrc/model/cbi/unifiedshield/config.lua')
text = path.read_text()
for needle in [
    'local ai_secret_dir = "/etc/unifiedshield/ai-secrets"',
    'local function safe_alias(alias)',
    '_api_key_secret',
    'fs.writefile(secret_path, value .. "\\n")',
    'chmod 600',
    '_api_key_clear_secret',
]:
    assert needle in text, needle
assert 'never stored in UCI or echoed back' in text
print('openwrt ai secret controls pass')
PY
sh -n MICAFP/openwrt/files/usr/libexec/unifiedshield/license-gate.sh
sh -n MICAFP/openwrt/files/lib/netifd/proto/unifiedshield.sh
git diff --check
```

Result: PASS.

Observed:

- OpenWrt AI Provider Gateway now has LuCI controls to install/rotate and clear alias-backed API key secrets.
- API keys are written to `/etc/unifiedshield/ai-secrets/<alias>.secret` with `0600`, are not stored in UCI, and are never echoed back to LuCI.
- License gate and netifd shell syntax still pass.
- `git diff --check` PASS.

---

## Milestone 19 OpenWrt package source and feature consistency — 2026-09-02

Commands:

```bash
python3 - <<'PY'
from pathlib import Path
p = Path('MICAFP/openwrt/Makefile')
text = p.read_text()
checks = [
    'PKG_VERSION:=2.0.0',
    'PKG_SOURCE_URL:=https://github.com/ysa-py/V2RayEZ.git',
    'PKG_SOURCE_VERSION:=arena/01a05e13-v2rayez',
    '--features platform-openwrt',
    '$(PKG_BUILD_DIR)/MICAFP/daemon/Cargo.toml',
    'TITLE:=V2RayEZ Universal Router Gateway',
]
for needle in checks:
    assert needle in text, needle
assert '--features openwrt' not in text
assert 'MICAFP/UnifiedShield.git' not in text
print('openwrt makefile source/feature checks pass')
PY
sh -n MICAFP/openwrt/files/etc/init.d/unifiedshield
sh -n MICAFP/openwrt/files/usr/libexec/unifiedshield/license-gate.sh
sh -n MICAFP/openwrt/files/lib/netifd/proto/unifiedshield.sh
gcc -std=gnu99 -Wall -Wextra -fsyntax-only -I MICAFP/openwrt/src \
  MICAFP/openwrt/src/main.c MICAFP/openwrt/src/netifd_proto.c
git diff --check
```

Result: PASS.

Observed:

- OpenWrt package source now points to the integrated V2RayEZ repository/branch.
- OpenWrt daemon build feature now uses the actual `platform-openwrt` feature.
- V2RayEZ repository layout and donor-source layout are both detected for daemon/config build paths.
- OpenWrt shell and C syntax checks still pass.
- `git diff --check` PASS.

---

## Milestone 20 native license gate CLI wiring — 2026-09-02

Commands:

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

Observed:

- `universal-core` now declares the `v2rayez-license-gate` binary.
- Native gate source includes local signed-license verification, online validation, signed grace validation, UCI status updates, and hard-cutoff reporting.
- OpenWrt package Makefile builds and installs `/usr/bin/v2rayez-license-gate` when using the V2RayEZ source layout.
- Workflow templates now include Rust core/license-gate build coverage for future activation.
- `git diff --check` PASS.

Blocked locally:

- Rust/Cargo are unavailable in this sandbox, so native compile/test remains pending until the toolchain is available.

---

## Milestone 21 Android license and AI provider settings — 2026-09-02

Commands:

```bash
python3 - <<'PY'
import xml.etree.ElementTree as ET
for path in [
    'V2RayEZ-GUI/android/app/src/main/res/layout/activity_main.xml',
    'V2RayEZ-GUI/android/app/src/main/res/values/strings.xml',
    'V2RayEZ-GUI/android/app/src/main/res/values-fa/strings.xml',
]:
    ET.parse(path)
    print('xml ok', path)
PY
python3 - <<'PY'
from pathlib import Path
files = {
 'MainActivity': Path('V2RayEZ-GUI/android/app/src/main/java/app/v2rayez/gui/MainActivity.java').read_text(),
 'Service': Path('V2RayEZ-GUI/android/app/src/main/java/app/v2rayez/gui/AetherVpnService.java').read_text(),
 'Controller': Path('V2RayEZ-GUI/android/app/src/main/java/app/v2rayez/gui/VpnConnectionController.java').read_text(),
 'SecretStore': Path('V2RayEZ-GUI/android/app/src/main/java/app/v2rayez/gui/AndroidSecretStore.java').read_text(),
 'LicenseGate': Path('V2RayEZ-GUI/android/app/src/main/java/app/v2rayez/gui/AndroidLicenseGate.java').read_text(),
 'Layout': Path('V2RayEZ-GUI/android/app/src/main/res/layout/activity_main.xml').read_text(),
}
checks = {
 'MainActivity': ['saveLicenseSettings', 'saveAiSettings', 'AndroidLicenseGate.Decision', 'continueConnectAfterLicense', 'license_validating'],
 'Service': ['V2RAYEZ_LICENSE_KEY', 'V2RAYEZ_LICENSE_SERVER', 'V2RAYEZ_AI_PROVIDER_API_KEY', 'V2RAYEZ_AI_LOCAL_FALLBACK'],
 'Controller': ['licenseAccountId', 'licenseServerUrl', 'aiProviderAlias', 'aiLocalFallback'],
 'SecretStore': ['AndroidKeyStore', 'AES/GCM/NoPadding', 'LICENSE_SERIAL', 'AI_API_KEY'],
 'LicenseGate': ['HttpURLConnection', '/api/licenses/validate', 'offlineGraceUntil', 'localHardCutoff', 'license_expired', 'offline_grace_expired'],
 'Layout': ['license_serial_input', 'ai_api_key_input', 'ai_provider_endpoint_input'],
}
for name, needles in checks.items():
    text = files[name]
    for needle in needles:
        assert needle in text, f'{name}: {needle}'
print('android license gate/settings static checks pass')
PY
git diff --check
```

Result: PASS.

Observed:

- Android settings now includes license activation and AI Engine/API provider controls.
- Signed serial and AI API key are encrypted via Android Keystore AES-GCM and hidden behind a placeholder.
- VPN/proxy connect path validates the installed signed serial against the dashboard endpoint and hard-cuts off expired cached license/grace state when serial mode is active.
- Native process launch exports V2RayEZ license/AI provider environment variables without logging secret values.

Blocked locally:

- Android Gradle/Java/device runtime validation remains blocked by absent Java, Android SDK/NDK, signing credentials, and device/emulator hardware in this sandbox.

---

## Milestone 22 iOS shared license/AI storage hardening — 2026-09-02

Commands:

```bash
python3 - <<'PY'
import plistlib
from pathlib import Path
for path in ['MICAFP/ios/Info.plist','MICAFP/ios/V2RayEZPacketTunnel/Info.plist','MICAFP/ios/V2RayEZ.entitlements','MICAFP/ios/V2RayEZPacketTunnel.entitlements']:
    data = plistlib.loads(Path(path).read_bytes())
    print('plist ok', path, sorted(data.keys())[:4])
assert plistlib.loads(Path('MICAFP/ios/V2RayEZ.entitlements').read_bytes())['keychain-access-groups'] == ['$(AppIdentifierPrefix)app.v2rayez.ios']
assert plistlib.loads(Path('MICAFP/ios/V2RayEZPacketTunnel.entitlements').read_bytes())['keychain-access-groups'] == ['$(AppIdentifierPrefix)app.v2rayez.ios']
assert plistlib.loads(Path('MICAFP/ios/Info.plist').read_bytes())['V2RayEZKeychainAccessGroup'] == '$(AppIdentifierPrefix)app.v2rayez.ios'
assert plistlib.loads(Path('MICAFP/ios/V2RayEZPacketTunnel/Info.plist').read_bytes())['V2RayEZKeychainAccessGroup'] == '$(AppIdentifierPrefix)app.v2rayez.ios'
print('ios plist shared keychain assertions pass')
PY
python3 - <<'PY'
from pathlib import Path
checks = {
'MICAFP/ios/UnifiedShield/App/LicenseManager.swift':['UserDefaults(suiteName: "group.app.v2rayez.ios")', 'applyKeychainAccessGroup', 'V2RayEZKeychainAccessGroup'],
'MICAFP/ios/UnifiedShield/App/AIProviderGateway.swift':['UserDefaults(suiteName: "group.app.v2rayez.ios")', 'local-v2rayez', 'local://v2rayez', 'applyKeychainAccessGroup'],
'MICAFP/ios/UnifiedShield/App/SettingsView.swift':['store: UserDefaults(suiteName: "group.app.v2rayez.ios")', 'local-v2rayez', 'v2rayez-anti-dpi-local'],
'MICAFP/ios/UnifiedShield/NetworkExtension/ExtensionLicenseGate.swift':['UserDefaults(suiteName: "group.app.v2rayez.ios")', 'applyKeychainAccessGroup', 'V2RayEZKeychainAccessGroup'],
'MICAFP/ios/UnifiedShield/NetworkExtension/ExtensionAIAdvisor.swift':['UserDefaults(suiteName: "group.app.v2rayez.ios")', 'V2RayEZ core profile'],
}
for path, needles in checks.items():
    text = Path(path).read_text()
    for needle in needles:
        assert needle in text, f'{path}: {needle}'
print('ios shared settings/keychain static checks pass')
PY
git diff --check
```

Result: PASS.

Observed:

- App and Packet Tunnel entitlements now include the same V2RayEZ keychain access group.
- Both app and extension now use `group.app.v2rayez.ios` defaults for license and AI settings.
- License and AI Keychain queries attach the expanded `V2RayEZKeychainAccessGroup` when present.
- Local AI provider identity is V2RayEZ-specific with legacy `local-aether` compatibility.
- Android service user-visible logs/errors now say V2RayEZ core instead of Aether core while preserving donor binary names internally.

Blocked locally:

- Xcode and signed iOS runtime validation remain unavailable in this Linux sandbox.

---

## Milestone 23 desktop V2RayEZ identity and local AI defaults — 2026-09-02

Commands:

```bash
npm test --prefix V2RayEZ-GUI
python3 - <<'PY'
from pathlib import Path
text = Path('V2RayEZ-GUI/src/app.js').read_text()
for needle in ['local-v2rayez', 'local://v2rayez', 'v2rayez-anti-dpi-local', 'normalizeAiEngine', '[V2RayEZ core]']:
    assert needle in text, needle
settings = Path('V2RayEZ-GUI/src-tauri/src/settings.rs').read_text()
for needle in ['local-v2rayez', 'local://v2rayez', 'v2rayez-anti-dpi-local']:
    assert needle in settings, needle
process = Path('V2RayEZ-GUI/src-tauri/src/process.rs').read_text()
for needle in ['Starting V2RayEZ core', 'V2RayEZ core exited unexpectedly', 'V2RayEZ - {label}', 'Bundled V2RayEZ core adapter']:
    assert needle in process, needle
routing = Path('V2RayEZ-GUI/src-tauri/src/routing.rs').read_text()
for needle in ['V2RayEZ recovers', 'V2RayEZ is unavailable', 'V2RayEZ recovered']:
    assert needle in routing, needle
print('desktop V2RayEZ identity/static AI defaults pass')
PY
git diff --check
```

Result: PASS.

Observed:

- Frontend/Tauri local AI defaults are V2RayEZ-specific.
- Frontend migrates legacy `local-aether`/`local://aether`/`aether-anti-dpi-local` values to V2RayEZ equivalents.
- User-visible desktop process/routing strings now say V2RayEZ core/V2RayEZ.
- `npm test --prefix V2RayEZ-GUI` passed 14/14.

Blocked locally:

- Full native desktop compilation and installer/package generation remain blocked by missing Rust/Cargo and native Tauri dependencies.

---

## Milestone 24 browser extension license and AI provider controls — 2026-09-02

Commands:

```bash
set -e
npm run lint --prefix MICAFP/extensions/chrome
npm run lint --prefix MICAFP/extensions/firefox
npm run build --prefix MICAFP/extensions/chrome
npm run build --prefix MICAFP/extensions/firefox
python3 - <<'PY'
import json
from html.parser import HTMLParser
from pathlib import Path
class Parser(HTMLParser): pass
for path in ['MICAFP/extensions/chrome/options/options.html','MICAFP/extensions/firefox/options/options.html','MICAFP/extensions/chrome/dist/options/options.html','MICAFP/extensions/firefox/dist/options/options.html']:
    text = Path(path).read_text()
    Parser().feed(text)
    for needle in ['licenseSerial', 'licenseValidationUrl', 'aiProviderAlias', 'aiApiKey', 'local://v2rayez']:
        assert needle in text, f'{path}: {needle}'
for path in ['MICAFP/extensions/chrome/dist/manifest.json','MICAFP/extensions/firefox/dist/manifest.json']:
    manifest = json.loads(Path(path).read_text())
    assert manifest['name'] == 'V2RayEZ Universal'
    assert manifest['version'] == '2.0.0'
print('extension package options/manifests pass')
PY
python3 - <<'PY'
from pathlib import Path
checks = {
'MICAFP/extensions/shared/protocol.ts':['SECRETS', 'licenseValidationUrl', 'aiProviderBaseUrl', 'local://v2rayez'],
'MICAFP/extensions/chrome/background/service-worker.ts':['enforceLicense', 'license_expired', 'offline_grace_expired', 'browser-extension', 'api/licenses/validate'],
'MICAFP/extensions/firefox/background/background.ts':['enforceLicense', 'license_expired', 'offline_grace_expired', 'browser-extension', 'api/licenses/validate'],
'MICAFP/extensions/chrome/options/options.ts':['SECRET_PLACEHOLDER', 'licenseSerial', 'aiApiKey', 'safeAlias'],
'MICAFP/extensions/firefox/options/options.ts':['SECRET_PLACEHOLDER', 'licenseSerial', 'aiApiKey', 'safeAlias'],
}
for path, needles in checks.items():
    text = Path(path).read_text()
    for needle in needles:
        assert needle in text, f'{path}: {needle}'
print('extension license/ai static checks pass')
PY
git diff --check
```

Result: PASS.

Observed:

- Chrome and Firefox extension source and generated ignored `dist` options pages expose V2RayEZ license and AI provider controls.
- Extension secret values are stored under a separate secrets storage key and hidden with placeholders in the UI.
- Chrome MV3 and Firefox MV2 background scripts preflight serial-mode proxy startup, update license metadata, and fail closed on expiry/grace cutoff.
- Chrome/Firefox TypeScript lint and package builds passed.

Expected warning:

- Real WASM obfuscator artifact is missing; packaged empty WASM fallback remains deterministic.

Blocked locally:

- Browser runtime, real signed serial, and dashboard-backed online validation remain unavailable in this sandbox.
