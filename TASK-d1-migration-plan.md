# Cursor 任務包：D1 資料層遷移規劃（v2）

> **專案**：`beauty-studio-booking`  
> **檔案**：`TASK-d1-migration-plan.md`  
> **建立日期**：2026-07-16  
> **狀態**：規劃中（本文件**只規劃，不實作**）  
> **產品定位**：基礎款 v1 Notion 版已可當 Demo／母版；本任務規劃 **v2 正式資料層改 Cloudflare D1**  
> **前置**：基礎款 v1.0 母版（見 `product-docs/BASELINE-V1-SNAPSHOT.md`）

---

## 0. 一句話目標

把資料流從：

```text
Workers → Notion API → Notion
```

改成：

```text
Workers → D1 → SQL
```

**前端 API path 盡量不變**；優先只換後端 data layer。  
**本任務包通過 Codex 審查前：不改程式、不改 wrangler、不 deploy、不 commit（除非 Codex 通過後另開指令）。**

---

## 1. 為什麼要遷到 D1

| 現況痛點（Notion） | D1 預期效益 |
|--------------------|-------------|
| 查詢／聚合慢（客人目錄、月曆、整庫掃） | SQL 索引＋本地查詢，較穩 |
| 欄位名一字錯就壞、schema 靠文件約束 | 正式 migration、型別清楚 |
| 每客戶複製 Notion 四表＋Integration 繁瑣 | SQL schema 可腳本化，商品化較好複製 |
| Rate limit／偶發 API 失敗 | Worker 內綁定 D1，少一層外網依賴 |
| 加購（包卡／儲值）難在 Notion 做交易一致 | SQL 交易／關聯較適合 |

**保留原則**：v1 Notion Demo／母版**不能壞**；遷移採分階段，可回退。

---

## 2. 目前 Notion 資料表對應

環境變數（現況）：

| 邏輯表 | Secret／變數 | 現況 |
|--------|--------------|------|
| services | `NOTION_DATABASE_SERVICES` | 必填 |
| slots | `NOTION_DATABASE_SLOTS` | 必填 |
| bookings | `NOTION_DATABASE_BOOKINGS` | 必填 |
| settings | `NOTION_DATABASE_SETTINGS` | 必填 |
| customers | `NOTION_DATABASE_CUSTOMERS` | **選用**（未設仍可預約；業主客戶頁目前從 bookings 聚合） |
| package_cards／stored_value | （規劃） | **未來加購，後端尚未實作** |

### 2.1 services（服務項目）

| Notion 欄位 | 類型 | JS 欄位 |
|-------------|------|---------|
| 服務名稱 | Title | `name` |
| 時長 | number | `durationMinutes` |
| 價格 | number | `price` |
| 說明 | rich_text | `description` |
| 狀態 | select：`上架`／`下架` | `status` |
| 排序 | number | `sortOrder` |
| page id | — | `id` |

### 2.2 slots（週營業時段）

| Notion 欄位 | 類型 | JS 欄位 |
|-------------|------|---------|
| 名稱 | Title | `name` |
| 星期 | select：`日`…`六` | `weekday` |
| 開始時間 | rich_text（文字 `HH:MM`） | `startTime` |
| 結束時間 | rich_text | `endTime` |
| 狀態 | select：`開放`／`關閉` | `status` |

### 2.3 bookings（預約）

| Notion 欄位 | 類型 | JS 欄位 |
|-------------|------|---------|
| 預約編號 | Title | `title` |
| LINE userId | rich_text | `userId` |
| 客人姓名 | rich_text | `customerName` |
| 客人電話 | rich_text／phone | `phone` |
| 客人生日 | date | `birthday` |
| 服務ID | rich_text | `serviceId` |
| 服務名稱 | rich_text | `serviceName` |
| 預約日期 | date | `date` |
| 預約時段 | rich_text | `time` |
| 狀態 | select：`已確認`／`已取消` | `status` |
| 取消原因 | rich_text | `cancelReason` |
| 取消者 | select：`客人`／`業主` | `canceledBy` |
| 取消時間 | date | `canceledAt` |

### 2.4 settings（店面設定，實務上通常 1 列）

