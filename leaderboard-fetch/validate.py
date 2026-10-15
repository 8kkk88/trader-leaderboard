#!/usr/bin/env python3
"""Collect and validate full/flash candidates outside the checkout."""
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
EVM_ADDRESS = re.compile(r"0x[0-9a-fA-F]{40}\Z")
TAIPEI = timezone(timedelta(hours=8))
TARGETS = {"full": "data.json", "flash": "today-flash.json"}
BATCHES = {
    # Check the newly requested chain first, so unsupported Base does not spend 200 Solana rows.
    "full": (("today", "base_today", "base", 20), ("today", "today", "solana", 100),
             ("1W", "week", "solana", 100)),
    "flash": (("today", "today", "solana", 20),),
}


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


def validate_raw(rows, expected, chain="solana"):
    if not isinstance(rows, list) or len(rows) != expected:
        raise ValidationError("Incomplete leaderboard response")
    seen = set()
    for row in rows:
        pattern = EVM_ADDRESS if chain == "base" else ADDRESS
        if not isinstance(row, dict) or not isinstance(row.get("address"), str) or not pattern.fullmatch(row["address"]):
            raise ValidationError("Invalid wallet address")
        address = row["address"].lower() if chain == "base" else row["address"]
        if address in seen:
            raise ValidationError("Duplicate wallet address")
        seen.add(address)
        # Avoid silently converting an incomplete API response to zero during acceptance.
        for field in ("pnl", "realized_pnl", "volume", "trade_count"):
            if not numeric(row.get(field)):
                raise ValidationError("Missing or non-finite API metric")
        if row["volume"] < 0 or row["trade_count"] < 0 or int(row["trade_count"]) != row["trade_count"]:
            raise ValidationError("Invalid volume or trade count")
        if row["trade_count"] > 9007199254740991:
            raise ValidationError("Trade count exceeds frontend precision")


def collect(collector, key, baseline_time, now=lambda: datetime.now(timezone.utc), batch="full"):
    if not key or not key.strip():
        raise ValidationError("BIRDEYE_API_KEY Secret is not available")
    started = now()
    left = collector.credits_left(key)
    if not numeric(left) or left < collector.MIN_CREDITS:
        raise ValidationError("Insufficient or invalid Birdeye credits; no candidate generated")
    periods = {}
    for api_period, output_period, chain, count in BATCHES[batch]:
        try:
            rows = collector.fetch_top(api_period, key, chain, count)
        except Exception as error:
            # Fixed chain/period diagnostics, never request headers or response bodies.
            status = getattr(getattr(error, "response", None), "status_code", None)
            suffix = f" (HTTP {status})" if isinstance(status, int) else ""
            raise ValidationError(f"{chain} {api_period} fetch failed: {type(error).__name__}{suffix}") from None
        validate_raw(rows, count, chain)
        periods[output_period] = [collector.norm(row) for row in rows]
        collector.time.sleep(2)
    completed = now()
    stamp = completed.astimezone(TAIPEI).isoformat(timespec="seconds")
    if parse_time(stamp) <= parse_time(baseline_time):
        raise ValidationError("Candidate updated_at did not advance beyond baseline")
    if completed < started:
        raise ValidationError("Runner clock moved backwards")
    candidate = {
        "updated_at": stamp, "source": "Birdeye", "chain": "solana",
        **periods,
    }
    if batch == "full":
        candidate["insight"] = {"today": collector.insight(periods["today"], "今日"),
                                "week": collector.insight(periods["week"], "近7日")}
    # Reject overflow after normalization too; JSON must be valid in the existing frontend.
    json.dumps(candidate, allow_nan=False)
    return candidate, {"secret_available": True, "credits_before": left,
                       "fetch_started_at": started.isoformat(), "fetch_completed_at": completed.isoformat()}


def safe_destination(repo, destination):
    repo, destination = repo.resolve(), destination.resolve()
    if destination == repo or repo in destination.parents or destination in repo.parents:
        raise ValidationError("Validation output must be outside the repository")
    destination.mkdir(parents=True, exist_ok=True)
    for name in ("data.json", "today-flash.json", "baseline-data.json", "validation.json", "README.md"):
        if (destination / name).exists() or (destination / name).is_symlink():
            raise ValidationError("Validation output already exists; refusing to reuse prior evidence")
    return destination


def sha256(raw):
    return hashlib.sha256(raw).hexdigest()


def git(repo, *args):
    return subprocess.check_output(["git", *args], cwd=repo, text=True).strip()


