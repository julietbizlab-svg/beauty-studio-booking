# Cursor 任務包：業主端客戶注意事項 ＋ 前後照片比對

> **專案**：`beauty-studio-booking`  
> **檔案**：`TASK-owner-customer-notes-photos.md`  
> **建立日期**：2026-07-16  
> **狀態**：待規劃審查（本文件**只規劃，不實作**）  
> **產品定位**：**進階客戶管理**（非基礎款 v1.0 必含；建議加購／進階模組）  
> **產品線**：美業個人工作室版  
> **前置**：業主客戶資料頁第一版（`TASK-owner-customer-directory.md`，API 從 bookings 聚合）、`requireOwnerFromRequest`、可選 `NOTION_DATABASE_CUSTOMERS`  
> **相關**：D1 遷移見 `TASK-d1-migration-plan.md`（本功能欄位需同時規劃 Notion 版與 D1 版）

---

## 0. 產品定位（必讀）

| 項目 | 說明 |
|------|------|
| **屬於哪個方案** | **進階客戶管理**（加購／進階），不是基礎款必交付 |
| **一句話** | 業主在「客戶資料」裡記每位客人的注意事項，並（第二階段）比對服務前後照片 |
| **誰看得到** | **僅業主端**；客人端 LIFF **不可**看到注意事項與照片 |
| **與基礎客戶頁關係** | 建立在既有「客戶名單＋歷史預約」之上，不重做目錄 |

### 使用者故事

> **業主**：下次幫她做之前，我想先看到她過敏、禁忌、偏好，不要靠記憶。  
> **業主**：我想對照「做前／做後」照片，方便自己檢討與和客人說明效果（需有同意）。  
> **客人**：我不希望我的過敏備註或素顏照片出現在預約頁給別人看。

### 兩階段總覽

| 階段 | 內容 | 建議優先 |
|------|------|----------|
| **Phase 1** | 客戶注意事項（查看／編輯） | 先做；資料量小、無檔案儲存 |
| **Phase 2** | 前後照片比對（上傳／檢視／刪除） | 後做；需物件儲存與隱私流程 |

**本任務包通過 Codex 審查前：不改程式、不 commit、不 deploy。**

---

## 1. 現況與缺口

| 現況 | 缺口 |
|------|------|
| `GET /api/owner/customers`、`GET /api/owner/customer-bookings` 已上線 | 無注意事項讀寫 |
| 客戶名單主要從 **bookings 聚合** | 注意事項不適合塞進每筆 booking |
| `NOTION_DATABASE_CUSTOMERS` **選用**；有則 `upsertCustomer` | Demo／部分客戶可能尚未啟用 customers |
| 客人端可填姓名／電話／生日進 booking | 無「注意事項」欄；也不應讓客人編輯業主內部備註 |
| 無 R2／照片上傳流程 | Phase 2 需全新設計 |

---

## 2. Phase 1：客戶注意事項

### 2.1 目標

- 業主在客戶資料**詳情**可查看／編輯「客戶注意事項」
- 內容可涵蓋（同一文字欄或分段欄，實作擇一，建議先**單一長文字**＋ UI 提示）：
  - 過敏
  - 偏好
  - 禁忌
  - 服務備註
- 所有相關 API：**必須** `requireOwnerFromRequest`
- **customer-ui／docs 客人端**：不顯示、不呼叫、不回傳此欄

### 2.2 資料策略：優先 customers；未啟用時的 fallback

#### 建議主路徑（優先）

| 條件 | 做法 |
|------|------|
| 已設定 `NOTION_DATABASE_CUSTOMERS`（或 D1 `customers`） | 注意事項存 **customers** 列，以 `LINE userId` 對應 |
| 業主第一次存備註但尚無 customers 列 | **upsert**：依 userId 建立／更新（姓名／電話可從最近 booking 帶入） |

#### Fallback（customers 尚未啟用）

