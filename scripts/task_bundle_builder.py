#!/usr/bin/env python3
"""Build a task bundle by discovering and classifying translation task documents."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

KNOWN_SUBFOLDERS = {
    "source": "Source",                  # Generic source folder
    "arabic_source": "Arabic Source",    # Backward compatible
    "glossary": "Glossery",
    "previously_translated": "Previously Translated",
    "translated_output": "Translated",   # Generic output folder
    "translated_en": "Translated -EN",   # Backward compatible
}


def is_arabic_name(name: str) -> bool:
    return bool(re.search(r"[\u0600-\u06ff]", name))


_LANG_TOKENS: list[tuple[str, list[str]]] = [
    ("fr", ["french", "français", "francais", "fr_", "_fr", "fr-", "-fr"]),
    ("es", ["spanish", "español", "espanol", "es_", "_es", "es-", "-es"]),
    ("de", ["german", "deutsch", "de_", "_de", "de-", "-de"]),
    ("pt", ["portuguese", "português", "portugues", "pt_", "_pt", "pt-", "-pt"]),
    ("zh", ["chinese", "中文", "zh_", "_zh", "zh-", "-zh"]),
    ("tr", ["turkish", "türkçe", "turkce", "tr_", "_tr", "tr-", "-tr"]),
]


def infer_language(path: Path) -> str:
    name = path.name
    lowered = name.lower()
    if is_arabic_name(name):
        return "ar"
    if any(token in lowered for token in ("arabic", "ar_", "_ar", "ar-")):
        return "ar"
    for lang_code, tokens in _LANG_TOKENS:
        if any(token in lowered for token in tokens):
            return lang_code
    return "en"


def infer_version(path: Path) -> str:
    lowered = path.name.lower()
    if re.search(r"(^|[\s_\-\[\(])v1([\s_\-\]\)]|$)", lowered):
        return "v1"
    if re.search(r"(^|[\s_\-\[\(])v2([\s_\-\]\)]|$)", lowered):
        return "v2"
    if re.search(r"(^|[\s_\-\[\(])v3([\s_\-\]\)]|$)", lowered):
        return "v3"
    return "unknown"


def infer_role(path: Path) -> str:
    lowered_full = str(path).lower()
    lowered_name = path.name.lower()
    if "/_review/" in lowered_full or "/_verify/" in lowered_full or "/.system/" in lowered_full:
        return "generated"
    if "glossery" in lowered_full or "glossary" in lowered_full:
        return "glossary"
    if "previously translated" in lowered_full:
        return "reference_translation"
    # Generic translated output folder (e.g., "Translated/")
    if "/translated/" in lowered_full and "/translated -" not in lowered_full:
        return "translated_output"
    if "translated -en" in lowered_full:
        return "translated_output"
    # Generic source folder (e.g., "Source/")
    if "/source/" in lowered_full or "arabic source" in lowered_full:
        return "source"
    if any(t in lowered_name for t in ("survey", "questionnaire", "استبانة")):
        return "survey"
    return "general"


def classify_legacy_slot(path: Path) -> str | None:
    """Dynamically classify a file into a legacy slot based on detected language/version.

    Returns slot names like "ar_v1", "fr_v2", "en_v1" based on language detection.
    Falls back to legacy Arabic/English naming for backward compatibility.
    """
    name = path.name.lower()
    lang = infer_language(path)
    version = infer_version(path)

    # Backward compatibility: maintain legacy slot names for ar/en
    if lang == "ar" and version == "v2":
        return "arabic_v2"
    if lang == "ar" and version == "v1":
        return "arabic_v1"
    if lang == "en" and version == "v1":
        # Legacy check for English-specific keywords
        if "english" in name or "ai readiness" in name or "quantitative" in name:
            return "english_v1"
        # Also support generic English detection
        return "english_v1"

    # Dynamic slot for other languages: {lang}_{version} (e.g., fr_v1, zh_v2)
    if lang != "unknown" and version != "unknown":
        return f"{lang}_{version}"
    return None


def discover_docx(root: Path) -> list[Path]:
    candidates: list[Path] = []
    for p in root.rglob("*.docx"):
        if "~$" in p.name:
            continue
        lowered = str(p).lower()
        if "/_review/" in lowered or "/_verify/" in lowered or "/.system/" in lowered:
            continue
        candidates.append(p)
    candidates.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return candidates


def build_bundle(root: Path, job_id: str) -> dict[str, Any]:
    files = discover_docx(root)
    legacy_mapping: dict[str, Path] = {}

    candidate_files: list[dict[str, Any]] = []
    for doc in files:
        stat = doc.stat()
        language = infer_language(doc)
        version = infer_version(doc)
        role = infer_role(doc)
        source_folder = "root"
        for key, folder in KNOWN_SUBFOLDERS.items():
            if f"/{folder.lower()}/" in str(doc).lower():
                source_folder = key
                break

        candidate_files.append(
            {
                "path": str(doc.resolve()),
                "name": doc.name,
                "language": language,
                "version": version,
                "role": role,
                "source_folder": source_folder,
                "mtime_ns": stat.st_mtime_ns,
                "size_bytes": stat.st_size,
            }
        )

        legacy_slot = classify_legacy_slot(doc)
        if legacy_slot and legacy_slot not in legacy_mapping:
            legacy_mapping[legacy_slot] = doc

    # Dynamically determine required legacy slots from discovered candidates
    # instead of hard-coding arabic_v1, arabic_v2, english_v1
    required_legacy = sorted(legacy_mapping.keys())

    # For backward compatibility, ensure ar/en slots are present if any candidates exist
    # (this maintains the old behavior when no language-specific files are found)
    if not required_legacy and candidate_files:
        # Default legacy slots for ar→en workflow
        required_legacy = ["arabic_v1", "arabic_v2", "english_v1"]

    missing_legacy = [k for k in required_legacy if k not in legacy_mapping]

    bundle_files: dict[str, Any] = {}
    for key in required_legacy:
        if key in legacy_mapping:
            bundle_files[key] = {
                "path": str(legacy_mapping[key].resolve()),
                "name": legacy_mapping[key].name,
            }
        else:
            bundle_files[key] = None

    language_counts: dict[str, int] = {}
    for item in candidate_files:
        lang = item["language"]
        language_counts[lang] = language_counts.get(lang, 0) + 1

    role_counts: dict[str, int] = {}
    for item in candidate_files:
        role = item["role"]
        role_counts[role] = role_counts.get(role, 0) + 1

    return {
        "job_id": job_id,
        "root": str(root.resolve()),
        "valid": len(candidate_files) > 0,
        "missing": [] if candidate_files else ["no_docx_found"],
        "files": bundle_files,
        "legacy_missing": missing_legacy,
        "candidate_files": candidate_files,
        "stats": {
            "doc_count": len(candidate_files),
            "language_counts": language_counts,
            "role_counts": role_counts,
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True, help="Task root folder")
    parser.add_argument("--job-id", required=True, help="Job ID")
    parser.add_argument("--output", help="Output JSON file")
    args = parser.parse_args()

    root = Path(args.root)
    if not root.exists():
        print(json.dumps({"ok": False, "error": f"Missing root: {root}"}), file=sys.stderr)
        return 2

    payload = build_bundle(root, args.job_id)

    if args.output:
        out = Path(args.output)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps({"ok": True, "data": payload}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
