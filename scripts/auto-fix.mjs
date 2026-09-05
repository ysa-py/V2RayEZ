#!/usr/bin/env node
// ---------------------------------------------------------------------------
// V2RayEZ / Vor — repository auto-fix tool.
//
// Scans the tree for defect classes that have already caused real CI failures
// and repairs them automatically where a deterministic, behaviour-preserving
// repair exists. Everything it cannot repair safely is reported with the exact
// file/line and the exact remediation, so nothing is silently ignored.
//
// Usage:
//   node scripts/auto-fix.mjs            # scan + repair (default)
//   node scripts/auto-fix.mjs --apply    # scan + repair (explicit)
//   node scripts/auto-fix.mjs --check    # scan only; exit 1 on any finding
//                                        # (used by CI as a fail-closed gate)
//   node scripts/auto-fix.mjs --json     # machine-readable report
//
// Design rules:
//   * repairs are additive and behaviour-preserving — no feature, capability,
//     FFI symbol, artifact type or file is ever deleted;
//   * a repair is only applied when it is mechanically unambiguous (e.g. a
//     quoted xcodebuild option string becomes a real argv array). Anything
//     ambiguous is reported for a human instead of being guessed;
//   * `--check` is fail-closed: any finding (fixable or not) is a non-zero exit.
// ---------------------------------------------------------------------------
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { deflateSync, inflateSync } from 'node:zlib';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const rel = (p) => relative(ROOT, p).split('\\').join('/');

const args = process.argv.slice(2);
const MODE = args.includes('--check') ? 'check' : 'apply';
const JSON_OUT = args.includes('--json');

// ── helpers ──────────────────────────────────────────────────────────────────
function walk(dir, out = [], skip = new Set(['node_modules', '.git', 'target', 'dist', 'Pods'])) {
  let entries;
  try {
    entries = readdirSync(dir, { withEncoding: 'utf8' });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (skip.has(entry)) continue;
    const p = join(dir, entry);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(p, out, skip);
    else out.push(p);
  }
  return out;
}

function read(p) {
  return readFileSync(p, 'utf8');
}

function write(p, content) {
  writeFileSync(p, content, 'utf8');
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

// CRC32 (PNG chunk checksums) — needed to rewrite IHDR/IDAT safely.
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ── finding model ────────────────────────────────────────────────────────────
const findings = [];
const fixes = [];

// Donor source trees are preserved verbatim: they are reported (so nothing is
// hidden) but never auto-modified, and they never fail `--check`.
const PROTECTED_PREFIXES = [
  'EasySNI-',
  'MICAFP',
  'MSN-GUARD',
  'MasterDnsVPN-main',
  'UAC-SNI-Spoofer',
];
const isProtected = (relPath) => PROTECTED_PREFIXES.some((p) => relPath.startsWith(p));

function report(rule, file, line, message, { fixable = false } = {}) {
  findings.push({ rule, file, line, message, fixable, severity: isProtected(file) ? 'info' : 'error' });
}

const blocking = () => findings.filter((f) => f.severity !== 'info');

function repaired(rule, file, message) {
  fixes.push({ rule, file, message });
}

// ── rule 1: xcodebuild option string passed as a single argv entry ───────────
// `xcodebuild "$OPTS" archive` hands the whole option string to xcodebuild as
// ONE argument, which it can never parse. Convert to a real bash array.
function shellSplit(str) {
  // Split on whitespace, honouring single/double quotes. Returns null when the
  // string contains anything we cannot represent unambiguously.
  const tokens = [];
  let cur = '';
  let quote = null;
  let hasQuote = false;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      hasQuote = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (cur) tokens.push(cur);
      cur = '';
      continue;
    }
    if (ch === '$' || ch === '`' || ch === '\\') {
      // Command substitution / escapes inside the option string are not safe to
      // rewrite mechanically.
      return null;
    }
    cur += ch;
  }
  if (quote) return null;
  if (cur) tokens.push(cur);
  if (hasQuote) return null;
  return tokens.length ? tokens : null;
}

