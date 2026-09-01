import { NextRequest, NextResponse } from 'next/server';
import { testAndAutoDetectProvider } from '@/lib/ai-provider-gateway.mjs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const provider = body.provider && typeof body.provider === 'object' ? body.provider : body;
    const result = await testAndAutoDetectProvider(provider, {
      prompt: body.prompt || provider.censorshipProbe?.testPrompt || 'Reply with the single word OK.',
      system: body.system || 'You are a concise V2RayEZ diagnostics assistant.',
      model: body.model || provider.model,
      apiKey: body.apiKey,
    });

    return NextResponse.json({
      success: Boolean(result.success),
      autoDetect: result,
      localFallback: result.fallback || null,
    }, { status: result.success ? 200 : 200 });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'AI provider test failed',
        localFallback: {
          mode: 'local-micafp-ai',
          reason: 'provider_config_or_probe_error',
          dependencyFreeCoreNetworking: true,
        },
      },
      { status: 400 },
    );
  }
}
