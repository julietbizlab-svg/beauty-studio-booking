# Cursor 任務包：加購模組「堂數卡／儲值管理」

> **專案**：`beauty-studio-booking`  
> **檔案**：`TASK-addon-package-cards.md`  
> **建立日期**：2026-07-14  
> **狀態**：待執行（本文件僅整理任務，**不實作**）  
> **模組類型**：可選購**加購模組**（非基礎預約 MVP；**不含**月曆預約查詢）

---

## 0. 產品定位（必讀）

### 屬於加購模組（本任務）

- **儲值金**（業主手動登錄餘額與異動，**不含**線上金流）
- **剩餘堂數**、**總堂數**、**已使用堂數**
- **未開卡／已開卡／已用完／已停用**狀態
- **堂數卡管理**（業主端新增、列表、查詢）
- **手動扣堂**
- **客人端「我的堂數卡」**（可選開關，唯讀）

### 不屬於本加購（屬基礎款，見其他任務包）

| 功能 | 任務包 | 方案 |
|------|--------|------|
| 單日預約查詢（過渡） | `TASK-owner-booking-date-query.md` | 基礎款 |
| **月曆預約查詢**（整月、標記、點日看列表） | `TASK-owner-calendar-bookings.md` | **基礎款** |

> **月曆預約查詢絕不可列為本加購模組內容或加購報價項目。**

---
## 1. 目標

在現有「LINE 預約管理系統」**基礎款**之上，新增**可選購**的堂數卡／儲值管理模組，讓業主可在手機上**手動**記錄儲值金、管理堂數卡、開卡、扣堂、查詢客戶剩餘；客人可選擇性查看自己的堂數卡。

### 第一版要做

- **儲值金**：業主手動登錄客戶儲值餘額、手動扣款記錄（無線上收款）
- **堂數卡**：新增、列表、未開卡／已開卡、剩餘堂數、手動扣堂
- 業主端：客戶堂數卡與儲值查詢、狀態管理
- 客人端（可選開關）：「我的堂數卡／儲值」唯讀摘要
- 資料存 Notion，經 Cloudflare Workers API 讀寫
- Owner 權限一律後端 `requireOwnerFromRequest` 驗證

### 第一版明確不做

- 線上金流、信用卡、第三方付款
- 預約完成後自動扣堂（列第二階段）
- 月曆預約查詢（屬**基礎款**，見 `TASK-owner-calendar-bookings.md`）
- 要求業主直接操作 Notion

---

## 2. 此功能適合放在哪個方案

| 方案 | 是否包含 | 說明 |
|------|----------|------|
| Demo／樣品展示 | ❌ | 核心預約展示即可 |
| 基礎買斷版 | ❌ 堂數卡／儲值 | 基礎款**含**月曆預約查詢（見 `TASK-owner-calendar-bookings.md`），**不含**本加購 |
| 建置加維護版 | ❌ 堂數卡／儲值 | 同上；堂數卡須另簽加購 |
| **加購模組：堂數卡／儲值** | ✅ | **建議獨立報價、獨立驗收** |

### 建議報價定位（產品用，非合約）

- **加購建置費**：NT$ 8,000～18,000（含 Notion 新表、前後端、驗收）
- **加購月維護**（選配）：併入既有維護約，或 +NT$ 500～1,500／月
- **第二階段「預約自動扣堂」**：另報 NT$ 5,000～12,000

參考：[PRICING-PACKAGES.md](PRICING-PACKAGES.md)、[PRODUCT-TEMPLATE-MASTER.md](PRODUCT-TEMPLATE-MASTER.md)

---

## 3. Notion 是否需要新增資料庫

**是。** 現有四表（services / slots / bookings / settings）不足以表達堂數卡生命週期與扣堂紀錄。

### 建議資料庫名稱

| 用途 | 建議英文名（程式／env） | 建議中文名（Notion 介面） |
|------|-------------------------|---------------------------|
| 堂數卡主檔 | `package_cards` | 堂數卡 |
| Cloudflare Secret | `NOTION_DATABASE_PACKAGE_CARDS` | — |

> 備選命名 `customer_passes` 亦可，但專案內建議統一用 **`package_cards`**，避免與「通行證」語意混淆。

