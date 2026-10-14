#!/bin/bash
# 每小時：抓最新榜單 -> 有變化才 commit+push
set -euo pipefail
cd "$(dirname "$0")"
# Serialize repository writes with wallets-check, and retain remote UI changes.
exec 9>"$(git rev-parse --git-dir)/research-publish.lock"
flock -w 120 9
remote='https://github.com/kkweb3345678/trader-leaderboard.git'
git fetch --quiet "$remote" main
git merge --ff-only --quiet FETCH_HEAD
python3 fetch.py
git add data.json
if git diff --cached --quiet -- data.json; then
  echo "$(date '+%F %T') no change, skip"
  exit 0
fi
git -c user.name="Ren" -c user.email="ren@local" commit --only -qm "data $(date '+%F %T')" -- data.json
git push -q "$remote" main
echo "$(date '+%F %T') pushed"
