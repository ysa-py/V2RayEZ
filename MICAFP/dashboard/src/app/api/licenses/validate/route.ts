import { NextRequest, NextResponse } from 'next/server';
import { validateLicense } from '@/lib/license-service';

function clientIp(request: NextRequest): string | null {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await validateLicense({
      licenseKey: String(body.licenseKey || ''),
      deviceId: String(body.deviceId || ''),
      accountId: String(body.accountId || ''),
      platform: String(body.platform || ''),
      appVersion: body.appVersion ? String(body.appVersion) : undefined,
      deviceLabel: body.deviceLabel ? String(body.deviceLabel) : undefined,
      clientLastServerTime: body.clientLastServerTime ? String(body.clientLastServerTime) : undefined,
    }, {
      ipAddress: clientIp(request),
      userAgent: request.headers.get('user-agent'),
    });

    return NextResponse.json(result, { status: result.success ? 200 : 403 });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        result: 'DENIED',
        reason: 'validation_error',
        error: error instanceof Error ? error.message : 'License validation failed',
        serverTime: new Date().toISOString(),
      },
      { status: 400 },
    );
  }
}
