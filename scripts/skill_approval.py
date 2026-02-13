#!/usr/bin/env python3
"""OpenClaw skill: contextual command handling (V5.2)."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

from scripts.v4_pipeline import run_job_pipeline
from scripts.skill_status_card import build_status_card, no_active_job_hint
from scripts.v4_runtime import (
    DEFAULT_KB_ROOT,
    DEFAULT_NOTIFY_TARGET,
    DEFAULT_WORK_ROOT,
    db_connect,
    ensure_runtime_paths,
    get_job,
    get_sender_active_job,
    list_actionable_jobs_for_sender,
    list_job_files,
    make_job_id,
    latest_actionable_job,
    record_event,
    send_whatsapp_message,
    set_sender_active_job,
    update_job_status,
    write_job,
)

ACTIVE_JOB_STATUSES = {"collecting", "received", "missing_inputs", "needs_revision"}
RUN_ALLOWED_STATUSES = {"collecting", "received", "missing_inputs", "needs_revision"}
RERUN_ALLOWED_STATUSES = {"collecting", "received", "missing_inputs", "needs_revision", "review_ready", "needs_attention", "failed", "incomplete_input"}


def _require_new_enabled() -> bool:
    return str(os.getenv("OPENCLAW_REQUIRE_NEW", "1")).strip().lower() not in {"0", "false", "off", "no"}


def _parse_command(text: str) -> tuple[str, str | None, str]:
    parts = [p for p in text.strip().split(" ") if p]
    if not parts:
        return "", None, ""
    raw_action = parts[0].lower()

    # Backward compatibility layer.
    if raw_action == "approve":
        explicit_job = parts[1] if len(parts) >= 2 else None
        return "ok", explicit_job, ""
    if raw_action == "reject":
        explicit_job = parts[1] if len(parts) >= 2 else None
        reason = " ".join(parts[2:]).strip() if len(parts) > 2 else "manual_rejected"
        return "no", explicit_job, reason

    if raw_action == "new":
        note = " ".join(parts[1:]).strip() if len(parts) > 1 else ""
        return "new", None, note

    action = raw_action
    if action not in {"run", "status", "ok", "no", "rerun", "new"}:
        return "", None, ""

    explicit_job: str | None = None
    reason = ""
    if action in {"run", "status", "ok", "rerun"}:
        if len(parts) >= 2 and parts[1].startswith("job_"):
            explicit_job = parts[1]
    if action == "no":
        if len(parts) >= 2 and parts[1].startswith("job_"):
            explicit_job = parts[1]
            reason = " ".join(parts[2:]).strip()
        else:
            reason = " ".join(parts[1:]).strip()
    return action, explicit_job, reason


def _send_and_record(
    conn,
    *,
    job_id: str,
    milestone: str,
    target: str,
    message: str,
    dry_run: bool,
) -> dict[str, Any]:
    send_result = send_whatsapp_message(target=target, message=message, dry_run=dry_run)
    record_event(
        conn,
        job_id=job_id,
        milestone=milestone,
        payload={"target": target, "message": message, "send_result": send_result},
    )
    return send_result


def _resolve_job(
    conn,
    *,
    sender: str,
    explicit_job_id: str | None,
    allow_fallback: bool,
    require_new: bool,
) -> tuple[dict[str, Any] | None, dict[str, Any]]:
    sender_norm = (sender or "").strip()
    if explicit_job_id:
        job = get_job(conn, explicit_job_id)
        return job, {"source": "explicit", "multiple": 0}

    if sender_norm:
        active_job_id = get_sender_active_job(conn, sender=sender_norm)
        if active_job_id:
            job = get_job(conn, active_job_id)
            if job and job.get("status") in ACTIVE_JOB_STATUSES.union({"review_ready", "needs_attention", "failed", "incomplete_input", "running"}):
                return job, {"source": "active_map", "multiple": 0}

        if allow_fallback and not require_new:
            sender_jobs = list_actionable_jobs_for_sender(conn, sender=sender_norm, limit=20)
            if sender_jobs:
                selected = sender_jobs[0]
                return selected, {"source": "sender_latest", "multiple": max(0, len(sender_jobs) - 1)}

    if allow_fallback and not require_new:
        latest = latest_actionable_job(conn)
        if latest:
            return latest, {"source": "global_latest", "multiple": 0}
    return None, {"source": "none", "multiple": 0}


def _status_text(conn, job: dict[str, Any], *, multiple_hint: int = 0, require_new: bool = True) -> str:
    files = list_job_files(conn, str(job["job_id"]))
    files_count = len(files)
    docx_count = sum(1 for item in files if Path(str(item.get("path", ""))).suffix.lower() == ".docx")
    return build_status_card(
        job=job,
        files_count=files_count,
        docx_count=docx_count,
        multiple_hint=multiple_hint,
        require_new=require_new,
    )


def _create_new_job(conn, *, paths, sender: str, note: str) -> dict[str, Any]:
    sender_norm = (sender or "").strip() or "unknown"
    job_id = make_job_id("whatsapp")
    inbox_dir = paths.inbox_whatsapp / job_id
    review_dir = paths.review_root / job_id
    inbox_dir.mkdir(parents=True, exist_ok=True)
    review_dir.mkdir(parents=True, exist_ok=True)

    write_job(
        conn,
        job_id=job_id,
        source="whatsapp",
        sender=sender_norm,
        subject="WhatsApp Task",
        message_text=note.strip(),
        status="collecting",
        inbox_dir=inbox_dir,
        review_dir=review_dir,
    )
    set_sender_active_job(conn, sender=sender_norm, job_id=job_id)
    record_event(
        conn,
        job_id=job_id,
        milestone="new_created",
        payload={"sender": sender_norm, "note": note.strip()},
    )
    return (
        {
            "job_id": job_id,
            "status": "collecting",
            "review_dir": str(review_dir.resolve()),
            "inbox_dir": str(inbox_dir.resolve()),
        }
    )


def handle_command(
    *,
    command_text: str,
    work_root: Path,
    kb_root: Path,
    target: str,
    sender: str = "",
    dry_run_notify: bool = False,
) -> dict[str, Any]:
    paths = ensure_runtime_paths(work_root)
    conn = db_connect(paths)
    require_new = _require_new_enabled()
    action, explicit_job_id, reason = _parse_command(command_text)
    if not action:
        conn.close()
        return {"ok": False, "error": "unsupported_command"}

    if action == "new":
        created = _create_new_job(conn, paths=paths, sender=sender, note=reason)
        new_job = get_job(conn, created["job_id"]) or {"job_id": created["job_id"], "status": "collecting", "review_dir": created["review_dir"]}
        msg = _status_text(conn, new_job, multiple_hint=0, require_new=require_new)
        _send_and_record(
            conn,
            job_id=created["job_id"],
            milestone="collecting_update",
            target=target,
            message=msg,
            dry_run=dry_run_notify,
        )
        conn.close()
        return {"ok": True, "job_id": created["job_id"], "status": "collecting"}

    allow_fallback = action == "status"
    job, resolve_meta = _resolve_job(
        conn,
        sender=sender,
        explicit_job_id=explicit_job_id,
        allow_fallback=allow_fallback,
        require_new=require_new,
    )
    if action == "status" and not job:
        send_result = send_whatsapp_message(
            target=target,
            message=no_active_job_hint(require_new=require_new),
            dry_run=dry_run_notify,
        )
        conn.close()
        return {"ok": True, "status": "no_active_job", "send_result": send_result}
    if not job:
        send_result = send_whatsapp_message(
            target=target,
            message=no_active_job_hint(require_new=require_new),
            dry_run=dry_run_notify,
        )
        conn.close()
        return {"ok": False, "error": "job_not_found", "send_result": send_result}

    job_id = str(job["job_id"])
    if sender.strip():
        set_sender_active_job(conn, sender=sender.strip(), job_id=job_id)

    if action == "status":
        msg = _status_text(conn, job, multiple_hint=resolve_meta.get("multiple", 0), require_new=require_new)
        _send_and_record(
            conn,
            job_id=job_id,
            milestone="status",
            target=target,
            message=msg,
            dry_run=dry_run_notify,
        )
        conn.close()
        return {"ok": True, "job_id": job_id, "status": str(job.get("status")), "resolve": resolve_meta}

    current_status = str(job.get("status") or "")
    if action == "run" and current_status not in RUN_ALLOWED_STATUSES:
        msg = (
            f"[{job_id}] cannot run from status={current_status}. "
            f"Use rerun or create a new task with: new"
        )
        _send_and_record(conn, job_id=job_id, milestone="status", target=target, message=msg, dry_run=dry_run_notify)
        conn.close()
        return {"ok": False, "job_id": job_id, "error": "invalid_run_status", "status": current_status}
    if action == "rerun" and current_status not in RERUN_ALLOWED_STATUSES:
        msg = f"[{job_id}] rerun is not allowed from status={current_status}. Send: status"
        _send_and_record(conn, job_id=job_id, milestone="status", target=target, message=msg, dry_run=dry_run_notify)
        conn.close()
        return {"ok": False, "job_id": job_id, "error": "invalid_rerun_status", "status": current_status}

    if action == "ok":
        update_job_status(conn, job_id=job_id, status="verified", errors=[])
        _send_and_record(
            conn,
            job_id=job_id,
            milestone="verified",
            target=target,
            message=(
                f"[{job_id}] verified. Auto-delivery is disabled by policy. "
                "Please manually move the final file to your destination folder."
            ),
            dry_run=dry_run_notify,
        )
        conn.close()
        return {"ok": True, "job_id": job_id, "status": "verified"}

    if action == "no":
        reason_norm = reason.strip() or "needs_manual_revision"
        update_job_status(conn, job_id=job_id, status="needs_revision", errors=[reason_norm])
        _send_and_record(
            conn,
            job_id=job_id,
            milestone="needs_attention",
            target=target,
            message=f"[{job_id}] marked needs_revision. Reason: {reason_norm}",
            dry_run=dry_run_notify,
        )
        conn.close()
        return {"ok": True, "job_id": job_id, "status": "needs_revision", "reason": reason_norm}

    if action in {"run", "rerun"}:
        update_job_status(conn, job_id=job_id, status="received", errors=[])
        _send_and_record(
            conn,
            job_id=job_id,
            milestone="run_accepted",
            target=target,
            message=f"[{job_id}] run_accepted. Starting execution now...",
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

    conn.close()
    return {"ok": False, "error": "unreachable"}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--command", required=True, help="new|run|status|ok|no {reason}|rerun")
    parser.add_argument("--work-root", default=str(DEFAULT_WORK_ROOT))
    parser.add_argument("--kb-root", default=str(DEFAULT_KB_ROOT))
    parser.add_argument("--target", default=DEFAULT_NOTIFY_TARGET)
    parser.add_argument("--sender", default="")
    parser.add_argument("--dry-run-notify", action="store_true")
    args = parser.parse_args()

    result = handle_command(
        command_text=args.command,
        work_root=Path(args.work_root),
        kb_root=Path(args.kb_root),
        target=args.target,
        sender=args.sender,
        dry_run_notify=args.dry_run_notify,
    )
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
