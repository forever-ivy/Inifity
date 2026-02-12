#!/usr/bin/env python3
"""Extract ordered paragraph/table structure from a DOCX file as JSON."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

from docx import Document
from docx.oxml.table import CT_Tbl
from docx.oxml.text.paragraph import CT_P
from docx.table import Table
from docx.text.paragraph import Paragraph


def normalize_text(text: str) -> str:
    text = text.replace("\u00a0", " ")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def has_arabic(text: str) -> bool:
    return bool(re.search(r"[\u0600-\u06ff]", text))


def extract_structure(input_path: Path) -> dict[str, Any]:
    doc = Document(str(input_path))
    blocks: list[dict[str, Any]] = []
    paragraph_count = 0
    table_count = 0
    block_index = 0

    for child in doc.element.body.iterchildren():
        block_index += 1
        if isinstance(child, CT_P):
            para = Paragraph(child, doc)
            text = normalize_text(para.text)
            if not text:
                continue
            paragraph_count += 1
            blocks.append(
                {
                    "kind": "paragraph",
                    "index": block_index,
                    "style": para.style.name if para.style else "",
                    "text": text,
                }
            )
        elif isinstance(child, CT_Tbl):
            table = Table(child, doc)
            table_count += 1
            rows: list[list[str]] = []
            for row in table.rows:
                cells = [normalize_text(cell.text.replace("\n", " / ")) for cell in row.cells]
                rows.append(cells)
            blocks.append(
                {
                    "kind": "table",
                    "index": block_index,
                    "table_index": table_count,
                    "rows": rows,
                }
            )

    sample_text = " ".join(
        item["text"]
        for item in blocks
        if item["kind"] == "paragraph" and item.get("text")
    )[:2500]

    digest = hashlib.sha256(json.dumps(blocks, ensure_ascii=False).encode("utf-8")).hexdigest()

    return {
        "source_file": str(input_path.resolve()),
        "file_name": input_path.name,
        "paragraph_count": paragraph_count,
        "table_count": table_count,
        "block_count": len(blocks),
        "language_hint": "ar" if has_arabic(sample_text) else "en",
        "content_hash": digest,
        "blocks": blocks,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="Path to DOCX file")
    parser.add_argument("--output", help="Output JSON file path")
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        print(json.dumps({"ok": False, "error": f"Missing file: {input_path}"}), file=sys.stderr)
        return 2

    if input_path.suffix.lower() != ".docx":
        print(json.dumps({"ok": False, "error": "Input must be .docx"}), file=sys.stderr)
        return 2

    payload = extract_structure(input_path)

    if args.output:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps({"ok": True, "data": payload}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
