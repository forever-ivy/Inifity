#!/usr/bin/env python3
"""OpenClaw skill: incremental KB sync with mtime+hash."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from scripts.v4_kb import sync_kb
from scripts.v4_runtime import DEFAULT_KB_ROOT, DEFAULT_WORK_ROOT, db_connect, ensure_runtime_paths, record_event


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--kb-root", default=str(DEFAULT_KB_ROOT))
    parser.add_argument("--work-root", default=str(DEFAULT_WORK_ROOT))
    parser.add_argument("--job-id", default="")
    parser.add_argument("--output")
    args = parser.parse_args()

    paths = ensure_runtime_paths(Path(args.work_root))
    conn = db_connect(paths)

    report_path = Path(args.output).expanduser() if args.output else (paths.kb_system_root / "kb_sync_latest.json")
    report = sync_kb(conn=conn, kb_root=Path(args.kb_root), report_path=report_path)

    if args.job_id:
        record_event(conn, job_id=args.job_id, milestone="kb_sync_done", payload=report)

    conn.close()
    print(json.dumps({"ok": report.get("ok", True), "data": report}, ensure_ascii=False))
    return 0 if report.get("ok", True) else 1


if __name__ == "__main__":
    raise SystemExit(main())
