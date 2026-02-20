#!/usr/bin/env python3
"""Glossary management helper for UI browsing and curation.

This script exposes:
- list: browse extracted + custom glossary terms
- upsert: add/update a custom glossary term
- delete: hide a term (tombstone)
"""

from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from scripts.kb_glossary_enforcer import (
    _normalize_space,
    build_glossary_map,
    load_company_glossary_pairs,
    normalize_arabic,
    normalize_english,
)

SECTIONS = ["00_Glossary", "10_Style_Guide", "20_Domain_Knowledge", "30_Reference", "40_Templates"]
OVERRIDES_FILE = ".openclaw_glossary_overrides.json"


def utc_now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _norm_for_lang(text: str, lang: str) -> str:
    t = _normalize_space(text)
    l = (lang or "").strip().lower()
    if l.startswith("ar"):
        return normalize_arabic(t)
    if l.startswith("en"):
        return normalize_english(t)
    return t.lower()


def _term_key(*, company: str, source_lang: str, target_lang: str, source_text: str) -> str:
    return "|".join(
        [
            (company or "").strip().lower(),
            (source_lang or "").strip().lower(),
            (target_lang or "").strip().lower(),
            _norm_for_lang(source_text, source_lang),
        ]
    )


def discover_companies(kb_root: Path) -> list[str]:
    root = kb_root.expanduser().resolve()
    companies: set[str] = set()
    for section in SECTIONS:
        section_root = root / section
        if not section_root.exists() or not section_root.is_dir():
            continue
        for child in section_root.iterdir():
            if child.is_dir() and not child.name.startswith("."):
                companies.add(child.name)
    return sorted(companies, key=lambda s: s.lower())


def _override_path(*, kb_root: Path, company: str) -> Path:
    return kb_root.expanduser().resolve() / "00_Glossary" / company / OVERRIDES_FILE


def _read_overrides(*, kb_root: Path, company: str) -> list[dict[str, Any]]:
    path = _override_path(kb_root=kb_root, company=company)
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return []
    terms = data.get("terms")
    if not isinstance(terms, list):
        return []
    out: list[dict[str, Any]] = []
    for t in terms:
        if isinstance(t, dict):
            out.append(t)
    return out


def _write_overrides(*, kb_root: Path, company: str, terms: list[dict[str, Any]]) -> Path:
    path = _override_path(kb_root=kb_root, company=company)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "version": 1,
        "company": company,
        "updated_at": utc_now_iso(),
        "terms": terms,
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def _base_records_for_company(*, kb_root: Path, company: str) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    pairs, meta = load_company_glossary_pairs(kb_root=kb_root, company=company)
    gmap, conflicts = build_glossary_map(pairs)
    items: list[dict[str, Any]] = []
    for pair in gmap.values():
        items.append(
            {
                "company": company,
                "source_lang": "ar",
                "target_lang": "en",
                "language_pair": "ar-en",
                "source_text": pair.arabic,
                "target_text": pair.english,
                "origin": "extracted",
                "source_path": pair.source_path,
                "updated_at": None,
            }
        )
    meta_out = dict(meta)
    meta_out["conflicts"] = conflicts
    return items, meta_out


def list_terms(
    *,
    kb_root: Path,
    company: str | None = None,
    language_pair: str | None = None,
    query: str | None = None,
    limit: int = 500,
    offset: int = 0,
) -> dict[str, Any]:
    companies = [company.strip()] if company and company.strip() else discover_companies(kb_root)
    merged: dict[str, dict[str, Any]] = {}
    meta_by_company: dict[str, Any] = {}

    for c in companies:
        base_items, base_meta = _base_records_for_company(kb_root=kb_root, company=c)
        meta_by_company[c] = base_meta
        for item in base_items:
            key = _term_key(
                company=c,
                source_lang=item["source_lang"],
                target_lang=item["target_lang"],
                source_text=item["source_text"],
            )
            merged[key] = item

        for ov in _read_overrides(kb_root=kb_root, company=c):
            src_lang = str(ov.get("source_lang") or "ar").strip().lower() or "ar"
            tgt_lang = str(ov.get("target_lang") or "en").strip().lower() or "en"
            src_text = str(ov.get("source_text") or "").strip()
            tgt_text = str(ov.get("target_text") or "").strip()
            deleted = bool(ov.get("deleted"))
            if not src_text:
                continue
            key = _term_key(company=c, source_lang=src_lang, target_lang=tgt_lang, source_text=src_text)
            if deleted:
                merged.pop(key, None)
                continue
            merged[key] = {
                "company": c,
                "source_lang": src_lang,
                "target_lang": tgt_lang,
                "language_pair": f"{src_lang}-{tgt_lang}",
                "source_text": src_text,
                "target_text": tgt_text,
                "origin": "custom",
                "source_path": str(_override_path(kb_root=kb_root, company=c)),
                "updated_at": ov.get("updated_at"),
            }

    items = list(merged.values())
    lp = (language_pair or "").strip().lower()
    if lp:
        items = [x for x in items if str(x.get("language_pair") or "").strip().lower() == lp]

    q = (query or "").strip().lower()
    if q:
        items = [
            x
            for x in items
            if q in str(x.get("source_text") or "").lower()
            or q in str(x.get("target_text") or "").lower()
            or q in str(x.get("company") or "").lower()
        ]

    items.sort(
        key=lambda x: (
            str(x.get("company") or "").lower(),
            str(x.get("language_pair") or "").lower(),
            str(x.get("source_text") or "").lower(),
        )
    )
    total = len(items)
    safe_offset = max(0, int(offset))
    safe_limit = max(1, int(limit))
    items_page = items[safe_offset : safe_offset + safe_limit]
    language_pairs = sorted(
        {str(x.get("language_pair") or "").strip().lower() for x in items if str(x.get("language_pair") or "").strip()}
    )
    return {
        "total": total,
        "items": items_page,
        "companies": companies,
        "language_pairs": language_pairs,
        "meta_by_company": meta_by_company,
    }


