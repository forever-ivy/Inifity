#!/usr/bin/env python3
"""OpenClaw skill: retrieve KB evidence snippets by query."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from scripts.v4_kb import retrieve_kb
from scripts.v4_runtime import DEFAULT_WORK_ROOT, db_connect, ensure_runtime_paths


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--work-root", default=str(DEFAULT_WORK_ROOT))
    parser.add_argument("--query", required=True)
    parser.add_argument("--task-type", default="")
    parser.add_argument("--top-k", type=int, default=8)
    args = parser.parse_args()

    paths = ensure_runtime_paths(Path(args.work_root))
    conn = db_connect(paths)
    hits = retrieve_kb(conn=conn, query=args.query, task_type=args.task_type, top_k=args.top_k)
    conn.close()
    print(json.dumps({"ok": True, "query": args.query, "task_type": args.task_type, "hits": hits}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
