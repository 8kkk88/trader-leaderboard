#!/bin/bash
# A short-lived checkout token publishes archive-only changes; never force push.
set -euo pipefail
cd "$(dirname -- "$0")/.."
[[ "${GITHUB_ACTIONS:-}" == true && "${GITHUB_REF:-}" == refs/heads/main ]] || { echo 'Requires main Actions workflow.' >&2; exit 1; }
git diff --exit-code HEAD -- data.json
git add -- snapshots
if git diff --cached --quiet; then
  echo 'No new source version or expired snapshot.'
  exit 0
fi
while IFS= read -r changed; do
  [[ "$changed" =~ ^snapshots/[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}(\.[0-9]{3})?Z--[a-f0-9]{12}\.json$ ]] || {
    echo 'Unexpected staged path; publication refused.' >&2; exit 1;
  }
done < <(git diff --cached --name-only)
git -c user.name='github-actions[bot]' -c user.email='41898282+github-actions[bot]@users.noreply.github.com' commit -m "Archive leaderboard snapshots (${GITHUB_RUN_ID})"
for attempt in 1 2 3; do
  git fetch --quiet origin main
  git -c user.name='github-actions[bot]' -c user.email='41898282+github-actions[bot]@users.noreply.github.com' rebase origin/main
  if git push --quiet origin HEAD:main; then
    echo "Published snapshot commit $(git rev-parse --short HEAD)"
    exit 0
  fi
  sleep "$((attempt * 3))"
done
echo 'Archive publication failed; the run artifacts retain the audit.' >&2
exit 1
