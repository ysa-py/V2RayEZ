#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const extensionsRoot = resolve(__dirname, "..");
const target = process.argv[2];

if (!["chrome", "firefox"].includes(target)) {
  throw new Error("Usage: node ../scripts/build-extension.mjs <chrome|firefox>");
}

const extensionDir = resolve(extensionsRoot, target);
const distDir = resolve(extensionDir, "dist");
const sourceOutDir = resolve(distDir, target);
const sharedOutDir = resolve(distDir, "shared");
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

rmSync(distDir, { recursive: true, force: true });
execFileSync(npx, ["tsc", "--noEmit", "false"], { cwd: extensionDir, stdio: "inherit" });
patchRelativeImports(distDir);

const manifest = JSON.parse(readFileSync(resolve(extensionDir, "manifest.json"), "utf8"));
const hasRootPopup = existsSync(resolve(extensionDir, "popup.html"));
const defaultPopup = hasRootPopup ? "popup.html" : "popup/popup.html";
manifest.name = target === "chrome" ? "V2RayEZ Universal" : "V2RayEZ Universal";
manifest.short_name = "V2RayEZ";
manifest.version = "2.0.0";
manifest.description = "V2RayEZ Universal browser extension with proxy control, DoH, WebRTC relay, and traffic obfuscation fallback.";

if (manifest.action) {
  manifest.action.default_title = "V2RayEZ";
  manifest.action.default_popup = defaultPopup;
}
if (manifest.browser_action) {
  manifest.browser_action.default_title = "V2RayEZ";
  manifest.browser_action.default_popup = defaultPopup;
}
manifest.options_ui = { page: "options/options.html", open_in_tab: true };

if (target === "chrome") {
  manifest.background = { service_worker: "chrome/background.js", type: "module" };
} else {
  manifest.background = { scripts: ["firefox/background.js"], persistent: true };
  manifest.browser_specific_settings = {
    gecko: {
      id: "v2rayez@ysa-py.github.io",
      strict_min_version: "112.0",
    },
  };
  delete manifest.applications;
}

writeFileSync(resolve(distDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

copyIfExists(resolve(extensionDir, "popup.html"), resolve(distDir, "popup.html"));
copyIfExists(resolve(sourceOutDir, "popup.js"), resolve(distDir, "popup.js"));
copyStaticDir(resolve(extensionDir, "popup"), resolve(distDir, "popup"));
copyIfExists(resolve(sourceOutDir, "popup", "popup.js"), resolve(distDir, "popup", "popup.js"));
copyStaticDir(resolve(extensionDir, "options"), resolve(distDir, "options"));
copyIfExists(resolve(sourceOutDir, "options", "options.js"), resolve(distDir, "options", "options.js"));
copyStaticDir(resolve(extensionDir, "icons"), resolve(distDir, "icons"));

if (!existsSync(sharedOutDir)) {
  throw new Error("Compiled shared extension modules are missing from dist/shared.");
}

stageWasmPlaceholderOrArtifact();
assertRequiredFiles();
console.log(`Built V2RayEZ ${target} extension package at ${distDir}`);

function patchRelativeImports(root) {
  for (const entry of readdirSync(root)) {
    const path = resolve(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      patchRelativeImports(path);
      continue;
    }
    if (!path.endsWith(".js")) continue;
    let text = readFileSync(path, "utf8");
    text = text.replace(/(from\s+["'])(\.\.?\/[^"']+)(["'])/g, addJsExtension);
    text = text.replace(/(import\s*\(\s*["'])(\.\.?\/[^"']+)(["']\s*\))/g, addJsExtension);
    writeFileSync(path, text);
  }
}

function addJsExtension(match, prefix, specifier, suffix) {
  if (extname(specifier) || specifier.endsWith("/")) return match;
  return `${prefix}${specifier}.js${suffix}`;
}

function copyIfExists(from, to) {
  if (!existsSync(from)) return;
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
}

function copyStaticDir(from, to) {
  if (!existsSync(from)) return;
  mkdirSync(to, { recursive: true });
  cpSync(from, to, {
    recursive: true,
    filter: (source) => !source.endsWith(".ts") && !source.endsWith(".map"),
  });
}

function stageWasmPlaceholderOrArtifact() {
  const wasmDir = resolve(distDir, "wasm");
  mkdirSync(wasmDir, { recursive: true });
  const wasmDestination = resolve(wasmDir, "obfuscator.wasm");
  const wasmCandidates = [
    resolve(extensionDir, "wasm", "obfuscator.wasm"),
    resolve(extensionsRoot, "wasm-obfuscator", "pkg", "obfuscator_bg.wasm"),
    resolve(extensionsRoot, "wasm-obfuscator", "pkg", "obfuscator.wasm"),
  ];
  const wasmSource = wasmCandidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
  if (wasmSource) {
    copyFileSync(wasmSource, wasmDestination);
    console.log(`Bundled WASM obfuscator from ${wasmSource}`);
    return;
  }

  if (process.env.V2RAYEZ_ALLOW_EMPTY_EXTENSION_WASM === "1") {
    // Development-only fallback: a valid empty WebAssembly module lets UI/runtime
    // fallback paths be exercised locally, but release artifact builds do not set
    // this variable and therefore fail closed instead of packaging a placeholder.
    writeFileSync(wasmDestination, Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]));
    console.warn("Development-only empty WASM fallback packaged because V2RAYEZ_ALLOW_EMPTY_EXTENSION_WASM=1.");
    return;
  }

  throw new Error(
    "Real WASM obfuscator artifact is missing. Build MICAFP/extensions/wasm-obfuscator first, " +
    "or set V2RAYEZ_ALLOW_EMPTY_EXTENSION_WASM=1 only for local development fallback tests.",
  );
}

function assertRequiredFiles() {
  const popupFiles = hasRootPopup
    ? [resolve(distDir, "popup.html"), resolve(distDir, "popup.js")]
    : [resolve(distDir, "popup", "popup.html"), resolve(distDir, "popup", "popup.js")];
  const required = [
    resolve(distDir, "manifest.json"),
    ...popupFiles,
    resolve(distDir, "options", "options.html"),
    resolve(distDir, "options", "options.js"),
    resolve(distDir, "icons", "icon16.png"),
    resolve(distDir, "icons", "icon48.png"),
    resolve(distDir, "icons", "icon128.png"),
    resolve(distDir, "wasm", "obfuscator.wasm"),
    target === "chrome" ? resolve(distDir, "chrome", "background.js") : resolve(distDir, "firefox", "background.js"),
  ];
  const missing = required.filter((path) => !existsSync(path));
  if (missing.length > 0) {
    throw new Error(`Extension build is incomplete; missing:\n${missing.join("\n")}`);
  }
}
