#!/usr/bin/env python3
"""OpenClaw skill: WhatsApp command handling for approval flow."""

from __future__ import annotations

import argparse
import json
import shutil
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from scripts.select_manual_file import pick_file
from scripts.v4_pipeline import run_job_pipeline
from scripts.v4_runtime import (
    DEFAULT_KB_ROOT,
    DEFAULT_NOTIFY_TARGET,
    DEFAULT_WORK_ROOT,
    db_connect,
    ensure_runtime_paths,
    get_job,
    record_event,
    send_whatsapp_message,
    update_job_status,
)


def _parse_command(text: str) -> tuple[str, str, str]:
    parts = [p for p in text.strip().split(" ") if p]
    if not parts:
        return "", "", ""
    action = parts[0].lower()
    if action not in {"status", "approve", "reject", "rerun"}:
        return "", "", ""
    if len(parts) < 2:
        return action, "", ""
    job_id = parts[1]
    reason = " ".join(parts[2:]).strip() if len(parts) > 2 else ""
    return action, job_id, reason


def _send_and_record(conn, *, job_id: str, milestone: str, target: str, message: str, dry_run: bool) -> dict[str, Any]:
    send_result = send_whatsapp_message(target=target, message=message, dry_run=dry_run)
    record_event(conn, job_id=job_id, milestone=milestone, payload={"target": target, "message": message, "send_result": send_result})
    return send_result


def handle_command(
    *,
    command_text: str,
    work_root: Path,
    kb_root: Path,
    target: str,
    dry_run_notify: bool = False,
) -> dict[str, Any]:
    paths = ensure_runtime_paths(work_root)
    conn = db_connect(paths)
    action, job_id, reason = _parse_command(command_text)
    if not action:
        conn.close()
        return {"ok": False, "error": "unsupported_command"}
    if not job_id:
        conn.close()
        return {"ok": False, "error": "missing_job_id"}

    job = get_job(conn, job_id)
    if not job:
        _send_and_record(
            conn,
            job_id=job_id,
            milestone="needs_attention",
            target=target,
            message=f"[{job_id}] not found.",
            dry_run=dry_run_notify,
        )
        conn.close()
        return {"ok": False, "error": "job_not_found", "job_id": job_id}

    if action == "status":
        msg = (
            f"[{job_id}] status={job['status']} task_type={job.get('task_type') or 'n/a'} "
            f"review_dir={job.get('review_dir')}"
        )
        _send_and_record(conn, job_id=job_id, milestone="status", target=target, message=msg, dry_run=dry_run_notify)
        conn.close()
        return {"ok": True, "job_id": job_id, "status": job["status"]}

    if action == "reject":
        update_job_status(conn, job_id=job_id, status="needs_attention", errors=[reason or "manual_rejected"])
        msg = f"[{job_id}] marked needs_attention. Reason: {reason or 'manual_rejected'}."
        _send_and_record(conn, job_id=job_id, milestone="needs_attention", target=target, message=msg, dry_run=dry_run_notify)
        conn.close()
        return {"ok": True, "job_id": job_id, "status": "needs_attention"}

    if action == "approve":
        review_dir = Path(job["review_dir"]).resolve()
        manual_file = pick_file(review_dir)
        if not manual_file:
            msg = f"[{job_id}] approve blocked: no *_manual*.docx or *_edited*.docx in {review_dir}."
            _send_and_record(conn, job_id=job_id, milestone="needs_attention", target=target, message=msg, dry_run=dry_run_notify)
            conn.close()
            return {"ok": False, "job_id": job_id, "error": "manual_file_missing"}

        stamp = datetime.now(UTC).strftime("%Y-%m-%d")
        out_name = f"{job_id} EN [{stamp}].docx"
        out_path = paths.translated_root / out_name
        shutil.copy2(manual_file, out_path)
        update_job_status(conn, job_id=job_id, status="delivered")
        _send_and_record(
            conn,
            job_id=job_id,
            milestone="delivered",
            target=target,
            message=f"[{job_id}] delivered: {out_path}",
            dry_run=dry_run_notify,
        )
        conn.close()
        return {"ok": True, "job_id": job_id, "status": "delivered", "final_file": str(out_path.resolve())}

    # rerun
    update_job_status(conn, job_id=job_id, status="received", errors=[])
    _send_and_record(
        conn,
        job_id=job_id,
        milestone="running",
        target=target,
        message=f"[{job_id}] rerun requested. Pipeline restarting.",
        dry_run=dry_run_notify,
    )
    conn.close()
    result = run_job_pipeline(
        job_id=job_id,
        work_root=work_root,
        kb_root=kb_root,
        notify_target=target,
        dry_run_notify=dry_run_notify,
    )
    return {"ok": bool(result.get("ok")), "job_id": job_id, "result": result}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--command", required=True, help="status|approve|reject|rerun <job_id> [reason]")
    parser.add_argument("--work-root", default=str(DEFAULT_WORK_ROOT))
    parser.add_argument("--kb-root", default=str(DEFAULT_KB_ROOT))
    parser.add_argument("--target", default=DEFAULT_NOTIFY_TARGET)
    parser.add_argument("--dry-run-notify", action="store_true")
    args = parser.parse_args()

    result = handle_command(
        command_text=args.command,
        work_root=Path(args.work_root),
        kb_root=Path(args.kb_root),
        target=args.target,
        dry_run_notify=args.dry_run_notify,
    )
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
