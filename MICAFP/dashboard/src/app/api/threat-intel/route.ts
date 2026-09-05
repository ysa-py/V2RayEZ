import { NextRequest, NextResponse } from 'next/server';

// ─────────────────────────────────────────────────────────────────────────────
// Threat intelligence endpoint.
//
// ANTI-FABRICATION: The previous state seeded "active threats" and randomly
// added blocked-domain counts / "new threat detected" on scan. No real threat
// feed or DPI signature update was ever consulted.
//
// Correct behavior: return the static DPI-signature catalogue metadata and fail
// closed on every live/intelligence action until a real feed is connected.
// ─────────────────────────────────────────────────────────────────────────────

const staticCatalog = {
  dpiVersions: {
    installed: '2026.05.23-r2',
    newestKnown: '2026.05.23-r3',
    signatureCount: 6,
  },
  feed: { name: 'No external feed configured', enabled: false },
};

export async function GET() {
  return NextResponse.json(
    {
      success: false,
      reason: 'real_core_backend_unavailable',
      timestamp: Date.now(),
      mode: 'catalog',
      catalog: staticCatalog,
      activeThreats: [],
      threatLevel: 'unknown',
      blockedDomainsCount: null,
      message: 'Live threat intel requires a real Vor feed; no threat was simulated.',
    },
    { status: 503 },
  );
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
      message: 'Threat intel action requires a real Vor feed; no scan/mitigation/signature update was simulated.',
    },
    { status: 503 },
  );
}
