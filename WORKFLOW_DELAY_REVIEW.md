# 2026-10-16 排程延遲調查

依 HANDOFF 14:10 的 B4，只讀取既有 run、job、逐行 log 與已發布 JSON，未呼叫付費 API，也未修改任何 workflow、排程或寫入程式。

## 結論

觀察到的數小時延遲主要出現在 **GitHub 建立排程 run 之前**。三次 run 的 `created_at` 與 `run_started_at` 相同；抓取與候選驗證步驟約 13～14 秒（flash）及 63 秒（full），不支持「抓取花了三小時」的說法。

這能定位延遲階段，但無法僅從 repo log 證明 GitHub 內部原因或固定延遲。因而不在頁面寫死「快照約延遲 3 小時」；仍呈現真實 `updated_at` 與「排程可能延遲」說明。沒有實作或承諾任何排程改善。

## 實際時序

下表均為台北時間。應有時段依宣告 cron、排程啟用時間及依序 run／Git 資料推定；API 未直接提供原定 scheduled-for 欄位。

| 應有時段 | 模式 | run 建立／開始 | JSON updated_at | 來源相對時段延遲 | 抓取＋候選驗證步驟 |
|---|---|---|---|---|---|
| 10-15 20:00 | flash | 10-16 00:13:09 | 10-16 00:13:32 | 4h 13m 32s | 00:13:18.812 → 00:13:32.207，約 13.4s |
| 10-16 02:00 | flash | 10-16 04:52:58 | 10-16 04:53:27 | 2h 53m 27s | 04:53:13.874 → 04:53:27.767，約 13.9s |
| 10-16 08:00 | full | 10-16 10:51:36 | 10-16 10:52:49 | 2h 52m 49s | 10:51:47.096 → 10:52:49.751，約 62.7s |

步驟範圍從執行唯讀保護／候選抓取命令的 group 開始，到驗證程式輸出 candidate report；包括檔案保護、抓取及驗證，不假稱是純 HTTP 耗時。

證據：

- [20:00 flash run 38767120909](https://github.com/kkweb3345678/trader-leaderboard/actions/runs/38767120909)，collect job `116533123771`；候選時間 `2026-10-16T00:13:32+08:00`。
- [02:00 flash run 38805514435](https://github.com/kkweb3345678/trader-leaderboard/actions/runs/38805514435)，collect job `116665215301`；候選時間 `2026-10-16T04:53:27+08:00`。
- [08:00 full run 38842578246](https://github.com/kkweb3345678/trader-leaderboard/actions/runs/38842578246)，collect job `116785795860`；候選時間 `2026-10-16T10:52:49+08:00`。

三次 collect／publish 都成功；full 的 archive dispatch 亦成功。原始 job timing／run metadata 已於本次 24 小時封存驗收存證；逐行 log 摘錄另存工作區 `artifacts/home-v3-review/workflow-log-excerpts.json`。本次未把 Actions 工作執行時間代替 JSON 來源時間。
