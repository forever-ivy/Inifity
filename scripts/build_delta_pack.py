#!/usr/bin/env python3
"""Create a delta pack from two extracted DOCX structure JSON files."""

from __future__ import annotations

import argparse
import json
import re
import sys
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any


SECTION_HINT_RE = re.compile(r"^(section|domain|heading|القسم|المجال|الغرض|التعليمات)", re.IGNORECASE)


def normalize(s: str) -> str:
    s = s.replace("\u00a0", " ")
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def flatten_blocks(struct: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for block in struct.get("blocks", []):
        if block.get("kind") == "paragraph":
            text = normalize(block.get("text", ""))
            if text:
                rows.append({"kind": "paragraph", "text": text})
        elif block.get("kind") == "table":
            for idx, row in enumerate(block.get("rows", []), start=1):
                cell_text = " | ".join(normalize(c) for c in row if normalize(c))
                if cell_text:
                    rows.append({"kind": "table_row", "text": cell_text, "row": idx})
    return rows


def build_delta(job_id: str, v1_rows: list[dict[str, Any]], v2_rows: list[dict[str, Any]]) -> dict[str, Any]:
    a = [r["text"] for r in v1_rows]
    b = [r["text"] for r in v2_rows]

    matcher = SequenceMatcher(a=a, b=b, autojunk=False)

    added: list[dict[str, Any]] = []
    removed: list[dict[str, Any]] = []
    modified: list[dict[str, Any]] = []

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            continue
        if tag == "insert":
            for i, item in enumerate(v2_rows[j1:j2], start=1):
                added.append({"index": j1 + i, "text": item["text"], "kind": item.get("kind", "paragraph")})
        elif tag == "delete":
            for i, item in enumerate(v1_rows[i1:i2], start=1):
                removed.append({"index": i1 + i, "text": item["text"], "kind": item.get("kind", "paragraph")})
        elif tag == "replace":
            left = [x["text"] for x in v1_rows[i1:i2]]
            right = [x["text"] for x in v2_rows[j1:j2]]
            modified.append(
                {
                    "v1_range": [i1, i2],
                    "v2_range": [j1, j2],
                    "before": left,
                    "after": right,
                }
            )

    section_changes: list[dict[str, Any]] = []
    for item in added[:12]:
        label = "General"
        if SECTION_HINT_RE.match(item["text"]):
            label = item["text"][:80]
        section_changes.append({"section": label, "changes": [f"Added: {item['text'][:140]}"]})

    for item in modified[:12]:
        label = "General"
        if item["after"] and SECTION_HINT_RE.match(item["after"][0]):
            label = item["after"][0][:80]
        section_changes.append(
            {
                "section": label,
                "changes": [
                    f"Modified block V1[{item['v1_range'][0]}:{item['v1_range'][1]}] -> V2[{item['v2_range'][0]}:{item['v2_range'][1]}]"
                ],
            }
        )

    return {
        "job_id": job_id,
        "added": added,
        "removed": removed,
        "modified": modified,
        "summary_by_section": section_changes,
        "stats": {
            "added_count": len(added),
            "removed_count": len(removed),
            "modified_count": len(modified),
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--job-id", required=True)
    parser.add_argument("--v1", required=True, help="Arabic V1 structure JSON path")
    parser.add_argument("--v2", required=True, help="Arabic V2 structure JSON path")
    parser.add_argument("--output", help="Delta output JSON path")
    args = parser.parse_args()

    v1_path = Path(args.v1)
    v2_path = Path(args.v2)

    if not v1_path.exists() or not v2_path.exists():
        print(json.dumps({"ok": False, "error": "Missing input structure files"}), file=sys.stderr)
        return 2

    v1_payload = json.loads(v1_path.read_text(encoding="utf-8"))
    v2_payload = json.loads(v2_path.read_text(encoding="utf-8"))

    v1_rows = flatten_blocks(v1_payload.get("data", v1_payload))
    v2_rows = flatten_blocks(v2_payload.get("data", v2_payload))

    delta = build_delta(args.job_id, v1_rows, v2_rows)

    if args.output:
        out = Path(args.output)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(delta, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps({"ok": True, "data": delta}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
