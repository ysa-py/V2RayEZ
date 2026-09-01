import { db } from '@/lib/db';
import * as licenseCryptoModule from '@/lib/license-crypto.mjs';

type DashboardDb = typeof db & {
  user: any;
  license: any;
  deviceActivation: any;
  licenseValidation: any;
};

export interface IssueLicenseInput {
  userId: string;
  accountId?: string;
  expiresAt: string;
  maxDevices?: number;
  offlineGraceHours?: number;
  features?: string[];
  metadata?: Record<string, unknown>;
}

export interface ValidateLicenseInput {
  licenseKey: string;
  deviceId: string;
  accountId: string;
  platform: string;
  appVersion?: string;
  deviceLabel?: string;
  clientLastServerTime?: string;
}

type LicensePayload = Record<string, unknown> & {
  licenseId: string;
  userId: string;
  accountId: string;
  features: string[];
  metadata: Record<string, unknown>;
};

type LicenseCryptoModule = {
  hashDeviceId(deviceId: string, salt: string): string;
  hashLicenseKey(licenseKey: string): string;
  licenseTimeState(expiresAt: string, now?: Date | string): { expired: boolean; remainingSeconds: number };
  loadPrivateSigningKeyFromEnv(env: NodeJS.ProcessEnv): string | undefined;
  loadPublicKeysFromEnv(env: NodeJS.ProcessEnv): Record<string, string>;
  makeLicensePayload(input: {
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
  }): LicensePayload;
  redactLicenseKey(licenseKey: string): string;
  signGraceToken(payload: Record<string, unknown>, privateKeyPem: string, keyId: string): string;
  signLicensePayload(payload: Record<string, unknown>, privateKeyPem: string, keyId: string): string;
  verifyLicenseKey(licenseKey: string, publicKeys: Record<string, string>): LicensePayload;
};

const {
  hashDeviceId,
  hashLicenseKey,
  licenseTimeState,
  loadPrivateSigningKeyFromEnv,
  loadPublicKeysFromEnv,
  makeLicensePayload,
  redactLicenseKey,
  signGraceToken,
  signLicensePayload,
  verifyLicenseKey,
} = licenseCryptoModule as unknown as LicenseCryptoModule;

function signingConfig() {
  const privateKeyPem = loadPrivateSigningKeyFromEnv(process.env) as string | undefined;
  const publicKeys = loadPublicKeysFromEnv(process.env) as Record<string, string>;
  const keyId = process.env.LICENSE_KEY_ID || 'default';
  const deviceSalt = process.env.LICENSE_DEVICE_HASH_SALT;

  if (!privateKeyPem) {
    throw new Error('LICENSE_ED25519_PRIVATE_KEY_PEM is required to issue or validate grace tokens');
  }
  if (!deviceSalt || deviceSalt.length < 16) {
    throw new Error('LICENSE_DEVICE_HASH_SALT must be configured and at least 16 characters');
  }
  if (!publicKeys[keyId] && !publicKeys.default) {
    throw new Error('LICENSE_ED25519_PUBLIC_KEY_PEM or LICENSE_ED25519_PUBLIC_KEYS_JSON is required');
  }

  return { privateKeyPem, publicKeys, keyId, deviceSalt };
}

function publicVerificationConfig() {
  const publicKeys = loadPublicKeysFromEnv(process.env) as Record<string, string>;
  if (Object.keys(publicKeys).length === 0) {
    throw new Error('LICENSE_ED25519_PUBLIC_KEY_PEM or LICENSE_ED25519_PUBLIC_KEYS_JSON is required');
  }
  return publicKeys;
}

export async function issueLicense(input: IssueLicenseInput) {
  const dashboardDb = db as DashboardDb;
  const { privateKeyPem, keyId } = signingConfig();
  const now = new Date();
  const expiresAt = new Date(input.expiresAt);
  if (Number.isNaN(expiresAt.getTime())) {
    throw new Error('expiresAt must be a valid ISO date');
  }
  if (expiresAt <= now) {
    throw new Error('expiresAt must be in the future');
  }

  const user = await dashboardDb.user.findUnique({ where: { id: input.userId } });
  if (!user || !user.isActive) {
    throw new Error('Target user does not exist or is inactive');
  }

  const licenseId = crypto.randomUUID();
  const issuedAt = now.toISOString();
  const payload = makeLicensePayload({
    licenseId,
    userId: user.id,
    accountId: input.accountId || user.id,
    status: 'ACTIVE',
    issuedAt,
    expiresAt: expiresAt.toISOString(),
    maxDevices: input.maxDevices ?? 1,
    offlineGraceHours: input.offlineGraceHours ?? 72,
    features: input.features ?? ([] as string[]),
    metadata: input.metadata ?? {},
  });
  const licenseKey = signLicensePayload(payload, privateKeyPem, keyId);
  const licenseKeyHash = hashLicenseKey(licenseKey);

  const record = await dashboardDb.license.create({
    data: {
      id: licenseId,
      userId: user.id,
      accountId: String(payload.accountId),
      keyId,
      licenseKeyHash,
      signedPayload: licenseKey,
      status: 'ACTIVE',
      issuedAt: now,
      expiresAt,
      maxDevices: Number(payload.maxDevices),
      offlineGraceHours: Number(payload.offlineGraceHours),
      features: payload.features,
      metadata: payload.metadata,
    },
  });

  return {
    license: record,
    licenseKey,
    licenseKeyHash,
    redactedLicenseKey: redactLicenseKey(licenseKey),
  };
}

