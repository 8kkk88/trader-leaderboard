# 每日交易幣種摘要

`wallet-trades.json` 由 `wallet-trades.yml` 單獨寫入。僅在原本每天台北 08:00 全量 **實際成功發布** 後跟隨更新；沒有新 cron，不改 `data.json`、`today-flash.json` 或週持倉規格。與週持倉共用 `holdings-writer-main`，不取消執行中的批次。來源同日與重複來源防護均在 Python 再核對。

## 選樣與內容

- 在最新 `data.json.week` 完整 100 筆樣本內，以 volume 降序取十個；同值依 realized、地址，對齊網站。這不是全鏈交易量前十名。
- 每地址一次 POST `/wallet/v2/pnl/details`；`duration=7d`、`position_scope=duration_only`、`pnl_method=wac`，`sort_by=last_trade`、desc、offset0、limit100。近七日窗口跟隨查詢當下，與榜單 1W 的來源時間分開保存。
- 公開檔保存來源 commit／hash／時間、選樣排名、每地址回應的 `meta.time`。買賣次數與金額、已實現／未實現損益只映射回應值；缺值保留 null，同名不同 mint 不合併。WAC 是請求指定口徑，介面不把加總強制對齊榜單。
- `limited` 表示 summary 大於本頁或本頁已滿 100，不能宣稱全部幣種；`count_mismatch` 表示彙總計數小於明細列數，原值分開保存，不推測排除原因；`source_page` 也只指本次來源頁，不保證全鏈完整。
- `last_trade_unix_time` 有回傳才保存。這是逐幣彙總，不是逐筆成交時間線，亦不是目前持倉。前端只抓同站靜態檔，不持有 Secret。

## 成本與實測

2026-10-17 `38986579644` 實測週榜 100 筆仍 30 CU、PnL 單頁 30 CU。`fetch.py` 改 PAGE100、limit 不超過所需筆數，原樣本數與驗收門檻不變；完整正常情況每日榜單 6 次請求 180 CU，加四次餘額查詢為 184 CU。

新摘要十次 PnL 共 300 CU，加前後餘額查詢為 302 CU／天。連同週持倉 302 CU／週，30 天／四週估 15,788 CU，31 天／五週估 16,576 CU；不含重試、人工測試或其他使用。抓取前要求餘額至少 3,302，保留原有 3,000 CU。付費請求不自動重試。

本次兩輪小量驗證 33+95=128 CU；首次整批 302 CU；共推算 430 CU。整批原始回應已保存，解析修正及正式發布均零新增 API。公開檔與原始十份回應、Git 完整逐筆核對：SHA256 `59a3195b93c83b17d6041967181587fcc806f255af038db3c1d4f0bfdf08c9ac`。

## 操作與恢復

- `validate`：十錢包候選只進 artifact；不發布。
- `validate_saved`：指定失敗的 validation run，若十份回應與 300 CU 成本證據齊備，用原回應重驗，不再扣額。
- `publish_saved`：指定成功的 validation run，重新由原始回應建構比對 candidate；要求資料及目標 hash 未變、候選不超過六小時，再只提交 `wallet-trades.json`。不呼叫 API。
- `refresh`：供正常每日批次抓取、驗收與發布；同一來源已發布就跳過。人工觸發會花額度，先查看是否已有 artifact，避免重抓。
- **資料備援**：來源／解析／扣額／發布驗收失敗，保留上一份公開檔。原始回應保存 30 天。若只成功部分錢包，先檢視 artifact，不直接重跑整批；不會把部分錢包湊成完整十個。
- **介面備援**：讀取失敗可重試靜態檔，也能使用原本的 Solscan 地址查詢；持倉分頁獨立運作。摘要或選樣來源超過 36 小時會標舊資料。
- 停止新自動抓取：將 `WALLET_TRADES_AUTOMATION_ENABLED` 設為 `'false'`，只停新摘要，保留原榜單及週持倉。手動 `refresh` 仍須操作者主動觸發。
- `wallet-trades-probe.yml` 是保留的手動診斷，會扣額，無排程；不要當一般驗收反覆跑。

## 驗收

`python -m unittest discover -s wallet-trades-fetch -p 'test_*.py'`、`python -m unittest discover -s leaderboard-fetch -p 'test_*.py'`、`node scripts/check-ui.mjs`。

首次來源榜單為 2026-10-16 10:52:49 台北，幣種實際回應為 2026-10-17 08:33:10–08:33:42，重新驗收檔案完成時間 08:36:28。時間分開標示，沒有把舊榜單改成新時間。08:28 左右探測時今日 Solana 僅 34、Base 僅 9 筆；正式榜單仍要求 100／20，不把這些短頁發布。若全量因來源不足失敗，當天自動摘要也不會冒稱已更新。

原始文件：[PnL details](https://data.birdeye.so/docs/data-api/wallet-networth-pnl/post-wallet-v2-pnl-details)、[Leaderboard](https://data.birdeye.so/docs/data-api/wallet-networth-pnl/get-trader-gainers-losers)。
