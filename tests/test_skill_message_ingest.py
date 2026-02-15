#!/usr/bin/env python3

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts.skill_message_ingest import _save_attachment_to_path


class _FakeResponse:
    def __init__(self, chunks: list[bytes], headers: dict[str, str] | None = None):
        self._chunks = list(chunks)
        self.headers = headers or {}

    def read(self, _n: int) -> bytes:
        if not self._chunks:
            return b""
        return self._chunks.pop(0)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class SkillMessageIngestAttachmentTest(unittest.TestCase):
    @patch("scripts.skill_message_ingest.urllib.request.urlopen")
    def test_save_attachment_downloads_media_url(self, mocked_urlopen):
        mocked_urlopen.return_value = _FakeResponse([b"DATA"])
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "file.xlsx"
            ok, reason = _save_attachment_to_path(
                {"mediaUrl": "https://example.com/file.xlsx"},
                target_path=target,
            )
            self.assertTrue(ok)
            self.assertEqual(reason, "downloaded_url")
            self.assertTrue(target.exists())
            self.assertEqual(target.read_bytes(), b"DATA")

    @patch("scripts.skill_message_ingest.urllib.request.urlopen")
    def test_save_attachment_blocks_unsupported_suffix_for_download(self, mocked_urlopen):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "file.txt"
            ok, reason = _save_attachment_to_path(
                {"mediaUrl": "https://example.com/file.txt"},
                target_path=target,
            )
            self.assertFalse(ok)
            self.assertIn("download_blocked_suffix", reason)
            mocked_urlopen.assert_not_called()


if __name__ == "__main__":
    unittest.main()

