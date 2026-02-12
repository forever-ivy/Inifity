#!/usr/bin/env python3
"""Write Task Brief and Delta JSON artifacts into review directory."""

from __future__ import annotations

import argparse
import base64
import json
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--review-dir", required=True)
    parser.add_argument("--task-brief-b64", required=True)
    parser.add_argument("--delta-b64", required=True)
    args = parser.parse_args()

    review_dir = Path(args.review_dir)
    review_dir.mkdir(parents=True, exist_ok=True)

    task_brief = base64.b64decode(args.task_brief_b64.encode("utf-8")).decode("utf-8")
    delta_json = base64.b64decode(args.delta_b64.encode("utf-8")).decode("utf-8")

    task_path = review_dir / "Task Brief.md"
    delta_path = review_dir / "Delta Summary.json"

    task_path.write_text(task_brief, encoding="utf-8")
    delta_path.write_text(delta_json, encoding="utf-8")

    print(
        json.dumps(
            {
                "ok": True,
                "data": {
                    "task_brief": str(task_path.resolve()),
                    "delta_summary": str(delta_path.resolve()),
                    "review_dir": str(review_dir.resolve()),
                },
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
