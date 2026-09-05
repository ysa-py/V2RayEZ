import { NextRequest, NextResponse } from 'next/server';

// ─────────────────────────────────────────────────────────────────────────────
// Auto-reconnect endpoint.
//
// ANTI-FABRICATION: This route previously returned hardcoded reconnect event
// history, "success rate", and simulated state changes. No real reconnect ever
// happened in the dashboard process.
//
// Correct behavior: expose the configurable auto-reconnect policy (real defaults)
// and report that live reconnect telemetry and control are unavailable until a
// real core/guardian backend is connected. Actions fail closed.
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_POLICY = {
  enabled: true,
  maxRetries: 10,
  retryInterval: 3000,
  exponentialBackoff: true,
  preferredCoreOrder: ['xray-gfw', 'mahsang', 'hiddify', 'defyxvpn', 'amneziavpn', 'sing-box', 'moav', 'lantern', 'psiphon'],
  fallbackToPsiphon: true,
  reconnectOnDPI: true,
  reconnectOnBlock: true,
  reconnectOnDnsLeak: true,
};

function unavailable(message = 'No real Vor core guardian is connected to this dashboard.') {
  return {
    success: false,
    reason: 'real_core_backend_unavailable',
    timestamp: Date.now(),
    message,
    state: { ...DEFAULT_POLICY, reconnectStatus: 'unknown', retryCount: null },
    stats: {
      successRate: null,
      averageReconnectTimeSec: null,
      nextRetryDelayMs: null,
      isExponential: DEFAULT_POLICY.exponentialBackoff,
      retriesRemaining: null,
    },
    history: [],
  };
}

export async function GET() {
  return NextResponse.json(unavailable(), { status: 503 });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { action } = body as { action?: string };
  if (!action) {
    return NextResponse.json(
      { success: false, reason: 'missing_action', error: 'Missing required field: action' },
      { status: 400 },
    );
  }
  return NextResponse.json(
    {
      success: false,
      reason: 'real_core_backend_unavailable',
      timestamp: Date.now(),
      action,
      message: 'Auto-reconnect control requires a real Vor core guardian; no state was simulated.',
    },
    { status: 503 },
  );
}
