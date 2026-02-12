#!/usr/bin/env python3
"""Quality gate for OpenClaw translation revision outputs."""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class QualityThresholds:
    judge_margin: float = 0.08
    term_hit: float = 0.92
    critical_changes: int = 5


def _safe_float(value: Any, fallback: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def _critical_section_changed(delta_pack: dict[str, Any], thresholds: QualityThresholds) -> bool:
    added = len(delta_pack.get("added", []))
    modified = len(delta_pack.get("modified", []))
    return added >= thresholds.critical_changes or modified >= thresholds.critical_changes


def evaluate_quality(
    model_scores: dict[str, Any],
    delta_pack: dict[str, Any],
    thresholds: QualityThresholds | None = None,
) -> dict[str, Any]:
    t = thresholds or QualityThresholds()

    judge_margin = _safe_float(model_scores.get("judge_margin"), 0.05)
    term_hit = _safe_float(model_scores.get("term_hit"), 0.90)
    critical_changed = _critical_section_changed(delta_pack, t)

    expansion_used = (
        judge_margin < t.judge_margin or term_hit < t.term_hit or critical_changed
    )

    return {
        "judge_margin": round(judge_margin, 4),
        "term_hit": round(term_hit, 4),
        "critical_section_changed": critical_changed,
        "expansion_used": expansion_used,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-scores-json", required=True)
    parser.add_argument("--delta-pack-json", required=True)
    args = parser.parse_args()

    model_scores = json.loads(args.model_scores_json)
    delta_pack = json.loads(args.delta_pack_json)

    result = evaluate_quality(model_scores=model_scores, delta_pack=delta_pack)
    print(json.dumps({"ok": True, "data": result}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
