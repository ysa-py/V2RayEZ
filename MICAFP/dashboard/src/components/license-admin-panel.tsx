'use client';

import React, { useMemo, useState } from 'react';
import { KeyRound, ShieldCheck, ShieldX, RefreshCw, Copy } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

async function postJson(path: string, body: unknown) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) throw new Error(data.error || data.reason || 'Request failed');
  return data;
}

export function LicenseAdminPanel() {
  const [userId, setUserId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [maxDevices, setMaxDevices] = useState('3');
  const [offlineGraceHours, setOfflineGraceHours] = useState('72');
  const [features, setFeatures] = useState('android,ios,windows,linux,openwrt,ai-gateway');
  const [licenseKey, setLicenseKey] = useState('');
  const [licenseId, setLicenseId] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [platform, setPlatform] = useState('android');
  const [status, setStatus] = useState('آماده برای صدور/اعتبارسنجی');
  const [busy, setBusy] = useState(false);

  const parsedFeatures = useMemo(
    () => features.split(',').map(item => item.trim()).filter(Boolean),
    [features],
  );

  async function issue() {
    setBusy(true);
    try {
      const data = await postJson('/api/licenses/issue', {
        userId,
        accountId: accountId || undefined,
        expiresAt,
        maxDevices: Number(maxDevices || 1),
        offlineGraceHours: Number(offlineGraceHours || 72),
        features: parsedFeatures,
      });
      setLicenseKey(data.licenseKey || '');
      setLicenseId(data.license?.id || '');
      setStatus(`صادر شد: ${data.redactedLicenseKey || data.license?.id || 'serial'}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'خطا در صدور');
    } finally {
      setBusy(false);
    }
  }

  async function validate() {
    setBusy(true);
    try {
      const data = await postJson('/api/licenses/validate', {
        licenseKey,
        deviceId: deviceId || 'dashboard-test-device',
        accountId,
        platform,
        deviceLabel: 'Dashboard test device',
      });
      setStatus(`${data.result || 'ALLOWED'} · ${data.reason || 'valid'} · ${data.remainingSeconds ?? 0}s`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'اعتبارسنجی ناموفق');
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    try {
      const data = await postJson('/api/licenses/revoke', {
        licenseId: licenseId || undefined,
        licenseKey: licenseId ? undefined : licenseKey,
        reason: 'dashboard_admin_revoke',
      });
      setStatus(`لغو شد: ${data.license?.id || licenseId || 'license'}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'لغو ناموفق');
    } finally {
      setBusy(false);
    }
  }

  async function renew() {
    setBusy(true);
    try {
      const data = await postJson('/api/licenses/renew', {
        licenseId: licenseId || undefined,
        licenseKey: licenseId ? undefined : licenseKey,
        expiresAt,
      });
      setLicenseKey(data.licenseKey || licenseKey);
      setStatus(`تمدید شد: ${data.redactedLicenseKey || data.license?.id || 'license'}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'تمدید ناموفق');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="shield-card border-emerald-500/20 bg-slate-950/80">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-emerald-300">
              <KeyRound className="h-5 w-5" /> سامانه سریال و لایسنس V2RayEZ
            </CardTitle>
            <CardDescription>
              صدور، تمدید، لغو و اعتبارسنجی با امضای Ed25519، انقضای مستقل هر کاربر و توکن Grace آفلاین.
            </CardDescription>
          </div>
          <Badge variant={status.includes('خطا') || status.includes('DENIED') ? 'destructive' : 'secondary'}>{status}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2"><Label>User ID</Label><Input value={userId} onChange={e => setUserId(e.target.value)} placeholder="Prisma user id" /></div>
          <div className="space-y-2"><Label>Account ID</Label><Input value={accountId} onChange={e => setAccountId(e.target.value)} placeholder="user@example.com / tenant" /></div>
          <div className="space-y-2"><Label>Expires at</Label><Input value={expiresAt} onChange={e => setExpiresAt(e.target.value)} placeholder="2026-12-31T23:59:59Z" /></div>
          <div className="space-y-2"><Label>Max devices</Label><Input type="number" value={maxDevices} onChange={e => setMaxDevices(e.target.value)} /></div>
          <div className="space-y-2"><Label>Offline grace hours</Label><Input type="number" value={offlineGraceHours} onChange={e => setOfflineGraceHours(e.target.value)} /></div>
          <div className="space-y-2"><Label>Validation platform</Label><Input value={platform} onChange={e => setPlatform(e.target.value)} placeholder="android / ios / windows / linux / openwrt" /></div>
        </div>
        <div className="space-y-2"><Label>Features</Label><Input value={features} onChange={e => setFeatures(e.target.value)} /></div>
        <div className="space-y-2"><Label>Device ID for validation test</Label><Input value={deviceId} onChange={e => setDeviceId(e.target.value)} placeholder="leave blank for dashboard-test-device" /></div>
        <div className="space-y-2"><Label>Signed serial</Label><Textarea value={licenseKey} onChange={e => setLicenseKey(e.target.value)} rows={5} spellCheck={false} /></div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={issue} disabled={busy || !userId || !expiresAt}><ShieldCheck className="h-4 w-4 ml-1" /> صدور سریال</Button>
          <Button onClick={validate} disabled={busy || !licenseKey} variant="secondary"><RefreshCw className="h-4 w-4 ml-1" /> اعتبارسنجی</Button>
          <Button onClick={renew} disabled={busy || !licenseKey || !expiresAt} variant="secondary">تمدید</Button>
          <Button onClick={revoke} disabled={busy || !licenseKey} variant="destructive"><ShieldX className="h-4 w-4 ml-1" /> لغو</Button>
          <Button onClick={() => navigator.clipboard?.writeText(licenseKey)} disabled={!licenseKey} variant="outline"><Copy className="h-4 w-4 ml-1" /> کپی سریال</Button>
        </div>
      </CardContent>
    </Card>
  );
}
