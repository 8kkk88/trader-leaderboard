# 返佣來源檢查

GitHub Actions `referral-check.yml` 每日 UTC 01:00（台北 09:00）執行，也可手動 dispatch。
只使用內建 GITHUB_TOKEN；不需要 Birdeye 或代理金鑰。共用自己的 concurrency，避免同一待審清單雙寫。

`check_referral.py` 讀取 Ren 提供的 `referral-sources.json`。先對官方來源做一般 HTTPS GET；只有直接回傳 HTTP 403 或 202 才將公開 URL 交給 `https://r.jina.ai/<原URL>`，匿名讀取 Markdown。沒有 API key、Cookie、登入或付費設定；不傳其他資料。兩條路徑都驗證 TLS、限制大小與逾時、拒絕跨網域 HTTP 重新導向。直接擷取去除 script/style/導覽/頁尾，優先 article/main；不執行來源文字。

Jina 最多同時兩個請求，首次逾時 55 秒（直接抓取 18 秒）。若失敗，再用 `X-No-Cache: true` 重抓同一公開 URL **一次**，重試逾時 25 秒，沿用全部內容驗證。這可排除 Reader 快取了暫時性驗證頁的狀況；兩次仍失敗則記「無法檢查」，不中斷其他來源。清單、狀態及 artifact 保存第一次失敗原因與重試結果。Reader 的來源 URL 必須與原 URL 完全相同，格式、正文、標題或警告不合格就不建立基準。去除圖片識別碼；MEXC Learn 限定文章標題至 Market Opportunity 之前，排除即時行情與相關新聞；邊界消失則交人工確認。保留正文數字與文章發布／更新日期。

擷取版本分開紀錄：`direct-html-v2` 與 `jina-markdown-v2`。v2 將 Reader 的 ISO／UTC 發布時間轉為一致的 UTC 表示，避免快取與重新抓取只改時間格式就誤報；陌生格式仍保留原文。Jina 首次成功、版本更換或直接／代理互換皆建立新基準，不報政策變更；既有直接擷取基準延用。清單及 artifact 顯示取得方式、版本、直接 HTTP 狀態；壓縮狀態保存實際取得 URL 與最後成功的版本。失敗嘗試不覆寫成功基準的身分。

同站 HTTPS 轉址由既有 `SameSiteRedirect` 跟隨，`final_url` 納入基準身分判斷；網址搬家時不誤報政策變更。2026-10-15 已實測 MEXC blog 舊網址 301 → `/zh-hant/crypto-knowledge/mexc-referral-program-vs-binance-referral/` → 200，來源目錄與網頁來源連結同步改用 canonical URL。遇到存取問題，維護者依 AGENTS.md 先重試、核對免費替代擷取與轉址，再記錄排查結果；跨網域轉址仍需確認目的地後更新來源，不任意追到登入或無關網站。

Jina 是第三方轉換／快取服務，其可取得內容不等於官方即時重新驗證；來源仍連回官方 URL，不改原來源分級。帶有 Reader `Warning:` 的回覆不採作基準。服務規格見 [Jina Reader 官方文件](https://jina.ai/reader/)。

- 首次有效內文、來源位置或擷取規則版本變更：建立基準，不宣稱費率變動。閱讀時間／瀏覽計數屬展示雜訊，保留政策更新日期。
- 內文 hash 相同：本次可取得的內文無變動。
- hash 變動：附原 URL、前後 hash、短差異片段，待 kk 確認。
- HTTP 封鎖、網路問題、登入／驗證或只有 JS 框架：記錄「無法檢查」，保留上一次成功基準；不得算成無變動。
- MAX 沒有可用來源，不在自動檢查覆蓋範圍。OKX DEX 只作參考，未用於 CEX 表格。

唯一允許寫入及 commit 的檔案是 `referral-review-queue.md`。檔尾 `referral-check-state:v1` HTML 註解保存 zlib + base64 編碼的 JSON（公開內文、來源 URL、hash、成功時間），讓全新 runner 仍有可靠基準，不依賴易過期 cache，也不新增第二個可寫檔案。它不是密鑰；原文可供人工核對，網頁內容不會被執行。若註解損毀或 hash 不符會停止，不靜默重設基準。每次檢查皆保留涵蓋率與歷史紀錄，人工可在紀錄旁寫審核結果。

發佈前先 fetch + merge --ff-only。發布只 stage 清單，若遠端清單變更則停止；其他檔案的同步更新可安全 rebase 後有限次重試。兩份榜單 JSON 與返佣資料皆做 hash 檢查並設為唯讀，發布不使用 force push。本檢查 workflow 不設 push 觸發，不會自我遞迴；待審紀錄直接連結 GitHub main，不依賴 Pages 的快取更新。

本機離線驗證：

```sh
python -m unittest discover -s referral-check -p 'test_*.py'
node --test referral.test.mjs
```

實際來源會因地域、機器人規則或動態頁面而受阻。Actions 綠燈代表檢查與記錄成功，請同時看各來源結果；不代表所有來源可讀或數字重新審核通過。改數字須由 kk 確認後人工更新 `referral.json`，頁面會讀取同一份資料。
