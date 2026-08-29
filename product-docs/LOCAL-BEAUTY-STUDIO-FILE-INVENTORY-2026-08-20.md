# Beauty Studio Booking 本機檔案盤點與分類

盤點日期：2026-08-20（Asia/Taipei）

## 盤點原則

- 本文件只做分類，沒有刪除、移動、改名、合併、reset、clean、restore 或覆蓋任何檔案。
- 所有 Codex worktree 都從 Git `12f7754a77d9ccf0ebb776df5ac2a02304a8dc91` 分岔，且都有未提交內容；未完成差異保存前不可直接刪除。
- production／v2-production、Demo v1、Notion、main、`.dev.vars`、tokens 與 secrets 均不在整理範圍。

## A. 目前唯一權威版本：繼續使用

### `/Users/imac/.codex/worktrees/eca1/beauty-studio-booking`

- 目前最新工程 worktree。
- 唯一包含 `product-docs/V2-HANDOFF-2026-08-20-CURRENT.md`。
- 包含首次霧唇評估、AI 安全預約引導、最新地址意圖辨識、旗艦評估題庫與 868／868 測試基準。
- 後續本機修正應繼續在此處進行。
- 不可刪除、覆蓋或用其他舊 worktree 取代。

## B. 系統執行依賴：保留，不視為作廢

### `/Users/imac/project/beauty-studio-booking`

- Git main 工作目錄，仍有大量 dirty 修改。
- 固定 Wrangler 位於：`backend/node_modules/.bin/wrangler`，版本 3.114.17。
- 有 `eca1` 未收錄檔名的歷史 D1 備份：
  `backups/v2-test-d1-20260820-before-branded-liff-transition-pages-deploy.sql`。
- 因工具與備份依賴，不可刪除或重設。
- 不應把此目錄當成目前最新程式來源；目前程式權威仍是 `eca1`。

## C. 歷史備份容器：程式已過期，但整個資料夾暫不可刪

### `/Users/imac/.codex/worktrees/4d94/beauty-studio-booking`

- 程式狀態早於 `eca1`，可視為過期工程快照。
- 有 15 個 `eca1` 沒有同名檔案的歷史 v2-test D1 備份（2026-08-11～08-12）。
- 分類：歷史備份容器；先保存備份，再考慮封存 worktree。

### `/Users/imac/.codex/worktrees/6b9b/beauty-studio-booking`

- 程式狀態早於 `eca1`，可視為過期工程快照。
- 有 4 個 `eca1` 沒有同名檔案的歷史 v2-test D1 備份（2026-08-09）。
- 分類：歷史備份容器；先保存備份，再考慮封存 worktree。

### `/Users/imac/.codex/worktrees/bb11/beauty-studio-booking`

- 程式狀態早於 `eca1`，可視為過期工程快照。
- 有 27 個 `eca1` 沒有同名檔案的歷史 v2-test D1 備份（2026-08-09～08-16）。
- 分類：重要歷史備份容器；目前不可刪除。

## D. 高度疑似可封存的舊 worktree

以下 worktree 都缺少 CURRENT 交接檔及本輪最新功能，且沒有 `eca1` 缺少的同名產品文件：

- `/Users/imac/.codex/worktrees/201a/beauty-studio-booking`
  - 最新一般檔案時間約 2026-08-06。
  - 無 backups。
- `/Users/imac/.codex/worktrees/37d7/beauty-studio-booking`
  - 最新一般檔案時間約 2026-08-16。
  - 備份檔名均已存在於 `eca1`。
- `/Users/imac/.codex/worktrees/53d2/beauty-studio-booking`
  - 最新一般檔案時間約 2026-08-12。
  - 備份檔名均已存在於 `eca1`。
- `/Users/imac/.codex/worktrees/781a2564-816b-459b-9f1a-db9efcb8d226/beauty-studio-booking`
  - 是本次新聊天室最初取得的舊快照，不含 CURRENT 交接與最新功能。
  - 其額外備份檔名也存在於 `/Users/imac/project/beauty-studio-booking`。

分類：可封存候選，不是立即可刪除。每份仍有大量 dirty 修改；要移除前必須先做唯一差異與檔案雜湊確認，並取得使用者明確刪除授權。

## E. Demo v1 歷史複本：不在本輪整理範圍

### `/Users/imac/Desktop/beauty-studio-booking`

