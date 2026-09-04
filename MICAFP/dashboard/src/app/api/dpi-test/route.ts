import { NextRequest, NextResponse } from 'next/server';

// ─────────────────────────────────────────────────────────────────────────────
// DPI detection metadata + DPI test runner.
//
// ANTI-FABRICATION: The previous GET/POST endpoints returned simulated
// "connected/packet loss/latency" DPI test results generated with Math.random();
// no packet was ever captured or inspected.
//
// Correct behavior: the signature/test-endpoint catalog below is real static
// metadata. Live DPI probe results are unavailable until a real capture engine
// is connected; running a probe fails closed.
// ─────────────────────────────────────────────────────────────────────────────

const IRAN_DPI_SIGNATURES = [
  { signature: 'TLS-ClientHello-Reset', descriptionFa: 'بازنشانی ClientHello TLS — شایع‌ترین روش DPI ایران', hex: '16 03 01', severity: 'critical' as const },
  { signature: 'HTTP-403-Block', descriptionFa: 'صفحه ۴۰۳ ایرانی — مسدودسازی HTTP', hex: '48 54 54 50 2F 31 2E 31 20 34 30 33', severity: 'high' as const },
  { signature: 'Null-Route', descriptionFa: 'مسیریابی صفر — قطعی بی‌صدا', hex: '00 00 00 00', severity: 'medium' as const },
  { signature: 'SNI-Filter', descriptionFa: 'فیلتر SNI — بررسی نام سرور در TLS', hex: 'SNI-Filter-Detected', severity: 'critical' as const },
  { signature: 'DNS-Poison', descriptionFa: 'مسمومیت DNS — پاسخ جعلی DNS', hex: 'DNS-Poison-Response', severity: 'high' as const },
  { signature: 'Protocol-Detect', descriptionFa: 'تشخیص پروتکل — شناسایی الگوی پروتکل', hex: 'Protocol-Pattern-Match', severity: 'medium' as const },
];

const TEST_ENDPOINTS = [
  { id: 'te-1', url: 'https://www.youtube.com', nameFa: 'یوتیوب', category: 'video-streaming', categoryFa: 'استریم ویدیو' },
  { id: 'te-2', url: 'https://twitter.com', nameFa: 'توییتر/ایکس', category: 'social-media', categoryFa: 'شبکه اجتماعی' },
  { id: 'te-3', url: 'https://www.instagram.com', nameFa: 'اینستاگرام', category: 'social-media', categoryFa: 'شبکه اجتماعی' },
  { id: 'te-4', url: 'https://telegram.org', nameFa: 'تلگرام', category: 'messaging', categoryFa: 'پیام‌رسان' },
  { id: 'te-5', url: 'https://www.google.com', nameFa: 'گوگل', category: 'search-engine', categoryFa: 'موتور جستجو' },
  { id: 'te-6', url: 'https://discord.com', nameFa: 'دیسکورد', category: 'messaging', categoryFa: 'پیام‌رسان' },
  { id: 'te-7', url: 'https://github.com', nameFa: 'گیت‌هاب', category: 'development', categoryFa: 'توسعه' },
  { id: 'te-8', url: 'https://www.wikipedia.org', nameFa: 'ویکی‌پدیا', category: 'reference', categoryFa: 'مرجع' },
];

export async function GET() {
  return NextResponse.json(
    {
      success: false,
      reason: 'real_core_backend_unavailable',
      timestamp: Date.now(),
      mode: 'catalog',
      signatures: IRAN_DPI_SIGNATURES,
      signatureCount: IRAN_DPI_SIGNATURES.length,
      testEndpoints: TEST_ENDPOINTS,
      testEndpointCount: TEST_ENDPOINTS.length,
      message: 'Live DPI test results require a real Vor capture engine; no results were simulated.',
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
      message: 'DPI probe requires a real capture engine; no probe was simulated.',
    },
    { status: 503 },
  );
}
