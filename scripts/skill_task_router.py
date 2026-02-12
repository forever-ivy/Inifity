#!/usr/bin/env python3
"""OpenClaw skill: classify task and estimate runtime."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from scripts.openclaw_translation_orchestrator import run as run_translation
from scripts.task_bundle_builder import infer_language, infer_role, infer_version
from scripts.v4_kb import retrieve_kb
from scripts.v4_runtime import DEFAULT_WORK_ROOT, db_connect, ensure_runtime_paths, get_job, list_job_files, update_job_plan


def _build_candidates(job_files: list[dict[str, str]]) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    for item in job_files:
        path = Path(item["path"])
        if path.suffix.lower() != ".docx":
            continue
        out.append(
            {
                "path": str(path.resolve()),
                "name": path.name,
                "language": infer_language(path),
                "version": infer_version(path),
                "role": infer_role(path),
            }
        )
    return out


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--job-id", required=True)
    parser.add_argument("--work-root", default=str(DEFAULT_WORK_ROOT))
    parser.add_argument("--top-k", type=int, default=8)
    args = parser.parse_args()

    paths = ensure_runtime_paths(Path(args.work_root))
    conn = db_connect(paths)
    job = get_job(conn, args.job_id)
    if not job:
        conn.close()
        print(json.dumps({"ok": False, "error": f"job_not_found:{args.job_id}"}, ensure_ascii=False))
        return 2

    files = list_job_files(conn, args.job_id)
    candidates = _build_candidates(files)
    query = " ".join([job.get("subject", ""), job.get("message_text", "")]).strip()
    kb_hits = retrieve_kb(conn=conn, query=query, task_type="", top_k=args.top_k) if query else []

    meta = {
        "job_id": args.job_id,
        "source": job.get("source", ""),
        "sender": job.get("sender", ""),
        "subject": job.get("subject", ""),
        "message_text": job.get("message_text", ""),
        "root_path": str(paths.work_root.resolve()),
        "review_dir": str(Path(job["review_dir"]).resolve()),
        "candidate_files": candidates,
        "knowledge_context": kb_hits,
        "max_rounds": 3,
        "codex_available": True,
        "gemini_available": True,
    }
    plan_result = run_translation(meta, plan_only=True)
    plan = plan_result.get("plan", {})

    update_job_plan(
        conn,
        job_id=args.job_id,
        status=plan_result.get("status", "planned"),
        task_type=str(plan.get("task_type", "")),
        confidence=float(plan.get("confidence", 0.0)),
        estimated_minutes=int(plan.get("estimated_minutes", 0)),
        runtime_timeout_minutes=int(plan.get("time_budget_minutes", 0)),
    )
    plan_file = Path(job["review_dir"]) / ".system" / "execution_plan.json"
    plan_file.parent.mkdir(parents=True, exist_ok=True)
    plan_file.write_text(json.dumps(plan_result, ensure_ascii=False, indent=2), encoding="utf-8")
    conn.close()

    print(json.dumps({"ok": True, "job_id": args.job_id, "plan_result": plan_result, "meta": meta}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
