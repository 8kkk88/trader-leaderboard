#!/usr/bin/env python3
"""Detect official-source text changes. Never update the reviewed wallet dataset."""
from __future__ import annotations

import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import difflib
import hashlib
import json
import logging
from logging.handlers import RotatingFileHandler
import os
from pathlib import Path
import random
import re
import tempfile
import time
from urllib.parse import urljoin, urlsplit

import requests
from article import Document
from api_article import extract_api_article

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
DIMENSIONS = ('rewards', 'swap_fee')
HOSTS = {
    'metamask': ('metamask.io',), 'bitget': ('web3.bitget.com',),
    'okx': ('web3.okx.com', 'www.okx.com'), 'binance': ('www.binance.com',),
    'phantom': ('help.phantom.com',), 'rabby': ('rabby.io',),
    'trust': ('trustwallet.com',), 'tokenpocket': ('help.tokenpocket.pro',),
    'imtoken': ('support.token.im',),
}
EXTRACTOR_VERSION = 2
MAX_BODY = 3 * 1024 * 1024
TIMEOUT = 15


class CheckError(Exception):
    """Only fixed, credential-free diagnostic codes are exposed in logs."""


def now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def digest(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def read_json(path, default=None):
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding='utf-8-sig'))


def guard_write(path):
    resolved = path.resolve()
    if resolved.name.lower() == 'wallets.json' or resolved == (REPO / 'wallets.json').resolve():
        raise CheckError('protected_dataset_write_refused')


