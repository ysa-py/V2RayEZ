import { NextRequest, NextResponse } from 'next/server';

// ─────────────────────────────────────────────────────────────────────────────
// Orchestrator endpoint.
//
// ANTI-FABRICATION: The previous implementation seeded a "reward history",
// "UCB scores", "active core", "switch counts", "imminent block risk" and
// "latest orchestration cycle" from hardcoded arrays plus `Math.random()`. No
// real transport was ever selected or switched.
//
// Correct behavior: provider/carrier rule metadata and the algorithm identity
// are real; live scores/decisions are unavailable until a real orchestration
// runtime is connected. Actions fail closed.
// ─────────────────────────────────────────────────────────────────────────────

const CORE_IDS = [
  'hiddify', 'xray-gfw', 'sing-box',
  'amneziavpn', 'defyxvpn', 'moav',
  'lantern', 'mahsang', 'psiphon',
] as const;

const ISP_RULES = [
  { id: 'mci', name: 'MCI (Hamrahe Avval)', nameFa: 'همراه اول', preferredCores: ['mahsang', 'amneziavpn'] },
  { id: 'irancell', name: 'Irancell (MTN)', nameFa: 'ایرانسل', preferredCores: ['hiddify', 'defyxvpn'] },
  { id: 'shatel', name: 'Shatel', nameFa: 'شتل', preferredCores: ['amneziavpn', 'psiphon'] },
  { id: 'asiatech', name: 'Asiatech', nameFa: 'آسیاتک', preferredCores: ['mahsang', 'hiddify'] },
  { id: 'rightel', name: 'Rightel', nameFa: 'رایتل', preferredCores: ['defyxvpn', 'hiddify'] },
];

function unavailable(message = 'No real Vor orchestration runtime is connected to this dashboard.') {
  return {
    success: false,
    reason: 'real_core_backend_unavailable',
    timestamp: Date.now(),
    message,
    telemetryMode: 'unavailable',
    algorithm: {
      name: 'UCB1 (Upper Confidence Bound)',
      description: 'Multi-Armed Bandit with UCB1 exploration-exploitation balance',
    },
    cores: CORE_IDS,
    ispRules: ISP_RULES,
    state: {
      activeCoreId: null,
      shadowConnections: [],
      scoringMatrix: null,
      ucbScores: null,
      predictionState: null,
      totalSwitches: null,
      successfulSwitches: null,
      averageSwitchTime: null,
      detectedISP: null,
      healthScore: null,
      lastOrchestrationCycle: null,
    },
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
      message: 'Orchestration control requires a real Vor orchestration runtime; no route was switched.',
    },
    { status: 503 },
  );
}
