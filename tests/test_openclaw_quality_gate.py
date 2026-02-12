#!/usr/bin/env python3

import unittest

from scripts.openclaw_quality_gate import evaluate_quality


class OpenClawQualityGateTest(unittest.TestCase):
    def test_expansion_true_on_low_margin(self):
        model_scores = {"judge_margin": 0.02, "term_hit": 0.95}
        delta_pack = {"added": [], "modified": []}
        out = evaluate_quality(model_scores, delta_pack)
        self.assertTrue(out["expansion_used"])

    def test_expansion_false_on_good_scores(self):
        model_scores = {"judge_margin": 0.12, "term_hit": 0.96}
        delta_pack = {"added": [1], "modified": [1]}
        out = evaluate_quality(model_scores, delta_pack)
        self.assertFalse(out["expansion_used"])


if __name__ == "__main__":
    unittest.main()
