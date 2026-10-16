# 首頁導讀與閱讀工具

2026-10-16，依 HANDOFF 20:10 的六項核准需求實作，延用既有品牌、深淺色、字體、導覽及手機橫滑表格。

- Hero 顯示指定定位句。新手引導依序連到今日三卡、實際關注按鈕與方法論，可略過或重看；不代替使用者關注錢包。
- 引導實際進入視窗才記住 `research-home-guide-v1=seen`。直接到其他研究路由不會消耗未看到的引導；儲存失敗會說明僅本次有效。
- 落袋試算器：`賣出價 × 數量 − 買入價 × 數量 − 自填費用`。分開顯示賣出收入、買入成本與淨損益，報價單位由使用者保持一致。不接錢包、不儲存或傳送輸入，也不宣稱代替完整交易／稅務核算。拒絕無效或超出安全數值範圍的輸入；輸入改變即清除過期結果。
- 五個術語可用中英文關鍵字搜尋；詞條正文預先寫入 HTML，關閉 JavaScript 仍可讀。
- 錢包／返佣的徽章呈現原本資料基準日，區別人工資料日期與來源排程檢查，不把每日檢查當成每天人工更新數字。
- 學習章節文末提供今日榜單入口，方法論提供學習中心入口。舊 hash 章節與十九篇靜態文章均涵蓋。

## 維護

`home-tools-data.js` 管理計算及詞條，`home-tools.js` 管理互動，`home-tools.css` 延用共用設計 token。`learning-bridge.js` 是動態閱讀器與 SEO 產生器共用的章末 CTA。

修改詞條或章末 CTA 後，執行 `node scripts/build-seo.mjs YYYY-MM-DD` 重建靜態詞典與文章；日期填真正修改日期。產生器保留 Google Search Console 的獨立驗證檔。

## 驗收

`node --test --test-isolation=none home-tools.test.mjs home.test.mjs learn.test.mjs seo.test.mjs additional-boards.test.mjs referral.test.mjs`：42 項通過。

本機瀏覽器 47 項通過，含 375／768／1440px 深淺色、首次／回訪／儲存失敗、鍵盤焦點、關注原功能、試算盈虧及錯誤清除、詞典空結果、雙向連結、原章節路由與無 JavaScript 閱讀。證據存於工作區 `artifacts/home-onboarding/`。批次 QA 攔截分析載入，不把測試當成正式 GA 流量。
