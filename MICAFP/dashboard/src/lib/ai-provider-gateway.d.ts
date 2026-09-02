export class AIProviderGatewayError extends Error {
  code: string;
  details: Record<string, unknown>;
  constructor(code: string, message: string, details?: Record<string, unknown>);
}

export const RESPONSE_SHAPES: Readonly<Record<string, string>>;
export function redactSecret(value: string): string;
export function redactProviderConfig(config: Record<string, unknown>): Record<string, unknown>;
export function normalizeProviderConfig(raw: Record<string, unknown>): Record<string, unknown>;
export function buildAIRequest(config: Record<string, unknown>, input: Record<string, unknown>): { provider: Record<string, unknown>; url: string; request: RequestInit };
export function detectResponseShape(json: unknown): { shape: string; text: string; responsePath: string };
export function extractAIText(json: unknown, configuredPath?: string): { shape: string; text: string; responsePath: string };
export function testAndAutoDetectProvider(config: Record<string, unknown>, input?: Record<string, unknown>, fetchImpl?: typeof fetch): Promise<Record<string, unknown>>;
export function localAIProviderResult(provider: Record<string, unknown>, input?: Record<string, unknown>): Record<string, unknown>;
export function localAIFallbackDescriptor(reason?: string): Record<string, unknown>;
