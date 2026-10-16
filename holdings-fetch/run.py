"""Actions-only collection: fixed endpoint, no automatic paid retries, atomic all-ten publication."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from core import Invalid, auto_due, digest, encode, normalize, number, stamp, top_ten

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://public-api.birdeye.so"


def git(*args, binary=False):
    p = subprocess.run(["git", "-c", "user.name=github-actions[bot]", "-c",
                        "user.email=41898282+github-actions[bot]@users.noreply.github.com", *args],
                       cwd=ROOT, capture_output=True, check=True)
    return p.stdout if binary else p.stdout.decode().strip()


def api(path, key):
    request = urllib.request.Request(BASE + path, headers={"X-API-KEY": key, "x-chain": "solana"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as error:
        failure = Invalid(f"Birdeye HTTP {error.code}; no automatic retry")
        # Preserve a short diagnostic, never request headers or the Secret.
        failure.details = {"status": error.code, "retry_after": error.headers.get("Retry-After"),
                           "body_excerpt": error.read(1000).decode("utf-8", errors="replace").replace(key, "[redacted]")}
        raise failure from None
    except Exception:
        raise Invalid("Birdeye request or JSON failed; no automatic retry") from None
    finally:
        # The account rate limit applies to credits queries as well as portfolio calls.
        time.sleep(2)


def credits(key):
    response = api("/utils/v1/credits", key)
    try:
        return number(response["data"]["remaining"]["total"])
    except (KeyError, TypeError):
        raise Invalid("Credits response is incomplete") from None


def synchronize():
    if git("status", "--porcelain"):
        raise Invalid("Clean checkout required")
    git("fetch", "--no-tags", "origin", "main")
    git("merge", "--ff-only", "FETCH_HEAD")


def publish(raw, baseline, data_raw):
    synchronize()
    path = ROOT / "holdings.json"
    if (path.read_bytes() if path.exists() else None) != baseline or (ROOT / "data.json").read_bytes() != data_raw:
        raise Invalid("Source or holdings changed since collection; candidate preserved, no overwrite")
    path.write_bytes(raw)
    git("add", "--", "holdings.json")
    if git("diff", "--cached", "--name-only") != "holdings.json":
        raise Invalid("Unexpected staged path")
    git("commit", "-m", "Refresh weekly Top 10 holdings " + json.loads(raw)["updated_at"])
    for attempt in range(3):
        git("fetch", "--no-tags", "origin", "main")
        remote_files = git("ls-tree", "--name-only", "FETCH_HEAD").splitlines()
        remote = git("show", "FETCH_HEAD:holdings.json", binary=True) if "holdings.json" in remote_files else None
        if remote != baseline or git("show", "FETCH_HEAD:data.json", binary=True) != data_raw:
            raise Invalid("Concurrent source or holdings update; refusing overwrite")
        git("rebase", "FETCH_HEAD")
        try:
            git("push", "origin", "HEAD:main")
            break
        except subprocess.CalledProcessError:
            if attempt == 2:
                raise Invalid("Push rejected; candidate preserved") from None
            time.sleep(2)
    git("fetch", "--no-tags", "origin", "main")
    if git("show", "FETCH_HEAD:holdings.json", binary=True) != raw:
        raise Invalid("Remote verification failed")
    return git("rev-parse", "HEAD")


def run(args, report):
    if os.environ.get("GITHUB_ACTIONS") != "true" or os.environ.get("GITHUB_REF") != "refs/heads/main":
        raise Invalid("Collector is restricted to main in Actions")
    if args.output.resolve() == ROOT or ROOT in args.output.resolve().parents:
        raise Invalid("Evidence must be outside checkout")
    synchronize()
    now = datetime.now(timezone.utc)
    data_raw = (ROOT / "data.json").read_bytes()
    data = json.loads(data_raw)
    target = ROOT / "holdings.json"
    baseline = target.read_bytes() if target.exists() else None
    existing = json.loads(baseline) if baseline else None
    event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
    event_name = os.environ["GITHUB_EVENT_NAME"]
    mode = event.get("inputs", {}).get("mode", "probe")
    if event_name == "workflow_run":
        if not auto_due(event, data, existing, now, os.environ.get("HOLDINGS_AUTOMATION_ENABLED") == "true"):
            report.update(status="skipped", reason="Not an eligible, unpublished Monday full update")
            return
        mode = "publish"
    elif event_name != "workflow_dispatch" or mode not in ("probe", "publish"):
        raise Invalid("Unsupported trigger or mode")
    selected = top_ten(data, now)
    report.update(mode=mode, source_updated_at=data["updated_at"], source_sha256=digest(data_raw),
                  source_commit=git("rev-parse", "HEAD"), selected_addresses=[w["address"] for w in selected],
                  portfolio_requests=0, credit_requests=0)
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "baseline-data.json").write_bytes(data_raw)
    key = os.environ.get("BIRDEYE_API_KEY", "").strip()
    if not key:
        raise Invalid("BIRDEYE_API_KEY Secret unavailable")
    def balance():
        report["credit_requests"] += 1
        return credits(key)
    before = balance()
    if before < 3300:
        raise Invalid("Credits below existing reserve plus weekly refresh budget")
    report["credits_before"] = float(before)
    calibration = None
    if mode == "probe":
        measured = balance()
        calibration = before - measured
        report["credit_query_observed_cu"] = float(calibration)
        before = measured
    wallets = []
    for row in selected[:1] if mode == "probe" else selected:
        query = urllib.parse.urlencode({"wallet": row["address"], "sort_by": "value", "sort_type": "desc", "limit": 5, "offset": 0})
        report["portfolio_requests"] += 1
        response = api("/wallet/v2/current-net-worth?" + query, key)
        # Raw public response is evidence, not code or logs; never persist request headers.
        (args.output / f"response-{len(wallets)+1}.json").write_bytes(encode(response))
        wallets.append(normalize(response, row["address"], datetime.now(timezone.utc)))
    after = balance()
    delta = before - after
    report.update(credits_after=float(after), credits_observed_delta=float(delta),
                  normalized_wallets=len(wallets), portfolio_cu_per_request_documented=30,
                  credit_cu_per_request_documented=1)
    if mode == "probe":
        report["portfolio_cu_inferred"] = float(delta - calibration)
        if calibration != 1 or delta - calibration != 30:
            raise Invalid("Account delta does not isolate the approved 30 CU; inspect evidence before full collection")
    elif not 0 <= delta <= 301:
        raise Invalid("Observed account use exceeds ten requests plus one credits check")
    candidate = {"updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "wallets": wallets}
    raw = encode(candidate)
    (args.output / "holdings.json").write_bytes(raw)
    if (ROOT / "data.json").read_bytes() != data_raw or (target.read_bytes() if target.exists() else None) != baseline:
        raise Invalid("Collector changed a repository data file")
    report.update(status="validated", candidate_sha256=digest(raw), updated_at=candidate["updated_at"])
    if mode == "publish":
        report["published_commit"] = publish(raw, baseline, data_raw)
        report["status"] = "published"


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    report = {"status": "failed"}
    try:
        run(args, report)
    except Exception as error:
        report["status"] = "failed"
        report["error"] = str(error) if isinstance(error, Invalid) else type(error).__name__
        if isinstance(error, Invalid) and hasattr(error, "details"):
            report["http_diagnostic"] = error.details
    finally:
        args.output.mkdir(parents=True, exist_ok=True)
        (args.output / "report.json").write_bytes(encode(report))
        print(json.dumps(report))
        if os.environ.get("GITHUB_STEP_SUMMARY"):
            with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as output:
                output.write("## Holdings result\n\n```json\n" + json.dumps(report, indent=2) + "\n```\n")
    sys.exit(1 if report["status"] == "failed" else 0)