- 最後主要修改時間約 2026-08-08。
- 缺少目前 v2 最新功能。
- 含唯一文件：`product-docs/DEMO-V1-BACKUP-CHECKLIST-2026-07-16.md`。
- 依既有限制不得碰 Demo v1，因此只標記為歷史複本，不移動、不刪除。

## F. 非專案複本：不要手動清除

- `/Users/imac/.cursor/projects/Users-imac-project-beauty-studio-booking`
- `/Users/imac/.cursor/projects/Users-imac-codex-worktrees-4d94-beauty-studio-booking`

這些是 Cursor 的專案索引／工作資料，不是 Beauty Studio Booking 原始碼權威版本。除非確認 Cursor 已不再使用且有獨立備份，不應手動刪除。

## 建議後續整理順序

1. 繼續以 `eca1` 作為唯一最新工程來源。
2. 保留 `/Users/imac/project/beauty-studio-booking` 作為 Wrangler 與主專案依賴。
3. 將 `4d94`、`6b9b`、`bb11` 的唯一 D1 備份建立集中歷史備份清單；未經授權不搬移。
4. 對 `201a`、`37d7`、`53d2`、`781a...` 做逐檔雜湊與唯一差異稽核。
5. 使用者確認稽核結果後，才考慮透過 Codex worktree／thread 管理方式封存；不要直接 `rm -rf`。
6. Desktop Demo v1 與 Cursor 索引維持不動。

歷史 D1 備份的逐檔大小與 SHA-256 結果另見：
`product-docs/HISTORICAL-D1-BACKUP-INVENTORY-2026-08-20.md`。

## 目前結論

- 可直接判定為最新權威：`eca1`。
- 可判定為程式過期但需保留歷史資產：`4d94`、`6b9b`、`bb11`。
- 可列入下一階段封存稽核：`201a`、`37d7`、`53d2`、`781a...`。
- 絕對不可當廢檔處理：`eca1`、正式 project 目錄、Demo v1 歷史資料、含唯一 D1 備份的舊 worktree。

## 2026-08-22 專案內隔離整理

- 本次只整理 `eca1` 權威專案內已經文件確認為過期或未引用的檔案，沒有碰 Desktop Demo v1、其他個人資料夾、production、secrets 或舊 worktree 實體內容。
- 四套 2026-08-19 舊安裝包已移至 `dist/封存-不可使用/20260819-舊安裝包/`。
- v1 舊說明、四份 2026-07 product-docs、十份已完成 TASK 與六份未引用 CSS 快照已移至 `封存-不可使用/歷史檔案-20260822/`。
- 專案根目錄與 `dist/` 的 `.DS_Store` 已移入同一隔離區；所有動作均可復原，沒有永久刪除。
- `TASK-addon-package-cards.md`、`backups/`、`docs/`、兩份客戶匯入範本、現行 CSS、`eca1`、正式 project 目錄與所有舊 worktree 均保留。

## 第二階段逐檔稽核結果

稽核範圍：`201a`、`37d7`、`53d2`、`781a2564-816b-459b-9f1a-db9efcb8d226`。比較時排除 `.git`、`.wrangler`、`node_modules` 與 `dist` 等工具或產物資料。

### 相對 `eca1` 的逐檔結果

| worktree | 內容相同 | 同路徑但內容較舊／不同 | 只存在舊 worktree |
|---|---:|---:|---:|
| `201a` | 141 | 90 | 0 |
| `37d7` | 225 | 71 | 0 |
| `53d2` | 225 | 71 | 0 |
| `781a...` | 225 | 71 | 1 |

`781a...` 唯一額外路徑為：

`backups/v2-test-d1-20260820-before-branded-liff-transition-pages-deploy.sql`

此檔案與 `/Users/imac/project/beauty-studio-booking/backups/` 下同名檔案的 SHA-256 完全一致：

`a9cc4610b46081750dfd53333674c8bfdabe8ddcf3c0bda63314b25d57a3951d`

因此它不是唯一未保存備份。

### 候選 worktree 彼此比較

- `37d7`、`53d2`、`781a...` 的 295 個一般專案檔案內容完全相同。
- 唯一表面差異是各 worktree 自己的 `.git` 指標檔，不屬於產品成果。
- `201a` 是更早的工程版本；相對 `37d7` 有 73 個同路徑舊內容，但沒有額外路徑。
- 四個候選皆未發現 `eca1` 或正式 project 目錄未保存的獨立程式、產品文件或 D1 備份。

