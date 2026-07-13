# Cursor 任務包：業主端「月曆預約查詢」

> **專案**：`beauty-studio-booking`  
> **檔案**：`TASK-owner-calendar-bookings.md`  
> **建立日期**：2026-07-14  
> **狀態**：待執行（本文件僅整理任務，**不實作**）  
> **產品定位**：**基礎買斷版／建置加維護版**應包含的功能（**不是加購**）  
> **前置**：`TASK-owner-booking-date-query.md` 已完成（單日日期選擇 + 列表；為月曆版過渡）

---

## 0. 產品定位（必讀）

| 項目 | 說明 |
|------|------|
| **屬於哪個方案** | **基礎款**（標準預約系統的一部分） |
| **是否加購** | **否** — 不另計加購費 |
| **與加購模組界線** | 「堂數卡／儲值管理」見 `TASK-addon-package-cards.md`，與本任務無關 |

### 基礎款必須支援（本任務交付範圍）

- 業主看到**整個月**月曆
- 有預約的日期以**顏色或圓點**標示
- **點日期**後顯示當日預約清單
- 每筆顯示：**客人姓名、服務項目、預約時段、狀態**（已確認／已取消；已取消淡化）

> 現況 `f928692` 僅有單日 `<input type="date">` 查詢；本任務為**基礎款第一版應補齊**的業主預約查看體驗。

---

## 1. 目標

將 owner-admin「預約查詢」升級為**月曆模式**：業主一眼看到整月哪天有預約，點選日期後在下方查看當日詳細清單。

### 使用者故事

> 我是店長，想先看這個月哪些天比較滿，再點某一天看是誰預約、幾點、什麼服務。

### 第一版要做

- 月曆格狀 UI（手機友善）
- 有預約的日期視覺標示（建議：主色底／小圓點）
- 點日期 → 下方顯示當日預約列表
- 每筆顯示：**客人姓名、服務名稱、預約日期、預約時段、狀態（已確認／已取消）**
- 已取消預約在列表中**淡色弱化**（沿用現有樣式）
- Owner 權限由後端 `requireOwnerFromRequest` 驗證
- 資料經 Workers API 讀 Notion，**前端不直連 Notion**

### 第一版不做

- 拖曳改期
- Google Calendar 同步
- 自動提醒／推播
- 業主在 App 內取消或編輯預約
- 週視圖／年視圖
- 匯出報表

---

## 2. 涉及檔案

### 後端（預計）

| 檔案 | 變更 |
|------|------|
| `backend/src/index.js` | 新增 `GET /api/owner/bookings/month` 路由 |
| `backend/src/notion.js` | 新增 `getOwnerBookingsForMonth(env, month)`（或獨立 `bookings.js`） |

### 業主前端（預計）

| 檔案 | 變更 |
|------|------|
| `owner-admin/index.html` | 預約查詢區改月曆 + 當日列表結構 |
| `owner-admin/js/app.js` | 月曆渲染、月份切換、選日、列表 |
| `owner-admin/js/api.js` | `getBookingsForMonth(month)` |
| `owner-admin/css/style.css` | 月曆格、標記、選中態、手機排版 |

### 部署產物

| 檔案 | 變更 |
|------|------|
| `docs/owner/**` | `sync-github-pages.sh` 同步 |
| `docs/owner/index.html` | bump `?v=` |

### 文件（可選）

| 檔案 | 變更 |
|------|------|
| `TASK-owner-booking-date-query.md` | 標註已被月曆版取代／升級 |
| `product-docs/DEMO-ACCEPTANCE-*.md` | 驗收項補充（實作後） |

---

## 3. 不可修改的檔案

| 類別 | 說明 |
|------|------|
| `backend/.dev.vars` | 本機密碼，實作階段亦不可 commit |
| `customer-ui/**` | 客人端不受影響 |
| Notion 四表 schema | 沿用 bookings 既有欄位，不新增表 |
| `owner-admin/js/liff-init.js` | 非必要不動 |
| Cloudflare Secrets 名稱清單 | 本任務不需新 Secret |
| `owner-admin/js/config.js` | 除非 bump 無關，否則不動 API URL |

---

## 4. 前端畫面設計

### 區塊 A：月份標題列

```
◀  2026年7月  ▶
```

- 左右切換上／下月
- 可選「今天」按鈕回到當月並選今日

### 區塊 B：月曆格（7 欄 × 5～6 列）

- 表頭：日 一 二 三 四 五 六（台北週）
- 每格：日期數字
- **有預約（僅已確認）**：主色淡底或右下角小圓點（`--primary`）
- **僅有已取消、無已確認**：可選灰色小點（避免與滿檔混淆，產品可簡化為「有任何預約都標記」）
- **今天**：外框強調
- **選中日期**：實心底 + 白字
- **非本月日期**：灰字（若顯示上月尾／下月頭）

