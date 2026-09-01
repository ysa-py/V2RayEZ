// @ts-nocheck
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign, timingSafeEqual, verify } from 'node:crypto';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export class LicenseCryptoError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'LicenseCryptoError';
    this.code = code;
  }
}

export function base64urlEncode(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export function base64urlDecode(input) {
  if (typeof input !== 'string' || input.length === 0) {
    throw new LicenseCryptoError('invalid_base64url', 'Base64url value must be a non-empty string');
  }
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
}

function normalizeForStableJson(value) {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalizeForStableJson);
  const out = {};
  for (const key of Object.keys(value).sort()) {
    const next = value[key];
    if (typeof next !== 'undefined') out[key] = normalizeForStableJson(next);
  }
  return out;
}

export function stableStringify(value) {
  return JSON.stringify(normalizeForStableJson(value));
}

export function sha256Base64url(value) {
  const buf = Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8');
  return base64urlEncode(createHash('sha256').update(buf).digest());
}

export function hashLicenseKey(licenseKey) {
  return sha256Base64url(`v2rayez-license-key\0${licenseKey}`);
}

export function hashDeviceId(deviceId, salt) {
  if (!deviceId || typeof deviceId !== 'string') {
    throw new LicenseCryptoError('invalid_device_id', 'deviceId is required');
  }
  if (!salt || typeof salt !== 'string' || salt.length < 16) {
    throw new LicenseCryptoError('invalid_device_salt', 'LICENSE_DEVICE_HASH_SALT must be at least 16 characters');
  }
  return sha256Base64url(`v2rayez-device\0${salt}\0${deviceId.trim()}`);
}

export function constantTimeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function keyObjectFromPem(pem, kind) {
  if (!pem || typeof pem !== 'string') {
    throw new LicenseCryptoError(`missing_${kind}_key`, `${kind} key PEM is required`);
  }
  const normalized = pem.replace(/\\n/g, '\n').trim();
  if (!normalized.includes('BEGIN')) {
    throw new LicenseCryptoError(`invalid_${kind}_key`, `${kind} key must be PEM encoded`);
  }
  return kind === 'private' ? createPrivateKey(normalized) : createPublicKey(normalized);
}

export function generateEd25519KeyPairPem() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  };
}

export function parseCompactToken(token) {
  if (typeof token !== 'string') {
    throw new LicenseCryptoError('invalid_token', 'Signed token must be a string');
  }
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
    throw new LicenseCryptoError('invalid_token_format', 'Signed token must use compact header.payload.signature format');
  }
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  let header;
  let payload;
  try {
    header = JSON.parse(textDecoder.decode(base64urlDecode(encodedHeader)));
    payload = JSON.parse(textDecoder.decode(base64urlDecode(encodedPayload)));
  } catch (error) {
    throw new LicenseCryptoError('invalid_token_json', `Signed token JSON cannot be parsed: ${error.message}`);
  }
  return {
    header,
    payload,
    signature: base64urlDecode(encodedSignature),
    signingInput: Buffer.from(`${encodedHeader}.${encodedPayload}`, 'utf8'),
    encodedHeader,
    encodedPayload,
    encodedSignature,
  };
}

export function signCompactToken(payload, privateKeyPem, keyId, tokenType) {
  if (!keyId || typeof keyId !== 'string') {
    throw new LicenseCryptoError('missing_key_id', 'keyId is required');
  }
  const header = { alg: 'EdDSA', kid: keyId, typ: tokenType };
  const encodedHeader = base64urlEncode(textEncoder.encode(stableStringify(header)));
  const encodedPayload = base64urlEncode(textEncoder.encode(stableStringify(payload)));
  const signingInput = Buffer.from(`${encodedHeader}.${encodedPayload}`, 'utf8');
  const privateKey = keyObjectFromPem(privateKeyPem, 'private');
  const signature = sign(null, signingInput, privateKey);
  return `${encodedHeader}.${encodedPayload}.${base64urlEncode(signature)}`;
}

