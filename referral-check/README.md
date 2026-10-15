# 返佣來源檢查

GitHub Actions `referral-check.yml` 每日 UTC 01:00（台北 09:00）執行，也可手動 dispatch。
只使用內建 GITHUB_TOKEN；不需要 Birdeye 或代理金鑰。共用自己的 concurrency，避免同一待審清單雙寫。

`check_referral.py` 直接讀取 Ren 提供的 `referral-sources.json`。只對來源做一般 HTTPS GET，驗證 TLS，不繞過驗證頁、不登入。限制大小與逾時，拒絕跨網域重新導向。去除 script/style/導覽/頁尾，優先擷取 article/main 可見文字；不執行網頁腳本。

- 首次有效內文：建立基準，不宣稱費率變動。
- 內文 hash 相同：本次可取得的內文無變動。
- hash 變動：附原 URL、前後 hash、短差異片段，待 kk 確認。
- HTTP 封鎖、網路問題、登入／驗證或只有 JS 框架：記錄「無法檢查」，保留上一次成功基準；不得算成無變動。
- MAX 沒有可用來源，不在自動檢查覆蓋範圍。OKX DEX 只作參考，未用於 CEX 表格。

唯一允許寫入及 commit 的檔案是 `referral-review-queue.md`。檔尾 `referral-check-state:v1` HTML 註解保存 zlib + base64 編碼的 JSON（公開內文、來源 URL、hash、成功時間），讓全新 runner 仍有可靠基準，不依賴易過期 cache，也不新增第二個可寫檔案。它不是密鑰；原文可供人工核對，網頁內容不會被執行。若註解損毀或 hash 不符會停止，不靜默重設基準。每次檢查皆保留涵蓋率與歷史紀錄，人工可在紀錄旁寫審核結果。

發佈前先 fetch + merge --ff-only。發布只 stage 清單，若遠端清單變更則停止；其他檔案的同步更新可安全 rebase 後有限次重試。兩份榜單 JSON 與返佣資料皆做 hash 檢查並設為唯讀，發布不使用 force push。GitHub 自動提交不會觸發遞迴 workflow；本頁數字沒變，不需另外重建 Pages，待審紀錄直接連結 GitHub main。

本機離線驗證：

```sh
python -m unittest discover -s referral-check -p 'test_*.py'
node --test referral.test.mjs
```

實際來源會因地域、機器人規則或動態頁面而受阻。Actions 綠燈代表檢查與記錄成功，請同時看各來源結果；不代表所有來源可讀或數字重新審核通過。改數字須由 kk 確認後人工更新 `referral.json`，頁面會讀取同一份資料。
