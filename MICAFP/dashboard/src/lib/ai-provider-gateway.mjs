export class AIProviderGatewayError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'AIProviderGatewayError';
    this.code = code;
    this.details = details;
  }
}

const DEFAULT_TIMEOUT_MS = 12000;

export const RESPONSE_SHAPES = Object.freeze({
  openai: 'openai',
  anthropic: 'anthropic',
  gemini: 'gemini',
  generic: 'generic',
});

export function redactSecret(value) {
  if (!value || typeof value !== 'string') return '';
  if (value.length <= 10) return `${value.slice(0, 2)}…${value.slice(-2)}`;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export function redactProviderConfig(config) {
  const copy = structuredClone(config || {});
  if (copy.apiKey) copy.apiKey = redactSecret(copy.apiKey);
  if (copy.auth?.secret) copy.auth.secret = redactSecret(copy.auth.secret);
  if (copy.headers) {
    for (const key of Object.keys(copy.headers)) {
      if (/authorization|api-key|token|secret|key/i.test(key)) copy.headers[key] = redactSecret(String(copy.headers[key]));
    }
  }
  return copy;
}

function parseJsonObject(value, label) {
  if (value == null || value === '') return {};
  if (typeof value === 'object' && !Array.isArray(value)) return { ...value };
  if (typeof value !== 'string') {
    throw new AIProviderGatewayError(`invalid_${label}`, `${label} must be a JSON object`);
  }
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not_object');
    return parsed;
  } catch (error) {
    throw new AIProviderGatewayError(`invalid_${label}`, `${label} must be a valid JSON object`, { cause: error instanceof Error ? error.message : String(error) });
  }
}