### 第二階段（本任務不實作）可再加

| 資料庫 | 用途 |
|--------|------|
| `package_card_ledger` | 扣堂／回補異動紀錄（稽核用） |

第一版可先用「更新已使用堂數 + 備註」簡化；第二階段再拆 ledger。

---

## 4. 欄位規格（Notion `package_cards`）

| 欄位 | Notion 類型 | 必填 | 說明 |
|------|-------------|:----:|------|
| 卡片名稱 | Title | ✅ | 建議：`卡種名稱｜客人姓名` 或自動編號 |
| 客人姓名 | rich_text | ✅ | 顯示用 |
| LINE userId | rich_text | ✅ | 與預約系統相同，用於客人端查詢 |
| 卡種名稱 | rich_text | ✅ | 例：臉部護理 10 堂卡 |
| 總堂數 | number | ✅ | 整數 ≥ 1 |
| 已使用堂數 | number | ✅ | 整數 ≥ 0，預設 0 |
| 狀態 | select | ✅ | 未開卡、已開卡、已用完、已停用 |
| 購買日期 | date | ✅ | 業主手動登錄購買日 |
| 開卡日期 | date | 選填 | 狀態改「已開卡」時寫入 |
| 備註 | rich_text | 選填 | 例：現金購買、贈送 2 堂 |

### 剩餘堂數（不建議存成 Notion 欄位）

- **建議由 API 計算**：`剩餘堂數 = 總堂數 - 已使用堂數`
- 避免雙欄位不同步；若 Notion 要顯示可選用 Formula（非必須）

### 狀態流轉（第一版）

```
未開卡 ──(業主開卡)──> 已開卡 ──(扣至 0)──> 已用完
   │                      │
   └────(業主停用)────────┴────> 已停用
```

- **未開卡**：已售未啟用，不可扣堂（或需先開卡）
- **已開卡**：可扣堂
- **已用完**：已使用 ≥ 總堂數，不可再扣
- **已停用**：業主手動停用，不可扣堂

---

## 5. API path 設計

### Owner API（皆需 `Authorization: Bearer <LINE ID Token>` + `requireOwnerFromRequest`）

| 方法 | Path | 說明 |
|------|------|------|
| GET | `/api/owner/package-cards` | 列表；可選 query `lineUserId`、`status` |
| GET | `/api/owner/package-cards/:id` | 單筆詳情 |
| POST | `/api/owner/package-cards` | 新增堂數卡 |
| PATCH | `/api/owner/package-cards/:id` | 更新（開卡、停用、改備註等） |
| POST | `/api/owner/package-cards/:id/deduct` | 手動扣堂；body: `{ "sessions": 1, "note": "..." }` |

**POST 新增 body 範例（欄位名稱）**：

```json
{
  "customerName": "王小美",
  "lineUserId": "Uxxxxxxxx",
  "packageName": "臉部 10 堂",
  "totalSessions": 10,
  "purchaseDate": "2026-07-14",
  "status": "未開卡",
  "note": "現金購買"
}
```

**deduct 回應應含**：`remainingSessions`、`status`（若扣完改已用完）

### 客人端 API（第一版）

| 方法 | Path | 說明 |
|------|------|------|
| GET | `/api/package-cards/me?userId=` | 查詢本人堂數卡（沿用 bookings 模式，以 LINE userId 篩選） |

> **安全**：僅回傳該 `userId` 的卡片；不暴露他人資料。  
> 未來可改為僅接受 LIFF 驗證（列增強項）。

### 設定開關（可選，第一版建議做）

在 `settings` 增加欄位，或 `settings` JSON 擴充：

| 欄位 | 說明 |
|------|------|
| `packageCardsEnabled` | 客人端是否顯示「我的堂數卡」Tab |

若不想改 settings 表結構，可用 `settings` 的 `取消規則` 同表新增 rich_text／checkbox 欄位 **「啟用堂數卡」**（實作時擇一，需 Codex 審查 schema 變更）。

---

## 6. owner-admin 需要新增哪些畫面

### 建議新增 Tab：「堂數卡」