### 區塊 C：當日預約列表（點日期後）

標題：`7月20日（週一）預約 — 共 N 筆`

每張卡片：

| 欄位 | 顯示 |
|------|------|
| 預約時段 | 大字，例 `10:00` |
| 服務名稱 | |
| 客人姓名 | |
| 預約日期 | `2026/07/20`（與選中一致，可選顯示） |
| 狀態 | 標籤：已確認（綠）／已取消（灰、整卡淡化） |

空狀態：`此日期尚無預約`

### 視覺原則

- 最大寬度維持 ~520px（沿用 `.app`）
- 月曆格最小點擊區 44px 高
- 不引入大型 UI 框架；純 HTML + CSS + 既有 JS 風格

---

## 5. 手機操作流程

1. 業主 LINE 開啟管理頁 → 點「預約查詢」Tab  
2. 預設顯示**當月**月曆，**今天**為選中狀態  
3. 下方顯示今日預約列表  
4. 業主點其他日期 → 月曆選中態更新 → 下方列表刷新  
5. 業主點 `◀` `▶` 換月 → 重新載入該月資料 → 保留或清除選日（建議：換月後選該月 1 日或維持無選中直至再點）  
6. 業主點「今天」→ 跳回當月 + 選今日 + 載入列表  

**不需**業主開啟 Notion App。

---

## 6. API 設計

### 新增（建議）

```
GET /api/owner/bookings/month?month=YYYY-MM
Authorization: Bearer <LINE ID Token>
```

| 參數 | 必填 | 說明 |
|------|:----:|------|
| `month` | ✅ | 例 `2026-07`，以**台北時區**理解該月 1 日～月末 |

### 回應格式（建議）

```json
{
  "month": "2026-07",
  "timezone": "Asia/Taipei",
  "days": {
    "2026-07-20": {
      "total": 3,
      "confirmed": 2,
      "cancelled": 1,
      "bookings": [
        {
          "id": "...",
          "customerName": "王小美",
          "serviceName": "基礎臉部護理",
          "date": "2026-07-20",
          "time": "10:00",
          "status": "已確認"
        }
      ]
    }
  },
  "summary": {
    "2026-07-20": { "total": 3, "confirmed": 2, "cancelled": 1 }
  }
}
```

**實作簡化選項**：`days` 內直接放 `bookings` 陣列；`summary` 供月曆標記用（避免前端重算）。

### 沿用（向後相容）

```
GET /api/owner/today?date=YYYY-MM-DD
```

- 月曆版可**只呼叫 month API**，選日後從 `days[date].bookings` 取資料，無需再打 today  
- 或選日時 fallback 呼叫 today（多一次請求，不建議）

### 錯誤回應

| 情況 | HTTP | message |
|------|------|---------|
| 缺 `month` | 400 | 缺少 month 參數（YYYY-MM） |
| 格式錯誤 | 400 | month 格式錯誤 |
| 無 Bearer | 401 | 缺少登入憑證 |
| 非業主 | 401/403 | 無權限 |

---

## 7. Notion 資料讀取方式

### 資料來源

- 資料庫：`NOTION_DATABASE_BOOKINGS`（既有）
- 欄位：沿用 `parseBookingPage`（預約日期、預約時段、客人姓名、服務名稱、狀態）

### 查詢策略（建議一次查整月）

```javascript
// 篩選：預約日期 on_or_after 月初 AND on_or_before 月末
// 狀態：已確認 OR 已取消（與 getTodayBookingsForOwner 一致）
```

在 `notion.js` 新增：

```javascript
export async function getOwnerBookingsForMonth(env, month) {
  // month = "2026-07" → start = 2026-07-01, end = 2026-07-31
  // queryDatabase + filter compound
  // group by date in JS
  // sort each day by time
}
```

### 注意事項

- 使用 **Asia/Taipei** 計算月初／月末（與 `getTaipeiDateString` 一致）
- Notion `date` 欄位為 `預約日期`（date 類型，無時間）
- 分頁：若單月預約量極大，沿用既有 `queryDatabase` 分頁邏輯（現有 helper 若已處理 `has_more` 則複用）
- **禁止**在前端帶 `NOTION_TOKEN`

---

## 8. 安全檢查

| 項目 | 要求 |
|------|------|
| Owner 驗證 | 路由內 `await requireOwnerFromRequest(request, env)` |
| 前端 | 僅 `API_BASE_URL` + LIFF_ID，無 secret |
| CORS | 維持既有 `Access-Control-Allow-Origin: *`（與現案一致） |
| 資料範圍 | 業主 API 回傳**全店**當月預約（單店系統設計如此） |
| 日誌 | deploy／測試時不印 `NOTION_TOKEN`、不印客人完整個資於公開 log |
| commit | 不 commit `.dev.vars` |

