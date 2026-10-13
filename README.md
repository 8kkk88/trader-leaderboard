# 鏈上交易員實力榜

Solana 鏈上交易員排行榜，主打「已實現收益」視角——沒賣出都不算賺。

- 資料來源：Birdeye 公開 API（`/trader/gainers-losers`），每小時更新
- 頁面：`index.html`（單檔，無依賴，GMGN 終端深色風）
- 預設按已實現收益排序，可切換總 PnL 排序；已實現為 0 的大額帳面獲利標「紙上富貴」
- 數據管線：`fetch.py` → `data.json` → `sync.sh` 每小時 commit+push（無變化跳過）
- 排程：`trader-leaderboard-sync.timer`（systemd，每小時）

本頁僅為數據整理與教學，不構成投資建議。
