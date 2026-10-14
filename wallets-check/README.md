# 錢包官方來源哨兵（GitHub Actions）

只偵測 `rewards`、`swap_fee` 官方頁面的文字變動，數字由 kk / Ren 人工審核後另行修改。哨兵不寫入 `wallets.json`，不發文、不發 Telegram，也不使用 VM、PAT 或 proxy 憑證。

## 排程與操作

正式流程為 `.github/workflows/wallets-check.yml`，位於預設分支 main。每小時第 7 分鐘執行（`7 * * * *`，UTC；台北時間同樣是每小時第 7 分鐘），也可在 [Actions 頁面](https://github.com/kkweb3345678/trader-leaderboard/actions/workflows/wallets-check.yml) 選 Run workflow 手動觸發。

GitHub 排程可能因平台負載延後，不保證準點；公開 repo 長期無活動也可能使 schedule 被停用。前端超過 150 分鐘沒有新紀錄會顯示逾時，不能把舊時間視為仍在正常運作。[GitHub 排程文件](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)

workflow 依序 checkout、setup-python、安裝 `requests`、執行防護測試、抓取來源、提交狀態，並要求 GitHub Pages 重新建置。只使用該 job 內建的短效 `GITHUB_TOKEN`，權限限於 `contents: write` 與 `pages: write`。Actions 用 token 推回的 commit 不會自行觸發 Pages build，因此最後必須呼叫官方 Pages build API，否則網站時間不會更新。[GitHub Pages API](https://docs.github.com/en/rest/pages/pages#request-a-github-pages-build)

## 來源與檔案

來源研究見 [SOURCE-RESEARCH.md](SOURCE-RESEARCH.md)。9 個錢包 × 2 個欄位共有 18 個位置，目前 17 個設定官方 URL；Rabby rewards 沒有可靠官方文字頁，保留 null。`checked` 只計入成功取得有效正文且完成比對的來源，絕不固定寫 18。

| 檔案 | 用途 |
| --- | --- |
| `wallets-sources.json` | wallet ID → rewards / swap_fee URL |
| `source-profiles.json` | SSR/CSR、正文 selector、主題關鍵詞與擷取限制 |
| `check.py`、`article.py` | 抓取、標準庫 HTML 解析、hash 與差異比對；外部依賴只有 requests |
| `snapshots/<wallet>_<dim>.hash/.txt/.json` | hash、清理後正文、來源／擷取規則指紋；提交到 main |
| `review-queue.json` | 待審與已審紀錄；提交到 main，公開可讀 |
| `check-log.json` | 真實時間、覆蓋數、結果與 Actions run 連結；前端讀取此檔 |
| `check.log` | 逐來源文字 log，不進 Git；隨執行 artifact 保留 |

抓取使用 HTTPS 官方網域白名單，轉址每一步檢查；15 秒連線／讀取 timeout，URL 之間隨機等待 3–5 秒，依序執行。只接受 HTTP 200 與有效正文；202 空頁、403、304、挑戰頁、空 CSR 容器都算失敗，保留舊快照。只有標記為發佈／產生時間的時間戳與導覽、廣告噪聲會移除；活動期限與費率生效日期保留。

首次取得有效正文只建立快照，不告警。後續 hash 變動先持久化 queue，再推進快照；摘要保留差異前 500 字。來源或擷取規則換版會拒絕靜默重建，交由人工處理。單次來源失敗會產生醒目的 Actions warning 和真實計數，但流程仍保存其他來源結果；**workflow 成功代表流程與回寫完成，不代表所有來源可讀。**

## 審核與資料防護

Ren 定期查看 [review queue](https://github.com/kkweb3345678/trader-leaderboard/blob/main/wallets-check/review-queue.json)。先核對官方 URL、摘要與快照全文，再決定是否另行更新已審核資料。已處理項目將 `status` 由 `pending` 改為 `reviewed`，保留歷史；不要刪除其他未處理項目。

Python 拒絕將輸出目的地設為 `wallets.json`，並核對執行前後 SHA-256；workflow 也將該檔設為唯讀並再次驗證雜湊。回寫腳本僅允許 snapshots、queue、check-log 進入 commit。Actions concurrency 避免兩次檢查同時改寫；其他人工提交在檢查期間進入 main 時，僅重放狀態 commit，遇到衝突就失敗保留 artifact，不 force push。

若需換來源或擷取規則，先暫停排程並確認沒有執行中的檢查。人工確認新頁後，將該欄位的 `.hash/.txt/.json` 一起備份／移除，下次成功抓取重新建立基線；這不代表比較資料已審核。完成後重新啟用 workflow。

## 驗收

`.github/workflows/wallets-acceptance.yml` 使用同 repo 的內建 token 觸發兩次 `workflow_dispatch`：先驗證基線，再改 MetaMask swap_fee 的快照 hash，驗證對應告警，最後只將該測試紀錄標記為已審。真實來源變動仍維持 pending；中途失敗會嘗試還原測試 hash。測試會核對遠端 `wallets.json` 前後完全一致。

初次部署的 push 驗收入口已在通過驗收後移除，目前只保留手動驗收。此流程額外需要 `actions: write` 來觸發正式流程；平常每小時的工作不需要此權限。Actions summary 與 artifacts 保存首次 queue、成功／失敗數、兩次執行連結與測試告警證據。實際執行連結與限制見 [ACCEPTANCE.md](ACCEPTANCE.md)。

本機測試：

```bash
python -m pip install -r wallets-check/requirements.txt
python -m unittest discover -s wallets-check -p 'test_check.py'
node wallets-check/test_status.cjs
```

正式 Actions 的實跑結果以 `check-log.json`、workflow summary 及驗收 artifacts 為準。先前 Windows 實跑記錄保留於開發工作區，不當成 Actions 已執行的證據。
