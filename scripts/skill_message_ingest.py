#!/usr/bin/env python3
"""OpenClaw skill: ingest Telegram messages/files and create jobs."""

from __future__ import annotations

import argparse
import base64
from datetime import UTC, datetime, timedelta
import json
import os
import shutil
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

from scripts.skill_approval import handle_command, handle_interaction_reply
from scripts.v4_pipeline import attach_file_to_job, create_job, run_job_pipeline
from scripts.v4_runtime import (
    DEFAULT_KB_ROOT,
    DEFAULT_NOTIFY_TARGET,
    DEFAULT_WORK_ROOT,
    add_job_final_upload,
    db_connect,
    ensure_runtime_paths,
    get_job,
    get_sender_active_job,
    list_job_files,
    make_job_id,
    send_message,
    update_job_status,
    utc_now_iso,
)


def _load_payload(args: argparse.Namespace) -> dict[str, Any]:
    if args.payload_json:
        return json.loads(args.payload_json)
    if args.payload_file:
        return json.loads(Path(args.payload_file).read_text(encoding="utf-8"))
    raw = args.payload_stdin
    if raw:
        return json.loads(raw)
    return {}


def _extract_text(payload: dict[str, Any]) -> str:
    for key in ["text", "message", "body", "content"]:
        v = payload.get(key)
        if isinstance(v, str) and v.strip():
            return v.strip()
    msg = payload.get("message")
    if isinstance(msg, dict):
        for key in ["text", "body", "content"]:
            v = msg.get(key)
            if isinstance(v, str) and v.strip():
                return v.strip()
    return ""


def _extract_sender(payload: dict[str, Any]) -> str:
    for key in ["from", "sender", "from_e164", "author"]:
        v = payload.get(key)
        if isinstance(v, str) and v.strip():
            return v.strip()
    return "unknown"


def _extract_message_id(payload: dict[str, Any]) -> str:
    for key in ["message_id", "messageId", "id"]:
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    message = payload.get("message")
    if isinstance(message, dict):
        for key in ["message_id", "messageId", "id"]:
            value = message.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    return ""


def _collect_attachments(payload: dict[str, Any]) -> list[dict[str, Any]]:
    atts: list[dict[str, Any]] = []
    if isinstance(payload.get("attachments"), list):
        for item in payload["attachments"]:
            if isinstance(item, dict):
                atts.append(item)
    message = payload.get("message")
    if isinstance(message, dict) and isinstance(message.get("attachments"), list):
        for item in message["attachments"]:
            if isinstance(item, dict):
                atts.append(item)
    if payload.get("media"):
        media = payload["media"]
        if isinstance(media, list):
            for item in media:
                if isinstance(item, dict):
                    atts.append(item)
        elif isinstance(media, dict):
            atts.append(media)
    return atts


def _is_command(text: str) -> bool:
    lowered = text.lower().strip()
    if not lowered:
        return False
    head = lowered.split(" ", 1)[0]
    return head in {"new", "run", "status", "ok", "no", "rerun", "approve", "reject"}


def _require_new_enabled() -> bool:
    return str(os.getenv("OPENCLAW_REQUIRE_NEW", "1")).strip().lower() not in {"0", "false", "off", "no"}


def _parse_iso(value: str) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def _find_recent_collecting_job(*, work_root: Path, sender: str, window_seconds: int) -> str | None:
    paths = ensure_runtime_paths(work_root)
    conn = db_connect(paths)
    try:
        rows = conn.execute(
            """
            SELECT job_id, updated_at
            FROM jobs
            WHERE source IN ('telegram')
              AND sender=?
              AND status IN ('collecting', 'received', 'missing_inputs', 'needs_revision')
            ORDER BY updated_at DESC
            LIMIT 20
            """,
            (sender,),
        ).fetchall()
        if not rows:
            return None
        now = datetime.now(UTC)
        for row in rows:
            updated = _parse_iso(str(row["updated_at"]))
            if not updated:
                continue
            if now - updated <= timedelta(seconds=max(30, window_seconds)):
                return str(row["job_id"])
        return None
    finally:
        conn.close()


