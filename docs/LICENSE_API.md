# V2RayEZ Universal License Server REST API

**Status:** Milestone 1 initial implementation.  
**Dashboard base:** `MICAFP/dashboard` Next.js app.  
**Schema extension:** `MICAFP/dashboard/prisma/schema.prisma` now extends existing `User`, `Session`, and `AuditLog` with `License`, `DeviceActivation`, and `LicenseValidation`.

---

## Security model

- License keys are compact Ed25519-signed tokens: `base64url(header).base64url(payload).base64url(signature)`.
- Header: `{ "alg": "EdDSA", "kid": "...", "typ": "V2RayEZ-License" }`.
- Payload schema: `v2rayez.license.v1`.
- The server stores only a SHA-256 hash of the token plus the signed payload; validation verifies both signature and database state.
- Device binding is enforced by hashing a caller-provided stable device id with `LICENSE_DEVICE_HASH_SALT`.
- Validation returns a signed short-lived grace token with type `V2RayEZ-License-Grace`, bound to license id, user id, account id, device hash, platform, server time, grace-until, and expiry.
- Clients must gate tunnel startup in the unified core before any transport starts and must stop active tunnels once the signed expiry/grace window is reached.

Required environment variables:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Prisma/PostgreSQL connection. |
| `LICENSE_ED25519_PRIVATE_KEY_PEM` | PEM private key used to issue license and grace tokens. |
| `LICENSE_ED25519_PUBLIC_KEY_PEM` or `LICENSE_ED25519_PUBLIC_KEYS_JSON` | Public key(s) used for verification and key rotation. |
| `LICENSE_KEY_ID` | Current signing key id. Defaults to `default`. |
| `LICENSE_DEVICE_HASH_SALT` | Secret salt for device hash; minimum 16 characters. |
| `LICENSE_ADMIN_TOKEN` | Optional bootstrap bearer token for admin API calls before full dashboard auth is wired. |

Generate a development Ed25519 key pair with Node:

```bash
node -e "const {generateKeyPairSync}=require('crypto'); const k=generateKeyPairSync('ed25519'); console.log(k.privateKey.export({type:'pkcs8',format:'pem'}).toString()); console.log(k.publicKey.export({type:'spki',format:'pem'}).toString())"
```

---

## Authentication

Admin endpoints accept either:

1. `Authorization: Bearer $LICENSE_ADMIN_TOKEN`, or
2. `x-session-token: <dashboard session token>` / bearer session token for a valid `Session` whose `User.role` is `ADMIN` or `OPERATOR`.

Validation endpoint is public but requires a signed license key and device/account binding data.

---

## `POST /api/licenses/issue`

Issues a per-user license and returns the signed license key.

Auth: Admin/Operator.

Request:

```json
{
  "userId": "user_cuid",
  "accountId": "account-or-user-id",
  "expiresAt": "2026-12-31T23:59:59.000Z",
  "maxDevices": 1,
  "offlineGraceHours": 72,
  "features": ["vpn", "dns-tunnel", "ai-gateway"],
  "metadata": { "plan": "pro" }
}
```

Response:

```json
{
  "success": true,
  "license": { "id": "...", "status": "ACTIVE", "expiresAt": "..." },
  "licenseKey": "eyJhbGciOiJFZERTQSIs...",
  "redactedLicenseKey": "eyJhbGciOi…abc12345"
}
```

Side effects:

- Creates `License` related to existing `User`.
- Writes `AuditLog` action `license.issue`.

---

## `POST /api/licenses/validate`

Validates a license online, activates/binds the device if capacity allows, and returns a signed grace token.

Auth: public signed-key validation.

Request:

```json
{
  "licenseKey": "eyJhbGciOiJFZERTQSIs...",
  "deviceId": "stable-platform-device-id",
  "accountId": "account-or-user-id",
  "platform": "android",
  "appVersion": "2.0.0",
  "deviceLabel": "Pixel 8",
  "clientLastServerTime": "2026-09-01T14:00:00.000Z"
}
```

Success response:

```json
{
  "success": true,
  "result": "ALLOWED",
  "reason": "valid",
  "serverTime": "2026-09-01T14:05:00.000Z",
  "expiresAt": "2026-12-31T23:59:59.000Z",
  "remainingSeconds": 10400000,
  "offlineGraceUntil": "2026-09-04T14:05:00.000Z",
  "graceToken": "eyJhbGciOiJFZERTQSIs...",
  "activationId": "...",
  "maxDevices": 1
}
```

Failure response examples:

```json
{ "success": false, "result": "DENIED", "reason": "license_expired", "serverTime": "..." }
{ "success": false, "result": "DENIED", "reason": "license_revoked", "serverTime": "..." }
{ "success": false, "result": "DENIED", "reason": "device_limit_exceeded", "maxDevices": 1, "serverTime": "..." }
```

