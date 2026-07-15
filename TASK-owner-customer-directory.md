# Cursor 任務包：業主端客戶資料頁第一版

> **專案**：`beauty-studio-booking`  
> **檔案**：`TASK-owner-customer-directory.md`  
> **建立日期**：2026-07-15  
> **狀態**：待執行（本文件僅整理任務，**不實作**）  
> **產品定位**：**基礎款**（業主查客戶名單與歷史預約；不是包卡／儲值加購）  
> **產品線**：美業個人工作室版  
> **前置**：owner Bearer 驗證（`requireOwnerFromRequest`）、`GET /api/owner/bookings/month`、booking 已含客人姓名／電話／生日（`e829c46`）

---

## 0. 產品定位（必讀）

| 項目 | 說明 |
|------|------|
| **屬於哪個方案** | 基礎買斷／建置加維護的**基礎查詢功能** |
| **是否依賴 customers 表** | **第一版否** — 只從既有 `bookings` 彙總 |
| **是否包卡／儲值** | **否** |
| **一句話** | 業主在 LINE 後台看「誰約過、電話多少、歷史預約」，資料來源是預約紀錄 |

### 現況 vs 目標

| 現況 | 目標 |
|------|------|
| 業主只能靠月曆／當日列表看單筆預約 | 有「客戶資料」頁，彙總成客戶名單 |
| 改名字或換電話難以對照歷史 | 列表可搜尋姓名／電話；點入看歷史預約 |
| customers DB 尚未設定 | **第一版不要求** `NOTION_DATABASE_CUSTOMERS` |

### 與「客人基本資料」的關係

| 功能 | 說明 |
|------|------|
| 客人端填姓名／電話／生日 | 已上線，寫入 **bookings** |
| 本任務業主客戶頁 | **讀 bookings** 聚合顯示 |
| 第二階段（另開任務） | 可選啟用 `customers` 表 upsert／查詢優化 |

---

## 1. 目標

在 `owner-admin` 新增「客戶資料」分頁，讓業主從既有 `bookings` 整理出客戶名單並查詢歷史預約。

### 使用者故事

> **業主**：我想輸入電話或姓名，快速找到客人，並看到她以前約過什麼、有沒有取消過。  
> **業主**：我不想先建 Notion customers 表也能用。

### 第一版要做

1. 後端依 bookings 彙總客戶列表（建議以 `LINE userId` 分組；無 userId 時保守降級）  
2. `GET /api/owner/customers?q=`：搜尋姓名、電話  
3. `GET /api/owner/customers/:userId/bookings`：該客戶歷史預約  
4. owner-admin「客戶資料」頁：列表＋搜尋＋點入詳情  
5. 詳情顯示服務、日期、時段、狀態、取消原因（若有）  
6. 列表欄位：姓名、電話、生日（若有）、最近預約日期、累計預約次數  
7. 全路由須 `requireOwnerFromRequest`  
8. sync `docs/owner` + bump `?v=`  
9. 必要時更新 `README.md` 或 `product-docs/PRODUCT-TEMPLATE-MASTER.md`

### 第一版不做（見 §9）

- Notion `customers` 表寫入／讀取（第二階段）  
- 包卡、儲值、剩餘堂數  
- 編輯／刪除客戶  
- 推播、匯出 CSV、金流  
- 新增 Cloudflare Secret、修改 `.dev.vars`

---

## 2. 涉及檔案（預計）

### 後端

| 檔案 | 變更 |
|------|------|
| `backend/src/notion.js` | 新增從 bookings 彙總客戶名單、依 `userId` 查歷史預約 |
| `backend/src/index.js` | 新增 owner customers 路由；套用 `requireOwnerFromRequest` |

### 業主前端

| 檔案 | 變更 |
|------|------|
| `owner-admin/index.html` | 新增「客戶資料」分頁 UI；bump `?v=` |
| `owner-admin/js/api.js` | `getCustomers(q)`、`getCustomerBookings(userId)` |
| `owner-admin/js/app.js` | 搜尋、列表、詳情渲染；權限錯誤處理 |
| `owner-admin/css/style.css` | 列表／詳情／搜尋樣式（手機優先） |

