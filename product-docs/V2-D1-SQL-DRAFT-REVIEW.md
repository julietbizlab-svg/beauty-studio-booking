# v2 D1 SQL 草稿唯讀審查報告

> **性質**：唯讀審查文件（未修改、未移動、未執行任何 SQL）  
> **分支**：`v2-d1`  
> **審查日期**：2026-07-18  
> **審查對象**：
> 1. `backend/beauty_studio_d1_import.sql`（91 行，純資料 INSERT）
> 2. `backend/juliet-ai-os-d1-schema-v1.0.0.sql`（420 行，schema）
> 3. `backend/juliet-ai-os-d1-schema-v1.0.1-fixed.sql`（416 行，schema）
>
> **不含**：token、secret、憑證。本文件僅描述結構，不複製個資內容。

---

## 1. 三份檔案角色與結構比較

### 1.1 兩份 schema（v1.0.0 vs v1.0.1-fixed）

兩份幾乎完全相同：同樣 15 張表、同樣欄位、同樣 CHECK 與 FK。唯一差異（以 `diff` 驗證）：

**v1.0.1-fixed 比 v1.0.0「少」了兩個索引**：

- `idx_services_tenant_status_sort`（services 依 tenant＋status＋sort_order 查詢）
- `idx_booking_items_booking`（booking_items 依 booking 查明細）

也就是說「fixed」版其實是**退步版**：刪掉了兩個日常查詢會用到的索引，沒有任何修正。除此之外兩檔逐字相同（含 `schema_versions` 都寫 `1.0.0`，v1.0.1 檔案版本號未同步更新，亦是缺陷）。

**Schema 定義的 15 張表**：
`tenants`、`locations`、`customers`、`line_accounts`、`staff`、`services`、`bookings`、`booking_items`、`payments`、`stored_value_accounts`、`stored_value_transactions`、`consent_records`、`notifications`、`audit_logs`、`schema_versions`

FK 設計一致：多租戶隔離以 `tenant_id` 為主，`ON DELETE RESTRICT` 為主、關聯明細 `CASCADE`（`line_accounts.customer_id`、`booking_items.booking_id`）、可選關聯 `SET NULL`。UNIQUE 鍵完整（`tenant_id+code`、`tenant_id+booking_no`、`tenant_id+line_user_id` 等）。

### 1.2 匯入檔（beauty_studio_d1_import.sql）

純資料 INSERT，共 12 種表、67 筆：tenants(1)、locations(1)、staff(1)、services(3)、booking_policies(1)、tenant_settings(8)、staff_schedules(1)、customers(1)、line_accounts(1)、appointments(13)、appointment_services(13)、appointment_status_logs(13)。

---

## 2. SQLite／Cloudflare D1 相容性

| 項目 | 評估 |
|------|------|
| 型別（TEXT／INTEGER）、CHECK、UNIQUE、FK、複合索引、`DESC` 索引 | ✅ SQLite／D1 皆支援 |
| `strftime('%Y-%m-%dT%H:%M:%fZ','now')` | ✅ 支援 |
| `INSERT OR IGNORE` | ✅ 支援 |
| `PRAGMA foreign_keys = ON;` | ⚠️ D1 預設即強制 FK；migration 內的 PRAGMA 可能被忽略，建議正式 migration 移除，避免依賴 |
| 匯入檔 `PRAGMA foreign_key_check` 註解 | ✅ 僅為註解，無害 |
| 時間一律 UTC ISO-8601 文字 | ✅ 符合 D1 慣例，與現有 Worker 程式相容 |

兩份 schema 本身皆可在 D1 直接執行，無語法阻擋。

---

## 3. 重複、衝突、缺漏與資料風險

### 3.1 最嚴重：匯入檔與 schema 完全對不上

匯入檔寫給「35 張表」的另一套 schema，這裡的兩份 schema 只有 15 張表。直接執行必定失敗：

| 匯入檔使用的表 | schema 是否存在 |
|----------------|-----------------|
| `appointments`、`appointment_services`、`appointment_status_logs` | ❌ 不存在（schema 叫 `bookings`、`booking_items`，且無 status log 表） |
| `booking_policies`、`tenant_settings`、`staff_schedules` | ❌ 三張表都不存在 |
| `tenants`、`locations`、`customers`、`line_accounts` | ✅ 存在，欄位大致相容 |
| `staff` | ⚠️ 表存在但欄位衝突：匯入用 `name`、`phone`；schema 是 `display_name`、`mobile`，且無 `location_id` 以外差異 |
| `services` | ⚠️ 表存在但欄位衝突：匯入用 `location_id`、`price`、`color`、`is_bookable`；schema 是 `price_amount`、`status`，無 `location_id`、`color`、`is_bookable` |

