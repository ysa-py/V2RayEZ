#!/usr/bin/env node
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  base64urlDecode,
  base64urlEncode,
  generateEd25519KeyPairPem,
  hashDeviceId,
  hashLicenseKey,
  licenseTimeState,
  makeLicensePayload,
  signGraceToken,
  signLicensePayload,
  verifyGraceToken,
  verifyLicenseKey,
} from '../MICAFP/dashboard/src/lib/license-crypto.mjs';

const now = new Date('2030-01-01T00:00:00.000Z');
const later = (ms) => new Date(now.getTime() + ms).toISOString();
const earlier = (ms) => new Date(now.getTime() - ms).toISOString();
const deviceSalt = '0123456789abcdef-v2rayez-e2e';
const keyId = 'v2rayez-e2e-key';
const { publicKeyPem, privateKeyPem } = generateEd25519KeyPairPem();
const publicKeys = { [keyId]: publicKeyPem, default: publicKeyPem };

function issueSerial({
  userId = 'user_alice',
  accountId = 'acct_alice',
  status = 'ACTIVE',
  expiresAt = later(2 * 60 * 60 * 1000),
  maxDevices = 1,
  offlineGraceHours = 1,
  features = ['vpn', 'dns-tunnel', 'ai-fallback'],
} = {}) {
  const licenseId = `lic_${randomUUID()}`;
  const payload = makeLicensePayload({
    licenseId,
    userId,
    accountId,
    status,
    issuedAt: now.toISOString(),
    expiresAt,
    maxDevices,
    offlineGraceHours,
    features,
  });
  const licenseKey = signLicensePayload(payload, privateKeyPem, keyId);
  return {
    licenseKey,
    record: {
      id: licenseId,
      userId,
      accountId,
      licenseKeyHash: hashLicenseKey(licenseKey),
      status,
      revokedAt: null,
      expiresAt,
      maxDevices,
      offlineGraceHours,
      features: [...payload.features],
      deviceActivations: new Map(),
    },
  };
}

function validateSerial(db, { licenseKey, accountId, deviceId, platform = 'android', at = now, clientLastServerTime = null }) {
  const serverTime = at.toISOString();
  if (clientLastServerTime) {
    const clientLastServerTimeMs = Date.parse(clientLastServerTime);
    if (Number.isNaN(clientLastServerTimeMs)) {
      return { success: false, result: 'DENIED', reason: 'invalid_client_last_server_time', serverTime };
    }
    if (clientLastServerTimeMs > at.getTime() + 5 * 60 * 1000) {
      return { success: false, result: 'DENIED', reason: 'server_time_rollback_detected', serverTime };
    }
  }
  let payload;
  try {
    payload = verifyLicenseKey(licenseKey, publicKeys);
  } catch (error) {
    return { success: false, result: 'DENIED', reason: `license_signature_invalid:${error.code || error.message}`, serverTime };
  }

  const record = db.get(hashLicenseKey(licenseKey));
  if (!record) return { success: false, result: 'DENIED', reason: 'license_not_found', serverTime };
  if (payload.licenseId !== record.id || payload.userId !== record.userId) {
    return { success: false, result: 'DENIED', reason: 'payload_database_mismatch', serverTime };
  }
  if (payload.status !== 'ACTIVE' || record.status !== 'ACTIVE' || record.revokedAt) {
    return { success: false, result: 'DENIED', reason: record.revokedAt ? 'license_revoked' : 'license_not_active', serverTime };
  }
  if (payload.accountId !== accountId || record.accountId !== accountId) {
    return { success: false, result: 'DENIED', reason: 'account_mismatch', serverTime };
  }
  if (payload.expiresAt !== record.expiresAt || Number(payload.maxDevices) !== Number(record.maxDevices) || Number(payload.offlineGraceHours) !== Number(record.offlineGraceHours)) {
    return { success: false, result: 'DENIED', reason: 'payload_database_mismatch', serverTime };
  }
  if (licenseTimeState(record.expiresAt, at).expired) {
    record.status = 'EXPIRED';
    return { success: false, result: 'DENIED', reason: 'license_expired', serverTime, expiresAt: record.expiresAt };
  }

  const deviceIdHash = hashDeviceId(deviceId, deviceSalt);
  let activation = record.deviceActivations.get(deviceIdHash);
  if (!activation && record.deviceActivations.size >= record.maxDevices) {
    return { success: false, result: 'DENIED', reason: 'device_limit_exceeded', serverTime, maxDevices: record.maxDevices };
  }
  if (!activation) {
    activation = { id: `act_${randomUUID()}`, deviceIdHash, platform, firstSeenAt: serverTime, lastSeenAt: serverTime };
    record.deviceActivations.set(deviceIdHash, activation);
  } else {
    activation = { ...activation, platform, lastSeenAt: serverTime };
    record.deviceActivations.set(deviceIdHash, activation);
  }

  const graceUntil = new Date(Math.min(
    Date.parse(record.expiresAt),
    at.getTime() + Number(record.offlineGraceHours) * 60 * 60 * 1000,
  )).toISOString();
  const graceToken = signGraceToken({
    licenseId: record.id,
    userId: record.userId,
    accountId: record.accountId,
    deviceIdHash,
    platform,
    status: 'ACTIVE',
    serverTime,
    graceUntil,
    expiresAt: record.expiresAt,
    validationId: randomUUID(),
  }, privateKeyPem, keyId);

  return {
    success: true,
    result: 'ALLOWED',
    reason: 'valid',
    serverTime,
    expiresAt: record.expiresAt,
    remainingSeconds: licenseTimeState(record.expiresAt, at).remainingSeconds,
    offlineGraceUntil: graceUntil,
    graceToken,
    activationId: activation.id,
  };
}