def upsert_term(
    *,
    kb_root: Path,
    company: str,
    source_lang: str,
    target_lang: str,
    source_text: str,
    target_text: str,
) -> dict[str, Any]:
    c = company.strip()
    src_lang = source_lang.strip().lower()
    tgt_lang = target_lang.strip().lower()
    src = _normalize_space(source_text)
    tgt = _normalize_space(target_text)
    if not c:
        raise ValueError("company is required")
    if not src:
        raise ValueError("source_text is required")
    if not tgt:
        raise ValueError("target_text is required")

    terms = _read_overrides(kb_root=kb_root, company=c)
    key = _term_key(company=c, source_lang=src_lang, target_lang=tgt_lang, source_text=src)
    new_item = {
        "source_lang": src_lang,
        "target_lang": tgt_lang,
        "source_text": src,
        "target_text": tgt,
        "deleted": False,
        "updated_at": utc_now_iso(),
    }

    updated = False
    out: list[dict[str, Any]] = []
    for t in terms:
        t_key = _term_key(
            company=c,
            source_lang=str(t.get("source_lang") or "ar"),
            target_lang=str(t.get("target_lang") or "en"),
            source_text=str(t.get("source_text") or ""),
        )
        if t_key == key:
            out.append(new_item)
            updated = True
        else:
            out.append(t)
    if not updated:
        out.append(new_item)

    path = _write_overrides(kb_root=kb_root, company=c, terms=out)
    return {
        "ok": True,
        "path": str(path),
        "item": {
            "company": c,
            "source_lang": src_lang,
            "target_lang": tgt_lang,
            "language_pair": f"{src_lang}-{tgt_lang}",
            "source_text": src,
            "target_text": tgt,
            "origin": "custom",
            "source_path": str(path),
            "updated_at": new_item["updated_at"],
        },
    }


def delete_term(
    *,
    kb_root: Path,
    company: str,
    source_lang: str,
    target_lang: str,
    source_text: str,
) -> dict[str, Any]:
    c = company.strip()
    src_lang = source_lang.strip().lower()
    tgt_lang = target_lang.strip().lower()
    src = _normalize_space(source_text)
    if not c:
        raise ValueError("company is required")
    if not src:
        raise ValueError("source_text is required")

    terms = _read_overrides(kb_root=kb_root, company=c)
    key = _term_key(company=c, source_lang=src_lang, target_lang=tgt_lang, source_text=src)
    tombstone = {
        "source_lang": src_lang,
        "target_lang": tgt_lang,
        "source_text": src,
        "target_text": "",
        "deleted": True,
        "updated_at": utc_now_iso(),
    }

    updated = False
    out: list[dict[str, Any]] = []
    for t in terms:
        t_key = _term_key(
            company=c,
            source_lang=str(t.get("source_lang") or "ar"),
            target_lang=str(t.get("target_lang") or "en"),
            source_text=str(t.get("source_text") or ""),
        )
        if t_key == key:
            out.append(tombstone)
            updated = True
        else:
            out.append(t)
    if not updated:
        out.append(tombstone)

    path = _write_overrides(kb_root=kb_root, company=c, terms=out)
    return {"ok": True, "path": str(path)}


def main() -> int:
    parser = argparse.ArgumentParser(description="Glossary manager")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_list = sub.add_parser("list")
    p_list.add_argument("--kb-root", required=True)
    p_list.add_argument("--company", default="")
    p_list.add_argument("--language-pair", default="")
    p_list.add_argument("--query", default="")
    p_list.add_argument("--limit", type=int, default=500)
    p_list.add_argument("--offset", type=int, default=0)

    p_upsert = sub.add_parser("upsert")
    p_upsert.add_argument("--kb-root", required=True)
    p_upsert.add_argument("--company", required=True)
    p_upsert.add_argument("--source-lang", default="ar")
    p_upsert.add_argument("--target-lang", default="en")
    p_upsert.add_argument("--source-text", required=True)
    p_upsert.add_argument("--target-text", required=True)

    p_delete = sub.add_parser("delete")
    p_delete.add_argument("--kb-root", required=True)
    p_delete.add_argument("--company", required=True)
    p_delete.add_argument("--source-lang", default="ar")
    p_delete.add_argument("--target-lang", default="en")
    p_delete.add_argument("--source-text", required=True)

    args = parser.parse_args()
    kb_root = Path(str(args.kb_root)).expanduser().resolve()

    try:
        if args.cmd == "list":
            result = list_terms(
                kb_root=kb_root,
                company=(args.company or "").strip() or None,
                language_pair=(args.language_pair or "").strip() or None,
                query=(args.query or "").strip() or None,
                limit=int(args.limit),
                offset=int(args.offset),
            )
            print(json.dumps({"ok": True, "result": result}, ensure_ascii=False))
            return 0

        if args.cmd == "upsert":
            result = upsert_term(
                kb_root=kb_root,
                company=args.company,
                source_lang=args.source_lang,
                target_lang=args.target_lang,
                source_text=args.source_text,
                target_text=args.target_text,
            )
            print(json.dumps(result, ensure_ascii=False))
            return 0

        if args.cmd == "delete":
            result = delete_term(
                kb_root=kb_root,
                company=args.company,
                source_lang=args.source_lang,
                target_lang=args.target_lang,
                source_text=args.source_text,
            )
            print(json.dumps(result, ensure_ascii=False))
            return 0

        print(json.dumps({"ok": False, "error": f"unsupported cmd: {args.cmd}"}, ensure_ascii=False))
        return 2
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