| Notion 欄位 | JS 欄位 |
|-------------|---------|
| 品牌名稱 | `brandName` |
| 主色 | `primaryColor` |
| 公告文字 | `announcement` |
| 取消規則 | `cancelPolicy` |
| 是否收訂金 | `depositEnabled` |
| 訂金金額 | `depositAmount` |
| 銀行名稱／代碼／帳號／戶名 | `bankName`／`bankCode`／`bankAccount`／`bankAccountName` |
| 轉帳提醒文字 | `depositNote` |

### 2.5 customers（選用）

| Notion 欄位 | JS 欄位 |
|-------------|---------|
| 客人名稱 | `name` |
| LINE userId | `userId` |
| 電話 | `phone` |
| 生日 | `birthday` |
| LINE 暱稱 | `lineNickname` |
| 備註 | `note` |

> 業主「客戶資料」API（`GET /api/owner/customers`）**現況從 bookings 聚合**，不強制 customers 表。

### 2.6 未來加購（本遷移核心可不實作表，但 schema 預留位置）

| 規劃表 | 用途 | 來源文件 |
|--------|------|----------|
| `package_cards` | 包卡／堂數 | `TASK-addon-package-cards.md`、`product-docs/ADDON-PACKAGE-STORED-VALUE-MODULE.md` |
| `stored_value_accounts`（或同等） | 儲值帳戶 | 同上 |
| `usage_logs`／ledger（可選） | 扣堂／扣款紀錄 | 同上 |

**v2 D1 核心第一刀**：`services`、`slots`、`bookings`、`settings`（＋建議一併建 `customers`）。  
**加購表**：Phase 較晚或獨立任務，避免一次做太大。

### 2.7 現況後端讀寫入口（遷移時要接線的面）

主要集中在 `backend/src/notion.js`：`listServices`／`createService`／`updateService`、`listWeeklySlots`／`replaceWeeklySlots`、`getSettings`／`updateSettings`、各 bookings 查詢與 `createBooking`／`cancelBooking*`、`getOwnerCustomersFromBookings`、可選 `upsertCustomer`。  
路由面（`backend/src/index.js`）維持不變為目標。

---

## 3. D1 SQL schema 草案

> 以下為**草案**，實作時以 migration 檔為準；型別採 SQLite／D1 慣例。  
> ID：建議用 `TEXT` 主鍵（可沿用 Notion page id 遷移期，或新產生 UUID）。

### 3.1 `services`

```sql
CREATE TABLE services (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  price INTEGER,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '上架' CHECK (status IN ('上架', '下架')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_services_status_sort ON services (status, sort_order);
```

### 3.2 `slots`

```sql
CREATE TABLE slots (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  weekday TEXT NOT NULL CHECK (weekday IN ('日','一','二','三','四','五','六')),
  start_time TEXT NOT NULL,  -- 'HH:MM'
  end_time TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT '開放' CHECK (status IN ('開放', '關閉')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_slots_weekday_status ON slots (weekday, status);
```

### 3.3 `bookings`

```sql
CREATE TABLE bookings (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  user_id TEXT NOT NULL DEFAULT '',
  customer_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  birthday TEXT,                 -- 'YYYY-MM-DD' or NULL
  service_id TEXT NOT NULL DEFAULT '',
  service_name TEXT NOT NULL DEFAULT '',
  booking_date TEXT NOT NULL,    -- 'YYYY-MM-DD'
  booking_time TEXT NOT NULL,    -- 'HH:MM'
  status TEXT NOT NULL DEFAULT '已確認' CHECK (status IN ('已確認', '已取消')),
  cancel_reason TEXT NOT NULL DEFAULT '',
  canceled_by TEXT NOT NULL DEFAULT '' CHECK (canceled_by IN ('', '客人', '業主')),
  canceled_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_bookings_date_status ON bookings (booking_date, status);
CREATE INDEX idx_bookings_user_id ON bookings (user_id);
CREATE INDEX idx_bookings_date_time ON bookings (booking_date, booking_time);
```

### 3.4 `settings`