export function verifyCompactToken(token, publicKeys, expectedType) {
  const parsed = parseCompactToken(token);
  if (parsed.header.alg !== 'EdDSA') {
    throw new LicenseCryptoError('unsupported_algorithm', `Unsupported token algorithm: ${parsed.header.alg}`);
  }
  if (expectedType && parsed.header.typ !== expectedType) {
    throw new LicenseCryptoError('unexpected_token_type', `Expected ${expectedType}, got ${parsed.header.typ || 'unknown'}`);
  }

  let publicKeyPem;
  if (typeof publicKeys === 'string') {
    publicKeyPem = publicKeys;
  } else if (publicKeys && typeof publicKeys === 'object') {
    publicKeyPem = publicKeys[parsed.header.kid] || publicKeys.default;
  }
  if (!publicKeyPem) {
    throw new LicenseCryptoError('unknown_key_id', `No public key configured for key id ${parsed.header.kid || 'unknown'}`);
  }

  const publicKey = keyObjectFromPem(publicKeyPem, 'public');
  const ok = verify(null, parsed.signingInput, publicKey, parsed.signature);
  if (!ok) {
    throw new LicenseCryptoError('bad_signature', 'Token signature verification failed');
  }
  return parsed;
}

export const LICENSE_TOKEN_TYPE = 'V2RayEZ-License';
export const GRACE_TOKEN_TYPE = 'V2RayEZ-License-Grace';

export function signLicensePayload(payload, privateKeyPem, keyId) {
  const normalized = {
    schema: 'v2rayez.license.v1',
    ...payload,
  };
  return signCompactToken(normalized, privateKeyPem, keyId, LICENSE_TOKEN_TYPE);
}

export function verifyLicenseKey(licenseKey, publicKeys) {
  return verifyCompactToken(licenseKey, publicKeys, LICENSE_TOKEN_TYPE).payload;
}

export function signGraceToken(payload, privateKeyPem, keyId) {
  const normalized = {
    schema: 'v2rayez.license.grace.v1',
    ...payload,
  };
  return signCompactToken(normalized, privateKeyPem, keyId, GRACE_TOKEN_TYPE);
}

export function verifyGraceToken(graceToken, publicKeys) {
  return verifyCompactToken(graceToken, publicKeys, GRACE_TOKEN_TYPE).payload;
}

export function loadPrivateSigningKeyFromEnv(env = process.env) {
  const pem = env.LICENSE_ED25519_PRIVATE_KEY_PEM;
  if (!pem && env.LICENSE_DEV_ALLOW_EPHEMERAL_KEYS === 'true') {
    return generateEd25519KeyPairPem().privateKeyPem;
  }
  return pem;
}

export function loadPublicKeysFromEnv(env = process.env) {
  const currentKid = env.LICENSE_KEY_ID || 'default';
  const keys = {};
  if (env.LICENSE_ED25519_PUBLIC_KEYS_JSON) {
    const parsed = JSON.parse(env.LICENSE_ED25519_PUBLIC_KEYS_JSON);
    for (const [kid, pem] of Object.entries(parsed)) keys[kid] = String(pem);
  }
  if (env.LICENSE_ED25519_PUBLIC_KEY_PEM) {
    keys[currentKid] = env.LICENSE_ED25519_PUBLIC_KEY_PEM;
    keys.default = env.LICENSE_ED25519_PUBLIC_KEY_PEM;
  }
  return keys;
}

export function assertIsoDate(value, fieldName) {
  const millis = Date.parse(value);
  if (!value || Number.isNaN(millis)) {
    throw new LicenseCryptoError('invalid_date', `${fieldName} must be an ISO-8601 date string`);
  }
  return new Date(millis).toISOString();
}

export function licenseTimeState(expiresAt, now = new Date()) {
  const expiryMs = Date.parse(expiresAt);
  if (Number.isNaN(expiryMs)) {
    throw new LicenseCryptoError('invalid_expiry', 'License expiry is not a valid date');
  }
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  const remainingMs = expiryMs - nowMs;
  return {
    expired: remainingMs <= 0,
    remainingMs,
    remainingSeconds: Math.max(0, Math.floor(remainingMs / 1000)),
  };
}

export function makeLicensePayload({ licenseId, userId, accountId, status, issuedAt, expiresAt, maxDevices = 1, offlineGraceHours = 72, features = [], metadata = {} }) {
  return {
    licenseId,
    userId,
    accountId: accountId || userId,
    status,
    issuedAt: assertIsoDate(issuedAt, 'issuedAt'),
    expiresAt: assertIsoDate(expiresAt, 'expiresAt'),
    maxDevices: Number(maxDevices),
    offlineGraceHours: Number(offlineGraceHours),
    features: Array.isArray(features) ? features.map(String).sort() : [],
    metadata: metadata && typeof metadata === 'object' ? metadata : {},
  };
}

export function redactLicenseKey(key) {
  if (!key || typeof key !== 'string') return '';
  if (key.length <= 16) return `${key.slice(0, 4)}…${key.slice(-4)}`;
  return `${key.slice(0, 10)}…${key.slice(-8)}`;
}
