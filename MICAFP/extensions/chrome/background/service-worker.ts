/**
 * V2RayEZ Universal — MV3 Service Worker
 * Manages proxy, PAC script generation, WebRTC relay, DoH, and ISP detection.
 */

import { ProxyManager } from './proxy-manager';
import { PacGenerator } from './pac-generator';
import { WebRelay } from './webrtc-relay';
import { DohResolver } from './doh-resolver';
import { ISPDetector } from './isp-detector';
import {
  DEFAULT_CONFIG,
  StorageKeys,
  type UnifiedShieldConfig,
  type ProxyState,
  type RelayPeer,
} from '../../shared/protocol';

/* ────────────────────── state ────────────────────── */

let config: UnifiedShieldConfig = { ...DEFAULT_CONFIG };
let proxyManager: ProxyManager;
let pacGenerator: PacGenerator;
let webRelay: WebRelay;
let dohResolver: DohResolver;
let ispDetector: ISPDetector;

const state: ProxyState = {
  connected: false,
  mode: 'auto',
  socksPort: 1080,
  webrtcActive: false,
  ispDetected: null,
  blockedCount: 0,
  lastBlockTime: null,
};

/* ────────────────────── lifecycle ────────────────────── */

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[V2RayEZ] Installed:', details.reason);
  await loadConfig();
  await initModules();
  if (details.reason === 'install') {
    await chrome.runtime.openOptionsPage();
  }
});

chrome.runtime.onStartup.addListener(async () => {
  await loadConfig();
  await initModules();
});

/* ────────────────────── config ────────────────────── */

async function loadConfig(): Promise<void> {
  const stored = await chrome.storage.local.get([StorageKeys.CONFIG, StorageKeys.LEGACY_CONFIG]);
  const savedConfig = stored[StorageKeys.CONFIG] ?? stored[StorageKeys.LEGACY_CONFIG];
  if (savedConfig) {
    config = { ...DEFAULT_CONFIG, ...savedConfig };
  }
  const stateStored = await chrome.storage.local.get([StorageKeys.STATE, StorageKeys.LEGACY_STATE]);
  const savedState = stateStored[StorageKeys.STATE] ?? stateStored[StorageKeys.LEGACY_STATE];
  if (savedState) {
    Object.assign(state, savedState);
  }
}

async function saveConfig(): Promise<void> {
  await chrome.storage.local.set({ [StorageKeys.CONFIG]: config });
  await chrome.storage.local.set({ [StorageKeys.STATE]: state });
}

/* ────────────────────── init ────────────────────── */

async function initModules(): Promise<void> {
  ispDetector = new ISPDetector(config);
  pacGenerator = new PacGenerator(config);
  proxyManager = new ProxyManager(config, pacGenerator);
  webRelay = new WebRelay(config);
  dohResolver = new DohResolver(config);

  // Detect ISP
  const isp = await ispDetector.detect();
  state.ispDetected = isp;
  console.log('[V2RayEZ] ISP detected:', isp?.name ?? 'unknown');

  // Auto-start proxy if configured
  if (config.autoStart) {
    await startProxy();
  }

  syncNativeIntegration();

  // Setup periodic ISP re-check
  chrome.alarms.create('isp-check', { periodInMinutes: 30 });
  chrome.alarms.create('config-sync', { periodInMinutes: 5 });
  chrome.alarms.onAlarm.addListener(handleAlarm);

  registerRequestMonitors();
}

/* ────────────────────── license gate ────────────────────── */