def _find_active_collecting_job(*, work_root: Path, sender: str) -> str | None:
    paths = ensure_runtime_paths(work_root)
    conn = db_connect(paths)
    try:
        active_job_id = get_sender_active_job(conn, sender=sender)
        if not active_job_id:
            return None
        job = get_job(conn, active_job_id)
        if not job:
            return None
        if str(job.get("status") or "") in {"collecting", "received", "missing_inputs", "needs_revision"}:
            return str(job["job_id"])
        return None
    finally:
        conn.close()


def _find_active_post_run_job(*, work_root: Path, sender: str) -> str | None:
    """Allow uploading FINAL files for a job that already finished execution."""
    paths = ensure_runtime_paths(work_root)
    conn = db_connect(paths)
    try:
        active_job_id = get_sender_active_job(conn, sender=sender)
        if not active_job_id:
            return None
        job = get_job(conn, active_job_id)
        if not job:
            return None
        if str(job.get("status") or "") in {"review_ready", "needs_attention"}:
            return str(job["job_id"])
        return None
    finally:
        conn.close()


def _append_job_message(*, work_root: Path, job_id: str, text: str) -> None:
    if not text.strip():
        return
    paths = ensure_runtime_paths(work_root)
    conn = db_connect(paths)
    try:
        row = conn.execute("SELECT message_text FROM jobs WHERE job_id=?", (job_id,)).fetchone()
        if not row:
            return
        old = str(row["message_text"] or "").strip()
        merged = text.strip() if not old else f"{old}\n\n{text.strip()}"
        conn.execute(
            "UPDATE jobs SET message_text=?, updated_at=? WHERE job_id=?",
            (merged, utc_now_iso(), job_id),
        )
        conn.commit()
    finally:
        conn.close()


def _get_job_info(*, work_root: Path, job_id: str) -> dict[str, Any]:
    paths = ensure_runtime_paths(work_root)
    conn = db_connect(paths)
    try:
        job = conn.execute("SELECT * FROM jobs WHERE job_id=?", (job_id,)).fetchone()
        files = list_job_files(conn, job_id)
        docx_count = sum(1 for item in files if Path(item["path"]).suffix.lower() == ".docx")
        return {
            "job_exists": bool(job),
            "inbox_dir": str(job["inbox_dir"]) if job else "",
            "docx_count": docx_count,
            "files_count": len(files),
        }
    finally:
        conn.close()


def _set_collecting_status(*, work_root: Path, job_id: str) -> None:
    paths = ensure_runtime_paths(work_root)
    conn = db_connect(paths)
    try:
        update_job_status(conn, job_id=job_id, status="collecting")
    finally:
        conn.close()


def _resolve_reply_target(sender: str, fallback_target: str) -> str:
    s = (sender or "").strip()
    return s if s and s.lower() != "unknown" else fallback_target


def _notify_target(*, target: str, message: str, dry_run: bool = False) -> dict[str, Any]:
    return send_message(target=target, message=message, dry_run=dry_run)


def _is_http_url(value: str) -> bool:
    v = (value or "").strip().lower()
    return v.startswith("http://") or v.startswith("https://")


def _attachment_url(item: dict[str, Any]) -> str:
    for key in ("mediaUrl", "media_url", "url"):
        value = item.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def _safe_basename(name: str) -> str:
    base = Path(str(name or "attachment")).name.strip()
    if base in {"", ".", ".."}:
        return "attachment"
    return base


def _infer_suffix_from_mime(mime: str) -> str:
    m = (mime or "").strip().lower()
    if not m:
        return ""
    if "spreadsheetml" in m or "ms-excel" in m:
        return ".xlsx"
    if "wordprocessingml" in m:
        return ".docx"
    if "text/csv" in m or m.endswith("/csv") or "csv" == m:
        return ".csv"
    return ""


