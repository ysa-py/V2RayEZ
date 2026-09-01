import { NextRequest, NextResponse } from 'next/server';
import { requireLicenseAdmin } from '@/lib/license-auth';
import { getUserLicenses } from '@/lib/license-service';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireLicenseAdmin(request);
  if (!auth.ok) return auth.response!;

  const { id } = await context.params;
  const licenses = await getUserLicenses(id);
  return NextResponse.json({ success: true, licenses });
}
