#!/usr/bin/env python3

import unittest

from scripts.skill_status_card import build_status_card, no_active_job_hint


class SkillStatusCardTest(unittest.TestCase):
    def test_build_card_contains_expected_lines(self):
        job = {
            "job_id": "job_123",
            "status": "collecting",
            "task_type": "REVISION_UPDATE",
            "review_dir": "",
            "iteration_count": 1,
            "double_pass": False,
            "errors_json": [],
        }
        card = build_status_card(job=job, files_count=3, docx_count=3, multiple_hint=1, require_new=True)
        self.assertIn("New task", card)
        self.assertIn("+1 pending", card)
        self.assertIn("Collecting", card)
        self.assertIn("Files: 3", card)
        self.assertIn("Rounds: 1", card)
        self.assertIn("Next: run", card)

    def test_build_card_shows_job_id_after_classification(self):
        job = {
            "job_id": "job_456",
            "status": "running",
            "task_type": "SPREADSHEET_TRANSLATION",
            "review_dir": "",
            "iteration_count": 0,
            "double_pass": False,
            "errors_json": [],
        }
        card = build_status_card(job=job, files_count=1, docx_count=0, require_new=True)
        self.assertIn("job_456", card)

    def test_build_card_shows_task_label_when_available(self):
        job = {
            "job_id": "job_789",
            "status": "running",
            "review_dir": "",
            "iteration_count": 0,
            "errors_json": [],
        }
        card = build_status_card(job=job, files_count=1, docx_count=0, task_label="Translate Salt Field report")
        self.assertIn("Translate Salt Field report", card)
        self.assertNotIn("job_789", card)

    def test_no_active_job_hint_require_new(self):
        self.assertIn("No active task", no_active_job_hint(require_new=True))
        self.assertIn("new", no_active_job_hint(require_new=True))
        self.assertIn("No active task", no_active_job_hint(require_new=False))
        self.assertIn("run", no_active_job_hint(require_new=False))


if __name__ == "__main__":
    unittest.main()
