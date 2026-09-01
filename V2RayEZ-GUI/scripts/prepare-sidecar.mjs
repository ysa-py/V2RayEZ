import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";

const platform = process.env.TAURI_ENV_PLATFORM || process.platform;
const arch = process.env.TAURI_ENV_ARCH || process.arch;
const targetTriple =
  process.env.TAURI_ENV_TARGET_TRIPLE ||
  process.env.TARGET ||
  process.env.npm_config_target ||
  defaultTriple(platform, arch);
const extension = targetTriple.includes("windows") || platform === "win32" ? ".exe" : "";
const binariesDir = resolve("src-tauri/binaries");

const sidecars = [
  {
    name: "Aether core",
    stem: "aether",
    env: "AETHER_CORE_BINARY",
    vendorNames: ["aether", "aether.exe"],
  },
  {
    name: "sing-box routing engine",
    stem: "sing-box",
    env: "SING_BOX_BINARY",
    vendorNames: ["sing-box", "sing-box.exe"],
  },
];

mkdirSync(binariesDir, { recursive: true });

for (const sidecar of sidecars) {
  const destination = resolve(binariesDir, `${sidecar.stem}-${targetTriple}${extension}`);
  if (existsSync(destination) && !process.env[sidecar.env]) {
    console.log(`Using bundled ${sidecar.name} at ${destination}`);
    continue;
  }

  const candidates = [
    process.env[sidecar.env],
    ...sidecar.vendorNames.map((name) => resolve("vendor", name)),
    resolve(binariesDir, `${sidecar.stem}-${targetTriple}${extension}`),
  ].filter(Boolean);

  const source = candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
  if (!source) {
    throw new Error(
      `${sidecar.name} is missing for target ${targetTriple}. ` +
        `Set ${sidecar.env}, place ${sidecar.vendorNames.join("/")} under V2RayEZ-GUI/vendor, ` +
        "or run the platform fetch script before `npm run build`."
    );
  }

  if (resolve(source) !== destination) {
    copyFileSync(source, destination);
  }
  console.log(`Bundling ${sidecar.name} from ${basename(source)} as ${basename(destination)}`);
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
      throw new Error(
        `Cannot infer a Tauri sidecar target triple for platform=${platformName} arch=${archName}. ` +
          "Set TAURI_ENV_TARGET_TRIPLE or TARGET."
      );
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
