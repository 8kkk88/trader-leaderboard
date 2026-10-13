#!/bin/bash
# 安裝 trader-leaderboard 每小時同步 timer（VM 更換後重跑此腳本）
# 必須用 credentialed root shell 跑，不可用 sudo（見 AGENTS.md SUDO TRAP）
set -e
case "$https_proxy" in *://*:*@*:3128) ;; *) echo "proxy 憑證遺失，停止安裝"; exit 1;; esac
systemctl set-environment http_proxy="$http_proxy" https_proxy="$https_proxy" \
  SSL_CERT_FILE=/run/hatch/egress-tls/ca-bundle.pem \
  REQUESTS_CA_BUNDLE=/run/hatch/egress-tls/ca-bundle.pem
cp trader-leaderboard-sync.service trader-leaderboard-sync.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now trader-leaderboard-sync.timer
echo "installed. next run:"; systemctl list-timers trader-leaderboard-sync.timer --no-pager | tail -3
