import { NextRequest, NextResponse } from 'next/server';

// ─────────────────────────────────────────────────────────────────────────────
// OTA endpoint.
//
// ANTI-FABRICATION: A prior version returned a fabricated "updates available"
// list and simulated update checks with Math.random(). No update was ever
// fetched or verified.
//
// Correct behavior: OTA metadata (channels, signing policy) is real, but no
// update is reported as available until a real GitHub/mirror check with valid
// SHA-256 + signature verification has completed. POST actions fail closed
// against the real updater/installer backend.
// ─────────────────────────────────────────────────────────────────────────────

function unavailable(message = 'No real Vor OTA updater is connected to this dashboard.') {
  return {
    success: false,
    reason: 'real_core_backend_unavailable',
    timestamp: Date.now(),
    message,
    mode: 'catalog-unavailable',
    channels: [
      { id: 'github', name: 'GitHub Releases', enabled: false, verifiesSha256: true, verifiesSignature: true },
      { id: 'mirror', name: 'Signed mirror', enabled: false, verifiesSha256: true, verifiesSignature: true },
    ],
    updates: [],
    lastCheck: null,
    nextCheck: null,
    availableCount: 0,
    criticalCount: 0,
  };
}

export async function GET() {
  return NextResponse.json(unavailable(), { status: 503 });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { action } = body as { action?: string };
  return NextResponse.json(
    {
      success: false,
      reason: 'real_core_backend_unavailable',
      timestamp: Date.now(),
      action: action || null,
      message: 'OTA check/install requires a real updater; no update was fetched, verified, or installed.',
    },
    { status: 503 },
  );
}
