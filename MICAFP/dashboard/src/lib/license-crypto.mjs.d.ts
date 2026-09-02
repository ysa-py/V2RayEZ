export class LicenseCryptoError extends Error {
  code: string;
  constructor(code: string, message: string);
}

export type LicenseKeySet = Record<string, string>;
export type LicensePayloadInput = {
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
};
export type LicensePayload = Required<Omit<LicensePayloadInput, 'accountId' | 'features' | 'metadata'>> & {
  accountId: string;
  features: string[];
  metadata: Record<string, unknown>;
  schema?: string;
};

export function base64urlEncode(input: Buffer | Uint8Array | string): string;
export function base64urlDecode(input: string): Buffer;
export function stableStringify(value: unknown): string;
export function sha256Base64url(value: Buffer | Uint8Array | string): string;
export function hashLicenseKey(licenseKey: string): string;
export function hashDeviceId(deviceId: string, salt: string): string;
export function constantTimeEqual(a: unknown, b: unknown): boolean;
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
export function verifyCompactToken(token: string, publicKeys: string | LicenseKeySet, expectedType?: string): ReturnType<typeof parseCompactToken>;
export const LICENSE_TOKEN_TYPE: string;
export const GRACE_TOKEN_TYPE: string;
export function signLicensePayload(payload: LicensePayloadInput, privateKeyPem: string, keyId: string): string;
export function verifyLicenseKey(licenseKey: string, publicKeys: string | LicenseKeySet): LicensePayload;
export function signGraceToken(payload: Record<string, unknown>, privateKeyPem: string, keyId: string): string;
export function verifyGraceToken(graceToken: string, publicKeys: string | LicenseKeySet): Record<string, unknown>;
export function loadPrivateSigningKeyFromEnv(env?: NodeJS.ProcessEnv): string | undefined;
export function loadPublicKeysFromEnv(env?: NodeJS.ProcessEnv): LicenseKeySet;
export function assertIsoDate(value: string, fieldName: string): string;
export function licenseTimeState(expiresAt: string, now?: Date | string): { expired: boolean; remainingMs: number; remainingSeconds: number };
export function makeLicensePayload(input: LicensePayloadInput): LicensePayload;
export function redactLicenseKey(key: string): string;