### 3.2 兩份 schema 之間

- 重複：99% 內容重複，屬同一份的兩個快照，不應同時保留。
- 衝突：v1.0.1-fixed 少兩個索引、版本號未改，檔名聲稱 fixed 實為 regression。

### 3.3 缺漏（相對 Demo v1 功能需求）

- 無 `tenant_settings`（公告、取消政策文字、訂金轉帳顯示資訊都存這裡）。
- 無 `staff_schedules`／時段表（Demo 的 slots 沒有落點）。
- 無 `booking_policies`。
- 無 `care_notes` 專欄或照片 metadata 表（roadmap Phase 5、6 需求，可後續 migration 補）。

### 3.4 資料風險

- 匯入檔含**真實個資與敏感資訊**：LINE userId、客戶顯示名稱、業主銀行代碼／帳號／戶名（在 `tenant_settings` INSERT 內）。**此檔絕不可進 git**，符合現行「不 add／不 commit」規則，且正式流程應改由匯入工具在本機產生。
- `payments`、`stored_value_*` 表與「本產品不做金流」的決策（`VERSION-ARCHITECTURE-ROADMAP.md`）有張力：可保留為預留 schema，但 v2 初期不應建 API。

---

## 4. 建議基礎

**以 `backend/juliet-ai-os-d1-schema-v1.0.0.sql` 為正式 migration 基礎**。

理由：

1. 與 v1.0.1-fixed 內容相同但多兩個必要索引；「fixed」版無任何實質修正。
2. 匯入檔不是 schema，不能當基礎；且其目標 schema（35 表版）不在 repo 內。

採用前必須先解決的阻擋：

1. **命名對齊**：決定 v2 正式用 `bookings` 還是 `appointments`（匯入檔與 schema 不一致）；建議依 schema 用 `bookings`，匯入檔重新產生。
2. **補三張缺漏表**：`tenant_settings`、`staff_schedules`（或 slots 對應表）、`appointment_status_logs` 對應的 `booking_status_logs`，否則 Demo v1 功能無法遷移。
3. **匯入檔重做**：依最終 schema 由匯入工具重新輸出，且含個資的產物永不進 git。

---

## 5. 建議正式 migration 拆分順序

依 `V2-BRANCH-AND-NAMING-RULES.md` 命名規則，放 `v2-d1` 分支 `backend/migrations/`：

| 檔名 | 內容 | 來源 |
|------|------|------|
| `0001_init_core.sql` | `tenants`、`locations`、`staff`、`services`、`customers`、`line_accounts` ＋ 對應索引 ＋ `schema_versions` | v1.0.0 節錄（移除 PRAGMA） |
| `0002_bookings.sql` | `bookings`、`booking_items`、新增 `booking_status_logs` ＋ 對應索引 | v1.0.0 ＋ 補表 |
| `0003_settings_schedules.sql` | 新增 `tenant_settings`、`staff_schedules`、`booking_policies` | 缺漏補齊（對齊匯入檔欄位） |
| `0004_ops_tables.sql` | `notifications`、`audit_logs`、`consent_records` | v1.0.0 |
| `0005_reserved_addons.sql`（暫緩） | `payments`、`stored_value_accounts`、`stored_value_transactions` | 預留；金流／儲值屬後期加購，v2 初期不建 API |
| （不進 git）資料匯入 | 由匯入工具依最終 schema 重新產生，本機執行 | 取代現有匯入檔 |

後續 roadmap Phase 5～6（`care_notes`、R2 照片 metadata）另開 `0006` 之後的 migration。

---

## 6. 三份草稿的處置建議（僅建議，未執行）

| 檔案 | 建議 |
|------|------|
| `juliet-ai-os-d1-schema-v1.0.0.sql` | 內容搬進編號 migration 後，原檔移 `_archive/`（不進 git） |
| `juliet-ai-os-d1-schema-v1.0.1-fixed.sql` | 淘汰（regression 版本），移 `_archive/` |
| `beauty_studio_d1_import.sql` | 含個資，永不進 git；schema 定案後重新產生 |

---

*文件版本：1.0｜唯讀審查｜未修改、未執行任何 SQL｜不含 token、secret、憑證*
