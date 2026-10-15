#!/bin/bash
# 榜單更新（省 CU 設計，月額度 30,000 CU）：
#   每天 08:00（台北）全量：solana today100+week100、base today20 → data.json（約 660 CU）
#   其餘 02/14/20 快照：solana today20 → today-flash.json（約 60 CU）
# 合計約 840 CU/天，月燒約 25,200，在額度內。
set -euo pipefail
cd "$(dirname "$0")"
# Serialize repository writes with wallets-check, and retain remote UI changes.
exec 9>"$(git rev-parse --git-dir)/research-publish.lock"
flock -w 120 9
remote='https://github.com/kkweb3345678/trader-leaderboard.git'
git fetch --quiet "$remote" main
git merge --ff-only --quiet FETCH_HEAD
hour=$(date +%H)
if [ "$hour" = "08" ]; then
  python3 fetch.py --full
  files="data.json"
else
  python3 fetch.py --flash
  files="today-flash.json"
fi
git add $files
if git diff --cached --quiet -- $files; then
  echo "$(date '+%F %T') no change, skip"
  exit 0
fi
git -c user.name="Ren" -c user.email="ren@local" commit --only -qm "data $(date '+%F %T')" -- $files
git push -q "$remote" main
echo "$(date '+%F %T') pushed $files"
