#!/usr/bin/env python3
"""Make a cargo-vendor tree parseable/compilable by rustc 1.77 (OpenWrt mipsel).

Does not drop crates or features; only rewrites manifest metadata that 1.77
cannot parse (edition 2024, cargo-features, rust-version).
"""
from pathlib import Path
import re
import sys

ROOT = Path(sys.argv[1])


def rewrite(text: str) -> str:
    text = re.sub(r'(?m)^cargo-features\s*=\s*\[[^\]]*edition2024[^\]]*\]\s*\n', "", text)
    text = re.sub(r'edition\s*=\s*"2024"', 'edition = "2021"', text)
    text = re.sub(r'rust-version\s*=\s*"1\.(8[5-9]|9\d|[1-9]\d{2,})\.\d+"', 'rust-version = "1.77"', text)
    return text


n = 0
for path in ROOT.rglob("Cargo.toml"):
    orig = path.read_text(encoding="utf-8")
    new = rewrite(orig)
    if new != orig:
        path.write_text(new, encoding="utf-8")
        n += 1
print(f"rewrote {n} vendor manifests under {ROOT}")