```sql
-- 實務上通常只有一列；用固定 id = 'default' 亦可
CREATE TABLE settings (
  id TEXT PRIMARY KEY,
  brand_name TEXT NOT NULL DEFAULT '',
  primary_color TEXT NOT NULL DEFAULT '',
  announcement TEXT NOT NULL DEFAULT '',
  cancel_policy TEXT NOT NULL DEFAULT '',
  deposit_enabled INTEGER NOT NULL DEFAULT 0, -- 0/1
  deposit_amount INTEGER,
  bank_name TEXT NOT NULL DEFAULT '',
  bank_code TEXT NOT NULL DEFAULT '',
  bank_account TEXT NOT NULL DEFAULT '',
  bank_account_name TEXT NOT NULL DEFAULT '',
  deposit_note TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 3.5 `customers`（建議建，即使第一階段寫入可選）

```sql
CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  birthday TEXT,
  line_nickname TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_customers_phone ON customers (phone);
```

### 3.6 加購預留（可放後續 migration，本階段可不建）

```sql
-- 範例骨架（細節另開加購任務）
-- CREATE TABLE package_cards (...);
-- CREATE TABLE stored_value_accounts (...);
-- CREATE TABLE usage_logs (...);
```

### 3.7 Migrations 檔案規劃

建議目錄（實作階段才建立，**本規劃任務不建立**）：

```text
backend/migrations/
  0001_init_core.sql          -- services, slots, bookings, settings, customers
  0002_indexes_tuning.sql     -- 若需補索引（可併入 0001）
  00xx_addon_packages.sql     -- 未來加購
