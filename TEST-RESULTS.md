# 本機預覽驗收結果

狀態：完成本機驗收並發布 Sites 私密預覽；2026-10-13 使用者確認「可以了」後授權提交 GitHub main。下列「未發布」紀錄為預覽驗收當時狀態；正式發布驗證另見文末。

## 固定驗收資料

- 改版前版本：工作目錄基線 `69f6709fd551cb20a5e84fc5902f5a448caff55d`。
- 固定快照：`2026-10-13T19:01:11+08:00`，`today` / `week` 各 100 筆。
- SHA-256：`27db619b7b83de6f5e96af316e8e8356185c139bc9809aa57aa1afc4b02088c8`。
- 前後截圖皆用同一份 data.json 副本；測試期間攔截資料請求回傳此副本，避免自動更新干擾。
- 已比對正式工作目錄 data.json 的 hash，沒有被修改。抓取、同步與排程檔案未改。

## 可操作入口

- 新版：<http://127.0.0.1:8780/>。
- 同快照前後對照：<http://127.0.0.1:8782/review.html>。
- 以上為本機伺服器，不是已發布網址。重新啟動網站預覽可在專案目錄執行 `python -m http.server 8780 --bind 127.0.0.1`。
- 對照頁位於 `../artifacts/trader-leaderboard-refinement/review.html`；在該 artifacts 目錄啟動同類伺服器、port 8782 即可重開。

## 已實測

使用已安裝的 Microsoft Edge / Chromium 無頭瀏覽器與本機 Playwright，沒有安裝框架或呼叫 Birdeye API。

| 尺寸 | 排版 | 整頁橫向溢出 | 結果 |
| --- | --- | --- | --- |
| 1440×900 | 桌面表格 | 無 | 第五筆完整資料底部 878.4px，達成首屏目標；核心區 168px |
| 1920×1080 | 桌面表格 | 無 | 相同容器最大寬與資訊層級 |
| 390×844 | 單欄手機卡片 | 無 | 地址、已實現優先、其餘數據完整 |
| 360×844 | 單欄窄螢幕卡片 | 無 | 控制項與核心比較可重排 |
| 768×1024 | 雙欄卡片 | 無 | 過渡版型正常 |
| 320×844（額外） | 單欄卡片 | 無 | 頂列與長內容可換行 |
| 1024×900（額外） | 桌面表格 | 無 | 欄位與表頭正常 |

功能驗收：

- 今日／近七日 × 已實現／總損益 × 全部分頁，核對 400 筆呈現（200 個來源錢包在兩種排序下各呈現一次）。排序地址序列逐一對照改版前版本，主排序與既有次排序一致。
- 核對金額、交易次數、成交量、排名、紙上富貴條件、另一種排名、Solscan 完整地址；手機卡片與桌面同筆資料一致。
- 本期觀察的門檻計數、同錢包同期間榜首對照、真實 `updated_at` 與 timestamp 避快取請求正常。
- 不存在比例進度條；真實超過 100% 的比例保留，高精度邊界未被四捨五入成恰好 100%。
- 非零且低於一美元的真實小額數值保留小數，不再把它們顯示成 $0。
- 鍵盤 Enter 操作表頭排序、期間切換，焦點留在原按鈕；`aria-sort` 隨欄位更新。
- 分頁維持讀者位置；末頁下一頁停用時焦點轉交頁碼 select，不掉到 body。
- 減少動態效果模式下無新動畫，舊淡入動畫會取消。
- 明亮／深色按鈕、鍵盤切換、偏好重載保存、首次跟隨系統及系統偏好變更均已實測；手動選擇後不會被系統設定覆蓋，切換不改變當前數據或排序。
- 兩種主題均檢查五個指定尺寸，無整頁橫向溢出；明亮版同樣通過 1440×900 首屏前五筆完整資料目標。
- 手機地址 dialog 可查看完整字串；實際寫入／讀取剪貼簿與完整地址一致；複製有成功回饋。Escape 關閉後焦點回到原地址按鈕。
- 資料口徑 dialog 可開啟，Escape 後焦點返回觸發按鈕。
- 首次 HTTP 503 顯示失敗與重試；重試後恢復。重新讀取失敗保留成功快照、原時間與資料；切換期間／排序不會隱藏失敗提示，重試成功才清除。
- 明確 fixture 測試 null、負值、超長值、空期間、上游文字 HTML 跳脫、剪貼簿不可用時選取地址與手動複製提示。
- 正常資料流程無 console error、無 JavaScript page error；刻意模擬的 HTTP 503 為預期網路失敗。
- 兩種主題的七個文字色彩角色在 surface-hover 上對比皆至少 4.5:1；深色最低 muted 為 5.35:1，明亮最低 muted 為 4.53:1。各比值記錄於 verification.json。
- 所有網站 runtime 請求僅至本機同來源 HTML / CSS / JS / 字體 / data.json，沒有第三方資產或付費 API 請求。

