#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function text(path) { return readFileSync(path, 'utf8'); }
function has(path, needle) { assert.ok(text(path).includes(needle), `${path} missing ${needle}`); }

const base = 'V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)';
const models = `${base}/app/src/main/java/com/v2rayez/app/domain/model/ConfigModels.kt`;
const service = `${base}/app/src/main/java/com/v2rayez/app/data/service/V2RayVpnService.kt`;
const vm = `${base}/app/src/main/java/com/v2rayez/app/ui/viewmodel/LicenseAiViewModels.kt`;
const screen = `${base}/app/src/main/java/com/v2rayez/app/ui/screens/settings/LicenseScreen.kt`;
const strings = `${base}/app/src/main/res/values/strings.xml`;
const fa = `${base}/app/src/main/res/values-fa/strings.xml`;
const ru = `${base}/app/src/main/res/values-ru/strings.xml`;
const docs = 'docs/LICENSE_API.md';

has(models, 'val revocationPollSeconds: Int = 10');
has(models, 'fully offline client still cannot');
has(service, 'licenseConfig.revocationPollSeconds.coerceIn(5, 300) * 1_000L');
has(service, 'val onlineRevokePollMs');
has(service, 'decision.remainingSeconds in 1..300 -> minOf(decision.remainingSeconds * 1_000L, onlineRevokePollMs)');
has(vm, 'revocationPollSeconds: String');
has(vm, 'revocationPollSeconds.toIntOrNull()?.coerceIn(5, 300) ?: 10');
has(screen, 'R.string.license_revocation_poll_seconds');
has(screen, 'it.filter { ch -> ch.isDigit() }.take(3)');
for (const file of [strings, fa, ru]) has(file, 'name="license_revocation_poll_seconds"');
has(docs, '`revocationPollSeconds` control (5–300 seconds, default 10)');
has(docs, 'fully offline client cannot receive an instant revoke packet');

console.log('android_license_revocation_poll_gate: PASS');
