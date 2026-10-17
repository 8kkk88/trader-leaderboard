# 2026-10-17 補充驗收

驗收時間：台北 15:27–15:42；起始版本 `d217413`。依 kk「請協助驗證到位」補驗，涵蓋首頁、排行榜、交易員對比、幣種交易、學習中心、錢包比較與返佣。正式發布結果另記於 HANDOFF.md。

## 發現與修正

| 問題 | 修正與證據 |
| --- | --- |
| 淺色灰字在淡灰背景僅 4.36:1 | 共用 muted 色改為 `#606d80`，對 `#f4f6f9` 為 4.85:1、白底為 5.25:1。深色另行檢查。 |
| 部分來源日期、統計註解及限制說明只有 10–11px | 本次涉及的首頁、幣種與返佣輔助文字提高到 12px；390px 深淺色重驗。沒有把品牌裝飾文字當成內文。 |
| 標記語意不完整 | 幣種統計的說明移入 dd；非獨立地標的補充區改為 group；具 aria-label 的一般 div 補 group。 |
| 未來日期可能被誤認為已涵蓋更新時段 | 主榜、Base、快榜拒絕超過目前時間一分鐘的來源日期；主榜另要求時區。共用時段判讀不把異常日期標為有效。舊快照、錯誤與重新讀取流程保留。 |

## 執行結果

- **70 項 Node 回歸**通過，含新增未來／無時區時間測試；直接引用資產的快取版本檢查通過。
- **54 項瀏覽器檢查**通過：鍵盤跳至內容、排序、錢包對話框、分頁方向鍵、Escape 焦點返回、兩錢包對比、幣種搜尋及返回、自訂欄位、篩選空結果、錯誤重試、較舊與未來回應保護等。
- **28 個 axe-core 4.10.3 基本畫面**：七頁 × 深淺色 × 桌面／390px。修正後未報 violations。另檢查兩個展開狀態，以及字級調整後六個手機畫面。採用 WCAG A/AA、2.1/2.2 AA 相關自動規則與 best-practice。
- **版面**：1665×941、390×844、320×844、768×1024、844×390。較窄與橫向畫面測四個主要入口，390px 測七頁；未見整頁水平溢出。表格本身可橫向捲動，手機主榜預設卡片。
- **人工補核**：鍵盤 focus ring、選取與展開狀態、對話框名稱與背景 inert、欄位設定 aria-controls 實際目標、自動工具無法計算的返佣漸層背景。返佣說明最亮背景組合的保守對比約 7.50:1。原生 modal 到尾端 Tab 可進瀏覽器 UI，下一次 Tab 返回對話框；未進入背景頁面控制。

## 數值與歷史

本次只取靜態公開檔、Git 歷史與既有 Actions artifact，未呼叫付費 API。

| 資料 | 已核對結果 |
| --- | --- |
| data.json | 來源 10/17 10:43:10；Solana 單日 100、近七日 100、Base 20；各批地址無重複。公開 bytes = Git = 已驗證候選。 |
| today-flash.json | 查閱時仍為 10/17 04:27:26；公開 bytes = Git。15:27 查到的 runs 尚無 14:00 時段新 run，頁面顯示等待該時段，不斷言排程停止。 |
| wallet-trades.json | 整理完成 10/17 10:44:17；選樣為本次全量，十地址均等於近七日樣本交易量前十。75 筆幣種明細、600 個欄位與十份已保存原始回應一致；本批 57 個合約，僅 SOL 為多錢包交易。 |
| holdings.json | 公開 bytes = Git，仍是 10/16 首份週持倉。沒有假裝跟每日榜單一起更新。 |
| snapshots/ | `node snapshot-archive/archive.mjs audit`：9／9 份完整快照通過原始提交、hash、資料與排名核對。最新來源 10/17 10:43:10；近 24 小時一份全量，符合每日制。盤中資料仍在 Git 歷史，未聲稱已進 snapshots/。 |
| 畫面 | 單日／近七日 × 已實現／總損益／交易量的六組前十名，完整地址及主要金額與獨立排序吻合；SOL 十錢包四項金額及合計與獨立 Decimal 加總吻合。 |

完整全量 [38995985108](https://github.com/kkweb3345678/trader-leaderboard/actions/runs/38995985108)、幣種跟隨更新 [38996041324](https://github.com/kkweb3345678/trader-leaderboard/actions/runs/38996041324)、快照封存 [38996032313](https://github.com/kkweb3345678/trader-leaderboard/actions/runs/38996032313) 均成功。快照截止時間是檔案內時間，並非 run 起跑時間。

## 驗收邊界

這次證明產品內資料傳遞、保存、排序與顯示一致；沒有逐筆重建鏈上所有 swap、價格或 Birdeye 的成本計算。全量 artifact 保存候選與驗證報告，未保存每一份原始 HTTP 回應；逐幣部分則已對到原始回應。

瀏覽器為本機 Chromium/IAB 的桌面及尺寸模擬；未操作實機 iOS Safari、Android TalkBack、NVDA／VoiceOver，也未將尺寸模擬宣稱為實際瀏覽器文字縮放或完整螢幕閱讀器驗收。自動掃描未報違規不等於全站 WCAG 認證。課程正文未重新逐篇審校。

可重現證據在同工作區的 `../artifacts/full-verification/`：`data-verification.json`、`snapshot-audit.json`、`expected-ranks.json`、`expected-tokens.json`、`ui-data-checks.json`、`browser-checks.json`、`axe-before.json`、`axe-after.json`、`axe-mobile.json`、`axe-expanded.json`、`readability-final.json`、`contrast-manual.json` 及截圖。測試用 axe、模擬錯誤與未來日期只由本機 QA server 提供，未寫入正式頁面或資料檔。