## 尚未測試／不能宣稱

- 尚未在實體 iPhone / Android、Safari、Firefox 或 macOS 驗收；手機檢查是 Chromium 的 viewport 渲染。
- 未做完整螢幕閱讀器、WCAG 稽核或 Lighthouse / 網路節流效能測試。
- 未呼叫付費 API、比對原始 Birdeye 回應或鏈上交易。因此不能宣稱已經區分「上游缺值被補零」與真零，也未量化來源資料準確性。
- 未確認伺服器實際排程、未發布正式站、未驗證本次正式部署。已用子目錄路由測試核對 HTML / CSS / JS / 字體 / data.json 的相對資產路徑。
- 未在跨來源 iframe 或作業系統阻擋剪貼簿的所有環境逐一測試；已驗證成功路徑與無 Clipboard API 的手動回退。

## 證據位置

皆位於 `../artifacts/trader-leaderboard-refinement/output/playwright/`：

- `before-{1440,1920,390,360,768}.png` 與 `after-{1440,1920,390,360,768}.png`：同資料、同尺寸前後對照。
- `after-light-{1440,1920,390,360,768}.png`、`after-light-mobile-card.png`、`after-light-address-dialog.png`：新版明亮模式實際渲染；原版只有深色模式。
- `after-mobile-card.png`、`after-address-dialog.png`、`after-mobile-full.png`：實際手機卡片與地址操作畫面。
- `before/data.json` / `before/index.html`：改版前快照副本；正式 data.json 不變。
- `verification.json`：完整驗收結果；`geometry.json`：最終截圖幾何量測。
- `capture-before.cjs`、`capture-after.cjs`、`verify.cjs`：本機瀏覽器驗證腳本。
- `fixtures/`：明確標示的合成測試資料，沒有用於成果截圖或正式 data.json。
- `reference-*.png`、`references.json`：六個官方參考的實際瀏覽器畫面及 HTTP 狀態。

資料公式、期間與邊界見 DESIGN.md；上游待處理問題見 data-quality-notes.md。


## 本輪行情介面驗收

證據移至 `../artifacts/trader-leaderboard-market-refresh/output/playwright/`，包括 verification.json、geometry.json、references.json 與深色／明亮五種尺寸截圖。比較基準為本輪編輯前實際工作目錄的 `before-latest/`，資料快照及 SHA-256 與上文相同。

- 全部分頁、兩種排序仍逐一核對 400 筆呈現，與編輯前順序一致。
- 地址搜尋：完整地址、無結果、清除、焦點回復、切換期間保留條件皆通過。
- 搜尋後保留全批排名，核心觀察不受篩選影響；清除後恢復十頁。
- 明亮／深色、複製、鍵盤焦點、空資料、失敗回退、相對子目錄資產皆通過。
- 1440×900 首屏第五筆底部 878.4px；桌面核心區 168px，390px 手機核心區約 305px。
- 深色文字角色最低對比 5.35:1，明亮最低 4.53:1。正常流程無 console / JavaScript 錯誤。
- 原始 data.json hash 未變，抓取、同步、systemd 檔與 GitHub HEAD 未改。
- 尚未測實體手機、Safari、完整螢幕閱讀器與原始付費 API 資料品質。私密 Sites 需以擁有者帳號登入；匿名瀏覽器不能代替擁有者驗證登入流程。

