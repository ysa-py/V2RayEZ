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

  // Setup periodic ISP re-check
  chrome.alarms.create('isp-check', { periodInMinutes: 30 });
  chrome.alarms.create('config-sync', { periodInMinutes: 5 });
  chrome.alarms.onAlarm.addListener(handleAlarm);

  // Listen for web requests to detect blocking
  chrome.webRequest.onBeforeRequest.addListener(
    onRequestBefore,
    { urls: ['<all_urls>'] },
    ['blocking']
  );

  chrome.webRequest.onErrorOccurred.addListener(
    onRequestError,
    { urls: ['<all_urls>'] }
  );
}

/* ────────────────────── license gate ────────────────────── */

async function enforceLicense(): Promise<{ allowed: boolean; reason: string }> {
  if (!config.licenseInstalled) return { allowed: true, reason: 'license_not_configured' };
  const stored = await chrome.storage.local.get(StorageKeys.SECRETS);
  const secrets = { ...(stored[StorageKeys.SECRETS] ?? {}) } as Record<string, string>;
  const serial = String(secrets.licenseSerial ?? '').trim();
  if (!serial) return denyLicense('license_secret_missing');

  const cached = await cachedLicenseDecision('preflight', secrets.licenseGraceToken);
  if (cached && !cached.allowed) return cached;

  const accountId = (config.licenseAccountId ?? '').trim();
  const validationUrl = (config.licenseValidationUrl ?? '').trim();
  if (!accountId || !validationUrl) return await cachedLicenseDecision('license_account_or_server_missing', secrets.licenseGraceToken) ?? denyLicense('online_validation_required');

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
      const gracePayload = await verifyGraceToken(graceToken, config.licensePublicKeyPem || '');
      config.licenseOfflineGraceUntil = String(gracePayload.graceUntil || body.offlineGraceUntil || '');
      config.licenseGraceServerTime = String(gracePayload.serverTime || serverTime || '');
      secrets.licenseGraceToken = graceToken;
      await chrome.storage.local.set({ [StorageKeys.SECRETS]: secrets });
    } else {
      config.licenseOfflineGraceUntil = '';
      config.licenseGraceServerTime = '';
      delete secrets.licenseGraceToken;
      await chrome.storage.local.set({ [StorageKeys.SECRETS]: secrets });
    }
    await saveConfig();
    return await cachedLicenseDecision('server_valid', secrets.licenseGraceToken) ?? { allowed: true, reason: config.licenseLastReason || 'valid' };
  } catch (error) {
    if (config.licenseAllowOfflineGrace !== false) {
      return await cachedLicenseDecision(`server_unreachable:${safeError(error)}`, secrets.licenseGraceToken) ?? denyLicense('server_unreachable');
    }
    return denyLicense(`server_unreachable:${safeError(error)}`);
  }
}

async function cachedLicenseDecision(prefix: string, graceToken?: string): Promise<{ allowed: boolean; reason: string } | null> {
  const publicKeyPem = (config.licensePublicKeyPem || '').trim();
  if (!graceToken) return null;
  if (!publicKeyPem) return denyLicense('license_public_key_missing');

  let gracePayload: Record<string, unknown>;
  try {
    gracePayload = await verifyGraceToken(graceToken, publicKeyPem);
  } catch (error) {
    return denyLicense(`grace_signature_invalid:${safeError(error)}`);
  }

  const expiresAt = Date.parse(String(gracePayload.expiresAt || config.licenseExpiresAt || ''));
  const graceUntil = Date.parse(String(gracePayload.graceUntil || config.licenseOfflineGraceUntil || ''));
  const lastServerTime = Date.parse(config.licenseLastServerTime || '');
  const graceServerTime = Date.parse(String(gracePayload.serverTime || config.licenseGraceServerTime || ''));
  if (!Number.isFinite(expiresAt) || !Number.isFinite(graceUntil)) return denyLicense('offline_grace_invalid_expiry');
  if (Number.isFinite(lastServerTime) && Number.isFinite(graceServerTime) && graceServerTime + 5 * 60 * 1000 < lastServerTime) {
    return denyLicense('server_time_rollback_detected');
  }
  if (String(gracePayload.accountId || '') !== (config.licenseAccountId || '').trim()) return denyLicense('offline_grace_account_mismatch');
  if (String(gracePayload.platform || '') !== 'browser-extension') return denyLicense('offline_grace_platform_mismatch');
  if (String(gracePayload.status || 'ACTIVE') !== 'ACTIVE') return denyLicense('offline_grace_inactive');
  const now = Date.now();
  if (now >= expiresAt) return denyLicense('license_expired');
  if (now >= graceUntil) return denyLicense('offline_grace_expired');
  return { allowed: true, reason: `${prefix}:using_signed_grace` };
}

function denyLicense(reason: string): { allowed: boolean; reason: string } {
  config.licenseLastResult = 'DENIED';
  config.licenseLastReason = reason;
  return { allowed: false, reason };
}

function licenseEndpoint(raw: string): string {
  const base = raw.trim().replace(/\/+$/, '');
  return base.endsWith('/api/licenses/validate') ? base : `${base}/api/licenses/validate`;
}

function safeError(error: unknown): string {
  return error instanceof Error && error.message ? error.message : String(error);
}

async function verifyGraceToken(token: string, publicKeyPem: string): Promise<Record<string, unknown>> {
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((part) => !part)) throw new Error('invalid_grace_token_format');
  const header = JSON.parse(textDecode(base64UrlDecode(parts[0])));
  const payload = JSON.parse(textDecode(base64UrlDecode(parts[1])));
  if (header.alg !== 'EdDSA') throw new Error('unsupported_grace_algorithm');
  if (header.typ !== 'V2RayEZ-License-Grace') throw new Error('unexpected_grace_token_type');
  const keyData = publicKeyBytes(publicKeyPem);
  const key = await crypto.subtle.importKey('raw', asArrayBuffer(keyData), { name: 'Ed25519' } as any, false, ['verify']);
  const ok = await crypto.subtle.verify(
    { name: 'Ed25519' } as any,
    key,
    asArrayBuffer(base64UrlDecode(parts[2])),
    asArrayBuffer(new TextEncoder().encode(`${parts[0]}.${parts[1]}`)),
  );
  if (!ok) throw new Error('bad_grace_signature');
  if (payload.schema !== 'v2rayez.license.grace.v1') throw new Error('unexpected_grace_schema');
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

function connectNative(): void {
  try {
    nativePort = chrome.runtime.connectNative('com.unifiedshield.native');
    nativePort.onMessage.addListener((msg) => {
      console.log('[V2RayEZ] Native message:', msg);
      if (msg.type === 'SOCKS_READY') {
        state.connected = true;
        state.mode = 'socks5';
        saveConfig();
      }
    });
    nativePort.onDisconnect.addListener(() => {
      console.warn('[V2RayEZ] Native app disconnected');
      nativePort = null;
      if (state.mode === 'socks5') {
        state.connected = false;
        // Attempt WebRTC fallback
        if (config.webrtcFallback) {
          startProxy();
        }
      }
    });
  } catch {
    console.warn('[V2RayEZ] Native app not available');
  }
}

// Auto-detect native app on startup
if (config.nativeAppEnabled) {
  connectNative();
}

console.log('[V2RayEZ] Service worker loaded');
