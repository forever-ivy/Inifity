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


if __name__ == "__main__":
    unittest.main()
