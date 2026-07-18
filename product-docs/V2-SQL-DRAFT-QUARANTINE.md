# v2 SQL 草稿隔離規則

> **文件性質**：正式販售版 v2 的 SQL 草稿隔離規則。  
> **適用期間**：從現在起，直到 v2 正式啟動、完成逐檔審查並明確解除隔離為止。  
> **本次工作範圍**：只新增本文件；不修改 Demo v1、不執行 SQL、不處理憑證。

## 1. 隔離目的

目前 `backend/` 內的三個未追蹤 SQL 檔是正式販售版 v2（D1）的設計草稿，不屬於 Demo v1。隔離的目的，是避免草稿被誤加到 Demo v1、誤執行，或與 Demo 修正混在同一個 commit，確保現有 Notion＋LIFF Demo 可展示、可備份、可回復。

## 2. 隔離清單

以下三個檔案一律視為 **v2 D1 草稿**：

- `backend/beauty_studio_d1_import.sql`
- `backend/juliet-ai-os-d1-schema-v1.0.0.sql`
- `backend/juliet-ai-os-d1-schema-v1.0.1-fixed.sql`

它們目前必須維持 untracked。看到它們出現在 `git status --short` 是已知狀態，不代表應該納入版本控制。

## 3. 隔離期間禁止事項

- 不得 `git add`、commit 或 push 上述三個 SQL 檔。
- 不得執行、匯入、套用或測試上述 SQL，包括 local、preview、production D1。
- 不得修改、重新命名、搬移、合併或刪除上述 SQL 檔。
- 不得用 `git add .`、`git add -A` 等方式讓它們被意外 staged。
- 不得把任何 v2 D1／R2 實作混入 Demo v1 的文件或修正 commit。
- 不得修改或讀取 `.dev.vars`，也不得碰觸、輸出、複製或 commit token、secret、密碼、D1／R2 憑證。
- 不得把 Demo Worker、Demo Notion 或 Demo LIFF 當作 v2 實驗環境。

## 4. 隔離期間允許事項

- 可維護 `product-docs/` 內與版本切分、隔離及審查流程有關的純文件。
- 可用 `git status --short` 確認三個 SQL 仍為未追蹤且未 staged。
- 可在不開啟、不修改、不執行 SQL 的前提下，核對檔名是否與本清單一致。
- Demo v1 仍可進行獨立且必要的安全修正或明顯 bug 修正，但 commit 必須排除所有 v2 草稿。

## 5. Commit 前檢查

每次在 Demo v1 提交前都要逐項確認：

1. 執行 `git status --short`。
2. staged 清單中沒有本文件第 2 節的三個 SQL。
3. staged 清單中沒有 `.dev.vars`、secret、憑證或其他未授權檔案。
4. commit 內容只屬於目前任務，不混入 D1、R2 或 v2 實作。
5. 若任何 SQL 草稿進入 staged，立即停止提交並將它自 staged 清單移除；不得刪除原檔。

## 6. 解除隔離條件

只有在老闆明確下達「啟動正式販售版 v2」後，才能另開任務處理。解除隔離前必須同時完成：

1. 依 `V2-BRANCH-AND-NAMING-RULES.md` 使用 `v2-d1` 或其子分支，不在 Demo v1 的 `main` 直接實作。
2. 逐檔審查 schema、資料來源、相依順序、可重跑性、回復策略與個資風險。
3. 確認使用獨立的 v2 Worker、D1 與 R2 環境，不連接 Demo 資源。
4. 將通過審查的內容整理成正式、編號化 migration；不得直接把三個草稿原樣視為正式 migration。
5. SQL 的執行、搬移、封存或刪除必須另有明確指示與驗收，不由本文件授權。

## 7. 版本邊界

| 項目 | Demo v1 | 正式販售版 v2 |
|---|---|---|
| 主要資料來源 | Notion | D1 |
| LIFF | 保留現有穩定版 | 另案整合與驗收 |
| 客戶注意事項 | 不因本任務變更 | 存 D1 |
| 前後照片 | 不因本任務新增 | 圖片存 R2；D1 只存 metadata |
| 本清單三個 SQL | 禁止納入、禁止執行 | 審查後重整為正式 migration |

## 8. 相關文件

- `product-docs/V2-BRANCH-AND-NAMING-RULES.md`
- `product-docs/DEMO-V1-BACKUP-BEFORE-V2.md`
- `product-docs/VERSION-ARCHITECTURE-ROADMAP.md`

---

*文件版本：1.0｜v2 SQL 草稿隔離規則｜不含 Token、secret、密碼或真實客戶資料*
