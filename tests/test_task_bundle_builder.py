#!/usr/bin/env python3

import tempfile
import unittest
from pathlib import Path

from scripts.task_bundle_builder import build_bundle, classify_legacy_slot, infer_language


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

    def test_chinese_keyword(self):
        self.assertEqual(infer_language(Path("chinese_report.docx")), "zh")

    def test_chinese_prefix(self):
        self.assertEqual(infer_language(Path("zh_survey.docx")), "zh")

    def test_chinese_characters(self):
        self.assertEqual(infer_language(Path("中文文档.docx")), "zh")

    def test_portuguese_keyword(self):
        self.assertEqual(infer_language(Path("portuguese_survey.docx")), "pt")

    def test_turkish_keyword(self):
        self.assertEqual(infer_language(Path("turkish_report.docx")), "tr")


class ClassifyLegacySlotTest(unittest.TestCase):
    def test_arabic_v1_legacy_slot(self):
        # Backward compatibility: Arabic v1 -> "arabic_v1"
        self.assertEqual(classify_legacy_slot(Path("arabic_v1_survey.docx")), "arabic_v1")

    def test_arabic_v2_legacy_slot(self):
        # Backward compatibility: Arabic v2 -> "arabic_v2"
        self.assertEqual(classify_legacy_slot(Path("استبانة V2.docx")), "arabic_v2")

    def test_english_v1_legacy_slot(self):
        # Backward compatibility: English v1 -> "english_v1"
        self.assertEqual(classify_legacy_slot(Path("english_v1_report.docx")), "english_v1")

    def test_french_v1_dynamic_slot(self):
        # Dynamic: French v1 -> "fr_v1"
        self.assertEqual(classify_legacy_slot(Path("french_v1_survey.docx")), "fr_v1")

    def test_french_v2_dynamic_slot(self):
        # Dynamic: French v2 -> "fr_v2"
        self.assertEqual(classify_legacy_slot(Path("rapport_fr_v2.docx")), "fr_v2")

    def test_chinese_v1_dynamic_slot(self):
        # Dynamic: Chinese v1 -> "zh_v1"
        self.assertEqual(classify_legacy_slot(Path("zh_v1_document.docx")), "zh_v1")

    def test_spanish_v2_dynamic_slot(self):
        # Dynamic: Spanish v2 -> "es_v2"
        self.assertEqual(classify_legacy_slot(Path("spanish V2 survey.docx")), "es_v2")

    def test_unknown_version_returns_none(self):
        # Files without version info return None
        self.assertIsNone(classify_legacy_slot(Path("report.docx")))


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

