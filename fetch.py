#!/usr/bin/env python3
"""抓 Birdeye 交易員排行榜 (today + 1W)，輸出 data.json。
每小時跑一次，寫給 GitHub Pages 用的靜態檔。
API key 只從 birdeye.env 讀（權限 600），不進 repo。
"""
import json
import sys
import time
import urllib.request
from datetime import datetime, timezone, timedelta

BASE = "https://public-api.birdeye.so"
KEY_FILE = "/home/hatch/workspace/gmgn-reporter/birdeye.env"
OUT = "/home/hatch/workspace/trader-leaderboard/data.json"
CHAIN = "solana"


def load_key():
    with open(KEY_FILE) as f:
        for line in f:
            if line.startswith("BIRDEYE_API_KEY="):
                return line.strip().split("=", 1)[1]
    raise RuntimeError("API key not found in " + KEY_FILE)


def fetch(path, key):
    req = urllib.request.Request(
        BASE + path, headers={"X-API-KEY": key, "x-chain": CHAIN})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)["data"]["items"]


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
    top = items[0] if items else None
    zero = sum(1 for w in items if abs(w["realized"]) < 1)
    parts = []
    if top:
        parts.append(
            f"{label}榜首帳面 ${top['pnl']:,.0f}，已實現 ${top['realized']:,.0f}")
    parts.append(
        f"前{min(10, len(items))}名有{zero}個已實現收益是 0——沒賣出都不算賺")
    return "；".join(parts)


def main():
    key = load_key()
    data = {}
    for t in ("today", "1W"):
        items = [norm(w) for w in fetch(
            f"/trader/gainers-losers?type={t}&sort_by=PnL&sort_type=desc&limit=10",
            key)]
        data[t] = items
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
    print(f"wrote {OUT} at {out['updated_at']}")


if __name__ == "__main__":
    sys.exit(main())