function ruleXcodebuildQuotedOptions(files) {
  const re = /^([ \t]*)(\w+)=("[^"\n]*")([ \t]*)$/;
  const useRe = /xcodebuild\s+"\$(\w+)"/;
  for (const file of files) {
    const text = read(file);
    const varNames = new Set();
    for (const line of text.split('\n')) {
      const m = line.match(re);
      if (m && /\s-(project|scheme|workspace|archivePath|configuration|target)\b/.test(m[3])) {
        varNames.add(m[2]);
      }
    }
    if (varNames.size === 0) continue;
    const lines = text.split('\n');
    let changed = false;
    for (const name of varNames) {
      const assignIdx = lines.findIndex((l) => new RegExp(`^[ \\t]*${name}="[^"\\n]*"[ \\t]*$`).test(l));
      if (assignIdx === -1) continue;
      const assignLine = lines[assignIdx];
      const indent = assignLine.match(/^[ \t]*/)[0];
      const raw = assignLine.slice(assignLine.indexOf('"') + 1, assignLine.lastIndexOf('"'));
      const tokens = shellSplit(raw);
      const usedAsOneArg = lines.some((l) => new RegExp(`xcodebuild\\s+"\\$${name}"`).test(l));
      if (!usedAsOneArg) continue;
      if (isProtected(rel(file))) {
        report(
          'xcodebuild-quoted-options',
          rel(file),
          assignIdx + 1,
          `donor tree: xcodebuild receives "$${name}" as ONE argv entry; left untouched (donor sources are preserved verbatim).`,
        );
        continue;
      }
      if (!tokens) {
        report(
          'xcodebuild-quoted-options',
          rel(file),
          assignIdx + 1,
          `xcodebuild option variable $${name} is passed as a single quoted argv entry and contains constructs that cannot be split automatically — convert it to a bash array ("${name}=(...)" + "\${${name}[@]}") manually.`,
        );
        continue;
      }
      if (MODE === 'check') {
        report(
          'xcodebuild-quoted-options',
          rel(file),
          assignIdx + 1,
          `xcodebuild receives "$${name}" as ONE argv entry (all options in a single argument); it must be a bash array.`,
          { fixable: true },
        );
        continue;
      }
      const arrayName = `${name}_ARGS`;
      lines[assignIdx] = `${indent}${arrayName}=(${tokens.map((t) => `"${t}"`).join(' ')})`;
      for (let i = 0; i < lines.length; i++) {
        lines[i] = lines[i].replace(new RegExp(`"\\$${name}"`, 'g'), `"\${${arrayName}[@]}"`);
      }
      changed = true;
      repaired(
        'xcodebuild-quoted-options',
        rel(file),
        `converted "$${name}" from a single quoted argv entry into a real bash array (${arrayName}).`,
      );
    }
    if (changed) write(file, lines.join('\n'));
  }
  void useRe;
}

