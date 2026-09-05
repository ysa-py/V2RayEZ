#!/usr/bin/env node
// Fetch + verify the two Tauri sidecars required by `prepare-sidecar.mjs`.
//
// This is the cross-platform replacement for the Windows-only PowerShell
// fetchers. It runs inside the Phase 3 desktop build on Linux, macOS and
// Windows after `npm ci` (so `extract-zip` and `tar` are available).
//
// Provenance policy (zero fabrication):
//   * Aether: the archive digest is verified against the upstream
//     `SHA256SUMS.txt` published in the same GitHub release. A mismatch fails.
//   * sing-box: upstream does not publish a checksum asset. The digest is
//     computed from the actual downloaded release artifact and recorded in
//     `sidecar-digests.json` (clearly labelled "computed; not upstream pinned").
//     The pre-existing Windows PowerShell fetcher has a pinned digest that we
//     keep as a bootstrap verify source where present.
//
// Output:
//   * `<repo>/V2RayEZ-GUI/src-tauri/binaries/<stem>-<targetTriple><ext>`
//     (the exact file names Tauri `externalBin` + `prepare-sidecar` expect)
//   * `<repo>/V2RayEZ-GUI/sidecar-digests.json` (real computed digests)

import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
// eslint-disable-next-line n/no-missing-import
import extractZip from "extract-zip";
import * as tar from "tar";

const AE_VERSION = process.env.AETHER_CORE_VERSION || "v1.7.0";
const SB_VERSION = process.env.SING_BOX_VERSION || "1.13.14";

const AE_BASE = `https://github.com/CluvexStudio/Aether/releases/download/${AE_VERSION}`;
const SB_BASE = `https://github.com/SagerNet/sing-box/releases/download/v${SB_VERSION}`;
const AE_SUMS_URL = `${AE_BASE}/SHA256SUMS.txt`;

const platform = process.env.TAURI_ENV_PLATFORM || process.platform;
const arch = process.env.TAURI_ENV_ARCH || process.arch;
const targetTriple =
  process.env.TAURI_ENV_TARGET_TRIPLE ||
  process.env.TARGET ||
  process.env.npm_config_target ||
  defaultTriple(platform, arch);
const isWindows = targetTriple.includes("windows") || platform === "win32";
const ext = isWindows ? ".exe" : "";

const binariesDir = resolve("src-tauri/binaries");
mkdirSync(binariesDir, { recursive: true });

const sidecars = [
  {
    stem: "aether",
    label: "Aether core",
    env: "AETHER_CORE_BINARY",
    archiveName: aetherArchive(targetTriple),
    baseUrl: AE_BASE,
    sumsUrl: AE_SUMS_URL,
    version: AE_VERSION,
    pinnedSha256: null,
  },
  {
    stem: "sing-box",
    label: "sing-box routing engine",
    env: "SING_BOX_BINARY",
    archiveName: singBoxArchive(targetTriple),
    baseUrl: SB_BASE,
    sumsUrl: null,
    version: SB_VERSION,
    // Pin present in the legacy Windows-only PowerShell fetcher. Kept as an
    // extra verification for the Windows build; other targets are computed.
    pinnedSha256: targetTriple.includes("x86_64-pc-windows") ? "f580782c6dd10f7691c66cea1d7c421813c5fbf7e305d1ee7ce0c3a40d196341" : null,
  },
];

const digests = {
  targetTriple,
  generatedAt: new Date().toISOString(),
  aetherVersion: AE_VERSION,
  singBoxVersion: SB_VERSION,
  entries: {},
};

async function main() {
  for (const sidecar of sidecars) {
    if (process.env[sidecar.env]) {
      const src = resolve(process.env[sidecar.env]);
      if (!existsSync(src)) {
        throw new Error(`${sidecar.label}: ${sidecar.env} points to ${src} which does not exist`);
      }
      const dest = join(binariesDir, `${sidecar.stem}-${targetTriple}${ext}`);
      mkdirSync(dirname(dest), { recursive: true });
      const { copyFileSync } = await import("node:fs");
      copyFileSync(src, dest);
      digests.entries[sidecar.stem] = {
        status: "env_override",
        targetTriple,
        source: process.env[sidecar.env],
      };
      console.log(`${sidecar.label}: using env override ${src}`);
      continue;
    }

    const dest = join(binariesDir, `${sidecar.stem}-${targetTriple}${ext}`);
    if (existsSync(dest) && !process.env.FORCE_SIDECAR_FETCH) {
      console.log(`${sidecar.label}: bundled already at ${dest}`);
      digests.entries[sidecar.stem] = { status: "present", targetTriple };
      continue;
    }

    const archive = await download(`${sidecar.baseUrl}/${sidecar.archiveName}`);
    const sha256 = await sha256File(archive);
    const archiveBase = basename(sidecar.archiveName);

    if (sidecar.sumsUrl) {
      const expected = await fetchExpectedSha256(sidecar.sumsUrl, archiveBase, sidecar.version);
      if (sha256 !== expected) {
        await discardFile(archive);
        throw new Error(
          `${sidecar.label}: checksum mismatch for ${archiveBase}. ` +
            `expected ${expected}, got ${sha256}`,
        );
      }
      digests.entries[sidecar.stem] = {
        status: "verified",
        version: sidecar.version,
        archive: archiveBase,
        sha256,
        source: "upstream SHA256SUMS.txt",
      };
      console.log(`${sidecar.label}: verified ${archiveBase} sha256=${sha256}`);
    } else {
      if (sidecar.pinnedSha256 && sha256 !== sidecar.pinnedSha256.toLowerCase()) {
        await discardFile(archive);
        throw new Error(
          `${sidecar.label}: checksum mismatch for ${archiveBase}. ` +
            `expected ${sidecar.pinnedSha256}, got ${sha256}`,
        );
      }
      digests.entries[sidecar.stem] = {
        status: "computed",
        version: sidecar.version,
        archive: archiveBase,
        sha256,
        source: "computed from upstream asset; not upstream-pinned",
      };
      console.log(`${sidecar.label}: downloaded ${archiveBase} sha256=${sha256} (computed, not upstream pinned)`);
    }

    const extracted = await extractSidecar(sidecar.stem, archive, isWindows);
    const destDir = dirname(dest);
    mkdirSync(destDir, { recursive: true });
    const { copyFileSync } = await import("node:fs");
    copyFileSync(extracted, dest);
    console.log(`${sidecar.label}: installed ${dest}`);
  }

  writeFileSync(resolve("sidecar-digests.json"), JSON.stringify(digests, null, 2) + "\n", "utf8");
  console.log(`Wrote sidecar-digests.json for ${targetTriple}`);
}

