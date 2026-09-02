#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const path = 'V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)/app/src/main/java/com/v2rayez/app/ui/SupportedLanguages.kt';
const text = readFileSync(path, 'utf8');

for (const required of [
  'private fun normalizeAiEngine(aiEngine: AiEngineConfig): AiEngineConfig',
  'private fun normalizeAiProvider(provider: AiProviderConfig): AiProviderConfig',
  'settings.copy(language = normalizedLanguage, aiEngine = normalizedAiEngine)',
  '"local-aether", "local_micafp", "local-micafp" -> "local-v2rayez"',
  '"local://aether", "local://micafp" -> "local://v2rayez"',
  '"aether-anti-dpi-local", "micafp-anti-dpi-local" -> "v2rayez-anti-dpi-local"',
  'name = "V2RayEZ Local AI"',
  'type = AiProviderType.LOCAL',
  'apiKeyAlias = ""',
  'responsePath = provider.responsePath.ifBlank { "text" }',
]) {
  assert.ok(text.includes(required), `${path} missing ${required}`);
}

assert.ok(!text.includes('Aether/MICAFP labels as product UI/UX'), `${path} still describes donor labels as product UI/UX`);

console.log('android_ai_settings_migration_gate: PASS');
