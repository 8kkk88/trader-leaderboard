# 鏈上交易員實力榜

Solana 鏈上交易員排行榜，主打「已實現收益」視角——沒賣出都不算賺。

- 資料來源：Birdeye 公開 API（`/trader/gainers-losers`），每小時更新
- 頁面：`index.html`、`styles.css`、`app.js`（靜態網站，無建置依賴；明亮／深色模式，桌面表格、手機卡片）
- 預設按本批樣本的已實現收益排序，可切換總 PnL 排序；`abs(realized) < 1 && pnl > 100000` 標「紙上富貴」，不代表已驗證從未賣出
- 數據管線：`fetch.py` → `data.json` → `sync.sh` 每小時 commit+push（無變化跳過）
- 排程：`trader-leaderboard-sync.timer`（systemd，每小時）

本頁僅為數據整理與教學，不構成投資建議。
