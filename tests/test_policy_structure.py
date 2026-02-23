#!/usr/bin/env python3

import tempfile
import unittest
from pathlib import Path

from docx import Document

from scripts.policy_structure import extract_policy_structure


def _write_docx(path: Path, lines: list[str]) -> None:
    doc = Document()
    for line in lines:
        doc.add_paragraph(line)
    path.parent.mkdir(parents=True, exist_ok=True)
    doc.save(path)


class PolicyStructureTest(unittest.TestCase):
    def test_policy_noise_removed(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "policy.docx"
            _write_docx(
                path,
                [
                    "Treasury Operations Policy",
                    "Table of contents",
                    "1 Introduction........................................5",
                    "1 Introduction",
                    "1.1. Purpose of the Policy",
                    "1 | P a g e",
                    "This section explains the purpose.",
                ],
            )
            payload = extract_policy_structure(path)
            joined = "\n".join([str(item.get("text") or "") for item in payload.get("chunks") or []]).lower()
            self.assertNotIn("table of contents", joined)
            self.assertNotIn("p a g e", joined)
            self.assertNotIn("........", joined)

    def test_policy_heading_detection_no_word_styles(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "policy.docx"
            _write_docx(
                path,
                [
                    "1 Introduction",
                    "1.1. Purpose",
                    "1.1.1. Scope",
                    "Scope details.",
                ],
            )
            payload = extract_policy_structure(path)
            sections = payload.get("sections") or []
            numbers = {str(s.get("number")) for s in sections}
            levels = {int(s.get("level") or 0) for s in sections}
            self.assertIn("1", numbers)
            self.assertIn("1.1", numbers)
            self.assertIn("1.1.1", numbers)
            self.assertTrue({1, 2, 3}.issubset(levels))

    def test_section_tree_parenting(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "policy.docx"
            _write_docx(
                path,
                [
                    "2 Treasury Governance",
                    "2.4. Roles and responsibilities",
                    "2.4.1. Board of Directors",
                    "Details",
                ],
            )
            payload = extract_policy_structure(path)
            by_id = {str(item.get("section_id")): item for item in (payload.get("sections") or [])}
            self.assertEqual(str((by_id.get("2.4") or {}).get("parent_id") or ""), "2")
            self.assertEqual(str((by_id.get("2.4.1") or {}).get("parent_id") or ""), "2.4")

    def test_chunk_never_cross_section(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "policy.docx"
            sec1 = "SEC1TOKEN " + ("alpha " * 80)
            sec2 = "SEC2TOKEN " + ("beta " * 80)
            _write_docx(
                path,
                [
                    "1 Introduction",
                    sec1,
                    sec1,
                    sec1,
                    "2 Governance",
                    sec2,
                    sec2,
                    sec2,
                    "2.1. Oversight",
                ],
            )
            payload = extract_policy_structure(path, chunk_max_chars=220, chunk_overlap_chars=40)
            for chunk in payload.get("chunks") or []:
                number = str(chunk.get("section_number") or "")
                text = str(chunk.get("text") or "")
                if number.startswith("1"):
                    self.assertNotIn("SEC2TOKEN", text)
                if number.startswith("2"):
                    self.assertNotIn("SEC1TOKEN", text)

    def test_is_policy_like_true_false(self):
        with tempfile.TemporaryDirectory() as tmp:
            path_true = Path(tmp) / "policy_true.docx"
            _write_docx(
                path_true,
                [
                    "1 Introduction",
                    "1.1. Purpose",
                    "2 Governance",
                    "2.1. Oversight",
                    "3 Treasury Function",
                    "3.1. Product Mandate",
                    "4 Control Framework",
                    "4.1. Trade Lifecycle",
                ],
            )
            payload_true = extract_policy_structure(path_true)
            self.assertTrue(bool(payload_true.get("is_policy_like")))

            path_false = Path(tmp) / "policy_false.docx"
            _write_docx(
                path_false,
                [
                    "Project meeting notes",
                    "Action items",
                    "Owner list",
                ],
            )
            payload_false = extract_policy_structure(path_false)
            self.assertFalse(bool(payload_false.get("is_policy_like")))


if __name__ == "__main__":
    unittest.main()
