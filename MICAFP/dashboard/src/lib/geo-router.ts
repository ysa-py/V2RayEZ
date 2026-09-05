// ─────────────────────────────────────────────────────────────────────────────
// Vor Geo-Routing catalog + live-routing gate.
//
// ANTI-FABRICATION: A prior version of this module generated fake ping latencies,
// load percentages, packet loss and health statuses with Math.random(). No real
// measurement ever happened.
//
// Correct behavior: this module is now a *static catalog only*. It exports real
// server-country metadata (code, capacity, feature set, Iranian bypass support)
// and a single honest `geoRouterUnavailable` marker. Live latency/load/health is
// only ever supplied by a real Vor core backend; until that is connected, the
// dashboard must not present measured-looking values.
//
// No function here invokes Math.random(), and no function manufactures telemetry.
// ─────────────────────────────────────────────────────────────────────────────

export interface GeoRouterCountryCatalogEntry {
  code: string;
  name: string;
  nameFa: string;
  servers: number;
  supportsIranBypass: boolean;
  features: string[];
  featuresFa: string[];
}

const SERVER_COUNTRY_DEFINITIONS: GeoRouterCountryCatalogEntry[] = [
  { code: 'DE', name: 'Germany', nameFa: 'آلمان', servers: 24, supportsIranBypass: true, features: ['VLESS Reality', 'Hysteria2', 'AmneziaWG', 'VMess WS'], featuresFa: ['VLESS Reality', 'هیستریا۲', 'آمنزیاوی‌جی', 'VMess WS'] },
  { code: 'NL', name: 'Netherlands', nameFa: 'هلند', servers: 18, supportsIranBypass: true, features: ['VLESS Reality', 'Trojan gRPC', 'ShadowTLS', 'TUIC v5'], featuresFa: ['VLESS Reality', 'تروجان gRPC', 'شدوتی‌ال‌اس', 'TUIC نسخه ۵'] },
  { code: 'FI', name: 'Finland', nameFa: 'فنلاند', servers: 8, supportsIranBypass: true, features: ['VLESS Reality', 'WireGuard+Noise', 'Hysteria2'], featuresFa: ['VLESS Reality', 'وایرگارد+نویز', 'هیستریا۲'] },
  { code: 'SE', name: 'Sweden', nameFa: 'سوئد', servers: 6, supportsIranBypass: true, features: ['AmneziaWG', 'VLESS Fragment', 'NaiveProxy'], featuresFa: ['آمنزیاوی‌جی', 'VLESS Fragment', 'نایوپروکسی'] },
  { code: 'FR', name: 'France', nameFa: 'فرانسه', servers: 12, supportsIranBypass: true, features: ['VLESS Reality', 'VMess WS', 'Trojan', 'Hysteria2'], featuresFa: ['VLESS Reality', 'VMess WS', 'تروجان', 'هیستریا۲'] },
  { code: 'US', name: 'USA', nameFa: 'آمریکا', servers: 30, supportsIranBypass: true, features: ['VLESS Reality', 'AmneziaWG', 'Trojan', 'Hysteria2', 'VMess'], featuresFa: ['VLESS Reality', 'آمنزیاوی‌جی', 'تروجان', 'هیستریا۲', 'VMess'] },
  { code: 'CA', name: 'Canada', nameFa: 'کانادا', servers: 10, supportsIranBypass: true, features: ['VLESS Reality', 'AmneziaWG', 'Hysteria2'], featuresFa: ['VLESS Reality', 'آمنزیاوی‌جی', 'هیستریا۲'] },
  { code: 'GB', name: 'UK', nameFa: 'انگلستان', servers: 14, supportsIranBypass: true, features: ['VLESS Reality', 'VMess WS', 'Trojan gRPC'], featuresFa: ['VLESS Reality', 'VMess WS', 'تروجان gRPC'] },
  { code: 'JP', name: 'Japan', nameFa: 'ژاپن', servers: 8, supportsIranBypass: true, features: ['VLESS Reality', 'Hysteria2', 'WireGuard+Noise'], featuresFa: ['VLESS Reality', 'هیستریا۲', 'وایرگارد+نویز'] },
];

export const GEO_ROUTER_SERVER_COUNTRIES: GeoRouterCountryCatalogEntry[] = SERVER_COUNTRY_DEFINITIONS;

export const GEO_ROUTER_LIVE_TELEMETRY_AVAILABLE = false;
export const GEO_ROUTER_MOCK = false;

export function getIranBypassRules() {
  return [
    { id: 'direct', name: 'Direct', nameFa: 'مستقیم' },
    { id: 'dns-hijack', name: 'DNS hijack bypass', nameFa: 'عبور از ربودن DNS' },
  ];
}

export function geoRouterUnavailable() {
  return {
    success: false,
    reason: 'real_core_backend_unavailable',
    timestamp: Date.now(),
    telemetryMode: 'unavailable',
    message: 'Live geo-routing latency/load/health requires a real Vor core backend; no values were simulated.',
    countries: GEO_ROUTER_SERVER_COUNTRIES.map((c) => ({
      ...c,
      activeServers: null,
      avgLatencyMs: null,
      loadPercent: null,
      isHealthy: null,
      lastChecked: null,
    })),
  };
}