| 方案 | 說明 | 建議 |
|------|------|------|
| **A. 強制啟用 customers（建議）** | Phase 1 上線條件改為：該環境必須有 customers DB／表；文件與安裝包加一步 | **商品版建議** |
| **B. 暫存 bookings 延伸欄（不建議長期）** | 在「最近一筆 booking」寫備註 → 多人歷史會亂、取消列難維護 | ❌ 不做為正式方案 |
| **C. 獨立 Notion DB `customer_notes`** | 未建 customers 時用 userId 當鍵 | 可作過渡，但與 customers 重複，D1 時應合併 |
| **D. API 回 503／引導文案** | `NOTION_DATABASE_CUSTOMERS` 未設時，編輯備註回錯：「請先啟用客人資料庫」；列表／歷史預約仍可用 | **Demo 過渡可接受** |

**本規劃採用**：

1. **正式商品／加購啟用時**：採 **A**（必須有 customers）。  
2. **現有僅 bookings 聚合的環境**：Phase 1 實作採 **D**（讀寫備註前檢查 customers；未啟用則明確錯誤，不寫進 booking）。  
3. 同時在安裝／加購 SOP 寫清：開此模組＝補建 customers ＋欄位。

### 2.3 Notion／D1 欄位規劃（Phase 1）

#### Notion `customers`（既有表擴充）

現有（文件）：客人名稱、LINE userId、電話、生日、LINE 暱稱、備註。

| 新增／調整欄位 | 類型 | 說明 |
|----------------|------|------|
| **客戶注意事項** | 文字（rich_text） | 過敏／偏好／禁忌／服務備註可寫在同一欄；UI 用 placeholder 引導分段 |
| （可選，後續再拆）過敏、偏好、禁忌、服務備註 | 各 rich_text | Phase 1 **不強制拆欄**，降低 Notion 設定成本 |

> 若既有「備註」欄已存在：可 **复用「備註」當注意事項**，或新增「客戶注意事項」避免與內部行政備註混淆。實作任務須擇一寫死並更新 `CLIENT-NOTION-SETUP-FLOW.md`。

**建議**：新增欄位名 **`客戶注意事項`**（與「備註」分開：備註＝行政；注意事項＝服務安全相關）。

#### D1 `customers`（對齊 `TASK-d1-migration-plan.md`）

```sql
-- 在 customers 表增加（未來 migration）
ALTER TABLE customers ADD COLUMN care_notes TEXT NOT NULL DEFAULT '';
-- 可選之後再拆：allergy_notes, preference_notes, taboo_notes, service_notes
```

| SQL 欄位 | 對應 |
|----------|------|
| `care_notes` | 客戶注意事項全文 |
| `user_id` | LINE userId（既有） |

### 2.4 Owner API 規劃（Phase 1）

全部 **owner-only** + `requireOwnerFromRequest`。  
不可回傳 Notion／D1 原始整包；只回 DTO。

| Method | Path（建議） | 說明 |
|--------|--------------|------|
| GET | `/api/owner/customer-notes?userId=` | 讀該客戶注意事項（無列可回空字串） |
| PUT 或 PATCH | `/api/owner/customer-notes` | body：`{ userId, careNotes }` 寫入／upsert |

**替代（較 REST）**：

| Method | Path |
|--------|------|
| GET | `/api/owner/customers/:userId/notes` |
| PUT | `/api/owner/customers/:userId/notes` |

> 現有客戶預約已用 query `userId=`（`/api/owner/customer-bookings`）。為一致，**建議沿用 query 風格** 或兩階段統一；實作時擇一，勿混用兩套。

#### Request／Response DTO（草案）

```json
// GET 200
{
  "ok": true,
  "userId": "U…",
  "customerName": "…",
  "careNotes": "過敏：…\n禁忌：…\n偏好：…"
}

// PUT body
{
  "userId": "U…",
  "careNotes": "…"
}
```

| 規則 | 說明 |
|------|------|
| 無 userId | 400 |
| 非 owner | 401／403（既有 auth） |
| 無 customers 設定 | 503 或 400，message 明確（Fallback D） |
| `careNotes` 長度 | 建議上限（例如 2000～4000 字），防濫用 |
| 客人端 API | **禁止**出現於 `/api/bookings*`、`/api/settings` 等公開／客人路由 |

可選：在 `GET /api/owner/customer-bookings` 詳情一併帶 `careNotes`，減少一次往返；若帶，仍僅 owner 路由。

### 2.5 owner-admin UI 規劃（Phase 1）

