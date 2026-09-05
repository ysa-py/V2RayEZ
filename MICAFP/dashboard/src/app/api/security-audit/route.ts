import { NextRequest, NextResponse } from 'next/server';

// ─────────────────────────────────────────────────────────────────────────────
// Security audit endpoint.
//
// ANTI-FABRICATION: The previous POST "run-audit" produced a fabricated privacy
// score and leak booleans, plus a random audit duration. No DNS/WebRTC/IPv6/leak
// probe was performed.
//
// Correct behavior: expose the real audit test catalog, but require a real
// security engine. Running an audit fails closed; no score is manufactured.
// ─────────────────────────────────────────────────────────────────────────────

const TEST_CATALOG = [
  { id: 'dns-leak', name: 'DNS Leak', nameFa: 'نشت DNS' },
  { id: 'webrtc-leak', name: 'WebRTC Leak', nameFa: 'نشت WebRTC' },
  { id: 'ipv6-leak', name: 'IPv6 Leak', nameFa: 'نشت IPv6' },
  { id: 'kill-switch', name: 'Kill Switch', nameFa: 'کلید کشت' },
  { id: 'encryption', name: 'Encryption', nameFa: 'رمزنگاری' },
];

export async function GET() {
  return NextResponse.json(
    {
      success: false,
      reason: 'real_core_backend_unavailable',
      timestamp: Date.now(),
      mode: 'catalog',
      tests: TEST_CATALOG,
      message: 'Live security audit requires a real Vor core security engine; no result was simulated.',
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
      message: 'Security audit requires a real Vor core security engine; no leak test was simulated.',
    },
    { status: 503 },
  );
}