### 實作後自檢

```bash
# 前端
grep -R "NOTION_TOKEN\|secret_" owner-admin docs/owner

# 無 Bearer 應 401
curl -s "https://<worker>/api/owner/bookings/month?month=2026-07"
```

---

## 9. 驗收標準

### 月曆

- [ ] 顯示當月月曆格（週日至週六）
- [ ] 可切換上／下月
- [ ] 有預約的日期有視覺標記（色塊或圓點）
- [ ] 可點選任一日，選中態清楚
- [ ] 「今天」快捷可用

### 當日列表

- [ ] 顯示：客人姓名、服務名稱、預約日期、預約時段、狀態
- [ ] 已確認：正常顯示
- [ ] 已取消：淡色弱化 + 狀態標籤「已取消」
- [ ] 無預約日期：友善空狀態

### 權限與架構

- [ ] 非業主無法取得 month API 資料
- [ ] 前端未直連 Notion
- [ ] 客人端、其他 Tab 迴歸正常

### 明確不驗收

- [ ] ~~拖曳改期~~
- [ ] ~~Google Calendar~~
- [ ] ~~推播提醒~~

---

## 10. 測試方式

### 靜態

```bash
node --check backend/src/index.js
node --check backend/src/notion.js
```

### API（需業主 Bearer Token）

```bash
# 整月
curl -s -H "Authorization: Bearer <ID_TOKEN>" \
  "https://<worker>/api/owner/bookings/month?month=2026-07"

# 無權限
curl -s "https://<worker>/api/owner/bookings/month?month=2026-07"
# 預期 401
```

**檢查點**：

- `days` 含已知有預約的日期（例週一 2026-07-20）
- `confirmed` / `cancelled` 計數正確
- `bookings[].status` 含已確認與已取消

### 前端（LINE 實機）

1. 開啟預約查詢 → 當月有標記  
2. 點有預約日 → 列表筆數與 API 一致  
3. 點無預約日 → 空狀態  
4. 換月 → 標記更新  
5. 確認已取消列為淡色  

### 迴歸

- 服務項目、營業時段、店面設定 Tab 正常

---

## 11. 風險

| 風險 | 等級 | 說明 | 緩解 |
|------|------|------|------|
| 單月預約量大，API 慢 | 中 | Notion 查詢逾時 | 分頁查完；未來可加快取 |
| 時區導致月初邊界錯日 | 中 | UTC vs 台北 | 一律 `Asia/Taipei` 算月初末 |
| 月曆格太小不好點 | 中 | 手機誤觸 | min-height 44px、gap 適當 |
| LINE WebView 快取舊 JS | 中 | 看不到月曆 | bump `?v=` |
| 與單日 API 行為不一致 | 低 | 資料不同步 | 共用 `parseBookingPage` + 同一篩選規則 |
| deploy 影響正式環境 | 中 | 後端變更 | Codex 審查後 deploy |

---

## 12. Rollback 方式

### 僅前端回退

1. `git revert` 前端 commits  
2. `./scripts/sync-github-pages.sh`  
3. bump `?v=`，push `docs/owner`（需審查）  
4. 恢復單日日期選擇器 UI（`f928692` 版本）

### 含後端回退

1. `git revert` `index.js` / `notion.js` 月曆相關變更  
2. `npx wrangler deploy`（需 Codex 審查）  
3. 前端可繼續呼叫 `/api/owner/today?date=`（舊 API 保留）

### 功能開關（可選，實作時）

- 若擔心一次上線風險，可加 `settings` 或 config 旗標 `calendarViewEnabled`（本任務包不強制）

---

## 13. 建議實作順序

1. 後端 `getOwnerBookingsForMonth` + 路由 + 本機 `wrangler dev` 測試  
2. `owner-admin/js/api.js` 新增 `getBookingsForMonth`  
3. 月曆 UI + 選日邏輯（先假資料對接）  
4. 接上 API，替換單日 `input[type=date]` 為月曆（或並存一版後移除）  
5. sync `docs/owner` + bump `?v=`  
6. deploy 後端（Codex 審查）→ 實機驗收  

---

## 14. 與現有「預約查詢」的關係

| 現況（`f928692`） | 月曆版 |
|-------------------|--------|
| Tab「預約查詢」 | 保留 Tab 名稱 |
| `<input type="date">` | 改為月曆格（可移除 date input） |
| `GET /api/owner/today?date=` | 新增 `GET /api/owner/bookings/month`；**保留 today 向後相容** |
| 列表卡片樣式 | 複用 `booking-card` / `booking-card--cancelled` |

---

*任務包版本：1.0｜beauty-studio-booking｜不實作、不含任何 Token*
