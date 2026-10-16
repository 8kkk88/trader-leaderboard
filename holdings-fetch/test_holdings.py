import copy
from datetime import datetime, timezone, timedelta
import json
from pathlib import Path
import tempfile
import io
import unittest
from unittest.mock import patch
import core
import run

NOW = datetime(2026, 10, 19, 1, tzinfo=timezone.utc)
WALLET = "A" * 32


def response():
    return {"success": True, "data": {"wallet_address": WALLET, "currency": "usd", "total_value": "1000",
            "current_timestamp": NOW.isoformat(), "items": [
                {"address": "B" * 32, "symbol": "ONE", "network": "solana", "value": "400.5"},
                {"address": "C" * 32, "symbol": "TWO", "network": "solana", "value": 100}]},
            "pagination": {"offset": 0, "limit": 5, "total": 2}}


def leaderboard():
    return {"source": "Birdeye", "chain": "solana", "updated_at": NOW.isoformat(), "week": [
        {"address": c * 32, "realized": i, "pnl": 50 - i} for i, c in enumerate("ABCDEFGHJKLM")]}


def event():
    return {"workflow_run": {"conclusion": "success", "head_branch": "main",
        "head_repository": {"full_name": "kkweb3345678/trader-leaderboard"}, "event": "schedule",
        "display_title": "Leaderboard publish · 0 0 * * *", "created_at": NOW.isoformat()}}


