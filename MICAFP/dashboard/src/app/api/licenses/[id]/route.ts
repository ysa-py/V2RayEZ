import { NextRequest, NextResponse } from 'next/server';
import { requireLicenseAdmin } from '@/lib/license-auth';
import { getLicenseById } from '@/lib/license-service';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireLicenseAdmin(request);
  if (!auth.ok) return auth.response!;

  const { id } = await context.params;
  const license = await getLicenseById(id);
  if (!license) {
    return NextResponse.json({ success: false, error: 'License not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true, license });
}