async function enforceLicense(): Promise<{ allowed: boolean; reason: string }> {
  if (!config.licenseInstalled) return { allowed: true, reason: 'license_not_configured' };
  const stored = await chrome.storage.local.get(StorageKeys.SECRETS);
  const secrets = { ...(stored[StorageKeys.SECRETS] ?? {}) } as Record<string, string>;
  const serial = String(secrets.licenseSerial ?? '').trim();
  if (!serial) return denyLicense('license_secret_missing');

  const accountId = (config.licenseAccountId ?? '').trim();
  const validationUrl = (config.licenseValidationUrl ?? '').trim();
  const publicKeyPem = (config.licensePublicKeyPem || '').trim();
  let verifiedLicensePayload: Record<string, unknown> | null = null;
  let licenseVerificationError = '';
  if (publicKeyPem) {
    try {
      verifiedLicensePayload = await verifyLicenseToken(serial, publicKeyPem);
      const localDeny = localLicenseDenial(verifiedLicensePayload, accountId);
      if (localDeny) return denyLicense(localDeny);
    } catch (error) {
      licenseVerificationError = safeError(error);
      if (!validationUrl) return denyLicense(`license_signature_invalid:${licenseVerificationError}`);
    }
  }

  const cached = await cachedLicenseDecision('preflight', secrets.licenseGraceToken, verifiedLicensePayload);
  if (cached && !cached.allowed && isHardCachedDenial(cached)) return cached;

  if (!accountId || !validationUrl) return await cachedLicenseDecision('license_account_or_server_missing', secrets.licenseGraceToken, verifiedLicensePayload) ?? denyLicense('online_validation_required');

  try {
    const response = await fetch(licenseEndpoint(validationUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        licenseKey: serial,
        deviceId: `browser-extension:${chrome.runtime.id}`,
        accountId,
        platform: 'browser-extension',
        appVersion: chrome.runtime.getManifest().version,
        deviceLabel: `${chrome.runtime.getManifest().name} ${chrome.runtime.id}`,
        clientLastServerTime: config.licenseLastServerTime || undefined,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.success !== true) return denyLicense(String(body.reason || 'license_denied'));
    config.licenseLastResult = 'ALLOWED';
    config.licenseLastReason = String(body.reason || 'valid');
    config.licenseExpiresAt = String(body.expiresAt || '');
    const serverTime = String(body.serverTime || '');
    if (serverTime) config.licenseLastServerTime = serverTime;
    const graceToken = String(body.graceToken || '');
    if (graceToken && (config.licensePublicKeyPem || '').trim()) {
      try {
        const gracePayload = await verifyGraceToken(graceToken, config.licensePublicKeyPem || '');
        const graceDeny = await gracePayloadDenial(gracePayload, verifiedLicensePayload);
        if (graceDeny) throw new Error(graceDeny);
        config.licenseOfflineGraceUntil = String(gracePayload.graceUntil || body.offlineGraceUntil || '');
        config.licenseGraceServerTime = String(gracePayload.serverTime || serverTime || '');
        secrets.licenseGraceToken = graceToken;
      } catch (error) {
        config.licenseOfflineGraceUntil = '';
        config.licenseGraceServerTime = '';
        delete secrets.licenseGraceToken;
        config.licenseLastReason = `${config.licenseLastReason || 'valid'}:offline_grace_not_cached:${safeError(error)}`;
      }
    } else {
      config.licenseOfflineGraceUntil = '';
      config.licenseGraceServerTime = '';
      delete secrets.licenseGraceToken;
    }
    await chrome.storage.local.set({ [StorageKeys.SECRETS]: secrets });
    await saveConfig();
    return { allowed: true, reason: config.licenseLastReason || 'valid' };
  } catch (error) {
    if (licenseVerificationError) return denyLicense(`license_signature_invalid:${licenseVerificationError}`);
    if (config.licenseAllowOfflineGrace !== false) {
      return await cachedLicenseDecision(`server_unreachable:${safeError(error)}`, secrets.licenseGraceToken, verifiedLicensePayload) ?? denyLicense('server_unreachable');
    }
    return denyLicense(`server_unreachable:${safeError(error)}`);
  }
}

async function cachedLicenseDecision(prefix: string, graceToken?: string, verifiedLicensePayload?: Record<string, unknown> | null): Promise<{ allowed: boolean; reason: string } | null> {
  const publicKeyPem = (config.licensePublicKeyPem || '').trim();
  if (!graceToken) return null;
  if (!publicKeyPem) return denyLicense('license_public_key_missing');

  let gracePayload: Record<string, unknown>;
  try {
    gracePayload = await verifyGraceToken(graceToken, publicKeyPem);
  } catch (error) {
    return denyLicense(`grace_signature_invalid:${safeError(error)}`);
  }

  const graceDeny = await gracePayloadDenial(gracePayload, verifiedLicensePayload ?? null);
  if (graceDeny) return denyLicense(graceDeny);
  const graceUntil = Date.parse(String(gracePayload.graceUntil || config.licenseOfflineGraceUntil || ''));
  const now = Date.now();
  if (now >= graceUntil) return denyLicense('offline_grace_expired');
  return { allowed: true, reason: `${prefix}:using_signed_grace` };
}

function localLicenseDenial(payload: Record<string, unknown>, accountId: string): string | null {
  if (payload.schema !== 'v2rayez.license.v1') return 'unexpected_license_schema';
  if (String(payload.status || 'ACTIVE') !== 'ACTIVE') return 'license_not_active';
  if (accountId && String(payload.accountId || '') !== accountId) return 'account_mismatch';
  const notBefore = Date.parse(String(payload.notBefore || ''));
  if (Number.isFinite(notBefore) && Date.now() < notBefore) return 'license_not_yet_valid';
  const expiresAt = Date.parse(String(payload.expiresAt || ''));
  if (!Number.isFinite(expiresAt)) return 'invalid_expiry';
  if (Date.now() >= expiresAt) return 'license_expired';
  return null;
}

async function gracePayloadDenial(gracePayload: Record<string, unknown>, licensePayload: Record<string, unknown> | null): Promise<string | null> {
  if (String(gracePayload.status || 'ACTIVE') !== 'ACTIVE') return 'offline_grace_inactive';
  if (String(gracePayload.accountId || '') !== (config.licenseAccountId || '').trim()) return 'offline_grace_account_mismatch';
  if (String(gracePayload.platform || '') !== 'browser-extension') return 'offline_grace_platform_mismatch';
  if (licensePayload) {
    if (
      String(gracePayload.licenseId || '') !== String(licensePayload.licenseId || '') ||
      String(gracePayload.userId || '') !== String(licensePayload.userId || '') ||
      String(gracePayload.accountId || '') !== String(licensePayload.accountId || '')
    ) {
      return 'offline_grace_license_mismatch';
    }
  }
  const expectedDeviceHash = await hashDeviceId(`browser-extension:${chrome.runtime.id}`);
  if (String(gracePayload.deviceIdHash || '') !== expectedDeviceHash) return 'offline_grace_device_mismatch';
  const expiresAt = Date.parse(String(gracePayload.expiresAt || config.licenseExpiresAt || ''));
  const graceUntil = Date.parse(String(gracePayload.graceUntil || config.licenseOfflineGraceUntil || ''));
  const lastServerTime = Date.parse(config.licenseLastServerTime || '');
  const graceServerTime = Date.parse(String(gracePayload.serverTime || config.licenseGraceServerTime || ''));
  if (!Number.isFinite(expiresAt) || !Number.isFinite(graceUntil)) return 'offline_grace_invalid_expiry';
  if (Number.isFinite(lastServerTime) && Number.isFinite(graceServerTime) && graceServerTime + 5 * 60 * 1000 < lastServerTime) {
    return 'server_time_rollback_detected';
  }
  if (Date.now() >= expiresAt) return 'license_expired';
  return null;
}

async function hashDeviceId(deviceId: string): Promise<string> {
  const salt = (config.licenseDeviceHashSalt || 'v2rayez-client-device-binding-v1').trim() || 'v2rayez-client-device-binding-v1';
  const input = new TextEncoder().encode(`v2rayez-device\0${salt}\0${deviceId.trim()}`);
  const digest = await crypto.subtle.digest('SHA-256', asArrayBuffer(input));
  return base64UrlEncode(new Uint8Array(digest));
}

function denyLicense(reason: string): { allowed: boolean; reason: string } {
  config.licenseLastResult = 'DENIED';
  config.licenseLastReason = reason;
  return { allowed: false, reason };
}

function isHardCachedDenial(decision: { allowed: boolean; reason: string }): boolean {
  const reason = decision.reason.split(':')[0];
  return ['license_expired', 'server_time_rollback_detected'].includes(reason);
}

function licenseEndpoint(raw: string): string {
  const base = raw.trim().replace(/\/+$/, '');
  return base.endsWith('/api/licenses/validate') ? base : `${base}/api/licenses/validate`;
}

function safeError(error: unknown): string {
  return error instanceof Error && error.message ? error.message : String(error);
}

async function verifyLicenseToken(token: string, publicKeyPem: string): Promise<Record<string, unknown>> {
  const payload = await verifySignedToken(token, publicKeyPem, 'V2RayEZ-License');
  if (payload.schema !== 'v2rayez.license.v1') throw new Error('unexpected_license_schema');
  return payload;
}

async function verifyGraceToken(token: string, publicKeyPem: string): Promise<Record<string, unknown>> {
  const payload = await verifySignedToken(token, publicKeyPem, 'V2RayEZ-License-Grace');
  if (payload.schema !== 'v2rayez.license.grace.v1') throw new Error('unexpected_grace_schema');
  return payload;
}

async function verifySignedToken(token: string, publicKeyPem: string, expectedType: string): Promise<Record<string, unknown>> {
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((part) => !part)) throw new Error('invalid_signed_token_format');
  const header = JSON.parse(textDecode(base64UrlDecode(parts[0])));
  const payload = JSON.parse(textDecode(base64UrlDecode(parts[1])));
  if (header.alg !== 'EdDSA') throw new Error('unsupported_license_algorithm');
  if (header.typ !== expectedType) throw new Error('unexpected_signed_token_type');
  const keyData = publicKeyBytes(publicKeyPem);
  const key = await crypto.subtle.importKey('raw', asArrayBuffer(keyData), { name: 'Ed25519' } as any, false, ['verify']);
  const ok = await crypto.subtle.verify(
    { name: 'Ed25519' } as any,
    key,
    asArrayBuffer(base64UrlDecode(parts[2])),
    asArrayBuffer(new TextEncoder().encode(`${parts[0]}.${parts[1]}`)),
  );
  if (!ok) throw new Error('bad_signed_token_signature');
  return payload;
}

