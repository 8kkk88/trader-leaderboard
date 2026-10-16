# 交易量榜與持倉：分階段交付

**最新狀態（2026-10-16）**：21:12 已核准 30 CU／錢包，21:20 再改為每週一十個全部更新，取代下方歷史的 15 CU 門檻與新面孔策略。首份十地址持倉已正式發布、公開檔案及手機介面驗收通過，週一流程已啟用；完整現行規格、實際成本及故障處理見 [holdings-fetch/README.md](holdings-fetch/README.md)。下方保留各階段文件確認紀錄，不代表目前仍暫停。

核對日期：2026-10-16。採用 HANDOFF **20:40 修訂**，取代 20:30 的 Phase 2；每週全鏈交易量抓取已取消。

## 已實作：今日與 7 天樣本交易量榜

完整榜單增加「已實現收益榜／交易量榜」。切到今日，依現有 `data.json.today.volume` 排序；切到近七日，依 `data.json.week.volume` 排序，標題顯示「7 天交易量榜」、口徑顯示「本批樣本 7 天交易量排序」。兩者均明示非全鏈排名、交易量不代表獲利。

沒有新增 API 抓取或 `volume.json`。沿用原始樣本、來源時間、金額精度；有效數值由大到小，缺值排末且顯示破折號，零值保留為零。同值以已實現收益、地址穩定排序。搜尋及篩選後仍保留全樣本名次；分享連結保留期間、交易量排序及條件。Hero 仍按已實現收益呈現冠軍。

本機瀏覽器 25 項通過：兩期間排序逐地址核對原 JSON、分頁、搜尋、條件、分享還原、總損益與已實現收益回切、錢包詳情、缺值／零值、375／768／1440px 深淺色與手機橫滑，無 JavaScript 錯誤、零 Birdeye API 請求。證據在工作區 `artifacts/volume-holdings/`。

## 待決：只抓新地址的持倉快照

官方目前公布的單次成本已超過交接保留的 **15 CU／錢包** 門檻，因此依「超過先回報不做」停止在文件確認；沒有進行付費呼叫、未測量帳戶實際扣額，也沒有啟用新排程或建立假資料檔。

| 官方端點 | 公布成本 | 狀態與適用性 |
| --- | --- | --- |
| `/v1/wallet/token_list` | 50 CU／次 | 文件標為 deprecated，不建議新增整合 |
| `/wallet/v2/current-net-worth` | 30 CU／次 | 支援依持倉價值排序、限制回傳筆數及整體 `total_value`，可作後續候選 |

