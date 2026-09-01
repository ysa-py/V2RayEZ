// @ts-nocheck
// @ts-nocheck
/**
 * V2RayEZ Universal — Firefox Background Script (MV2)
 * Uses browser.* APIs with fallback to chrome.*
 */

import { ProxyManager } from './proxy-manager';
import { PacGenerator } from './pac-generator';
import { DohResolver } from './doh-resolver';
import { ISPDetector } from './isp-detector';
import {
  DEFAULT_CONFIG,
  StorageKeys,
  type UnifiedShieldConfig,
  type ProxyState,
} from '../../shared/protocol';

// Use browser API (Firefox) with chrome fallback
const api = typeof browser !== 'undefined' ? browser : chrome;

/* ────────────────────── state ────────────────────── */

let config: UnifiedShieldConfig = { ...DEFAULT_CONFIG };
let proxyManager: ProxyManager;
let pacGenerator: PacGenerator;
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

api.runtime.onInstalled.addListener(async (details) => {
  console.log('[V2RayEZ-FF] Installed:', details.reason);
  await loadConfig();
  await initModules();
});

api.runtime.onStartup.addListener(async () => {
  await loadConfig();
  await initModules();
});

/* ────────────────────── config ────────────────────── */

async function loadConfig(): Promise<void> {
  const stored = await api.storage.local.get(StorageKeys.CONFIG);
  if (stored[StorageKeys.CONFIG]) {
    config = { ...DEFAULT_CONFIG, ...stored[StorageKeys.CONFIG] };
  }
  const stateStored = await api.storage.local.get(StorageKeys.STATE);
  if (stateStored[StorageKeys.STATE]) {
    Object.assign(state, stateStored[StorageKeys.STATE]);
  }
}

async function saveConfig(): Promise<void> {
  await api.storage.local.set({ [StorageKeys.CONFIG]: config });
  await api.storage.local.set({ [StorageKeys.STATE]: state });
}

/* ────────────────────── init ────────────────────── */

async function initModules(): Promise<void> {
  ispDetector = new ISPDetector(config);
  pacGenerator = new PacGenerator(config);
  proxyManager = new ProxyManager(config, pacGenerator);
  dohResolver = new DohResolver(config);

  // Detect ISP
  const isp = await ispDetector.detect();
  state.ispDetected = isp;

  // Auto-start
  if (config.autoStart) {
    await startProxy();
  }

  // Periodic checks
  api.alarms.create('isp-check', { periodInMinutes: 30 });
  api.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'isp-check') {
      const newIsp = await ispDetector.detect();
      if (newIsp?.name !== state.ispDetected?.name) {
        state.ispDetected = newIsp;
        pacGenerator.updateISP(newIsp);
        if (state.connected) {
          await proxyManager.setProxy(config.socksHost, config.socksPort);
        }
        await saveConfig();
      }
    }
  });

  // Request monitoring — Firefox MV2 supports blocking
  api.webRequest.onBeforeRequest.addListener(
    (details: any) => {
      if (!state.connected) return;
      // Block known DNS-poisoned requests
      if (config.dohEnabled && details.url) {
        try {
          const url = new URL(details.url);
          if (config.dohBlocklist.includes(url.hostname)) {
            state.blockedCount++;
            state.lastBlockTime = Date.now();
            return { cancel: true };
          }
        } catch { /* ignore */ }
      }
    },
    { urls: ['<all_urls>'] },
    ['blocking']
  );

  api.webRequest.onErrorOccurred.addListener(
    (details: any) => {
      const err = details.error;
      if (
        err === 'NS_ERROR_CONNECTION_REFUSED' ||
        err === 'NS_ERROR_NET_RESET' ||
        err === 'NS_ERROR_SSL_PROTOCOL_ERROR'
      ) {
        state.blockedCount++;
        state.lastBlockTime = Date.now();
      }
    },
    { urls: ['<all_urls>'] }
  );
}

/* ────────────────────── license gate ────────────────────── */

