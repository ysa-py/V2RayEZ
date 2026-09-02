#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function text(path) { return readFileSync(path, 'utf8'); }
function has(path, needle) { assert.ok(text(path).includes(needle), `${path} missing ${needle}`); }
function lacks(path, needle) { assert.ok(!text(path).includes(needle), `${path} must not contain ${needle}`); }

const service = 'MICAFP/dashboard/src/lib/license-service.ts';
const route = 'MICAFP/dashboard/src/app/api/licenses/devices/revoke/route.ts';
const docs = 'docs/LICENSE_API.md';
const adminApp = 'V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)/license-admin/src/main/java/com/v2rayez/licenseadmin/MainActivity.java';
const validateRoute = 'MICAFP/dashboard/src/app/api/licenses/validate/route.ts';

has(service, 'export async function revokeDeviceActivation');
has(service, 'activationId?: string; licenseId?: string; deviceIdHash?: string; reason?: string');
has(service, 'dashboardDb.deviceActivation.findUnique');
has(service, 'dashboardDb.deviceActivation.findFirst');
has(service, 'revokedAt: now');
has(service, 'revokedReason: reason');
has(service, 'include: { license: true }');

has(route, 'requireLicenseAdmin(request)');
has(route, 'revokeDeviceActivation');
has(route, "writeAuditLog(auth.actor, 'license.device.revoke'");
has(route, 'activationId: body.activationId ? String(body.activationId) : undefined');
has(route, 'deviceIdHash: body.deviceIdHash ? String(body.deviceIdHash) : undefined');
has(route, 'NextResponse.json({ success: true, activation })');

has(validateRoute, 'validateLicense({');
has(service, "reason = 'device_revoked'");

has(adminApp, '/api/licenses/devices/revoke');
has(adminApp, 'private EditText activationId;');
has(adminApp, 'private EditText deviceIdHash;');
has(adminApp, 'button("Revoke device now", this::revokeDevice)');
has(adminApp, '.put("activationId", value(activationId))');
has(adminApp, '.put("deviceIdHash", value(deviceIdHash))');
has(adminApp, 'Admin token is intentionally session-only and is not saved on device.');
lacks(adminApp, 'LICENSE_ED25519_PRIVATE_KEY');

has(docs, '## `POST /api/licenses/devices/revoke`');
has(docs, 'Revokes one activated device without revoking the whole license');
has(docs, 'license.device.revoke');
has(docs, 'without revoking the whole license');

console.log('license_device_revoke_gate: PASS');
