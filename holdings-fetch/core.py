"""Pure validation for weekly Solana holdings. Never substitutes missing data with zero."""
from datetime import datetime, timezone, timedelta
from decimal import Decimal, InvalidOperation
import hashlib
import json
import re

TAIPEI = timezone(timedelta(hours=8))
ADDRESS = re.compile(r"[1-9A-HJ-NP-Za-km-z]{32,44}\Z")


class Invalid(Exception):
    pass


def stamp(value):
    try:
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if result.tzinfo is None:
            raise ValueError()
        return result
    except (AttributeError, TypeError, ValueError):
        raise Invalid("Invalid timestamp") from None


def number(value):
    try:
        if value is None or isinstance(value, bool):
            raise ValueError()
        result = Decimal(str(value))
        if not result.is_finite() or abs(result) > 9007199254740991:
            raise ValueError()
        return result
    except (ValueError, InvalidOperation):
        raise Invalid("Missing or unsafe numeric value") from None


def address(value):
    if not isinstance(value, str) or not ADDRESS.fullmatch(value):
        raise Invalid("Invalid Solana address")
    return value


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def top_ten(data, now):
    source = stamp(data.get("updated_at"))
    if not 0 <= (now - source).total_seconds() <= 36 * 3600:
        raise Invalid("Leaderboard is stale or in the future")
    rows = data.get("week")
    if data.get("source") != "Birdeye" or data.get("chain") != "solana" or not isinstance(rows, list) or len(rows) < 10:
        raise Invalid("Missing weekly leaderboard")
    seen = set()
    for row in rows:
        identity = address(row.get("address"))
        if identity in seen:
            raise Invalid("Duplicate leaderboard address")
        seen.add(identity)
        number(row.get("realized")); number(row.get("pnl"))
    # Match app.js tie-break, whose localeCompare uses lowercase before uppercase.
    tie = lambda text: (text.lower(), tuple(c.isupper() for c in text))
    return sorted(rows, key=lambda w: (-number(w["realized"]), -number(w["pnl"]), tie(w["address"])))[:10]


def normalize(response, wallet, now):
    if not isinstance(response, dict) or response.get("success") is not True:
        raise Invalid("Unsuccessful portfolio response")
    data, page = response.get("data"), response.get("pagination")
    if not isinstance(data, dict) or data.get("wallet_address", data.get("wallet")) != wallet or data.get("currency", "").lower() != "usd":
        raise Invalid("Wrong portfolio identity or currency")
    observed = stamp(data.get("current_timestamp"))
    if not 0 <= (now - observed).total_seconds() <= 24 * 3600 or observed.astimezone(TAIPEI).date() != now.astimezone(TAIPEI).date():
        raise Invalid("Portfolio source snapshot is stale or future dated")
    total = number(data.get("total_value"))
    items = data.get("items")
    # Solana returns null, not [], for an explicitly empty successful portfolio.
    if items is None and total == 0 and isinstance(page, dict) and page.get("total") == 0:
        items = []
    if total < 0 or not isinstance(items, list) or not isinstance(page, dict):
        raise Invalid("Invalid portfolio totals")
    count = page.get("total")
    if isinstance(count, bool) or not isinstance(count, int) or count < 0 or page.get("offset") != 0 or len(items) != min(5, count):
        raise Invalid("Incomplete top-five page")
    seen, tokens, values = set(), [], []
    for item in items:
        mint = address(item.get("address"))
        if mint in seen or item.get("network", item.get("chainId")) != "solana":
            raise Invalid("Duplicate token or wrong network")
        seen.add(mint)
        symbol = item.get("symbol")
        if not isinstance(symbol, str) or not symbol.strip() or len(symbol) > 100:
            raise Invalid("Missing token symbol")
        value = number(item.get("value"))
        if value < 0:
            raise Invalid("Negative token value")
        values.append(value)
        tokens.append({"symbol": symbol, "value_usd": float(value),
                       "pct": float(value / total * 100) if total > 0 else None})
    if values != sorted(values, reverse=True):
        raise Invalid("Top-five order inconsistent")
    if total > 0 and not items:
        raise Invalid("Positive portfolio has no asset rows")
    return {"address": wallet, "snapshot_date": observed.astimezone(TAIPEI).isoformat(timespec="seconds"), "tokens": tokens}


def auto_due(event, data, existing, now, enabled):
    if not enabled:
        return False
    run = event.get("workflow_run", {})
    if (run.get("conclusion") != "success" or run.get("head_branch") != "main"
            or run.get("head_repository", {}).get("full_name") != "kkweb3345678/trader-leaderboard"
            or run.get("event") != "schedule" or run.get("display_title") != "Leaderboard publish · 0 0 * * *"):
        return False
    day = stamp(run.get("created_at")).astimezone(TAIPEI).date()
    source_day = stamp(data.get("updated_at")).astimezone(TAIPEI).date()
    if day.weekday() != 0 or source_day != day or now.astimezone(TAIPEI).date() != day:
        return False
    # A rerun may report completion again. Never bill twice for the same weekly refresh.
    if existing and stamp(existing.get("updated_at")).astimezone(TAIPEI).date() >= day:
        return False
    return True


def encode(value):
    return (json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8")
