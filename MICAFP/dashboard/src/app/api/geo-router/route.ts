import { NextRequest, NextResponse } from 'next/server';
import { geoRouterUnavailable, GEO_ROUTER_SERVER_COUNTRIES, GEO_ROUTER_LIVE_TELEMETRY_AVAILABLE } from '@/lib/geo-router';

// ─────────────────────────────────────────────────────────────────────────────
// Geo-router endpoint.
//
// ANTI-FABRICATION: This route (and its previous lib) returned simulated server
// latencies, packet loss, load, and health statuses generated with Math.random().
// No real server was ever pinged.
//
// Correct behavior: return the static country catalog plus an explicit
// `real_core_backend_unavailable` status. Live routing/selection requires a real
// Vor core backend.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET() {
  const payload = geoRouterUnavailable();
  return NextResponse.json(
    {
      ...payload,
      selectedCountry: null,
      recommendation: null,
      serverList: GEO_ROUTER_SERVER_COUNTRIES.map((c) => ({
        code: c.code,
        name: c.name,
        nameFa: c.nameFa,
        servers: c.servers,
        supportsIranBypass: c.supportsIranBypass,
        activeServers: null,
        avgLatencyMs: null,
        loadPercent: null,
        isHealthy: null,
        lastChecked: null,
      })),
      liveTelemetryAvailable: GEO_ROUTER_LIVE_TELEMETRY_AVAILABLE,
      mode: 'catalog-unavailable',
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
      message: 'Geo-routing selection requires a real Vor core backend; no route was selected.',
    },
    { status: 503 },
  );
}
