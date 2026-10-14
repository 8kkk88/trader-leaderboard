#!/bin/bash
set -uo pipefail
here="$(cd -- "$(dirname -- "$0")" && pwd)"
cd "$(dirname -- "$here")"
result=0
"$here/.venv/bin/python" "$here/check.py" || result=$?
# Publish partial coverage too, so failures never masquerade as complete checks.
if [[ "$result" -le 1 ]]; then
  "$here/publish-status.sh" || { echo 'Public status publication failed; local review state retained.' >&2; exit 1; }
fi
exit "$result"
