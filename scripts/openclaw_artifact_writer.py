#!/usr/bin/env python3
"""Write OpenClaw translation artifacts into review folder."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from scripts.compose_docx_from_draft import build_doc


def _write_text(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value, encoding="utf-8")


def _write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


def build_task_brief(job_id: str, delta_pack: dict[str, Any], quality: dict[str, Any]) -> str:
    added = len(delta_pack.get("added", []))
    removed = len(delta_pack.get("removed", []))
    modified = len(delta_pack.get("modified", []))

    lines = [
        "# Task Brief",
        "",
        f"- Job: {job_id}",
        f"- Added blocks: {added}",
        f"- Removed blocks: {removed}",
        f"- Modified blocks: {modified}",
        f"- Judge margin: {quality.get('judge_margin', 'n/a')}",
        f"- Terminology hit: {quality.get('term_hit', 'n/a')}",
        f"- Expansion used: {quality.get('expansion_used', False)}",
        "",
        "## Next Steps",
        "1. Open English V2 Draft.docx and edit manually in Word.",
        "2. Save manual file as *_manual*.docx (or *_edited*.docx) in this same review folder.",
        "3. Use approve_manual callback to finalize delivery.",
    ]

    return "\n".join(lines)


def write_artifacts(
    review_dir: str,
    english_template_path: str,
    draft_text: str,
    delta_pack: dict[str, Any],
    model_scores: dict[str, Any],
    quality: dict[str, Any],
    job_id: str,
) -> dict[str, str]:
    review = Path(review_dir)
    review.mkdir(parents=True, exist_ok=True)

    draft_docx = review / "English V2 Draft.docx"
    task_brief = review / "Task Brief.md"
    delta_summary = review / "Delta Summary.json"
    model_scores_json = review / "Model Scores.json"

    build_doc(Path(english_template_path), draft_docx, draft_text)
    _write_text(task_brief, build_task_brief(job_id=job_id, delta_pack=delta_pack, quality=quality))
    _write_json(delta_summary, delta_pack)
    _write_json(model_scores_json, model_scores)

    return {
        "draft_docx": str(draft_docx.resolve()),
        "task_brief_md": str(task_brief.resolve()),
        "delta_summary_json": str(delta_summary.resolve()),
        "model_scores_json": str(model_scores_json.resolve()),
    }