Side effects:

- Creates/updates `DeviceActivation`.
- Updates `License.lastValidatedAt` and `offlineGraceUntil` on success.
- Writes `LicenseValidation` for both allowed and denied attempts.

---

## `POST /api/licenses/revoke`

Revokes a license.

Auth: Admin/Operator.

Request:

```json
{ "licenseId": "lic_id", "reason": "payment_refunded" }
```

or

```json
{ "licenseKey": "eyJhbGciOiJFZERTQSIs...", "reason": "abuse" }
```

Response:

```json
{ "success": true, "license": { "id": "...", "status": "REVOKED", "revokedAt": "..." } }
```

Side effects:

- Updates `License.status = REVOKED`.
- Writes `AuditLog` action `license.revoke`.

---

## `POST /api/licenses/renew`

Extends/renews a license. Because expiry is part of the signed payload, renewal returns a new signed license key for the same license id.

Auth: Admin/Operator.

Request:

```json
{
  "licenseId": "lic_id",
  "expiresAt": "2027-12-31T23:59:59.000Z",
  "metadata": { "plan": "pro-renewed" }
}
```

Response:

```json
{
  "success": true,
  "license": { "id": "...", "status": "ACTIVE", "expiresAt": "2027-12-31T23:59:59.000Z" },
  "licenseKey": "new-signed-token",
  "redactedLicenseKey": "new-signed…token"
}
```

Side effects:

- Updates signed payload/hash.
- Clears revoked fields if renewing a previously revoked license intentionally.
- Writes `AuditLog` action `license.renew`.

---

## `GET /api/licenses/:id`

Auth: Admin/Operator.

Returns a license with user, activations, and recent validation history.

---

## `GET /api/users/:id/licenses`

Auth: Admin/Operator.

Returns all licenses for one user, including device activations.

---

## Client enforcement requirements

Every platform client must implement the same flow in the shared core:

1. Parse and verify the Ed25519 license key using embedded public key(s).
2. Reject locally edited/tampered keys before contacting the server.
3. Online validate when possible.
4. Store signed server time and grace token in secure storage:
   - Android Keystore / encrypted DataStore.
   - iOS Keychain.
   - Windows DPAPI.
   - Linux Secret Service/libsecret or encrypted fallback.
   - OpenWrt root-owned `0600` config/state file.
5. Detect clock rollback using monotonic last-seen server time and grace token expiry.
6. Refuse to start any VPN/tunnel when no valid online validation or grace token exists.
7. Hard-stop active tunnels at license expiry/grace expiry and apply kill switch/no-leak policy.

---

## Tests currently added

Pure crypto self-test:

```bash
node tools/license_crypto_selftest.mjs
```

Validated behaviors:

- Ed25519 license signing.
- Signature verification.
- Tamper rejection.
- Device hash stability and salt separation.
- Grace-token signing/verification.
- Expiry state calculation.

---

## Android Milestone 2 wiring

The Android client now has first-pass enforcement hooks in the V2RayEZ base app:

- Build-time properties in `app/build.gradle.kts`:
  - `v2rayez.license.validationUrl` → `BuildConfig.LICENSE_VALIDATION_URL`.
  - `v2rayez.license.publicKeyPem` → `BuildConfig.LICENSE_ED25519_PUBLIC_KEY_PEM`.
  - `v2rayez.license.publicKeysJson` → `BuildConfig.LICENSE_ED25519_PUBLIC_KEYS_JSON` for key rotation by `kid`.
  - `v2rayez.license.deviceHashSalt` → `BuildConfig.LICENSE_DEVICE_HASH_SALT`.
- `AndroidLicenseRepository` verifies compact Ed25519 serials locally with BouncyCastle, validates online against `/api/licenses/validate`, stores the serial and grace token in Android-Keystore-backed encrypted preferences, and binds grace tokens to the app-generated device id hash.
- `V2RayVpnService` calls the license repository before any Android tunnel path starts (normal server, Tor full-device, MITM capture-all, standalone engines, and the standalone MITM proxy all go through this gate).
- A running tunnel starts a license watchdog and hard-stops if the serial expires, online validation is denied, or the offline grace window expires.
- `Settings → License` exposes serial activation, account binding, validation URL, device label, offline grace toggle, manual validation, and redacted serial/device status while preserving the V2RayEZ settings-card UI style.

Deployment note: use the same `v2rayez.license.deviceHashSalt` value as `LICENSE_DEVICE_HASH_SALT` on the dashboard when issuing grace tokens, or Android offline grace device-binding checks will fail closed.

---

## Desktop/Tauri Milestone 3 wiring

The V2RayEZ desktop/Tauri GUI now has a first-pass license gate while keeping the compact V2RayEZ UI. The legacy Aether GUI donor is not the product GUI; Aether remains only a networking engine adapter:

