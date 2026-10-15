#!/usr/bin/env bash
set -euo pipefail
target=referral-review-queue.md

# No force push, no broad staging, and never replace a concurrently edited queue.
unexpected=$(git status --porcelain --untracked-files=all | awk '{print $2}' | grep -v -x "$target" || true)
if [[ -n "$unexpected" ]]; then
  echo 'Unexpected repository changes; refusing publication.' >&2
  exit 1
fi
if [[ -z $(git status --porcelain -- "$target") ]]; then
  echo 'This check was already recorded; no changes to publish.'
  exit 0
fi
baseline=$(git rev-parse "HEAD:$target" 2>/dev/null || true)
git add -- "$target"
git -c user.name='github-actions[bot]' -c user.email='41898282+github-actions[bot]@users.noreply.github.com' commit -m 'Check official referral sources'
for attempt in 1 2 3; do
  git fetch origin main
  current=$(git rev-parse "origin/main:$target" 2>/dev/null || true)
  if [[ "$current" != "$baseline" ]]; then
    echo 'Review queue changed remotely; refusing to overwrite. Re-run the check on latest main.' >&2
    exit 1
  fi
  git -c user.name='github-actions[bot]' -c user.email='41898282+github-actions[bot]@users.noreply.github.com' rebase origin/main
  if git push origin HEAD:main; then
    local_hash=$(git rev-parse "HEAD:$target")
    git fetch origin main
    [[ $(git rev-parse "origin/main:$target") == "$local_hash" ]] || { echo 'Remote queue differs after publication.' >&2; exit 1; }
    echo 'Review queue published and remote blob verified.'
    exit 0
  fi
done
echo 'Push did not succeed after bounded retries.' >&2
exit 1
