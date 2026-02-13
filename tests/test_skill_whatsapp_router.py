#!/usr/bin/env python3

import unittest

from scripts.skill_whatsapp_router import (
    _extract_attachment_paths,
    _extract_message_id,
    _extract_sender,
    _extract_text_content,
    _is_command,
    _strip_file_blocks,
)


class SkillWhatsAppRouterTest(unittest.TestCase):
    def test_parse_sender_and_message_id(self):
        raw = (
            "[WhatsApp +8615071054627 Fri 2026-02-13 07:44 GMT+8] [openclaw] run\n"
            "[message_id: 3ADD57E3CD47801E62D1]\n"
        )
        self.assertEqual(_extract_sender(raw, "unknown"), "+8615071054627")
        self.assertEqual(_extract_message_id(raw), "3ADD57E3CD47801E62D1")

    def test_extract_attachments_and_strip_file_block(self):
        raw = (
            "[media attached: /tmp/a.docx (application/vnd.openxmlformats-officedocument.wordprocessingml.document)]\n"
            "<file name=\"a.docx\" mime=\"text/plain\">BINARY</file>\n"
        )
        cleaned, guarded = _strip_file_blocks(raw)
        self.assertTrue(guarded)
        self.assertNotIn("<file", cleaned)
        attachments = _extract_attachment_paths(cleaned)
        # path may not exist in test env; parser should return only existing files.
        self.assertIsInstance(attachments, list)

    def test_extract_text_content_skips_noise(self):
        raw = (
            "System: [2026-02-13] WhatsApp connected.\n"
            "[WhatsApp +8615071054627 Fri 2026-02-13 07:36 GMT+8] [openclaw] this is task text\n"
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
        raw = "[WhatsApp +8615071054627 Fri] [openclaw] run [message_id: abc]"
        text = _extract_text_content(raw)
        self.assertEqual(text, "run")


if __name__ == "__main__":
    unittest.main()
