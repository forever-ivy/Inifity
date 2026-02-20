#!/usr/bin/env python3

import tempfile
import unittest
from pathlib import Path

from scripts.glossary_manager import lookup_text, upsert_term


class GlossaryManagerLookupTest(unittest.TestCase):
    def test_lookup_returns_language_direction_for_source_query(self):
        with tempfile.TemporaryDirectory() as td:
            kb_root = Path(td) / "Knowledge Repository"
            (kb_root / "00_Glossary" / "Eventranz").mkdir(parents=True, exist_ok=True)

            upsert_term(
                kb_root=kb_root,
                company="Eventranz",
                source_lang="ar",
                target_lang="en",
                source_text="الذكاء الاصطناعي",
                target_text="Artificial Intelligence (AI)",
            )

            out = lookup_text(kb_root=kb_root, text="الذكاء الاصطناعي", company="Eventranz", limit=10)
            self.assertGreaterEqual(int(out.get("total") or 0), 1)
            item = (out.get("items") or [])[0]
            self.assertEqual(str(item.get("source_lang")), "ar")
            self.assertEqual(str(item.get("target_lang")), "en")
            self.assertEqual(str(item.get("matched_in")), "source")

    def test_lookup_returns_target_match_for_translated_query(self):
        with tempfile.TemporaryDirectory() as td:
            kb_root = Path(td) / "Knowledge Repository"
            (kb_root / "00_Glossary" / "Eventranz").mkdir(parents=True, exist_ok=True)

            upsert_term(
                kb_root=kb_root,
                company="Eventranz",
                source_lang="ar",
                target_lang="en",
                source_text="تحليل البيانات",
                target_text="Data Analysis",
            )

            out = lookup_text(kb_root=kb_root, text="data analysis", company="Eventranz", limit=10)
            self.assertGreaterEqual(int(out.get("total") or 0), 1)
            item = (out.get("items") or [])[0]
            self.assertEqual(str(item.get("matched_in")), "target")
            self.assertEqual(str(item.get("language_pair")), "ar-en")


if __name__ == "__main__":
    unittest.main()
