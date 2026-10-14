"""Actions-only end-to-end acceptance using the built-in GITHUB_TOKEN.

Dispatch a baseline check, alter one snapshot hash, dispatch another check,
verify its review entry, then mark ONLY that test entry reviewed. Never touch
wallets.json. Real source changes remain pending.
"""
import base64
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import time

import requests

REPOSITORY = 'kkweb3345678/trader-leaderboard'
API = 'https://api.github.com/repos/' + REPOSITORY
ROOT = Path(__file__).resolve().parent
EVIDENCE = {'schedule':'7 * * * *', 'runs':[], 'complete':False}
SESSION = requests.Session()


def api(method, path, body=None, missing_ok=False):
    response = SESSION.request(method, API + path, json=body, timeout=30)
    if missing_ok and response.status_code == 404:
        return None
    if not response.ok:
        raise RuntimeError('GitHub API returned HTTP ' + str(response.status_code))
    return response.json() if response.content else None


def file(path, missing_ok=False):
    item = api('GET', '/contents/' + path + '?ref=main', missing_ok=missing_ok)
    if item is None:
        return None, None
    return base64.b64decode(item['content']), item['sha']


def update(path, content, sha, message):
    if path == 'wallets.json' or not path.startswith('wallets-check/'):
        raise RuntimeError('Protected path refused')
    return api('PUT', '/contents/' + path, {'message':message,'branch':'main','sha':sha,
                                           'content':base64.b64encode(content).decode('ascii')})


def json_file(path):
    raw, sha = file(path)
    return json.loads(raw), sha


def dispatch(stage):
    label = 'acceptance-' + os.environ['GITHUB_RUN_ID'] + '-' + stage
    api('POST', '/actions/workflows/wallets-check.yml/dispatches', {'ref':'main','inputs':{'audit_id':label}})
    deadline = time.monotonic() + 1000
    run = None
    while time.monotonic() < deadline:
        time.sleep(20)
        if run:
            run = api('GET', '/actions/runs/' + str(run['id']))
        else:
            runs = api('GET', '/actions/workflows/wallets-check.yml/runs?event=workflow_dispatch&per_page=20')['workflow_runs']
            run = next((item for item in runs if item.get('display_title') == 'Wallet source check · ' + label), None)
        if run and run['status'] == 'completed':
            EVIDENCE['runs'].append({'stage':stage,'id':run['id'],'url':run['html_url'],'conclusion':run['conclusion']})
            if run['conclusion'] != 'success':
                raise RuntimeError(stage + ' workflow failed; inspect its run log')
            print(stage + ': ' + run['html_url'], flush=True)
            return run
    raise RuntimeError(stage + ' workflow timed out')


