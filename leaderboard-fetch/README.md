# Birdeye production 流程與交接

2026-10-15 已完成唯一寫入者交接：Ren 在 HANDOFF.md 確認 VM 退役後，Actions 手動正式發布 [run 38699401131](https://github.com/kkweb3345678/trader-leaderboard/actions/runs/38699401131) 成功。`today-flash.json` 的 15:32:30 台北時間與 SHA-256 在 main、公開 Pages 一致，才啟用以下新制排程。`LEADERBOARD_PUBLICATION_ENABLED: 'true'`；VM 不得重新同時寫入。

## 新頻率（依 HANDOFF.md）

| 模式 | 台北時間 | UTC cron（已啟用） | 輸出 | 筆數 |
|---|---|---|---|---|
| full | 每日 08:00 | `0 0 * * *` | `data.json` | Solana today100、week100，Base today20 |
| flash | 每日 02:00、14:00、20:00 | `0 6,12,18 * * *` | `today-flash.json` | Solana today20 |

不另跑 08:00 flash，不補跑錯過的排程，不使用舊半小時制。模式依 `github.event.schedule` 決定，延遲開跑也不會誤選。Ren 估計 full 約 660 CU、flash 約 60 CU，合計約 840 CU/天；此為估算，不是帳單保證。沿用 VM 少於 3,000 CU 不抓榜單的門檻，失敗不寫舊資料冒充成功。

full 保留原 source/chain/updated_at/insight/today/week 結構並新增 `base_today`；未增加 VM 腳本額外的 `base_updated_at`，依交接規格只使用批次完成時間 `updated_at`。flash 僅含 updated_at/source/chain/today。這次不變更前端呈現。

## 手動驗收

在 GitHub Actions **Leaderboard production** 選 Run workflow，branch `main`、mode `validate`。batch 預設 `flash`；`full` 驗全量；`all` 各抓一次兩種模式，僅限驗證。請勿重複觸發，真實 API 會扣 CU。

- 先 fetch + merge --ff-only，再執行離線測試與真實抓取。
- 匯入 VM 的 fetch.py 分頁／正規化函式，傳入明確 chain 與筆數；未修改 VM 的 fetch.py、sync.sh、systemd。
- 檢查 Secret、額度、必填數值、非有限數字、整數交易次數、筆數、地址格式與重複地址（Base 忽略大小寫）。Base 抓取失敗即全量失敗，不以空陣列或 Solana 假冒 Base。
- 候選檔只能寫在 checkout 外，正式 data.json 與 today-flash.json 全程唯讀並核對 SHA-256。
- artifact `leaderboard-candidates-<run_id>` 保存 14 天，每個 batch 子目錄有候選 JSON、`baseline-data.json`（該目標檔的基準副本）、`validation.json`、README。完整失敗原因只使用固定診斷和 HTTP 狀態，不輸出 API 回應／header／key。
- 驗證依候選檔內 updated_at 大於正式基準，不以 workflow 時間冒充來源更新。updated_at 是批次完成時間，非鏈上事件時間。
- collect job 僅 contents: read、checkout 不保留憑證；publish job 在 validate 模式必定跳過。若將交接開關改回 false，手動 publish 與 schedule 都會在 API 呼叫前被拒絕。

## 正式發布（已啟用）

本次先依 Ren 的 VM 退役確認開啟手動 publish，核對正式檔與 Pages 後才開兩條 cron。首輪正式驗證只抓 flash（20 筆）；Base 全量候選已於 run 38695196806 通過實測，正式全量等待下一個 08:00 台北排程，未為前端預覽額外改寫 data.json。排程可能延遲，應以資料內 updated_at 驗收。若需回退，依 HANDOFF 協調恢復唯一寫入者，勿逕自讓 VM 與 Actions 一起跑。

正式抓取仍在唯讀 job 產出候選。獨立 publish job 只下載本 run artifact，重驗 hash、格式及 30 分鐘新鮮度，fetch + merge --ff-only 同步 main 後才寫指定單一檔。若遠端同一目標相較抓取基準已改變，停止發布；若只是其他檔案變動，rebase 保留更新並限次重試 push，禁止 force。發布後再 fetch 核對遠端 bytes/hash/updated_at；同候選已發布則不重複 commit。

共用 concurrency `leaderboard-data-writer-main`、cancel-in-progress false 覆蓋整個抓取及發布流程。此鎖無法鎖住 VM，所以仍需上述交接。

full 發布後明確 dispatch `leaderboard-snapshots.yml`；兩種發布皆要求 Pages rebuild。這是因 [GITHUB_TOKEN 推送不會觸發另一個 push workflow](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)。發布證據另存 `leaderboard-publication-<run_id>`。快照 archive 目前只封存 data.json；today-flash.json 的版本保留在 Git 歷史，不宣稱已進 snapshots/。

## 本地測試

`python -m unittest discover -s leaderboard-fetch -p 'test_*.py'`

不需 Secret、不呼叫 API。包含暫存 bare Git repo 的真實 commit/fetch/push 測試，覆蓋兩種輸出、重跑、舊候選、不同檔並行更新、同檔競爭、髒索引、未交接拒絕發布及 UTC cron 模式。
