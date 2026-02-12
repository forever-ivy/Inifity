#!/usr/bin/env python3
"""Build DocStruct contract in one command for n8n WF-10."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.extract_docx_structure import extract_structure
from scripts.task_bundle_builder import build_bundle


def build_file_fingerprint(files: dict[str, Any]) -> str:
    parts: list[str] = []
    for key in ["arabic_v1", "arabic_v2", "english_v1"]:
        item = files.get(key)
        if not item:
            continue
        p = Path(item["path"])
        stat = p.stat()
        parts.append(f"{key}:{p.resolve()}:{stat.st_size}:{stat.st_mtime_ns}")
    raw = "|".join(parts)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:20] if raw else ""


def build_doc_struct(root: Path, job_id: str) -> dict[str, Any]:
    bundle = build_bundle(root, job_id)
    files = bundle["files"]

    output: dict[str, Any] = {
        "job_id": job_id,
        "root": str(root.resolve()),
        "valid": bundle["valid"],
        "missing": bundle["missing"],
        "file_fingerprint": "",
        "files": {
            "arabic_v1": None,
            "arabic_v2": None,
            "english_v1": None,
        },
    }

    if not bundle["valid"]:
        return output

    for key in ["arabic_v1", "arabic_v2", "english_v1"]:
        path = Path(files[key]["path"])
        structure = extract_structure(path)
        output["files"][key] = {
            "name": path.name,
            "path": str(path.resolve()),
            "structure": structure,
        }

    output["file_fingerprint"] = build_file_fingerprint(files)

    return output


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True)
    parser.add_argument("--job-id", required=True)
    parser.add_argument("--output")
    args = parser.parse_args()

    root = Path(args.root)
    if not root.exists():
        print(json.dumps({"ok": False, "error": f"Missing root: {root}"}), file=sys.stderr)
        return 2

    payload = build_doc_struct(root, args.job_id)

    if args.output:
        out = Path(args.output)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps({"ok": True, "data": payload}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
