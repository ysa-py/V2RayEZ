#!/usr/bin/env python3
"""
apk_structural_validate.py — "magnifying glass" structural validator for APKs.

Purpose
-------
Checks that an Android APK produced by the V2RayEZ pipeline is genuinely a valid,
installable ZIP-based APK and is NOT a malformed "fallback" that causes:

    java.io.IOException: Archive is not a ZIP archive

or MIUI / Play Protect installation warnings caused by:

    * plain-text AndroidManifest.xml (must be binary AXML),
    * dummy/plain-text native libraries (must be real ELF .so),
    * a non-ZIP container,
    * missing classes.dex / resources.arsc.

It never modifies the APK. It only inspects and reports. Exit code 0 => PASS,
1 => FAIL (structural problem found).

Usage
-----
    python3 tools/apk_structural_validate.py path/to/app.apk [--verbose] [--json]
"""

from __future__ import annotations

import json
import os
import struct
import sys
import zipfile

APK_ABIS = ("arm64-v8a", "armeabi-v7a", "x86_64", "x86")
ELF_MAGIC = b"\x7fELF"
RES_XML_TYPE = b"\x03\x00\x08\x00"  # Android binary XML chunk header (type=RES_XML_TYPE)
# resources.arsc (AXML) chunk type RES_TABLE_TYPE = 0x0002, headerSize 0x000C
RES_TABLE_MAGIC = b"\x02\x00\x0c\x00"
ZIP_LOCAL_HEADER = b"PK\x03\x04"


def _read(path: str) -> zipfile.ZipFile:
    try:
        return zipfile.ZipFile(path)
    except zipfile.BadZipFile as exc:  # noqa: PERF203
        raise SystemExit(
            f"[FAIL] '{path}' is NOT a valid ZIP archive -> "
            f"java.io.IOException: Archive is not a ZIP archive. ({exc})"
        )


def _magic(path: str) -> bytes:
    with open(path, "rb") as fh:
        return fh.read(8)


def _looks_elf(data: bytes) -> bool:
    return data[:4] == ELF_MAGIC


def _compression_name(method: int) -> str:
    return {0: "STORED", 8: "DEFLATED"}.get(method, f"method_{method}")