| 位置 | 行為 |
|------|------|
| 客戶資料 → 點入詳情 | 歷史預約**上方或側邊**新增「客戶注意事項」區塊 |
| 顯示 | 多行文字；空則顯示「尚未填寫」 |
| 編輯 | 「編輯」→ textarea（手機友善、字數提示）→「儲存」／「取消」 |
| 儲存中 | 按鈕 disabled；失敗顯示錯誤（含未啟用 customers） |
| 提示文案 | 「僅店長可見，不會顯示在客人預約頁。」 |
| Placeholder 範例 | `過敏：\n禁忌：\n偏好：\n其他服務備註：` |

**不改**：`customer-ui/**`（除明確禁止加欄位外，本階段零改動為佳）。

### 2.6 Phase 1 驗收標準

- [ ] 業主可開啟客戶詳情並看到注意事項區塊  
- [ ] 可儲存、重新整理後仍在  
- [ ] 無 Bearer／非業主呼叫 notes API → 401／403  
- [ ] 客人端頁面與客人 API **看不到**注意事項  
- [ ] 未啟用 customers 時行為符合 Fallback D（明確錯誤，不寫壞 booking）  
- [ ] 前端無 secret；不改 `.dev.vars` 內容進 git  

### 2.7 Phase 1 Rollback

| 層 | 做法 |
|----|------|
| 程式 | revert 該功能 commit；redeploy 上一版 Worker；owner-admin／docs/owner 回上一版 |
| 資料 | Notion／D1 欄位可保留（不刪資料）；停用 UI／API 即可 |
| 設定 | 若曾新增 Secret，可不刪；停用程式後即無讀寫 |

---

## 3. Phase 2：前後照片比對

### 3.1 目標

- 業主針對某客戶可上傳／查看 **服務前（before）**、**服務後（after）** 照片  
- 可並排或上下比對  
- 可註記拍攝日期、關聯預約（可選）、簡短說明  
- 僅 owner API；客人端不可見  
- **照片＝客戶個資／可能含身體影像** → 必須業主取得客戶同意（產品文案＋交付 SOP 必寫）

### 3.2 儲存方式：禁止與比較

| 方式 | 結論 |
|------|------|
| **GitHub Pages／repo** | ❌ **禁止**（公開靜態、進 git 歷史難刪、不適合個資） |
| **前端 localStorage／IndexedDB** | ❌ **禁止**（換機遺失、非伺服器控管、易外洩、無法多裝置） |
| **Notion Files & media** | 🟡 可作小量 Demo；見下表 |
| **Cloudflare R2** | ✅ **正式商品版建議** |

#### Notion file vs Cloudflare R2

| 比較 | Notion file／外部檔案屬性 | Cloudflare R2 |
|------|---------------------------|---------------|
| 取得難度 | 與現有 Notion 同生態 | 需建 bucket、binding、權限 |
| 容量／費用 | Notion 方案限制、不適合大量原圖 | 物件儲存較適合圖片商品化 |
| 存取控制 | 依賴 Notion token；難做短時簽名 URL | Worker 發 **簽章 URL** 或經 Worker 串流，易做 owner-only |
| 刪除／合規 | 刪除體驗與稽核較弱 | 可明確 delete object；較好做保留政策 |
| 商品複製 | 每客戶 Notion 附檔難標準化 | 每客戶一 bucket 或前綴 `clientId/userId/…` 較好複製 |
| Demo | 快速驗證 UI | 正式路徑 |

**建議**：

- **Phase 2 Demo／內部驗證**：可暫用 Notion 檔案屬性（若堅持不碰 R2），但文件須標「非正式」。  
- **正式商品版／加購交件**：**Cloudflare R2** + Worker 上傳授權（owner only）+ 短時讀取 URL。  
- **metadata**（誰的照片、before/after、日期）放 **D1／Notion 資料列**；**二進位只放 R2**。

### 3.3 建議正式架構（R2）

```text
業主 LIFF
  → Owner API（Bearer + requireOwnerFromRequest）
    → 核發上傳用預簽／或 multipart 經 Worker
    → 物件寫入 R2：photos/{studioOrEnv}/{userId}/{photoId}.jpg
    → metadata 寫入 DB（customer_photos 表或 Notion DB）
  → 列表／比對時：Worker 回短時 signed GET URL（勿把 bucket 公開）
```