// ── rule 2: fabricated .ipa / app executables ────────────────────────────────
// A shell script (or any non-Mach-O file) written as CFBundleExecutable and
// zipped into an .ipa is not a shippable app, but it looks like one.
function ruleFabricatedIpaExecutable(files) {
  for (const file of files) {
    const text = read(file);
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (!/echo\s+"?#!\/bin\/sh/.test(lines[i])) continue;
      if (isProtected(rel(file))) continue; // donor trees are preserved verbatim
      const context = lines.slice(Math.max(0, i - 25), i + 12).join('\n');
      if (!/\.app|\.ipa|Payload/.test(context)) continue;
      // Already guarded? (a preceding line that exits)
      const alreadyGuarded = lines.slice(Math.max(0, i - 3), i).some((l) => /refusing|error:/.test(l));
      if (alreadyGuarded) continue;
      if (MODE === 'check') {
        report(
          'fabricated-ipa-executable',
          rel(file),
          i + 1,
          'a non-Mach-O file (shell script) is written as the app executable and packaged as an .ipa; a real Xcode build must produce the binary.',
          { fixable: true },
        );
        continue;
      }
      const indent = lines[i].match(/^[ \t]*/)[0];
      // The synthesized executable may be written by a multi-line echo; consume
      // every continuation line so no dangling shell fragment is left behind.
      let consumed = 0;
      let probe = lines[i];
      while ((probe.match(/"/g) || []).length % 2 !== 0 && i + consumed + 1 < lines.length) {
        consumed += 1;
        probe += `\n${lines[i + consumed]}`;
      }
      const guardLines = [
        `${indent}echo "error: refusing to package a non-Mach-O executable (no real Xcode build produced a binary)" >&2`,
        `${indent}exit 1`,
      ];
      lines.splice(i, consumed + 1, ...guardLines);
      write(file, lines.join('\n'));
      repaired(
        'fabricated-ipa-executable',
        rel(file),
        'replaced the synthesized shell-script app executable with a fail-closed error.',
      );
    }
  }
}

// ── rule 3: hard-coded Xcode project name that contradicts project.yml ───────
function ruleHardcodedXcodeproj(files) {
  const projectYml = join(ROOT, 'MICAFP/ios/project.yml');
  if (!existsSync(projectYml)) return;
  const nameMatch = read(projectYml).match(/^name:[ \t]*"?([^"\s]+)"?[ \t]*$/m);
  const expected = nameMatch ? nameMatch[1] : null;
  if (!expected) return;
  for (const file of files) {
    const text = read(file);
    const lines = text.split('\n');
    lines.forEach((line, idx) => {
      if (/^\s*(#|\/\/|\*|\/\*)/.test(line)) return; // documentation only
      const m = line.match(/-project\s+(\S+)\.xcodeproj/);
      if (!m) return;
      if (m[1] === expected) return;
      report(
        'hardcoded-xcodeproj',
        rel(file),
        idx + 1,
        `hard-coded "-project ${m[1]}.xcodeproj", but MICAFP/ios/project.yml declares "name: ${expected}" so xcodegen generates ${expected}.xcodeproj. Resolve the project dynamically (scripts/ios-packaging.sh → ios_resolve_xcodeproj).`,
      );
    });
  }
}

// ── rule 4: diagnostics that can report MISSING-LOG ──────────────────────────
// A diagnostics step whose log file is only created by `tee` after an early
// `exit 1` can never show the real error.
function ruleMissingDiagLog(files) {
  for (const file of files) {
    const text = read(file);
    if (!/MISSING-LOG/.test(text)) continue;
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/if\s+\[\[\s+!\s+-f\s+([^\s\]]+)\s+\]\]/);
      if (!m) continue;
      const logPath = m[1];
      // Walk backwards to the start of this run block (the `set -` line).
      let start = i;
      while (start > 0 && !/set\s+-[euxo]/.test(lines[start])) start--;
      const block = lines.slice(start, i);
      const created = block.some((l) => new RegExp(`(:\\s*>\\s*"?${logPath.replace(/[$]/g, '\\$')}"?)|(tee\\s+.*${logPath.replace(/[$]/g, '\\$')})`).test(l));
      const earlyExit = block.findIndex((l) => /exit\s+1/.test(l));
      if (created || earlyExit === -1) continue;
      if (MODE === 'check') {
        report(
          'missing-diagnostic-log',
          rel(file),
          start + 1,
          `the diagnostics log ${logPath} is created after an early "exit 1", so a pre-flight failure can only report MISSING-LOG. Create it before any check (": > ${logPath}").`,
          { fixable: true },
        );
        continue;
      }
      const indent = lines[start].match(/^[ \t]*/)[0];
      lines.splice(start + 1, 0, `${indent}: > "${logPath}"`);
      write(file, lines.join('\n'));
      repaired(
        'missing-diagnostic-log',
        rel(file),
        `created ${logPath} before the pre-flight checks so diagnostics can never be lost.`,
      );
      break;
    }
  }
}

