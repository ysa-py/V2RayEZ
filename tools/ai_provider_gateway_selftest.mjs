#!/usr/bin/env node
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  buildAIRequest,
  detectResponseShape,
  localAIFallbackDescriptor,
  redactProviderConfig,
  testAndAutoDetectProvider,
} from '../MICAFP/dashboard/src/lib/ai-provider-gateway.mjs';

const server = http.createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  res.setHeader('content-type', 'application/json');
  if (req.url === '/openai') {
    res.end(JSON.stringify({ choices: [{ message: { content: 'OK openai' } }] }));
  } else if (req.url === '/anthropic') {
    res.end(JSON.stringify({ content: [{ type: 'text', text: 'OK anthropic' }] }));
  } else if (req.url === '/gemini') {
    res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'OK gemini' }] } }] }));
  } else if (req.url === '/generic') {
    res.end(JSON.stringify({ data: { message: 'OK generic' } }));
  } else if (req.url === '/echo') {
    res.end(JSON.stringify({ text: body.includes('diagnose') ? 'OK echo diagnose' : 'OK echo' }));
  } else {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'not found' }));
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const baseUrl = `http://127.0.0.1:${port}`;

try {
  assert.equal(detectResponseShape({ choices: [{ message: { content: 'hello' } }] }).shape, 'openai');
  assert.equal(detectResponseShape({ content: [{ text: 'hello' }] }).shape, 'anthropic');
  assert.equal(detectResponseShape({ candidates: [{ content: { parts: [{ text: 'hello' }] } }] }).shape, 'gemini');

  const built = buildAIRequest({ baseUrl, endpointPath: '/echo', model: 'new-model', auth: { type: 'none' } }, { prompt: 'diagnose vpn' });
  assert.equal(built.request.method, 'POST');
  assert.equal(built.url, `${baseUrl}/echo`);
  assert.match(String(built.request.body), /diagnose vpn/);

  for (const [endpoint, shape] of [['/openai', 'openai'], ['/anthropic', 'anthropic'], ['/gemini', 'gemini'], ['/generic', 'generic']]) {
    const result = await testAndAutoDetectProvider({ baseUrl, endpointPath: endpoint, auth: { type: 'none' } });
    assert.equal(result.success, true);
    assert.equal(result.detectedShape, shape);
    assert.equal(result.blocked, false);
  }

  const redacted = redactProviderConfig({ baseUrl, auth: { type: 'bearer', secret: 'sk-super-secret-key' }, headers: { Authorization: 'Bearer sk-super-secret-key' } });
  assert.notEqual(redacted.auth.secret, 'sk-super-secret-key');
  assert.notEqual(redacted.headers.Authorization, 'Bearer sk-super-secret-key');

  const fallback = localAIFallbackDescriptor('network_unreachable');
  assert.equal(fallback.mode, 'local-v2rayez-ai');
  assert.equal(fallback.dependencyFreeCoreNetworking, true);
  assert.ok(fallback.engines.includes('dpi_classifier'));

  console.log('ai_provider_gateway_selftest: PASS');
} finally {
  await new Promise((resolve) => server.close(resolve));
}
