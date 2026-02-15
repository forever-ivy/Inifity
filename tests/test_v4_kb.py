#!/usr/bin/env python3

import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from scripts.v4_kb import _extract_pdf, _extract_xlsx, retrieve_kb, retrieve_kb_with_fallback, sync_kb
from scripts.v4_runtime import db_connect, ensure_runtime_paths


class V4KnowledgeBaseTest(unittest.TestCase):
    def test_incremental_sync_and_retrieve(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            work_root = base / "Translation Task"
            kb_root = base / "Knowledge Repository"
            (kb_root / "00_Glossary").mkdir(parents=True, exist_ok=True)
            (kb_root / "10_Style_Guide").mkdir(parents=True, exist_ok=True)
            (kb_root / "20_Domain_Knowledge").mkdir(parents=True, exist_ok=True)
            (kb_root / "30_Reference" / "Eventranz" / "2024-02_AI_Readiness" / "final").mkdir(parents=True, exist_ok=True)

            (kb_root / "00_Glossary" / "terms.txt").write_text("Siraj platform\nAI readiness\n", encoding="utf-8")
            (kb_root / "10_Style_Guide" / "translation_rules.md").write_text("Keep headings.\nPreserve numbering.\n", encoding="utf-8")
            (kb_root / "30_Reference" / "Eventranz" / "2024-02_AI_Readiness" / "final" / "ref.csv").write_text(
                "term,translation\nAI readiness,AI readiness\n", encoding="utf-8"
            )
            (kb_root / "20_Domain_Knowledge" / "task.md").write_text("This is the source text for translation update", encoding="utf-8")

            paths = ensure_runtime_paths(work_root)
            conn = db_connect(paths)

            report1 = sync_kb(conn=conn, kb_root=kb_root, report_path=paths.kb_system_root / "kb_sync_latest.json")
            self.assertTrue(report1["ok"])
            self.assertGreaterEqual(report1["created"], 3)

            report2 = sync_kb(conn=conn, kb_root=kb_root, report_path=paths.kb_system_root / "kb_sync_latest.json")
            self.assertTrue(report2["ok"])
            self.assertGreaterEqual(report2["skipped"], 3)

            hits = retrieve_kb(conn=conn, query="AI readiness Siraj", task_type="REVISION_UPDATE", top_k=5)
            self.assertGreaterEqual(len(hits), 1)
            self.assertIn("score", hits[0])
            self.assertIn("source_group", hits[0])

            with patch("scripts.v4_kb.clawrag_search") as mocked_clawrag:
                hit_path = str((kb_root / "00_Glossary" / "terms.txt").resolve())
                mocked_clawrag.return_value = {
                    "ok": True,
                    "backend": "clawrag",
                    "hits": [{"path": hit_path, "source_group": "glossary", "chunk_index": 0, "snippet": "AI readiness", "score": 0.9}],
                }
                rag = retrieve_kb_with_fallback(
                    conn=conn,
                    query="AI readiness",
                    task_type="REVISION_UPDATE",
                    rag_backend="clawrag",
                    rag_base_url="http://127.0.0.1:8080",
                    rag_collection="translation-kb",
                    kb_root=kb_root,
                )
                self.assertEqual(rag["backend"], "clawrag")
                self.assertEqual(len(rag["hits"]), 1)
                self.assertEqual(rag["status_flags"], [])

            with patch("scripts.v4_kb.clawrag_search") as mocked_clawrag:
                mocked_clawrag.return_value = {"ok": False, "backend": "clawrag", "hits": [], "errors": ["down"]}
                rag = retrieve_kb_with_fallback(
                    conn=conn,
                    query="AI readiness",
                    task_type="REVISION_UPDATE",
                    rag_backend="clawrag",
                    rag_base_url="http://127.0.0.1:8080",
                    rag_collection="translation-kb",
                )
                self.assertEqual(rag["backend"], "local")
                self.assertGreaterEqual(len(rag["hits"]), 1)
                self.assertIn("rag_fallback_local", rag["status_flags"])
            conn.close()


class PdfExtractTest(unittest.TestCase):
    def test_pdftotext_preferred_when_available(self):
        fake_pdf = Path(tempfile.mktemp(suffix=".pdf"))
        fake_pdf.write_bytes(b"dummy")
        try:
            with patch("scripts.v4_kb.subprocess.run") as mock_run, \
                 patch("scripts.v4_kb.Path.exists", return_value=True):
                mock_run.return_value = MagicMock(
                    returncode=0, stdout="Extracted layout text from PDF"
                )
                result = _extract_pdf(fake_pdf)
                self.assertIn("Extracted layout text from PDF", result)
                mock_run.assert_called_once()
                args = mock_run.call_args[0][0]
                self.assertEqual(args[0], "/opt/homebrew/bin/pdftotext")
                self.assertIn("-layout", args)
        finally:
            fake_pdf.unlink(missing_ok=True)

    def test_pdftotext_fallback_to_pypdf(self):
        fake_pdf = Path(tempfile.mktemp(suffix=".pdf"))
        fake_pdf.write_bytes(b"dummy")
        try:
            with patch("scripts.v4_kb.subprocess.run") as mock_run, \
                 patch("scripts.v4_kb.Path.exists", return_value=True), \
                 patch("scripts.v4_kb.PdfReader") as mock_reader:
                mock_run.return_value = MagicMock(returncode=1, stdout="")
                mock_page = MagicMock()
                mock_page.extract_text.return_value = "pypdf fallback text"
                mock_reader.return_value.pages = [mock_page]
                result = _extract_pdf(fake_pdf)
                self.assertIn("pypdf fallback text", result)
        finally:
            fake_pdf.unlink(missing_ok=True)


class XlsxExtractTest(unittest.TestCase):
    def test_sheetsmith_preferred_when_available(self):
        fake_xlsx = Path(tempfile.mktemp(suffix=".xlsx"))
        fake_xlsx.write_bytes(b"dummy")
        try:
            with patch("scripts.v4_kb.subprocess.run") as mock_run, \
                 patch("scripts.v4_kb.SHEETSMITH_SCRIPT", new=Path("/tmp/fake_sheetsmith.py")), \
                 patch.object(Path, "exists", return_value=True):
                mock_run.return_value = MagicMock(
                    returncode=0, stdout="Sheet1\ncol1 | col2\nval1 | val2"
                )
                result = _extract_xlsx(fake_xlsx)
                self.assertIn("col1", result)
                mock_run.assert_called_once()
        finally:
            fake_xlsx.unlink(missing_ok=True)

    def test_sheetsmith_fallback_to_openpyxl(self):
        fake_xlsx = Path(tempfile.mktemp(suffix=".xlsx"))
        fake_xlsx.write_bytes(b"dummy")
        try:
            with patch("scripts.v4_kb.SHEETSMITH_SCRIPT", new=Path("/nonexistent/sheetsmith.py")), \
                 patch("scripts.v4_kb.load_workbook") as mock_wb:
                mock_ws = MagicMock()
                mock_ws.title = "Sheet1"
                mock_ws.iter_rows.return_value = [("a", "b"), ("c", None)]
                mock_wb.return_value.worksheets = [mock_ws]
                mock_wb.return_value.close = MagicMock()
                result = _extract_xlsx(fake_xlsx)
                self.assertIn("Sheet1", result)
                self.assertIn("a | b", result)
        finally:
            fake_xlsx.unlink(missing_ok=True)


if __name__ == "__main__":
    unittest.main()
