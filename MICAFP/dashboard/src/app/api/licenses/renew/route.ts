import { NextRequest, NextResponse } from 'next/server';
import { requireLicenseAdmin, writeAuditLog } from '@/lib/license-auth';
import { renewLicense } from '@/lib/license-service';

export async function POST(request: NextRequest) {
  const auth = await requireLicenseAdmin(request);
  if (!auth.ok) return auth.response!;

  try {
    const body = await request.json();
    const result = await renewLicense({
      licenseId: body.licenseId ? String(body.licenseId) : undefined,
      licenseKey: body.licenseKey ? String(body.licenseKey) : undefined,
      expiresAt: String(body.expiresAt || ''),
      metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : undefined,
    });

    await writeAuditLog(auth.actor, 'license.renew', result.license.id, {
      expiresAt: result.license.expiresAt,
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
      { success: false, error: error instanceof Error ? error.message : 'License renew failed' },
      { status: 400 },
    );
  }
}
