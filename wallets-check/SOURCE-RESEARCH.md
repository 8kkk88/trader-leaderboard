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

除 Rabby 的 CSR 候選頁外，監看目標為文章 HTML 或官方 Markdown。Binance / imToken 的文件可由搜尋閱讀確認主題，但此環境的直接請求受阻；其 SSR 正文 selector 還需要在 GitHub Actions 成功取得回應後驗證，不把搜索摘要當成快照。未使用第三方鏡像或繞過挑戰頁。

## 監看能回答的問題

這是「指定官方頁面的正文有沒有變」檢查，不是全面重新查證產品、不自動發現新活動、不保證官方各頁一致，也不證明舊活動仍有效。TokenPocket rewards 只涵蓋 TP Card 推薦獎勵；imToken rewards 只監看已審核的歷史 welcome bonus 頁（活動已結束）。頁面移到新 URL 需人工更新來源並重新建立基線。

## 本次研究另外發現、交由人工審核

以下不屬於「兩次快照之間的變動」，因此沒有塞進首次運行的空 queue，也沒有自動改 `wallets.json`。

- **Binance swap_fee：** 已審核資料仍寫「目前不收」。現行官方服務費 FAQ 列出依平台、代幣與交易條件區分的費率，包含部分 App 交易 0.5% 及 Web 情境 0.01% / 0.5%。應人工重新核對適用範圍，不能繼續將既有字樣理解為一律免費。[官方 FAQ](https://www.binance.com/en-AU/support/faq/detail/87cbb1ca0df34a348eaecb73c26167d7)
- **imToken swap_fee：** 現有顯示 0.30%，註明來自 Tokenlon litepaper。官方 FAQ 另區分穩定幣 0.04%、其他代幣 0.1%–0.3% 與折扣條件；需人工確認是否將單一值改成有條件的顯示。[官方 FAQ](https://support.token.im/hc/en-us/articles/360033758533-Tokenlon-Instant-Exchange-FAQ)
- **Trust swap_fee：** 現有資料已記錄官方頁面說法衝突。本次 `/swap` FAQ 與活動文件仍有不同適用敘述；免收活動只限符合條件的交易，不能用單一 FAQ 推論所有交易都免費。[Swap FAQ](https://trustwallet.com/swap)、[官方穩定幣活動](https://trustwallet.com/blog/campaigns/stablecoins-with-0-fees-on-trust-wallet)

此清單是資料維護提示，不是費率結論或投資建議。上線資料維持已審核版本，後續由 kk / Ren 確認再另行修改。
