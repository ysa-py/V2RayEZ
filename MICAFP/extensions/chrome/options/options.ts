/**
 * V2RayEZ Options — Settings page logic
 */

import type { UnifiedShieldConfig } from '../../shared/protocol';
import { DEFAULT_CONFIG, StorageKeys } from '../../shared/protocol';

/* ────────── DOM Elements ────────── */

const els = {
  socksHost: document.getElementById('socksHost') as HTMLInputElement,
  socksPort: document.getElementById('socksPort') as HTMLInputElement,
  socksUsername: document.getElementById('socksUsername') as HTMLInputElement,
  socksPassword: document.getElementById('socksPassword') as HTMLInputElement,
  socksEnabled: document.getElementById('socksEnabled') as HTMLInputElement,
  webrtcFallback: document.getElementById('webrtcFallback') as HTMLInputElement,
  relaySignalingUrl: document.getElementById('relaySignalingUrl') as HTMLInputElement,
  webrtcLocalPort: document.getElementById('webrtcLocalPort') as HTMLInputElement,
  dohEnabled: document.getElementById('dohEnabled') as HTMLInputElement,
  turnServers: document.getElementById('turnServers') as HTMLTextAreaElement,
  turnUsername: document.getElementById('turnUsername') as HTMLInputElement,
  turnPassword: document.getElementById('turnPassword') as HTMLInputElement,
  dpibypassEnabled: document.getElementById('dpibypassEnabled') as HTMLInputElement,
  webrtcRelayEnabled: document.getElementById('webrtcRelayEnabled') as HTMLInputElement,
  autoStart: document.getElementById('autoStart') as HTMLInputElement,
  nativeAppEnabled: document.getElementById('nativeAppEnabled') as HTMLInputElement,
  preferredMode: document.getElementById('preferredMode') as HTMLSelectElement,
  dohBlocklist: document.getElementById('dohBlocklist') as HTMLTextAreaElement,
  licenseSerial: document.getElementById('licenseSerial') as HTMLTextAreaElement,
  licenseAccountId: document.getElementById('licenseAccountId') as HTMLInputElement,
  licenseValidationUrl: document.getElementById('licenseValidationUrl') as HTMLInputElement,
  licenseAllowOfflineGrace: document.getElementById('licenseAllowOfflineGrace') as HTMLInputElement,
  aiEngineEnabled: document.getElementById('aiEngineEnabled') as HTMLInputElement,
  aiAutoFallbackToLocal: document.getElementById('aiAutoFallbackToLocal') as HTMLInputElement,
  aiProviderAlias: document.getElementById('aiProviderAlias') as HTMLInputElement,
  aiProviderBaseUrl: document.getElementById('aiProviderBaseUrl') as HTMLInputElement,
  aiProviderEndpoint: document.getElementById('aiProviderEndpoint') as HTMLInputElement,
  aiProviderModel: document.getElementById('aiProviderModel') as HTMLInputElement,
  aiApiKey: document.getElementById('aiApiKey') as HTMLInputElement,
  saveBtn: document.getElementById('saveBtn') as HTMLButtonElement,
  resetBtn: document.getElementById('resetBtn') as HTMLButtonElement,
  statusBar: document.getElementById('statusBar') as HTMLDivElement,
  statusMessage: document.getElementById('statusMessage') as HTMLSpanElement,
};

const SECRET_PLACEHOLDER = '••••••••';

const dohCheckboxes = document.querySelectorAll<HTMLInputElement>(
  'input[data-doh]'
);

/* ────────── Init ────────── */

async function init(): Promise<void> {
  const stored = await chrome.storage.local.get([StorageKeys.CONFIG, StorageKeys.LEGACY_CONFIG]);
  const savedConfig = stored[StorageKeys.CONFIG] ?? stored[StorageKeys.LEGACY_CONFIG];
  const config: UnifiedShieldConfig = savedConfig
    ? { ...DEFAULT_CONFIG, ...savedConfig }
    : { ...DEFAULT_CONFIG };

  populateForm(config);

  els.saveBtn.addEventListener('click', handleSave);
  els.resetBtn.addEventListener('click', handleReset);
}