function serializeRenderedBody(template) {
  if (typeof template !== 'string') return JSON.stringify(template);
  const trimmed = template.trim();
  if (!trimmed) return undefined;
  if (/^[{[]/.test(trimmed)) {
    JSON.parse(trimmed);
    return trimmed;
  }
  return JSON.stringify(template);
}

export function normalizeProviderConfig(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new AIProviderGatewayError('invalid_provider_config', 'Provider config must be an object');
  }
  const id = String(raw.id || raw.name || 'custom-provider').trim();
  const providerType = String(raw.type || raw.providerType || raw.provider || raw.shape || '').trim().toLowerCase();
  const rawBaseUrl = String(raw.baseUrl || '').trim().replace(/\/+$/, '');
  const isLocalProvider = providerType === 'local'
    || rawBaseUrl.startsWith('local://')
    || id === 'local-v2rayez'
    || id === 'local-v2rayez-ai';
  const baseUrl = isLocalProvider ? (rawBaseUrl || 'local://v2rayez') : rawBaseUrl;
  if (!isLocalProvider && (!baseUrl || !/^https?:\/\//i.test(baseUrl))) {
    throw new AIProviderGatewayError('invalid_base_url', 'baseUrl must be an http(s) URL or a local:// V2RayEZ provider');
  }
  if (isLocalProvider && !baseUrl.startsWith('local://')) {
    throw new AIProviderGatewayError('invalid_local_base_url', 'Local providers must use local://v2rayez or leave baseUrl empty');
  }
  const endpointPath = String(raw.endpointPath || raw.endpoint || raw.path || '').trim() || (isLocalProvider ? '' : '/v1/chat/completions');
  const method = isLocalProvider ? 'LOCAL' : String(raw.method || 'POST').toUpperCase();
  if (!isLocalProvider && !['GET', 'POST', 'PUT', 'PATCH'].includes(method)) {
    throw new AIProviderGatewayError('invalid_method', 'method must be GET, POST, PUT, or PATCH');
  }
  const timeoutMs = Math.max(1000, Math.min(120000, Number(raw.timeoutMs || DEFAULT_TIMEOUT_MS)));
  const auth = raw.auth && typeof raw.auth === 'object' ? raw.auth : {};
  const schema = raw.schema && typeof raw.schema === 'object' ? raw.schema : {};
  return {
    id,
    displayName: String(raw.displayName || raw.name || raw.id || (isLocalProvider ? 'V2RayEZ Local AI' : 'Custom AI Provider')).trim(),
    type: isLocalProvider ? 'local' : (providerType || 'generic'),
    local: isLocalProvider,
    baseUrl,
    endpointPath: endpointPath ? (endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`) : '',
    method,
    model: String(raw.model || schema.model || (isLocalProvider ? 'v2rayez-anti-dpi-local' : 'auto')).trim(),
    timeoutMs,
    headers: {
      ...parseJsonObject(raw.headersJson, 'headers_json'),
      ...(raw.headers && typeof raw.headers === 'object' ? raw.headers : {}),
    },
    auth: {
      type: isLocalProvider ? 'none' : String(auth.type || (raw.apiKey ? 'bearer' : 'none')).toLowerCase(),
      headerName: String(auth.headerName || 'Authorization'),
      headerTemplate: String(auth.headerTemplate || (raw.apiKey ? 'Bearer ${apiKey}' : '')),
      secretRef: auth.secretRef ? String(auth.secretRef) : undefined,
      secret: isLocalProvider ? undefined : raw.apiKey ? String(raw.apiKey) : auth.secret ? String(auth.secret) : undefined,
    },
    schema: {
      requestTemplate: schema.requestTemplate || raw.requestTemplate || defaultRequestTemplate(raw.type || raw.providerType || raw.provider || raw.shape),
      responsePath: schema.responsePath || raw.responsePath || (isLocalProvider ? 'text' : ''),
      systemPromptPath: schema.systemPromptPath || '',
    },
    proxyPolicy: raw.proxyPolicy || (isLocalProvider ? 'local-only' : 'try-active-tunnel-then-direct'),
    censorshipProbe: raw.censorshipProbe || { enabled: true, testPrompt: 'Reply with the single word OK.' },
  };
}

function defaultRequestTemplate(shape) {
  const normalized = String(shape || '').toLowerCase();
  if (normalized.includes('anthropic')) {
    return {
      model: '${model}',
      max_tokens: 256,
      messages: [{ role: 'user', content: '${prompt}' }],
    };
  }
  if (normalized.includes('gemini')) {
    return {
      contents: [{ parts: [{ text: '${prompt}' }] }],
      generationConfig: { maxOutputTokens: 256 },
    };
  }
  return {
    model: '${model}',
    messages: [
      { role: 'system', content: '${system}' },
      { role: 'user', content: '${prompt}' },
    ],
    temperature: 0.2,
  };
}

function renderTemplate(value, variables) {
  if (typeof value === 'string') {
    return value.replace(/\$\{([a-zA-Z0-9_]+)\}/g, (_, key) => String(variables[key] ?? ''));
  }
  if (Array.isArray(value)) return value.map((item) => renderTemplate(item, variables));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, next]) => [key, renderTemplate(next, variables)]));
  }
  return value;
}

export function buildAIRequest(config, input) {
  const provider = normalizeProviderConfig(config);
  const prompt = String(input.prompt || provider.censorshipProbe?.testPrompt || 'Reply OK.');
  const system = String(input.system || 'You are a concise VPN diagnostics assistant. Do not request secrets.');
  if (provider.local) {
    return {
      provider,
      url: provider.baseUrl,
      request: {
        method: provider.method,
        headers: {},
        body: JSON.stringify({ prompt, system, model: String(input.model || provider.model || 'v2rayez-anti-dpi-local') }),
      },
    };
  }
  const variables = {
    prompt,
    system,
    model: String(input.model || provider.model || 'auto'),
    prompt_json: JSON.stringify(prompt),
    system_json: JSON.stringify(system),
  };
  const renderedEndpointPath = renderTemplate(provider.endpointPath, variables);
  const url = new URL(renderedEndpointPath, provider.baseUrl);
  const headers = {
    accept: 'application/json',
    ...provider.headers,
  };

  let body;
  if (provider.method !== 'GET') {
    headers['content-type'] = headers['content-type'] || 'application/json';
    body = serializeRenderedBody(renderTemplate(provider.schema.requestTemplate, variables));
  } else {
    url.searchParams.set('prompt', prompt);
    if (variables.model !== 'auto') url.searchParams.set('model', variables.model);
  }

  if (provider.auth.type !== 'none') {
    const secret = provider.auth.secret || input.apiKey || '';
    if (!secret) throw new AIProviderGatewayError('missing_auth_secret', 'Provider auth is enabled but no secret/apiKey was provided');
    const headerName = provider.auth.headerName || 'Authorization';
    const headerValue = (provider.auth.headerTemplate || '${apiKey}').replace(/\$\{apiKey\}/g, secret);
    headers[headerName] = headerValue;
  }

  return {
    provider,
    url: url.toString(),
    request: {
      method: provider.method,
      headers,
      body,
    },
  };
}

function valueAtPath(value, path) {
  if (!path) return undefined;
  const parts = String(path).replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let current = value;
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
}

export function detectResponseShape(json) {
  const openAiText = valueAtPath(json, 'choices[0].message.content') ?? valueAtPath(json, 'choices[0].text');
  if (typeof openAiText === 'string') return { shape: RESPONSE_SHAPES.openai, text: openAiText, responsePath: typeof valueAtPath(json, 'choices[0].message.content') === 'string' ? 'choices[0].message.content' : 'choices[0].text' };

  const anthropicText = valueAtPath(json, 'content[0].text');
  if (typeof anthropicText === 'string') return { shape: RESPONSE_SHAPES.anthropic, text: anthropicText, responsePath: 'content[0].text' };

  const geminiText = valueAtPath(json, 'candidates[0].content.parts[0].text');
  if (typeof geminiText === 'string') return { shape: RESPONSE_SHAPES.gemini, text: geminiText, responsePath: 'candidates[0].content.parts[0].text' };

  const commonPaths = ['text', 'message', 'content', 'result', 'output', 'data.text', 'data.message'];
  for (const path of commonPaths) {
    const found = valueAtPath(json, path);
    if (typeof found === 'string') return { shape: RESPONSE_SHAPES.generic, text: found, responsePath: path };
  }

  return { shape: RESPONSE_SHAPES.generic, text: '', responsePath: '' };
}

export function extractAIText(json, configuredPath = '') {
  if (configuredPath) {
    const configured = valueAtPath(json, configuredPath);
    if (typeof configured === 'string') return { shape: RESPONSE_SHAPES.generic, text: configured, responsePath: configuredPath };
  }
  return detectResponseShape(json);
}

function categorizeFetchError(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (/abort|timeout/i.test(message)) return { code: 'timeout', blocked: true, retryable: true };
  if (/ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED|network|fetch failed/i.test(message)) return { code: 'network_unreachable', blocked: true, retryable: true };
  return { code: 'request_failed', blocked: false, retryable: true };
}

export async function testAndAutoDetectProvider(config, input = {}, fetchImpl = globalThis.fetch) {
  const built = buildAIRequest(config, input);
  if (built.provider.local) {
    return localAIProviderResult(built.provider, input);
  }
  if (typeof fetchImpl !== 'function') {
    throw new AIProviderGatewayError('fetch_unavailable', 'fetch implementation is unavailable');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error('timeout')), built.provider.timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await fetchImpl(built.url, { ...built.request, signal: controller.signal });
    const latencyMs = Date.now() - startedAt;
    const contentType = response.headers?.get?.('content-type') || '';
    const rawText = await response.text();
    let json;
    try {
      json = rawText ? JSON.parse(rawText) : {};
    } catch {
      json = { text: rawText };
    }
    const extracted = extractAIText(json, built.provider.schema.responsePath);
    const success = response.ok && Boolean(extracted.text || rawText);
    return {
      success,
      reachable: true,
      blocked: false,
      retryable: !response.ok,
      status: response.status,
      latencyMs,
      contentType,
      detectedShape: extracted.shape,
      responsePath: extracted.responsePath,
      sampleText: extracted.text.slice(0, 500),
      provider: redactProviderConfig({ ...built.provider, schema: { ...built.provider.schema, responsePath: extracted.responsePath || built.provider.schema.responsePath } }),
      fallback: success ? null : localAIFallbackDescriptor('bad_response'),
    };
  } catch (error) {
    const classified = categorizeFetchError(error);
    return {
      success: false,
      reachable: false,
      blocked: classified.blocked,
      retryable: classified.retryable,
      errorCode: classified.code,
      error: error instanceof Error ? error.message : String(error),
      provider: redactProviderConfig(built.provider),
      fallback: localAIFallbackDescriptor(classified.code),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function localAIProviderResult(provider, input = {}) {
  const prompt = String(input.prompt || provider.censorshipProbe?.testPrompt || 'diagnose connection');
  return {
    success: true,
    reachable: true,
    blocked: false,
    retryable: false,
    status: 200,
    latencyMs: 0,
    contentType: 'application/vnd.v2rayez.local-ai+json',
    detectedShape: RESPONSE_SHAPES.generic,
    responsePath: 'text',
    sampleText: `V2RayEZ Local AI ready: adaptive anti-DPI guidance is available for ${prompt.slice(0, 80)}`,
    provider: redactProviderConfig(provider),
    fallback: null,
    localFallback: localAIFallbackDescriptor('local_provider_selected'),
  };
}

export function localAIFallbackDescriptor(reason = 'external_provider_unavailable') {
  return {
    mode: 'local-v2rayez-ai',
    reason,
    engines: [
      'dpi_classifier',
      'adversarial_traffic',
      'feature_extractor',
      'onnx_runtime',
      'rl_transport_selector',
      'traffic_predictor',
      'ucb_bandit',
    ],
    dependencyFreeCoreNetworking: true,
  };
}
