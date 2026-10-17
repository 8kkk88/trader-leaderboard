"""Daily static snapshots. Candidate validation and publication can run without re-fetching."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.request
import urllib.error
from core import Invalid, PARAMETERS, auto_due, candidate, digest, encode, number, stamp, top_ten

ROOT = Path(__file__).resolve().parents[1]
TARGET = 'wallet-trades.json'

def git(*args, binary=False):
    process = subprocess.run(['git', '-c', 'user.name=github-actions[bot]', '-c',
        'user.email=41898282+github-actions[bot]@users.noreply.github.com', *args], cwd=ROOT, capture_output=True, check=True)
    return process.stdout if binary else process.stdout.decode().strip()

def synchronize():
    if git('status', '--porcelain'):
        raise Invalid('Clean checkout required')
    git('fetch', '--no-tags', 'origin', 'main')
    git('merge', '--ff-only', 'FETCH_HEAD')

def api(path, key, body=None):
    request = urllib.request.Request('https://public-api.birdeye.so' + path,
        data=encode(body) if body else None,
        headers={'X-API-KEY': key, 'x-chain': 'solana', 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as error:
        failure = Invalid(f'Birdeye HTTP {error.code}; no automatic paid retry')
        failure.details = {'status': error.code, 'body_excerpt': error.read(1000).decode(errors='replace').replace(key, '[redacted]')}
        raise failure from None
    except Exception:
        raise Invalid('Request or JSON failed; no automatic paid retry') from None
    finally:
        time.sleep(3)

def publish(raw, baseline, source):
    synchronize()
    target = ROOT / TARGET
    if (target.read_bytes() if target.exists() else None) != baseline or (ROOT / 'data.json').read_bytes() != source:
        raise Invalid('Source or target changed; candidate preserved, no overwrite')
    target.write_bytes(raw)
    git('add', '--', TARGET)
    if git('diff', '--cached', '--name-only') != TARGET:
        raise Invalid('Unexpected staged file')
    git('commit', '-m', 'Refresh seven-day token summaries ' + json.loads(raw)['updated_at'])
    for attempt in range(3):
        git('fetch', '--no-tags', 'origin', 'main')
        files = git('ls-tree', '--name-only', 'FETCH_HEAD').splitlines()
        remote = git('show', 'FETCH_HEAD:' + TARGET, binary=True) if TARGET in files else None
        if remote != baseline or git('show', 'FETCH_HEAD:data.json', binary=True) != source:
            raise Invalid('Concurrent data change; refusing overwrite')
        git('rebase', 'FETCH_HEAD')
        try:
            git('push', 'origin', 'HEAD:main')
            break
        except subprocess.CalledProcessError:
            if attempt == 2:
                raise Invalid('Push rejected; candidate preserved') from None
            time.sleep(2)
    git('fetch', '--no-tags', 'origin', 'main')
    if git('show', 'FETCH_HEAD:' + TARGET, binary=True) != raw:
        raise Invalid('Published data verification failed')
    return git('rev-parse', 'HEAD')

def restore_candidate(folder, data_raw, baseline, now):
    previous = json.loads((folder / 'report.json').read_bytes())
    if previous.get('status') != 'validated' or previous.get('mode') != 'validate' or previous.get('source_sha256') != digest(data_raw) or previous.get('baseline_sha256') != (digest(baseline) if baseline else None):
        raise Invalid('Saved candidate does not match current source and target')
    raw = (folder / TARGET).read_bytes()
    if digest(raw) != previous.get('candidate_sha256') or (folder / 'baseline-data.json').read_bytes() != data_raw:
        raise Invalid('Saved candidate hash mismatch')
    saved = json.loads(raw)
    if not 0 <= (now - stamp(saved['updated_at'])).total_seconds() <= 6 * 3600:
        raise Invalid('Saved candidate too old to publish')
    responses = [json.loads((folder / f'response-{i}.json').read_bytes()) for i in range(1, 11)]
    rebuilt = candidate(responses, data_raw, saved['source_commit'], stamp(saved['updated_at']))
    if encode(rebuilt) != raw:
        raise Invalid('Saved candidate differs from raw responses')
    return raw, responses

def run(output, report):
    if os.environ.get('GITHUB_ACTIONS') != 'true' or os.environ.get('GITHUB_REF') != 'refs/heads/main':
        raise Invalid('Actions main only')
    if ROOT == output.resolve() or ROOT in output.resolve().parents:
        raise Invalid('Evidence must be outside checkout')
    synchronize()
    now = datetime.now(timezone.utc)
    source = (ROOT / 'data.json').read_bytes()
    data = json.loads(source)
    target = ROOT / TARGET
    baseline = target.read_bytes() if target.exists() else None
    existing = json.loads(baseline) if baseline else None
    event = json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_bytes())
    mode = event.get('inputs', {}).get('mode', 'validate')
    if os.environ['GITHUB_EVENT_NAME'] == 'workflow_run':
        if not auto_due(event, data, existing, now, os.environ.get('WALLET_TRADES_AUTOMATION_ENABLED') == 'true'):
            report.update(status='skipped', reason='No eligible unpublished daily full snapshot')
            return
        mode = 'refresh'
    elif os.environ['GITHUB_EVENT_NAME'] != 'workflow_dispatch' or mode not in ('validate', 'publish_saved', 'refresh'):
        raise Invalid('Unsupported trigger')
    selected = top_ten(data, now)
    report.update(mode=mode, source_updated_at=data['updated_at'], source_sha256=digest(source),
        source_commit=git('rev-parse', 'HEAD'), baseline_sha256=digest(baseline) if baseline else None,
        selected_addresses=[w['address'] for w in selected], pnl_requests=0, credit_requests=0)
    (output / 'baseline-data.json').write_bytes(source)
    if mode == 'publish_saved':
        raw, responses = restore_candidate(Path(os.environ['RUNNER_TEMP']) / 'trade-candidate', source, baseline, now)
        report['reused_run'] = event['inputs']['candidate_run']
    else:
        # Never automatically refresh the same source twice, including manual retries after success.
        if existing and existing.get('source_sha256') == digest(source):
            report.update(status='skipped', reason='This source snapshot already has token summaries')
            return
        key = os.environ.get('BIRDEYE_API_KEY', '').strip()
        if not key:
            raise Invalid('Secret unavailable')
        def credits():
            report['credit_requests'] += 1
            return number(api('/utils/v1/credits', key)['data']['remaining']['total'], nonnegative=True)
        before = credits()
        report['credits_before'] = before
        if before < 3302:
            raise Invalid('Reserve plus full batch budget unavailable')
        responses = []
        for index, row in enumerate(selected, 1):
            report['pnl_requests'] += 1
            response = api('/wallet/v2/pnl/details', key, {'wallet': row['address'], **PARAMETERS})
            (output / f'response-{index}.json').write_bytes(encode(response))
            responses.append(response)
        after = credits()
        report.update(credits_after=after, pnl_cu_inferred=before-after-1, total_cu_inferred=before-after+1)
        if before-after-1 != 300:
            raise Invalid('Account delta does not isolate approved batch cost; inspect saved evidence')
        raw = encode(candidate(responses, source, report['source_commit'], datetime.now(timezone.utc)))
    for index, response in enumerate(responses, 1):
        (output / f'response-{index}.json').write_bytes(encode(response))
    (output / TARGET).write_bytes(raw)
    report.update(status='validated', candidate_sha256=digest(raw), normalized_wallets=len(json.loads(raw)['wallets']), updated_at=json.loads(raw)['updated_at'])
    if mode in ('publish_saved', 'refresh'):
        report['published_commit'] = publish(raw, baseline, source)
        report['status'] = 'published'

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    report = {'status': 'failed'}
    try:
        run(args.output, report)
    except Exception as error:
        report.update(status='failed', error=str(error) if isinstance(error, Invalid) else type(error).__name__)
        if hasattr(error, 'details'):
            report['http_diagnostic'] = error.details
    (args.output / 'report.json').write_bytes(encode(report))
    print(json.dumps(report))
    sys.exit(report['status'] == 'failed')
