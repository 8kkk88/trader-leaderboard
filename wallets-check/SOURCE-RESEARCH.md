# 官方來源查證與覆蓋限制

研究日期：2026-10-14。下表 URL 均為錢包官方網站／官方文件；最新 GitHub Actions 擷取結果以同目錄 `check-log.json` 為準；下表保留遷移前 Windows 手動驗收紀錄。`render` 與正文擷取設定放在 `source-profiles.json`，維持來源表的 URL 字串結構。

| 錢包 | rewards | swap_fee | 先前 Windows 腳本驗收 |
| --- | --- | --- | --- |
| MetaMask | [Rewards 參與方式](https://support.metamask.io/trade/metamask-rewards/how-to-participate-in-rewards/) | [Swap 指南](https://support.metamask.io/trade/swap/user-guide-swaps/) | 兩頁成功；改用現行 /trade/ 路徑，避免舊頁的 HTML 轉址殼 |
| Bitget | [Pioneer 活動](https://web3.bitget.com/en/blog/articles/pioneer-launch-campaign) | [Dynamic Swap fees](https://web3.bitget.com/en/blog/articles/dynamic-swap-fees) | 兩頁成功 |
| OKX | [Boost 說明](https://web3.okx.com/help/what-is-okx-boost) | [DEX 費率](https://web3.okx.com/dex-fees) | 兩頁成功 |
| Binance | [Alpha Points](https://www.binance.com/en/support/faq/detail/12e7f2e555704f9c8e852d1c1afb032a) | [服務費 FAQ](https://www.binance.com/en/support/faq/detail/87cbb1ca0df34a348eaecb73c26167d7) | 兩頁 HTTP 202 空回應，未建快照 |
| Phantom | [推薦計畫](https://help.phantom.com/articles/phantom-referral-program-guide-55653835150099) | [Swap 費用](https://help.phantom.com/articles/5985106844435) | 兩頁成功 |
| Rabby | null；[Points 候選頁](https://rabby.io/points) 是 CSR，未找到可靠官方文字替代頁 | [Rabby Swap](https://support.rabby.io/en/articles/14134156-how-to-use-rabby-swap) | 費率頁成功；獎勵欄不宣稱有覆蓋 |
| Trust | [Trust Premium Rewards](https://trustwallet.com/blog/company/trust-premium-rewards) | [Swap FAQ](https://trustwallet.com/swap) | 首次兩頁成功；第二次 swap 頁回傳 304，保留舊快照 |
| TokenPocket | [TP Card Commission Rewards](https://help.tokenpocket.pro/en/wallet-operation/tp-card/tp-card-commission-rewards.md) | [Transit Swap](https://help.tokenpocket.pro/en/wallet-operation/how-to-trade-on-dex/transit-swap-1.md) | 兩頁成功；使用官方 GitBook 提供的 Markdown 文字頁 |
| imToken | [Card Welcome Bonus 歷史頁](https://support.token.im/hc/en-us/articles/45163340698009-imToken-Card-30-Welcome-Bonus) | [Tokenlon FAQ](https://support.token.im/hc/en-us/articles/360033758533-Tokenlon-Instant-Exchange-FAQ) | 兩頁 HTTP 403，未建快照 |

除 Rabby 的 CSR 候選頁外，監看目標為文章 HTML、官方 Markdown 或官方文章 API。2026-10-14 後續修復已確認 Binance / imToken 原網頁仍分別回傳 202 / 403，但同一官方網域的公開 API 可回傳四篇原文。沒有將搜索摘要當成快照，也沒有使用第三方鏡像。

## Binance / imToken 讀取修復

- Binance 使用 `/bapi/composite/v1/public/cms/article/detail/query?articleCode=<原文章代碼>`，確認 `success`、成功代碼及 `data.code`，從正文 JSON 節點樹取得文字與表格。原文連結和文章代碼完全相同，並非換成主題相近的新文章。此公開 CMS 介面仍可能改版，未知格式會算失敗，不會建立空快照。
- imToken 使用 `/api/v2/help_center/en-us/articles/<原文章 ID>.json`，這是 [Zendesk 官方提供的公開文章介面](https://developer.zendesk.com/api-reference/help_center/help-center-api/articles/#show-article)。確認 ID、語言、原文 URL、非草稿，擷取標題和 HTML 正文；不跟隨回應內的其他 URL。
- 四篇 API 均實測 HTTP 200、有完整正文，不需要憑證；檢查器仍只有 requests 外部依賴。API 端點保存在 `source-profiles.json`，公開佇列保留原始文章連結。Actions 實跑結果見 `check-log.json` 與 [ACCEPTANCE.md](ACCEPTANCE.md)。
- 仍只監看文字與表格，不含純圖片內的規則；Binance 部分 Alpha Points 示意圖須人工閱讀。imToken rewards 仍是同一歷史活動頁，成功讀取不代表活動仍有效。

Actions 初次實跑為成功 12 / 17，原 Trust `/swap` 頁再次回傳 304。已找到可直接取得 HTTP 200 的[官方 Trust Wallet / MetaMask 比較表](https://trustwallet.com/compare/trust-wallet-vs-metamask)，因此將 Trust swap_fee 來源換到此頁，只擷取 `Swap Fee` 整列，排除支援鏈、安全宣傳等其他維度。該列同時包含參照錢包的費率，告警需人工辨識是哪一欄變動；它不涵蓋各項免收活動或完整適用條件。比較頁本身的數字仍不由哨兵自動修改。

## 監看能回答的問題

這是「指定官方頁面的正文有沒有變」檢查，不是全面重新查證產品、不自動發現新活動、不保證官方各頁一致，也不證明舊活動仍有效。TokenPocket rewards 只涵蓋 TP Card 推薦獎勵；imToken rewards 只監看已審核的歷史 welcome bonus 頁（活動已結束）。頁面移到新 URL 需人工更新來源並重新建立基線。

## 本次研究另外發現、交由人工審核

以下不屬於「兩次快照之間的變動」，因此沒有塞進首次運行的空 queue，也沒有自動改 `wallets.json`。

- **Binance swap_fee：** 已審核資料仍寫「目前不收」。現行官方服務費 FAQ 列出依平台、代幣與交易條件區分的費率，包含部分 App 交易 0.5% 及 Web 情境 0.01% / 0.5%。應人工重新核對適用範圍，不能繼續將既有字樣理解為一律免費。[官方 FAQ](https://www.binance.com/en-AU/support/faq/detail/87cbb1ca0df34a348eaecb73c26167d7)
- **imToken swap_fee：** 現有顯示 0.30%，註明來自 Tokenlon litepaper。官方 FAQ 另區分穩定幣 0.04%、其他代幣 0.1%–0.3% 與折扣條件；需人工確認是否將單一值改成有條件的顯示。[官方 FAQ](https://support.token.im/hc/en-us/articles/360033758533-Tokenlon-Instant-Exchange-FAQ)
- **Trust swap_fee：** 現有資料已記錄官方頁面說法衝突。本次 `/swap` FAQ 與活動文件仍有不同適用敘述；免收活動只限符合條件的交易，不能用單一 FAQ 推論所有交易都免費。[Swap FAQ](https://trustwallet.com/swap)、[官方穩定幣活動](https://trustwallet.com/blog/campaigns/stablecoins-with-0-fees-on-trust-wallet)

此清單是資料維護提示，不是費率結論或投資建議。上線資料維持已審核版本，後續由 kk / Ren 確認再另行修改。
