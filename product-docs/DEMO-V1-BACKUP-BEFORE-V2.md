# Demo v1 備份凍結文件（開始 v2 前）

> **只建立本文件。** 不修改 `backend/**`，不 add／commit 任何 SQL 檔。  
> 勿碰：`backend/beauty_studio_d1_import.sql`、`backend/juliet-ai-os-d1-schema-v1.0.0.sql`、`backend/juliet-ai-os-d1-schema-v1.0.1-fixed.sql`

---

## 1. Demo v1 名稱

**BeautyBooking-Demo-v1-Notion-LIFF-Stable-2026-07**

---

## 2. Demo v1 架構

**GitHub Pages + Cloudflare Workers + Notion + LIFF**

| 層 | 技術 |
|----|------|
| 前端 | GitHub Pages |
| 後端 | Cloudflare Workers |
| 資料 | Notion |
| 登入 | LINE LIFF |

---

## 3. Demo v1 必須保留，不可被 D1 v2 改壞

- Demo v1 用於展示、測試、銷售，**必須保留**。
- **不可**在 Demo 環境把資料層改成 D1，也**不可**用 Demo Worker／Demo Notion 當 v2 實驗場。
- Demo v1 資料層繼續使用 **Notion**。
- 正式優化版 v2 請用獨立分支／獨立環境開發，避免改壞 Demo。

---

## 4. 開始 v2 D1 前必做

| # | 項目 | 勾選 |
|---|------|------|
| 1 | **git status 乾淨** | ☐ |
| 2 | **main 已 push** | ☐ |
| 3 | **GitHub 下載 ZIP**（對應凍結點／main） | ☐ |
| 4 | **Notion 四個資料庫備份或複製**（services／slots／bookings／settings） | ☐ |
| 5 | **Cloudflare Secrets 不寫入文件**（Token、Channel Secret、`.dev.vars` 內容均不可貼進本文件或 Git） | ☐ |

---

## 5. D1／R2 是正式優化版 v2，不屬於 Demo v1

| 項目 | 歸屬 |
|------|------|
| Notion + LIFF + Pages + Workers | **Demo v1** |
| **D1**（結構化資料） | **正式優化版 v2** |
| **R2**（照片檔；metadata 可在 D1） | **正式優化版 v2** |

D1／R2 **不是** Demo v1 的一部分。

---

## 6. 明確提醒：SQL 檔案不能跟 Demo v1 備份文件混 commit

> 🟧 **SQL／migration／schema 檔屬於 v2，不可以與 Demo v1 備份文件混在同一個 commit。**

- 本任務**只**建立／更新 `product-docs/DEMO-V1-BACKUP-BEFORE-V2.md`。
- **不要** `git add` 任何 `.sql` 檔。
- **不要**修改 `backend/**`（含上述三個 SQL 檔）。
- 若工作區已有 SQL 變更，留待 v2 分支／另開任務處理。

---

*文件版本：1.2｜Demo v1 備份凍結｜不含 Token、secret、`.dev.vars`*