/* ────────── Form Population ────────── */

function populateForm(config: UnifiedShieldConfig): void {
  els.socksHost.value = config.socksHost;
  els.socksPort.value = config.socksPort.toString();
  els.socksUsername.value = config.socksUsername ?? '';
  els.socksPassword.value = config.socksPassword ?? '';
  els.socksEnabled.checked = config.socksEnabled;
  els.webrtcFallback.checked = config.webrtcFallback;
  els.relaySignalingUrl.value = config.relaySignalingUrl ?? '';
  els.webrtcLocalPort.value = (config.webrtcLocalPort ?? 1081).toString();
  els.dohEnabled.checked = config.dohEnabled;
  els.turnServers.value = (config.turnServers ?? []).join('\n');
  els.turnUsername.value = config.turnUsername ?? '';
  els.turnPassword.value = config.turnPassword ?? '';
  els.dpibypassEnabled.checked = config.dpiBypassEnabled ?? false;
  els.webrtcRelayEnabled.checked = config.webrtcRelayEnabled ?? false;
  els.autoStart.checked = config.autoStart;
  els.nativeAppEnabled.checked = config.nativeAppEnabled;
  els.preferredMode.value = config.preferredMode ?? 'auto';
  els.dohBlocklist.value = (config.dohBlocklist ?? []).join('\n');
  els.licenseSerial.value = config.licenseInstalled ? SECRET_PLACEHOLDER : '';
  els.licenseAccountId.value = config.licenseAccountId ?? '';
  els.licenseValidationUrl.value = config.licenseValidationUrl ?? '';
  els.licenseAllowOfflineGrace.checked = config.licenseAllowOfflineGrace !== false;
  els.aiEngineEnabled.checked = config.aiEngineEnabled !== false;
  els.aiAutoFallbackToLocal.checked = config.aiAutoFallbackToLocal !== false;
  els.aiProviderAlias.value = config.aiProviderAlias ?? 'local-v2rayez';
  els.aiProviderBaseUrl.value = config.aiProviderBaseUrl ?? 'local://v2rayez';
  els.aiProviderEndpoint.value = config.aiProviderEndpoint ?? '';
  els.aiProviderModel.value = config.aiProviderModel ?? 'v2rayez-anti-dpi-local';
  els.aiApiKey.value = config.aiApiKeyInstalled ? SECRET_PLACEHOLDER : '';

  // DoH server checkboxes
  const dohServers = config.dohServers ?? ['alidns', 'dnspod', 'byteplus'];
  dohCheckboxes.forEach((cb) => {
    cb.checked = dohServers.includes(cb.dataset.doh!);
  });
}

/* ────────── Form Extraction ────────── */

