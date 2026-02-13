#!/usr/bin/env python3
"""End-to-end V5.2 pipeline helpers."""

from __future__ import annotations

import json
import re
import os
from pathlib import Path
from typing import Any

from scripts.openclaw_translation_orchestrator import run as run_translation
from scripts.task_bundle_builder import infer_language, infer_role, infer_version
from scripts.v4_kb import retrieve_kb_with_fallback, sync_kb_with_rag
from scripts.v4_runtime import (
    DEFAULT_NOTIFY_TARGET,
    RuntimePaths,
    add_job_file,
    append_log,
    db_connect,
    ensure_runtime_paths,
    get_job,
    json_dumps,
    list_job_files,
    record_event,
    set_sender_active_job,
    send_message,
    update_job_plan,
    update_job_result,
    update_job_status,
    write_job,
)


def notify_milestone(
    *,
    paths: RuntimePaths,
    conn,
    job_id: str,
    milestone: str,
    message: str,
    target: str | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    tgt = target or DEFAULT_NOTIFY_TARGET
    result = send_message(target=tgt, message=message, dry_run=dry_run)
    payload = {"target": tgt, "message": message, "send_result": result}
    record_event(conn, job_id=job_id, milestone=milestone, payload=payload)
    append_log(paths, "events.log", f"{milestone}\t{job_id}\t{message}")
    return result


def create_job(
    *,
    source: str,
    sender: str,
    subject: str,
    message_text: str,
    inbox_dir: Path,
    job_id: str,
    work_root: Path,
    active_sender: str | None = None,
) -> dict[str, Any]:
    paths = ensure_runtime_paths(work_root)
    conn = db_connect(paths)
    review_dir = paths.review_root / job_id
    review_dir.mkdir(parents=True, exist_ok=True)
    write_job(
        conn,
        job_id=job_id,
        source=source,
        sender=sender,
        subject=subject,
        message_text=message_text,
        status="received",
        inbox_dir=inbox_dir,
        review_dir=review_dir,
    )
    set_sender_active_job(conn, sender=sender, job_id=job_id)
    if active_sender and active_sender.strip():
        set_sender_active_job(conn, sender=active_sender.strip(), job_id=job_id)
    record_event(conn, job_id=job_id, milestone="received", payload={"source": source, "sender": sender, "subject": subject})
    conn.close()
    return {
        "job_id": job_id,
        "source": source,
        "from": sender,
        "subject": subject,
        "message_text": message_text,
        "inbox_dir": str(inbox_dir.resolve()),
        "review_dir": str(review_dir.resolve()),
        "status": "received",
    }


def attach_file_to_job(*, work_root: Path, job_id: str, path: Path, mime_type: str = "") -> None:
    paths = ensure_runtime_paths(work_root)
    conn = db_connect(paths)
    add_job_file(conn, job_id=job_id, path=path, mime_type=mime_type)
    conn.close()


def _build_candidates(job_files: list[dict[str, Any]]) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    for item in job_files:
        p = Path(item["path"])
        if p.suffix.lower() not in {".docx", ".xlsx", ".csv"}:
            continue
        candidates.append(
            {
                "path": str(p.resolve()),
                "name": p.name,
                "language": infer_language(p),
                "version": infer_version(p),
                "role": infer_role(p),
            }
        )
    return candidates


def _dedupe_hits(hits: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    seen: set[tuple[str, int]] = set()
    for hit in hits:
        path = str(hit.get("path") or "")
        chunk = int(hit.get("chunk_index") or 0)
        key = (path, chunk)
        if key in seen:
            continue
        seen.add(key)
        out.append(hit)
        if len(out) >= max(1, int(limit)):
            break
    return out


def _extract_message_id(payload: dict[str, Any], fallback_text: str = "") -> str:
    for key in ("message_id", "messageId", "id"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    message = payload.get("message")
    if isinstance(message, dict):
        for key in ("message_id", "messageId", "id"):
            value = message.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    if fallback_text:
        matched = re.search(r"\[message_id:\s*([^\]]+)\]", fallback_text, flags=re.IGNORECASE)
        if matched:
            return matched.group(1).strip()
    return ""


def _latest_message_meta(inbox_dir: Path) -> dict[str, Any]:
    payload_files = sorted(inbox_dir.glob("payload_*.json"), key=lambda p: p.stat().st_mtime_ns, reverse=True)
    if not payload_files:
        return {"message_id": "", "raw_message_ref": "", "token_guard_applied": False}
    payload_path = payload_files[0]
    try:
        payload = json.loads(payload_path.read_text(encoding="utf-8"))
    except Exception:
        return {"message_id": "", "raw_message_ref": str(payload_path.resolve()), "token_guard_applied": False}
    text_value = ""
    for key in ("text", "message", "body", "content"):
        candidate = payload.get(key)
        if isinstance(candidate, str) and candidate.strip():
            text_value = candidate
            break
    if not text_value and isinstance(payload.get("message"), dict):
        msg = payload["message"]
        for key in ("text", "body", "content"):
            candidate = msg.get(key)
            if isinstance(candidate, str) and candidate.strip():
                text_value = candidate
                break
    token_guard_applied = bool(payload.get("token_guard_applied", False))
    return {
        "message_id": _extract_message_id(payload, fallback_text=text_value),
        "raw_message_ref": str(payload_path.resolve()),
        "token_guard_applied": token_guard_applied,
    }


def run_job_pipeline(
    *,
    job_id: str,
    work_root: Path,
    kb_root: Path,
    notify_target: str | None = None,
    dry_run_notify: bool = False,
) -> dict[str, Any]:
    paths = ensure_runtime_paths(work_root)
    conn = db_connect(paths)
    job = get_job(conn, job_id)
    if not job:
        raise ValueError(f"Job not found: {job_id}")

    update_job_status(conn, job_id=job_id, status="running", errors=[])
    set_sender_active_job(conn, sender=job.get("sender", ""), job_id=job_id)

    notify_milestone(
        paths=paths,
        conn=conn,
        job_id=job_id,
        milestone="kb_sync_started",
        message=f"\U0001f4da KB syncing...\n\U0001f194 {job_id}",
        target=notify_target,
        dry_run=dry_run_notify,
    )
    kb_report_path = paths.kb_system_root / "kb_sync_latest.json"
    kb_sync_result = sync_kb_with_rag(
        conn=conn,
        kb_root=kb_root,
        report_path=kb_report_path,
        rag_backend=str(os.getenv("OPENCLAW_RAG_BACKEND", "clawrag")).strip().lower(),
        rag_base_url=str(os.getenv("OPENCLAW_RAG_BASE_URL", "http://127.0.0.1:8080")).strip(),
        rag_collection=str(os.getenv("OPENCLAW_RAG_COLLECTION", "translation-kb")).strip() or "translation-kb",
    )
    kb_report = dict(kb_sync_result.get("local_report") or {})
    rag_sync_report = dict(kb_sync_result.get("rag_report") or {})
    notify_milestone(
        paths=paths,
        conn=conn,
        job_id=job_id,
        milestone="kb_sync_done",
        message=f"\U0001f4da KB ready\nNew {kb_report['created']} \u00b7 Updated {kb_report['updated']} \u00b7 Skipped {kb_report['skipped']}",
        target=notify_target,
        dry_run=dry_run_notify,
    )
    files = list_job_files(conn, job_id)
    candidates = _build_candidates(files)
    review_dir = Path(job["review_dir"]).resolve()
    review_dir.mkdir(parents=True, exist_ok=True)
    inbox_dir = Path(str(job.get("inbox_dir") or "")).expanduser().resolve()
    message_meta = _latest_message_meta(inbox_dir) if str(job.get("source", "")) in ("telegram", "whatsapp") else {}
    strict_router_enabled = str(
        os.getenv("OPENCLAW_STRICT_ROUTER") or os.getenv("OPENCLAW_WA_STRICT_ROUTER", "1")
    ).strip().lower() not in {"0", "false", "off", "no"}
    router_mode = "strict" if strict_router_enabled else "hybrid"

    if not candidates:
        update_job_status(conn, job_id=job_id, status="incomplete_input", errors=["no_supported_attachments"])
        notify_milestone(
            paths=paths,
            conn=conn,
            job_id=job_id,
            milestone="failed",
            message=f"\U0001f4ed No supported files\n\U0001f194 {job_id}\nSupported: .docx .xlsx .csv",
            target=notify_target,
            dry_run=dry_run_notify,
        )
        conn.close()
        return {"ok": False, "job_id": job_id, "status": "incomplete_input", "errors": ["no_supported_attachments"]}

    query = " ".join([job.get("subject", ""), job.get("message_text", "")]).strip()
    kb_hits: list[dict[str, Any]] = []
    knowledge_backend = "local"
    pre_status_flags: list[str] = []
    if query:
        rag_fetch = retrieve_kb_with_fallback(
            conn=conn,
            query=query,
            task_type="",
            rag_backend=str(os.getenv("OPENCLAW_RAG_BACKEND", "clawrag")).strip().lower(),
            rag_base_url=str(os.getenv("OPENCLAW_RAG_BASE_URL", "http://127.0.0.1:8080")).strip(),
            rag_collection=str(os.getenv("OPENCLAW_RAG_COLLECTION", "translation-kb")).strip() or "translation-kb",
            top_k_clawrag=12,
            top_k_local=8,
        )
        kb_hits = _dedupe_hits(list(rag_fetch.get("hits") or []), limit=12 if rag_fetch.get("backend") == "clawrag" else 8)
        knowledge_backend = str(rag_fetch.get("backend") or "local")
        pre_status_flags.extend([str(x) for x in (rag_fetch.get("status_flags") or []) if str(x)])

    record_event(
        conn,
        job_id=job_id,
        milestone="kb_retrieve_done",
        payload={
            "query": query,
            "hit_count": len(kb_hits),
            "backend": knowledge_backend,
            "hits": kb_hits[:12],
            "rag_sync_report": rag_sync_report,
        },
    )
    notify_milestone(
        paths=paths,
        conn=conn,
        job_id=job_id,
        milestone="kb_retrieve_done",
        message=f"\U0001f50d KB retrieval done \u00b7 {len(kb_hits)} hits",
        target=notify_target,
        dry_run=dry_run_notify,
    )

    meta = {
        "job_id": job_id,
        "root_path": str(paths.work_root.resolve()),
        "review_dir": str(review_dir),
        "source": job.get("source", ""),
        "sender": job.get("sender", ""),
        "message_id": message_meta.get("message_id", ""),
        "raw_message_ref": message_meta.get("raw_message_ref", ""),
        "subject": job.get("subject", ""),
        "message_text": job.get("message_text", ""),
        "candidate_files": candidates,
        "knowledge_context": kb_hits,
        "knowledge_backend": knowledge_backend,
        "max_rounds": 3,
        "codex_available": True,
        "gemini_available": True,
        "router_mode": router_mode,
        "token_guard_applied": bool(message_meta.get("token_guard_applied", False)),
        "status_flags_seed": pre_status_flags,
    }

    plan = run_translation(meta, plan_only=True)
    intent = plan.get("intent") or {}
    if plan.get("plan"):
        p = plan["plan"]
        update_job_plan(
            conn,
            job_id=job_id,
            status=plan.get("status", "planned"),
            task_type=p.get("task_type", ""),
            confidence=float(p.get("confidence", 0.0)),
            estimated_minutes=int(p.get("estimated_minutes", 0)),
            runtime_timeout_minutes=int(p.get("time_budget_minutes", 0)),
        )
    plan_file = review_dir / ".system" / "execution_plan.json"
    plan_file.parent.mkdir(parents=True, exist_ok=True)
    plan_file.write_text(json_dumps(plan), encoding="utf-8")
    notify_milestone(
        paths=paths,
        conn=conn,
        job_id=job_id,
        milestone="intent_classified",
        message=(
            f"\U0001f9e0 Intent classified\n"
            f"Type: {plan.get('plan', {}).get('task_type', 'unknown')} \u00b7 "
            f"Est: {plan.get('estimated_minutes', 0)}m"
        ),
        target=notify_target,
        dry_run=dry_run_notify,
    )
    if plan.get("status") == "missing_inputs":
        missing = intent.get("missing_inputs") or []
        update_job_status(conn, job_id=job_id, status="missing_inputs", errors=[f"missing:{x}" for x in missing])
        notify_milestone(
            paths=paths,
            conn=conn,
            job_id=job_id,
            milestone="missing_inputs",
            message=f"\U0001f4ed Missing inputs: {', '.join(missing) if missing else 'unknown'}\nPlease upload, then send: run",
            target=notify_target,
            dry_run=dry_run_notify,
        )
        conn.close()
        return {
            "ok": False,
            "job_id": job_id,
            "status": "missing_inputs",
            "intent": intent,
            "errors": [f"missing:{x}" for x in missing],
        }

    notify_milestone(
        paths=paths,
        conn=conn,
        job_id=job_id,
        milestone="running",
        message=f"\U0001f680 Translation started\n\U0001f194 {job_id}\nCodex+Gemini up to 3 rounds",
        target=notify_target,
        dry_run=dry_run_notify,
    )
    result = run_translation(meta, plan_only=False)

    update_job_result(
        conn,
        job_id=job_id,
        status=result.get("status", "failed"),
        iteration_count=int(result.get("iteration_count", 0)),
        double_pass=bool(result.get("double_pass")),
        status_flags=list(result.get("status_flags", [])),
        artifacts=dict(result.get("artifacts", {})),
        errors=list(result.get("errors", [])),
    )

    if result.get("status") == "review_ready":
        rounds = (((result.get("quality_report") or {}).get("rounds")) or [])
        for rd in rounds:
            rd_no = rd.get("round")
            if not rd_no:
                continue
            notify_milestone(
                paths=paths,
                conn=conn,
                job_id=job_id,
                milestone=f"round_{rd_no}_done",
                message=f"\U0001f504 Round {rd_no} done\nCodex: {'\u2705' if rd.get('codex_pass') else '\u274c'} \u00b7 Gemini: {'\u2705' if rd.get('gemini_pass') else '\u274c'}",
                target=notify_target,
                dry_run=dry_run_notify,
            )
        notify_milestone(
            paths=paths,
            conn=conn,
            job_id=job_id,
            milestone="review_ready",
            message=(
                f"\u2705 Translation complete, ready for review\n"
                f"\U0001f194 {job_id}\n"
                f"\U0001f4c1 {result.get('review_dir')}\n\n"
                f"Send: ok \u00b7 no {{reason}} \u00b7 rerun"
            ),
            target=notify_target,
            dry_run=dry_run_notify,
        )
    elif result.get("status") in {"needs_attention", "failed"}:
        rounds = (((result.get("quality_report") or {}).get("rounds")) or [])
        for rd in rounds:
            rd_no = rd.get("round")
            if not rd_no:
                continue
            notify_milestone(
                paths=paths,
                conn=conn,
                job_id=job_id,
                milestone=f"round_{rd_no}_done",
                message=f"\U0001f504 Round {rd_no} done\nCodex: {'\u2705' if rd.get('codex_pass') else '\u274c'} \u00b7 Gemini: {'\u2705' if rd.get('gemini_pass') else '\u274c'}",
                target=notify_target,
                dry_run=dry_run_notify,
            )
        notify_milestone(
            paths=paths,
            conn=conn,
            job_id=job_id,
            milestone="needs_attention",
            message=f"\u26a0\ufe0f Needs attention\n\U0001f194 {job_id}\nSend: status \u00b7 rerun \u00b7 no {{reason}}",
            target=notify_target,
            dry_run=dry_run_notify,
        )
    else:
        notify_milestone(
            paths=paths,
            conn=conn,
            job_id=job_id,
            milestone="failed",
            message=f"\u274c Execution failed\n\U0001f194 {job_id}\n\U0001f4a1 Send: rerun to retry",
            target=notify_target,
            dry_run=dry_run_notify,
        )

    conn.close()
    return result