def _download_to_path(url: str, *, dest: Path, max_bytes: int, timeout_seconds: int) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "openclaw/translation-ingest"})
    with urllib.request.urlopen(req, timeout=timeout_seconds) as resp:
        length = resp.headers.get("Content-Length")
        if length:
            try:
                if int(length) > max_bytes:
                    raise ValueError("download_too_large")
            except ValueError:
                pass
        total = 0
        with open(dest, "wb") as fh:
            while True:
                chunk = resp.read(1024 * 64)
                if not chunk:
                    break
                total += len(chunk)
                if total > max_bytes:
                    raise ValueError("download_too_large")
                fh.write(chunk)


def _save_attachment_to_path(item: dict[str, Any], *, target_path: Path) -> tuple[bool, str]:
    if item.get("path"):
        src = Path(str(item["path"])).expanduser()
        if not src.exists():
            return False, "missing_path"
        shutil.copy2(src, target_path)
        return True, "copied_path"
    if item.get("local_path"):
        src = Path(str(item["local_path"])).expanduser()
        if not src.exists():
            return False, "missing_local_path"
        shutil.copy2(src, target_path)
        return True, "copied_local_path"
    if item.get("content_base64"):
        target_path.write_bytes(base64.b64decode(str(item["content_base64"]).encode("utf-8")))
        return True, "decoded_base64"

    url = _attachment_url(item)
    if url and _is_http_url(url):
        suffix = target_path.suffix.lower()
        if suffix not in {".xlsx", ".docx", ".csv"}:
            return False, f"download_blocked_suffix:{suffix or 'none'}"
        max_mb = int(os.getenv("OPENCLAW_ATTACHMENT_DOWNLOAD_MAX_MB", "35"))
        timeout_seconds = int(os.getenv("OPENCLAW_ATTACHMENT_DOWNLOAD_TIMEOUT_SECONDS", "60"))
        max_bytes = max(1, max_mb) * 1024 * 1024
        _download_to_path(url, dest=target_path, max_bytes=max_bytes, timeout_seconds=timeout_seconds)
        return True, "downloaded_url"
    return False, "unsupported_attachment"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--payload-json")
    parser.add_argument("--payload-file")
    parser.add_argument("--payload-stdin", default="")
    parser.add_argument("--work-root", default=str(DEFAULT_WORK_ROOT))
    parser.add_argument("--kb-root", default=str(DEFAULT_KB_ROOT))
    parser.add_argument("--notify-target", default=DEFAULT_NOTIFY_TARGET)
    parser.add_argument("--auto-run", action="store_true")
    parser.add_argument("--dry-run-notify", action="store_true")
    bundle_window_default = int(os.getenv("V4_BUNDLE_WINDOW_SECONDS", "900"))
    parser.add_argument("--bundle-window-seconds", type=int, default=bundle_window_default)
    args = parser.parse_args()

    payload = _load_payload(args)
    text = _extract_text(payload)
    sender = _extract_sender(payload)
    message_id = _extract_message_id(payload)
    raw_message_ref = str(payload.get("raw_message_ref") or "")
    token_guard_applied = bool(payload.get("token_guard_applied", False))
    work_root = Path(args.work_root)
    kb_root = Path(args.kb_root)
    reply_target = _resolve_reply_target(sender, args.notify_target)

    attachments = _collect_attachments(payload)
    require_new = _require_new_enabled()

    # Numeric replies may be interaction selections (e.g., company menu).
    if text.strip().isdigit() and not attachments:
        interaction = handle_interaction_reply(
            reply_text=text.strip(),
            work_root=work_root,
            kb_root=kb_root,
            target=reply_target,
            sender=sender,
            dry_run_notify=args.dry_run_notify,
        )
        if interaction.get("ok") or interaction.get("error") in {"invalid_selection", "expired"}:
            print(json.dumps({"ok": bool(interaction.get("ok")), "mode": "interaction_reply", "result": interaction}, ensure_ascii=False))
            return 0 if interaction.get("ok") else 1

    bootstrap_job_id: str | None = None
    head = text.lower().strip().split(" ", 1)[0] if text.strip() else ""
    if require_new and attachments and head == "new":
        bootstrap = handle_command(
            command_text=text,
            work_root=work_root,
            kb_root=kb_root,
            target=reply_target,
            sender=sender,
            dry_run_notify=args.dry_run_notify,
        )
        if bootstrap.get("ok") and bootstrap.get("job_id"):
            bootstrap_job_id = str(bootstrap["job_id"])
            text = ""

    if text and _is_command(text) and not attachments:
        result = handle_command(
            command_text=text,
            work_root=work_root,
            kb_root=kb_root,
            target=reply_target,
            sender=sender,
            dry_run_notify=args.dry_run_notify,
        )
        print(json.dumps({"ok": bool(result.get("ok")), "mode": "command", "result": result}, ensure_ascii=False))
        return 0 if result.get("ok") else 1

    # FINAL uploads: allow attaching files to the latest active post-run job.
    if require_new and attachments:
        post_run_job_id = _find_active_post_run_job(work_root=work_root, sender=sender)
        if post_run_job_id:
            paths = ensure_runtime_paths(work_root)
            conn = db_connect(paths)
            job = get_job(conn, post_run_job_id)
            conn.close()
            if job:
                review_dir = Path(str(job.get("review_dir") or "")).expanduser().resolve()
                dest_dir = review_dir / "FinalUploads"
                dest_dir.mkdir(parents=True, exist_ok=True)

                saved_files: list[str] = []
                failures: list[str] = []
                for idx, item in enumerate(attachments, start=1):
                    url = _attachment_url(item)
                    mime_hint = str(item.get("mime_type") or item.get("mimeType") or "")
                    file_name = _safe_basename(
                        item.get("name")
                        or item.get("fileName")
                        or (Path(urllib.parse.urlparse(url).path).name if url else "")
                        or f"final_upload_{idx}"
                    )
                    if url and not Path(file_name).suffix:
                        inferred = _infer_suffix_from_mime(mime_hint)
                        if inferred:
                            file_name = f"{file_name}{inferred}"
                    target_path = dest_dir / file_name
                    if target_path.exists():
                        stem = target_path.stem
                        suffix = target_path.suffix
                        target_path = dest_dir / f"{stem}_{idx}_{int(datetime.now(UTC).timestamp())}{suffix}"
                    ok, reason = _save_attachment_to_path(item, target_path=target_path)
                    if not ok:
                        failures.append(f"{file_name}:{reason}")
                        continue

                    conn = db_connect(paths)
                    add_job_final_upload(conn, job_id=post_run_job_id, sender=sender, path=target_path)
                    conn.close()
                    saved_files.append(str(target_path.resolve()))

                _notify_target(
                    target=reply_target,
                    message=(
                        f"\U0001f4ce Final file(s) received: {len(saved_files)}\nSend: ok to archive"
                        + (f"\n\u26a0\ufe0f Failed: {', '.join(failures[:3])}" if failures else "")
                    ),
                    dry_run=args.dry_run_notify,
                )
                print(
                    json.dumps(
                        {
                            "ok": True,
                            "mode": "final_uploads",
                            "job_id": post_run_job_id,
                            "saved_files": saved_files,
                        },
                        ensure_ascii=False,
                    )
                )
                return 0

    existing_job_id = bootstrap_job_id or (_find_active_collecting_job(work_root=work_root, sender=sender) if require_new else _find_recent_collecting_job(
        work_root=work_root,
        sender=sender,
        window_seconds=args.bundle_window_seconds,
    ))
    if require_new and not existing_job_id:
        notify_msg = "\U0001f4ed No active task. Send: new"
        _notify_target(target=reply_target, message=notify_msg, dry_run=args.dry_run_notify)
        print(
            json.dumps(
                {
                    "ok": False,
                    "mode": "needs_new",
                    "sender": sender,
                    "message_id": message_id,
                    "hint": notify_msg,
                },
                ensure_ascii=False,
            )
        )
        return 0

    if existing_job_id:
        job_id = existing_job_id
        info = _get_job_info(work_root=work_root, job_id=job_id)
        inbox_dir = Path(info.get("inbox_dir") or work_root / "_INBOX" / "telegram" / job_id)
        inbox_dir.mkdir(parents=True, exist_ok=True)
        _append_job_message(work_root=work_root, job_id=job_id, text=text)
    else:
        job_id = make_job_id("telegram")
        inbox_dir = work_root.expanduser().resolve() / "_INBOX" / "telegram" / job_id
        inbox_dir.mkdir(parents=True, exist_ok=True)
        create_job(
            source="telegram",
            sender=sender,
            subject="Telegram Task",
            message_text=text,
            inbox_dir=inbox_dir,
            job_id=job_id,
            work_root=work_root,
        )
        _set_collecting_status(work_root=work_root, job_id=job_id)

    (inbox_dir / "message.txt").write_text(text, encoding="utf-8")
    ts_name = datetime.now(UTC).strftime("payload_%Y%m%d_%H%M%S.json")
    (inbox_dir / ts_name).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    saved_files: list[str] = []
    failures: list[str] = []
    for idx, item in enumerate(attachments, start=1):
        url = _attachment_url(item)
        mime_hint = str(item.get("mime_type") or item.get("mimeType") or "")
        file_name = _safe_basename(
            item.get("name")
            or item.get("fileName")
            or (Path(urllib.parse.urlparse(url).path).name if url else "")
            or f"tg_attachment_{idx}"
        )
        if url and not Path(file_name).suffix:
            inferred = _infer_suffix_from_mime(mime_hint)
            if inferred:
                file_name = f"{file_name}{inferred}"
        target_path = inbox_dir / file_name
        if target_path.exists():
            stem = target_path.stem
            suffix = target_path.suffix
            target_path = inbox_dir / f"{stem}_{idx}_{int(datetime.now(UTC).timestamp())}{suffix}"
        ok, reason = _save_attachment_to_path(item, target_path=target_path)
        if not ok:
            failures.append(f"{file_name}:{reason}")
            continue
        attach_file_to_job(work_root=work_root, job_id=job_id, path=target_path)
        saved_files.append(str(target_path.resolve()))

    info = _get_job_info(work_root=work_root, job_id=job_id)
    should_run = args.auto_run and text.lower().strip().startswith("run")
    run_result: dict[str, Any] | None = None
    if should_run:
        _notify_target(
            target=reply_target,
            message=f"\U0001f680 Starting execution\n\u23f3 Codex+Gemini translating\u2026",
            dry_run=args.dry_run_notify,
        )
        run_result = run_job_pipeline(
            job_id=job_id,
            work_root=work_root,
            kb_root=kb_root,
            notify_target=reply_target,
            dry_run_notify=args.dry_run_notify,
        )

    response = {
        "ok": True if (not should_run or (run_result and run_result.get("ok"))) else False,
        "mode": "task_bundle",
        "job_id": job_id,
        "sender": sender,
        "message_id": message_id,
        "raw_message_ref": raw_message_ref,
        "token_guard_applied": token_guard_applied,
        "saved_files": saved_files,
        "attachment_failures": failures,
        "docx_count": info.get("docx_count", 0),
        "files_count": info.get("files_count", 0),
        "status": "running" if should_run else "collecting",
        "hint": "Files were bundled into one job. Send 'run' to start processing." if not should_run else "Run started.",
    }
    if run_result is not None:
        response["run_result"] = run_result
    print(json.dumps(response, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
