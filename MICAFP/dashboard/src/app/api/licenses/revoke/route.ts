import { NextRequest, NextResponse } from 'next/server';
import { requireLicenseAdmin, writeAuditLog } from '@/lib/license-auth';
import { revokeLicense } from '@/lib/license-service';

export async function POST(request: NextRequest) {
  const auth = await requireLicenseAdmin(request);
  if (!auth.ok) return auth.response!;

  try {
    const body = await request.json();
    const license = await revokeLicense({
      licenseId: body.licenseId ? String(body.licenseId) : undefined,
      licenseKey: body.licenseKey ? String(body.licenseKey) : undefined,
      reason: body.reason ? String(body.reason) : undefined,
    });

    await writeAuditLog(auth.actor, 'license.revoke', license.id, {
      reason: license.revokeReason,
      userId: license.userId,
      accountId: license.accountId,
    }, request);

    return NextResponse.json({ success: true, license });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'License revoke failed' },
      { status: 400 },
    );
  }
}
