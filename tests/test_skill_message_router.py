#!/usr/bin/env python3

import unittest
from pathlib import Path
import tempfile
import base64

from scripts.skill_message_router import (
    _extract_attachment_paths,
    _extract_file_block_attachments,
    _extract_message_id,
    _extract_sender,
    _extract_text_content,
    _is_command,
    _strip_file_blocks,
)


class SkillMessageRouterTest(unittest.TestCase):
    def test_parse_sender_and_message_id(self):
        raw = (
            "[Telegram 123456789 Fri 2026-02-13 07:44 GMT+8] [openclaw] run\n"
            "[message_id: 3ADD57E3CD47801E62D1]\n"
        )
        self.assertEqual(_extract_sender(raw, "unknown"), "123456789")
        self.assertEqual(_extract_message_id(raw), "3ADD57E3CD47801E62D1")

    def test_extract_attachments_and_strip_file_block(self):
        raw = (
            "[media attached: /tmp/a.docx (application/vnd.openxmlformats-officedocument.wordprocessingml.document)]\n"
            '<file name="a.docx" mime="text/plain">BINARY</file>\n'
        )
        cleaned, guarded = _strip_file_blocks(raw)
        self.assertTrue(guarded)
        self.assertNotIn("<file", cleaned)
        attachments = _extract_attachment_paths(cleaned)
        # path may not exist in test env; parser should return only existing files.
        self.assertIsInstance(attachments, list)

    def test_extract_url_attachment(self):
        raw = (
            "[media attached: https://example.com/files/survey.xlsx "
            "(application/vnd.openxmlformats-officedocument.spreadsheetml.sheet)]\n"
        )
        attachments = _extract_attachment_paths(raw)
        self.assertEqual(len(attachments), 1)
        self.assertEqual(attachments[0].get("mediaUrl"), "https://example.com/files/survey.xlsx")
        self.assertEqual(attachments[0].get("name"), "survey.xlsx")

    def test_extract_file_block_to_temp_path(self):
        payload = base64.b64encode(b"hello").decode("utf-8")
        raw = f'<file name="x.xlsx" mime="application/vnd.ms-excel">{payload}</file>'
        with tempfile.TemporaryDirectory() as tmp:
            atts = _extract_file_block_attachments(raw, temp_dir=Path(tmp))
            self.assertEqual(len(atts), 1)
            p = Path(atts[0]["path"])
            self.assertTrue(p.exists())
            self.assertEqual(p.read_bytes(), b"hello")

    def test_extract_text_content_skips_noise(self):
        raw = (
            "System: [2026-02-13] Telegram connected.\n"
            "[Telegram 123456789 Fri 2026-02-13 07:36 GMT+8] [openclaw] this is task text\n"
            "To send an image back, prefer the message tool.\n"
            "[message_id: abc123]\n"
        )
        text = _extract_text_content(raw)
        self.assertEqual(text, "this is task text")

    def test_command_detection(self):
        self.assertTrue(_is_command("new"))
        self.assertTrue(_is_command("run"))
        self.assertTrue(_is_command("status"))
        self.assertTrue(_is_command("no fix numbering"))
        self.assertFalse(_is_command("this is task text"))

    def test_extract_text_with_embedded_message_id(self):
        raw = "[Telegram 123456789 Fri] [openclaw] run [message_id: abc]"
        text = _extract_text_content(raw)
        self.assertEqual(text, "run")


if __name__ == "__main__":
    unittest.main()
