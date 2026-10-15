import copy
from datetime import datetime, timezone
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

import validate

NOW = datetime(2026, 10, 15, 6, 0, 0, tzinfo=timezone.utc)
BASELINE = "2026-10-15T13:30:00+08:00"
FAKE_KEY = "unit-test-only-not-a-credential"


def api_rows():
    return [{"address": "a" * 32, "pnl": 100.12, "realized_pnl": 80.12, "volume": 1000, "trade_count": 4},
            {"address": "B" * 32, "pnl": 90, "realized_pnl": -20, "volume": 500, "trade_count": 2}]


def collector():
    original = validate.load_collector()
    return Mock(TOP_N=2, MIN_CREDITS=3000, CHAIN="solana", norm=original.norm, insight=original.insight,
                credits_left=Mock(return_value=10000), fetch_top=Mock(side_effect=lambda _period, _key: copy.deepcopy(api_rows())))


class ValidationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="leaderboard-validation-test-")
        self.addCleanup(self.temp.cleanup)
        self.repo = Path(self.temp.name) / "repo"
        self.repo.mkdir()
        self.output = Path(self.temp.name) / "artifact"
        self.baseline = {"updated_at": BASELINE, "source": "Birdeye", "chain": "solana", "today": [], "week": []}
        self.source = self.repo / "data.json"
        self.original = json.dumps(self.baseline).encode()
        self.source.write_bytes(self.original)
        (self.repo / "fetch.py").write_text("# test collector", encoding="utf-8")

    def run_validation(self, source=None, key=FAKE_KEY):
        with patch.object(validate, "git", return_value="a" * 40):
            return validate.run(self.repo, self.output, source or collector(), key, lambda: NOW)

    def test_success_uses_real_normalization_and_never_changes_repository_data(self):
        report = self.run_validation()
        self.assertEqual(report["status"], "passed")
        self.assertEqual(report["candidate_updated_at"], "2026-10-15T14:00:00+08:00")
        self.assertEqual(report["today_rows"], 2)
        self.assertEqual(self.source.read_bytes(), self.original)
        candidate = json.loads((self.output / "data.json").read_text(encoding="utf-8"))
        original_collector = validate.load_collector()
        self.assertEqual(candidate["today"], [original_collector.norm(row) for row in api_rows()])
        self.assertEqual(set(candidate), {"updated_at", "source", "chain", "insight", "today", "week"})
        self.assertEqual(candidate["today"][0]["unrealized"], 20)
        self.assertFalse(report["publication_enabled"])
        self.assertFalse(report["schedule_enabled"])
        self.assertNotIn(FAKE_KEY, (self.output / "validation.json").read_text())

    def test_missing_secret_makes_no_api_request_and_fails(self):
        source = collector()
        report = self.run_validation(source, key="")
        self.assertEqual(report["status"], "failed")
        source.credits_left.assert_not_called()
        self.assertFalse((self.output / "data.json").exists())

    def test_low_credits_are_failure_not_a_false_success_with_old_data(self):
        source = collector()
        source.credits_left.return_value = 2999
        report = self.run_validation(source)
        self.assertEqual(report["status"], "failed")
        source.fetch_top.assert_not_called()
        self.assertFalse((self.output / "data.json").exists())

    def test_partial_or_failed_second_period_never_leaves_a_candidate(self):
        source = collector()
        source.fetch_top.side_effect = [api_rows(), RuntimeError("private header " + FAKE_KEY)]
        report = self.run_validation(source)
        self.assertEqual(report["status"], "failed")
        self.assertNotIn(FAKE_KEY, json.dumps(report))
        self.assertNotIn("private header", json.dumps(report))
        self.assertFalse((self.output / "data.json").exists())
        self.assertEqual(self.source.read_bytes(), self.original)

    def test_missing_duplicate_or_nonfinite_metrics_are_rejected(self):
        mutations = [lambda rows: rows.pop(), lambda rows: rows[0].pop("realized_pnl"),
                     lambda rows: rows[0].update(pnl=None), lambda rows: rows[0].update(pnl=float("nan")),
                     lambda rows: rows[0].update(trade_count=1.5), lambda rows: rows[0].update(volume=-1),
                     lambda rows: rows[0].update(address=17), lambda rows: rows.__setitem__(1, rows[0])]
        for mutate in mutations:
            with self.subTest(mutate=mutate):
                rows = api_rows()
                mutate(rows)
                with self.assertRaises(validate.ValidationError):
                    validate.validate_raw(rows, 2)

    def test_candidate_timestamp_must_advance(self):
        for baseline in ("2026-10-15T14:00:00+08:00", "2026-10-15T14:30:00+08:00"):
            with self.subTest(baseline=baseline), self.assertRaises(validate.ValidationError):
                validate.collect(collector(), FAKE_KEY, baseline, lambda: NOW)

    def test_output_inside_checkout_is_rejected_before_secret_use(self):
        source = collector()
        with self.assertRaises(validate.ValidationError):
            validate.run(self.repo, self.repo / "candidate", source, FAKE_KEY)
        source.credits_left.assert_not_called()
        self.assertEqual(self.source.read_bytes(), self.original)

    def test_old_artifact_cannot_be_reused_as_new_evidence(self):
        self.output.mkdir()
        (self.output / "data.json").write_text("old evidence")
        with self.assertRaises(validate.ValidationError):
            self.run_validation()
        self.assertEqual((self.output / "data.json").read_text(), "old evidence")

    def test_unit_fixtures_do_not_publish_a_real_actions_summary(self):
        summary = Path(self.temp.name) / "job-summary.md"
        summary.write_text("existing real result", encoding="utf-8")
        with patch.dict(validate.os.environ, {"GITHUB_STEP_SUMMARY": str(summary)}):
            self.run_validation()
        self.assertEqual(summary.read_text(encoding="utf-8"), "existing real result")

    def test_baseline_changed_during_fetch_fails_acceptance(self):
        source = collector()
        def fetch(_period, _key):
            self.source.write_text("changed by another process")
            return api_rows()
        source.fetch_top.side_effect = fetch
        report = self.run_validation(source)
        self.assertEqual(report["status"], "failed")
        self.assertFalse(report["repository_data_unchanged"])
        self.assertFalse((self.output / "data.json").exists())

    def test_checked_in_workflow_is_manual_and_read_only(self):
        workflow = (validate.REPO / ".github/workflows/leaderboard-fetch.yml").read_text()
        self.assertRegex(workflow, r"(?m)^  workflow_dispatch:")
        self.assertNotRegex(workflow, r"(?m)^\s+(schedule|push|pull_request|workflow_run):")
        self.assertNotIn("contents: write", workflow)
        self.assertNotIn("git push", workflow)
        self.assertIn("persist-credentials: false", workflow)
        self.assertIn("group: leaderboard-data-writer-main", workflow)
        self.assertIn("cancel-in-progress: false", workflow)
        self.assertLess(workflow.index("git fetch"), workflow.index("git merge --ff-only"))
        self.assertLess(workflow.index("git merge --ff-only"), workflow.index("python leaderboard-fetch/validate.py"))


if __name__ == "__main__":
    unittest.main()