// ── rule 5: Tauri icons must be RGBA (PNG color type 6) ──────────────────────
function rgbaFromRgb(png) {
  // PNG → chunks
  if (png.length < 8) return { error: 'not a PNG (too short)' };
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++) if (png[i] !== sig[i]) return { error: 'not a PNG' };

  const chunks = [];
  let off = 8;
  while (off + 8 <= png.length) {
    const len = png.readUInt32BE(off);
    const type = png.toString('ascii', off + 4, off + 8);
    const data = png.subarray(off + 8, off + 8 + len);
    chunks.push({ type, data });
    off += 12 + len;
  }
  const ihdr = chunks.find((c) => c.type === 'IHDR');
  if (!ihdr || ihdr.data.length < 13) return { error: 'missing IHDR' };
  const width = ihdr.data.readUInt32BE(0);
  const height = ihdr.data.readUInt32BE(4);
  const bitDepth = ihdr.data[8];
  const colorType = ihdr.data[9];
  const interlace = ihdr.data[12];
  if (colorType === 6) return { error: null, already: true };
  if (bitDepth !== 8 || interlace !== 0 || colorType !== 2) {
    return { error: `unsupported PNG (bitDepth=${bitDepth} colorType=${colorType} interlace=${interlace}) — needs a manual RGBA export` };
  }

  const idat = chunks.filter((c) => c.type === 'IDAT').map((c) => c.data);
  if (!idat.length) return { error: 'no IDAT' };
  const raw = inflateSync(Buffer.concat(idat));

  const srcBpp = 3;
  const dstBpp = 4;
  const srcStride = width * srcBpp;
  const dstStride = width * dstBpp;
  if (raw.length !== height * (srcStride + 1)) return { error: 'unexpected raw scanline size' };

  const out = Buffer.alloc(height * (dstStride + 1));
  for (let y = 0; y < height; y++) {
    const src = y * (srcStride + 1);
    const dst = y * (dstStride + 1);
    out[dst] = raw[src]; // keep the original filter byte
    for (let x = 0; x < width; x++) {
      out[dst + 1 + x * 4 + 0] = raw[src + 1 + x * 3 + 0];
      out[dst + 1 + x * 4 + 1] = raw[src + 1 + x * 3 + 1];
      out[dst + 1 + x * 4 + 2] = raw[src + 1 + x * 3 + 2];
      out[dst + 1 + x * 4 + 3] = 0xff; // opaque alpha
    }
  }

  const newIhdr = Buffer.from(ihdr.data);
  newIhdr[9] = 6;

  const build = (type, data) => {
    const chunk = Buffer.alloc(8 + data.length + 4);
    chunk.writeUInt32BE(data.length, 0);
    chunk.write(type, 4, 'ascii');
    data.copy(chunk, 8);
    chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + data.length)), 8 + data.length);
    return chunk;
  };

  const deflated = deflateSync(out, { level: 9 });
  // One IDAT keeps the encoder simple; PNG allows a single large IDAT.
  const parts = [Buffer.from(sig), build('IHDR', newIhdr), build('IDAT', deflated)];
  for (const c of chunks) {
    if (c.type === 'IHDR' || c.type === 'IDAT') continue;
    parts.push(build(c.type, c.data));
  }
  parts.push(build('IEND', Buffer.alloc(0)));
  return { error: null, buffer: Buffer.concat(parts) };
}

function ruleTauriIconsRgba() {
  const dir = join(ROOT, 'V2RayEZ-GUI/src-tauri/icons');
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.png')) continue;
    const p = join(dir, name);
    const png = readFileSync(p);
    if (png.length < 26) {
      report('tauri-icon-rgba', rel(p), 0, `${name} is not a valid PNG`);
      continue;
    }
    if (png[25] === 6) continue;
    const res = rgbaFromRgb(png);
    if (res.error) {
      report('tauri-icon-rgba', rel(p), 0, `${name}: ${res.error}`);
      continue;
    }
    if (MODE === 'check') {
      report(
        'tauri-icon-rgba',
        rel(p),
        0,
        `${name} is PNG color type ${png[25]}; Tauri's generate_context!() panics with "icon is not RGBA".`,
        { fixable: true },
      );
      continue;
    }
    writeFileSync(p, res.buffer);
    repaired('tauri-icon-rgba', rel(p), `${name} converted to RGBA (PNG color type 6).`);
  }
}

// ── rule 6: corrupted Go pseudo-versions ─────────────────────────────────────
const canonicalPseudo = /^v[0-9]+\.[0-9]+\.[0-9]+-[0-9]{14}-[0-9A-Fa-f]{12}$/;
function ruleGoPseudoVersions() {
  for (const file of walk(ROOT).filter((f) => f.endsWith('go.mod'))) {
    const lines = read(file).split('\n');
    lines.forEach((line, idx) => {
      const tokens = line.match(/\bv[0-9]+\.[0-9]+\.[0-9]+-[A-Za-z0-9-]+/g) || [];
      for (const token of tokens) {
        if (!/\bv[0-9]+\.[0-9]+\.[0-9]+-20[0-9]{6}/.test(token)) continue;
        if (canonicalPseudo.test(token)) continue;
        report(
          'go-pseudo-version',
          rel(file),
          idx + 1,
          `truncated Go pseudo-version "${token}" — Go cannot resolve it. Regenerate with "go mod tidy" on a machine with network access (never hand-edit).`,
        );
      }
    });
  }
}