def run(repo, destination, collector, key, now=lambda: datetime.now(timezone.utc), batch="full", publication=False):
    destination = safe_destination(repo, destination)
    source = repo / TARGETS[batch]
    protected = {name: (repo / name).read_bytes() for name in TARGETS.values()}
    baseline_raw = source.read_bytes()
    baseline = json.loads(baseline_raw)
    baseline_time = baseline["updated_at"]
    parse_time(baseline_time)
    report = {
        "status": "failed", "mode": "production_candidate" if publication else "validation_only",
        "publication_enabled": publication, "batch": batch, "target": TARGETS[batch],
        "baseline_commit": git(repo, "rev-parse", "HEAD"),
        "baseline_updated_at": baseline_time, "baseline_sha256": sha256(baseline_raw),
        "collector_sha256": sha256((repo / "fetch.py").read_bytes()),
        "secret_available": bool(key and key.strip()),
    }
    try:
        candidate, facts = collect(collector, key, baseline_time, now, batch)
        report.update(facts)
        candidate_raw = (json.dumps(candidate, ensure_ascii=False, indent=1, allow_nan=False) + "\n").encode("utf-8")
        if any((repo / name).read_bytes() != raw for name, raw in protected.items()):
            raise ValidationError("Repository data changed during validation")
        with (destination / TARGETS[batch]).open("xb") as handle:
            handle.write(candidate_raw)
        with (destination / "baseline-data.json").open("xb") as handle:
            handle.write(baseline_raw)
        report.update(status="passed", candidate_updated_at=candidate["updated_at"],
                      candidate_sha256=sha256(candidate_raw), repository_data_unchanged=True,
                      row_counts={name: len(candidate[name]) for _, name, _, _ in BATCHES[batch]})
    except ValidationError as error:
        report["failure"] = str(error)
    except Exception as error:
        # Do not echo HTTP bodies, exception messages, request headers or environment.
        report["failure"] = "Collector failed: " + type(error).__name__
        response = getattr(error, "response", None)
        if response is not None:
            report["http_status"] = response.status_code
    finally:
        report["repository_data_unchanged"] = all((repo / name).read_bytes() == raw for name, raw in protected.items())
        if not report["repository_data_unchanged"]:
            report.update(status="failed", failure="Repository data changed during validation")
        (destination / "validation.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    lines = [f"# Birdeye {batch} 候選資料（本步驟未發布）", "",
             "候選資料存放在 checkout 外；正式檔案的更新由獨立發布步驟控制。", "",
             f"結果：{report['status']}", f"基準時間：{baseline_time}",
             f"候選時間：{report.get('candidate_updated_at', '未產生')}",
             f"各榜單筆數：{report.get('row_counts', {})}",
             f"失敗原因：{report.get('failure', '無')}", "",
             f"{TARGETS[batch]}：候選；baseline-data.json：該目標檔的正式基準；validation.json：時間與 hash。",
             "updated_at 延續原 fetch.py 定義，是完成本批抓取的時間，不宣稱是鏈上事件時間。", "",
             "validate 模式永遠不發布；publish 模式另須明確開啟 production 開關。",
             "請 Ren 驗收 artifact 的時間與內容，再依 HANDOFF.md 協調唯一寫入者交接。", ""]
    (destination / "README.md").write_text("\n".join(lines), encoding="utf-8")
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--batch", choices=("full", "flash", "all"), default="flash")
    parser.add_argument("--publication", action="store_true")
    args = parser.parse_args()
    try:
        if args.publication and (os.environ.get("LEADERBOARD_PUBLICATION_ENABLED") != "true" or args.batch == "all"):
            raise ValidationError("Production publication is disabled or batch is invalid")
        batches = ("full", "flash") if args.batch == "all" else (args.batch,)
        reports = [run(REPO, args.output_dir / batch, load_collector(), os.environ.get("BIRDEYE_API_KEY", ""),
                       batch=batch, publication=args.publication) for batch in batches]
        # Only the real CLI invocation publishes a job summary. Unit-test fixtures
        # exercise run() without being mistaken for genuine API observations.
        if os.environ.get("GITHUB_STEP_SUMMARY"):
            with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as summary:
                for batch in batches:
                    summary.write((args.output_dir / batch / "README.md").read_text(encoding="utf-8"))
        print(json.dumps(reports, ensure_ascii=False, indent=2))
        return 0 if all(report["status"] == "passed" for report in reports) else 1
    except Exception as error:
        print(str(error) if isinstance(error, ValidationError) else "Validation setup failed: " + type(error).__name__, file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
