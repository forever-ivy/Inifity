#!/usr/bin/env python3
"""Build user-friendly status cards for WhatsApp responses."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def _read_intent_lang(review_dir: str) -> tuple[str, str]:
    if not review_dir:
        return "unknown", "unknown"
    plan_path = Path(review_dir) / ".system" / "execution_plan.json"
    if not plan_path.exists():
        return "unknown", "unknown"
    try:
        payload = json.loads(plan_path.read_text(encoding="utf-8"))
    except Exception:
        return "unknown", "unknown"

    intent = payload.get("plan_payload", {}).get("intent") or payload.get("intent") or {}
    src = str(intent.get("source_language") or "unknown").strip() or "unknown"
    tgt = str(intent.get("target_language") or "unknown").strip() or "unknown"
    return src, tgt


def _extract_missing(errors: list[str]) -> list[str]:
    out: list[str] = []
    for err in errors:
        token = str(err or "").strip()
        if token.startswith("missing:"):
            out.append(token.split(":", 1)[1].strip())
    return out


def next_action_for_status(status: str, *, require_new: bool = True) -> str:
    status_norm = (status or "").strip().lower()
    if status_norm in {"collecting", "received", "missing_inputs", "needs_revision"}:
        return "run"
    if status_norm in {"running"}:
        return "status"
    if status_norm in {"review_ready", "needs_attention", "failed", "incomplete_input"}:
        return "ok | no {reason} | rerun"
    if status_norm in {"verified"}:
        return "new" if require_new else "done"
    return "new" if require_new else "run"


def build_status_card(
    *,
    job: dict[str, Any],
    files_count: int,
    docx_count: int,
    multiple_hint: int = 0,
    require_new: bool = True,
) -> str:
    job_id = str(job.get("job_id") or "unknown")
    status = str(job.get("status") or "unknown")
    task_type = str(job.get("task_type") or "unknown")
    src_lang, tgt_lang = _read_intent_lang(str(job.get("review_dir") or ""))

    errors_raw = job.get("errors_json") if isinstance(job.get("errors_json"), list) else []
    missing_inputs = _extract_missing(errors_raw)
    if missing_inputs:
        inputs_line = f"Inputs: missing {', '.join(missing_inputs)}"
    else:
        inputs_line = f"Inputs: ready (files={files_count}, docx={docx_count})"

    rounds = int(job.get("iteration_count") or 0)
    double_pass = bool(job.get("double_pass"))
    progress_line = f"Progress: rounds={rounds} | double_pass={'yes' if double_pass else 'no'}"
    job_line = f"Job: {job_id}" + (f" (+{multiple_hint} pending)" if multiple_hint > 0 else "")

    lines = [
        job_line,
        f"Stage: {status}",
        f"Task: {task_type} ({src_lang}->{tgt_lang})",
        inputs_line,
        progress_line,
        f"Next: {next_action_for_status(status, require_new=require_new)}",
    ]
    return "\n".join(lines)


def no_active_job_hint(*, require_new: bool = True) -> str:
    if require_new:
        return "No active job. Send: new"
    return "No active job. Send files first, then run."
