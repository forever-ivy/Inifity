#!/usr/bin/env python3

import tempfile
import unittest
from pathlib import Path

from scripts.task_bundle_builder import build_bundle, infer_language


class InferLanguageTest(unittest.TestCase):
    def test_arabic_script_highest_priority(self):
        self.assertEqual(infer_language(Path("استبانة.docx")), "ar")

    def test_arabic_keyword(self):
        self.assertEqual(infer_language(Path("arabic_source.docx")), "ar")

    def test_french_keyword(self):
        self.assertEqual(infer_language(Path("french_doc.docx")), "fr")

    def test_french_prefix(self):
        self.assertEqual(infer_language(Path("fr_report.docx")), "fr")

    def test_french_suffix(self):
        self.assertEqual(infer_language(Path("report_fr.docx")), "fr")

    def test_francais_accent(self):
        self.assertEqual(infer_language(Path("rapport_français.docx")), "fr")

    def test_spanish_keyword(self):
        self.assertEqual(infer_language(Path("spanish_survey.docx")), "es")

    def test_german_keyword(self):
        self.assertEqual(infer_language(Path("german_report.docx")), "de")

    def test_default_english(self):
        self.assertEqual(infer_language(Path("report.docx")), "en")

    def test_arabic_beats_french(self):
        # Arabic script takes priority even if "french" appears in name
        self.assertEqual(infer_language(Path("french_استبانة.docx")), "ar")


class TaskBundleBuilderTest(unittest.TestCase):
    def test_valid_with_any_docx(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "Arabic Source").mkdir(parents=True, exist_ok=True)
            (root / "Arabic Source" / "input_ar.docx").write_text("x", encoding="utf-8")
            bundle = build_bundle(root, "job_1")
            self.assertTrue(bundle["valid"])
            self.assertGreaterEqual(bundle["stats"]["doc_count"], 1)

    def test_invalid_when_no_docx(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            bundle = build_bundle(root, "job_2")
            self.assertFalse(bundle["valid"])
            self.assertIn("no_docx_found", bundle["missing"])


if __name__ == "__main__":
    unittest.main()

