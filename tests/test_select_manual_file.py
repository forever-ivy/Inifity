#!/usr/bin/env python3

import tempfile
import unittest
from pathlib import Path

from scripts.select_manual_file import pick_file


class SelectManualFileTest(unittest.TestCase):
    def test_prefers_manual_over_edited(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            edited = root / "draft_edited.docx"
            manual = root / "draft_manual_v2.docx"
            edited.write_text("x", encoding="utf-8")
            manual.write_text("x", encoding="utf-8")

            selected = pick_file(root)
            self.assertIsNotNone(selected)
            self.assertEqual(selected.name, manual.name)

    def test_returns_none_when_no_match(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "draft.docx").write_text("x", encoding="utf-8")
            selected = pick_file(root)
            self.assertIsNone(selected)


if __name__ == "__main__":
    unittest.main()
