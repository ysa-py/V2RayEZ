#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
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

const { publicKeyPem, privateKeyPem } = generateEd25519KeyPairPem();
const keyId = 'selftest-key';
const issuedAt = new Date().toISOString();
const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const payload = makeLicensePayload({
  licenseId: 'lic_selftest',
  userId: 'user_selftest',
  accountId: 'acct_selftest',
  status: 'ACTIVE',
  issuedAt,
  expiresAt,
  maxDevices: 2,
  offlineGraceHours: 72,
  features: ['vpn', 'dns-tunnel'],
});

const token = signLicensePayload(payload, privateKeyPem, keyId);
assert.equal(typeof token, 'string');
assert.equal(token.split('.').length, 3);
assert.equal(hashLicenseKey(token).length > 30, true);

const verified = verifyLicenseKey(token, { [keyId]: publicKeyPem });
assert.equal(verified.licenseId, 'lic_selftest');
assert.equal(verified.accountId, 'acct_selftest');
assert.deepEqual(verified.features, ['dns-tunnel', 'vpn']);

const tamperedParts = token.split('.');
tamperedParts[1] = tamperedParts[1].slice(0, -1) + (tamperedParts[1].endsWith('A') ? 'B' : 'A');
assert.throws(() => verifyLicenseKey(tamperedParts.join('.'), { [keyId]: publicKeyPem }), /verification failed|JSON|format/i);

const deviceHash = hashDeviceId('device-123', '0123456789abcdef');
assert.equal(deviceHash, hashDeviceId('device-123', '0123456789abcdef'));
assert.notEqual(deviceHash, hashDeviceId('device-456', '0123456789abcdef'));

const grace = signGraceToken({
  licenseId: payload.licenseId,
  userId: payload.userId,
  accountId: payload.accountId,
  deviceIdHash: deviceHash,
  platform: 'android',
  status: 'ACTIVE',
  serverTime: issuedAt,
  graceUntil: expiresAt,
  expiresAt,
}, privateKeyPem, keyId);
const verifiedGrace = verifyGraceToken(grace, { [keyId]: publicKeyPem });
assert.equal(verifiedGrace.deviceIdHash, deviceHash);

assert.equal(licenseTimeState(expiresAt).expired, false);
assert.equal(licenseTimeState(new Date(Date.now() - 1000).toISOString()).expired, true);

console.log('license_crypto_selftest: PASS');
