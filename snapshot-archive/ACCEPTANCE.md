# 快照封存驗收紀錄

## 首次執行：2026-10-15 12:18 台北時間

- 功能提交：`9e044a2`；實際快照由 Actions 提交：`185f598`。
- [首次 Actions run 38680757626](https://github.com/kkweb3345678/trader-leaderboard/actions/runs/38680757626)：success。
- 9 項測試通過；逐份還原與原始 Git 資料、來源 hash、今日／近週兩種排名一致。
- `data.json: OK`，SHA 檢查通過。相對部署前 `b6eb05a`，`data.json`、`app.js`、`index.html`、`fetch.py`、`sync.sh` 均沒有改動。
- 公開 Pages 的 `data.json`、`app.js`、`index.html` 與 Git 版本逐 byte 相同；線上資料時間為 2026-10-15 12:14:35 台北，今日／近週各 100 筆。封存後 [Pages run 38680772646](https://github.com/kkweb3345678/trader-leaderboard/actions/runs/38680772646) 成功。
- 首次保存 5 份，其中 4 份是 10 月 13 日的歷史提交補存，1 份是 10 月 15 日資料。**這不是連續 24 小時驗收通過。**

| 資料 UTC 時間 | 台北時間 | 今日／近週筆數 | 檔案 |
|---|---|---:|---|
| 2026-10-13 09:48:48 | 10-13 17:48:48 | 10／10 | [2aa4dcdc5c29](../snapshots/2026-10-13T09-48-48Z--2aa4dcdc5c29.json) |
| 2026-10-13 10:23:59 | 10-13 18:23:59 | 100／100 | [40c3668c6d34](../snapshots/2026-10-13T10-23-59Z--40c3668c6d34.json) |
| 2026-10-13 10:31:12 | 10-13 18:31:12 | 100／100 | [0b8789fc9dbf](../snapshots/2026-10-13T10-31-12Z--0b8789fc9dbf.json) |
| 2026-10-13 11:01:11 | 10-13 19:01:11 | 100／100 | [ee8e5be53022](../snapshots/2026-10-13T11-01-11Z--ee8e5be53022.json) |
| 2026-10-15 04:14:35 | 10-15 12:14:35 | 100／100 | [dac1f312cd86](../snapshots/2026-10-15T04-14-35Z--dac1f312cd86.json) |

## 前十名還原範例

來源：`b6eb05ad36779788389aa8ca4e5b90a475a745cc:data.json`；資料時間 2026-10-15 12:14:35 台北。今日榜、已實現收益排序、未篩選樣本。金額單位沿用原始資料 USD。

| 排名 | 地址 | 已實現 | 未實現 |
|---:|---|---:|---:|
| 1 | 2w3nD9VdShyo1zTuoajtgQKKSRMQNPSHxHPwDwfB5Q3c | 81495.58 | -17212.58 |
| 2 | 4iSxGgbwJh5mTNsXcLpG9rbGTcEa1W1ep91ochZePJuC | 32998.24 | 1165282.70 |
| 3 | Ah56VHVZXa18CZqpf9FqBzAqWpvThr6c4DDigSqXeMiy | 16421.38 | 0.08 |
| 4 | swB1XWFkoyoquVgJdPkvh5h5GwrJBVjM7oT1aDXf6ap | 15535.81 | 0 |
| 5 | GaczQbqutMDf4pHtouaiGUQ1Qzi5VHrBm9VsRYtX5arW | 14295.36 | 0 |
| 6 | 4U5pCf21C67LobTLzCArGycygjStVFNNuj6amJxiPqct | 13826.60 | 0 |
| 7 | DvWUuM3jpRTrmi9MG2DJbu4EBkqEQSHA2eq1L6mPJTmt | 13282.60 | 0 |
| 8 | 5zkfv5UAwRG88ECGchbNwqsC7QEta2AeyzUFP61QgJUL | 13042.92 | 0 |
| 9 | 2TNocZKSXZT4WTj26PBecw7eYRwPg3QNrVojkWRDbvUS | 12964.94 | 0 |
| 10 | BpqQ3PanHiLJYe7ZLTVi3HaJgRYUNzeYbs5QkZ2gKwfg | 11757.63 | 0 |

## 24 小時驗收：待累積

已在原對話安排隔日驗收，約 2026-10-16 中午（台北）。屆時交付實際清單、不同來源時間數量、缺口與前十名還原結果；若來源不足約 48 次更新，會如實記錄，不能以歷史補存或複製舊榜單湊數。
