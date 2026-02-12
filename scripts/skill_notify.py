#!/usr/bin/env python3
"""OpenClaw skill: milestone notification over WhatsApp."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from scripts.v4_runtime import (
    DEFAULT_NOTIFY_TARGET,
    DEFAULT_WORK_ROOT,
    db_connect,
    ensure_runtime_paths,
    get_job,
    record_event,
    send_whatsapp_message,
)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--work-root", default=str(DEFAULT_WORK_ROOT))
    parser.add_argument("--job-id", default="")
    parser.add_argument("--milestone", required=True)
    parser.add_argument("--message", required=True)
    parser.add_argument("--target", default=DEFAULT_NOTIFY_TARGET)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    paths = ensure_runtime_paths(Path(args.work_root))
    conn = db_connect(paths)

    job = get_job(conn, args.job_id) if args.job_id else None
    prefix = f"[{args.job_id}] " if args.job_id else ""
    if job and job.get("status"):
        prefix = f"[{args.job_id}|{job['status']}] "
    message = prefix + args.message

    send_result = send_whatsapp_message(target=args.target, message=message, dry_run=args.dry_run)
    record_event(
        conn,
        job_id=args.job_id or "",
        milestone=args.milestone,
        payload={"target": args.target, "message": message, "send_result": send_result},
    )
    conn.close()

    ok = bool(send_result.get("ok"))
    print(json.dumps({"ok": ok, "milestone": args.milestone, "send_result": send_result}, ensure_ascii=False))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
