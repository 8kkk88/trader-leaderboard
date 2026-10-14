# GitHub Actions 驗收紀錄

驗收日期：2026-10-14。正式 workflow 位於 main，狀態 active，cron 為 `7 * * * *`。每小時第 7 分鐘排程，實際啟動時間由 GitHub 調度；本次已使用 `workflow_dispatch` 真實執行驗證。

## 官方文章 API 修復驗收（最新）

2026-10-14 23:09:55（台北）[正式 Actions 執行成功](https://github.com/kkweb3345678/trader-leaderboard/actions/runs/38586711832)：**17 / 17 個已設定來源成功、0 讀取失敗、1 個無來源欄位**。Binance、imToken 的 rewards / swap_fee 四篇原文透過同網域公開 API 成功建立快照；沒有新增待審告警，`dataset_unchanged: true`，17 項 Python 防護測試通過。快照與狀態已由 bot 提交 `2580b6d`。

新增的設定變更檢查入口只在檢查器／來源設定推到 main 時觸發一次既有正式 workflow，使用內建 GITHUB_TOKEN；例行每小時排程不變。驗證文章身分、語言、API 成功回應、正文與費率表格；未知格式／挑戰頁不能建基線。純圖片的內容及新文章發現仍不在文字監看範圍。

剩餘缺口是 Rabby rewards 尚無可靠官方文字來源，保留 null。這與 HTTP 讀取失敗不同，前端仍明確顯示一個欄位尚無可用來源。下方保留修復前驗收歷史。

## 執行證據

- [首次基線執行成功](https://github.com/kkweb3345678/trader-leaderboard/actions/runs/38564807946)：成功 12 / 17、失敗 5、無來源 1，首次 queue 為空。原始 log 與 queue 包含在該 run 的 artifact。
- [首次完整驗收成功](https://github.com/kkweb3345678/trader-leaderboard/actions/runs/38564786159)：內建 token 觸發兩次正式流程、修改一個 hash、確認待審紀錄、將測試項目標記為已審。
- [最終版本基線檢查成功](https://github.com/kkweb3345678/trader-leaderboard/actions/runs/38566453230)：已採用可讀的 Trust 官方費率列與 Node 24 Actions，成功 13 / 17。
- [最終版本告警檢查成功](https://github.com/kkweb3345678/trader-leaderboard/actions/runs/38566675623)：修改 hash 後新增對應告警，bot 回寫 main、Pages build 請求與 artifact 保存皆成功。
- [最終完整驗收成功](https://github.com/kkweb3345678/trader-leaderboard/actions/runs/38566431408)：再次發生的相同變動不會被已審歷史擋住；測試 hash 已恢復，測試項目標記 reviewed / test，沒有待處理的測試告警。

`wallets.json` 與遷移前提交 `f402712` 完全相同。Actions API 取得的檔案 SHA-256 在驗收前後均為 `14784ad0c78b929ba6919e0b972be6fe2dc5d33672e6bbb7937b0580a6c22369`。Windows checkout 可能使用 CRLF，因此工作區原始位元組雜湊不同；Git 版本內容與各次執行前後比較皆未變。

12 項 Python 測試涵蓋寫入防護、首次基線、內容變動、失敗保留快照、pending 重試去重、已審變動再次出現、官方網域、正文擷取與日期保留；前端狀態測試涵蓋未啟用、執行中、部分失敗、逾時及無效紀錄。手機 390px 與桌面瀏覽器確認狀態文字、檢查範圍及新 JSON 路徑正常，沒有整頁水平溢出。

## 初次交付的覆蓋限制（修復前歷史）

最終驗收成功讀取 13 / 17 個已設定來源；另外 4 個失敗：Binance rewards / swap_fee 回傳 202，imToken rewards / swap_fee 回傳 403。Rabby rewards 沒有可靠官方文字頁，保留 null。這些都顯示在公開狀態中，沒有假裝成功或拿第三方鏡像替代。

Trust 原 `/swap` FAQ 回傳 304，已改為官方比較表的 Swap Fee 列；只監看該費率列，適用範圍與活動條件仍需人工複核。完整來源限制見 [SOURCE-RESEARCH.md](SOURCE-RESEARCH.md)。

本次只偵測並保存狀態，沒有自動改動費率、積分或其他比較資料。正式每小時流程只使用內建 GITHUB_TOKEN；無 VM、無新 PAT、無 proxy 憑證。一次性 push 驗收入口已移除，後續驗收需手動觸發。