class Holdings(unittest.TestCase):
    def test_resume_only_fetches_eight_remaining_wallets_from_same_batch(self):
        from types import SimpleNamespace
        with tempfile.TemporaryDirectory() as folder:
            base = Path(folder); root = base / "repo"; root.mkdir()
            saved = base / "holdings-probe"; saved.mkdir(); output = base / "output"
            data = leaderboard(); raw = core.encode(data); selected = core.top_ten(data, NOW)
            (root / "data.json").write_bytes(raw); (saved / "baseline-data.json").write_bytes(raw)
            report_before = {"status": "failed", "mode": "publish", "portfolio_requests": 2,
                            "credit_requests": 1, "source_sha256": core.digest(raw), "credits_before": 20000,
                            "selected_addresses": [w["address"] for w in selected]}
            (saved / "report.json").write_bytes(core.encode(report_before))
            replies = []
            for index, row in enumerate(selected, 1):
                r = response(); r["data"]["wallet_address"] = row["address"]
                if index <= 2: (saved / f"response-{index}.json").write_bytes(core.encode(r))
                else: replies.append(r)
            # Changed source must fail without any request.
            with self.assertRaises(core.Invalid): run.saved_batch(saved, b"changed", selected, NOW, None)
            with self.assertRaises(core.Invalid): run.saved_batch(saved, raw, selected, NOW+timedelta(hours=2), None)
            event_path = base / "event.json"; event_path.write_text(json.dumps({"inputs": {"mode": "resume", "probe_run": "123"}}))
            env = {"GITHUB_ACTIONS": "true", "GITHUB_REF": "refs/heads/main", "GITHUB_EVENT_NAME": "workflow_dispatch", "GITHUB_EVENT_PATH": str(event_path), "RUNNER_TEMP": str(base), "BIRDEYE_API_KEY": "fixture-not-a-key"}
            class Clock:
                @staticmethod
                def now(_): return NOW
            report = {}
            with patch.dict(run.os.environ, env), patch.object(run, "ROOT", root), patch.object(run, "synchronize"), patch.object(run, "git", return_value="commit"), patch.object(run, "datetime", Clock), patch.object(run, "credits", side_effect=[19939, 19698]), patch.object(run, "api", side_effect=replies) as api, patch.object(run, "publish", return_value="published") as publish:
                run.run(SimpleNamespace(output=output), report)
            self.assertEqual(api.call_count, 8)
            self.assertEqual(report["reused_responses"], 2)
            self.assertEqual(report["normalized_wallets"], 10)
            self.assertEqual(report["status"], "published")
            self.assertEqual(len(json.loads(publish.call_args.args[0])["wallets"]), 10)

    def test_saved_probe_reuses_response_and_measures_cost_without_portfolio_request(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); saved = root / "saved"; saved.mkdir(); output = root / "output"; output.mkdir()
            data = core.encode(leaderboard()); selected = [{"address": WALLET}]
            (saved / "baseline-data.json").write_bytes(data)
            (saved / "response-1.json").write_bytes(core.encode(response()))
            previous = {"mode": "probe", "portfolio_requests": 1, "credit_requests": 2,
                        "credit_query_observed_cu": 1, "source_sha256": core.digest(data),
                        "selected_addresses": [WALLET], "credits_before": 16671}
            (saved / "report.json").write_bytes(core.encode(previous))
            report = {}
            with patch.object(run, "api") as request:
                run.audit_saved_probe(saved, data, selected, lambda: 16639, report, output, NOW)
                request.assert_not_called()
            self.assertEqual(report["portfolio_cu_inferred"], 30)
            self.assertEqual(report["status"], "validated")
            with self.assertRaises(core.Invalid):
                run.audit_saved_probe(saved, data, selected, lambda: 16638, {}, output, NOW)
            with self.assertRaises(core.Invalid):
                run.audit_saved_probe(saved, b"changed", selected, lambda: 16639, {}, output, NOW)

    def test_rate_spacing_applies_to_credits_and_portfolio_requests(self):
        class Reply(io.BytesIO):
            def __enter__(self): return self
            def __exit__(self, *args): return False
        with patch.object(run.urllib.request, "urlopen", side_effect=lambda *a, **k: Reply(b'{"success":true}')), patch.object(run.time, "sleep") as wait:
            run.api('/utils/v1/credits', 'fixture-not-a-key')
            run.api('/wallet/v2/current-net-worth?wallet=fixture', 'fixture-not-a-key')
        self.assertEqual(wait.call_args_list, [unittest.mock.call(2), unittest.mock.call(2)])

    def test_top_ten_matches_realized_secondary_and_preserves_input(self):
        data = leaderboard(); old = copy.deepcopy(data)
        rows = core.top_ten(data, NOW)
        self.assertEqual([w["realized"] for w in rows], list(range(11, 1, -1)))
        self.assertEqual(data, old)
        data["week"][0]["realized"] = 100; data["week"][1]["realized"] = 100
        self.assertEqual(core.top_ten(data, NOW)[0]["address"], "A" * 32)

    def test_stale_duplicate_and_missing_rank_data_fail_before_requests(self):
        for change in (lambda d: d.update(updated_at="2026-10-16T00:00:00Z"),
                       lambda d: d["week"][0].update(realized=None),
                       lambda d: d["week"][0].update(address=d["week"][1]["address"]),
                       lambda d: d.update(week=d["week"][:9])):
            data = leaderboard(); change(data)
            with self.assertRaises(core.Invalid): core.top_ten(data, NOW)

    def test_percentage_uses_entire_portfolio_not_top_five_sum(self):
        result = core.normalize(response(), WALLET, NOW)
        self.assertEqual(result["tokens"][0]["pct"], 40.05)
        self.assertEqual(result["tokens"][1]["pct"], 10)
        self.assertEqual(result["snapshot_date"], "2026-10-19T09:00:00+08:00")

    def test_empty_portfolio_is_valid_zero_percentage_is_unknown(self):
        r = response(); r["data"].update(total_value="0", items=[]); r["pagination"]["total"] = 0
        self.assertEqual(core.normalize(r, WALLET, NOW)["tokens"], [])
        r = response(); r["data"]["total_value"] = 0
        for item in r["data"]["items"]: item["value"] = 0
        self.assertIsNone(core.normalize(r, WALLET, NOW)["tokens"][0]["pct"])
        r = response(); r["data"].update(total_value="0", items=None); r["pagination"]["total"] = 0
        self.assertEqual(core.normalize(r, WALLET, NOW)["tokens"], [])
        r["data"]["total_value"] = "1"
        with self.assertRaises(core.Invalid): core.normalize(r, WALLET, NOW)

    def test_wrong_identity_stale_future_wrong_chain_rejected(self):
        for change in (lambda r: r["data"].update(wallet_address="Z" * 32),
                       lambda r: r["data"].update(current_timestamp="2026-10-18T00:00:00Z"),
                       lambda r: r["data"].update(current_timestamp=(NOW+timedelta(hours=1)).isoformat()),
                       lambda r: r["data"]["items"][0].update(network="ethereum")):
            r = response(); change(r)
            with self.assertRaises(core.Invalid): core.normalize(r, WALLET, NOW)

    def test_incomplete_unordered_duplicates_and_missing_values_rejected(self):
        for change in (lambda r: r["pagination"].update(total=100),
                       lambda r: r["data"]["items"].reverse(),
                       lambda r: r["data"]["items"][0].update(address="C" * 32),
                       lambda r: r["data"]["items"][0].update(value=None),
                       lambda r: r["data"]["items"][0].update(value=-1)):
            r = response(); change(r)
            with self.assertRaises(core.Invalid): core.normalize(r, WALLET, NOW)

    def test_upstream_valuation_difference_keeps_actual_ratio(self):
        r = response(); r["data"]["total_value"] = "400.49"
        result = core.normalize(r, WALLET, NOW)
        self.assertGreater(result["tokens"][0]["pct"], 100)
        self.assertEqual(result["tokens"][0]["value_usd"], 400.5)

    def test_decimal_nan_bool_and_overflow_rejected(self):
        for value in (None, True, "NaN", "Infinity", "9007199254740992"):
            with self.assertRaises(core.Invalid): core.number(value)

    def test_auto_runs_after_monday_full_and_only_once(self):
        self.assertTrue(core.auto_due(event(), leaderboard(), None, NOW, True))
        self.assertFalse(core.auto_due(event(), leaderboard(), {"updated_at": NOW.isoformat()}, NOW, True))
        self.assertFalse(core.auto_due(event(), leaderboard(), None, NOW, False))

    def test_auto_rejects_flash_forks_failures_manual_and_stale_source(self):
        for patch_value in ({"display_title": "Leaderboard publish · 0 6,12,18 * * *"},
                            {"head_repository": {"full_name": "someone/fork"}},
                            {"conclusion": "failure"}, {"event": "workflow_dispatch"},
                            {"created_at": "2026-10-20T00:00:00Z"}):
            e = event(); e["workflow_run"].update(patch_value)
            self.assertFalse(core.auto_due(e, leaderboard(), None, NOW, True))
        data = leaderboard(); data["updated_at"] = "2026-10-18T00:00:00Z"
        self.assertFalse(core.auto_due(event(), data, None, NOW, True))

    def test_publication_refuses_changed_source_without_writing(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); (root / "data.json").write_bytes(b"new-source")
            with patch.object(run, "ROOT", root), patch.object(run, "synchronize"):
                with self.assertRaises(core.Invalid): run.publish(b"candidate", None, b"old-source")
            self.assertFalse((root / "holdings.json").exists())

    def test_publication_refuses_changed_target_without_writing(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); (root / "data.json").write_bytes(b"source")
            (root / "holdings.json").write_bytes(b"other-publication")
            with patch.object(run, "ROOT", root), patch.object(run, "synchronize"):
                with self.assertRaises(core.Invalid): run.publish(b"candidate", b"old-target", b"source")
            self.assertEqual((root / "holdings.json").read_bytes(), b"other-publication")

    def test_failure_mid_batch_leaves_repository_untouched(self):
        from types import SimpleNamespace
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder) / "repo"; root.mkdir(); evidence = Path(folder) / "evidence"
            data = leaderboard(); source = core.encode(data)
            (root / "data.json").write_bytes(source)
            event_path = Path(folder) / "event.json"; event_path.write_text(json.dumps({"inputs": {"mode": "publish"}}))
            env = {"GITHUB_ACTIONS": "true", "GITHUB_REF": "refs/heads/main", "GITHUB_EVENT_NAME": "workflow_dispatch", "GITHUB_EVENT_PATH": str(event_path), "BIRDEYE_API_KEY": "fixture-not-a-key"}
            first = response(); first["data"]["wallet_address"] = "M" * 32
            report = {}
            class Clock:
                @staticmethod
                def now(_): return NOW
            with patch.dict(run.os.environ, env), patch.object(run, "ROOT", root), patch.object(run, "synchronize"), patch.object(run, "git", return_value="commit"), patch.object(run, "datetime", Clock), patch.object(run, "credits", return_value=20000), patch.object(run.time, "sleep"), patch.object(run, "api", side_effect=[first, core.Invalid("fixture timeout")]):
                with self.assertRaises(core.Invalid): run.run(SimpleNamespace(output=evidence), report)
            self.assertEqual((root / "data.json").read_bytes(), source)
            self.assertFalse((root / "holdings.json").exists())
            self.assertFalse((evidence / "holdings.json").exists())
            self.assertEqual(report["portfolio_requests"], 2)


if __name__ == "__main__": unittest.main()