#### Metadata 表草案（D1 優先；Notion 可對應一 DB）

| 欄位 | 說明 |
|------|------|
| `id` | 照片紀錄 id |
| `user_id` | LINE userId |
| `kind` | `before`／`after` |
| `r2_key` | 物件鍵（非公開 URL 永久字串給前端存） |
| `content_type` | image/jpeg 等 |
| `taken_at`／`created_at` | 時間 |
| `booking_id` | 可選，關聯預約 |
| `caption` | 可選說明 |
| `consent_noted` | 可選：業主勾選「已取得客人同意」時間戳 |

Notion 對應：獨立 DB `customer_photos`（檔案屬性＋ userId＋before/after select）— **僅建議非正式**。

### 3.4 Owner API 規劃（Phase 2 草案）

| Method | Path（建議） | 說明 |
|--------|--------------|------|
| GET | `/api/owner/customer-photos?userId=` | 列表 metadata＋短時 url |
| POST | `/api/owner/customer-photos/upload-url` | 要上傳授權（presign） |
| POST | `/api/owner/customer-photos` | 確認寫入 metadata（上傳完成後） |
| DELETE | `/api/owner/customer-photos?id=` | 刪 metadata＋R2 物件 |

皆須 `requireOwnerFromRequest`。  
限制：檔案類型（jpeg／png／webp）、大小上限、每客戶張數上限。

### 3.5 owner-admin UI 規劃（Phase 2）

| 區塊 | 行為 |
|------|------|
| 客戶詳情 →「前後照片」 | 兩欄：Before／After；可選日期篩選 |
| 上傳 | 選 before 或 after；上傳前 checkbox：「我已取得客戶同意使用此影像於店內紀錄」 |
| 比對 | 並排顯示；可放大（簡易 lightbox） |
| 刪除 | 二次確認 |
| 空狀態 | 說明用途＋同意提醒，無圖示亦可 |

### 3.6 安全與隱私（Phase 2 加重）

見第 5 節；交付時需給業主**書面／畫面提示**：取得同意、不得轉傳、停業資料如何處理。

### 3.7 Phase 2 驗收標準

- [ ] 僅業主可上傳／看／刪  
- [ ] 客人端與公開 Pages **無**照片 URL 長期曝露  
- [ ] 物件不在 GitHub／localStorage  
- [ ] 正式路徑使用 R2（或文件標明 Demo-only Notion file）  
- [ ] 上傳流程有「已取得同意」勾選（最低產品要求）  
- [ ] 刪除後列表與 R2 物件皆無（或符合保留政策說明）  

### 3.8 Phase 2 Rollback

| 層 | 做法 |
|----|------|
| 程式 | 關閉照片路由與 UI；redeploy |
| R2 | 可保留物件或依客戶要求批次刪除（合約／維護流程） |
| metadata | 表可留空；停止寫入即可 |
| Notion file Demo | 移除屬性顯示；檔案可手動清 |

---

## 4. 涉及檔案（實作階段預計）

> 本規劃任務**不修改**下列檔案；僅列出未來實作觸及範圍。

### Phase 1 預計

| 檔案 | 變更 |
|------|------|
| `backend/src/notion.js`（或未來 `d1-repository.js`） | 讀寫 `客戶注意事項`／`care_notes`；upsert |
| `backend/src/index.js` | notes 路由 + `requireOwnerFromRequest` |
| `owner-admin/js/api.js`、`app.js`、`index.html`、`css/style.css` | 詳情區 UI |
| `docs/owner/**` | sync |
| `product-docs/CLIENT-NOTION-SETUP-FLOW.md` 等 | 補欄位／加購說明 |
| （可選）`product-docs/PRICING-PACKAGES.md` | 標成進階／加購 |

### Phase 2 預計

| 檔案 | 變更 |
|------|------|
| `backend/wrangler.toml` | R2 binding（**實作任務才改**） |
| `backend/src/*` | upload／list／delete、簽章 URL |
| `owner-admin/**`、`docs/owner/**` | 照片 UI |
| 隱私／交付 SOP | 同意與資料處理說明 |
| **不可** | `customer-ui/**` 顯示照片；**不可**把圖塞進 `docs/` 當靜態資源 |

