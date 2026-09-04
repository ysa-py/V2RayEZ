import { NextRequest, NextResponse } from 'next/server';

// ─────────────────────────────────────────────────────────────────────────────
// AI engine endpoint.
//
// ANTI-FABRICATION: A prior version shipped hardcoded reward histories, UCB
// scores, "predicted block risk", "ISP detection", "switch counts" and simulated
// forced switches (with Math.random()). None of those numbers came from a real
// learned model or a real tunnel probe.
//
// Correct behavior: expose the algorithm identity and configuration only. All
// learned scores, reward history, predictions, ISP detections, and switches are
// unavailable until a real model/runtime is connected. Actions fail closed.
// ─────────────────────────────────────────────────────────────────────────────

const CORE_IDS = [
  'hiddify', 'xray-gfw', 'sing-box',
  'amneziavpn', 'defyxvpn', 'moav',
  'lantern', 'mahsang', 'psiphon',
] as const;

function unavailable(message = 'No real Vor AI/RL runtime is connected to this dashboard.') {
  return {
    success: false,
    reason: 'real_core_backend_unavailable',
    timestamp: Date.now(),
    message,
    algorithm: {
      name: 'UCB1 (Upper Confidence Bound)',
      description: 'Multi-Armed Bandit with UCB1 exploration-exploitation balance',
      version: '3.1.0',
    },
    cores: CORE_IDS,
    perCoreScores: null,
    predictionState: null,
    ispDetection: null,
    rlParameters: null,
    rewardHistory: null,
    ucbAlphas: null,
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
      message: 'AI/RL control requires a real Vor runtime; no reward/switch was recorded.',
    },
    { status: 503 },
  );
}
