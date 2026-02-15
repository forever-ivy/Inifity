#!/usr/bin/env python3
"""Output sanity checks for translation artifacts.

Primary use: detect Markdown leakage into Final outputs.
"""

from __future__ import annotations

import re
from typing import Any


_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("fenced_code", re.compile(r"```")),
    ("heading", re.compile(r"(?m)^\s{0,3}#{1,6}\s+\S+")),
    ("md_list_dash", re.compile(r"(?m)^\s*-\s+\S+")),
    ("md_list_star", re.compile(r"(?m)^\s*\*\s+\S+")),
    ("md_link", re.compile(r"\[[^\]]+\]\([^)]+\)")),
    ("bold_asterisk", re.compile(r"\*\*[^*\n]{1,200}\*\*")),
    ("bold_underscore", re.compile(r"__[^_\n]{1,200}__")),
    ("inline_code", re.compile(r"`[^`\n]{1,200}`")),
    ("table_separator", re.compile(r"(?m)^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$")),
]


def _snip(text: str, start: int, end: int, *, radius: int = 60) -> str:
    s = max(0, start - radius)
    e = min(len(text), end + radius)
    snippet = text[s:e].replace("\n", "\\n")
    if s > 0:
        snippet = "…" + snippet
    if e < len(text):
        snippet = snippet + "…"
    return snippet


def scan_markdown(text: str, *, max_examples: int = 3) -> dict[str, Any]:
    raw = str(text or "")
    patterns_found: list[str] = []
    examples: list[dict[str, str]] = []
    for name, pattern in _PATTERNS:
        matched = pattern.search(raw)
        if not matched:
            continue
        patterns_found.append(name)
        if len(examples) < max_examples:
            examples.append(
                {
                    "pattern": name,
                    "example": _snip(raw, matched.start(), matched.end()),
                }
            )
    return {
        "has_markdown": bool(patterns_found),
        "patterns": patterns_found,
        "examples": examples,
        "length": len(raw),
    }


def scan_markdown_in_translation_maps(draft: dict[str, Any] | None) -> dict[str, Any]:
    payload = draft or {}
    out: dict[str, Any] = {}
    out["final_text"] = scan_markdown(str(payload.get("final_text") or ""))
    out["final_reflow_text"] = scan_markdown(str(payload.get("final_reflow_text") or ""))

    def _scan_map(entries: Any) -> dict[str, Any]:
        # Only scan a bounded sample to avoid huge memory use on very large spreadsheets.
        patterns: set[str] = set()
        examples: list[dict[str, str]] = []
        scanned = 0

        def _consume(text: str) -> None:
            nonlocal examples
            result = scan_markdown(text, max_examples=1)
            if not result["has_markdown"]:
                return
            patterns.update(result["patterns"])
            if result["examples"] and len(examples) < 3:
                examples.extend(result["examples"])

        if isinstance(entries, dict):
            for _k, v in list(entries.items())[:400]:
                _consume(str(v or ""))
                scanned += 1
        elif isinstance(entries, list):
            for item in entries[:2000]:
                if not isinstance(item, dict):
                    continue
                _consume(str(item.get("text") or ""))
                scanned += 1

        return {
            "has_markdown": bool(patterns),
            "patterns": sorted(patterns),
            "examples": examples[:3],
            "scanned_items": scanned,
        }

    out["docx_translation_map"] = _scan_map(payload.get("docx_translation_map"))
    out["xlsx_translation_map"] = _scan_map(payload.get("xlsx_translation_map"))

    has_any = any(bool(v.get("has_markdown")) for v in out.values() if isinstance(v, dict))
    all_patterns: set[str] = set()
    for v in out.values():
        if isinstance(v, dict):
            for p in v.get("patterns") or []:
                all_patterns.add(str(p))

    return {
        "has_markdown": has_any,
        "patterns": sorted(all_patterns),
        "by_field": out,
    }

