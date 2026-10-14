#!/bin/bash
set -euo pipefail
cd "$(dirname -- "$0")/.."
remote='https://github.com/kkweb3345678/trader-leaderboard.git'
exec 9>"$(git rev-parse --git-dir)/research-publish.lock"
flock -w 120 9
[[ "$(git branch --show-current)" == main ]] || { echo 'Publication requires main.' >&2; exit 1; }
git fetch --quiet "$remote" main
git merge --ff-only --quiet FETCH_HEAD
if ! git diff --quiet -- check-log.json; then
  git -c user.name='Ren' -c user.email='ren@local' commit --only -qm "wallet source check $(date -u '+%F %R UTC')" -- check-log.json
fi
# Retry a previously committed-but-not-pushed status on the next invocation.
git push --quiet "$remote" main