- `src-tauri/src/settings.rs` persists `license` metadata (validation URL, account ID, device label, offline-grace toggle, last result/reason/expiry) and validates URL/account syntax.
- `src-tauri/src/license.rs` reuses `universal-core` Ed25519 compact token verification, stores the activated serial/grace token through `src-tauri/src/secure_store.rs`, validates online via `/api/licenses/validate`, and uses signed offline grace only when configured.
- `src-tauri/src/secure_store.rs` encrypts protected desktop state with Windows DPAPI on Windows and uses `0600` app-config files on Unix-like desktop targets until the Linux libsecret/keyring backend is added.
- `connect()` calls `license::enforce()` before starting Aether/MASQUE/WireGuard/gool or Windows VPN routing, so doomed foreground/network setup is avoided.
- A watchdog revalidates while connected and hard-stops Aether plus the routing manager if expiry/revocation/grace failure occurs mid-session.
- The frontend exposes License activation/validate/clear controls in Settings and keeps only redacted serial/status metadata in normal settings; the serial itself stays outside `settings.json`.

Desktop build note: the V2RayEZ GUI is the target app; public keys are supplied through `V2RAYEZ_LICENSE_PUBLIC_KEY_PEM`, `V2RAYEZ_LICENSE_PUBLIC_KEYS_JSON`, and `V2RAYEZ_LICENSE_DEVICE_HASH_SALT` at runtime/build time. Rust/Tauri compilation is still pending because `cargo`/`rustc` are not installed in this sandbox.

---

## OpenWrt LuCI Milestone 4 wiring

The MICAFP/OpenWrt package path now has additive license-gate wiring for universal/generic LuCI `.ipk` packaging:

- `/etc/config/unifiedshield` includes license metadata, account binding, validation URL, public-key file, offline-grace toggle, last result/reason/expiry, and AI Engine defaults.
- LuCI CBI model `src/luci-app-unifiedshield/luasrc/model/cbi/unifiedshield/config.lua` exposes License controls without ever storing or displaying the signed serial. Operators install the serial at `/etc/unifiedshield/license.token` with root-only permissions.
- `/usr/libexec/unifiedshield/license-gate.sh` is fail-closed and is called by the new procd init script before daemon start/reload. It prefers a future universal-core-backed native verifier (`/usr/bin/v2rayez-license-gate`) for local Ed25519/grace validation; the shell fallback only permits online dashboard validation and refuses offline grace without the native verifier.
- `/etc/init.d/unifiedshield` blocks service startup when license validation fails, preserving kill-switch/no-leak expectations on routers.

OpenWrt build note: the `.ipk` build itself is still blocked in this sandbox because no OpenWrt SDK/toolchain is installed, and the native verifier binary still needs to be produced from `universal-core` for final local anti-forgery/offline-grace verification on routers.

---

## iOS Milestone 5 wiring

The MICAFP iOS/UnifiedShield path now has first-pass app and Network Extension license enforcement:

- `App/LicenseManager.swift` stores the signed serial, device ID, and offline grace token in Keychain, verifies compact Ed25519 `V2RayEZ-License` tokens with CryptoKit, validates account/expiry, calls `/api/licenses/validate`, and verifies signed grace-token device binding.
- `App/SettingsView.swift` exposes an additive License section for account, validation URL, device label, public key PEM, offline grace, activate, validate, and clear actions.
- `NetworkExtension/TunnelManager.swift` validates before calling `NETunnelProviderSession.startTunnel()` and starts a connected-session watchdog.
- `NetworkExtension/PacketTunnelProvider.swift` calls `ExtensionLicenseGate` before applying network settings or starting the Rust core and cancels the tunnel if the watchdog later fails.
- `NetworkExtension/ExtensionLicenseGate.swift` provides extension-side fail-closed enforcement so bypassing the app UI cannot start an unlicensed tunnel.

Production note: final `.ipa` packaging must configure App Group/Keychain Access Group sharing between the container app and Network Extension before iOS device validation. Swift/Xcode compilation is still blocked in this Linux sandbox.

---

## Dashboard Milestone 6 admin UI wiring

The MICAFP Next.js dashboard now has an additive License admin panel:

- `src/components/license-admin-panel.tsx` exposes issue, validate, renew, revoke, and copy-serial actions against the Milestone 1 license APIs.
- `src/app/page.tsx` adds a `license` dashboard tab without removing existing monitoring/security/routing tabs.
- The panel keeps the existing Persian dashboard/card UI style and displays redacted/status information while the full signed serial is only shown in the operator form after issuance/copy.

Validation note: dashboard lint/build are blocked locally because dependencies are not installed (`eslint: not found`). The pure MJS crypto self-test remains the local source of evidence until Next/Prisma tooling is installed.