### 獨立預覽部署

- Sites 私人預覽部署成功：https://trader-leaderboard-review-01a1348a.auer-help.chatgpt.site
- 部署 ID：appgdep_6ace3004b3f08191a2f708590f3af5df；獨立原始碼 commit：f5c6c64bb24752e181fd24ade38e11cf5d7a354d。
- 390×844 匿名瀏覽器回應 401 並正確顯示「登入以瀏覽／使用 ChatGPT 繼續」；完整證據 cloud-verification.json / cloud-mobile.png。沒有代替擁有者驗證登入後的雲端互動。
- 預覽 payload 使用相同前端與固定 data.json，額外標示設計預覽；不包含資料管線、環境檔或任何密鑰。原 GitHub HEAD 仍為 69f6709fd551cb20a5e84fc5902f5a448caff55d，沒有 push 本輪改版。
- Windows 封裝環境補入已安裝的 Git Bash 路徑，並使用 TAR_OPTIONS=--force-local；沒有修改外掛腳本。

## 錢包研究室驗收（2026-10-13）

- 基線 main 493fcdc23fba405b462002a8b40e0b7a6f525be1；同一 data.json 快照與 SHA-256 未變，未執行 Birdeye API 或管線。
- `../artifacts/trader-leaderboard-research/output/playwright/verify-research.cjs` / `verification.json` 保存實測結果，非測試框架依賴。
- 今日／近七日 × 兩種排序 × 全部分頁：400 筆順序與原始數值獨立排序比對一致。
- 正收益、交易數與地址條件取交集，保留全批名次與核心觀察；負數、小數門檻、零結果及重設通過。
- 兩錢包上限、去重、選中狀態、選單焦點、原始值摘要、條件／對比分享還原通過。X 只驗證 intent 內容與網址，沒有送出貼文。
- 每週題使用完整 week 樣本，與排行榜條件獨立；草稿重載保留，分享不在網址帶出草稿。
- 重新讀取失敗保留研究快照與時間；Clipboard API 不可用時的手動複製 dialog 與焦點返回通過。
- 舊快照／未收錄地址連結、null、零、負值與空 week 的明確 fixture 通過，沒有把 fixture 寫入正式 data.json。
- 深色／明亮於 320、360、390、768、1440、1920px 各檢查一次，無整頁橫向溢出；平板篩選面板維持視窗內。1440×900 第五筆底部 881.4px。
- 正常流程無 JavaScript page error。尚未測實體手機、Safari、完整螢幕閱讀器、跨裝置草稿同步或站內多人留言。

## 產品分頁驗收（2026-10-13）

- 基線 main 09d5126881fe13b10db5b2e14b8ca182455dbbe2，資料快照與原始 SHA-256 未變。
- 實測腳本及報告：`../artifacts/trader-leaderboard-product/output/playwright/verify-product.cjs` / `verification.json`。
- 今日／近七日 × 兩種排序的 400 筆順序與獨立排序一致，每頁十筆；目前僅一個工作區可見。
- 跨頁選擇、條件及頁碼保留，上一頁／下一頁還原、主標焦點、獨立網址重新整理、舊錨點及未知頁回退均通過。
- 對比頁獨立期間、原始摘要複製與分享直接進入正確頁面通過；研究證據錢包在 today 排行榜狀態仍能正確開啟 week 地址 dialog。
- 本機草稿跨頁及重載保留，研究題直接送入對比頁，條件與研究樣本獨立。
- 四頁 × 七寬度（320、360、390、768、1024、1440、1920）× 明暗模式共 56 個版面，僅一個可見主導覽及 aria-current，均無整頁橫向溢出。平板篩選面板保持視窗內。
- 1440×900 / 1920×1080 首屏第五筆底部 886.2px，1024×900 為 889.8px。
- 更新失敗提示跨頁保留；首次無資料的對比頁可重試，資料說明頁仍可讀；手動複製回退、舊快照及空資料通過。
- 正常流程無 JavaScript page error；截圖依 dark/light、頁面與寬度命名。尚未測實體裝置、Safari、完整螢幕閱讀器或站內多人留言。