function extractConfig(): Partial<UnifiedShieldConfig> {
  const dohServers = Array.from(dohCheckboxes)
    .filter((cb) => cb.checked)
    .map((cb) => cb.dataset.doh!);

  const turnServers = els.turnServers.value
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  const dohBlocklist = els.dohBlocklist.value
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    socksHost: els.socksHost.value || '127.0.0.1',
    socksPort: parseInt(els.socksPort.value, 10) || 1080,
    socksUsername: els.socksUsername.value || undefined,
    socksPassword: els.socksPassword.value || undefined,
    socksEnabled: els.socksEnabled.checked,
    webrtcFallback: els.webrtcFallback.checked,
    relaySignalingUrl: els.relaySignalingUrl.value || undefined,
    webrtcLocalPort: parseInt(els.webrtcLocalPort.value, 10) || 1081,
    dohEnabled: els.dohEnabled.checked,
    dohServers,
    turnServers,
    turnUsername: els.turnUsername.value || undefined,
    turnPassword: els.turnPassword.value || undefined,
    dpiBypassEnabled: els.dpibypassEnabled.checked,
    webrtcRelayEnabled: els.webrtcRelayEnabled.checked,
    autoStart: els.autoStart.checked,
    nativeAppEnabled: els.nativeAppEnabled.checked,
    preferredMode: els.preferredMode.value as any,
    dohBlocklist,
    licenseValidationUrl: els.licenseValidationUrl.value.trim(),
    licenseAccountId: els.licenseAccountId.value.trim(),
    licenseAllowOfflineGrace: els.licenseAllowOfflineGrace.checked,
    licenseInstalled: els.licenseSerial.value.trim() === SECRET_PLACEHOLDER,
    aiEngineEnabled: els.aiEngineEnabled.checked,
    aiAutoFallbackToLocal: els.aiAutoFallbackToLocal.checked,
    aiProviderAlias: safeAlias(els.aiProviderAlias.value) || 'local-v2rayez',
    aiProviderBaseUrl: els.aiProviderBaseUrl.value.trim() || 'local://v2rayez',
    aiProviderEndpoint: els.aiProviderEndpoint.value.trim(),
    aiProviderModel: els.aiProviderModel.value.trim() || 'v2rayez-anti-dpi-local',
    aiApiKeyInstalled: els.aiApiKey.value.trim() === SECRET_PLACEHOLDER,
  };
}

/* ────────── Handlers ────────── */

async function handleSave(): Promise<void> {
  els.saveBtn.disabled = true;

  try {
    const partial = extractConfig();
    const current = await chrome.storage.local.get([StorageKeys.CONFIG, StorageKeys.LEGACY_CONFIG, StorageKeys.SECRETS]);
    const secrets = { ...(current[StorageKeys.SECRETS] ?? {}) } as Record<string, string>;
    const serial = els.licenseSerial.value.trim();
    const apiKey = els.aiApiKey.value.trim();
    if (serial && serial !== SECRET_PLACEHOLDER) {
      secrets.licenseSerial = serial;
      partial.licenseInstalled = true;
      els.licenseSerial.value = SECRET_PLACEHOLDER;
    }
    if (apiKey && apiKey !== SECRET_PLACEHOLDER) {
      secrets.aiApiKey = apiKey;
      partial.aiApiKeyInstalled = true;
      els.aiApiKey.value = SECRET_PLACEHOLDER;
    }
    const config: UnifiedShieldConfig = { ...DEFAULT_CONFIG, ...(current[StorageKeys.CONFIG] ?? current[StorageKeys.LEGACY_CONFIG] ?? {}), ...partial };

    await chrome.storage.local.set({ [StorageKeys.CONFIG]: config, [StorageKeys.SECRETS]: secrets });

    // Notify service worker
    chrome.runtime.sendMessage({
      type: 'UPDATE_CONFIG',
      payload: config,
    });

    showStatus('Settings saved successfully', 'success');
  } catch (err) {
    showStatus(`Save failed: ${err}`, 'error');
  }

  els.saveBtn.disabled = false;
}

async function handleReset(): Promise<void> {
  if (!confirm('Reset all settings to defaults?')) return;

  await chrome.storage.local.set({ [StorageKeys.CONFIG]: DEFAULT_CONFIG, [StorageKeys.SECRETS]: {} });
  populateForm(DEFAULT_CONFIG);

  chrome.runtime.sendMessage({
    type: 'UPDATE_CONFIG',
    payload: DEFAULT_CONFIG,
  });

  showStatus('Settings reset to defaults', 'success');
}

/* ────────── Secret-safe helpers ────────── */

function safeAlias(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_-]/g, '');
}

/* ────────── Status ────────── */

function showStatus(message: string, type: 'success' | 'error'): void {
  els.statusMessage.textContent = message;
  els.statusBar.className = `status-bar ${type}`;
  els.statusBar.style.display = 'block';

  setTimeout(() => {
    els.statusBar.style.display = 'none';
  }, 4000);
}

/* ────────── Bootstrap ────────── */

document.addEventListener('DOMContentLoaded', init);
