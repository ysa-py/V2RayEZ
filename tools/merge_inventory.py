#!/usr/bin/env python3
"""Generate a repeatable Milestone-0 inventory for the V2RayEZ Universal merge.

The tool intentionally performs filesystem-based discovery only. It does not mark a
feature as implemented in the unified product; it records that the donor source is
present, which source files prove that feature exists, and which target component is
planned for the merge.
"""
from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable

REPO_ROOT = Path(__file__).resolve().parents[1]

SOURCES = {
    "V2RayEZ base": "V2RayEZ – The core application supports Android, iOS, Windows, Linux, and OpenWrt LuCI (must be the universal version)",
    "V2RayEZ GUI / Aether adapter": "V2RayEZ-GUI",
    "EasySNI": "EasySNI- Make sure to fully add all features to the V2RayEZ app",
    "MICAFP-UnifiedShield": "MICAFP",
    "MSN-GUARD": "MSN-GUARD- Make sure to fully add all features to the V2RayEZ app",
    "UAC-SNI-Spoofer Android": "UAC-SNI-Spoofer-Android- Make sure to fully add all features to the V2RayEZ app",
    "UAC-SNI-Spoofer Windows": "UAC-SNI-Spoofer-Windows- Make sure to fully add all features to the V2RayEZ app",
    "MasterDnsVPN": "MasterDnsVPN-main",
}

@dataclass(frozen=True)
class FeatureProbe:
    feature: str
    source: str
    source_paths: list[str]
    target_component: str
    target_platforms: list[str]
    status: str = "preserved"


def rel(path: Path) -> str:
    return str(path.relative_to(REPO_ROOT))


def file_count(root: Path) -> int:
    if not root.exists():
        return 0
    skipped = {".git", "__pycache__", "node_modules", "build", "dist", "target", ".gradle"}
    count = 0
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in skipped]
        count += len(filenames)
    return count


def existing(paths: Iterable[str]) -> list[str]:
    out: list[str] = []
    for raw in paths:
        p = REPO_ROOT / raw
        if p.exists():
            out.append(raw)
    return out


def source_summary() -> dict[str, dict[str, object]]:
    summary: dict[str, dict[str, object]] = {}
    for name, dirname in SOURCES.items():
        root = REPO_ROOT / dirname
        top_dirs = []
        if root.exists():
            top_dirs = sorted(p.name for p in root.iterdir() if p.is_dir())[:80]
        summary[name] = {
            "path": dirname,
            "exists": root.exists(),
            "file_count": file_count(root),
            "top_level_dirs": top_dirs,
        }
    return summary


