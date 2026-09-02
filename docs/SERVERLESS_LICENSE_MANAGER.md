# V2RayEZ Serverless-First License Manager

Milestone 63 adds the offline-first side of the V2RayEZ licensing design while keeping the existing dashboard API path intact.

## Separate applications

- **V2RayEZ VPN app**: end-user app. It verifies signed serials locally, enforces expiry/device binding/revocation before tunnel start, and never issues or signs licenses.
- **V2RayEZ License Manager / Admin**: separate Android operator app. It can either call the dashboard API or issue offline Ed25519 serials from a local private key.

## Offline License Manager behavior

The separate Android License Manager now includes real offline operations:

- Generates an Ed25519 key seed locally and encrypts it with Android Keystore AES-GCM.
- Exports the matching public key as PEM so it can be pasted into V2RayEZ License settings or deployed as a build-time public key.
- Issues signed `V2RayEZ-License` compact tokens with stable JSON signing input compatible with the dashboard token format.
- Stores every license as an independent ledger record with its own `licenseId`, `ownerLabel`, `userId`, `accountId`, `issuedAt`, `expiresAt`, `deviceIdHash`, `features`, `status`, and `revocationEpoch`.
- Renews one license by changing only that license's `expiresAt` and re-signing it.
- Revokes one license by marking only that record `REVOKED`, incrementing its `revocationEpoch`, and exporting a signed `V2RayEZ-Revocation-List` token.
- Exports/imports the ledger as `v2rayez-license-ledger.enc`, encrypted with PBKDF2-HMAC-SHA256 plus AES-256-GCM.

## End-user VPN enforcement

The Android VPN app now checks these offline/serverless properties locally:

- Ed25519 signature must verify against the configured public key.
- `accountId` must match when configured.
- Optional `deviceIdHash` must match the device-binding hash shown in License settings.
- Expired serials are denied before a tunnel can start.
- A configured signed revocation-list token is verified and denies any matching `licenseId` whose list epoch is greater than or equal to the license payload epoch.

## Honest limitation

A conventional dashboard revoke can stop reachable clients at the next online validation/poll. A serverless revocation-list token can stop clients without a traditional central server, but only after the target app receives the token through some reachable update channel such as mesh/IPFS/DNS/covert transport. It is not physically instantaneous for a device that is fully isolated and receives no data.

## Validation

- `node tools/offline_license_manager_gate.mjs`
- Existing Android license/admin/runtime gates
- Android XML/string parity gates
