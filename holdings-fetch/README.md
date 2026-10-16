# 每週 Top 10 持倉

依 HANDOFF 2026-10-16 21:20 核准版本：每週對近七日已實現收益 Top 10 全部重抓，每錢包最多五個幣種；不沿用新面孔快取策略。

## 觸發與寫入

新增獨立 `holdings.yml`，監聽 `Leaderboard production` 完成。只有同 repo／main 的週一排程全量成功、`data.json` 來源日期為同一個台北週一、尚未發布該日持倉時才進入付費步驟。接在原本 08:00 全量發布之後，可避免兩個 cron 同時起跑而選到週日樣本；排程可能延遲，以來源時間為準。既有 workflow、cron 與 concurrency 不修改。

新流程使用獨立 `holdings-writer-main` concurrency、不取消執行中工作，不佔用原榜單 writer 的 pending 槽。先 fetch＋ff-only 同步，才選樣與抓取；發布前再次同步，若榜單來源或持倉檔已變動就停止。只提交 `holdings.json`；遇到無關 main 提交可有限次 rebase，絕不 force push。GITHUB_TOKEN 發布後明確要求 Pages rebuild。

手動 `probe` 只抓一個錢包、比對帳戶餘額並存 artifact；`publish` 抓全部十個。自動開關在新 workflow 內，待 probe／首次正式發布通過後才開。手動首次建檔以實際抓取日期顯示，不偽寫成週一。

## 成本與故障

- V2 `/wallet/v2/current-net-worth` 公布 30 CU／次；沒有付費自動重試，最多十次持倉請求。
- `/utils/v1/credits` 本身公布 **1 CU／次**。probe 用三次餘額讀取（先校準查詢費，再量測持倉），預計共 33 CU；十錢包正式 run 加前後兩次餘額讀取，預計 302 CU。這些不是 300 CU 以外免費的操作。
- 單次 probe 要能從帳戶差額扣除餘額查詢費後對到 30 CU；若差額不同或無法確認即停止，不自動接續全部錢包。十筆 run 的餘額差額超出界限也不發布。
- 保留既有 3,000 CU 底線，抓取前要求至少 3,300 CU。回應不完整、陳舊、幣種重複、估值不一致、來源變更或部分失敗，整批不發布，舊檔與日期保持原樣。
- 每週額外預算約為 302 CU，四週 1,208／五週 1,510；probe 是一次性額外驗證。其他服務同時消耗同帳戶 CU 可能影響餘額量測，差額不能冒充服務端逐請求計費明細。

## 資料與呈現

`holdings.json`：`updated_at` 為完成時間；每個 wallet 保存 `address`、API 真實來源時間 `snapshot_date`（含時區）、`tokens`；每項保存 `symbol`、`value_usd`、`pct`。最多五項、可少於五項；空持倉與資料缺失分開處理。比例以 API 的 `total_value` 為分母，不把 Top 5 重算成 100%；總值為零時比例為 null。

官方預設排除低流動性代幣；前端會標示覆蓋限制。點擊榜單地址後只讀同站靜態 JSON，沒有付費 API；顯示快照日期、幣種、美元估值、佔比條、指定免責。未收錄地址不稱為沒有資產；超過七天標示較早快照；404／格式錯誤提供重試，原本複製地址與 Solscan 查詢仍可用。

## 驗證與證據

`python -m unittest discover -s holdings-fetch -p 'test_*.py'`：選樣、真實分母、缺值、空持倉、過期時間、週一條件、重複執行防護、部分失敗及發布競態。

`node --test --test-isolation=none holdings.test.mjs`：前端批次驗證、XSS escaping、比例與空／缺／舊快照。

Actions artifact 保存十筆原始公開回應、原始選樣 `data.json`、正規化候選檔及 `report.json`（hash、選樣地址、來源提交、時間、請求次數、餘額差額）。Secret 只從 Actions 注入，不寫入檔案、log 或前端。

官方來源：[V2 portfolio](https://data.birdeye.so/docs/data-api/wallet-networth-pnl/get-wallet-v2-current-net-worth)、[CU 費用表](https://data.birdeye.so/docs/guides/what-is-compute-unit-cost)、[GitHub workflow_run](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run)。
