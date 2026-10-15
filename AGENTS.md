# 排行榜更新與交接規則

以下是使用者於 2026-10-15 明確指定的運作限制。修改榜單更新流程時必須遵守。

## 唯一寫入者

- 目前 `data.json` 的唯一寫入者是 **Ren VM**，由 systemd timer 每 30 分鐘執行 `~/workspace/trader-leaderboard/sync.sh`。VM 工作拷貝與 GitHub main 是同一個 repo。
- 現有 `leaderboard-snapshots.yml` 只封存已推送的資料；不得把它視為榜單抓取／寫入流程，也不得順便啟用第二個寫入者。
- `BIRDEYE_API_KEY` GitHub Secret 配妥、Actions 抓取流程上線且驗證成功後，才可協調將唯一寫入者切換為 Actions。切換完成前不得讓兩端同時寫入。

## 未來 Actions 抓取流程

- 必須設定共用的 concurrency group，避免手動與排程 run 同時抓取／寫入／推送；執行中的工作不應被另一個 run 任意取消。
- 沿用 `sync.sh` 的同步順序：先 `git fetch`，再 `git merge --ff-only`，成功後才抓資料、寫檔、commit、push。不得用 force push 或覆蓋遠端來解分歧。
- Actions concurrency 不涵蓋 VM 的 flock。真正會推送 `data.json` 的手動驗證，須先在本對話協調不與 VM 執行重疊的交接安排；不可自行假定兩端已互斥。
- Secret 配妥後先手動觸發驗證，核對 `data.json` **內部的 `updated_at`** 確實更新、來源與資料正常，再啟用 30 分鐘排程。排程延遲是已知情況，不能以 workflow 開跑時間取代來源時間。
- 上線後在本對話通知使用者，待 Ren 驗證數據正常並確認交接後，由 Ren 關閉 VM timer。安排順序須同時避免雙寫與不必要的更新空窗；在交接尚未協調完成前，保留現有 VM 單獨生產。
- 金鑰只放 Secret／受保護環境，不寫進 repo、前端、日誌或對話。

## 變更通知

- 以後凡修改任何 workflow 或 `sync.sh`，push 後必須在本對話明確告知改了什麼、是否影響寫入或排程，以及驗證結果。
- VM 每次執行會同步遠端，因此 push 不是單純保存程式；變更可能在下一輪直接被 VM 採用。
- 正確遠端為 `https://github.com/kkweb3345678/trader-leaderboard.git`。本機 origin 可能仍指向舊 owner；使用正確 URL，不依賴未核對的 origin。

## 最近一次中斷紀錄

使用者回報：VM 更換清空 `/etc` 的 timer 設定，且 VM 本地 8 筆未推送資料與遠端 39 筆錢包工作分歧。Ren 已重裝 timer、以遠端為準處理分歧、保留強化版 `sync.sh`，並手動推送 2026-10-15 12:14:35（台北）資料。

Codex 隨後獨立核對：12:31:23（台北）的下一筆資料已推上 main、封存 Actions 成功，公開 Pages 也顯示同一時間，今日／近週各 100 筆。這可確認新一輪更新成功；持續半小時更新仍以後續資料時間及 24 小時驗收為準。未推送的 8 筆 VM 本地資料不在這次已驗證的 GitHub 快照範圍內。