| 區塊 | 內容 |
|------|------|
| **列表** | 全部卡片；可篩選狀態；顯示客人、卡種、剩餘／總數、狀態 |
| **搜尋** | 依客人姓名或 LINE userId（手機友善：大字、單欄） |
| **新增表單** | 客人姓名、LINE userId、卡種、總堂數、購買日期、備註；狀態預設「未開卡」 |
| **卡片詳情／操作** | 開卡、扣 1 堂（或輸入堂數）、停用、改備註 |
| **快速查詢** | 輸入 userId 或選客人 → 顯示該客所有卡與剩餘堂數 |

### UX 原則（手機）

- 列表卡片式，狀態用色標
- 扣堂按鈕明確，操作前 `confirm`
- 已用完／已停用視覺弱化（可參考預約查詢「已取消」樣式）

### 涉及檔案（實作時）

- `owner-admin/index.html`
- `owner-admin/js/app.js`
- `owner-admin/js/api.js`
- `owner-admin/css/style.css`
- `docs/owner/**`（sync + bump `?v=`）

---

## 7. customer-ui 是否需要新增「我的堂數卡」

**建議：要，但可由設定開關關閉。**

| 項目 | 說明 |
|------|------|
| 新 Tab | 「我的堂數卡」（與「預約」「我的預約」並列） |
| 顯示內容 | 卡種、剩餘／總堂數、狀態、購買／開卡日期（唯讀） |
| 不做 | 客人自行扣堂、購買、付款 |
| 關閉時 | Tab 隱藏，API 仍可存在（owner 照常管理） |

### 涉及檔案（實作時）

- `customer-ui/index.html`
- `customer-ui/js/app.js`
- `customer-ui/js/api.js`
- `docs/js/**`（sync + bump `?v=`）

---

## 8. 不做範圍（第一版）

| 項目 | 階段 |
|------|------|
| 線上金流／信用卡／LINE Pay | 不做 |
| 預約成功自動扣堂 | **第二階段** |
| 扣堂異動獨立 ledger 表 | 第二階段（可選） |
| 月曆預約查詢 | **基礎款**（非本模組） |
| 客人自助購卡 | 不做 |
| 多員工分權扣堂 | 不做 |
| 報表匯出 | 不做 |
| 推播「剩餘 1 堂」提醒 | 不做 |

---

## 9. 安全風險

| 風險 | 等級 | 說明 | 緩解 |
|------|------|------|------|
| 客人查到他人堂數卡 | 高 | `userId` 偽造 | API 嚴格篩選 `lineUserId`；長期改 LIFF 驗證 |
| 非業主呼叫 owner API | 高 | 越權扣堂 | 維持 `requireOwnerFromRequest` |
| 重複扣堂／競態 | 中 | 連點扣堂 | 後端原子檢查：剩餘 ≥ 扣堂數 |
| 負數堂數 | 中 | 資料錯誤 | 後端驗證 `used <= total` |
| Notion Token 外洩 | 高 | 前端誤放 | Token 僅 Worker Secrets |
| 新 DB ID 漏設 | 中 | 部署失敗 | 更新 `check-notion.mjs`、`.dev.vars.example` |
| 與預約資料不一致 | 低 | 手動扣堂未連預約 | 第一版接受；第二階段再串預約 |

---

## 10. 驗收標準

### 業主端

- [ ] 可新增堂數卡（含未開卡）
- [ ] 可將卡片改為「已開卡」並記錄開卡日期
- [ ] 可手動扣堂，剩餘堂數正確遞減
- [ ] 扣至 0 時狀態變「已用完」
- [ ] 可停用卡片
- [ ] 可依 LINE userId 查詢該客所有卡與剩餘堂數
- [ ] 非業主帳號無法呼叫 owner API

### 客人端（啟用時）

- [ ] 「我的堂數卡」顯示本人卡片
- [ ] 看不到其他客人資料
- [ ] 關閉開關後 Tab 不顯示

### 資料與部署

- [ ] Notion 新表欄位正確，`check-notion` 通過
- [ ] Cloudflare Secret 含 `NOTION_DATABASE_PACKAGE_CARDS`
- [ ] 無 token 進前端、無 `.dev.vars` commit