async function download(url) {
  const tmp = join(tmpdir(), `vor-sidecar-${basename(url)}`);
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "user-agent": "Vor-Phase3-Sidecar-Fetcher/1.0" },
  });
  if (!res.ok) {
    throw new Error(`download failed for ${url}: HTTP ${res.status}`);
  }
  await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp));
  return tmp;
}

async function sha256File(path) {
  const { createReadStream } = await import("node:fs");
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

async function discardFile(path) {
  const { rm } = await import("node:fs/promises");
  await rm(path, { force: true });
}

async function fetchExpectedSha256(sumsUrl, archiveBase, version) {
  const res = await fetch(sumsUrl, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`failed to fetch ${sumsUrl}: HTTP ${res.status}`);
  }
  const text = await res.text();
  const line = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.includes(archiveBase));
  if (!line) {
    throw new Error(`no checksum line for ${archiveBase} in Aether ${version} SHA256SUMS.txt`);
  }
  const expected = line.split(/\s+/)[0].toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expected)) {
    throw new Error(`invalid checksum value for ${archiveBase}: ${expected}`);
  }
  return expected;
}

async function extractSidecar(stem, archive, windows) {
  const destDir = join(tmpdir(), `vor-sidecar-${stem}-${Date.now()}`);
  mkdirSync(destDir, { recursive: true });
  const lower = archive.toLowerCase();
  if (lower.endsWith(".zip")) {
    await extractZip(archive, { dir: destDir });
  } else if (lower.endsWith(".tar.gz") || lower.endsWith(".tgz")) {
    await tar.x({ file: archive, cwd: destDir });
  } else {
    throw new Error(`unsupported archive type: ${archive}`);
  }
  const names = windows ? [stem, `${stem}.exe`] : [stem];
  const found = findBinary(destDir, names);
  if (!found) {
    throw new Error(`could not find ${names.join("/")} inside ${basename(archive)}`);
  }
  return found;
}

function findBinary(dir, names) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findBinary(full, names);
      if (found) return found;
    } else if (entry.isFile() && names.includes(entry.name)) {
      return full;
    }
  }
  return null;
}

function aetherArchive(triple) {
  if (triple.includes("x86_64-pc-windows")) return "aether-windows-x86_64.zip";
  if (triple.includes("aarch64-apple-darwin")) return "aether-macos-arm64.tar.gz";
  if (triple.includes("x86_64-apple-darwin")) return "aether-macos-x86_64.tar.gz";
  if (triple.includes("x86_64-unknown-linux")) return "aether-linux-x86_64.tar.gz";
  if (triple.includes("aarch64-unknown-linux")) return "aether-linux-aarch64.tar.gz";
  throw new Error(`no Aether archive mapping for ${triple}`);
}

function singBoxArchive(triple) {
  if (triple.includes("x86_64-pc-windows")) return `sing-box-${SB_VERSION}-windows-amd64.zip`;
  if (triple.includes("aarch64-apple-darwin")) return `sing-box-${SB_VERSION}-darwin-arm64.tar.gz`;
  if (triple.includes("x86_64-apple-darwin")) return `sing-box-${SB_VERSION}-darwin-amd64.tar.gz`;
  if (triple.includes("x86_64-unknown-linux")) return `sing-box-${SB_VERSION}-linux-amd64.tar.gz`;
  if (triple.includes("aarch64-unknown-linux")) return `sing-box-${SB_VERSION}-linux-arm64.tar.gz`;
  throw new Error(`no sing-box archive mapping for ${triple}`);
}

function defaultTriple(platformName, archName) {
  const normalizedArch = normalizeArch(archName);
  switch (platformName) {
    case "win32":
    case "windows":
      return `${normalizedArch}-pc-windows-msvc`;
    case "darwin":
    case "macos":
      return `${normalizedArch}-apple-darwin`;
    case "linux":
      return `${normalizedArch}-unknown-linux-gnu`;
    default:
      throw new Error(`Cannot infer a Tauri sidecar target triple for platform=${platformName} arch=${archName}.`);
  }
}

function normalizeArch(archName) {
  switch (archName) {
    case "x64":
    case "amd64":
    case "x86_64":
      return "x86_64";
    case "arm64":
    case "aarch64":
      return "aarch64";
    default:
      return archName;
  }
}

main().catch((err) => {
  console.error(`fetch-sidecars failed: ${err.message}`);
  process.exit(1);
});
