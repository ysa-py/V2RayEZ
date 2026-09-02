#!/usr/bin/env python3
"""Rewrite a temp Cargo.toml so rustc 1.77 can resolve deps (no edition2024)."""
from pathlib import Path
import re
import sys

SAFE = {
    "base64ct": "1.6.0",
    "icu_collections": "1.5.0",
    "icu_provider": "1.5.0",
    "icu_locid": "1.5.0",
    "icu_normalizer": "1.5.0",
    "zerovec": "0.10.4",
    "litemap": "0.7.4",
    "writeable": "0.5.5",
    "tinystr": "0.7.6",
    "yoke": "0.7.4",
    "zerofrom": "0.1.5",
    "idna": "0.4.0",
}

def ensure_patch(text: str, name: str, version: str) -> str:
    line = f'{name} = "={version}"'
    if "[patch.crates-io]" not in text:
        text = text.rstrip() + "\n\n[patch.crates-io]\n"
    patch_body = text.split("[patch.crates-io]", 1)[-1]
    if re.search(rf"^{re.escape(name)}\s*=", patch_body, re.M):
        return text
    return text.rstrip() + f"\n{line}\n"


def pin_direct(text: str) -> str:
    text = text.replace('url = "2"', 'url = "=2.4.1"')
    text = text.replace(
        'uuid = { version = "1", features = ["v4", "serde"] }',
        'uuid = { version = "=1.11.1", features = ["v4", "serde"] }',
    )
    text = text.replace(
        'ed25519-dalek = { version = "2.1", features = ["rand_core"] }',
        'ed25519-dalek = { version = "=2.1.1", features = ["rand_core"] }',
    )
    return text


def main() -> None:
    path = Path(sys.argv[1])
    text = pin_direct(path.read_text())
    extra = sys.argv[2:]
    for crate in extra:
        ver = SAFE.get(crate)
        if not ver:
            # decrement patch blindly is unsafe; require table
            print(f"no safe pin for {crate}", file=sys.stderr)
            sys.exit(2)
        text = ensure_patch(text, crate, ver)
    path.write_text(text)
    print(path.read_text())


if __name__ == "__main__":
    main()
