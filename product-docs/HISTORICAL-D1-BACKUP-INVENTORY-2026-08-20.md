# v2-test 歷史 D1 備份完整性盤點

盤點日期：2026-08-20（Asia/Taipei）

## 範圍與方法

- 盤點位置：`eca1`、正式 project、`4d94`、`6b9b`、`bb11` 的 `backups/*.sql`。
- 每份檔案以 SHA-256 比對實際內容；同名不代表相同內容，不同檔名也可能是相同快照。
- 本次只有讀取、計算大小及雜湊；沒有移動、複製、刪除或修改任何 SQL。

## 總覽

| 位置 | SQL 數量 | 不同內容快照 | 總 bytes | 僅此處單一實體副本 |
|---|---:|---:|---:|---:|
| `eca1` | 34 | 22 | 9,979,810 | 10 |
| 正式 project | 6 | 5 | 1,451,340 | 0 |
| `4d94` | 20 | 11 | 4,772,886 | 2 |
| `6b9b` | 9 | 6 | 2,067,424 | 1 |
| `bb11` | 32 | 23 | 7,746,887 | 11 |
| **合計** | **101** | **48（跨位置去重後）** | **26,018,347** | **24** |

> 總 bytes 應以各列為準；同一內容在不同位置的實體副本仍各自計入容量。

## 舊 worktree 中只有單一實體副本的快照

以下 14 份內容在本次五個盤點位置中沒有第二份相同 SHA-256，尚未集中保存前不得刪除所屬 worktree。

| 位置 | 檔名 | bytes | SHA-256 |
|---|---|---:|---|
| `4d94` | `v2-test-d1-20260812-before-clickable-platform-summary-pages-deploy.sql` | 246,219 | `38d152b44f2deb741fe685b5f1aa383a09181d737c48597d26d770f9c2654fea` |
| `4d94` | `v2-test-d1-20260812-before-stop-cooperation-acceptance-test.sql` | 245,663 | `f7c4685f8543dd1f750253c2f87b71a8370739ca9cc03026ee526b67d46f2e8e` |
| `6b9b` | `v2-test-d1-20260809-before-standard-question-bank-hide-pages-deploy.sql` | 232,741 | `1bd018c0e3bdb5cf73dcaa09ce2e65b44f21dbc0a2c1f744f92ab360204b55ff` |
| `bb11` | `v2-test-d1-20260810-before-approved-booking-deposit-repair.sql` | 237,587 | `f29a7a820059c9db8924fa288820eccb5df05992f29456eb46f8bce3207575b8` |
| `bb11` | `v2-test-d1-20260810-before-owner-manual-review-actions-pages-deploy.sql` | 235,250 | `ec3e38ad172d9f2cffce920e5798579b3f5fdf67b73444ec5b4372eee0921103` |
| `bb11` | `v2-test-d1-20260810-before-photo-cors-worker-deploy.sql` | 234,465 | `2eec1297994cbc711ce0a0dd6f036c3516174c11d1ddee6ccc74e8036ae8e530` |
| `bb11` | `v2-test-d1-20260810-before-supplement-photo-repair.sql` | 235,421 | `49737e7ede4291c9c024941385ee111876c3821cf9baee78170d520427665847` |
| `bb11` | `v2-test-d1-20260816-before-custom-dialog-pages-deploy.sql` | 255,470 | `39210d8e05cb89de603a67ae346caf3224b3a5a3b77a522981adaa5ba3d7f6a7` |
| `bb11` | `v2-test-d1-20260816-before-immediate-customer-notification-worker-deploy.sql` | 256,771 | `8e161fc7bb1e409cc379f65c9838e2680936880a97b779808c25de883cebf8ba` |
| `bb11` | `v2-test-d1-20260816-before-line-recipient-provider-fix-worker-deploy.sql` | 255,470 | `f691d9b687ed616941917d4cab04f2be064eb753e946ae569cff8625b4a549e5` |
| `bb11` | `v2-test-d1-20260816-before-multi-oa-notification-worker-deploy.sql` | 247,386 | `ff4529f5ac652d2d6202a56d175b7776f3c109993fe5c82dcac8c241515cc2a3` |
| `bb11` | `v2-test-d1-20260816-before-owner-assessment-slot-pages-deploy.sql` | 259,564 | `783b1288c08a9700e13c9e8f1bc5233a516d8917c7c64b50b43135ebb678c723` |
| `bb11` | `v2-test-d1-20260816-before-pre-service-reminder-worker-pages-deploy.sql` | 259,020 | `5fdc6d2d821eb5fa51c194aca44a4ca4a5ee3a98eb55ddc94267655a3da10147` |
| `bb11` | `v2-test-d1-20260816-before-standard-nail-oa-token-worker-repair.sql` | 272,334 | `71656a7eb3e4299f48b770e1d82bc5364c7bf24a1f03a02d8d34f21aa07c300d` |

## 結論與下一步

- 盤點當下，`4d94`、`6b9b`、`bb11` 都仍含單一實體副本，因此當時不可移除其 worktree。
- `eca1` 自身另有 10 個只有單一實體副本的較新快照，因此 `eca1/backups` 也不可清理。
- 正式 project 的 6 份備份均至少另有一份相同內容；但正式 project 仍是固定 Wrangler 與系統依賴，不因備份重複而可刪除。

## 集中保存完成（2026-08-20）

- 使用者指示進入下一步後，已將上述 14 份舊 worktree 單一快照複製到 `backups/historical-unique/`，並依 `4d94`、`6b9b`、`bb11` 保存來源分類。
- 複製總量：14 份、3,473,361 bytes。
- 逐份重新核對檔案大小與 SHA-256：14／14 一致，0 mismatch。
- 驗證清單：`backups/historical-unique/SHA256SUMS`。
- 原始 worktree 內的 SQL 全部保留，沒有移動、修改或刪除。
- 就這 14 份歷史 D1 資產而言，`4d94`、`6b9b`、`bb11` 已不再是唯一保存位置；但移除實體 worktree 仍是另一項破壞性操作，必須另外取得明確刪除授權。
