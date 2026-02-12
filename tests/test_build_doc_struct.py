#!/usr/bin/env python3

import os
import tempfile
import unittest
from pathlib import Path

from scripts.build_doc_struct import build_file_fingerprint


class BuildDocStructFingerprintTest(unittest.TestCase):
    def test_file_fingerprint_is_deterministic(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            a = base / "a.docx"
            b = base / "b.docx"
            c = base / "c.docx"
            a.write_bytes(b"aa")
            b.write_bytes(b"bbb")
            c.write_bytes(b"cccc")

            ts = 1735689600
            for p in (a, b, c):
                os.utime(p, (ts, ts))

            files = {
                "arabic_v1": {"path": str(a)},
                "arabic_v2": {"path": str(b)},
                "english_v1": {"path": str(c)},
            }

            fp1 = build_file_fingerprint(files)
            fp2 = build_file_fingerprint(files)

            self.assertTrue(fp1)
            self.assertEqual(fp1, fp2)


if __name__ == "__main__":
    unittest.main()

