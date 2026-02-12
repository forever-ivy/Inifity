#!/usr/bin/env python3

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from docx import Document

from scripts.skill_approval import handle_command
from scripts.v4_pipeline import create_job


def _make_docx(path: Path, text: str) -> None:
    doc = Document()
    doc.add_paragraph(text)
    path.parent.mkdir(parents=True, exist_ok=True)
    doc.save(path)


class SkillApprovalTest(unittest.TestCase):
    @patch("scripts.skill_approval.send_whatsapp_message")
    def test_approve_requires_manual_file(self, mocked_send):
        mocked_send.return_value = {"ok": True}
        with tempfile.TemporaryDirectory() as tmp:
            work_root = Path(tmp) / "Translation Task"
            kb_root = Path(tmp) / "Knowledge Repository"
            kb_root.mkdir(parents=True, exist_ok=True)
            job_id = "job_test_1"
            inbox = work_root / "_INBOX" / "whatsapp" / job_id
            inbox.mkdir(parents=True, exist_ok=True)
            create_job(
                source="whatsapp",
                sender="+8613",
                subject="Test",
                message_text="please approve",
                inbox_dir=inbox,
                job_id=job_id,
                work_root=work_root,
            )
            result = handle_command(
                command_text=f"approve {job_id}",
                work_root=work_root,
                kb_root=kb_root,
                target="+8613",
                dry_run_notify=True,
            )
            self.assertFalse(result["ok"])
            self.assertEqual(result["error"], "manual_file_missing")

    @patch("scripts.skill_approval.send_whatsapp_message")
    def test_approve_delivers_manual_file(self, mocked_send):
        mocked_send.return_value = {"ok": True}
        with tempfile.TemporaryDirectory() as tmp:
            work_root = Path(tmp) / "Translation Task"
            kb_root = Path(tmp) / "Knowledge Repository"
            kb_root.mkdir(parents=True, exist_ok=True)
            job_id = "job_test_2"
            inbox = work_root / "_INBOX" / "whatsapp" / job_id
            inbox.mkdir(parents=True, exist_ok=True)
            env = create_job(
                source="whatsapp",
                sender="+8613",
                subject="Test",
                message_text="please approve",
                inbox_dir=inbox,
                job_id=job_id,
                work_root=work_root,
            )
            review_dir = Path(env["review_dir"])
            _make_docx(review_dir / f"{job_id}_manual.docx", "manual result")

            result = handle_command(
                command_text=f"approve {job_id}",
                work_root=work_root,
                kb_root=kb_root,
                target="+8613",
                dry_run_notify=True,
            )
            self.assertTrue(result["ok"])
            self.assertEqual(result["status"], "delivered")
            self.assertTrue(Path(result["final_file"]).exists())


if __name__ == "__main__":
    unittest.main()