export async function validateLicense(input: ValidateLicenseInput, requestMeta: { ipAddress?: string | null; userAgent?: string | null } = {}) {
  const dashboardDb = db as DashboardDb;
  const { privateKeyPem, keyId, deviceSalt } = signingConfig();
  const publicKeys = publicVerificationConfig();
  const now = new Date();
  const serverTime = now.toISOString();
  const licenseKeyHash = hashLicenseKey(input.licenseKey);
  const deviceIdHash = hashDeviceId(input.deviceId, deviceSalt);

  let parsedPayload: Record<string, unknown> | null = null;
  let result = 'DENIED';
  let reason = 'unknown';
  let licenseRecord: any = null;
  let activation: any = null;

  try {
    parsedPayload = verifyLicenseKey(input.licenseKey, publicKeys) as LicensePayload;
    const verifiedPayload = parsedPayload;
    licenseRecord = await dashboardDb.license.findUnique({
      where: { licenseKeyHash },
      include: { deviceActivations: true, user: true },
    });

    if (!licenseRecord) {
      reason = 'license_not_found';
      return { success: false, result, reason, serverTime };
    }

    if (String(verifiedPayload.licenseId) !== licenseRecord.id || String(verifiedPayload.userId) !== licenseRecord.userId) {
      reason = 'payload_database_mismatch';
      return { success: false, result, reason, serverTime };
    }

    if (String(verifiedPayload.accountId) !== input.accountId || licenseRecord.accountId !== input.accountId) {
      reason = 'account_mismatch';
      return { success: false, result, reason, serverTime };
    }

    if (!licenseRecord.user?.isActive) {
      reason = 'user_inactive';
      return { success: false, result, reason, serverTime };
    }

    if (licenseRecord.status === 'REVOKED' || licenseRecord.revokedAt) {
      reason = 'license_revoked';
      return { success: false, result, reason, serverTime };
    }

    const timeState = licenseTimeState(licenseRecord.expiresAt.toISOString(), now);
    if (timeState.expired) {
      await dashboardDb.license.update({
        where: { id: licenseRecord.id },
        data: { status: 'EXPIRED' },
      });
      reason = 'license_expired';
      return { success: false, result, reason, serverTime, expiresAt: licenseRecord.expiresAt.toISOString() };
    }

    activation = await dashboardDb.deviceActivation.findFirst({
      where: { licenseId: licenseRecord.id, deviceIdHash },
    });

    if (activation?.revokedAt) {
      reason = 'device_revoked';
      return { success: false, result, reason, serverTime };
    }

    const activeDeviceCount = licenseRecord.deviceActivations.filter((d: any) => !d.revokedAt).length;
    if (!activation && activeDeviceCount >= licenseRecord.maxDevices) {
      reason = 'device_limit_exceeded';
      return { success: false, result, reason, serverTime, maxDevices: licenseRecord.maxDevices };
    }

    if (!activation) {
      activation = await dashboardDb.deviceActivation.create({
        data: {
          licenseId: licenseRecord.id,
          userId: licenseRecord.userId,
          accountId: input.accountId,
          deviceIdHash,
          platform: input.platform,
          appVersion: input.appVersion,
          deviceLabel: input.deviceLabel,
          firstSeenAt: now,
          lastSeenAt: now,
          metadata: {},
        },
      });
    } else {
      activation = await dashboardDb.deviceActivation.update({
        where: { id: activation.id },
        data: {
          lastSeenAt: now,
          platform: input.platform,
          appVersion: input.appVersion,
          deviceLabel: input.deviceLabel ?? activation.deviceLabel,
        },
      });
    }

    const graceMs = Math.min(
      licenseRecord.expiresAt.getTime(),
      now.getTime() + Number(licenseRecord.offlineGraceHours) * 60 * 60 * 1000,
    );
    const graceUntil = new Date(graceMs).toISOString();
    const graceToken = signGraceToken({
      licenseId: licenseRecord.id,
      userId: licenseRecord.userId,
      accountId: licenseRecord.accountId,
      deviceIdHash,
      platform: input.platform,
      status: 'ACTIVE',
      serverTime,
      graceUntil,
      expiresAt: licenseRecord.expiresAt.toISOString(),
      validationId: crypto.randomUUID(),
    }, privateKeyPem, keyId);

    await dashboardDb.license.update({
      where: { id: licenseRecord.id },
      data: {
        lastValidatedAt: now,
        offlineGraceUntil: new Date(graceUntil),
      },
    });

    result = 'ALLOWED';
    reason = 'valid';
    return {
      success: true,
      result,
      reason,
      serverTime,
      expiresAt: licenseRecord.expiresAt.toISOString(),
      remainingSeconds: timeState.remainingSeconds,
      offlineGraceUntil: graceUntil,
      graceToken,
      activationId: activation.id,
      maxDevices: licenseRecord.maxDevices,
    };
  } finally {
    await dashboardDb.licenseValidation.create({
      data: {
        licenseId: licenseRecord?.id,
        accountId: input.accountId,
        deviceIdHash,
        platform: input.platform,
        appVersion: input.appVersion,
        result,
        reason,
        serverTime: now,
        ipAddress: requestMeta.ipAddress || undefined,
        userAgent: requestMeta.userAgent || undefined,
        metadata: {
          redactedLicenseKey: redactLicenseKey(input.licenseKey),
          parsedLicenseId: parsedPayload?.licenseId,
        },
      },
    }).catch((error: unknown) => console.error('failed to store license validation', error));
  }
}