def feature_probes() -> list[FeatureProbe]:
    base = SOURCES["V2RayEZ base"]
    aether = SOURCES["V2RayEZ GUI / Aether adapter"]
    easy = SOURCES["EasySNI"]
    micafp = SOURCES["MICAFP-UnifiedShield"]
    msn = SOURCES["MSN-GUARD"]
    uaca = SOURCES["UAC-SNI-Spoofer Android"]
    uacw = SOURCES["UAC-SNI-Spoofer Windows"]
    dns = SOURCES["MasterDnsVPN"]

    probes = [
        FeatureProbe("Base Android Compose app, Room/DataStore, app shell", "V2RayEZ base", existing([f"{base}/app/src/main/java/com/v2rayez/app", f"{base}/app/build.gradle.kts"]), "apps/android", ["Android"]),
        FeatureProbe("Base Xray config import/export and protocol builder", "V2RayEZ base", existing([f"{base}/app/src/main/java/com/v2rayez/app/data/parser/ProxyParser.kt", f"{base}/app/src/main/java/com/v2rayez/app/data/core/ConfigBuilder.kt", f"{base}/app/libs/libv2ray.aar"]), "universal-core/config + apps/android", ["Android", "Windows", "Linux", "iOS", "OpenWrt"]),
        FeatureProbe("Base MITM/domain fronting/browser/tools", "V2RayEZ base", existing([f"{base}/app/src/main/java/com/v2rayez/app/data/mitm", f"{base}/app/src/main/java/com/v2rayez/app/data/fronting", f"{base}/app/src/main/java/com/v2rayez/app/ui/screens/browser", f"{base}/app/src/main/java/com/v2rayez/app/ui/screens/tools"]), "universal-core/fronting + apps/* tools UI", ["Android", "Windows", "Linux"]),
        FeatureProbe("Base Tor/PT/Core Manager/addon packs", "V2RayEZ base", existing([f"{base}/app/src/main/java/com/v2rayez/app/data/core/AddonPackManager.kt", f"{base}/app/src/main/java/com/v2rayez/app/data/tor", f"{base}/scripts/addon-vendor-sources.json"]), "universal-core/core-manager", ["Android", "Windows", "Linux", "OpenWrt"]),
        FeatureProbe("Localization parity QA gate", "V2RayEZ base", existing([f"{base}/scripts/gates/string-key-parity.sh", f"{base}/app/src/main/res/values/strings.xml", f"{base}/app/src/main/res/values-fa/strings.xml", f"{base}/app/src/main/res/values-ru/strings.xml"]), ".github/workflows + scripts/gates", ["Android", "Windows", "Linux", "iOS", "OpenWrt"]),
        FeatureProbe("V2RayEZ GUI Aether v1.7.0 engine and Tauri Windows integration", "V2RayEZ GUI / Aether adapter", existing([f"{aether}/src-tauri", f"{aether}/src-tauri/src/settings.rs", f"{aether}/src-tauri/src/routing.rs", f"{aether}/README.md"]), "universal-core/engines/aether + apps/desktop-tauri", ["Windows", "Android"]),
        FeatureProbe("V2RayEZ signed update flow", "V2RayEZ GUI / Aether adapter", existing([f"{aether}/src-tauri/src/update.rs", f"{aether}/android/app/src/main/java/app/v2rayez/gui/AppUpdateManager.java", f"{aether}/android/app/src/main/java/app/v2rayez/gui/UpdateWorker.java"]), "universal-core/ota + apps/* settings", ["Android", "Windows"]),
        FeatureProbe("EasySNI local web panel and API", "EasySNI", existing([f"{easy}/main.go", f"{easy}/internal/server", f"{easy}/internal/server/web/index.html"]), "tools/easysni-sidecar + universal-core/tools API", ["Windows", "Linux", "macOS"]),
        FeatureProbe("EasySNI MITM/domain-fronting and SNI/desync modules", "EasySNI", existing([f"{easy}/internal/mitmdf", f"{easy}/internal/sni", f"{easy}/internal/desync", f"{easy}/internal/gtunnel"]), "universal-core/fronting + universal-core/obfuscation", ["Android", "Windows", "Linux", "OpenWrt"]),
        FeatureProbe("EasySNI BPB/EdgeTunnel/SPlus compatibility", "EasySNI", existing([f"{easy}/internal/bpb", f"{easy}/internal/edgetunnel", f"{easy}/internal/splus"]), "universal-core/deployers + apps/* tools UI", ["Android", "Windows", "Linux"]),
        FeatureProbe("MICAFP Rust daemon full module tree", "MICAFP-UnifiedShield", existing([f"{micafp}/daemon/src/lib.rs", f"{micafp}/daemon/src/transport", f"{micafp}/daemon/src/ai", f"{micafp}/daemon/src/national_intranet", f"{micafp}/daemon/src/quantum"]), "universal-core", ["Android", "iOS", "Windows", "Linux", "OpenWrt"]),
        FeatureProbe("MICAFP named VPN cores", "MICAFP-UnifiedShield", existing([f"{micafp}/daemon/src/cores", f"{micafp}/README.md"]), "universal-core/engines", ["Android", "iOS", "Windows", "Linux", "OpenWrt"]),
        FeatureProbe("MICAFP data-driven configs", "MICAFP-UnifiedShield", existing([f"{micafp}/configs/cdn-endpoints.json", f"{micafp}/configs/cloudflare-workers-urls.json", f"{micafp}/configs/dpi-signatures.json", f"{micafp}/configs/isp-profiles.json", f"{micafp}/configs/p2p-bootstrap-peers.json", f"{micafp}/configs/pluggable-transports.json"]), "universal-core/resources/configs", ["Android", "iOS", "Windows", "Linux", "OpenWrt", "Browser"]),
        FeatureProbe("MICAFP dashboard/control plane", "MICAFP-UnifiedShield", existing([f"{micafp}/dashboard/src/app/api", f"{micafp}/dashboard/prisma/schema.prisma", f"{micafp}/dashboard/package.json"]), "dashboard", ["Server/Web"]),
        FeatureProbe("MICAFP browser extensions and WASM obfuscator", "MICAFP-UnifiedShield", existing([f"{micafp}/extensions/chrome", f"{micafp}/extensions/firefox", f"{micafp}/extensions/shared", f"{micafp}/extensions/wasm-obfuscator"]), "extensions", ["Chrome", "Firefox"]),
        FeatureProbe("MICAFP iOS/Linux/OpenWrt platform layers", "MICAFP-UnifiedShield", existing([f"{micafp}/ios", f"{micafp}/linux", f"{micafp}/openwrt"]), "apps/ios + packages/linux + packages/openwrt", ["iOS", "Linux", "OpenWrt"]),
        FeatureProbe("MICAFP AI model training pipeline", "MICAFP-UnifiedShield", existing([f"{micafp}/ai-models/train/dataset_collector.py", f"{micafp}/ai-models/train/adversarial_traffic_gan.py", f"{micafp}/ai-models/quantize/validate_onnx.py"]), "ai-models", ["Developer/CI", "On-device model supply"]),
        FeatureProbe("MSN-GUARD Aether Android VPN + JNI/TUN", "MSN-GUARD", existing([f"{msn}/core/aether/src", f"{msn}/app/src/main/cpp/aether_jni.cpp", f"{msn}/app/src/main/java/com/msnguard/vpn"]), "universal-core/engines/aether + apps/android", ["Android"]),
        FeatureProbe("MSN-GUARD MASQUE/WireGuard/WARP/Psiphon/Tor", "MSN-GUARD", existing([f"{msn}/core/aether/src/masque.rs", f"{msn}/core/aether/src/wireguard.rs", f"{msn}/core/aether/src/warp.rs", f"{msn}/core/aether/src/psiphon.rs", f"{msn}/core/aether/src/tor.rs"]), "universal-core/transports + engines/aether", ["Android", "Windows", "Linux", "iOS"]),
        FeatureProbe("UAC Android adaptive connection and route speed test", "UAC-SNI-Spoofer Android", existing([f"{uaca}/app/src/main/java/com/uacspoofer/mobile/vpn/AdaptiveConnection.kt", f"{uaca}/app/src/main/java/com/uacspoofer/mobile/ui/RouteSpeedTestController.kt", f"{uaca}/app/src/main/java/com/uacspoofer/mobile/ui/RouteSpeedTestScreen.kt"]), "universal-core/adaptive-routing + apps/android", ["Android", "Windows", "Linux"]),
        FeatureProbe("UAC Android exact profile parsing/fidelity", "UAC-SNI-Spoofer Android", existing([f"{uaca}/app/src/main/java/com/uacspoofer/mobile/profiles/ProfileUriParser.kt", f"{uaca}/app/src/main/java/com/uacspoofer/mobile/profiles/SubscriptionConfigParser.kt", f"{uaca}/app/src/main/java/com/uacspoofer/mobile/mci/MciXrayConfigBuilder.kt"]), "universal-core/config", ["Android", "Windows", "Linux", "iOS", "OpenWrt"]),
        FeatureProbe("UAC Android Tor/WebTunnel subsystem", "UAC-SNI-Spoofer Android", existing([f"{uaca}/app/src/main/java/com/uacspoofer/mobile/engine/tor", f"{uaca}/app/src/main/assets/tor/bridges-webtunnel.txt"]), "universal-core/transports/tor + apps/android", ["Android"]),
        FeatureProbe("UAC Windows Python desktop modules and Patterniha/Npcap", "UAC-SNI-Spoofer Windows", existing([f"{uacw}/uac_desktop/engine.py", f"{uacw}/uac_desktop/npcap.py", f"{uacw}/uac_desktop/pattern_core", f"{uacw}/UAC-Spoofer-Desktop.spec"]), "apps/windows/python-tools + universal-core/adaptive-routing", ["Windows"]),
        FeatureProbe("UAC Windows wizard assistant", "UAC-SNI-Spoofer Windows", existing([f"{uacw}/uac_desktop/assistant.py", f"{uacw}/uac_desktop/assistant_messages.py", f"{uacw}/wizard guider"]), "apps/windows/assistant + apps/* guide surfaces", ["Windows", "Android"]),
        FeatureProbe("MasterDnsVPN DNS tunnel client/server", "MasterDnsVPN", existing([f"{dns}/cmd/client/main.go", f"{dns}/cmd/server/main.go", f"{dns}/internal/client", f"{dns}/internal/udpserver"]), "universal-core/transports/dns-tunnel + server/dns-tunnel", ["Android", "iOS", "Windows", "Linux", "OpenWrt"]),
        FeatureProbe("MasterDnsVPN ARQ/multipath/balancer/security/compression", "MasterDnsVPN", existing([f"{dns}/internal/arq", f"{dns}/internal/client/balancer.go", f"{dns}/internal/security", f"{dns}/internal/compression", f"{dns}/internal/vpnproto"]), "universal-core/transports/dns-tunnel", ["Android", "iOS", "Windows", "Linux", "OpenWrt"]),
        FeatureProbe("MasterDnsVPN server installer/Docker/docs", "MasterDnsVPN", existing([f"{dns}/server_linux_install.sh", f"{dns}/docker", f"{dns}/README.MD", f"{dns}/server_config.toml.simple", f"{dns}/client_config.toml.simple"]), "server/dns-tunnel + docs", ["Linux", "OpenWrt", "Server"]),
    ]
    return probes


def main() -> None:
    report = {
        "generated_by": "tools/merge_inventory.py",
        "source_summary": source_summary(),
        "feature_probes": [asdict(p) for p in feature_probes()],
    }
    out = REPO_ROOT / "MERGE_INVENTORY.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {rel(out)}")
    print(f"Sources: {len(SOURCES)}")
    print(f"Feature probes: {len(report['feature_probes'])}")


if __name__ == "__main__":
    main()
