#!/usr/bin/env python3
"""Select a manual edited docx from a review folder."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

PRIORITY_PATTERNS = [
    re.compile(r".*_manual.*\.docx$", re.IGNORECASE),
    re.compile(r".*_edited.*\.docx$", re.IGNORECASE),
]


def pick_file(review_dir: Path) -> Path | None:
    files = [p for p in review_dir.glob("*.docx") if not p.name.startswith("~$")]
    if not files:
        return None

    files.sort(key=lambda p: p.stat().st_mtime, reverse=True)

    for pattern in PRIORITY_PATTERNS:
        for f in files:
            if pattern.match(f.name):
                return f

    return None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--review-dir", required=True)
    args = parser.parse_args()

    review_dir = Path(args.review_dir)
    if not review_dir.exists():
        print(json.dumps({"ok": False, "error": f"Missing review dir: {review_dir}"}), file=sys.stderr)
        return 2

    selected = pick_file(review_dir)
    if not selected:
        print(json.dumps({"ok": False, "error": "No manual file found"}))
        return 3

    print(
        json.dumps(
            {
                "ok": True,
                "data": {
                    "selected_file": str(selected.resolve()),
                    "file_name": selected.name,
                    "review_dir": str(review_dir.resolve()),
                },
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