def atomic_write(path, text):
    guard_write(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix='.' + path.name, dir=path.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8', newline='\n') as out:
            out.write(text)
            out.flush()
            os.fsync(out.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def write_json(path, value):
    atomic_write(path, json.dumps(value, ensure_ascii=False, indent=2) + '\n')


@contextmanager
def run_lock(state_dir):
    state_dir.mkdir(parents=True, exist_ok=True)
    path = state_dir / '.check.lock'
    guard_write(path)
    with path.open('a+b') as lock:
        lock.seek(0, os.SEEK_END)
        if lock.tell() == 0:
            lock.write(b'0')
            lock.flush()
        lock.seek(0)
        try:
            if os.name == 'nt':
                import msvcrt
                msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            raise CheckError('another_check_is_running') from exc
        try:
            yield
        finally:
            lock.seek(0)
            if os.name == 'nt':
                msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(lock.fileno(), fcntl.LOCK_UN)


def validate_url(wallet, url):
    parts = urlsplit(url)
    host = parts.hostname or ''
    if parts.scheme != 'https' or parts.username or parts.password or parts.port not in (None, 443):
        raise CheckError('invalid_source_url')
    if not any(host == allowed or host.endswith('.' + allowed) for allowed in HOSTS[wallet]):
        raise CheckError('non_official_redirect_or_source')


def fetch_source(session, wallet, url, article_format='html'):
    # Redirects are checked before making the next request, including domain changes.
    for _ in range(6):
        validate_url(wallet, url)
        with session.get(url, timeout=TIMEOUT, allow_redirects=False, stream=True) as response:
            if response.status_code in (301, 302, 303, 307, 308):
                url = urljoin(url, response.headers.get('Location', ''))
                continue
            if response.status_code != 200:
                raise CheckError('http_' + str(response.status_code))
            content_type = response.headers.get('Content-Type', '').lower()
            expected_types = ('application/json',) if article_format in ('zendesk-json', 'binance-json') else ('text/html', 'text/plain', 'text/markdown')
            if not any(kind in content_type for kind in expected_types):
                raise CheckError('unexpected_content_type')
            chunks, size = [], 0
            for chunk in response.iter_content(65536):
                size += len(chunk)
                if size > MAX_BODY:
                    raise CheckError('response_too_large')
                chunks.append(chunk)
            return b''.join(chunks).decode('utf-8', errors='replace'), url
    raise CheckError('too_many_redirects')


def normalize(body, profile):
    if profile.get('format') in ('zendesk-json', 'binance-json'):
        text = extract_api_article(body, profile)
    elif profile.get('format') == 'markdown':
        # Remove image embeds and their signed CDN URLs; retain substantive dates.
        body = re.sub(r'<figure\b.*?</figure>', '', body, flags=re.S | re.I)
        body = re.sub(r'!\[[^\]]*\]\([^\n]*\)', '', body)
        body = re.sub(r'^> For the complete documentation index.*$', '', body, flags=re.M)
        body = re.sub(r'\[([^\]]+)\]\([^\s)]+\)', r'\1', body)
        text = Document(body).root.text()
    else:
        document = Document(body)
        title = document.title().lower()
        if any(marker in title for marker in ('just a moment', 'access denied', 'attention required')):
            raise CheckError('challenge_page')
        try:
            text = document.article(profile)
        except ValueError as exc:
            raise CheckError(str(exc)) from exc
    lines = []
    for line in text.splitlines():
        line = re.sub(r'\s+', ' ', line).strip()
        if not line:
            continue
        # Strip only labeled publishing/generated timestamps, not event dates,
        # rate effective dates, expiry dates, or numeric fee/points values.
        if re.fullmatch(r'(?:Last updated|Updated on|Published on|Generated at|Fetched at)\s*:?\s*\d{4}[-/]\d{2}[-/]\d{2}(?:[T ].*)?', line, re.I):
            continue
        lines.append(line)
    text = '\n'.join(lines)
    if profile.get('start_text'):
        index = text.lower().find(profile['start_text'].lower())
        if index < 0:
            raise CheckError('missing_article_anchor')
        text = text[index:]
    if len(text) < profile.get('min_chars', 150):
        raise CheckError('empty_or_incomplete_article')
    if not all(term.lower() in text.lower() for term in profile.get('required', [])):
        raise CheckError('unexpected_article_content')
    return text


def load_sources(source_path, profile_path):
    sources, profiles = read_json(source_path), read_json(profile_path)
    if not isinstance(sources, dict) or set(sources) != set(HOSTS):
        raise CheckError('invalid_wallet_ids')
    for wallet, dimensions in sources.items():
        if set(dimensions) != set(DIMENSIONS):
            raise CheckError('invalid_dimensions')
        for dim, url in dimensions.items():
            if url is None:
                continue
            validate_url(wallet, url)
            profile = profiles[wallet][dim]
            if profile.get('render') != 'ssr' or not profile.get('required'):
                raise CheckError('unverified_source_profile')
            if profile.get('fetch_url'):
                validate_url(wallet, profile['fetch_url'])
                if profile.get('article_url') != url or not profile.get('article_id'):
                    raise CheckError('invalid_api_article_identity')
    return sources, profiles


def diff_summary(before, after):
    changes = difflib.unified_diff(before.splitlines(), after.splitlines(), lineterm='', n=1)
    lines = [line for line in changes if not line.startswith(('---', '+++', '@@'))]
    return ('\n'.join(lines) or 'Stored hash differs, but normalized text is identical; review snapshot integrity.')[:500]


def compare_snapshot(state_dir, wallet, dim, url, profile, text, queue, timestamp):
    base = state_dir / 'snapshots' / (wallet + '_' + dim)
    hash_path, text_path, meta_path = (base.with_suffix(ext) for ext in ('.hash', '.txt', '.json'))
    fingerprint = digest(json.dumps({'url':url, 'profile':profile, 'extractor':EXTRACTOR_VERSION}, sort_keys=True))
    exists = [path.exists() for path in (hash_path, text_path, meta_path)]
    new_hash = digest(text)
    if not any(exists):
        status = 'baseline'
    else:
        if not all(exists):
            raise CheckError('incomplete_snapshot')
        if read_json(meta_path).get('fingerprint') != fingerprint:
            raise CheckError('source_profile_changed_rebaseline_required')
        old_hash = hash_path.read_text(encoding='utf-8').strip()
        if not re.fullmatch('[a-f0-9]{64}', old_hash):
            raise CheckError('invalid_snapshot_hash')
        if old_hash == new_hash:
            return 'unchanged'
        previous = text_path.read_text(encoding='utf-8')
        latest = next((item for item in reversed(queue) if item['wallet_id'] == wallet and item['dimension'] == dim), None)
        if not latest or latest.get('status') != 'pending' or (latest.get('old_hash'), latest.get('new_hash'), latest.get('url')) != (old_hash, new_hash, url):
            queue.append({'time':timestamp, 'wallet_id':wallet, 'dimension':dim, 'url':url,
                          'summary':diff_summary(previous, text), 'old_hash':old_hash,
                          'new_hash':new_hash, 'status':'pending'})
            # Persist the review entry BEFORE advancing its baseline.
            write_json(state_dir / 'review-queue.json', queue)
        status = 'changed'
    atomic_write(text_path, text)
    write_json(meta_path, {'url':url, 'fingerprint':fingerprint, 'observed_at':timestamp})
    atomic_write(hash_path, new_hash + '\n')
    return status


def actions_schedule():
    repository = 'kkweb3345678/trader-leaderboard'
    enabled = (os.environ.get('GITHUB_ACTIONS') == 'true'
               and os.environ.get('GITHUB_REPOSITORY') == repository
               and os.environ.get('GITHUB_REF') == 'refs/heads/main'
               and os.environ.get('GITHUB_WORKFLOW_REF') == repository + '/.github/workflows/wallets-check.yml@refs/heads/main'
               and os.environ.get('GITHUB_EVENT_NAME') in ('schedule', 'workflow_dispatch'))
    schedule = {'enabled':enabled, 'provider':'github_actions', 'cron':'7 * * * *', 'interval_minutes':60}
    run_id = os.environ.get('GITHUB_RUN_ID', '')
    if enabled and run_id.isdigit():
        schedule['run_url'] = f'https://github.com/{repository}/actions/runs/{run_id}'
    return schedule


def run(source_path, profile_path, state_dir, status_path, fetcher=None, sleep=time.sleep):
    guard_write(status_path)
    sources, profiles = load_sources(source_path, profile_path)
    before = hashlib.sha256((REPO / 'wallets.json').read_bytes()).hexdigest()
    with run_lock(state_dir):
        logger = logging.getLogger('wallets-check')
        logger.setLevel(logging.INFO)
        logger.handlers.clear()
        log_path = state_dir / 'check.log'
        guard_write(log_path)
        file_handler = RotatingFileHandler(log_path, maxBytes=2_000_000, backupCount=3, encoding='utf-8')
        stream_handler = logging.StreamHandler()
        logger.addHandler(file_handler)
        logger.addHandler(stream_handler)
        queue_path = state_dir / 'review-queue.json'
        queue = read_json(queue_path, [])
        if not isinstance(queue, list):
            raise CheckError('invalid_review_queue')
        if not queue_path.exists():
            write_json(queue_path, queue)
        previous = read_json(status_path, {})
        report = {'schema_version':1, 'started_at':now(), 'last_check':None,
                  'last_success':previous.get('last_success'), 'expected':len(sources)*len(DIMENSIONS),
                  'configured':sum(bool(url) for dims in sources.values() for url in dims.values()),
                  'checked':0, 'failed':0, 'skipped':0, 'changed':0, 'baselined':0,
                  'schedule':actions_schedule(), 'results':[]}
        session = requests.Session()
        session.headers.update({'User-Agent':'WalletSourceCheck/1.0 (+https://kkweb3345678.github.io/trader-leaderboard/)',
                                'Accept-Language':'en-US,en;q=0.9', 'Cache-Control':'no-cache'})
        attempted = False
        try:
            for wallet, dimensions in sources.items():
                for dim, url in dimensions.items():
                    item = {'wallet_id':wallet, 'dimension':dim}
                    if not url:
                        report['skipped'] += 1
                        item.update(status='no_source')
                    else:
                        if attempted:
                            sleep(random.uniform(3, 5))
                        attempted = True
                        item['url'] = url
                        try:
                            profile = profiles[wallet][dim]
                            body, final_url = fetcher(wallet, url) if fetcher else fetch_source(session, wallet, profile.get('fetch_url', url), profile.get('format', 'html'))
                            text = normalize(body, profiles[wallet][dim])
                            item['status'] = compare_snapshot(state_dir, wallet, dim, url, profiles[wallet][dim], text, queue, report['started_at'])
                            item['final_url'] = final_url
                            report['checked'] += 1
                            report['changed'] += int(item['status'] == 'changed')
                            report['baselined'] += int(item['status'] == 'baseline')
                        except (CheckError, requests.RequestException, ValueError, RecursionError) as exc:
                            item.update(status='failed', error=str(exc) if isinstance(exc, CheckError) else type(exc).__name__)
                            report['failed'] += 1
                    report['results'].append(item)
                    logger.info('%s %s %s %s', now(), wallet, dim, item.get('error', item['status']))
            report['last_check'] = now()
            report['status'] = 'partial' if report['failed'] or report['skipped'] else 'ok'
            if report['checked'] == report['configured'] and report['configured']:
                report['last_success'] = report['last_check']
            if hashlib.sha256((REPO / 'wallets.json').read_bytes()).hexdigest() != before:
                raise CheckError('dataset_changed_during_run')
            report['dataset_unchanged'] = True
            report['pending_reviews'] = sum(item.get('status') == 'pending' for item in queue)
            write_json(status_path, report)
            logger.info('%s checked=%s configured=%s failed=%s skipped=%s changed=%s queue=%s dataset_unchanged=true',
                        report['last_check'], report['checked'], report['configured'], report['failed'], report['skipped'], report['changed'], len(queue))
            return report
        finally:
            session.close()
            for handler in logger.handlers[:]:
                handler.close()
                logger.removeHandler(handler)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sources', type=Path, default=HERE / 'wallets-sources.json')
    parser.add_argument('--profiles', type=Path, default=HERE / 'source-profiles.json')
    parser.add_argument('--state-dir', type=Path, default=HERE)
    parser.add_argument('--status', type=Path, default=HERE / 'check-log.json')
    args = parser.parse_args()
    try:
        report = run(args.sources, args.profiles, args.state_dir, args.status)
        return int(report['failed'] > 0)
    except (CheckError, OSError, ValueError, KeyError):
        # Do not emit request URLs, proxy credentials, or exception tracebacks.
        print('Check aborted: configuration, state, or filesystem error. Existing snapshots retained.')
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
