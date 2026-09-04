import { NextRequest, NextResponse } from 'next/server';

// ─────────────────────────────────────────────────────────────────────────────
// Core metadata + real core control endpoint.
//
// ANTI-FABRICATION: The previous implementation generated "health" values
// (latency, packet loss, DPI exposure, bandwidth, uptime, block events) from
// `Math.random()` and simulated start/stop/restart transitions with `setTimeout`.
// No real core was ever started or measured.
//
// Correct behavior now: the static core definitions below are real product
// metadata (name, version, protocol capabilities, carrier role). Runtime health
// is deliberately unknown until a real Vor core backend is connected; every
// control action fails closed with a 503. No metrics are invented.
// ─────────────────────────────────────────────────────────────────────────────

interface CoreDefinition {
  id: string;
  name: string;
  nameFa: string;
  version: string;
  capabilities: string[];
  role: string;
  roleFa: string;
  platforms: string[];
  githubUrl: string;
  checksumSha256: string | null;
}

const CORE_DEFINITIONS_DATA: CoreDefinition[] = [
  { id: 'hiddify', name: 'hiddify-core', nameFa: 'هیدیفای', version: 'v4.1.0', capabilities: ['vless-reality-xtls', 'vmess-ws-tls', 'trojan-grpc', 'hysteria2', 'tuic-v5', 'shadowtls-v3', 'naiveproxy'], role: 'Primary orchestration core', roleFa: 'هسته هماهنگ‌سازی اصلی', platforms: ['android', 'windows', 'linux', 'ios', 'openwrt', 'macos'], githubUrl: 'https://github.com/hiddify/hiddify-core', checksumSha256: null },
  { id: 'xray-gfw', name: 'GFW-knocker/Xray-core', nameFa: 'ایکس‌ری GFW', version: 'v25.8.3-mahsa-r1', capabilities: ['vless-reality-xtls', 'vless-fragment', 'vmess-ws-tls', 'trojan-grpc', 'wireguard-noise', 'mvless'], role: 'Specialized Iran bypass engine', roleFa: 'موتور تخصصی عبور از فیلترینگ ایران', platforms: ['android', 'windows', 'linux', 'ios', 'openwrt', 'macos'], githubUrl: 'https://github.com/GFW-knocker/Xray-core', checksumSha256: null },
  { id: 'sing-box', name: 'sing-box', nameFa: 'سینگ‌باکس', version: 'v1.14.0-alpha.25', capabilities: ['hysteria2', 'tuic-v5', 'shadowtls-v3', 'vless-reality-xtls', 'vmess-ws-tls', 'shadowsocks-shadowtls', 'naiveproxy'], role: 'Protocol handler (embedded in hiddify)', roleFa: 'مدیریت پروتکل‌ها (داخلی هیدیفای)', platforms: ['android', 'windows', 'linux', 'ios', 'openwrt', 'macos'], githubUrl: 'https://github.com/SagerNet/sing-box', checksumSha256: null },
  { id: 'amneziavpn', name: 'AmneziaVPN (awg-go)', nameFa: 'آمنزیاوی‌پی‌ان', version: '4.8.15.4', capabilities: ['amneziawg-1.5'], role: 'AmneziaWG protocol handler', roleFa: 'مدیر پروتکل آمنزیاوی‌جی', platforms: ['android', 'windows', 'linux', 'ios', 'macos'], githubUrl: 'https://github.com/amnezia-vpn/awg-go', checksumSha256: null },
  { id: 'defyxvpn', name: 'DefyxVPN', nameFa: 'دیفیکس‌وی‌پی‌ان', version: 'v5.2.8', capabilities: ['defyxvpn-layers', 'vless-reality-xtls', 'amneziawg-1.5'], role: 'High-speed bypass with P2P', roleFa: 'عبور پرسرعت با P2P', platforms: ['android', 'windows', 'linux', 'ios', 'openwrt', 'macos'], githubUrl: 'https://github.com/UnboundTechCo/defyxVPN', checksumSha256: null },
  { id: 'moav', name: 'MoaV', nameFa: 'موآوی', version: 'v1.7.7', capabilities: ['moav-tunnel'], role: 'Adaptive tunnel engine', roleFa: 'موتور تونل تطبیقی', platforms: ['android', 'windows', 'linux', 'ios', 'macos'], githubUrl: 'https://github.com/GFW-knocker/MahsaNG', checksumSha256: null },
  { id: 'lantern', name: 'Lantern', nameFa: 'لنترن', version: 'v7.9.0', capabilities: ['lantern-df-pt', 'psiphon-cdn-front'], role: 'Domain fronting transport', roleFa: 'حمل فرانتینگ دامنه', platforms: ['android', 'windows', 'linux', 'ios', 'macos'], githubUrl: 'https://github.com/getlantern/lantern', checksumSha256: null },
  { id: 'mahsang', name: 'MahsaNG core', nameFa: 'مهساان‌جی', version: 'v26.3.31-mahsa-r1', capabilities: ['mahsang-obfs', 'vless-reality-xtls', 'vless-fragment', 'vmess-ws-tls', 'mvless', 'wireguard-noise'], role: 'Iran-optimized bypass engine', roleFa: 'موتور عبور بهینه‌شده برای ایران', platforms: ['android', 'windows', 'linux', 'ios', 'macos'], githubUrl: 'https://github.com/GFW-knocker/MahsaNG', checksumSha256: null },
  { id: 'psiphon', name: 'Psiphon Tunnel Core (GFW-knocker)', nameFa: 'سایفون', version: 'latest', capabilities: ['psiphon-ssh-obfs', 'psiphon-cdn-front'], role: 'Fallback layer (last resort)', roleFa: 'لایه بکاپ (آخرین مرحله)', platforms: ['android', 'windows', 'linux', 'ios', 'openwrt', 'macos'], githubUrl: 'https://github.com/GFW-knocker/psiphon-tunnel-core', checksumSha256: null },
];

function unavailableCoreResponse(message = 'No real Vor core runtime is connected to this dashboard.') {
  return {
    success: false,
    reason: 'real_core_backend_unavailable',
    timestamp: Date.now(),
    message,
    telemetryMode: 'unavailable',
    cores: CORE_DEFINITIONS_DATA.map((def) => ({
      ...def,
      status: 'unknown',
      priority: 0,
      health: null,
      lastChecked: null,
      blockEvents24h: null,
    })),
    summary: { connectedCores: [], standbyCores: [], errorCores: [] },
  };
}

export async function GET() {
  return NextResponse.json(unavailableCoreResponse(), { status: 503 });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { coreId, action } = body as { coreId?: string; action?: string };
  return NextResponse.json(
    {
      success: false,
      reason: 'real_core_backend_unavailable',
      timestamp: Date.now(),
      coreId: coreId || null,
      action: action || null,
      message: 'Core control requires a real Vor core backend; no action was simulated.',
    },
    { status: 503 },
  );
}
