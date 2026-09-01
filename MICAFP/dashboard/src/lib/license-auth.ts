import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

type DashboardDb = typeof db & {
  session: any;
  auditLog: any;
};

export interface LicenseAdminActor {
  userId: string | null;
  role: 'ADMIN' | 'OPERATOR';
  authMethod: 'bootstrap-token' | 'session';
}

export interface LicenseAuthResult {
  ok: boolean;
  actor?: LicenseAdminActor;
  response?: NextResponse;
}

function bearerToken(request: NextRequest): string | null {
  const header = request.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export async function requireLicenseAdmin(request: NextRequest): Promise<LicenseAuthResult> {
  const bearer = bearerToken(request);
  const bootstrapToken = process.env.LICENSE_ADMIN_TOKEN;

  if (bootstrapToken && bearer && bearer === bootstrapToken) {
    return {
      ok: true,
      actor: {
        userId: null,
        role: 'ADMIN',
        authMethod: 'bootstrap-token',
      },
    };
  }

  const sessionToken = request.headers.get('x-session-token') || bearer;
  if (!sessionToken) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: 'Admin authorization is required' },
        { status: 401 },
      ),
    };
  }

  const dashboardDb = db as DashboardDb;
  const session = await dashboardDb.session.findUnique({
    where: { token: sessionToken },
    include: { user: true },
  });

  if (!session || !session.user || session.expiresAt <= new Date() || !session.user.isActive) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: 'Session is invalid or expired' },
        { status: 401 },
      ),
    };
  }

  if (session.user.role !== 'ADMIN' && session.user.role !== 'OPERATOR') {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: 'ADMIN or OPERATOR role is required' },
        { status: 403 },
      ),
    };
  }

  return {
    ok: true,
    actor: {
      userId: session.user.id,
      role: session.user.role,
      authMethod: 'session',
    },
  };
}

export async function writeAuditLog(actor: LicenseAdminActor | null | undefined, action: string, resource: string, details: Record<string, unknown>, request?: NextRequest) {
  try {
    const dashboardDb = db as DashboardDb;
    await dashboardDb.auditLog.create({
      data: {
        userId: actor?.userId ?? undefined,
        action,
        resource,
        details,
        ipAddress: request?.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request?.headers.get('x-real-ip') || undefined,
      },
    });
  } catch (error) {
    console.error('failed to write audit log', error);
  }
}