async function enforceLicense(): Promise<{ allowed: boolean; reason: string }> {
  if (!config.licenseInstalled) return { allowed: true, reason: 'license_not_configured' };
  const stored = await api.storage.local.get(StorageKeys.SECRETS);
  const serial = String(stored[StorageKeys.SECRETS]?.licenseSerial ?? '').trim();
  if (!serial) return denyLicense('license_secret_missing');

  const cached = cachedLicenseDecision('preflight');
  if (cached && !cached.allowed) return cached;

  const accountId = (config.licenseAccountId ?? '').trim();
  const validationUrl = (config.licenseValidationUrl ?? '').trim();
  if (!accountId || !validationUrl) return cachedLicenseDecision('license_account_or_server_missing') ?? denyLicense('online_validation_required');

  try {
    const response = await fetch(licenseEndpoint(validationUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        licenseKey: serial,
        deviceId: `browser-extension:${api.runtime.id}`,
        accountId,
        platform: 'browser-extension',
        appVersion: api.runtime.getManifest().version,
        deviceLabel: `${api.runtime.getManifest().name} ${api.runtime.id}`,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.success !== true) return denyLicense(String(body.reason || 'license_denied'));
    config.licenseLastResult = 'ALLOWED';
    config.licenseLastReason = String(body.reason || 'valid');
    config.licenseExpiresAt = String(body.expiresAt || '');
    config.licenseOfflineGraceUntil = String(body.offlineGraceUntil || '');
    await saveConfig();
    return cachedLicenseDecision('server_valid') ?? { allowed: true, reason: config.licenseLastReason || 'valid' };
  } catch (error) {
    if (config.licenseAllowOfflineGrace !== false) {
      return cachedLicenseDecision(`server_unreachable:${safeError(error)}`) ?? denyLicense('server_unreachable');
    }
    return denyLicense(`server_unreachable:${safeError(error)}`);
  }
}

function cachedLicenseDecision(prefix: string): { allowed: boolean; reason: string } | null {
  const expiresAt = Date.parse(config.licenseExpiresAt || '');
  const graceUntil = Date.parse(config.licenseOfflineGraceUntil || '');
  if (!Number.isFinite(expiresAt) || !Number.isFinite(graceUntil)) return null;
  const now = Date.now();
  if (now >= expiresAt) return denyLicense('license_expired');
  if (now >= graceUntil) return denyLicense('offline_grace_expired');
  return { allowed: true, reason: `${prefix}:using_cached_grace` };
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

/* ────────────────────── proxy control ────────────────────── */

async function startProxy(): Promise<void> {
  try {
    const license = await enforceLicense();
    if (!license.allowed) {
      state.connected = false;
      config.licenseLastResult = 'DENIED';
      config.licenseLastReason = license.reason;
      await saveConfig();
      console.warn('[V2RayEZ-FF] License gate denied proxy start:', license.reason);
      return;
    }

    await proxyManager.setProxy(config.socksHost, config.socksPort);
    state.connected = true;
    state.mode = 'socks5';
    await saveConfig();
  } catch (err) {
    console.error('[V2RayEZ-FF] Proxy start failed:', err);
    state.connected = false;
    await saveConfig();
  }
}

async function stopProxy(): Promise<void> {
  await proxyManager.clearProxy();
  state.connected = false;
  state.mode = 'direct';
  await saveConfig();
}

/* ────────────────────── messaging ────────────────────── */

api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
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
        const result = await dohResolver.resolve(message.hostname, message.rrType);
        sendResponse(result);
        break;

      default:
        sendResponse({ error: 'Unknown message type' });
    }
  })();
  return true;
});

/* ────────────────────── native messaging ────────────────────── */

let nativePort: any = null;

function connectNative(): void {
  try {
    nativePort = api.runtime.connectNative('com.unifiedshield.native');
    nativePort.onMessage.addListener((msg: any) => {
      if (msg.type === 'SOCKS_READY') {
        state.connected = true;
        state.mode = 'socks5';
        saveConfig();
      }
    });
    nativePort.onDisconnect.addListener(() => {
      nativePort = null;
      if (state.mode === 'socks5') {
        state.connected = false;
        saveConfig();
      }
    });
  } catch {
    console.warn('[V2RayEZ-FF] Native app not available');
  }
}

if (config.nativeAppEnabled) {
  connectNative();
}

console.log('[V2RayEZ-FF] Background script loaded');
