import { NextResponse } from 'next/server';

// ─────────────────────────────────────────────────────────────────────────────
// System health endpoint.
//
// ANTI-FABRICATION: This route used to return plausible-looking latency, packet
// loss, DNS-leak, DPI-exposure, CPU/memory and UCB metrics generated from
// `Math.random()` and hardcoded "active core" names. None of those numbers came
// from a real Vor core runtime, so the dashboard was presenting simulated data
// as trusted telemetry.
//
// Correct behavior: when no real core backend is connected, fail closed with a
// 503 `real_core_backend_unavailable` response. It never synthesizes health
// metrics. Implementers can connect a real backend and replace these values with
// measured readings; do not repopulate this file with random numbers.
// ─────────────────────────────────────────────────────────────────────────────

const CORE_IDS = [
  'hiddify', 'xray-gfw', 'sing-box',
  'amneziavpn', 'defyxvpn', 'moav',
  'lantern', 'mahsang', 'psiphon',
] as const;

function unavailable(message = 'No real Vor core runtime is connected to this dashboard.') {
  return NextResponse.json(
    {
      success: false,
      reason: 'real_core_backend_unavailable',
      timestamp: Date.now(),
      message,
      status: 'unavailable',
      cores: CORE_IDS.map((coreId) => ({ coreId, status: 'unknown', health: null })),
      meta: {
        endpoint: '/api/health',
        telemetryMode: 'unavailable',
        descriptionFa: 'هیچ هسته Vor واقعی به این داشبورد متصل نیست؛ هیچ داده سلامت ساختگی بر نمی‌گردد.',
      },
    },
    { status: 503 },
  );
}

export async function GET() {
  return unavailable();
}
