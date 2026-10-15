# 排行榜快照歷史庫

每一個已推送至 main 的 `data.json` 版本，額外封存為一份完整 JSON。原有 `fetch.py`、`sync.sh`、`data.json` 的結構與路徑，以及所有前端程式都保持原樣。封存不呼叫 Birdeye、不需要新增 API key，也不做 Watch 提醒或走勢圖。

## 觸發與補存

新增 workflow：[leaderboard-snapshots.yml](../.github/workflows/leaderboard-snapshots.yml)。

- main 的 `data.json` 推送後執行；修改封存程式時也會執行自我驗證。
- 每小時第 17、47 分補查，另支援手動 `workflow_dispatch`。
- 掃描 Git 第一父系的資料提交，補存保留期內所有版本。一次 push 含多次資料更新，或排程延遲，仍可逐筆還原已提交的版本。
- 同一版本重跑不新增、不改寫快照；同一來源時間但內容更正時，以 hash 後綴保留不同版本。
- 發布只允許 `snapshots/` 的指定檔名；遇到其他 bot 或人工提交先 rebase，再重試 push，禁止 force push。
- 不另行要求 Pages rebuild。快照由 GitHub repository 保存、提供下載；線上頁面繼續由原有資料更新流程發布。

GitHub 的排程可能延遲；內建 `GITHUB_TOKEN` 的推送通常不觸發另一個 push workflow，因此保留定時補查。參考 [GitHub 事件說明](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)與 [workflow 觸發規則](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)。這是更新完成後的獨立封存流程，不會重新抓取或改寫榜單。

**部署時發現：repo 目前的資料生產端是 Linux systemd（`OnCalendar=*:0/30`），不是榜單更新 Actions。最新 `data.json` 停在 2026-10-13 19:01:11 台北時間。封存無法替停更的來源產生新觀測。** 需由現有執行環境恢復資料更新，才能驗收每日約 48 份新榜單。尚未推送的 VM 本機資料，也無法由 GitHub 封存流程取得。

## 格式與排名

位置：`snapshots/<資料 UTC 時間>--<來源 SHA-256 前 12 碼>.json`。

例如 `2026-10-13T11-01-11Z--ee8e5be53022.json`；時間不是封存程式的執行時間。

- `schema_version: 1`：快照格式版本。
- `data_updated_at`：原始 `updated_at` 正規化為 UTC。
- `archived_at`：實際封存時間，可區分歷史補存。
- `source_commit`、`source_blob`、`source_sha256`：原始 Git 提交、blob 與原始 bytes 的 SHA-256，供完整核對。
- `data`：完整原始 JSON 內容，含 today、week、地址、已實現／未實現／總損益、成交量、交易次數、來源、原始時間與說明。不刪欄、不補數字，未知值仍保留未知。
- `ranks.today` / `ranks.week`：每列的 `rank` 為已實現收益排名；`pnl_rank` 為總損益排名；`source_index` 為對應 `data` 陣列的零起算位置。
- `ranking`：記錄排序規則與執行時 locale。與目前 `app.js` 一致：主欄位遞減、另一損益欄位遞減、地址 `localeCompare` 打破同分；未知值置後。

排名範圍是該批來源樣本、未套用搜尋／研究室篩選，不是全 Solana 市場排名。歷史補存依此版排序規則計算，不宣稱重建舊版介面的外觀或其他個人篩選條件。

## 體積與保留

採用**完整資料＋緊湊 JSON**，保留半小時更新粒度。實測目前 100＋100 筆的三份完整快照為 37,962～38,159 bytes；較早的 10＋10 筆快照為 4,557 bytes。

以目前最大一份估算：38,159 × 48 × 90 = 164,846,880 bytes，約 **157.2 MiB／90 天**。這是原始檔案大小估算，未計 Git 壓縮、歷史物件與未來資料筆數變化。此量級先全量保存，不刪減欄位、不降為每小時。

每次成功執行會移除資料時間早於 90 天的、格式已驗證的快照；剛好 90 天仍保留。只刪除指定目錄下符合命名規則的單一檔案，不遞迴刪目錄。Git 舊提交仍留存，這不等於永久限制 Git repository 大小；若長期歷史體積影響 checkout／Pages，再另行評估獨立資料儲存。尚未實測累積 90 天後的發布時間。

## 驗證與取用

無第三方套件，Node.js 20 以上：

```sh
node --test snapshot-archive/archive.test.mjs
node snapshot-archive/archive.mjs capture
node snapshot-archive/archive.mjs audit > snapshot-audit.json
```

`audit` 逐份從原始 Git 提交核對完整資料、hash、兩種排名，並輸出快照列表、近 24 小時不同來源時間數量、超過 45 分鐘的中間缺口，以及目前版本的今日／近週前十名。第一筆／最後一筆時間與最新資料年齡也會列出，避免空清單或中間無缺口被誤判為更新正常。

程式化還原：

```js
import fs from 'node:fs';
import {restore} from './snapshot-archive/archive.mjs';
const snapshot = JSON.parse(fs.readFileSync('snapshots/<檔名>.json', 'utf8'));
console.log(restore(snapshot, 'today', 'realized', 10));
console.log(restore(snapshot, 'week', 'pnl', 10));
```

Actions 每次保留 capture／audit 報告 artifact 90 天；摘要最多顯示最後 60 份，完整列表在 artifact。資料超過 90 分鐘未更新會顯示 warning，但不把封存成功寫成資料更新成功。

24 小時驗收需要實際經過 24 小時：分別記錄新來源時間數、補存數、時間缺口與前十名核對結果。不能用測試資料或把同一份舊 JSON 複製 48 次通過驗收。
