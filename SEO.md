# GA4 與搜尋入口

依 HANDOFF.md 2026-10-16 19:45 的核准實作。正式站根網址為 https://kkweb3345678.github.io/trader-leaderboard/ 。

## 瀏覽統計與隱私

- 每個根目錄 HTML 頁的 head 引用共用 `analytics.js`，正式網域及專案路徑才載入 Google tag。評估 ID `G-QRGMXDPV7V` 是公開設定，不是金鑰。
- 每份文件只初始化一次，使用 Google 預設 page_view；未額外送手動重複 page_view。統計頁面網址採 canonical，移除來源網址的 query/hash；Google signals 與廣告個人化訊號關閉，沒有 User-ID 或自行上傳表單內容的事件。
- GA 資源後台的增強型評估設定未在本輪更動或驗證。隱私頁如實說明 Cookie／瀏覽器識別碼，不承諾完全沒有識別資料。全站 footer 可前往 `privacy.html`。
- 批次瀏覽器測試攔截 Google tag，以免大量 QA 瀏覽混入統計。發布後另做一次獨立傳送檢查；即時報表是否顯示仍需 kk 實際開站並登入 GA 驗收，不能把前端載入成功當成報表驗收。

## 可索引頁面

- `sitemap.xml` 列出 24 個 canonical：首頁、錢包、返佣、學習目錄、隱私頁與 19 篇文章。日期為本次實際更新日 2026-10-16。
- 舊 `learn.html#lesson/…` 連結繼續可用；新增 `learn-<id>.html` 真實章節網址，HTML 已包含完整正文、來源、插圖與上下篇連結，關閉 JavaScript 仍可閱讀。互動版保留搜尋、學習路徑、練習與本機進度。
- 每頁獨立 title／description、絕對 canonical、zh-TW alternate、OG／Twitter 品牌圖。首頁有 WebSite／Organization，學習目錄有 Course，文章頁有 Article 結構化資料。
- `404.html` 與 `v3-demo.html` 設為 noindex，不列入 sitemap。GitHub Pages 可使用自訂 404；以不存在的正式網址驗證 HTTP 404，不能只檢查直接打開 404.html 的結果。

## GitHub Project Pages 的 robots 限制

本 repo 提供的檔案位於 `/trader-leaderboard/robots.txt`，內容為 Allow: / 與 sitemap 絕對網址。然而爬蟲規範讀取的是網域根目錄 `/robots.txt`，子目錄檔案不能管理整個網域。本次沒有修改其他 repo 或網域設定；不能宣稱這份專案內檔案已成為全網域 robots 規則。

若要正式宣告 sitemap，可由擁有者在 Search Console 提交本次 sitemap，或在管理 `kkweb3345678.github.io` 根目錄的 repo 放置 robots.txt。搜尋引擎是否收錄、X 是否重抓卡片不由本站部署成功保證。

## 維護與驗證

章節內容的唯一編輯來源仍是 `learn-content.json`；更新內容後使用實際更新日期重新產生：

```sh
node scripts/build-seo.mjs 2026-10-16
node --test --test-isolation=none seo.test.mjs learn.test.mjs
```

不要只修改產生的 `learn-*.html`。產生器會同步核心頁 metadata、完整文章、sitemap、robots 與 404。若只改某一頁而要保留其他頁原本的 lastmod，應先調整產生器以維護各頁日期，不要把未修改頁面日期固定刷新為執行日。

本機 85 項瀏覽器檢查通過，涵蓋 24 頁手機版、19 篇無 JavaScript 閱讀、舊連結、新章節與錨點、進度保存、練習、深淺色及 404。紀錄在工作區 `artifacts/referral/local-seo-checks.json`；線上紀錄另存 `live-seo-checks.json`。

參考官方文件：[GA page_view](https://developers.google.com/analytics/devguides/collection/ga4/views)、[Sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)、[JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)、[robots.txt 根目錄規則](https://developers.google.com/crawling/docs/robots-txt/create-robots-txt)。