def main():
    if os.environ.get('GITHUB_ACTIONS') != 'true' or os.environ.get('GITHUB_REPOSITORY') != REPOSITORY or os.environ.get('GITHUB_REF') != 'refs/heads/main':
        raise RuntimeError('Acceptance requires Actions on the intended main branch')
    SESSION.headers.update({'Authorization':'Bearer ' + os.environ['GITHUB_TOKEN'],
                            'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'})
    before, _ = file('wallets.json')
    EVIDENCE['dataset_sha256'] = hashlib.sha256(before).hexdigest()
    prior, _ = file('wallets-check/review-queue.json', missing_ok=True)
    initial = prior is None
    EVIDENCE['initial_baseline'] = initial
    dispatch('baseline')
    first, _ = json_file('wallets-check/check-log.json')
    queue, _ = json_file('wallets-check/review-queue.json')
    EVIDENCE['baseline'] = first
    EVIDENCE['baseline_queue'] = queue
    assert first['checked'] > 0 and first['dataset_unchanged']
    if initial:
        assert queue == [] and first['changed'] == 0
    readable = [item for item in first['results'] if item['status'] in ('baseline', 'unchanged', 'changed')]
    target = next((item for item in readable if item['wallet_id'] == 'metamask' and item['dimension'] == 'swap_fee'), readable[0])
    EVIDENCE['test_target'] = {'wallet_id':target['wallet_id'], 'dimension':target['dimension']}
    path = f"wallets-check/snapshots/{target['wallet_id']}_{target['dimension']}.hash"
    original, original_sha = file(path)
    try:
        update(path, b'0' * 64 + b'\n', original_sha, 'Acceptance test: alter one wallet source snapshot hash')
        dispatch('changed-hash')
        second, _ = json_file('wallets-check/check-log.json')
        queue, queue_sha = json_file('wallets-check/review-queue.json')
        tests = [item for item in queue if item['wallet_id'] == target['wallet_id'] and item['dimension'] == target['dimension'] and item.get('old_hash') == '0' * 64 and item.get('status') == 'pending']
        assert len(tests) == 1 and second['changed'] >= 1 and second['dataset_unchanged']
        EVIDENCE['changed_hash'] = second
        EVIDENCE['test_entry_before_review'] = dict(tests[0])
        tests[0].update(status='reviewed', test=True, review_note='Intentional acceptance hash change; no wallet data update.', reviewed_at=datetime.now(timezone.utc).isoformat(timespec='seconds'))
        update('wallets-check/review-queue.json', (json.dumps(queue, ensure_ascii=False, indent=2) + '\n').encode('utf-8'), queue_sha, 'Mark intentional wallet checker acceptance alert reviewed')
        # The status remains a record of the last actual check, with its pending
        # count explicitly reconciled after this known test entry is reviewed.
        latest, latest_sha = json_file('wallets-check/check-log.json')
        current_queue, _ = json_file('wallets-check/review-queue.json')
        latest['pending_reviews'] = sum(item.get('status') == 'pending' for item in current_queue)
        latest['last_reviewed_at'] = tests[0]['reviewed_at']
        update('wallets-check/check-log.json', (json.dumps(latest, ensure_ascii=False, indent=2) + '\n').encode('utf-8'), latest_sha, 'Record acceptance alert review without changing check time')
        api('POST', '/pages/builds')
        after, _ = file('wallets.json')
        assert before == after, 'Reviewed dataset changed during acceptance'
        EVIDENCE['complete'] = True
    finally:
        current, current_sha = file(path)
        if current.strip() == b'0' * 64:
            update(path, original, current_sha, 'Restore snapshot after interrupted acceptance test')


if __name__ == '__main__':
    code = 0
    try:
        main()
    except (RuntimeError, AssertionError, requests.RequestException, KeyError, ValueError) as exc:
        code = 1
        EVIDENCE['error'] = str(exc) if isinstance(exc, (RuntimeError, AssertionError)) else type(exc).__name__
        print('Acceptance did not complete: ' + EVIDENCE['error'])
    finally:
        SESSION.close()
        (ROOT / 'acceptance-log.json').write_text(json.dumps(EVIDENCE, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        lines = ['## Wallet source check acceptance', '', 'Schedule: `7 * * * *` (every hour at minute 7).', '']
        lines.extend(f"- {item['stage']}: [{item['conclusion']}]({item['url']})" for item in EVIDENCE['runs'])
        if EVIDENCE.get('baseline'):
            baseline = EVIDENCE['baseline']
            lines.append(f"- Baseline: {baseline['checked']}/{baseline['configured']} successful; {baseline['failed']} failed; {baseline['skipped']} without a source; queue entries {len(EVIDENCE['baseline_queue'])}.")
        lines.extend(['', f"Complete: `{EVIDENCE['complete']}`. Reviewed wallet dataset SHA-256: `{EVIDENCE.get('dataset_sha256', 'unavailable')}`."])
        if EVIDENCE.get('error'):
            lines.append('Error: ' + EVIDENCE['error'])
        if os.environ.get('GITHUB_STEP_SUMMARY'):
            with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as out:
                out.write('\n'.join(lines) + '\n')
    raise SystemExit(code)
