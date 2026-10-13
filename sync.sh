#!/bin/bash
# 每小時：抓最新榜單 -> 有變化才 commit+push
set -e
cd "$(dirname "$0")"
python3 fetch.py
git add data.json
if git diff --cached --quiet; then
  echo "$(date '+%F %T') no change, skip"
  exit 0
fi
git -c user.name="Ren" -c user.email="ren@local" commit -qm "data $(date '+%F %T')"
git push -q origin main
echo "$(date '+%F %T') pushed"
