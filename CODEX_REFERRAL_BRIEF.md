# 返佣對照表頁面＋每日檢查 — Codex 執行指令書

## 0. 背景
- repo：`kkweb3345678/trader-leaderboard`（main 分支，GitHub Pages）
- 需求方 kk 已拍板：把 9 家交易所返佣對照表做成網站常駐頁面，並做每日變動檢查。
- 數字基準日：2026-10-15，只採官網公開頁。資料來源報告：`~/workspace/research_notes/exchange-referral-rebate-2026-20261015-0727/report.md`（Ren 已驗證，kk 已看過 OK）。

## 1. 要做的三件事
1. 新增頁面 `referral.html`（繁體中文），9 家交易所返佣對照表。
2. 新增資料檔 `referral.json`（頁面渲染用，數字與頁面一致）。
3. 新增每日檢查機制：`referral-sources.json`＋`check_referral.py`＋GitHub Actions workflow，每天檢查官網頁面有無變動，有變動寫入 review queue，不自動改數字。

## 2. 設計系統（與主站同一套，全站統一）
| 用途 | 值 |
|---|---|
| 背景 | `#FFFFFF` |
| 主文字（墨） | `#0F1B2E` |
| 強調色（寶藍） | `#1E5AD7`，hover `#1749B4` |
| 區塊淺灰底 | `#F4F6F9` |
| 邊框 | `#E2E8F1` |
| 次要文字 | `#5C6678` |
| 極淡文字 | `#9AA6BC` |

- Hero：eyebrow `交易所返佣 · 資料來源 官網公開頁`／H1 `你的手續費，一半進了誰的口袋？`／lede `9 家交易所推薦返佣比例，全部來自官網公開資訊，查不到就標待查證。`
- 表格：表頭淺灰底 sticky，行 hover `#FAFBFD`，td padding 19px 上下。
- 每個數字旁標來源連結（小字）；「待查證」用灰底 pill 標示，不要編數字。
- 頁尾小字：`基準日 2026-10-15 · 政策會變動，以各交易所官網為準 · 本頁不構成投資建議`
- 從 `index.html` 導覽列加一個連結指向 `referral.html`（文字：`返佣對照`）。

## 3. 內容規格（數字鐵律：照抄以下，不准改寫、不准腦補）
表格欄位：交易所／現貨返佣（推薦人可得）／合約返佣（推薦人可得）／等級制說明／備註

| 交易所 | 現貨返佣 | 合約返佣 | 等級制 | 備註 |
|---|---|---|---|---|
| Binance（幣安） | 20%～50% | 10%～50% | 有（現貨看季度交易量＋人數；合約看季度期貨交易量＋人數） | 未達標 20%；推薦人可分最高 20% 給好友作折扣；結算方式待查證 |
| OKX | 30%（Affiliate 預設） | 30%（與現貨相同） | 有（每月評估升級，級距表未公開） | 高級別門檻待查證 |
| Bybit | 20%（基礎；≥5 名合格 25%；≥100 名最高 30%） | 與現貨相同 | 有（依合格被推薦人數分級） | 按日結算 USDT 發放；365 天有效 |
| Bitget | 40%／45%／50%（LV1／LV2／LV3） | 40%／45%／50% | 有（月度評估：交易用戶數＋月交易量） | 佣金每日發放；標準推薦費率待查證 |
| MAX | 待查證 | 待查證 | 待查證 | 官網未找到現行推薦人返佣比例 |
| BitoPro | 20%（基礎；訂閱最高 30%） | 不適用（無合約產品） | 有（基礎單層；訂閱可選單層 30% 或雙層） | 每日結算 USDT，滿 10 USDT 可領 |
| MEXC | 40%（部分地區可達 50%） | 40%（部分地區可達 50%） | 有（三級，每兩個月評估） | 佣金每日分配；1080 天有效 |
| Ourbit | 50%（Affiliate） | 50%（與現貨相同） | 無公開級距（審核制） | 另加 sub-affiliate 收益 10%；一般用戶費率待查證 |
| Gate.io | 最高 40%（推薦人 30%＋好友 10%） | 最高 40% | 無（Affiliate 等級另計未公開） | 佣金期一年；Affiliate 高級別待查證 |

`referral.json` 結構：每家 `{ id, name, spot, futures, tiers, notes, sources: [urls], verified: true/false }`，verified=false 即顯示「待查證」。

## 4. 每日檢查機制（只偵測、不自動改數字）
- `referral-sources.json`：列出 §3 來源 URL（共 12 個，見研究報告 Sources 節），每項 `{ id, url, label }`。
- `check_referral.py`：每天抓取各 URL，比對內容 hash（如官方頁擋爬蟲則記錄「無法檢查」不報錯）；有變動 → append 到 `referral-review-queue.md`（日期＋哪家＋哪個 URL 變了＋diff 摘要），不動 `referral.json` 數字。
- workflow `.github/workflows/referral-check.yml`：cron `0 1 * * *`（UTC＝台北 09:00），用內建 `GITHUB_TOKEN` commit，只寫 `referral-review-queue.md`。參考現有 `leaderboard-snapshots.yml` 的寫法。
- 最終數字是否更新，由 kk 確認後你再手動改 `referral.json`＋`referral.html`。

## 5. 驗收標準
- [ ] `https://kkweb3345678.github.io/trader-leaderboard/referral.html` 可開，9 家數字與 §3 一字不差
- [ ] MAX 欄位顯示「待查證」pill，沒有編造數字
- [ ] 每個數字有來源連結小字；頁尾有基準日＋免責聲明
- [ ] `index.html` 導覽列有 `返佣對照` 連結
- [ ] workflow 檔存在且 cron 正確；手動 dispatch 一次能跑完並寫入（或確認無變動）review queue
- [ ] 全程繁體中文；手機版表格可橫滑不破版

## 6. 回報
- 完成後在 repo 根目錄 `HANDOFF.md` 留言：做了什麼、線上 URL、檢查 workflow 首次執行結果。
- 有問題直接寫在 `HANDOFF.md`，Ren 會來驗收。
