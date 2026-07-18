# v2 正式販售版：工作分支與檔名規則

> **性質**：命名與分支規則文件（**只定規則，不實作、不改程式、不動 SQL**）  
> **專案**：`beauty-studio-booking`  
> **建立日期**：2026-07-18  
> **目的**：把 Demo v1、v2 D1、R2 照片、SQL 草稿的界線與名稱鎖死，避免之後混 commit。  
> **相關**：`VERSION-ARCHITECTURE-ROADMAP.md`（架構決策）、`DEMO-V1-BACKUP-BEFORE-V2.md`（v1 凍結）、`TASK-d1-migration-plan.md`（D1 遷移規劃）  
> **不含**：token、secret、金鑰、客戶個資。

---

## 1. 一句話

**`main` 永遠是 Demo v1（Notion）；所有 v2（D1／R2）工作只能在 `v2-d1` 分支上做；SQL 草稿在通過審查前不進任何分支。**

---

## 2. 分支規則

| 分支 | 用途 | 資料層 | 允許的變更 |
|------|------|--------|------------|
| `main` | **Demo v1 母版**（展示、測試、銷售） | Notion | 安全修補、明顯 bug、文件、不動資料層的小幅 UI |
| `v2-d1` | **正式優化版 v2 主工作分支** | D1 ＋ R2 | D1 schema、資料層切換、R2 照片、注意事項模組 |
| `v2-d1/<主題>` | v2 子功能分支（可選） | D1 ＋ R2 | 單一主題，例如 `v2-d1/schema`、`v2-d1/photos-r2` |
| `codex/<主題>` | Codex 審查用短期分支（既有慣例） | 依主題 | 審查通過即合併或刪除，不長期存活 |

### 分支鐵律

1. **不可**把 v2（D1／R2／SQL）的 commit 直接推進 `main`。
2. v2 工作一律從 `main` 切出 `v2-d1`，之後 v2 子功能從 `v2-d1` 切出。
3. `v2-d1` 合回 `main` 的時機＝「產品決策宣布新客戶預設 v2」，且須經 Codex 審查，**不是**工程師自行判斷。
4. 開始 v2 前先在 `main` 打凍結 tag（見第 3 節），確保 Demo v1 永遠找得回來。

---

## 3. Tag／備份名稱規則

| 項目 | 名稱 | 說明 |
|------|------|------|
| Demo v1 凍結 tag | `demo-v1-stable-2026-07` | 開 `v2-d1` 分支前，在 `main` 打上（目前尚未打，屬 v2 啟動前置作業） |
| Demo v1 備份代號 | `BeautyBooking-Demo-v1-Notion-LIFF-Stable-2026-07` | 對外／文件引用名稱，見 `DEMO-V1-BACKUP-BEFORE-V2.md` |
| v2 里程碑 tag | `v2.0.0-alpha.1`、`v2.0.0-beta.1`、`v2.0.0` | 只打在 `v2-d1` 分支；合回 main 後才有正式 `v2.0.0` |

---

## 4. 專案／資料夾名稱規則

| 類型 | 統一名稱 |
|------|----------|
| 主專案資料夾（本 repo） | `beauty-studio-booking` |
| Demo v1 備份名稱 | `BeautyBooking-Demo-v1-Notion-LIFF-Stable-2026-07` |
| 正式優化版 v2（若另開 repo／Worker） | `beauty-studio-booking-v2-d1` |
| v2 專用 Cloudflare Worker | `beauty-studio-booking-v2`（與 Demo Worker 分開，不共用） |
| v2 專用 D1 資料庫 | `beauty-studio-v2-db` |
| v2 專用 R2 bucket | `beauty-studio-v2-photos` |
| 不屬於本案的小教室系統 | `small-class-booking-system`（另一產品線，勿混入本 repo） |
| 舊測試／ChatGPT 產物 | 移入 `_archive/` 或 `research-notes/`，不進 git |

> 命名原則：**看到名稱就知道是哪一版**。凡是含 `v2`、`d1`、`r2` 字樣的資源，一律不得接到 Demo v1 環境。

---

## 5. SQL 草稿處理規則

目前 `backend/` 下有三個**未追蹤**的 SQL 草稿（v2 素材，禁止 add／commit／delete）：

```text
backend/beauty_studio_d1_import.sql
backend/juliet-ai-os-d1-schema-v1.0.0.sql
backend/juliet-ai-os-d1-schema-v1.0.1-fixed.sql
```

| 規則 | 內容 |
|------|------|
| 現在（v2 未啟動） | 保持 untracked；**不 add、不 commit、不刪除**，任何 `git add -A`／`git add .` 前先確認不含這三檔 |
| v2 啟動後的正式位置 | `v2-d1` 分支的 `backend/migrations/` 目錄，改用編號命名（見下） |
| 正式 migration 檔名 | `0001_init_schema.sql`、`0002_customers_notes.sql`、`0003_photos_metadata.sql`…（四碼流水號＋小寫底線描述） |
| `juliet-ai-os` 舊代號 | 屬歷史命名，正式 v2 檔名**不再使用**；內容確認搬進編號 migration 後，原草稿移入 `_archive/`（不進 git） |
| 匯入資料檔 | 若含真實客戶資料，**永遠不進 git**；只留在本機並記錄產生方式 |

---

## 6. 檔案與版號慣例（兩版通用）

| 項目 | 規則 |
|------|------|
| 前端快取版號 | `?v=YYYYMMDDNNN`（例：`20260718001`），同一次改動 owner-admin／customer-ui 與 docs 同步 bump |
| 文件 | 規則／SOP 放 `product-docs/`（大寫連字號命名）；任務包放 repo 根目錄 `TASK-*.md` |
| docs/ 同步 | `docs/`（GitHub Pages）只能由 `scripts/sync-github-pages.sh` 產生，不手改 |
| secrets | 只放 `.dev.vars`（本機）與 Cloudflare Secrets；任何分支、任何文件都不得出現 |

---

## 7. Commit 訊息前綴（避免混版）

| 前綴 | 用途 | 分支 |
|------|------|------|
| `demo-v1:` 或不加前綴 | Demo v1 修補與文件 | `main` |
| `v2:` | v2 D1／R2 實作 | `v2-d1` 及其子分支 |
| `docs:` | 純文件（規則、SOP、任務包） | `main` |

**檢查習慣**：commit 前跑 `git status --short`，確認沒有 SQL 草稿、沒有 `.dev.vars`、沒有跨版檔案混入。

---

## 8. 給 Cursor／Codex 的執行提醒

1. 接到任務先判斷：Demo v1（`main`）還是 v2（`v2-d1`）？不確定就先問，不要猜。
2. 在 `main` 上看到 D1／R2／SQL 相關 diff → **停止並回報**，不 commit。
3. v2 尚未啟動前，本文件的分支與 tag 都**只是規則**，不代表現在就要建立；建立分支屬 v2 啟動動作，需老闆明確指示。
4. 本文件更新屬「決策變更」，需老闆／Codex 同意。

---

*文件版本：1.0｜分支與命名規則｜不含 Token、secret、密碼或真實客戶資料*
