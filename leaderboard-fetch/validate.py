#!/usr/bin/env python3
"""Manual, read-only rehearsal of the VM collector. Never publish data.json."""
import argparse
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys
from datetime import datetime, timezone, timedelta

REPO = Path(__file__).resolve().parents[1]
ADDRESS = re.compile(r"[1-9A-HJ-NP-Za-km-z]{32,44}\Z")
TAIPEI = timezone(timedelta(hours=8))


class ValidationError(Exception):
    """Messages are fixed diagnostics, never upstream bodies or secret values."""


def load_collector():
    spec = importlib.util.spec_from_file_location("vm_collector", REPO / "fetch.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def parse_time(value):
    if not isinstance(value, str):
        raise ValidationError("Missing source timestamp")
    try:
        stamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise ValidationError("Invalid source timestamp") from None
    if stamp.tzinfo is None:
        raise ValidationError("Source timestamp has no timezone")
    return stamp


def numeric(value):
    return not isinstance(value, bool) and isinstance(value, (int, float)) and math.isfinite(value)


def validate_raw(rows, expected):
    if not isinstance(rows, list) or len(rows) != expected:
        raise ValidationError("Incomplete leaderboard response")
    seen = set()
    for row in rows:
        if not isinstance(row, dict) or not isinstance(row.get("address"), str) or not ADDRESS.fullmatch(row["address"]):
            raise ValidationError("Invalid wallet address")
        if row["address"] in seen:
            raise ValidationError("Duplicate wallet address")
        seen.add(row["address"])
        # Avoid silently converting an incomplete API response to zero during acceptance.
        for field in ("pnl", "realized_pnl", "volume", "trade_count"):
            if not numeric(row.get(field)):
                raise ValidationError("Missing or non-finite API metric")
        if row["volume"] < 0 or row["trade_count"] < 0 or int(row["trade_count"]) != row["trade_count"]:
            raise ValidationError("Invalid volume or trade count")
        if row["trade_count"] > 9007199254740991:
            raise ValidationError("Trade count exceeds frontend precision")


def collect(collector, key, baseline_time, now=lambda: datetime.now(timezone.utc)):
    if not key or not key.strip():
        raise ValidationError("BIRDEYE_API_KEY Secret is not available")
    started = now()
    left = collector.credits_left(key)
    if not numeric(left) or left < collector.MIN_CREDITS:
        raise ValidationError("Insufficient or invalid Birdeye credits; no candidate generated")
    periods = {}
    for api_period, output_period in (("today", "today"), ("1W", "week")):
        rows = collector.fetch_top(api_period, key)
        validate_raw(rows, collector.TOP_N)
        periods[output_period] = [collector.norm(row) for row in rows]
        collector.time.sleep(2)
    completed = now()
    stamp = completed.astimezone(TAIPEI).isoformat(timespec="seconds")
    if parse_time(stamp) <= parse_time(baseline_time):
        raise ValidationError("Candidate updated_at did not advance beyond baseline")
    if completed < started:
        raise ValidationError("Runner clock moved backwards")
    candidate = {
        "updated_at": stamp, "source": "Birdeye", "chain": collector.CHAIN,
        "insight": {"today": collector.insight(periods["today"], "今日"),
                    "week": collector.insight(periods["week"], "近7日")},
        **periods,
    }
    # Reject overflow after normalization too; JSON must be valid in the existing frontend.
    json.dumps(candidate, allow_nan=False)
    return candidate, {"secret_available": True, "credits_before": left,
                       "fetch_started_at": started.isoformat(), "fetch_completed_at": completed.isoformat()}


def safe_destination(repo, destination):
    repo, destination = repo.resolve(), destination.resolve()
    if destination == repo or repo in destination.parents or destination in repo.parents:
        raise ValidationError("Validation output must be outside the repository")
    destination.mkdir(parents=True, exist_ok=True)
    for name in ("data.json", "baseline-data.json", "validation.json", "README.md"):
        if (destination / name).exists() or (destination / name).is_symlink():
            raise ValidationError("Validation output already exists; refusing to reuse prior evidence")
    return destination


def sha256(raw):
    return hashlib.sha256(raw).hexdigest()


def git(repo, *args):
    return subprocess.check_output(["git", *args], cwd=repo, text=True).strip()


def run(repo, destination, collector, key, now=lambda: datetime.now(timezone.utc)):
    destination = safe_destination(repo, destination)
    source = repo / "data.json"
    baseline_raw = source.read_bytes()
    baseline = json.loads(baseline_raw)
    baseline_time = baseline["updated_at"]
    parse_time(baseline_time)
    report = {
        "status": "failed", "mode": "validation_only", "publication_enabled": False,
        "schedule_enabled": False, "baseline_commit": git(repo, "rev-parse", "HEAD"),
        "baseline_updated_at": baseline_time, "baseline_sha256": sha256(baseline_raw),
        "collector_sha256": sha256((repo / "fetch.py").read_bytes()),
        "secret_available": bool(key and key.strip()),
    }
    try:
        candidate, facts = collect(collector, key, baseline_time, now)
        report.update(facts)
        candidate_raw = (json.dumps(candidate, ensure_ascii=False, indent=1, allow_nan=False) + "\n").encode("utf-8")
        if source.read_bytes() != baseline_raw:
            raise ValidationError("Repository data.json changed during validation")
        with (destination / "data.json").open("xb") as handle:
            handle.write(candidate_raw)
        with (destination / "baseline-data.json").open("xb") as handle:
            handle.write(baseline_raw)
        report.update(status="passed", candidate_updated_at=candidate["updated_at"],
                      candidate_sha256=sha256(candidate_raw), repository_data_unchanged=True,
                      today_rows=len(candidate["today"]), week_rows=len(candidate["week"]))
    except ValidationError as error:
        report["failure"] = str(error)
    except Exception as error:
        # Do not echo HTTP bodies, exception messages, request headers or environment.
        report["failure"] = "Collector failed: " + type(error).__name__
        response = getattr(error, "response", None)
        if response is not None:
            report["http_status"] = response.status_code
    finally:
        report["repository_data_unchanged"] = source.read_bytes() == baseline_raw
        if not report["repository_data_unchanged"]:
            report.update(status="failed", failure="Repository data.json changed during validation")
        (destination / "validation.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    lines = ["# Birdeye 抓取驗證（尚未發布）", "",
             "這是 Actions 暫存候選資料；正式 data.json 仍由 Ren VM 更新。", "",
             f"結果：{report['status']}", f"基準時間：{baseline_time}",
             f"候選時間：{report.get('candidate_updated_at', '未產生')}",
             f"今日／近週筆數：{report.get('today_rows', 0)} / {report.get('week_rows', 0)}", "",
             "data.json：本次候選資料；baseline-data.json：執行前正式資料；validation.json：時間與 hash 驗證。",
             "updated_at 延續原 fetch.py 定義，是完成本批抓取的時間，不宣稱是鏈上事件時間。", "",
             "此 workflow 沒有 schedule、寫入模式或 push 步驟；驗證成功也不會自動接管。",
             "請 Ren 驗收 artifact 的時間與內容，再依 HANDOFF.md 協調唯一寫入者交接。", ""]
    (destination / "README.md").write_text("\n".join(lines), encoding="utf-8")
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()
    try:
        report = run(REPO, args.output_dir, load_collector(), os.environ.get("BIRDEYE_API_KEY", ""))
        # Only the real CLI invocation publishes a job summary. Unit-test fixtures
        # exercise run() without being mistaken for genuine API observations.
        if os.environ.get("GITHUB_STEP_SUMMARY"):
            with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as summary:
                summary.write((args.output_dir / "README.md").read_text(encoding="utf-8"))
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0 if report["status"] == "passed" else 1
    except Exception as error:
        print(str(error) if isinstance(error, ValidationError) else "Validation setup failed: " + type(error).__name__, file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