function publicKeyBytes(publicKeyPem: string): Uint8Array {
  const body = publicKeyPem
    .replace(/\\n/g, '\n')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('-----'))
    .join('');
  const bytes = base64Decode(body);
  if (bytes.length === 32) return bytes;
  if (bytes.length > 32) return bytes.slice(bytes.length - 32);
  throw new Error('invalid_public_key');
}

function base64UrlDecode(value: string): Uint8Array {
  let base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) base64 += '=';
  return base64Decode(base64);
}

function base64Decode(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function base64UrlEncode(value: Uint8Array): string {
  const binary = Array.from(value, (byte) => String.fromCharCode(byte)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function textDecode(value: Uint8Array): string {
  return new TextDecoder().decode(value);
}

function asArrayBuffer(value: Uint8Array): ArrayBuffer {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}

/* ────────────────────── proxy control ────────────────────── */

async function startProxy(): Promise<void> {
  try {
    const license = await enforceLicense();
    if (!license.allowed) {
      state.connected = false;
      config.licenseLastResult = 'DENIED';
      config.licenseLastReason = license.reason;
      await saveConfig();
      console.warn('[V2RayEZ] License gate denied proxy start:', license.reason);
      return;
    }

    // Try native SOCKS5 first
    if (config.socksEnabled) {
      await proxyManager.setProxy(config.socksHost, config.socksPort);
      state.connected = true;
      state.mode = 'socks5';
      console.log('[V2RayEZ] SOCKS5 proxy active');
    }

    // Fallback to WebRTC relay if native not available
    if (!state.connected && config.webrtcFallback) {
      const peer = await webRelay.connect(config.relaySignalingUrl);
      if (peer) {
        state.connected = true;
        state.mode = 'webrtc';
        state.webrtcActive = true;
        await proxyManager.setWebRTCProxy(peer);
        console.log('[V2RayEZ] WebRTC relay active');
      }
    }

    await saveConfig();
  } catch (err) {
    console.error('[V2RayEZ] Proxy start failed:', err);
    state.connected = false;
    await saveConfig();
  }
}

async function stopProxy(): Promise<void> {
  await proxyManager.clearProxy();
  if (state.webrtcActive) {
    webRelay.disconnect();
    state.webrtcActive = false;
  }
  state.connected = false;
  state.mode = 'direct';
  await saveConfig();
  console.log('[V2RayEZ] Proxy stopped');
}

/* ────────────────────── request monitoring ────────────────────── */

function onRequestBefore(
  details: chrome.webRequest.WebRequestBodyDetails
): chrome.webRequest.BlockingResponse | void {
  if (!state.connected) return;

  // Detect DNS poisoning
  if (details.url && config.dohEnabled) {
    const url = new URL(details.url);
    // Intercept DNS requests to use DoH
    if (url.hostname && config.dohBlocklist.includes(url.hostname)) {
      state.blockedCount++;
      state.lastBlockTime = Date.now();
      return { cancel: true };
    }
  }
}

function onRequestError(
  details: chrome.webRequest.WebResponseErrorDetails
): void {
  if (!state.connected) return;

  const err = details.error;
  // Detect DPI-induced errors
  if (
    err === 'net::ERR_CONNECTION_RESET' ||
    err === 'net::ERR_CONNECTION_REFUSED' ||
    err === 'net::ERR_SSL_PROTOCOL_ERROR'
  ) {
    state.blockedCount++;
    state.lastBlockTime = Date.now();
    console.warn('[V2RayEZ] Possible DPI block:', details.url, err);

    // Auto-switch relay if too many blocks
    if (state.blockedCount > 5 && config.webrtcFallback && !state.webrtcActive) {
      console.log('[V2RayEZ] High block count, switching to WebRTC relay');
      startProxy();
    }
  }
}

function registerRequestMonitors(): void {
  const filter = { urls: ['<all_urls>'] };

  try {
    if (chrome.webRequest.onBeforeRequest.hasListener(onRequestBefore)) {
      chrome.webRequest.onBeforeRequest.removeListener(onRequestBefore);
    }
    chrome.webRequest.onBeforeRequest.addListener(onRequestBefore, filter, ['blocking']);
  } catch (err) {
    console.warn('[V2RayEZ] Blocking webRequest unavailable, falling back to observe-only request monitoring:', err);
    try {
      chrome.webRequest.onBeforeRequest.addListener(onRequestBefore, filter);
    } catch (fallbackErr) {
      console.warn('[V2RayEZ] Request monitor registration failed:', fallbackErr);
    }
  }

  try {
    if (chrome.webRequest.onErrorOccurred.hasListener(onRequestError)) {
      chrome.webRequest.onErrorOccurred.removeListener(onRequestError);
    }
    chrome.webRequest.onErrorOccurred.addListener(onRequestError, filter);
  } catch (err) {
    console.warn('[V2RayEZ] Request error monitor registration failed:', err);
  }
}

/* ────────────────────── alarms ────────────────────── */

async function handleAlarm(alarm: chrome.alarms.Alarm): Promise<void> {
  switch (alarm.name) {
    case 'isp-check': {
      const isp = await ispDetector.detect();
      if (isp?.name !== state.ispDetected?.name) {
        console.log('[V2RayEZ] ISP changed:', isp?.name);
        state.ispDetected = isp;
        // Re-generate PAC with new ISP info
        pacGenerator.updateISP(isp);
        if (state.connected) {
          await proxyManager.setProxy(config.socksHost, config.socksPort);
        }
        await saveConfig();
      }
      break;
    }
    case 'config-sync': {
      await loadConfig();
      break;
    }
  }
}

/* ────────────────────── messaging ────────────────────── */

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    switch (message.type) {
      case 'GET_STATE':
        sendResponse(state);
        break;

      case 'GET_CONFIG':
        sendResponse(config);
        break;

      case 'UPDATE_CONFIG':
        config = { ...config, ...message.payload };
        await saveConfig();
        // Re-init with new config
        pacGenerator.updateConfig(config);
        proxyManager.updateConfig(config);
        dohResolver.updateConfig(config);
        syncNativeIntegration();
        if (state.connected) {
          await startProxy();
        }
        sendResponse({ ok: true });
        break;

      case 'START_PROXY':
        await startProxy();
        sendResponse(state);
        break;

      case 'STOP_PROXY':
        await stopProxy();
        sendResponse(state);
        break;

      case 'TOGGLE_PROXY':
        if (state.connected) {
          await stopProxy();
        } else {
          await startProxy();
        }
        sendResponse(state);
        break;

      case 'DETECT_ISP':
        const isp = await ispDetector.detect();
        state.ispDetected = isp;
        await saveConfig();
        sendResponse(isp);
        break;

      case 'DNS_RESOLVE':
        if (!dohResolver) {
          sendResponse({ error: 'DoH not initialized' });
          return;
        }
        const result = await dohResolver.resolve(message.hostname, message.rrType);
        sendResponse(result);
        break;

      case 'GET_RELAY_PEERS':
        sendResponse(webRelay?.getPeers() ?? []);
        break;

      default:
        sendResponse({ error: 'Unknown message type' });
    }
  })();
  return true; // keep channel open for async
});

