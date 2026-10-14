# 錢包官方來源哨兵

只偵測 `rewards`、`swap_fee` 官方頁面的文字變動，不判斷新數字是否正確、不修改 `wallets.json`，也不自動發文。首次讀到有效正文只建立基線；後續變動進入人工待審清單。

## 目前部署狀態

2026-10-14 已在 Windows 工作區完成真實網路驗收。首次成功建立 13 個來源快照，4 個來源被阻擋，另有 Rabby rewards 無可用文字來源，queue 為空。公開 `check-log.json` 如實標示 `schedule.enabled: false`。Linux VM 的 timer 尚未安裝／驗證，不能據此宣稱已啟用每小時檢查。

來源、擷取方式及覆蓋限制見 [SOURCE-RESEARCH.md](SOURCE-RESEARCH.md)。設定為 9 個錢包 × 2 個欄位，共 18 個位置；其中 17 個有 URL。`checked` 是成功取得有效正文並完成比對的數量，不是嘗試次數。

## 檔案與狀態

| 檔案 | 用途 |
| --- | --- |
| `wallets-sources.json` | wallet ID → rewards / swap_fee URL；無來源為 null |
| `source-profiles.json` | SSR/CSR、正文 selector、必要關鍵詞與擷取限制 |
| `check.py` | 依序抓取、清理、比對與記錄 |
| `state/snapshots/<wallet>_<dim>.hash/.txt/.json` | 雜湊、清理後正文、來源與擷取規則指紋 |
| `state/review-queue.json` | 待審與已審項目；不公開、不進 Git |
| `state/check.log` | 逐來源結果；輪替保留日誌 |
| `../check-log.json` | 公開執行時間、實際成功／失敗數、排程狀態 |

抓取使用 HTTPS 官方網域白名單，轉址每一步都檢查；15 秒連線／讀取 timeout，來源間隨機等待 3–5 秒。只接受 200 與有效正文。202 空頁、403、304、挑戰頁與空的 CSR 容器都算失敗，保留舊快照。失敗不算「內容沒變」。

清除導覽、廣告與標示為發佈／產生時間的時間戳；**活動截止日期、費率生效日期仍保留**，避免漏掉真正重要的變動。擷取規則或來源換頁時拒絕靜默重設基線，需人工確認。

## 在既有 Linux VM 安裝

在已有 Git 推送憑證與 egress proxy 的 VM、既有 main checkout 中操作。沿用 `trader-leaderboard-sync.service` 的執行帳號與 Git 憑證，不新增 PAT。需要 Python 3、venv、systemd、flock，以及可讀的 `/run/hatch/egress-tls/ca-bundle.pem`。

```bash
cd ~/workspace/trader-leaderboard
git pull --ff-only https://github.com/kkweb3345678/trader-leaderboard.git main
cd wallets-check
sudo env "PROXY_URL=$https_proxy" ./install-service.sh
```

`$https_proxy` 必須由呼叫端 shell 展開；沒有 `user:password@host:port` 就停止安裝。不要啟用 `set -x`，也不要把憑證貼進日誌或 Git。安裝器會將必要的 proxy 環境放到 repo 外、root 專用的 `/etc/wallets-check/environment`（0600，父目錄 0700）；CA 路徑由 unit 設定。Proxy 憑證輪換後，以當下有效的 shell 值重新執行安裝器。

安裝器建立獨立 `.venv`、安裝並啟用 `OnCalendar=hourly` timer，立即實跑一次，列出下一次觸發時間。失敗來源會使 service 回傳非零，仍發佈真實覆蓋狀態；timer 下次照常重試。應檢查：

```bash
systemctl list-timers wallets-check.timer --no-pager
systemctl status wallets-check.service --no-pager
sudo journalctl -u wallets-check.service -n 40 --no-pager
cat ~/workspace/trader-leaderboard/wallets-check/state/review-queue.json
```

`schedule.enabled` 只有從 systemd 執行，且 timer 同時 enabled、active 時才為 true；單純手動跑 Python 不會誤報已排程。前端另外處理失敗、超過排程間隔 2.5 倍仍未取得新紀錄、時間異常與紀錄讀取失敗。

## 發佈與既有榜單共存

`run.sh` 先檢查，後發佈公開 `check-log.json`；queue、快照與日誌只留在 VM。發佈與既有 `sync.sh` 共用 Git 鎖，fetch 後僅允許 fast-forward，commit 明確只包含各自狀態檔／榜單資料。既有榜單 timer 未變更。

若發佈失敗，本機待審紀錄不遺失，網站仍顯示前一次時間，最終進入逾時狀態。下次執行會重試；分支已分歧時須人工整合，不 force push、不自動丟棄修改。service 將 `wallets.json` 掛載為唯讀，Python 也拒絕把輸出目的地設為該檔案，並核對執行前後 SHA-256。

## 人工審核與重建基線

先備份 `state/` 並暫停 timer，確認 service 已停止，再編輯 queue 或快照，避免和正在執行的檢查競爭。逐筆核對 queue 的官方 URL、摘要與快照全文；需要修訂資料時由 kk / Ren 另行審核 `wallets.json`，哨兵不做資料寫入。已處理項目可將 `status` 從 `pending` 改為 `reviewed`，保留紀錄。完成後重新啟動 timer。

來源／擷取規則變更會顯示 `source_profile_changed_rebaseline_required`。確認新頁涵蓋正確資訊後，將該欄位的 `.hash/.txt/.json` 三檔一起移到備份目錄，下次成功抓取才建立新基線。不要只刪其中一個檔案。建立新基線本身不代表資料已重新審核。

## 驗收

```bash
.venv/bin/python -m unittest discover -s . -p 'test_check.py'
node test_status.cjs
```

核心測試涵蓋首次無告警、真實文字差異、重複告警避免、人工改 hash、抓取失敗保留基線、日期保留、官方網域、proxy 驗證、資料檔寫入防護與前端狀態。

本次真實網路首次運行：`2026-10-14T12:02:12+00:00`，成功 13 / 17、失敗 4、無來源 1、變動 0、queue 0。另複製測試快照並改掉 MetaMask swap_fee 的 hash 後，第二次真實網路運行產生且只產生該筆待審紀錄。第二次 Trust swap 頁另回傳 304，因此當次為成功 12 / 17、失敗 5。兩次 `wallets.json` SHA-256 均未變。

驗收原始檔、空 queue、測試 queue 與截圖保留在開發工作區 `artifacts/wallets-autocheck/`，不混入 VM 正式快照。VM timer 註冊與下次觸發仍需取得該 VM 存取後實際驗證。
