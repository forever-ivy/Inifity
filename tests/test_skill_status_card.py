#!/usr/bin/env python3

import unittest

from scripts.skill_status_card import build_status_card, no_active_job_hint


class SkillStatusCardTest(unittest.TestCase):
    def test_build_card_contains_six_lines(self):
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
        lines = card.splitlines()
        self.assertEqual(len(lines), 6)
        self.assertIn("Job: job_123 (+1 pending)", lines[0])
        self.assertIn("Stage: collecting", lines[1])
        self.assertIn("Task: REVISION_UPDATE", lines[2])
        self.assertIn("Inputs: ready", lines[3])
        self.assertIn("Progress: rounds=1", lines[4])
        self.assertIn("Next: run", lines[5])

    def test_no_active_job_hint_require_new(self):
        self.assertEqual(no_active_job_hint(require_new=True), "No active job. Send: new")
        self.assertEqual(no_active_job_hint(require_new=False), "No active job. Send files first, then run.")


if __name__ == "__main__":
    unittest.main()