### 第二階段結論

- `201a`、`37d7`、`53d2`、`781a...` 已通過「無唯一成果」稽核，可升級為正式封存候選。
- 這不等同於已授權刪除。封存或移除 Codex worktree 仍屬破壞性操作，必須由使用者明確指定範圍後才能執行。
- 建議優先封存這四個候選；繼續保留 `eca1`、正式 project 目錄、`4d94`、`6b9b`、`bb11`、Desktop Demo v1 與 Cursor 索引。

## 第三階段 Codex 任務封存狀態

已封存以下非活躍舊任務；封存可復原，且沒有刪除其 worktree 檔案：

- `201a`：thread `019fd734-11cb-7200-af47-f64a2ca46d39`。
- `37d7`：thread `01a00a71-f823-7a31-b1f9-eb216cf4a02b`。
- `53d2`：threads `019ff210-ca26-7cc0-99d8-6cf0d3e63e80`、`019ff1ba-b0be-7e42-ab23-14bc6457ff0c`。
- `781a2564-816b-459b-9f1a-db9efcb8d226`：thread `01a01b57-2a42-73e3-92e6-abbdd0313a18`；使用者已切回 `eca1` 權威任務後完成封存。

目前這四組正式封存候選的 Codex 舊任務均已封存；`eca1` thread `01a00b2a-a675-7b10-a783-56a820296c36` 維持為唯一活躍權威任務。

本階段只整理 Codex 任務清單；沒有移除任何實體 worktree。若未來要釋放磁碟空間，必須另行取得明確刪除授權，並使用安全的 worktree 管理流程，不直接 `rm -rf`。

## 第四階段歷史 D1 備份完整性盤點

- 五個位置共盤點 101 份 SQL，依 SHA-256 去重後為 48 個不同資料快照。
- 共有 24 個快照只有一個實體副本；其中 14 個只存在舊 worktree：`4d94` 2 個、`6b9b` 1 個、`bb11` 11 個。
- 因此 `4d94`、`6b9b`、`bb11` 目前都不能刪除；必須先將 14 個單一快照集中保存並驗證雜湊。
- 本階段未移動、複製、修改或刪除任何 SQL；詳細表格與完整 SHA-256 已記錄於 `HISTORICAL-D1-BACKUP-INVENTORY-2026-08-20.md`。

## 第五階段單一 D1 快照集中保存

- 已將舊 worktree 僅有單一實體副本的 14 份 SQL 複製至 `eca1/backups/historical-unique/`，依原來源 `4d94`、`6b9b`、`bb11` 分類。
- 共複製 14 份、3,473,361 bytes；檔案大小及 SHA-256 逐份核對為 14／14 一致，0 mismatch。
- `backups/historical-unique/SHA256SUMS` 可供日後重新驗證。
- 所有來源 SQL 與實體 worktree 均維持原狀，沒有刪除或移動。
- `4d94`、`6b9b`、`bb11` 已不再因這 14 份 D1 備份而必須作為唯一保存容器；但刪除 worktree 仍須另行明確授權，且刪除前應再做一次路徑與雜湊確認。

## 第六階段舊 worktree 非備份檔案複核

集中保存 D1 後，另以唯讀方式排除 `.git`、`.wrangler`、`node_modules`、`dist` 與 `backups`，重新比較 `4d94`、`6b9b`、`bb11` 相對 `eca1` 的一般專案路徑：

- `6b9b`：291 個共同路徑，0 個只存在舊 worktree 的路徑。
- `4d94`：291 個共同路徑，另有 7 個只存在 `4d94` 的路徑：
  - `backend/src/line-credential-router.js`
  - `backend/src/subscription-lifecycle.js`
  - `backend/test/first-visit-brow-assessment-policy.test.js`
  - `backend/test/line-credential-router.test.js`
  - `backend/test/notification-lifecycle-immediate.test.js`
  - `backend/test/owner-deposit-immediate-notification.test.js`
  - `backend/test/subscription-lifecycle.test.js`
- `bb11`：291 個共同路徑，另有 4 個只存在 `bb11` 的路徑：
  - `backend/src/d1-owner-booking-notifications.js`
  - `backend/src/line-messaging-credential.js`
  - `backend/test/line-messaging-credential.test.js`
  - `backend/test/owner-booking-created-notification.test.js`

