#!/usr/bin/env python3
"""抓 Birdeye 交易員排行榜 (today + 1W，各前 100 名)，輸出 data.json。
每 30 分鐘跑一次。開跑前先查額度，剩餘 < 3000 CU 就跳過保命。
API key 只從 birdeye.env 讀（權限 600），不進 repo。
"""
import json
import sys
import time
import urllib.error
from datetime import datetime, timezone, timedelta

import requests

BASE = "https://public-api.birdeye.so"
KEY_FILE = "/home/hatch/workspace/gmgn-reporter/birdeye.env"
OUT = "/home/hatch/workspace/trader-leaderboard/data.json"
CHAIN = "solana"
TOP_N = 100
PAGE = 10
MIN_CREDITS = 3000


def load_key():
    with open(KEY_FILE) as f:
        for line in f:
            if line.startswith("BIRDEYE_API_KEY="):
                return line.strip().split("=", 1)[1]
    raise RuntimeError("API key not found in " + KEY_FILE)


def get(path, key, retries=4):
    for i in range(retries):
        try:
            r = requests.get(BASE + path, headers={"X-API-KEY": key, "x-chain": CHAIN},
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
    d = get("/utils/v1/credits", key)
    return d["data"]["remaining"]["total"]


def fetch_top(t, key):
    items = []
    for offset in range(0, TOP_N, PAGE):
        d = get(f"/trader/gainers-losers?type={t}&sort_by=PnL&sort_type=desc"
                f"&offset={offset}&limit={PAGE}", key)
        batch = d["data"]["items"]
        if not batch:
            break
        items.extend(batch)
        time.sleep(2)
    return items[:TOP_N]


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


def main():
    key = load_key()
    left = credits_left(key)
    if left < MIN_CREDITS:
        print(f"credits low ({left}), skip this run")
        return 0
    data = {}
    for t in ("today", "1W"):
        data[t] = [norm(w) for w in fetch_top(t, key)]
        time.sleep(2)
    tz = timezone(timedelta(hours=8))
    out = {
        "updated_at": datetime.now(tz).isoformat(timespec="seconds"),
        "source": "Birdeye",
        "chain": CHAIN,
        "insight": {
            "today": insight(data["today"], "今日"),
            "week": insight(data["1W"], "近7日"),
        },
        "today": data["today"],
        "week": data["1W"],
    }
    with open(OUT, "w") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f"wrote {OUT} ({len(data['today'])}+{len(data['1W'])} rows), "
          f"credits left {left}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
