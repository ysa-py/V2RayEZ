export class LicenseCryptoError extends Error {
  code: string;
  constructor(code: string, message: string);
}

export const LICENSE_TOKEN_TYPE: string;
export const GRACE_TOKEN_TYPE: string;

export function base64urlEncode(input: Buffer | Uint8Array | string): string;
export function base64urlDecode(input: string): Buffer;
export function stableStringify(value: unknown): string;
export function sha256Base64url(value: Buffer | Uint8Array | string): string;
export function hashLicenseKey(licenseKey: string): string;
export function hashDeviceId(deviceId: string, salt: string): string;
export function constantTimeEqual(a: string, b: string): boolean;
export function generateEd25519KeyPairPem(): { publicKeyPem: string; privateKeyPem: string };
export function parseCompactToken(token: string): {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: Buffer;
  signingInput: Buffer;
  encodedHeader: string;
  encodedPayload: string;
  encodedSignature: string;
};
export function signCompactToken(payload: Record<string, unknown>, privateKeyPem: string, keyId: string, tokenType: string): string;
export function verifyCompactToken(token: string, publicKeys: string | Record<string, string>, expectedType?: string): { header: Record<string, unknown>; payload: Record<string, unknown> };
export function signLicensePayload(payload: Record<string, unknown>, privateKeyPem: string, keyId: string): string;
export function verifyLicenseKey(licenseKey: string, publicKeys: string | Record<string, string>): Record<string, unknown>;
export function signGraceToken(payload: Record<string, unknown>, privateKeyPem: string, keyId: string): string;
export function verifyGraceToken(graceToken: string, publicKeys: string | Record<string, string>): Record<string, unknown>;
export function loadPrivateSigningKeyFromEnv(env?: Record<string, string | undefined>): string | undefined;
export function loadPublicKeysFromEnv(env?: Record<string, string | undefined>): Record<string, string>;
export function assertIsoDate(value: string, fieldName: string): string;
export function licenseTimeState(expiresAt: string, now?: Date | string): { expired: boolean; remainingMs: number; remainingSeconds: number };
export function makeLicensePayload(input: {
  licenseId: string;
  userId: string;
  accountId?: string;
  status: string;
  issuedAt: string;
  expiresAt: string;
  maxDevices?: number;
  offlineGraceHours?: number;
  features?: string[];
  metadata?: Record<string, unknown>;
}): Record<string, unknown>;
export function redactLicenseKey(key: string): string;
