"""Manual, bounded account verification; saves public responses, never publishes data."""
import argparse
from datetime import datetime, timezone
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.request
import urllib.error

ROOT = Path(__file__).resolve().parents[1]

def encode(value):
    return (json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode()

def main(output, report):
    if os.environ.get('GITHUB_ACTIONS') != 'true' or os.environ.get('GITHUB_REF') != 'refs/heads/main':
        raise ValueError('Actions main only')
    if ROOT == output.resolve() or ROOT in output.resolve().parents:
        raise ValueError('Evidence must be outside checkout')
    def git(*args):
        return subprocess.check_output(['git', *args], cwd=ROOT).decode().strip()
    if git('status', '--porcelain'):
        raise ValueError('Clean checkout required')
    git('fetch', '--no-tags', 'origin', 'main')
    git('merge', '--ff-only', 'FETCH_HEAD')
    key = os.environ.get('BIRDEYE_API_KEY', '').strip()
    if not key:
        raise ValueError('Secret unavailable')
    protected = {p: (ROOT / p).read_bytes() for p in ('data.json', 'today-flash.json')}
    (output / 'baseline-data.json').write_bytes(protected['data.json'])
    report.update(source_commit=git('rev-parse', 'HEAD'), requests=[], credit_requests=0)
    def request(path, chain='solana', body=None):
        req = urllib.request.Request('https://public-api.birdeye.so' + path,
            data=encode(body) if body else None,
            headers={'X-API-KEY': key, 'x-chain': chain, 'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=45) as response:
                return json.loads(response.read())
        except urllib.error.HTTPError as error:
            report['http_diagnostic'] = {'status': error.code,
                'body': error.read(1000).decode(errors='replace').replace(key, '[redacted]')}
            raise ValueError('API HTTP failure; no automatic paid retry') from None
        finally:
            time.sleep(3)
    def credits():
        report['credit_requests'] += 1
        value = request('/utils/v1/credits')['data']['remaining']['total']
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError('Invalid credit response')
        return value
    before = credits()
    report['credits_before'] = before
    if before < 3130:
        raise ValueError('Reserve plus probe budget unavailable')
    balance = credits()
    report['credit_query_observed_cu'] = before - balance
    if before - balance != 1:
        raise ValueError('Credit calibration failed')
    spec = importlib.util.spec_from_file_location('leaderboard_validation', ROOT / 'leaderboard-fetch/validate.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    for name, chain, period, count in [('base', 'base', 'today', 20), ('today', 'solana', 'today', 100), ('week', 'solana', '1W', 100)]:
        entry = {'endpoint': 'gainers-losers', 'chain': chain, 'period': period, 'limit': count}
        report['requests'].append(entry)
        response = request(f'/trader/gainers-losers?type={period}&sort_by=PnL&sort_type=desc&offset=0&limit={count}', chain)
        (output / f'leaderboard-{name}.json').write_bytes(encode(response))
        after = credits()
        entry['inferred_cu'] = balance - after - 1
        balance = after
        report['credits_after'] = after
        module.validate_raw(response.get('data', {}).get('items'), count, chain)
        entry['rows'] = len(response['data']['items'])
        if entry['inferred_cu'] != 30:
            raise ValueError('Leaderboard cost not isolated at 30 CU')
    source = json.loads(protected['data.json'])
    selected = sorted(source['week'], key=lambda w: (-w['volume'], -w['realized'], w['address']))[0]['address']
    body = {'wallet': selected, 'duration': '7d', 'position_scope': 'duration_only', 'pnl_method': 'wac',
            'sort_by': 'last_trade', 'sort_type': 'desc', 'limit': 100, 'offset': 0}
    entry = {'endpoint': 'pnl/details', 'wallet': selected, 'body': body}
    report['requests'].append(entry)
    response = request('/wallet/v2/pnl/details', body=body)
    (output / 'pnl-response.json').write_bytes(encode(response))
    after = credits()
    entry['inferred_cu'] = balance - after - 1
    report['credits_after'] = after
    if entry['inferred_cu'] != 30 or response.get('success') is False or not isinstance(response.get('data'), dict):
        raise ValueError('PnL permission, response or 30 CU check failed')
    if any((ROOT / p).read_bytes() != value for p, value in protected.items()):
        raise ValueError('Protected data changed')
    report.update(status='validated', protected_data_unchanged=True,
                  completed_at=datetime.now(timezone.utc).isoformat(),
                  total_cu_inferred=sum(r['inferred_cu'] for r in report['requests']) + report['credit_requests'])

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    report = {'status': 'failed'}
    try:
        main(args.output, report)
    except Exception as error:
        report['error'] = str(error) if isinstance(error, ValueError) else type(error).__name__
    (args.output / 'report.json').write_bytes(encode(report))
    print(json.dumps(report))
    sys.exit(report['status'] != 'validated')