來源：[V1 Wallet Portfolio](https://data.birdeye.so/docs/data-api/wallet-networth-pnl/get-v1-wallet-token-list)、[V2 Wallet Portfolio](https://data.birdeye.so/docs/data-api/wallet-networth-pnl/get-wallet-v2-current-net-worth)、[官方 CU 表](https://data.birdeye.so/docs/guides/what-is-compute-unit-cost)。舊 `docs.birdeye.so` 路徑已遷移；本次追到新官方文件並保留公開 Markdown 證據，沒有把 404 當作成本無法查。

若 kk 同意把持倉上限提高到 30 CU／次，建議先用 V2 單錢包、僅 artifact 的手動驗證確認權限、實際扣額與回傳內容，再啟用只抓新地址的策略。文件公開成本不能替代帳戶扣額實測。

- 初次沒有舊持倉可重用時，最多十個地址需要 **300 CU**；不能以之後每週兩至四個新面孔的假設估算首次費用。
- 假設之後每週真的只有兩至四個新地址，則 **60–120 CU／週**；四週為 240–480、五週為 300–600 CU。這是公式估算，不是已驗證的流動率或實際帳單，且不含重試／單次驗證。
- 沿用舊快照時，每個錢包必須保留自己的 `snapshot_at`，避免根層檔案更新時間誤導讀者以為所有持倉同時更新。快照是當時持倉，不能稱作目前持倉。
- 「新面孔」比對集合須保留歷史已收錄地址；若只保存本週 Top 10，離榜再回榜會被誤當成第一次抓取。也應記錄本週選樣時間與原始 `data.json` 版本，並分開處理失敗／缺值，不補零。
- 百分比應以同一次回應的整體 `total_value` 為分母，不能把 Top 5 重新縮放成 100%。V2 預設排除低流動性代幣，啟用時需標明 API 覆蓋與估值限制。

以上是待核准後的具體整合規格；本次未建立 `holdings.json`、未新增持倉 UI、未修改抓取程式、Secret、workflow、排程或 concurrency。

## 已取消方案的查核紀錄

20:30 原提案的 `/trader/gainers-losers`，官方 `sort_by` 僅列 `PnL`、`realized_pnl`、`unrealized_pnl`、`trader_score`，未列 `Volume`；有交易量篩選不代表支援以交易量選出全鏈前百。20:40 已改用現有近七日樣本，因此不用新增替代抓取。來源：[Gainers & Losers](https://data.birdeye.so/docs/data-api/wallet-networth-pnl/get-trader-gainers-losers)。

## 21:05 交接補查：V2 回傳逐幣種持倉

2026-10-16 21:08 台北重新讀取官方文件。結論：**V2 同時回傳總值與逐幣種清單，足以提供持倉分佈的基礎欄位；不需要為了取得逐幣種資料改用 V1。** 這是文件確認，沒有做付費回應實測。

官方 OpenAPI 的成功回應引用 `WalletCurrentNetWorthResponseSchema`，其中 `data.items[]` 引用 `WalletTokenHolding`。下列按 Solana 範例整理，僅列欄位、不放虛構持倉：

```text
success
data
  wallet_address
  currency
  total_value
  current_timestamp
  items[]
    address, name, symbol, network, logo_uri
    decimals, balance, amount
    price, value
pagination
  limit, offset, total
```

- `amount` 是可讀的代幣數量；`balance` 是未套小數位的原始餘額，不能把兩者當成同一數字。
- `price` 是價格，`value` 是該持倉的估值；`total_value` 是回應的整體總值，`current_timestamp` 是估值快照時間。Solana 範例的 `currency` 為 USD。
- **schema 沒有明列 `pct`／佔比欄位**。可在總值大於零、數值有效且口徑相同時自行計算 `pct = value / total_value × 100`。這是我們的衍生計算，不是 API 直接給的欄位；缺值或無效總值應顯示未知，不能補零，也不能把 Top 5 重新縮放成 100%。
- 共用 schema 也列有其他命名形式，例如 `uiAmount`、`priceUsd`、`valueUsd`；Solana 文件範例使用上列 `amount`／`price`／`value`。`total_value`、`value`、`balance` 可為字串或數字；之後驗證時應檢查實際形狀與精度，不能只看欄位名稱就假設永遠完整。
- 文件允許 `sort_by=value`、`sort_type=desc`、`limit=5`、`offset=0`，因此依文件可以單次取前五持倉；仍為 **30 CU／次**。預設低流動性排除規則會影響資料覆蓋，不能宣稱涵蓋所有資產。

來源：[V2 官方頁與 response schema](https://data.birdeye.so/docs/data-api/wallet-networth-pnl/get-wallet-v2-current-net-worth)、[同頁官方 Markdown／OpenAPI](https://data.birdeye.so/docs/data-api/wallet-networth-pnl/get-wallet-v2-current-net-worth.md)。[V1 官方頁](https://data.birdeye.so/docs/data-api/wallet-networth-pnl/get-v1-wallet-token-list) 也提供逐幣種資料，但公布成本為 50 CU／次且已標 deprecated，無須因為 V2 的端點名稱含 net-worth 就退回 V1。

本輪只讀公開文件，未呼叫 `public-api.birdeye.so`、未接觸 Secret、未修改前端或抓取流程。證據保存在工作區 `artifacts/volume-holdings/portfolio-v2-schema-review.md` 與 `response-schema-review.json`；持倉仍待 kk 決定成本門檻。