def validate_apk(path: str, verbose: bool = False) -> int:
    problems: list[str] = []
    info: dict = {}

    if not os.path.isfile(path):
        print(f"[FAIL] No such file: {path}")
        return 1

    size = os.path.getsize(path)
    magic = _magic(path)
    info["path"] = path
    info["size_bytes"] = size
    info["zip_magic"] = magic.hex()

    # 1) Container must be a ZIP.
    if not magic.startswith(ZIP_LOCAL_HEADER):
        problems.append(
            f"Bad container magic {magic.hex()!r} (expected 'PK\\x03\\x04'). "
            "The installer will reject this with 'Archive is not a ZIP archive'."
        )
        print(f"[FAIL] {path} is not a ZIP: magic={magic.hex()!r}")
        return 1

    with zipfile.ZipFile(path) as z:
        names = z.namelist()
        info["entry_count"] = len(names)
        info["entries"] = sorted(names)

        has_manifest = "AndroidManifest.xml" in names
        has_arsc = "resources.arsc" in names
        has_dex = any(n.endswith(".dex") for n in names)
        info["has_manifest"] = has_manifest
        info["has_arsc"] = has_arsc
        info["has_dex"] = has_dex

        # 2) Binary AndroidManifest.xml must exist and be binary AXML (text is invalid).
        if not has_manifest:
            problems.append("Missing AndroidManifest.xml")
        else:
            raw = z.read("AndroidManifest.xml")
            if raw.startswith(b"<?xml"):
                problems.append(
                    "AndroidManifest.xml is PLAIN TEXT (not binary AXML). "
                    "This is the exact cause of 'Archive is not a ZIP archive'. "
                    "The APK must be built with aapt/aapt2 (binary manifest)."
                )
            elif raw[:4] != RES_XML_TYPE:
                problems.append(
                    f"AndroidManifest.xml has unexpected header {raw[:4].hex()!r} "
                    "(expected binary chunk 03 00 08 00)."
                )
            else:
                info["manifest"] = "binary AXML OK"

        # 3) resources.arsc must exist for a real APK.
        if not has_arsc:
            problems.append("Missing resources.arsc (application resources table).")
        else:
            info["resources"] = "present"

        # 4) classes.dex must exist (even if only the small app wrapper).
        if not has_dex:
            problems.append("Missing classes.dex (no executable Java/Kotlin/bytecode).")

        # 5) Native libraries: must be real ELF .so, never a dummy/plain-text file.
        so_entries = [n for n in names if n.startswith("lib/") and n.endswith(".so")]
        so_by_abi: dict[str, list[str]] = {}
        for n in so_entries:
            parts = n.split("/")
            abi = parts[1] if len(parts) > 2 else "?"
            so_by_abi.setdefault(abi, []).append(n)

        info["so_count"] = len(so_entries)
        info["so_by_abi"] = {
            abi: sorted(v) for abi, v in sorted(so_by_abi.items())
        }

        for n in so_entries:
            raw = z.read(n)
            if not _looks_elf(raw):
                problems.append(
                    f"Native lib '{n}' is NOT a real ELF shared object "
                    f"(magic={raw[:4].hex()!r}). Dummy/plain text .so will crash "
                    "the app at load time and is rejected by installers."
                )
            elif raw.startswith(b"dummy"):
                problems.append(f"Native lib '{n}' is a placeholder 'dummy' text file.")

        # 6) Per-ABI reporting (for the required arm64-v8a / armeabi-v7a / x86_64).
        required = ("arm64-v8a", "armeabi-v7a", "x86_64")
        for abi in required:
            libs = so_by_abi.get(abi, [])
            if not libs:
                problems.append(f"Missing native libs for required ABI '{abi}'.")
            info[f"abi_{abi}_count"] = len(libs)

        # 7) Compression method of each .so (STORED+aligned is ideal; DEFLATED is allowed
        #    only when extractNativeLibs=true, which the manifest already sets).
        comp = {0: "STORED", 8: "DEFLATED"}
        for abi, libs in list(so_by_abi.items()):
            for n in libs:
                zi = z.getinfo(n)
                entry = {
                    "name": n,
                    "method": _compression_name(zi.compress_type),
                    "compressed_bytes": zi.compress_size,
                    "size_bytes": zi.file_size,
                }
                info.setdefault("so_details", []).append(entry)
                if verbose:
                    print(f"  [lib] {n:55s} {entry['method']:8s} "
                          f"{entry['size_bytes']:>10d} bytes")

    # 8) Report.
    if verbose:
        print(f"[info] APK: {path}")
        print(f"[info] size: {size:,} bytes, entries: {info.get('entry_count')}")
        print(f"[info] manifest: {info.get('manifest', 'MISSING')}")
        print(f"[info] resources.arsc: {info.get('resources', 'MISSING')}")
        print(f"[info] classes.dex: {'present' if info.get('has_dex') else 'MISSING'}")
        for abi in required:
            print(f"[info] ABI {abi:12s}: {info.get(f'abi_{abi}_count', 0)} .so")
        print(f"[info] total .so: {info.get('so_count', 0)}")

    if problems:
        print("\n[FAIL] Structural problems found:")
        for p in problems:
            print(f"  - {p}")
        # Emit machine-readable summary on stdout too (JSON shape is produced by --json).
        if "--json" in sys.argv:
            print(json.dumps({"ok": False, "problems": problems, "info": info}, indent=2))
        return 1

    print(f"\n[PASS] {path}: valid, structurally-sound APK "
          f"({info.get('so_count', 0)} native libs, binary manifest present).")
    if "--json" in sys.argv:
        print(json.dumps({"ok": True, "problems": [], "info": info}, indent=2))
    return 0


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__)
        return 2
    verbose = "--verbose" in argv or "-v" in argv
    paths = [a for a in argv if not a.startswith("--")]
    if not paths:
        print(__doc__)
        return 2
    rc = 0
    for p in paths:
        rc |= validate_apk(p, verbose=verbose)
    return rc


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
