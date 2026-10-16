# 每週 Top 10 持倉

依 HANDOFF 2026-10-16 21:20 核准版本：每週對近七日已實現收益 Top 10 全部重抓，每錢包最多五個幣種；不沿用新面孔快取策略。

2026-10-16 首次正式發布已完成，十個地址與十份原始回應逐筆核對，公開 Pages 檔案 hash 一致。週一自動開關已啟用；下一次符合條件的是 10 月 19 日全量發布後。未來排程尚待實際到時執行，不把手動成功當成已驗收週一排程。

## 觸發與寫入

新增獨立 `holdings.yml`，監聽 `Leaderboard production` 完成。只有同 repo／main 的週一排程全量成功、`data.json` 來源日期為同一個台北週一、尚未發布該日持倉時才進入付費步驟。接在原本 08:00 全量發布之後，可避免兩個 cron 同時起跑而選到週日樣本；排程可能延遲，以來源時間為準。既有 workflow、cron 與 concurrency 不修改。

新流程使用獨立 `holdings-writer-main` concurrency、不取消執行中工作，不佔用原榜單 writer 的 pending 槽。先 fetch＋ff-only 同步，才選樣與抓取；發布前再次同步，若榜單來源或持倉檔已變動就停止。只提交 `holdings.json`；遇到無關 main 提交可有限次 rebase，絕不 force push。GITHUB_TOKEN 發布後明確要求 Pages rebuild。

手動 `probe` 只抓一個錢包、比對帳戶餘額並存 artifact；`publish` 抓全部十個。`audit` 用於已保存有效回應、但解析中止的 probe：指定同 repo／main 手動 probe run，重用其公開 JSON，只查一次剩餘 CU，不再抓持倉、不發布正式檔；來源、地址、原始檔與校準值不符就停止。自動開關在新 workflow 內，待 probe／首次正式發布通過後才開。手動首次建檔以實際抓取日期顯示，不偽寫成週一。

## 成本與故障

手動 `resume` 只用於同一批中斷發布：原始榜單與既有持倉必須完全未變、來源回應同日且未超過一小時、前次尚未完成餘額結算。先核對已保存回應與其 CU，再只抓缺少的地址；不沿用上週資料，也不會自動重試。修復解析問題時應優先用保存的原始回應。全部回應先保存，通過整批驗證才發布。

- V2 `/wallet/v2/current-net-worth` 公布 30 CU／次；沒有付費自動重試，最多十次持倉請求。
- `/utils/v1/credits` 本身公布 **1 CU／次**。probe 用三次餘額讀取（先校準查詢費，再量測持倉），預計共 33 CU；十錢包正式 run 加前後兩次餘額讀取，預計 302 CU。這些不是 300 CU 以外免費的操作。
- 單次 probe 要能從帳戶差額扣除餘額查詢費後對到 30 CU；若差額不同或無法確認即停止，不自動接續全部錢包。十筆 run 的餘額差額超出界限也不發布。
- 保留既有 3,000 CU 底線，抓取前要求至少 3,300 CU。回應不完整、陳舊、幣種重複、負值、排序不符、來源變更或部分失敗，整批不發布，舊檔與日期保持原樣。所有請求（包括餘額查詢）間隔至少兩秒，避免帳戶限速。
- 每週額外預算約為 302 CU，四週 1,208／五週 1,510；probe 是一次性額外驗證。其他服務同時消耗同帳戶 CU 可能影響餘額量測，差額不能冒充服務端逐請求計費明細。

## 資料與呈現

`holdings.json`：`updated_at` 為完成時間；每個 wallet 保存 `address`、API 真實來源時間 `snapshot_date`（含時區）、`tokens`；每項保存 `symbol`、`value_usd`、`pct`。最多五項、可少於五項；空持倉與資料缺失分開處理。比例以 API 的 `total_value` 為分母，不把 Top 5 重算成 100%；總值為零時比例為 null。實測來源的單幣估值與總值有微小差異，比例可略高於 100%；保留原值及實際比例、顯示差異說明，僅長條視覺上限為 100%。

官方預設排除低流動性代幣；前端會標示覆蓋限制。點擊榜單地址後只讀同站靜態 JSON，沒有付費 API；顯示快照日期、幣種、美元估值、佔比條、指定免責。未收錄地址不稱為沒有資產；超過七天標示較早快照；404／格式錯誤提供重試，原本複製地址與 Solscan 查詢仍可用。

## 驗證與證據

`python -m unittest discover -s holdings-fetch -p 'test_*.py'`：選樣、真實分母、缺值、空持倉、過期時間、週一條件、重複執行防護、部分失敗及發布競態。

`node --test --test-isolation=none holdings.test.mjs`：前端批次驗證、XSS escaping、比例與空／缺／舊快照。

Actions artifact 保存十筆原始公開回應、原始選樣 `data.json`、正規化候選檔及 `report.json`（hash、選樣地址、來源提交、時間、請求次數、餘額差額）。Secret 只從 Actions 注入，不寫入檔案、log 或前端。

官方來源：[V2 portfolio](https://data.birdeye.so/docs/data-api/wallet-networth-pnl/get-wallet-v2-current-net-worth)、[CU 費用表](https://data.birdeye.so/docs/guides/what-is-compute-unit-cost)、[GitHub workflow_run](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run)。

首次實測：[CU 核對](https://github.com/kkweb3345678/trader-leaderboard/actions/runs/38910270452) 從帳戶差額推算單次持倉 30 CU；[整批發布](https://github.com/kkweb3345678/trader-leaderboard/actions/runs/38910826367) commit `59827f5`，來源時間 2026-10-16 21:46:30–21:49:49 台北，完成時間 21:49:53。第二個地址是成功回應的零項目，存空陣列；其他地址實際 1–5 個幣種。所有比例均以來源總值計算。

初次調整遇到兩項真實回應差異（估值微差、空持倉 `items:null`）與一次請求間隔過短的 429，均已修復。保留成功回應後只補抓缺少的地址，正式十筆共 300 CU；加中斷前與補抓的三次餘額查詢為 303 CU。另一次性 probe／核對共 35 CU，本輪總計推算 338 CU（11 次成功持倉、8 次餘額查詢），最後讀到餘額 16,336 CU。正常之後每週一完整 run 為 302 CU。沒有聲稱查詢免費，也沒有隱藏中斷成本。
