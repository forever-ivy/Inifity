#!/usr/bin/env python3

import unittest

from scripts.build_delta_pack import build_delta


class BuildDeltaPackTest(unittest.TestCase):
    def test_detects_add_replace(self):
        v1 = [
            {"kind": "paragraph", "text": "A"},
            {"kind": "paragraph", "text": "B"},
        ]
        v2 = [
            {"kind": "paragraph", "text": "A"},
            {"kind": "paragraph", "text": "C"},
            {"kind": "paragraph", "text": "D"},
        ]

        delta = build_delta("job1", v1, v2)
        self.assertEqual(delta["job_id"], "job1")
        self.assertGreaterEqual(delta["stats"]["modified_count"], 1)


if __name__ == "__main__":
    unittest.main()
