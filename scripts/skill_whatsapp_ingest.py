#!/usr/bin/env python3
"""OpenClaw skill: ingest WhatsApp messages/files and create jobs."""

from __future__ import annotations

import argparse
import base64
import json
import shutil
from pathlib import Path
from typing import Any

from scripts.skill_approval import handle_command
from scripts.v4_pipeline import attach_file_to_job, create_job, run_job_pipeline
from scripts.v4_runtime import DEFAULT_KB_ROOT, DEFAULT_NOTIFY_TARGET, DEFAULT_WORK_ROOT, make_job_id


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
    return lowered.startswith("status ") or lowered.startswith("approve ") or lowered.startswith("reject ") or lowered.startswith("rerun ")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--payload-json")
    parser.add_argument("--payload-file")
    parser.add_argument("--payload-stdin", default="")
    parser.add_argument("--work-root", default=str(DEFAULT_WORK_ROOT))
    parser.add_argument("--kb-root", default=str(DEFAULT_KB_ROOT))
    parser.add_argument("--notify-target", default=DEFAULT_NOTIFY_TARGET)
    parser.add_argument("--auto-run", action="store_true")
    args = parser.parse_args()

    payload = _load_payload(args)
    text = _extract_text(payload)
    sender = _extract_sender(payload)

    if text and _is_command(text) and not _collect_attachments(payload):
        result = handle_command(
            command_text=text,
            work_root=Path(args.work_root),
            kb_root=Path(args.kb_root),
            target=args.notify_target,
        )
        print(json.dumps({"ok": bool(result.get("ok")), "mode": "command", "result": result}, ensure_ascii=False))
        return 0 if result.get("ok") else 1

    job_id = make_job_id("whatsapp")
    inbox_dir = Path(args.work_root).expanduser().resolve() / "_INBOX" / "whatsapp" / job_id
    inbox_dir.mkdir(parents=True, exist_ok=True)
    (inbox_dir / "message.txt").write_text(text, encoding="utf-8")
    (inbox_dir / "payload.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    envelope = create_job(
        source="whatsapp",
        sender=sender,
        subject="WhatsApp Task",
        message_text=text,
        inbox_dir=inbox_dir,
        job_id=job_id,
        work_root=Path(args.work_root),
    )

    attachments = _collect_attachments(payload)
    saved_files: list[str] = []
    for idx, item in enumerate(attachments, start=1):
        file_name = item.get("name") or item.get("fileName") or f"wa_attachment_{idx}"
        target_path = inbox_dir / file_name
        if item.get("path"):
            src = Path(str(item["path"])).expanduser()
            if src.exists():
                shutil.copy2(src, target_path)
            else:
                continue
        elif item.get("local_path"):
            src = Path(str(item["local_path"])).expanduser()
            if src.exists():
                shutil.copy2(src, target_path)
            else:
                continue
        elif item.get("content_base64"):
            target_path.write_bytes(base64.b64decode(item["content_base64"].encode("utf-8")))
        else:
            continue
        attach_file_to_job(work_root=Path(args.work_root), job_id=job_id, path=target_path)
        saved_files.append(str(target_path.resolve()))

    envelope["attachment_paths"] = saved_files
    if args.auto_run:
        envelope["run_result"] = run_job_pipeline(
            job_id=job_id,
            work_root=Path(args.work_root),
            kb_root=Path(args.kb_root),
            notify_target=args.notify_target,
        )

    print(json.dumps({"ok": True, "mode": "task", "job": envelope}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