function offlineStartDecision({ licenseKey, graceToken, accountId, deviceId, platform = 'android', at = now, lastSeenServerTime = null }) {
  let license;
  try {
    license = verifyLicenseKey(licenseKey, publicKeys);
  } catch (error) {
    return { allowed: false, reason: `license_signature_invalid:${error.code || error.message}` };
  }
  if (license.status !== 'ACTIVE') return { allowed: false, reason: 'license_not_active' };
  if (license.accountId !== accountId) return { allowed: false, reason: 'account_mismatch' };
  if (licenseTimeState(license.expiresAt, at).expired) return { allowed: false, reason: 'license_expired' };
  if (!graceToken) return { allowed: false, reason: 'online_validation_or_grace_token_required' };

  let grace;
  try {
    grace = verifyGraceToken(graceToken, publicKeys);
  } catch (error) {
    return { allowed: false, reason: `grace_signature_invalid:${error.code || error.message}` };
  }
  const expectedDeviceHash = hashDeviceId(deviceId, deviceSalt);
  if (grace.licenseId !== license.licenseId || grace.userId !== license.userId || grace.accountId !== license.accountId) {
    return { allowed: false, reason: 'grace_license_mismatch' };
  }
  if (grace.deviceIdHash !== expectedDeviceHash) return { allowed: false, reason: 'device_mismatch' };
  if (grace.platform !== platform) return { allowed: false, reason: 'platform_mismatch' };
  if (grace.status !== 'ACTIVE') return { allowed: false, reason: 'grace_not_active' };
  if (lastSeenServerTime && Date.parse(grace.serverTime) + 300_000 < Date.parse(lastSeenServerTime)) {
    return { allowed: false, reason: 'server_time_rollback_detected' };
  }
  if (Date.parse(grace.graceUntil) <= at.getTime()) return { allowed: false, reason: 'offline_grace_expired' };

  const cutoffMs = Math.min(Date.parse(license.expiresAt), Date.parse(grace.graceUntil));
  return { allowed: true, reason: 'valid_grace', hardCutoffAt: new Date(cutoffMs).toISOString() };
}

const issued = issueSerial();
const db = new Map([[issued.record.licenseKeyHash, issued.record]]);

const firstValidation = validateSerial(db, {
  licenseKey: issued.licenseKey,
  accountId: 'acct_alice',
  deviceId: 'device-a',
  platform: 'android',
});
assert.equal(firstValidation.success, true);
assert.equal(firstValidation.result, 'ALLOWED');
assert.equal(firstValidation.reason, 'valid');
assert.equal(typeof firstValidation.graceToken, 'string');

