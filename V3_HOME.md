# v3 首頁交付

依 `CODEX_V3_BRIEF.md` 與 `v3-demo.html` 實作；延續正式站「落袋研究室」品牌、字體、深淺色及共用導覽。

## 結構與資料

- Hero → 今日三卡 → 自訂首頁 → 追蹤動態 → 方法論 → 完整榜單 → 原有頁尾。導覽包含四個首頁錨點與錢包／返佣／學習中心，研究工具收在更多選單；平板更多選單也可到達所有錨點。
- Hero 與今日之星使用 `data.json.today` 的已實現收益排序榜首，次排序沿用總損益、地址。原檔是總損益順序，故不直接取 `today[0]`。顯示來源時間、完整精度至美分，缺值不補零。
- `app.js` 只增加成功載入及錯誤狀態的唯讀事件，既有排序／篩選／分頁／對比函式未改。`home.js` 是獨立顯示層；首頁今日數字不受下方今日／近週控制影響。
- `snapshot-index.json` 由現有 GitHub Pages Jekyll build 依 `site.static_files` 列出已發布封存檔；沒有新增 workflow、寫入者或資料欄位。索引不能解析時，退回匿名 GitHub Contents API 的同 repo `snapshots/` 清單，再讀同站快照；限流、逾時或資料錯誤會降級，不植入 key。
- 使用不晚於主榜來源時間的最近完整快照（today／week 各有完整前百樣本）。排名變化只比較兩份共有的地址；新上榜為最新樣本與前次樣本的集合差，不宣稱歷史首次上榜。來源時間與原始快照連結公開顯示。
- 關注差額是「最新今日 realized − 前次今日 realized」，不是交易事件。新進／缺漏／缺值地址不推算差額、不補零。頁面明示期間視窗可能移動，差額不等於新增獲利或單筆賣出。
- 7 日模組本輪不繪線；用實際有效封存的不同台北資料日計數。同日重跑不增加天數，不把日曆缺口當成觀測。達標後仍顯示功能準備中，待 Phase 2 指示。
- 未呈現連續上榜天數，避免把不連續歷史誤認連續觀測。錢包／返佣摘要使用無數字介紹，不把打樣的「最高 50%」當成當前資料或推薦。

## 本機偏好

`lab_home_modules` 預設 `{board:true,trend:true,wallet:false,rebate:false}`；`lab_follow` 是 Solana 地址陣列。重整保存、跨分頁 storage 同步、無效 JSON 回預設；儲存失敗時本次操作仍有效並顯示提示。所有關注按鈕同步 aria-pressed；取消關注後保留可用焦點。未建立後端帳號或追蹤服務。

## 驗證

`node --test --test-isolation=none home.test.mjs additional-boards.test.mjs learn.test.mjs referral.test.mjs`：31 項通過。

涵蓋真實快照的獨立排名／集合差驗算、同分排序、缺值、空／不足快照、非完整樣本、同時間版本不重算、未來快照與不安全路徑排除、關注差額、毀損偏好，以及既有學習／返佣／附加榜單回歸。

瀏覽器驗證：390px 淺／深色無頁面橫溢、三卡橫滑與左右按鈕、模組即時切換及重整保存、關注同步及新進／共有地址動態、768px 更多導覽與學習中心跳轉、桌面交易員對比。既有條件篩選、地址搜尋、損益排序、分頁、今日／近週切換、快榜／Base 展開和排序均可用。原始主榜資料、快榜、錢包／返佣數字與所有 workflow／抓取／排程保持原樣。

索引使用 Jekyll 官方支援的 [static_files](https://jekyllrb.com/docs/static-files/) 與 [front matter](https://jekyllrb.com/docs/front-matter/)，線上發布後核對實際 JSON 及資料渲染。
