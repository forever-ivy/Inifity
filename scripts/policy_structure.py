#!/usr/bin/env python3
"""Extract policy-like section structure from DOCX files."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from docx import Document
from docx.oxml.table import CT_Tbl
from docx.oxml.text.paragraph import CT_P
from docx.table import Table
from docx.text.paragraph import Paragraph

from scripts.v4_runtime import compute_sha256

POLICY_STRUCT_VERSION = "policy_struct.v1"

_RE_PAGE = re.compile(r"^\d+\s*\|\s*P\s*a\s*g\s*e$", re.IGNORECASE)
_RE_TOC_DOTS = re.compile(r"\.{6,}\s*\d+$")
_RE_H1 = re.compile(r"^(\d+)\s+(.+)$")
_RE_H2 = re.compile(r"^(\d+\.\d+\.)\s+(.+)$")
_RE_H3 = re.compile(r"^(\d+\.\d+\.\d+\.)\s+(.+)$")
_RE_DOTTED_LIST = re.compile(r"^(\d+)\.\s+(.+)$")
_RE_ANY_SECTION = re.compile(r"^\d+\.\d+\.")


@dataclass
class _SectionRow:
    section_id: str
    parent_id: str
    level: int
    number: str
    title: str
    start_idx: int
    end_idx: int
    section_path: str = ""


def _normalize_text(text: str) -> str:
    value = text.replace("\u00a0", " ")
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def _is_noise_line(text: str) -> bool:
    raw = _normalize_text(text)
    if not raw:
        return True
    lowered = raw.lower()
    if lowered in {
        "treasury operations policy",
        "table of contents",
        "list of tables",
        "list of figures",
    }:
        return True
    if _RE_PAGE.match(raw):
        return True
    if _RE_TOC_DOTS.search(raw):
        return True
    return False


def _extract_ordered_lines(doc: Document) -> list[str]:
    lines: list[str] = []
    for child in doc.element.body.iterchildren():
        if isinstance(child, CT_P):
            para = Paragraph(child, doc)
            text = _normalize_text(para.text)
            if text:
                lines.append(text)
        elif isinstance(child, CT_Tbl):
            table = Table(child, doc)
            for row in table.rows:
                cells = [_normalize_text(cell.text.replace("\n", " / ")) for cell in row.cells]
                row_text = " | ".join([cell for cell in cells if cell])
                if row_text:
                    lines.append(row_text)
    return lines


def _find_body_start(lines: list[str]) -> int:
    """Find first likely body line, defaulting to 0."""
    for idx, line in enumerate(lines):
        if not _RE_H1.match(line):
            continue
        if not re.match(r"^\d+\s+[A-Z]", line):
            continue
        lookahead = lines[idx + 1 : idx + 31]
        if any(_RE_ANY_SECTION.match(item) for item in lookahead):
            return idx
    return 0


def _heading_from_line(line: str, prev_line: str, next_line: str) -> tuple[int, str, str] | None:
    m3 = _RE_H3.match(line)
    if m3:
        number = str(m3.group(1)).strip(".")
        title = _normalize_text(m3.group(2))
        if title:
            return 3, number, title

    m2 = _RE_H2.match(line)
    if m2:
        number = str(m2.group(1)).strip(".")
        title = _normalize_text(m2.group(2))
        if title:
            return 2, number, title

    m1 = _RE_H1.match(line)
    if m1:
        number = str(m1.group(1)).strip(".")
        title = _normalize_text(m1.group(2))
        if title:
            return 1, number, title

    dotted = _RE_DOTTED_LIST.match(line)
    if not dotted:
        return None
    number = str(dotted.group(1)).strip(".")
    title = _normalize_text(dotted.group(2))
    if not number or not title:
        return None
    # Treat dotted "1." as heading only when surrounded by section-like headings.
    has_prev_section = bool(prev_line and (_RE_H1.match(prev_line) or _RE_H2.match(prev_line) or _RE_H3.match(prev_line)))
    has_next_section = bool(next_line and (_RE_H1.match(next_line) or _RE_H2.match(next_line) or _RE_H3.match(next_line)))
    if has_prev_section and has_next_section:
        return 1, number, title
    return None


def _build_sections(lines: list[str]) -> list[_SectionRow]:
    sections: list[_SectionRow] = []
    for idx, line in enumerate(lines):
        prev_line = lines[idx - 1] if idx > 0 else ""
        next_line = lines[idx + 1] if idx + 1 < len(lines) else ""
        heading = _heading_from_line(line, prev_line=prev_line, next_line=next_line)
        if not heading:
            continue
        level, number, title = heading
        parent_id = ""
        if "." in number:
            parent_id = number.rsplit(".", 1)[0]
        sections.append(
            _SectionRow(
                section_id=number,
                parent_id=parent_id,
                level=level,
                number=number,
                title=title,
                start_idx=idx + 1,
                end_idx=idx + 1,
            )
        )
    if not sections:
        return sections

    for idx, row in enumerate(sections):
        next_start = sections[idx + 1].start_idx if idx + 1 < len(sections) else (len(lines) + 1)
        row.end_idx = max(row.start_idx, next_start - 1)

    index_by_id = {row.section_id: row for row in sections}
    for row in sections:
        if not row.parent_id:
            row.section_path = f"{row.number} {row.title}".strip()
            continue
        chain: list[str] = []
        seen: set[str] = set()
        current_id = row.section_id
        while current_id and current_id not in seen:
            seen.add(current_id)
            node = index_by_id.get(current_id)
            if not node:
                break
            chain.append(f"{node.number} {node.title}".strip())
            current_id = node.parent_id
        chain.reverse()
        row.section_path = " > ".join(chain) if chain else f"{row.number} {row.title}".strip()

    return sections


def _chunk_section_lines(lines: list[str], *, max_chars: int, overlap_chars: int) -> list[str]:
    chunks: list[str] = []
    current = ""
    for line in lines:
        if not line:
            continue
        if not current:
            current = line
            continue
        candidate = f"{current}\n{line}"
        if len(candidate) <= max_chars:
            current = candidate
            continue
        chunks.append(current)
        tail = current[-overlap_chars:] if overlap_chars > 0 and len(current) > overlap_chars else current
        current = f"{tail}\n{line}" if tail else line
        if len(current) > max_chars:
            chunks.append(current[:max_chars])
            current = current[max(0, max_chars - overlap_chars) :]
    if current:
        chunks.append(current)
    return [_normalize_text(item) for item in chunks if _normalize_text(item)]


def sidecar_path_for_doc(doc_path: Path) -> Path:
    return Path(f"{doc_path}.{POLICY_STRUCT_VERSION}.json")


def extract_policy_structure(
    docx_path: Path,
    *,
    chunk_max_chars: int = 1000,
    chunk_overlap_chars: int = 120,
) -> dict[str, Any]:
    doc_path = Path(docx_path).expanduser().resolve()
    doc = Document(str(doc_path))

    ordered = _extract_ordered_lines(doc)
    cleaned = [line for line in ordered if not _is_noise_line(line)]
    start_idx = _find_body_start(cleaned)
    body_lines = cleaned[start_idx:] if start_idx < len(cleaned) else []

    sections = _build_sections(body_lines)
    section_heading_count = len(sections)
    max_level = max([row.level for row in sections], default=0)
    is_policy_like = bool(section_heading_count >= 8 and max_level >= 2)

    chunk_rows: list[dict[str, Any]] = []
    for section in sections:
        slice_start = max(1, section.start_idx) - 1
        slice_end = max(section.start_idx, section.end_idx)
        section_lines = body_lines[slice_start:slice_end]
        section_chunks = _chunk_section_lines(
            section_lines,
            max_chars=chunk_max_chars,
            overlap_chars=chunk_overlap_chars,
        )
        for text in section_chunks:
            chunk_rows.append(
                {
                    "chunk_index": len(chunk_rows),
                    "text": text,
                    "section_id": section.section_id,
                    "section_number": section.number,
                    "section_title": section.title,
                    "section_path": section.section_path,
                    "section_level": section.level,
                }
            )

    payload: dict[str, Any] = {
        "doc_path": str(doc_path),
        "doc_sha256": compute_sha256(doc_path),
        "policy_version": POLICY_STRUCT_VERSION,
        "is_policy_like": is_policy_like,
        "section_heading_count": section_heading_count,
        "max_level": max_level,
        "line_count": len(body_lines),
        "sections": [
            {
                "section_id": row.section_id,
                "parent_id": row.parent_id,
                "level": row.level,
                "number": row.number,
                "title": row.title,
                "start_idx": row.start_idx,
                "end_idx": row.end_idx,
                "section_path": row.section_path,
            }
            for row in sections
        ],
        "chunks": chunk_rows,
    }
    return payload


def build_policy_sidecar(
    docx_path: Path,
    *,
    chunk_max_chars: int = 1000,
    chunk_overlap_chars: int = 120,
) -> tuple[dict[str, Any], Path]:
    payload = extract_policy_structure(
        Path(docx_path),
        chunk_max_chars=chunk_max_chars,
        chunk_overlap_chars=chunk_overlap_chars,
    )
    sidecar_path = sidecar_path_for_doc(Path(docx_path).expanduser().resolve())
    sidecar_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return payload, sidecar_path

