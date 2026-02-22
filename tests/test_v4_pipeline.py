#!/usr/bin/env python3

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts.v4_pipeline import run_job_pipeline
from scripts.v4_runtime import (
    claim_next_queued,
    db_connect,
    enqueue_run_job,
    ensure_runtime_paths,
    write_job,
)


class V4PipelineDuplicateGuardTest(unittest.TestCase):
    def _prepare_running_job(self, *, work_root: Path, job_id: str) -> int:
        paths = ensure_runtime_paths(work_root)
        conn = db_connect(paths)
        inbox_dir = paths.inbox_messaging / job_id
        review_dir = paths.review_root / job_id
        inbox_dir.mkdir(parents=True, exist_ok=True)
        review_dir.mkdir(parents=True, exist_ok=True)
        write_job(
            conn,
            job_id=job_id,
            source="telegram",
            sender="+1",
            subject="Test",
            message_text="translate",
            status="planned",
            inbox_dir=inbox_dir,
            review_dir=review_dir,
        )
        enqueue_run_job(conn, job_id=job_id, notify_target="+1", created_by_sender="+1")
        claimed = claim_next_queued(conn, worker_id="w1")
        conn.close()
        self.assertIsNotNone(claimed)
        return int(claimed["id"])

    def test_running_job_allows_matching_claimed_queue(self):
        with tempfile.TemporaryDirectory() as td:
            work_root = Path(td) / "Translation Task"
            kb_root = Path(td) / "Knowledge Repository"
            kb_root.mkdir(parents=True, exist_ok=True)
            job_id = "job_pipeline_same_claim_ok"
            queue_id = self._prepare_running_job(work_root=work_root, job_id=job_id)

            with (
                patch.dict(os.environ, {"OPENCLAW_QUEUE_ID": str(queue_id)}, clear=False),
                patch("scripts.v4_pipeline.update_job_status", side_effect=RuntimeError("sentinel")),
            ):
                with self.assertRaisesRegex(RuntimeError, "sentinel"):
                    run_job_pipeline(
                        job_id=job_id,
                        work_root=work_root,
                        kb_root=kb_root,
                        dry_run_notify=True,
                    )

    def test_running_job_blocks_without_matching_queue(self):
        with tempfile.TemporaryDirectory() as td:
            work_root = Path(td) / "Translation Task"
            kb_root = Path(td) / "Knowledge Repository"
            kb_root.mkdir(parents=True, exist_ok=True)
            job_id = "job_pipeline_duplicate_blocked"
            self._prepare_running_job(work_root=work_root, job_id=job_id)

            with patch.dict(os.environ, {"OPENCLAW_QUEUE_ID": "999999"}, clear=False):
                result = run_job_pipeline(
                    job_id=job_id,
                    work_root=work_root,
                    kb_root=kb_root,
                    dry_run_notify=True,
                )

            self.assertFalse(bool(result.get("ok")))
            self.assertEqual(str(result.get("status")), "already_running")
            self.assertTrue(bool(result.get("skipped")))


class V4PipelinePlanStatusTest(unittest.TestCase):
    def test_run_job_pipeline_keeps_status_running_after_plan(self):
        with tempfile.TemporaryDirectory() as td:
            work_root = Path(td) / "Translation Task"
            kb_root = Path(td) / "Knowledge Repository"
            kb_root.mkdir(parents=True, exist_ok=True)
            paths = ensure_runtime_paths(work_root)
            conn = db_connect(paths)
            job_id = "job_pipeline_plan_running"
            inbox_dir = paths.inbox_messaging / job_id
            review_dir = paths.review_root / job_id
            inbox_dir.mkdir(parents=True, exist_ok=True)
            review_dir.mkdir(parents=True, exist_ok=True)

            write_job(
                conn,
                job_id=job_id,
                source="telegram",
                sender="+1",
                subject="Test",
                message_text="translate arabic to english",
                status="planned",
                inbox_dir=inbox_dir,
                review_dir=review_dir,
            )
            # Create a dummy XLSX attachment record; pipeline won't parse it because
            # we patch run_translation below.
            xlsx_path = inbox_dir / "FD.xlsx"
            xlsx_path.write_text("stub", encoding="utf-8")
            conn.execute(
                "INSERT INTO job_files(job_id, path, name, mime_type, created_at) VALUES(?,?,?,?,?)",
                (job_id, str(xlsx_path.resolve()), xlsx_path.name, "", "2026-02-22T00:00:00+00:00"),
            )
            conn.commit()
            conn.close()

            plan_result = {
                "ok": True,
                "status": "planned",
                "intent": {
                    "task_type": "SPREADSHEET_TRANSLATION",
                    "task_label": "Translate Arabic Excel file to English",
                    "source_language": "ar",
                    "target_language": "en",
                    "required_inputs": ["source_document"],
                    "missing_inputs": [],
                    "confidence": 0.9,
                    "reasoning_summary": "stub",
                },
                "plan": {
                    "task_type": "SPREADSHEET_TRANSLATION",
                    "confidence": 0.9,
                    "estimated_minutes": 15,
                    "complexity_score": 2.0,
                    "time_budget_minutes": 20,
                },
                "estimated_minutes": 15,
            }

            def _fake_run_translation(*_args, **kwargs):
                if kwargs.get("plan_only"):
                    return plan_result
                raise RuntimeError("sentinel")

            with (
                patch("scripts.v4_pipeline.sync_kb_with_rag", return_value={"local_report": {"created": 0, "updated": 0}, "rag_report": {}}),
                patch("scripts.v4_pipeline.retrieve_kb_with_fallback", return_value={"hits": [], "backend": "local", "status_flags": []}),
                patch("scripts.v4_pipeline.notify_milestone", return_value=None),
                patch("scripts.v4_pipeline.update_job_plan") as mocked_update_plan,
                patch("scripts.v4_pipeline.run_translation", side_effect=_fake_run_translation),
            ):
                with self.assertRaisesRegex(RuntimeError, "sentinel"):
                    run_job_pipeline(
                        job_id=job_id,
                        work_root=work_root,
                        kb_root=kb_root,
                        dry_run_notify=True,
                    )

            self.assertTrue(mocked_update_plan.called)
            _, kwargs = mocked_update_plan.call_args
            self.assertEqual(kwargs.get("status"), "running")


if __name__ == "__main__":
    unittest.main()