### 同步與文件

| 檔案 | 變更 |
|------|------|
| `docs/owner/**` | sync（`./scripts/sync-github-pages.sh` 或等效） |
| `README.md` | 可選：補 API 表 |
| `product-docs/PRODUCT-TEMPLATE-MASTER.md` | 可選：基礎款功能清單勾「客戶資料查詢」 |

### 不可修改

| 項目 | 說明 |
|------|------|
| `backend/.dev.vars` | 禁止 |
| Cloudflare Secrets | 禁止新增／修改（本任務不需新 secret） |
| `customer-ui/**` | 本任務不改客人端 |
| Notion schema 強制 | 第一版不新建 customers DB |

---

## 3. 資料來源與彙總規則（第一版）

### 來源

- 僅 `NOTION_DATABASE_BOOKINGS`
- 欄位至少使用既有：`LINE userId`、`客人姓名`、`客人電話`、`客人生日`、`服務名稱`、`預約日期`、`預約時段`、`狀態`、取消相關欄位

### 客戶一列如何定義

| 建議 | 說明 |
|------|------|
| **主鍵** | `LINE userId`（同一客人多次預約合併一列） |
| 姓名／電話／生日 | 取「最近一筆預約」上的值（或最後非空；實作擇一寫清） |
| 最近預約日期 | 該 userId 所有預約中最大的 `預約日期`（可再比時段） |
| 累計預約次數 | 該 userId 預約筆數（是否含已取消：建議**含**全部狀態，UI 顯示總次數；實作時在任務回報註明） |

### 搜尋 `q`

- 空白：回傳全名單（注意效能；若 bookings 過多可限制筆數並文件說明）  
- 有值：姓名 **或** 電話 包含關鍵字（大小寫／空白規則寫清）  
- **僅後端過濾**；前端不呼叫 Notion

### 無電話／無生日的舊預約

- 仍可顯示姓名與歷史；電話／生日欄空白  
- 不得因缺欄造成 API 500

---

## 4. 建議 API

### 4.1 客戶名單

```http
GET /api/owner/customers?q=
Authorization: Bearer <LINE LIFF ID Token>
```

**成功回應（示意）**：

```json
{
  "ok": true,
  "customers": [
    {
      "userId": "Uxxxx",
      "customerName": "王小美",
      "phone": "0912345678",
      "birthday": "1990-01-01",
      "lastBookingDate": "2026-07-20",
      "bookingCount": 3
    }
  ]
}
```

| 狀態 | 條件 |
|------|------|
| 401 | 無／無效 token |
| 403 | 非 owner |
| 200 | owner 且查詢成功 |

### 4.2 客戶歷史預約

```http
GET /api/owner/customers/:userId/bookings
Authorization: Bearer <LINE LIFF ID Token>
```

**成功回應（示意）**：

```json
{
  "ok": true,
  "userId": "Uxxxx",
  "customerName": "王小美",
  "phone": "0912345678",
  "birthday": "1990-01-01",
  "bookings": [
    {
      "id": "…",
      "serviceName": "臉部護理",
      "date": "2026-07-20",
      "time": "14:00",
      "status": "已確認",
      "cancelReason": "",
      "canceledBy": "",
      "canceledAt": ""
    },
    {
      "id": "…",
      "serviceName": "臉部護理",
      "date": "2026-07-10",
      "time": "11:00",
      "status": "已取消",
      "cancelReason": "臨時店休",
      "canceledBy": "業主",
      "canceledAt": "2026-07-09"
    }
  ]
}
```

| 規則 | 說明 |
|------|------|
| 排序 | 建議日期＋時段**由新到舊**（詳情頁好讀） |
| 已取消 | 必須帶 `status` 與 `cancelReason`（若有） |
| 無權限 | 401／403；**禁止**把完整客人列表暴露給非 owner |

---