/* ────────────────────── native messaging ────────────────────── */

let nativePort: chrome.runtime.Port | null = null;
let nativeHostInUse: string | null = null;
let nativeHandshakeSeen = false;

function nativeHostCandidates(): string[] {
  const primary = (config.nativeMessagingHost || 'com.v2rayez.native').trim() || 'com.v2rayez.native';
  const fallbacks = config.nativeMessagingHostFallbacks ?? ['com.unifiedshield.native'];
  return Array.from(new Set([primary, ...fallbacks.map((host) => host.trim()).filter(Boolean)]));
}

function syncNativeIntegration(): void {
  if (!config.nativeAppEnabled) {
    if (nativePort) {
      nativePort.disconnect();
      nativePort = null;
    }
    nativeHostInUse = null;
    nativeHandshakeSeen = false;
    return;
  }

  if (!nativePort) {
    connectNative(nativeHostCandidates());
  }
}

function connectNative(hosts = nativeHostCandidates()): void {
  const [host, ...remainingHosts] = hosts;
  if (!host) {
    console.warn('[V2RayEZ] Native app not available on configured or legacy host IDs');
    return;
  }

  try {
    const port = chrome.runtime.connectNative(host);
    nativePort = port;
    nativeHostInUse = host;
    nativeHandshakeSeen = false;
    port.onMessage.addListener((msg) => {
      nativeHandshakeSeen = true;
      console.log('[V2RayEZ] Native message:', msg);
      if (msg.type === 'SOCKS_READY') {
        state.connected = true;
        state.mode = 'socks5';
        saveConfig();
      }
    });
    port.onDisconnect.addListener(() => {
      const lastError = chrome.runtime.lastError?.message;
      const shouldTryFallback = !nativeHandshakeSeen && remainingHosts.length > 0;
      console.warn('[V2RayEZ] Native app disconnected', nativeHostInUse, lastError ?? '');
      nativePort = null;
      nativeHostInUse = null;
      nativeHandshakeSeen = false;
      if (shouldTryFallback && config.nativeAppEnabled) {
        connectNative(remainingHosts);
        return;
      }
      if (state.mode === 'socks5') {
        state.connected = false;
        // Attempt WebRTC fallback
        if (config.webrtcFallback) {
          startProxy();
        }
      }
    });
  } catch (err) {
    nativePort = null;
    nativeHostInUse = null;
    nativeHandshakeSeen = false;
    if (remainingHosts.length > 0) {
      console.warn('[V2RayEZ] Native host unavailable, trying compatibility fallback:', host, err);
      connectNative(remainingHosts);
      return;
    }
    console.warn('[V2RayEZ] Native app not available:', err);
  }
}

console.log('[V2RayEZ] Service worker loaded');
