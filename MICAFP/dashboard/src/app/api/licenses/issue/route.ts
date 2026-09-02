import { NextRequest, NextResponse } from 'next/server';
import { requireLicenseAdmin, writeAuditLog } from '@/lib/license-auth';
import { issueLicense } from '@/lib/license-service';

export async function POST(request: NextRequest) {
  const auth = await requireLicenseAdmin(request);
  if (!auth.ok) return auth.response!;

  try {
    const body = await request.json();
    const result = await issueLicense({
      userId: String(body.userId || ''),
      accountId: body.accountId ? String(body.accountId) : undefined,
      expiresAt: String(body.expiresAt || ''),
      maxDevices: body.maxDevices === undefined ? undefined : Number(body.maxDevices),
      offlineGraceHours: body.offlineGraceHours === undefined ? undefined : Number(body.offlineGraceHours),
      features: Array.isArray(body.features) ? body.features.map(String) : [],
      metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {},
    });

    await writeAuditLog(auth.actor, 'license.issue', result.license.id, {
      userId: result.license.userId,
      accountId: result.license.accountId,
      expiresAt: result.license.expiresAt,
      maxDevices: result.license.maxDevices,
      offlineGraceHours: result.license.offlineGraceHours,
      redactedLicenseKey: result.redactedLicenseKey,
    }, request);

    return NextResponse.json({
      success: true,
      license: result.license,
      licenseKey: result.licenseKey,
      redactedLicenseKey: result.redactedLicenseKey,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'License issue failed' },
      { status: 400 },
    );
  }
}