### 明確不驗收（第一版）

- [ ] ~~預約後自動扣堂~~
- [ ] ~~線上付款~~

---

## 11. 測試方式

### 靜態檢查

```bash
node --check backend/src/index.js
node --check backend/src/notion.js   # 或新檔 package-cards.js
node scripts/check-notion.mjs        # 擴充後五表檢查
```

### Owner API（curl，需業主 Bearer Token）

```bash
# 列表
curl -s -H "Authorization: Bearer <ID_TOKEN>" \
  "https://<worker>/api/owner/package-cards"

# 新增
curl -s -X POST -H "Authorization: Bearer <ID_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"customerName":"測試","lineUserId":"U...","packageName":"10堂卡","totalSessions":10,"purchaseDate":"2026-07-14","status":"未開卡"}' \
  "https://<worker>/api/owner/package-cards"

# 扣堂
curl -s -X POST -H "Authorization: Bearer <ID_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"sessions":1,"note":"手動扣堂"}' \
  "https://<worker>/api/owner/package-cards/<CARD_ID>/deduct"
```

### 客人端

```bash
curl -s "https://<worker>/api/package-cards/me?userId=<LINE_USER_ID>"
```

### 實機（LINE）

1. 業主新增未開卡 → 開卡 → 扣 1 堂 → 確認剩餘  
2. 客人 LINE 開啟「我的堂數卡」→ 數字與業主端一致  
3. 非業主開管理頁 → 401

---

## 12. Rollback 方式

### 功能關閉（保留資料）

1. `settings` 關閉客人端 Tab  
2. owner-admin 隱藏 Tab（或 revert 前端 commit）  
3. 後端路由可保留（不影響舊客戶）

### 完整回退

1. `git revert` 本模組相關 commits（後端 + 前端）  
2. `wrangler deploy` 舊版後端（需 Codex 審查）  
3. sync `docs/` 並 bump `?v=`  
4. Notion 新表可保留不刪（資料不丟失）

### 客戶已上線加購模組時

- **勿刪** Notion `package_cards` 表  
- 僅回退程式，資料保留供日後恢復

---

## 13. 建議實作順序（供 Codex 審查後執行）

1. **文件**：Notion 建表說明（擴充 `CLIENT-NOTION-SETUP-FLOW.md`）  
2. **後端**：`notion.js` 或新檔 `package-cards.js` + `index.js` 路由  
3. **Secrets**：`NOTION_DATABASE_PACKAGE_CARDS` 上傳（需審查）  
4. **owner-admin**：Tab + CRUD + 扣堂  
5. **customer-ui**：我的堂數卡（含開關）  
6. **check-notion.mjs** 擴充  
7. deploy + sync + 實機驗收  
8. 更新 `PRICING-PACKAGES.md` 加購段落（選配）

---

## 14. 涉及檔案預覽（實作階段）

| 區域 | 檔案 |
|------|------|
| 後端 | `backend/src/index.js`、`backend/src/notion.js` 或 `package-cards.js` |
| 業主前端 | `owner-admin/index.html`、`js/app.js`、`js/api.js`、`css/style.css` |
| 客人前端 | `customer-ui/index.html`、`js/app.js`、`js/api.js` |
| 部署產物 | `docs/owner/**`、`docs/js/**` |
| 設定範例 | `backend/.dev.vars.example` |
| 檢查腳本 | `scripts/check-notion.mjs` |
| 商品文件 | `product-docs/PRICING-PACKAGES.md`（加購說明） |

### 不可修改（除非另開任務）

- 現有預約扣堂邏輯（第一版不動 `createBooking`）
- `.dev.vars` 真實值（僅 example 加 key 名稱）

---

## 15. Codex 審查前問題（請先決策）

1. 客人端查詢是否第一版就要 LIFF 驗證，還是沿用 `userId` query？  
2. `settings` 啟用開關要新增 Notion 欄位還是硬編碼 config？  
3. 未開卡是否允許扣堂（建議：不允許，須先開卡）？  
4. 加購模組是否寫入獨立 repo branch 再 merge？

---

*任務包版本：1.0｜beauty-studio-booking 加購模組｜不實作、不含任何 Token*
