# 鏈上交易員實力榜：本機預覽設計規範

本輪先建立 Sites 私密預覽；2026-10-13 使用者確認「可以了」後授權發布 GitHub main。沿用靜態 HTML / CSS / JavaScript，無建置流程、框架或執行時第三方請求。資料管線與排程維持原樣。

## 設計與資訊層級

一個方向：精緻深色數據終端。順序為精簡頂列 → 標題與快照狀態 → 單一核心對照 → 統一操作列 → 排行榜 → 分頁、口徑與免責聲明。排行榜為主角，不加入側邊欄、假走勢或交易功能。

- 標題「帳面獲利，落袋多少？」不再搭配重複口號。
- 核心觀察只顯示門檻統計，不再重複放大榜首金額；右側對照同期間、同一個總損益榜首的 `pnl` 與 `realized`。
- 期間與排序集中在同一列。桌面表頭可操作，手機沿用相同排序狀態。
- 另一種排名用「總損益排名 #…」或「已實現收益排名 #…」，不用漲跌箭頭。
- 地址按鈕打開原生 dialog，完整地址可選取、複製或開啟 Solscan。外部連結另外保留。
- 上游本期解讀原文保留在「資料口徑」內，並標示近零與真零的口徑限制。

## 參考的取捨

已實際開啟六個官方頁面，並保存瀏覽器渲染截圖。