## 5. Owner UI 建議

### 分頁

- 既有分頁旁新增：「客戶資料」（或同等文案）  
- 不影響預約月曆／服務／時段／店面設定

### 列表

| UI | 說明 |
|----|------|
| 搜尋框 | placeholder「搜尋姓名或電話」；輸入後查 API（可 debounce） |
| 卡片／列 | 姓名、電話、生日、最近預約、次數 |
| 空狀態 | 「尚無客戶資料」／「找不到符合的客戶」 |

### 詳情

| UI | 說明 |
|----|------|
| 頁首 | 姓名、電話、生日 |
| 歷史列表 | 服務、日期、時段、狀態；已取消淡化＋取消原因 |
| 返回 | 回客戶名單 |

### 手機

- 按鈕與點擊區夠大；避免桌機 dashboard 密度  
- 不顯示 LINE userId 給業主也可（內部 API 用即可）；若顯示需低調

---

## 6. 安全規則

1. **所有** customers API 必須 `await requireOwnerFromRequest(request, env)`  
2. 前端**不可**帶 Notion Token；只帶既有 Bearer ID Token  
3. 前端／`docs/owner` **不可**出現 `NOTION_TOKEN`、`secret_`、Cloudflare token  
4. 客人端（customer-ui）**不可**呼叫 owner customers API  
5. 回應勿放入多餘 PII；以名單與預約必要欄位為限  
6. 不修改 `.dev.vars`、不新增 secret  

---

## 7. 驗收標準

- [ ] 無 token／非 owner → **401／403**  
- [ ] owner 可見由 bookings 整理出的客戶名單  
- [ ] 可用**姓名**搜尋  
- [ ] 可用**電話**搜尋  
- [ ] 點客戶可看歷史預約（服務／日期／時段／狀態）  
- [ ] 已取消顯示狀態與取消原因（若有）  
- [ ] **不需要** Notion customers 表也能運作  
- [ ] `docs/owner` 與 `owner-admin` 同步  
- [ ] 前端／docs 無 token、secret  
- [ ] 未改 `.dev.vars`、未新增 Cloudflare secret  
- [ ] 未做包卡／儲值／customers 寫入  

---

## 8. 測試指令

```bash
node --check backend/src/index.js
node --check backend/src/notion.js
node --check owner-admin/js/api.js
node --check owner-admin/js/app.js
diff -rq owner-admin docs/owner
grep -R "NOTION_TOKEN\|LINE_CHANNEL_SECRET\|CLOUDFLARE_API_TOKEN\|secret_" owner-admin docs/owner
```

可選手動：

```bash
# 應 401（無 Authorization）
curl -sS "https://<worker>/api/owner/customers"

# owner 帶有效 Bearer 應 200 且有 customers 陣列
```

---

## 9. 不做／延後（第二階段另開任務）

| 項目 | 說明 |
|------|------|
| `NOTION_DATABASE_CUSTOMERS` | 第二階段再啟用／遷移 |
| 客戶備註、標籤、黑名單 | 延後 |
| 編輯姓名電話回寫 Notion | 延後（第一版唯讀彙總） |
| 包卡／儲值／堂數 | 見加購模組文件 |
| CSV／報表 | 延後 |
| 效能分頁／索引 | 客人量很大時再優化 |

---

## 10. 實作回報格式（完成實作後用）

🟨 Cursor 回報請貼給 Codex

1. 修改檔案  
2. 是否修改 `.dev.vars`  
3. 是否新增 secret  
4. API path  
5. 測試結果  
6. `git status --short`  
7. 是否 commit / deploy / push  

---

## 11. Codex 審查關注點

1. 是否真的只讀 bookings、未強依賴 customers DB  
2. owner 驗證是否漏接  
3. 搜尋是否只在後端、有無洩漏其他客人  
4. userId 缺漏／舊預約無電話時是否穩健  
5. docs/owner 是否同步、無 secret  

---

*文件版本：1.0｜任務：業主端客戶資料頁第一版｜狀態：待執行、不實作*