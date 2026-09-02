import { NextRequest, NextResponse } from 'next/server';
import { requireLicenseAdmin, writeAuditLog } from '@/lib/license-auth';
import { revokeDeviceActivation } from '@/lib/license-service';

export async function POST(request: NextRequest) {
  const auth = await requireLicenseAdmin(request);
  if (!auth.ok) return auth.response!;

  try {
    const body = await request.json();
    const activation = await revokeDeviceActivation({
      activationId: body.activationId ? String(body.activationId) : undefined,
      licenseId: body.licenseId ? String(body.licenseId) : undefined,
      deviceIdHash: body.deviceIdHash ? String(body.deviceIdHash) : undefined,
      reason: body.reason ? String(body.reason) : undefined,
    });

    await writeAuditLog(auth.actor, 'license.device.revoke', activation.id, {
      licenseId: activation.licenseId,
      userId: activation.userId,
      accountId: activation.accountId,
      platform: activation.platform,
      reason: body.reason ? String(body.reason) : 'operator_device_revoke',
    }, request);

    return NextResponse.json({ success: true, activation });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Device activation revoke failed' },
      { status: 400 },
    );
  }
}