- [Linear 2026 refresh](https://linear.app/now/behind-the-latest-design-refresh)：採用主次重量、控制位置一致及減少不必要邊線的原則。
- [Geist Colors](https://vercel.com/geist/colors)：將背景、元件狀態、邊框與文字分配固定角色。
- [Geist Table](https://vercel.com/geist/table)：使用語意表格、真正的表頭排序按鈕、右對齊數字與未知值「—」。
- [Geist Font](https://vercel.com/font)：Sans / Mono / 少量 Pixel 分工。
- [shadcn Dashboard](https://ui.shadcn.com/examples/dashboard)、[Data Table](https://ui.shadcn.com/docs/components/data-table)：參考完整狀態及分頁互動；沒有導入 React、TanStack 或其預設版面。

## 字體

| 用途 | 字體 / 備援 | 尺寸 |
| --- | --- | --- |
| 中文介面 | 系統 PingFang TC / Microsoft JhengHei / Noto Sans TC | 14px 正文，12–13px 次要資訊 |
| 拉丁字介面 | 本機 Geist Sans，系統 sans 備援 | 同上 |
| 金額、地址、排名、時間 | 本機 Geist Mono，系統 monospace 備援；tabular-nums | 表格 14px，主要數據 28–30px |
| 品牌少量識別 | Geist Pixel Square，僅頂列 SOL | 12–14px |
| 頁面標題 | Sans / 中文黑體，650 字重 | 桌面 34px，手機 28px |

文字保持可選取與可讀，沒有轉成圖片。必要資訊不使用 10px 字級。

字體自託管於 `assets/fonts/`，使用 `font-display: swap`，三個 woff2 合計 169,896 bytes。來源固定在 [Vercel 官方 commit 10dc7658](https://github.com/vercel/geist-font/tree/10dc7658f13c38a474cde201bb09a4617267545b)，未修改字體，附原始 `OFL.txt`。不連 Google Fonts，不安裝字體套件或框架。

## 色彩角色

| CSS token | 色值 | 角色 |
| --- | --- | --- |
| `--bg` | `#0A0E14` | 頁面 |
| `--surface` | `#10161F` | 對照區、表格、手機卡片 |
| `--surface-raised` | `#151D28` | 表頭、dialog |
| `--surface-hover` | `#1A2431` | hover 背景 |
| `--border` / `--border-soft` | `#263241` / `#1D2733` | 操作邊框 / 輕分隔 |
| `--text` | `#F2F5F8` | 主要文字 |
| `--secondary` | `#A5AFBD` | 一般數據、零值、未知值 |
| `--muted` | `#8995A5` | 範圍、另一種排名、輔助文字 |
| `--accent` | `#22FF88` | 品牌、選中控制、核心對照正值 |
| `--positive` | `#58D99B` | 目前排序損益欄位的正值 |
| `--negative` | `#FF7373` | 負損益、負比例 |
| `--warning` | `#E8B86A` | 條件標籤、資料更新失敗 |

一般成交量、交易次數與未選中的正損益採中性色；負值仍一致標紅。零不使用虧損紅，不以顏色判斷數值正負。前三名僅有很淡的列底色與排名字重，無獎牌或推薦意涵。

已量測七個文字色在一般最亮表面 `--surface-hover` 上的對比：深色最低為 `--muted` 5.35:1，明亮最低為 `--muted` 4.53:1。這是色彩角色檢查，並不等於完整 WCAG 認證。

### 明亮／深色主題

右上角太陽／月亮按鈕切換模式；`aria-pressed` 表達深色模式是否啟用。首次跟隨系統 `prefers-color-scheme`，手動選擇後保存於本機 `localStorage` 的 `trader-leaderboard-theme`。未手動選擇時持續跟隨系統變化；儲存被封鎖仍可在當次開啟期間切換。頁面繪製前先套用偏好，減少主題閃動。

| 角色 | 深色 | 明亮 |
| --- | --- | --- |
| 頁面 / surface / raised / hover | `#0A0E14` / `#10161F` / `#151D28` / `#1A2431` | `#F7F9FC` / `#FFFFFF` / `#F0F3F7` / `#E9EEF4` |
| 主文字 / 次文字 / 輔助 | `#F2F5F8` / `#A5AFBD` / `#8995A5` | `#17212F` / `#465365` / `#5F6D7E` |
| accent / 正值 / 負值 / 警示 | `#22FF88` / `#58D99B` / `#FF7373` / `#E8B86A` | `#087C43` / `#087647` / `#C13540` / `#82550C` |

明亮版採深綠字以維持對比，數字語意、排序、快照、焦點及資料均不因切換而改變。卡片、hover、active、警示、選單與 dialog 都共用主題 token；不是對整頁做反相濾鏡。

## 間距、版型與狀態

- 間距基準：4 / 8 / 12 / 16 / 24 / 32px；桌面容器最多 1440px，正常側距 40px，手機 16–20px。
- 頂列桌面約 64px；核心對照區桌面實測 168px；1440×900 首屏第五筆底部約 878.4px。
- 區塊圓角 12px，dialog 16px，按鈕 8px，條件標籤 4px。
- 超過 900px 使用表格；601–900px 使用雙欄卡片；600px 以下單欄卡片。
- 表頭在頁面頂部 sticky；頂列不固定，因此不會遮住表頭。
- 手機主要控制至少 44px；手機地址按鈕、外部入口與 dialog 控制也至少 44px 高。
- hover：低對比表面改變；active：同一狀態色階；選中：明確背景與文字；disabled：45% opacity 並停用；focus：2px 螢光綠外框、3px offset。
- 動態只有 150ms 背景／透明度變化。每次更新先取消舊動畫；減少動態效果時不啟動新動畫。沒有數字跑動、背景動畫或發光效果。
- 排序不重建表頭按鈕；期間按鈕、分頁 select 保持原 DOM。分頁不自動跳頂；末頁按鈕停用時，焦點交接給頁碼 select。
- 原生 dialog 支援 Escape、焦點限制及回到觸發按鈕。複製失敗會選取完整地址並給出手動複製提示。
- Loading 明確標示尚未載入；HTTP、逾時與格式錯誤有重試；重新讀取失敗保留前一份成功資料及時間，提示不隨切換期間／排序消失。

## 數據與衍生統計契約

所有統計均使用所選期間 `today` 或 `week`，從同一份成功讀取的 `data.json` 計算。未取得快照時不顯示假數值。

| 呈現 | 輸入與公式 | 樣本、邊界 |
| --- | --- | --- |
| 錢包數 | 所選陣列 `.length` | 不代表全鏈人數 |
| 已實現排名 | `realized` 下降，`pnl` 下降，地址 `localeCompare` 上升 | 同一批資料；有效數值排序與既有版本一致；前端收到缺值時置後 |
| 總損益排名 | `pnl` 下降，`realized` 下降，地址 `localeCompare` 上升 | 同上 |
| 另一種排名 | 在相同期間另一排序陣列的 index + 1 | 不是昨日／歷史名次 |
| 本期觀察 | `pnl` 排名中有有效 pnl 的前 `min(10, 有效筆數)`；計數 `abs(realized) < 1` | 缺 realized 不算近零，另顯示缺值數；門檻不是 `realized === 0` |
| 榜首對照 | 上述前段樣本第一筆的 `pnl`、`realized` | 同一錢包、同一期間，不混用兩個榜首 |
| 紙上富貴 | `abs(realized) < 1 && pnl > 100000` | 兩欄皆具有效數值；不推論是否賣出 |
| 落袋比例 | `realized / pnl * 100` | 兩欄有效且 `pnl > 0`；其餘「—」加原因；不 clamp、不用進度條 |
| 分頁 | 每頁 10 筆；總頁數 `ceil(length / 10)`；排名 = 起點 + 列序 + 1 | 空資料無分頁；狀態變更後檢查頁碼上下限 |
| 金額 | USD，常態四捨五入至整美元；非零且絕對值小於 1 使用小數 | 不改原始值；桌面 title 保留原始金額；core 長金額允許在千位分隔處換行 |
| 比例格式 | 常態小數一位；接近零或略高於 100 時最多六位，極小值可科學記號 | 不把微小正負值顯示成真零；不把略高於 100 顯示成恰好 100 |
| 快照時間 | `updated_at` → Intl，`Asia/Taipei` | 顯示秒數；不是本機重新讀取時間 |

`null`、未提供與不適用在前端顯示「—」。這只能處理前端實際收到的值；上游已轉成零的缺值無法從本檔還原，詳見 `data-quality-notes.md`。

## 檔案與預覽

- `index.html`：語意結構與原生 dialog。
- `styles.css`：可重用 token、元件狀態與 RWD。
- `app.js`：唯讀資料讀取、格式、排序、分頁、複製與錯誤狀態。
- 全部資產使用 `./` 相對路徑，支援 GitHub Pages 子目錄，不要求根網域路徑。
- `TEST-RESULTS.md` 記錄實測、快照 hash、截圖與尚未測試項目。這次僅發布獨立私密預覽，GitHub 正式站等待使用者確認。


## WOOFi / Crypto.com 本輪調整

已用瀏覽器實際查看 [WOOFi Stocks](https://woofi.com/stocks?rwa=0xca750ef65f295bbecd685abf54e82caf297bdb61) 與 [Crypto.com Prices](https://crypto.com/en/price)。參考前者的資料分區、選中狀態、錢包識別；參考後者的開放行情表格、膠囊操作與對齊。沒有複製來源品牌、行情數字、買賣功能或走勢圖。參考站部分手機內容／行情圖未能正常載入，僅採已看到的結構與元件。

- 深色的 surface / raised / hover 更新為 #171F2D / #1E293A / #253247，次文字 #B5C1D2、輔助 #9BA8BA、正值 #64DFAA、負值 #FF8993。明亮主題仍沿用前述色彩角色。
- 核心觀察用近零筆數／有效前段樣本數呈現，門檻說明始終可見，不硬寫 9/10。榜首比較仍為同筆資料，零保持中性色。
- 桌面使用開放式表格、期間底線與膠囊排序；手機已實現／總損益並排，比例、交易數、成交量次一層。
- 錢包圓形識別只取真實地址前兩字元，不代表身份、驗證或推薦。
- 新增本批地址搜尋，對 `address` 做去除前後空白後的不分大小寫子字串比對。搜尋不更改原資料、核心觀察樣本與兩種全批排名。頁碼顯示篩選後結果索引，但排名保留全批序號；切換期間保留搜尋字串，清除搜尋可恢復完整樣本。
- 本輪驗收與截圖位於 `../artifacts/trader-leaderboard-market-refresh/output/playwright/`。首次讀取後工作目錄曾有更新，另以 `before-latest/` 保留實際編輯前檔案。
- Sites 發布目錄與來源儲存庫獨立放在 `../artifacts/trader-leaderboard-sites-preview/`，僅包含靜態前端、公開快照與字體授權。未改動本 GitHub repo 的部署設定或來源管線。