export async function revokeLicense(input: { licenseId?: string; licenseKey?: string; reason?: string }) {
  const dashboardDb = db as DashboardDb;
  const where = input.licenseId
    ? { id: input.licenseId }
    : input.licenseKey
      ? { licenseKeyHash: hashLicenseKey(input.licenseKey) }
      : null;
  if (!where) throw new Error('licenseId or licenseKey is required');

  return dashboardDb.license.update({
    where,
    data: {
      status: 'REVOKED',
      revokedAt: new Date(),
      revokeReason: input.reason || 'admin_revoked',
    },
  });
}

export async function renewLicense(input: { licenseId?: string; licenseKey?: string; expiresAt: string; metadata?: Record<string, unknown> }) {
  const dashboardDb = db as DashboardDb;
  const { privateKeyPem, keyId } = signingConfig();
  const where = input.licenseId
    ? { id: input.licenseId }
    : input.licenseKey
      ? { licenseKeyHash: hashLicenseKey(input.licenseKey) }
      : null;
  if (!where) throw new Error('licenseId or licenseKey is required');

  const current = await dashboardDb.license.findUnique({ where, include: { user: true } });
  if (!current) throw new Error('License not found');
  if (!current.user?.isActive) throw new Error('License user is inactive');

  const expiresAt = new Date(input.expiresAt);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
    throw new Error('expiresAt must be a future ISO date');
  }

  const payload = makeLicensePayload({
    licenseId: current.id,
    userId: current.userId,
    accountId: current.accountId,
    status: 'ACTIVE',
    issuedAt: current.issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    maxDevices: current.maxDevices,
    offlineGraceHours: current.offlineGraceHours,
    features: current.features || [],
    metadata: input.metadata ?? current.metadata ?? {},
  });
  const licenseKey = signLicensePayload(payload, privateKeyPem, keyId);
  const licenseKeyHash = hashLicenseKey(licenseKey);
  const record = await dashboardDb.license.update({
    where: { id: current.id },
    data: {
      keyId,
      licenseKeyHash,
      signedPayload: licenseKey,
      status: 'ACTIVE',
      revokedAt: null,
      revokeReason: null,
      renewedAt: new Date(),
      expiresAt,
      metadata: payload.metadata,
    },
  });

  return {
    license: record,
    licenseKey,
    licenseKeyHash,
    redactedLicenseKey: redactLicenseKey(licenseKey),
  };
}

export async function getLicenseById(id: string) {
  const dashboardDb = db as DashboardDb;
  return dashboardDb.license.findUnique({
    where: { id },
    include: { user: true, deviceActivations: true, validations: { orderBy: { createdAt: 'desc' }, take: 50 } },
  });
}

export async function getUserLicenses(userId: string) {
  const dashboardDb = db as DashboardDb;
  return dashboardDb.license.findMany({
    where: { userId },
    include: { deviceActivations: true },
    orderBy: { createdAt: 'desc' },
  });
}
