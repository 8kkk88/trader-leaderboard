#!/usr/bin/env python3
"""抓 Birdeye 交易員排行榜，輸出 data.json / today-flash.json。

模式（省 CU 設計，月額度 30,000 CU，每日預算 <= 1,000 CU）：
  --full  每日 08:00（台北）：solana today100+week100、base today20 → data.json（90 CU，另計餘額查詢）
  --flash 02/14/20 台北：solana today20 → today-flash.json（30 CU，另計餘額查詢）
不帶參數預設 --full（相容舊行為）。

API key 只從 birdeye.env 讀（權限 600），不進 repo。
"""
import argparse
import json
import sys
import time
import urllib.error
from datetime import datetime, timezone, timedelta

import requests

BASE = "https://public-api.birdeye.so"
KEY_FILE = "/home/hatch/workspace/gmgn-reporter/birdeye.env"
OUT_FULL = "/home/hatch/workspace/trader-leaderboard/data.json"
OUT_FLASH = "/home/hatch/workspace/trader-leaderboard/today-flash.json"
# Verified on account: run 38986579644 returned 100 weekly rows for 30 CU.
PAGE = 100
MIN_CREDITS = 3000

# 每條鏈的 x-chain 標頭值（Birdeye 規格）
CHAINS = {"solana": "solana", "base": "base"}


def load_key():
    with open(KEY_FILE) as f:
        for line in f:
            if line.startswith("BIRDEYE_API_KEY="):
                return line.strip().split("=", 1)[1]
    raise RuntimeError("API key not found in " + KEY_FILE)


def get(path, key, chain, retries=4):
    for i in range(retries):
        try:
            r = requests.get(BASE + path,
                             headers={"X-API-KEY": key, "x-chain": CHAINS[chain]},
                             timeout=30)
            if r.status_code == 429 and i < retries - 1:
                time.sleep(5 * (i + 1))
                continue
            r.raise_for_status()
            return r.json()
        except requests.RequestException:
            if i < retries - 1:
                time.sleep(5 * (i + 1))
                continue
            raise


def credits_left(key):
    d = get("/utils/v1/credits", key, "solana")
    return d["data"]["remaining"]["total"]


def fetch_top(t, key, chain, top_n):
    items = []
    for offset in range(0, top_n, PAGE):
        d = get(f"/trader/gainers-losers?type={t}&sort_by=PnL&sort_type=desc"
                f"&offset={offset}&limit={min(PAGE, top_n - offset)}", key, chain)
        batch = d["data"]["items"]
        if not batch:
            break
        items.extend(batch)
        time.sleep(2)
    return items[:top_n]


def norm(w):
    pnl = w.get("pnl", 0) or 0
    realized = w.get("realized_pnl", 0) or 0
    return {
        "address": w["address"],
        "pnl": round(pnl, 2),
        "realized": round(realized, 2),
        "unrealized": round(pnl - realized, 2),
        "volume": round(w.get("volume", 0) or 0, 2),
        "trades": w.get("trade_count", 0) or 0,
    }


def insight(items, label):
    top10 = items[:10]
    top = top10[0] if top10 else None
    zero = sum(1 for w in top10 if abs(w["realized"]) < 1)
    parts = []
    if top:
        parts.append(
            f"{label}榜首帳面 ${top['pnl']:,.0f}，已實現 ${top['realized']:,.0f}")
    parts.append(
        f"前{len(top10)}名有{zero}個已實現收益是 0——沒賣出都不算賺")
    return "；".join(parts)


def now_cst():
    tz = timezone(timedelta(hours=8))
    return datetime.now(tz).isoformat(timespec="seconds")


def run_full(key):
    """每日全量：solana today100+week100、base today20 → data.json（90 CU）"""
    sol_today = [norm(w) for w in fetch_top("today", key, "solana", 100)]
    time.sleep(2)
    sol_week = [norm(w) for w in fetch_top("1W", key, "solana", 100)]
    time.sleep(2)
    base_today = [norm(w) for w in fetch_top("today", key, "base", 20)]
    out = {
        "updated_at": now_cst(),
        "source": "Birdeye",
        "chain": "solana",
        "insight": {
            "today": insight(sol_today, "今日"),
            "week": insight(sol_week, "近7日"),
        },
        "today": sol_today,
        "week": sol_week,
        "base_today": base_today,
        "base_updated_at": now_cst(),
    }
    with open(OUT_FULL, "w") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f"wrote {OUT_FULL} "
          f"(sol {len(sol_today)}+{len(sol_week)}, base {len(base_today)})")


def run_flash(key):
    """盤中快照：solana today20 → today-flash.json（30 CU）"""
    sol_today = [norm(w) for w in fetch_top("today", key, "solana", 20)]
    out = {
        "updated_at": now_cst(),
        "source": "Birdeye",
        "chain": "solana",
        "today": sol_today,
    }
    with open(OUT_FLASH, "w") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f"wrote {OUT_FLASH} ({len(sol_today)} rows)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--full", action="store_true",
                    help="daily full fetch → data.json")
    ap.add_argument("--flash", action="store_true",
                    help="intraday solana today top20 → today-flash.json")
    args = ap.parse_args()
    key = load_key()
    left = credits_left(key)
    if left < MIN_CREDITS:
        print(f"credits low ({left}), skip this run")
        return 0
    if args.flash and not args.full:
        run_flash(key)
    else:
        run_full(key)
    print(f"credits left {left}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
