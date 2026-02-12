#!/usr/bin/env python3
"""Build a task bundle by discovering and classifying required documents."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Any


def is_arabic_name(name: str) -> bool:
    return bool(re.search(r"[\u0600-\u06ff]", name))


def classify_file(path: Path) -> str | None:
    name = path.name.lower()
    arabic = is_arabic_name(path.name)

    if arabic and "v2" in name:
        return "arabic_v2"
    if arabic and "v1" in name:
        return "arabic_v1"
    if ("english" in name or "ai readiness" in name or "quantitative" in name) and "v1" in name:
        return "english_v1"
    return None


def discover_docx(root: Path) -> list[Path]:
    candidates = []
    for p in root.rglob("*.docx"):
        if "~$" in p.name:
            continue
        candidates.append(p)
    candidates.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return candidates


def build_bundle(root: Path, job_id: str) -> dict[str, Any]:
    files = discover_docx(root)
    mapping: dict[str, Path] = {}

    for doc in files:
        key = classify_file(doc)
        if not key:
            continue
        if key not in mapping:
            mapping[key] = doc

    required = ["arabic_v1", "arabic_v2", "english_v1"]
    missing = [k for k in required if k not in mapping]

    bundle_files: dict[str, Any] = {}
    for key in required:
        if key in mapping:
            bundle_files[key] = {
                "path": str(mapping[key].resolve()),
                "name": mapping[key].name,
            }
        else:
            bundle_files[key] = None

    return {
        "job_id": job_id,
        "root": str(root.resolve()),
        "valid": not missing,
        "missing": missing,
        "files": bundle_files,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True, help="Task root folder")
    parser.add_argument("--job-id", required=True, help="Job ID")
    parser.add_argument("--output", help="Output JSON file")
    args = parser.parse_args()

    root = Path(args.root)
    if not root.exists():
        print(json.dumps({"ok": False, "error": f"Missing root: {root}"}), file=sys.stderr)
        return 2

    payload = build_bundle(root, args.job_id)

    if args.output:
        out = Path(args.output)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps({"ok": True, "data": payload}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