```

| 項目 | 建議 |
|------|------|
| 工具 | Wrangler D1 migrations（`wrangler d1 migrations …`） |
| 環境 | 先 **local／獨立 preview Worker**，再考慮正式 |
| 命名 | 序號＋動詞，不可改已套用過的舊檔內容（只加新檔） |
| Rollback | D1 無完美「一鍵 undo」；以**向前修補 migration**＋資料備份為主；重大失敗則切回 Notion binding 的舊 Worker 版本 |

`wrangler.toml` 未來會加類似（**本任務不改檔**）：

```toml
# 規劃用範例 — 實作階段再寫入
# [[d1_databases]]
# binding = "DB"
# database_name = "beauty-studio-db"
# database_id = "<create 後填入>"
# migrations_dir = "migrations"
```

---

## 4. API 相容策略

### 4.1 不變（目標）

| 層 | 策略 |
|----|------|
| `customer-ui/**` | **不大改**；繼續打既有 path |
| `owner-admin/**` | **不大改** |
| `docs/**` | 僅在前端無 API 變更時可不改；若僅後端切換則 Pages 可不動 |
| HTTP path／method | 維持現有表（見下） |
| JSON 欄位語意 | DTO 盡量與現況 `notion.js` 回傳一致（camelCase：`durationMinutes`、`customerName`…） |

### 4.2 現有 API（應繼續可用）

| Method | Path |
|--------|------|
| GET | `/api/health` |
| GET | `/api/settings` |
| GET | `/api/services` |
| GET | `/api/slots`、`/api/slots/month` |
| POST | `/api/bookings` |
| GET | `/api/bookings/me` |
| POST | `/api/bookings/cancel` |
| GET | `/api/owner/today`、`/api/owner/bookings/month` |
| POST | `/api/owner/bookings/cancel` |
| GET／POST | `/api/owner/services`；PATCH `/api/owner/services/:id` |
| GET／POST | `/api/owner/slots` |
| GET／PATCH | `/api/owner/settings` |
| GET | `/api/owner/customers`、`/api/owner/customer-bookings` |

### 4.3 後端內部改法（建議）

```text
index.js（路由、權限、DTO）
    ↓
repository 介面（或薄封裝）
    ├── notion.js          ← v1 保留
    └── d1-repository.js   ← v2 新增
```

| 建議 | 說明 |
|------|------|
| Feature flag／env | 例如 `DATA_BACKEND=notion|d1`（實作時再定名；**不進前端**） |
| 優先換 data layer | `index.js` 業務規則（重疊、owner 驗證）盡量不動 |
| Owner 驗證 | 仍用 `requireOwnerFromRequest`；與 D1 無關 |
| Health | 可回報 `dataBackend: "d1"`（勿洩漏 secret） |

---

## 5. 遷移階段（Phased）

### Phase 1：D1 schema ＋ SQL migration（不接正式 API）

- [ ] 規劃／建立 D1 database（local＋遠端測試庫，**非**直接動生產共用 Demo 除非有隔離策略）  
- [ ] 新增 `migrations/0001_init_core.sql`  
- [ ] `wrangler.toml` 綁定（**另開實作任務才改**）  
- [ ] 本機 `wrangler d1 migrations apply` 驗證  
- [ ] **正式 API 仍走 Notion**

**完成標準**：migration 可重跑於乾淨 DB；無路由改讀 D1。

### Phase 2：建立 D1 repository layer

- [ ] 新增例如 `backend/src/d1-repository.js`（名稱可調）  
- [ ] 實作與 `notion.js` 對齊的讀寫函式（先 services／settings 也可）  
- [ ] 單元／手動 SQL 驗資料形狀與 DTO  
- [ ] **index.js 尚未切換**，或僅在非生產 flag 下試打

**完成標準**：repository 可獨立被呼叫測通；Notion 程式仍完整。

### Phase 3：services／settings 先改讀 D1

- [ ] 公開與 owner 的 services／settings 路由改走 D1（flag）  
- [ ] 寫入（新增服務、改設定）一併進 D1  
- [ ] 對照 Notion／D1 資料一致（若雙寫過渡則訂規則：只寫 D1 或雙寫）  
- [ ] 手機 LIFF：服務列表、店名主色、訂金顯示

**完成標準**：客人／業主看得到服務與設定；Notion 可暫時只讀或停寫該兩類。

### Phase 4：bookings／slots 改讀 D1

- [ ] slots 列表／整批取代  
- [ ] 月曆可用性、建立預約、取消、owner 月曆／今日、客戶目錄聚合  
- [ ] **重疊防呆、長時服務**邏輯回歸（最易踩坑）  
- [ ] 客人「我的預約」排序、業主取消原因

**完成標準**：完整預約閉環在 D1；實機驗收清單全過。

### Phase 5：移除 Notion 依賴或保留匯入工具

- [ ] 選項 A：正式環境關閉 Notion；Secrets 可逐步停用  
- [ ] 選項 B：保留 `notion.js`＋**一次性／工具型匯入**（Notion → D1）給舊客戶搬資料  
- [ ] **不一次刪光 Notion 程式**（本規劃明文禁止）  
- [ ] Demo 母版：可保留「Notion 版 tag／branch」或 `DATA_BACKEND=notion` 以便展示

### Phase 6：文件、SOP、客戶複製流程更新

- [ ] 更新 `INSTALLATION-PACKAGE-SOP.md`、`TEMPLATE-CLONE-GUIDE.md`、`CLIENT-NOTION-SETUP-FLOW.md`（改為選用／匯入）  
- [ ] 新客戶改為：建 D1 → apply migrations → 填 seed（服務／時段／設定）  
- [ ] 明確：`.dev.vars`／Secrets 清單變更（去掉四個 Notion DB ID 或改為選用）  
- [ ] 基礎款斷點文件：標註 **v2 D1**

---

## 6. 不做範圍（本遷移）

| 不做 | 原因 |
|------|------|
| 多租戶（一 DB 多店列） | 商品化仍建議一客戶一 Worker／一 D1（或明確隔離）；另案 |
| 金流 | 與資料層無關；基礎款仍只「顯示轉帳」 |
| 會員複雜權限／角色系統 | 維持 LINE owner 白名單 |
| 一次刪除 Notion 程式 | 需回退與匯入 |
| 直接改正式 Worker 當實驗場 | 先 local／preview／獨立 DB |
| 大改 customer-ui／owner-admin | 除非 DTO 不相容（應避免） |
| 一次做完包卡／儲值全模組 | 另開加購任務 |
| 本規劃任務內改 `backend/src/**`、`wrangler.toml`、`.dev.vars` | 本檔只規劃 |

---

## 7. 風險與對策

| 風險 | 影響 | 對策 |
|------|------|------|
| **現有 Demo 壞掉** | 成交展示中斷 | 遷移用 flag／獨立 Worker／獨立 D1；Notion Demo 路徑保留到 Phase 5 |
| **Notion 舊資料搬 D1** | 漏欄、ID 對應錯、電話／生日格式 | 寫匯入腳本：page id → `id`；先 dry-run；比對筆數與抽樣 |
| **D1 migration rollback** | 錯誤 schema 難瞬間還原 | 小步 migration；重要資料先匯出；壞了就 deploy 回上一版 Worker＋Notion |
| **手機 LIFF 實機** | 快取、登入、權限 | 每 Phase 結束用實機勾驗收；升 `?v=` 僅在前端真的有改時 |
| **slots 整批取代** | 誤刪時段 | 交易內刪＋插；失敗 rollback |
| **並發預約** | 雙重預約 | D1 交易＋以 date/time／服務佔用邏輯鎖；回歸重疊測試 |
| **customers 雙來源** | 聚合 vs 表不一致 | v2 可改「預約時 upsert customers＋列表讀表」，但 API 形狀不變 |
| **Secret 洩漏** | 文件寫入真實 ID | 本文件與後續任務包**禁止**貼 Token／database_id 真值 |

### Notion → D1 搬運建議步驟（工具，非本階段實作）

1. 用現有 `notion.js` 讀出四表（＋customers）。  
2. 正規化成 SQL row（日期 `YYYY-MM-DD`、時間 `HH:MM`、checkbox→0/1）。  
3. `INSERT` D1；保留 Notion page id 當主鍵以便對帳。  
4. 抽樣比對：服務數、開放時段、未取消預約、設定列。  
5. 切 flag 讀 D1 → 實機驗收 → 停寫 Notion。

---

## 8. 驗收方向（各 Phase 結束時）

### 技術

- [ ] migration apply 成功（clean DB）  
- [ ] `/api/health` 正常  
- [ ] 無 Bearer 的 owner API 仍 401  
- [ ] 前端 path 未被迫大改  

### 產品（Phase 4 後必做）

- [ ] 客人：登入、月曆、選空檔、長時不重疊、預約成功、我的預約、取消二次確認  
- [ ] 業主：登入、月曆、取消含原因、客戶資料、設定／服務／時段、訂金顯示  

### 安全

- [ ] Token／Secret 不進前端、不進本任務文件  
- [ ] `.dev.vars` 不 commit  

---

## 9. 建議 Cursor／Codex 下一步

1. **本文件**先給 **Codex 審查**（是否缺表、階段是否過粗、API 相容是否夠）。  
2. Codex 通過後，另開**實作任務包**（建議先 Phase 1 only）：  
   - 可改 `wrangler.toml`、新增 `migrations/`、仍不接正式 API。  
3. **不要**在本規劃階段 commit（除非 Codex 明確叫 commit 本 md）。  
4. **不要** deploy、不要 push、不要改正式 Secrets。  

### 建議實作任務拆單（通過後）

| 任務包建議名 | 範圍 |
|--------------|------|
| `TASK-d1-phase1-schema.md` | D1 建立＋0001 migration＋local apply |
| `TASK-d1-phase2-repository.md` | `d1-repository.js` 骨架＋services/settings |
| `TASK-d1-phase3-cutover-catalog.md` | services/settings 切 D1 |
| `TASK-d1-phase4-cutover-bookings.md` | slots/bookings 切 D1＋回歸 |
| `TASK-d1-phase5-import-tool.md` | Notion 匯入／降依賴 |
| `TASK-d1-phase6-docs-sop.md` | 安裝包／SOP 更新 |

---

## 10. 與現有文件的關係

| 文件 | 關係 |
|------|------|
| `product-docs/BASELINE-V1-SNAPSHOT.md` | v1 Notion 斷點；D1 為 v2，不覆蓋 v1 定義直到 Phase 6 |
| `product-docs/INSTALLATION-PACKAGE-SOP.md` | Phase 6 改「新客戶建 D1」 |
| `product-docs/CLIENT-NOTION-SETUP-FLOW.md` | 改為匯入／相容說明或標「v1」 |
| `product-docs/ADDON-PACKAGE-STORED-VALUE-MODULE.md` | 加購表跟 D1 migration 對齊，另案實作 |
| `TASK-owner-customer-directory.md` | 客戶目錄可在 D1 改為讀 `customers`＋bookings，API path 不變 |

---

## 11. 本任務包交付定義（Definition of Done）

- [x] 產出 `TASK-d1-migration-plan.md`  
- [ ] **未**修改 `backend/src/**`、`customer-ui/**`、`owner-admin/**`、`docs/**`、`.dev.vars`、`wrangler.toml`  
- [ ] 不含任何 secret／真實 Token  
- [ ] 回報 Codex；**預設不 commit**  

---

*文件版本：1.0｜D1 遷移規劃任務包｜僅規劃不實作｜不含 Token／密碼／真實客戶資料*
