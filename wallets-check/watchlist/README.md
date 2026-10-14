# 延伸錢包觀察清單

查證日：2026-10-14。這是正式比較表以外的研究清單，尚未完成全部比較維度的審核，也不是投資或安全性排名。

第一批新增 **7 個候選錢包、11 個可讀的官方來源**，只追蹤 Swap 費用及獎勵／優惠相關文字。共 14 個欄位位置，3 個尚未接入。原本 9 個錢包的比較資料與 17 個來源檢查維持獨立。

| 錢包 | 這次觀察什麼 | 待確認或適用限制 |
| --- | --- | --- |
| Backpack Wallet | [錢包條款的 Fees 段](https://support.backpack.exchange/legal/backpack-wallet/terms-and-conditions.md)、[VIP 的錢包 Swap 優惠列](https://wallet.backpack.exchange/vip) | 條款列一般 Swap 0.85%；VIP 頁另列連結交易所帳戶的優惠，不能當成所有使用者免費。VIP 來源只自動監看錢包費率列；資格、持倉／質押門檻須人工確認。交易所積分不直接標成錢包積分。 |
| Rainbow | [Swap 費用顯示方式](https://rainbow.me/support/app/bridge-and-swap-tokens)、[RNBW 質押回饋](https://rainbow.me/support/app/staking-rnbw) | Swap 說明未列統一固定百分比，不填猜測值。回饋是 RNBW 質押制度，附退出費條件；不沿用舊 Points 敘述，也不把回饋當免手續費。 |
| Zerion | [Swap／Bridge 費用](https://help.zerion.io/en/articles/4813752-understanding-fees-on-zerion)、[ZERO 關閉後 XP 規則](https://help.zerion.io/en/articles/15214295-what-happens-to-xp-and-levels-after-zer%CE%B8-network-shuts-down) | 客服費率頁列一般 0.67%、Premium 0.25%，但[現行 Premium 行銷頁](https://zerion.io/premium/)寫費用減半。正式納入比較前須釐清版本與適用條件；該行銷頁列為人工複核，不在這次自動來源中。XP 不等於空投承諾。 |
| Base app（原 Coinbase Wallet） | [官方推薦獎勵條款](https://base.app/official-referral-terms.html) | 受地區、資格及原生同鏈交易限制。[官方 Swap 費率頁](https://help.coinbase.com/en-au/wallet/getting-started/dex-swap)可由搜尋閱讀，但本機 requests 與系統 HTTPS 驗證皆失敗；先保留人工來源，不關閉 TLS 驗證、不把推薦條款的算例當實際費率。 |
| Uniswap Wallet | [Labs Interface + Wallet 費用](https://support.uniswap.org/hc/en-us/articles/20131678274957-What-are-Uniswap-Labs-fees)，使用同官網公開文章 API 讀取 | 官方說明介面費為 0，仍須區分 LP、協議、網路費。[UNI Rewards](https://support.uniswap.org/hc/en-us/articles/35506888223501-What-are-UNI-Rewards)屬流動性提供者活動，沒有據此填入錢包自有積分，rewards 保留 null。 |
| Jupiter Mobile | [原生 App Swap 費率](https://docs.jup.ag/user-docs/global/mobile/fees.md)、[Rewards Hub 說明](https://docs.jup.ag/user-docs/earn/rewards-hub/index.md) | App 原生 Swap、網頁、dApp 瀏覽器及其他產品費用要分開。Rewards Hub 是跨產品活動入口，各活動資格及領取方式獨立；只監看說明頁，不代表自動發現所有新活動。 |
| Slush | [Slush Card 推薦回饋預告](https://slush.app/card)中的推薦文字區塊 | 目前是候補／開發中的卡片產品，不能標成已開放或錢包自有積分；只監看推薦段，是否正式開放須人工確認。[一般交易費說明](https://support.slush.app/hc/en-us/articles/47281465160219-Does-Slush-have-transaction-fees)不等於明確的 Swap 抽成表，因此 swap_fee 保留 null。 |

## 如何持續觀察

沿用每小時第 7 分鐘的 GitHub Actions，正式比較來源檢查完成後接著執行此清單。首次只建基線；後續文字變動寫入獨立佇列。這裡的任何觀察都不會自動新增比較表列，也不會修改 `wallets.json`。

- [最新觀察狀態](check-log.json)：成功、失敗、未接入欄位及實際執行連結。
- [觀察清單待審佇列](review-queue.json)：只包含此清單的變動。
- [來源設定](sources.json)／[擷取規則](profiles.json)：所有來源均為官方；空值不假裝有資料。
- [正式比較表的獨立狀態](../check-log.json)／[正式資料待審佇列](../review-queue.json)。

`snapshots/` 保存每個有效來源的文字、hash 與規則指紋。改變監看區塊或 URL 須人工重新建立基線。動態 App 內的個人報價、會員資格、純圖片內容不在此次文字監看範圍；成功讀取代表來源可讀，不代表所有活動仍有效或費率已獲審核。

這份清單的費率觀察來自上列官方頁面；尚未作為正式比較表資料。下一步若要擴充比較表，須補齊鏈支援、金鑰管理、硬體錢包、開源／審計等其餘維度並審核。