### 明確不改（規劃與實作皆然，除非另開任務）

- 客人端為了「給客人看自己的照片」（屬另一產品決策）  
- 基礎款強制所有客戶開 R2  

---

## 5. 安全與隱私規則

| 規則 | 說明 |
|------|------|
| Owner only | 所有 notes／photos API 經 `requireOwnerFromRequest` |
| 前端無 Token | config 僅 LIFF／API URL |
| 注意事項不上客人 API | 即使同 userId，客人 booking DTO 不含 `careNotes` |
| 照片不上 GitHub Pages／repo | 禁止 |
| 照片不上 localStorage | 禁止 |
| 正式版用 R2 + 短時 URL | 禁止公開 bucket list |
| **個資同意** | 照片、健康相關備註（過敏等）→ 業主責任取得同意；產品需提示 |
| 最小必要 | 張數／大小／保留期限寫進加購條款（建議） |
| 日誌 | 勿把照片 base64、完整備註打進公開 log |
| Secret | R2 金鑰僅 Cloudflare binding／Secret；不進 git、不進本任務文件真值 |

---

## 6. 不做範圍

| 不做 | 原因 |
|------|------|
| Phase 1＋2 一次做完卻無審查 | 風險高；先 notes 再 photos |
| 客人端編輯注意事項／看照片 | 隱私與產品範圍 |
| 把備註寫進每筆 booking 當正式方案 | 資料模型錯誤 |
| AI 膚質分析、自動修圖 | 超範圍 |
| 公開圖庫、社群分享按鈕 | 個資風險 |
| 多租戶共用一個公開 bucket 無前綴隔離 | 安全 |
| 本規劃任務改程式／commit／deploy | 本檔只規劃 |
| 未取得同意流程就上生產照片 | 合規風險 |

---

## 7. 與報價／母版關係

| 項目 | 建議 |
|------|------|
| 基礎款 v1.0 | **不含**注意事項編輯、**不含**照片 |
| 進階／加購名稱（草案） | 「進階客戶管理：注意事項」／「前後照片比對（R2）」 |
| 安裝包 | Phase 1 啟用前檢查 customers；Phase 2 檢查 R2 binding |
| D1 | `care_notes` 與 `customer_photos` metadata 納入後續 migration 規劃 |

---

## 8. 驗收標準（總表）

### Phase 1

見 §2.6。

### Phase 2

見 §3.7。

### 共用

- [ ] `node --check` 相關 JS  
- [ ] owner-admin ↔ docs/owner 同步（若有改前端）  
- [ ] secret grep 無硬編碼  
- [ ] 手機 LIFF 業主實機：讀寫備註（與照片，若 Phase 2）  
- [ ] 客人實機：確認看不到上述內容  

---

## 9. Rollback 方式（總表）

| 階段 | Rollback |
|------|----------|
| Phase 1 | 撤 API／UI commit → deploy／Pages 回舊版；DB 欄位可留 |
| Phase 2 | 關路由＋UI；R2 依合約清或保留；撤 wrangler R2 需謹慎（先停程式再改 binding） |
| 錯誤上到正式 | 立即 redeploy 上一 Worker version；通知停用照片上傳 |

---

## 10. 建議實作拆單（Codex 通過後）

| 建議任務包 | 範圍 |
|------------|------|
| `TASK-owner-customer-notes-phase1.md` | customers 欄位＋notes API＋owner UI＋Fallback D |
| `TASK-owner-customer-photos-r2-phase2.md` | R2 binding、metadata、上傳／比對 UI、同意文案 |
| （可選）Notion file Demo spike | 僅內部驗證 UI，不交正式客戶 |

---

## 11. 本任務包 DoD

- [x] 產出 `TASK-owner-customer-notes-photos.md`  
- [ ] 未修改程式與 `.dev.vars`／未 deploy  
- [ ] 不含 secret 真值  
- [ ] 回報 Codex；**預設不 commit**  

---

*文件版本：1.0｜進階客戶管理：注意事項＋前後照片｜僅規劃不實作｜不含 Token／密碼／真實客戶資料*
