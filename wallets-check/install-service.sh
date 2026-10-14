#!/bin/bash
# Run from the credentialed calling shell:
# sudo env "PROXY_URL=$https_proxy" ./install-service.sh
set -euo pipefail
here="$(cd -- "$(dirname -- "$0")" && pwd)"
repo="$(dirname -- "$here")"
[[ "$EUID" -eq 0 ]] || { echo 'Run installer as root with runtime PROXY_URL.' >&2; exit 1; }
python3 "$here/install_env.py" --validate
[[ -r /run/hatch/egress-tls/ca-bundle.pem ]] || { echo 'Egress CA bundle missing; nothing installed.' >&2; exit 1; }
[[ "$repo" =~ ^/[a-zA-Z0-9_./-]+$ ]] || { echo 'Repository path contains unsupported characters.' >&2; exit 1; }
command -v systemctl >/dev/null
command -v flock >/dev/null
# Use the same Git credential context as the existing data sync service.
runner="$(systemctl show trader-leaderboard-sync.service --property=User --value)"
runner="${runner:-root}"
[[ "$runner" =~ ^[a-zA-Z0-9_-]+\$?$ ]] || { echo 'Unsupported service account name.' >&2; exit 1; }
id "$runner" >/dev/null
export http_proxy="$PROXY_URL" https_proxy="$PROXY_URL"
export HTTP_PROXY="$PROXY_URL" HTTPS_PROXY="$PROXY_URL"
export SSL_CERT_FILE=/run/hatch/egress-tls/ca-bundle.pem
export REQUESTS_CA_BUNDLE="$SSL_CERT_FILE" PIP_CERT="$SSL_CERT_FILE"
python3 -m venv "$here/.venv"
"$here/.venv/bin/python" -m pip install --disable-pip-version-check --quiet -r "$here/requirements.txt"
python3 "$here/install_env.py"
install -d -m 700 -o "$runner" "$here/state"
chmod +x "$here/run.sh" "$here/publish-status.sh"
sed -e "s|@REPO@|$repo|g" -e "s|@USER@|$runner|g" "$here/wallets-check.service" > /etc/systemd/system/wallets-check.service
install -m 644 "$here/wallets-check.timer" /etc/systemd/system/wallets-check.timer
systemd-analyze verify /etc/systemd/system/wallets-check.service /etc/systemd/system/wallets-check.timer
systemctl daemon-reload
systemctl enable --now wallets-check.timer
if ! systemctl start wallets-check.service; then
  echo 'First run reported a source or publication failure; review check.log. Timer remains registered.' >&2
fi
systemctl list-timers wallets-check.timer --no-pager
echo "Review queue: $here/state/review-queue.json"
echo 'Source checks only. Reviewed wallets.json is read-only inside the service.'
