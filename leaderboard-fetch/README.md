# Birdeye Actions 抓取驗證

目前仍由 Ren VM 單獨更新正式 `data.json`。新增的 [leaderboard-fetch.yml](../.github/workflows/leaderboard-fetch.yml) 只有 `workflow_dispatch`，沒有 schedule、push 觸發或發布模式；Token 只有 `contents: read`，checkout 不保留憑證。

手動執行會先 `fetch + merge --ff-only` 同步 main，再透過 GitHub Secret `BIRDEYE_API_KEY` 驗證額度並抓取今日／近週各 100 筆。使用 `fetch.py` 原有的 API、分頁、損益計算與說明函式，沒有修改 VM 的 `fetch.py` 或 `sync.sh`。驗證額外拒絕缺失或非數值欄位、重複地址、不完整榜單與未前進的時間戳，避免把 API 異常當成成功。

候選檔存在 `$RUNNER_TEMP/leaderboard-validation/data.json`，與 checkout 內的正式檔完全分開；驗證程式拒絕把輸出位置設在 repo 內。少於原有 3,000 CU 門檻時不抓榜單、驗證失敗，不以舊檔冒充成功。Secret 僅傳入抓取步驟的環境，不印出、不寫檔。

同一個 `leaderboard-data-writer-main` concurrency group 用於未來正式抓取流程；目前 `cancel-in-progress: false`，不讓兩個 Actions run 同時執行。此鎖不涵蓋 VM，交接仍須遵守 [AGENTS.md](../AGENTS.md)。

## 手動驗收

在 GitHub Actions 選擇 **Leaderboard fetch validation**，按 **Run workflow**，branch 選 `main`。不要重複點擊：真實 API 抓取會使用 Birdeye 額度。

成功後下載 `leaderboard-validation-<run_id>` artifact（保留 14 天）：

- `data.json`：新抓取的候選資料，尚未發布。
- `baseline-data.json`：該次執行同步 main 後的正式資料副本。
- `validation.json`：驗證結果、兩個檔案的 hash、來源時間、筆數與正式檔未改動證據；不包含密鑰。
- `README.md`：本次結果摘要。

`candidate_updated_at` 必須大於 `baseline_updated_at`，檢查的是 JSON 內時間。`updated_at` 沿用 `fetch.py` 定義，代表完成本批抓取的時間，不是鏈上事件時間。runner 已完成或 Secret 存在，均不能單獨當成資料驗證成功。

## 交接

驗證通過後，Codex 在 [HANDOFF.md](../HANDOFF.md) 的「給 Ren」區提供 run、artifact 與驗證數字。Ren 驗收的是 artifact 裡的候選檔；網站與 main `data.json` 此時仍由 VM 更新。收到 Ren 的 timer 停用／執行中程序已結束確認，協調接管後，才修改 workflow 加入正式發布與半小時排程。本版不會因驗證成功、Secret 存在或留言自動開啟排程。

未來正式版仍需先同步遠端再寫檔、保護 push 衝突、驗證發布後檔案時間，並依 AGENTS.md 在 push 後通知。使用短期 `GITHUB_TOKEN` 發布時也需明確接上快照封存與 Pages 更新；此版先完成讀取驗證，不接管寫入。

本地測試不需要 Secret、不呼叫 API：

```sh
python -m unittest discover -s leaderboard-fetch -p 'test_validate.py'
```