初步程式搜尋顯示 `eca1` 已有 `d1-notifications.js`、`subscription-status.js` 與 tenant LINE credential 路由邏輯，但沒有上述舊模組的同名 export／呼叫點，不能只憑檔名判定已完整取代。

因此目前結論調整為：

- `6b9b` 已通過「無非備份額外路徑」檢查，但實體刪除仍需明確授權。
- `4d94` 與 `bb11` 仍含待判讀的舊程式／測試，不可刪除；需先確認是已淘汰實驗、已由新架構等價取代，或有尚未合併的功能。
- 本階段沒有把任何舊程式複製回 `eca1`，避免把過期架構或 credential 邏輯誤植到目前權威版本。

## 第七階段舊功能等價性判讀

- 已完成 `4d94`、`bb11` 獨有模組與現行 `eca1` 的接入點比較；舊目標測試合計 26／26 通過。
- 「只有首次霧眉需評估」已被目前六類旗艦評估架構取代，舊測試不可恢復。
- 以下三組功能沒有被目前 `eca1` 等價取代：
  1. 訂閱到期前 14 天通知、到期後 7 天緩衝、自動暫停及禁止新預約。
  2. 客戶回報訂金匯款後即時通知 tenant 業主／主管。
  3. 新預約建立後即時通知業主，失敗才由 cron 補送。
- 舊 LINE credential 模組另保留多 tenant／多 OA 路由演進資訊；目前 webhook 與業主 OA 尚未統一到同一套 tenant routing，不能直接套回。
- 詳細證據與檔案分類記錄於 `product-docs/LEGACY-WORKTREE-FEATURE-AUDIT-2026-08-20.md`。
- 結論：`4d94`、`bb11` 繼續保留；`6b9b` 維持刪除候選。未執行任何程式合併、部署、D1 寫入或實體刪除。

## 第八階段過期檔案與安裝包更新

- 根目錄 `README.md` 已由 Notion／GitHub Pages v1 說明更新為目前 D1、R2、Workers、Pages 與多 tenant v2 工程入口。
- 九份已完成或被 v2 取代的 `TASK-*.md` 已改正狀態，不再顯示為目前待執行；加購堂數卡規劃仍保留有效。
- v1 的 `CLIENT-SETUP-GUIDE.md`、`COPY-FOR-NEW-CLIENT.md`、`PRODUCT-MASTER.md`、`PROJECT-FOLDER-MAP.md` 已於 2026-08-22 移至 `封存-不可使用/歷史檔案-20260822/根目錄-v1舊說明/`，避免 Cursor 誤用。
- 新增 `product-docs/CURRENT-AND-INVALID-FILES-2026-08-20.md`，集中列出有效、過期、歷史保留及不可誤刪檔案。
- `dist/juliet-studio-os-v2-install-kit-20260820-current.zip` 目前不存在：第一版營業時段手機排版實機不合格，current 已撤下。封存包不可交付；第二版部署與實機確認後才重建。
- 2026-08-20 第一版業主端營業時段四欄修正經 iPhone／LINE 實機發現時間欄仍過高並壓到刪除鍵；該包已撤下並移至 `dist/封存-不可使用/` 與 `商品營運中心/安裝包/封存-不可使用/`，禁止交付。第二版尚未部署／實機確認前不建立 current 包。
- 2026-08-19 四代安裝包已標記為不可交付的舊版，但未刪除。

## 第九階段目前交付狀態與新聊天交接

- 權威工作目錄仍為 `/Users/imac/.codex/worktrees/eca1/beauty-studio-booking`；大量 dirty worktree 為既有成果，不可 reset、clean、restore、覆蓋或重做。
- 總藍圖已補上 2026-08-20 現況，該補充節優先於 2026-08-09 的歷史進度描述。
- 最新 v2-test Pages 為 `f6ff57ed`；週幾與時段置中放大版尚待 iPhone／LINE 最終實機確認。
- `current` 安裝包維持撤下；確認合格後才可重建並同步商品營運中心。
- 新聊天須先讀 `V2-HANDOFF-2026-08-20-CURRENT.md`、總藍圖、完整 worklog 與業主訂閱開通 SOP，再做最小唯讀確認。
- 本階段沒有刪除檔案、沒有部署、沒有 D1 寫入、沒有碰 production。
