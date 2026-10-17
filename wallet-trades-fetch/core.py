"""Validation for a bounded first page of per-token trading summaries."""
from datetime import datetime, timezone, timedelta
from decimal import Decimal, InvalidOperation
import hashlib
import json
import re

TAIPEI = timezone(timedelta(hours=8))
ADDRESS = re.compile(r'[1-9A-HJ-NP-Za-km-z]{32,44}\Z')
PARAMETERS = {'duration': '7d', 'position_scope': 'duration_only', 'pnl_method': 'wac',
              'sort_by': 'last_trade', 'sort_type': 'desc', 'limit': 100, 'offset': 0}

class Invalid(Exception):
    pass

def stamp(value):
    try:
        value = re.sub(r'\.(\d+)(?=[+-]|$)', lambda m: '.' + (m[1] + '000000')[:6], value.replace('Z', '+00:00'))
        result = datetime.fromisoformat(value)
        if result.tzinfo is None:
            raise ValueError()
        return result
    except (AttributeError, TypeError, ValueError):
        raise Invalid('Invalid timestamp') from None

def number(value, nonnegative=False, integer=False):
    try:
        if value is None or isinstance(value, bool):
            raise ValueError()
        n = Decimal(str(value))
        if not n.is_finite() or abs(n) > 9007199254740991 or (nonnegative and n < 0) or (integer and n != int(n)):
            raise ValueError()
        return int(n) if integer else float(n)
    except (ValueError, InvalidOperation):
        raise Invalid('Missing or unsafe numeric value') from None

def address(value):
    if not isinstance(value, str) or not ADDRESS.fullmatch(value):
        raise Invalid('Invalid Solana address')
    return value

def digest(raw):
    return hashlib.sha256(raw).hexdigest()

def encode(value):
    return (json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n').encode('utf-8')

def top_ten(data, now):
    if not 0 <= (now - stamp(data.get('updated_at'))).total_seconds() <= 36 * 3600:
        raise Invalid('Leaderboard is stale or future dated')
    rows = data.get('week')
    if data.get('source') != 'Birdeye' or data.get('chain') != 'solana' or not isinstance(rows, list) or len(rows) != 100:
        raise Invalid('Expected the complete weekly sample of 100')
    seen = set()
    for row in rows:
        identity = address(row.get('address'))
        if identity in seen:
            raise Invalid('Duplicate wallet')
        seen.add(identity)
        number(row.get('volume'), nonnegative=True); number(row.get('realized'))
    tie = lambda text: (text.lower(), tuple(c.isupper() for c in text))
    return sorted(rows, key=lambda w: (-w['volume'], -w['realized'], tie(w['address'])))[:10]

def normalize(response, wallet, now):
    if not isinstance(response, dict) or response.get('success') is False:
        raise Invalid('Unsuccessful PnL response')
    data = response.get('data')
    if not isinstance(data, dict):
        raise Invalid('Missing PnL data')
    meta = data.get('meta', {})
    if meta.get('address') != wallet or str(meta.get('currency', '')).lower() != 'usd':
        raise Invalid('Wrong wallet or currency')
    observed = stamp(meta.get('time'))
    if not 0 <= (now - observed).total_seconds() <= 24 * 3600 or observed.astimezone(TAIPEI).date() != now.astimezone(TAIPEI).date():
        raise Invalid('Stale or future PnL source time')
    items = data.get('tokens')
    if not isinstance(items, list) or len(items) > PARAMETERS['limit']:
        raise Invalid('Invalid token page')
    unique = number(data.get('summary', {}).get('unique_tokens'), nonnegative=True, integer=True)
    if unique < len(items) or (unique > 0 and not items):
        raise Invalid('Inconsistent summary and token page')
    tokens, seen = [], set()
    for token in items:
        mint = address(token.get('address'))
        if mint in seen:
            raise Invalid('Duplicate mint')
        seen.add(mint)
        symbol = token.get('symbol')
        if symbol is not None and (not isinstance(symbol, str) or len(symbol) > 200):
            raise Invalid('Invalid symbol')
        counts, cash, pnl = token.get('counts', {}), token.get('cashflow_usd', {}), token.get('pnl', {})
        def optional(obj, field, **options):
            return None if obj.get(field) is None else number(obj[field], **options)
        tokens.append({'address': mint, 'symbol': symbol,
            'last_trade_unix_time': optional(token, 'last_trade_unix_time', nonnegative=True, integer=True),
            'buy_count': optional(counts, 'total_buy', nonnegative=True, integer=True),
            'sell_count': optional(counts, 'total_sell', nonnegative=True, integer=True),
            'buy_usd': optional(cash, 'total_invested', nonnegative=True),
            'sell_usd': optional(cash, 'total_sold', nonnegative=True),
            'realized_usd': optional(pnl, 'realized_profit_usd'),
            'unrealized_usd': optional(pnl, 'unrealized_usd')})
    # A full 100-row page is conservatively marked capped even if the summary is page-scoped.
    coverage = 'limited' if unique > len(items) or len(items) == PARAMETERS['limit'] else 'source_page'
    return {'address': wallet, 'snapshot_date': observed.astimezone(TAIPEI).isoformat(timespec='seconds'),
            'reported_unique_tokens': unique, 'coverage': coverage, 'tokens': tokens}

def candidate(responses, data_raw, source_commit, now):
    data = json.loads(data_raw)
    selected = top_ten(data, now)
    if len(responses) != len(selected):
        raise Invalid('Incomplete wallet batch')
    wallets = []
    for rank, (response, row) in enumerate(zip(responses, selected), 1):
        wallet = normalize(response, row['address'], now)
        wallet.update(sample_volume_rank=rank, sample_volume_usd=row['volume'])
        wallets.append(wallet)
    return {'schema_version': 1, 'source': 'Birdeye', 'chain': 'solana',
            'updated_at': now.astimezone(TAIPEI).isoformat(timespec='seconds'),
            'source_updated_at': data['updated_at'], 'source_sha256': digest(data_raw),
            'source_commit': source_commit, 'selection': 'week_sample_volume_top10',
            'parameters': PARAMETERS, 'wallets': wallets}

def auto_due(event, data, existing, now, enabled):
    run = event.get('workflow_run', {})
    if not enabled or run.get('conclusion') != 'success' or run.get('head_branch') != 'main' or run.get('head_repository', {}).get('full_name') != 'kkweb3345678/trader-leaderboard' or run.get('event') != 'schedule' or run.get('display_title') != 'Leaderboard publish · 0 0 * * *':
        return False
    day = stamp(run.get('created_at')).astimezone(TAIPEI).date()
    if stamp(data.get('updated_at')).astimezone(TAIPEI).date() != day or now.astimezone(TAIPEI).date() != day:
        return False
    return not existing or stamp(existing['source_updated_at']) < stamp(data['updated_at'])
