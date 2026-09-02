/**
 * V2RayEZ Universal — Shared Protocol Types
 */

/* ────────── Storage Keys ────────── */

export const StorageKeys = {
  CONFIG: 'v2rayez_config',
  STATE: 'v2rayez_state',
  STATS: 'v2rayez_stats',
  SECRETS: 'v2rayez_extension_secrets',
  LEGACY_CONFIG: 'unifiedshield_config',
  LEGACY_STATE: 'unifiedshield_state',
  LEGACY_STATS: 'unifiedshield_stats',
} as const;

/* ────────── Configuration ────────── */

export interface UnifiedShieldConfig {
  // SOCKS5
  socksHost: string;
  socksPort: number;
  socksUsername?: string;
  socksPassword?: string;
  socksEnabled: boolean;

  // WebRTC
  webrtcFallback: boolean;
  relaySignalingUrl?: string;
  webrtcLocalPort?: number;
  turnServers: string[];
  turnUsername?: string;
  turnPassword?: string;

  // DNS
  dohEnabled: boolean;
  dohServers: string[];
  dohBlocklist: string[];

  // DPI Bypass
  dpiBypassEnabled?: boolean;
  webrtcRelayEnabled?: boolean;

  // License
  licenseValidationUrl?: string;
  licenseAccountId?: string;
  licensePublicKeyPem?: string;
  licenseDeviceHashSalt?: string;
  licenseAllowOfflineGrace?: boolean;
  licenseInstalled?: boolean;
  licenseLastResult?: string;
  licenseLastReason?: string;
  licenseExpiresAt?: string;
  licenseOfflineGraceUntil?: string;
  licenseLastServerTime?: string;
  licenseGraceServerTime?: string;

  // AI Provider Gateway
  aiEngineEnabled?: boolean;
  aiAutoFallbackToLocal?: boolean;
  aiProviderAlias?: string;
  aiProviderBaseUrl?: string;
  aiProviderEndpoint?: string;
  aiProviderModel?: string;
  aiApiKeyInstalled?: boolean;

  // General
  autoStart: boolean;
  nativeAppEnabled: boolean;
  preferredMode: 'auto' | 'socks5' | 'webrtc' | 'direct';
}

export const DEFAULT_CONFIG: UnifiedShieldConfig = {
  socksHost: '127.0.0.1',
  socksPort: 1080,
  socksEnabled: true,
  webrtcFallback: true,
  relaySignalingUrl: 'wss://relay.unifiedshield.org/signaling',
  webrtcLocalPort: 1081,
  turnServers: [],
  dohEnabled: true,
  dohServers: ['alidns', 'dnspod', 'byteplus'],
  dohBlocklist: [],
  dpiBypassEnabled: true,
  webrtcRelayEnabled: false,
  licenseValidationUrl: '',
  licenseAccountId: '',
  licensePublicKeyPem: '',
  licenseDeviceHashSalt: 'v2rayez-client-device-binding-v1',
  licenseAllowOfflineGrace: true,
  licenseInstalled: false,
  licenseLastResult: 'not_validated',
  licenseLastReason: '',
  licenseExpiresAt: '',
  licenseOfflineGraceUntil: '',
  licenseLastServerTime: '',
  licenseGraceServerTime: '',
  aiEngineEnabled: true,
  aiAutoFallbackToLocal: true,
  aiProviderAlias: 'local-v2rayez',
  aiProviderBaseUrl: 'local://v2rayez',
  aiProviderEndpoint: '',
  aiProviderModel: 'v2rayez-anti-dpi-local',
  aiApiKeyInstalled: false,
  autoStart: false,
  nativeAppEnabled: false,
  preferredMode: 'auto',
};

/* ────────── Proxy State ────────── */

export interface ProxyState {
  connected: boolean;
  mode: 'socks5' | 'webrtc' | 'direct' | 'auto';
  socksPort: number;
  webrtcActive: boolean;
  ispDetected: ISPInfo | null;
  blockedCount: number;
  lastBlockTime: number | null;
}

/* ────────── ISP Info ────────── */

export interface ISPInfo {
  name: string;
  asn: string;
  ip: string;
  country: string;
  city?: string;
  isIranian: boolean;
  throttlingProfile: string;
  knownBlockingPatterns: string[];
}

/* ────────── Relay Peer ────────── */

export interface RelayPeer {
  id: string;
  connection: RTCPeerConnection;
  localPort: number;
  connected: boolean;
  latency: number;
}

/* ────────── DNS ────────── */

export interface DNSRecord {
  name: string;
  type: number;
  ttl: number;
  data: string;
}

export interface DohResponse {
  hostname: string;
  type: string;
  records: DNSRecord[];
  fromCache: boolean;
  poisoned: boolean;
  error?: string;
}

/* ────────── Messages ────────── */

export type MessageTypes =
  | 'GET_STATE'
  | 'GET_CONFIG'
  | 'UPDATE_CONFIG'
  | 'START_PROXY'
  | 'STOP_PROXY'
  | 'TOGGLE_PROXY'
  | 'DETECT_ISP'
  | 'DNS_RESOLVE'
  | 'GET_RELAY_PEERS'
  | 'BLOCK_DETECTED'
  | 'CONTENT_SCRIPT_READY'
  | 'STATE_UPDATE';

export interface ExtensionMessage {
  type: MessageTypes;
  payload?: any;
}

/* ────────── Block Event ────────── */

export interface BlockEvent {
  type: 'tls_reset' | 'http_403' | 'dns_poison' | 'sni_filter' | 'connection_reset';
  url: string;
  timestamp: number;
  signature?: string;
}

/* ────────── DPI Signatures ────────── */

export interface DPISignature {
  id: string;
  name: string;
  type: 'tls_rst' | 'http_403' | 'dns_poison' | 'sni_filter' | 'protocol_detect';
  description: string;
  pattern: string;
  timingRangeMs: [number, number];
  severity: 'low' | 'medium' | 'high' | 'critical';
}

/* ────────── Crypto ────────── */

export interface ECDHKeyPair {
  publicKey: Uint8Array;  // 32 bytes
  privateKey: Uint8Array; // 32 bytes
}

export interface EncryptedPayload {
  nonce: Uint8Array;      // 12 bytes
  ciphertext: Uint8Array;
  tag: Uint8Array;        // 16 bytes
}
