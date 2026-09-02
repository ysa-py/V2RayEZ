'use client';

import React, { useState } from 'react';
import { BrainCircuit, FlaskConical, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

const defaultTemplate = '{"model":"${model}","messages":[{"role":"system","content":"Return concise V2RayEZ anti-DPI guidance."},{"role":"user","content":${prompt_json}}]}';

export function AIProviderGatewayPanel() {
  const [enabled, setEnabled] = useState(true);
  const [fallback, setFallback] = useState(true);
  const [providerId, setProviderId] = useState('local-v2rayez');
  const [name, setName] = useState('V2RayEZ Local AI');
  const [type, setType] = useState('local');
  const [baseUrl, setBaseUrl] = useState('local://v2rayez');
  const [endpoint, setEndpoint] = useState('');
  const [model, setModel] = useState('v2rayez-anti-dpi-local');
  const [apiKeyAlias, setApiKeyAlias] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [headersJson, setHeadersJson] = useState('{}');
  const [requestTemplate, setRequestTemplate] = useState(defaultTemplate);
  const [responsePath, setResponsePath] = useState('choices.0.message.content');
  const [prompt, setPrompt] = useState('Recommend a safe anti-DPI fallback when TLS/SNI traffic is blocked.');
  const [result, setResult] = useState('Local fallback ready');
  const [busy, setBusy] = useState(false);

  async function testProvider() {
    setBusy(true);
    try {
      const provider = {
        id: providerId,
        name,
        type,
        providerType: type,
        enabled,
        baseUrl,
        endpoint,
        model,
        apiKeyAlias,
        headersJson,
        requestTemplate,
        responsePath,
        fallback: fallback ? { mode: 'local-v2rayez-ai', reason: 'external_unreachable', dependencyFreeCoreNetworking: true } : null,
      };
      const response = await fetch('/api/ai-engine/providers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey, prompt, model }),
      });
      const data = await response.json();
      setResult(data.success ? `OK · ${data.autoDetect?.detectedShape || 'provider'} · ${data.autoDetect?.responsePath || 'auto'}` : `Fallback · ${data.localFallback?.reason || data.error || 'blocked'}`);
    } catch (error) {
      setResult(`Fallback · ${error instanceof Error ? error.message : 'provider_test_failed'}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="shield-card border-violet-500/20 bg-slate-950/80">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-violet-300">
              <BrainCircuit className="h-5 w-5" /> AI Provider Gateway
            </CardTitle>
            <CardDescription>
              افزودن بدون کد برای OpenAI، Anthropic، Gemini، Generic HTTP و fallback داخلی V2RayEZ.
            </CardDescription>
          </div>
          <Badge variant={result.startsWith('OK') ? 'secondary' : 'outline'}>{result}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex items-center justify-between rounded-xl border border-white/10 p-3">
            <span>فعال‌سازی Gateway</span><Switch checked={enabled} onCheckedChange={setEnabled} />
          </label>
          <label className="flex items-center justify-between rounded-xl border border-white/10 p-3">
            <span>Fallback داخلی خودکار</span><Switch checked={fallback} onCheckedChange={setFallback} />
          </label>
          <div className="space-y-2"><Label>Provider ID</Label><Input value={providerId} onChange={e => setProviderId(e.target.value)} /></div>
          <div className="space-y-2"><Label>Name</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="local">Local fallback</SelectItem>
                <SelectItem value="openai">OpenAI-compatible</SelectItem>
                <SelectItem value="anthropic">Anthropic</SelectItem>
                <SelectItem value="gemini">Gemini</SelectItem>
                <SelectItem value="generic">Generic HTTP</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Model</Label><Input value={model} onChange={e => setModel(e.target.value)} /></div>
          <div className="space-y-2"><Label>Base URL</Label><Input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} /></div>
          <div className="space-y-2"><Label>Endpoint</Label><Input value={endpoint} onChange={e => setEndpoint(e.target.value)} /></div>
          <div className="space-y-2"><Label>API key alias</Label><Input value={apiKeyAlias} onChange={e => setApiKeyAlias(e.target.value)} /></div>
          <div className="space-y-2"><Label>API key for test only</Label><Input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} /></div>
        </div>
        <div className="space-y-2"><Label>Headers JSON</Label><Textarea value={headersJson} onChange={e => setHeadersJson(e.target.value)} rows={3} spellCheck={false} /></div>
        <div className="space-y-2"><Label>Request template</Label><Textarea value={requestTemplate} onChange={e => setRequestTemplate(e.target.value)} rows={5} spellCheck={false} /></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2"><Label>Response path</Label><Input value={responsePath} onChange={e => setResponsePath(e.target.value)} /></div>
          <div className="space-y-2"><Label>Test prompt</Label><Input value={prompt} onChange={e => setPrompt(e.target.value)} /></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={testProvider} disabled={busy || !providerId}><FlaskConical className="h-4 w-4 ml-1" /> Test / Auto-detect</Button>
          <Button type="button" variant="outline" onClick={() => setResult('Provider definition is ready to paste into platform settings')}><ShieldCheck className="h-4 w-4 ml-1" /> Secret-free export</Button>
        </div>
      </CardContent>
    </Card>
  );
}