// ── rule 7: workflow text hygiene ────────────────────────────────────────────
function ruleWorkflowHygiene(files) {
  for (const file of files) {
    // Only repo-owned workflow/config YAML is normalised; donor trees are
    // preserved byte-for-byte.
    if (isProtected(rel(file))) continue;
    const original = read(file);
    const hasCRLF = original.includes('\r\n');
    const lines = original.split(/\r?\n/);
    let dirty = false;
    const cleaned = lines.map((line) => {
      // Tabs inside YAML indentation are a parse error.
      if (/^\s*#[^!]*$/.test(line) === false && /^\t+/.test(line)) {
        dirty = true;
        return line.replace(/^\t+/, (m) => '  '.repeat(m.length));
      }
      if (/\s+$/.test(line)) {
        dirty = true;
        return line.replace(/\s+$/, '');
      }
      return line;
    });
    if (dirty || hasCRLF) {
      if (MODE === 'check') {
        report(
          'workflow-hygiene',
          rel(file),
          0,
          `${file.endsWith('.yml') || file.endsWith('.yaml') ? 'YAML' : 'file'} contains ${hasCRLF ? 'CRLF line endings and/or ' : ''}trailing whitespace/tab indentation.`,
          { fixable: true },
        );
      } else {
        write(file, cleaned.join(hasCRLF ? '\r\n' : '\n'));
        repaired('workflow-hygiene', rel(file), 'normalised trailing whitespace / tab indentation / line endings.');
      }
    }
  }
}

// ── rule 8: shell scripts must parse ─────────────────────────────────────────
function ruleShellSyntax() {
  const candidates = [
    ...walk(join(ROOT, 'scripts')).filter((f) => f.endsWith('.sh')),
    ...walk(join(ROOT, 'universal-core')).filter((f) => f.endsWith('.sh')),
  ];
  for (const file of candidates) {
    try {
      execFileSync('bash', ['-n', file], { stdio: 'pipe' });
    } catch (err) {
      const msg = (err.stderr ? err.stderr.toString() : String(err)).trim().split('\n').slice(0, 3).join(' | ');
      report('shell-syntax', rel(file), 0, `bash -n failed: ${msg}`);
    }
  }
}

// ── run ──────────────────────────────────────────────────────────────────────
const allFiles = walk(ROOT);
const shellFiles = allFiles.filter((f) => f.endsWith('.sh') || f.endsWith('.bash'));
const yamlFiles = allFiles.filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));

ruleXcodebuildQuotedOptions([...shellFiles, ...yamlFiles]);
ruleFabricatedIpaExecutable(shellFiles);
ruleHardcodedXcodeproj([...shellFiles, ...yamlFiles]);
ruleMissingDiagLog(yamlFiles);
ruleTauriIconsRgba();
ruleGoPseudoVersions();
ruleWorkflowHygiene(yamlFiles);
ruleShellSyntax();

// ── output ───────────────────────────────────────────────────────────────────
if (JSON_OUT) {
  console.log(JSON.stringify({ mode: MODE, findings, fixes }, null, 2));
} else {
  if (fixes.length) {
    console.log('auto-fix: repairs applied');
    for (const f of fixes) console.log(`  FIX   [${f.rule}] ${f.file}: ${f.message}`);
  }
  if (findings.length) {
    console.log(`auto-fix: ${findings.length} finding(s) (${blocking().length} blocking)`);
    for (const f of findings) {
      const tag = f.severity === 'info' ? 'INFO   ' : f.fixable ? 'FIXABLE' : 'MANUAL ';
      console.log(`  ${tag} [${f.rule}] ${f.file}${f.line ? `:${f.line}` : ''}: ${f.message}`);
    }
  }
  if (!findings.length && !fixes.length) {
    console.log('auto-fix: PASS — no known defects found.');
  }
}

if (MODE === 'check') {
  process.exit(blocking().length ? 1 : 0);
}
process.exit(0);