const gracePayload = verifyGraceToken(firstValidation.graceToken, publicKeys);
assert.equal(gracePayload.accountId, 'acct_alice');
assert.equal(gracePayload.deviceIdHash, hashDeviceId('device-a', deviceSalt));

const offlineAllowed = offlineStartDecision({
  licenseKey: issued.licenseKey,
  graceToken: firstValidation.graceToken,
  accountId: 'acct_alice',
  deviceId: 'device-a',
  platform: 'android',
  at: new Date(now.getTime() + 30 * 60 * 1000),
});
assert.deepEqual(offlineAllowed, {
  allowed: true,
  reason: 'valid_grace',
  hardCutoffAt: firstValidation.offlineGraceUntil,
});

const repeatValidation = validateSerial(db, { licenseKey: issued.licenseKey, accountId: 'acct_alice', deviceId: 'device-a', platform: 'android' });
assert.equal(repeatValidation.success, true);
assert.equal(repeatValidation.activationId, firstValidation.activationId);

assert.equal(validateSerial(db, { licenseKey: issued.licenseKey, accountId: 'acct_alice', deviceId: 'device-b', platform: 'android' }).reason, 'device_limit_exceeded');
assert.equal(validateSerial(db, { licenseKey: issued.licenseKey, accountId: 'acct_bob', deviceId: 'device-a', platform: 'android' }).reason, 'account_mismatch');
assert.equal(validateSerial(db, {
  licenseKey: issued.licenseKey,
  accountId: 'acct_alice',
  deviceId: 'device-a',
  platform: 'android',
  clientLastServerTime: later(10 * 60 * 1000),
}).reason, 'server_time_rollback_detected');
assert.equal(validateSerial(db, {
  licenseKey: issued.licenseKey,
  accountId: 'acct_alice',
  deviceId: 'device-a',
  platform: 'android',
  clientLastServerTime: 'not-a-date',
}).reason, 'invalid_client_last_server_time');

const tamperedParts = issued.licenseKey.split('.');
const tamperedPayload = JSON.parse(Buffer.from(base64urlDecode(tamperedParts[1])).toString('utf8'));
tamperedPayload.accountId = 'acct_mallory';
tamperedParts[1] = base64urlEncode(JSON.stringify(tamperedPayload));
const tampered = tamperedParts.join('.');
assert.match(validateSerial(db, { licenseKey: tampered, accountId: 'acct_alice', deviceId: 'device-a', platform: 'android' }).reason, /^license_signature_invalid:/);

const expired = issueSerial({ expiresAt: earlier(60 * 1000) });
assert.equal(offlineStartDecision({ licenseKey: expired.licenseKey, graceToken: firstValidation.graceToken, accountId: 'acct_alice', deviceId: 'device-a', platform: 'android' }).reason, 'license_expired');

assert.equal(offlineStartDecision({
  licenseKey: issued.licenseKey,
  graceToken: firstValidation.graceToken,
  accountId: 'acct_alice',
  deviceId: 'device-other',
  platform: 'android',
}).reason, 'device_mismatch');

assert.equal(offlineStartDecision({
  licenseKey: issued.licenseKey,
  graceToken: firstValidation.graceToken,
  accountId: 'acct_alice',
  deviceId: 'device-a',
  platform: 'ios',
}).reason, 'platform_mismatch');

assert.equal(offlineStartDecision({
  licenseKey: issued.licenseKey,
  graceToken: firstValidation.graceToken,
  accountId: 'acct_alice',
  deviceId: 'device-a',
  platform: 'android',
  at: new Date(Date.parse(firstValidation.offlineGraceUntil) + 1000),
}).reason, 'offline_grace_expired');

assert.equal(offlineStartDecision({
  licenseKey: issued.licenseKey,
  graceToken: firstValidation.graceToken,
  accountId: 'acct_alice',
  deviceId: 'device-a',
  platform: 'android',
  lastSeenServerTime: later(10 * 60 * 1000),
}).reason, 'server_time_rollback_detected');

issued.record.revokedAt = later(60 * 1000);
assert.equal(validateSerial(db, { licenseKey: issued.licenseKey, accountId: 'acct_alice', deviceId: 'device-a', platform: 'android' }).reason, 'license_revoked');

console.log('license_serial_e2e_selftest: PASS');
