#!/bin/bash
# checkout's short-lived GITHUB_TOKEN authenticates Git; no PAT or proxy required.
set -euo pipefail
cd "$(dirname -- "$0")/.."
[[ "${GITHUB_ACTIONS:-}" == true && "${GITHUB_REF:-}" == refs/heads/main ]] || { echo 'Publication requires the main Actions workflow.' >&2; exit 1; }
git diff --exit-code HEAD -- wallets.json
git add -- wallets-check/review-queue.json wallets-check/check-log.json
if compgen -G 'wallets-check/snapshots/*.hash' > /dev/null; then
  git add -- wallets-check/snapshots
fi
if [[ -f wallets-check/watchlist/check-log.json ]]; then
  git add -- wallets-check/watchlist/check-log.json wallets-check/watchlist/review-queue.json
  if compgen -G 'wallets-check/watchlist/snapshots/*.hash' > /dev/null; then
    git add -- wallets-check/watchlist/snapshots
  fi
fi
if git diff --cached --quiet; then
  echo 'No state changes to commit.'
  exit 0
fi
while IFS= read -r path; do
  case "$path" in
    wallets-check/snapshots/*.hash|wallets-check/snapshots/*.txt|wallets-check/snapshots/*.json|wallets-check/review-queue.json|wallets-check/check-log.json) ;;
    wallets-check/watchlist/snapshots/*.hash|wallets-check/watchlist/snapshots/*.txt|wallets-check/watchlist/snapshots/*.json|wallets-check/watchlist/review-queue.json|wallets-check/watchlist/check-log.json) ;;
    *) echo 'Unexpected staged path; publication refused.' >&2; exit 1 ;;
  esac
done < <(git diff --cached --name-only)
git -c user.name='github-actions[bot]' -c user.email='41898282+github-actions[bot]@users.noreply.github.com' commit -m "Check official wallet sources (${GITHUB_RUN_ID})"
for attempt in 1 2 3; do
  git fetch --quiet origin main
  # Rebase only our state commit over approved UI/data edits. Conflicting human
  # queue edits fail for explicit review; never force push or discard edits.
  git -c user.name='github-actions[bot]' -c user.email='41898282+github-actions[bot]@users.noreply.github.com' rebase origin/main
  if git push --quiet origin HEAD:main; then
    echo "Published state commit $(git rev-parse --short HEAD)"
    exit 0
  fi
  sleep "$((attempt * 3))"
done
echo 'State publication failed; run artifacts retain the results.' >&2
exit 1
