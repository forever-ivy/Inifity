#!/usr/bin/env python3

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts.v4_kb import retrieve_kb, retrieve_kb_with_fallback, sync_kb
from scripts.v4_runtime import db_connect, ensure_runtime_paths


class V4KnowledgeBaseTest(unittest.TestCase):
    def test_incremental_sync_and_retrieve(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            work_root = base / "Translation Task"
            kb_root = base / "Knowledge Repository"
            (kb_root / "Glossery").mkdir(parents=True, exist_ok=True)
            (kb_root / "Previously Translated").mkdir(parents=True, exist_ok=True)
            (kb_root / "Arabic Source").mkdir(parents=True, exist_ok=True)

            (kb_root / "Glossery" / "terms.txt").write_text("Siraj platform\nAI readiness\n", encoding="utf-8")
            (kb_root / "Previously Translated" / "ref.csv").write_text(
                "term,translation\nAI readiness,AI readiness\n", encoding="utf-8"
            )
            (kb_root / "Arabic Source" / "task.md").write_text("This is the source text for translation update", encoding="utf-8")

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
                mocked_clawrag.return_value = {
                    "ok": True,
                    "backend": "clawrag",
                    "hits": [{"path": "/tmp/a", "source_group": "glossary", "chunk_index": 0, "snippet": "AI readiness", "score": 0.9}],
                }
                rag = retrieve_kb_with_fallback(
                    conn=conn,
                    query="AI readiness",
                    task_type="REVISION_UPDATE",
                    rag_backend="clawrag",
                    rag_base_url="http://127.0.0.1:8080",
                    rag_collection="translation-kb",
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


if __name__ == "__main__":
    unittest.main()
