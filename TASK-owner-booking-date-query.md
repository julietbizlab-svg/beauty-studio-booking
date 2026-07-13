# Cursor 任務包：業主端「預約日期查詢」

> **專案**：`beauty-studio-booking`  
> **檔案**：`TASK-owner-booking-date-query.md`  
> **建立日期**：2026-07-14  
> **狀態**：已完成（單日查詢）；月曆完整體驗見 `TASK-owner-calendar-bookings.md`（**基礎款**應補齊）  
> **產品定位**：本任務為**基礎款**過渡實作（單日選擇器）；**月曆預約查詢不是加購**，屬基礎款標準功能。  
> **優先級**：中（業主體驗優化，不影響客人端）

---

## 1. 目標

讓個人工作室業主可以在**手機 LINE 管理頁**上，選擇任意日期查看該日預約清單，不必打開 Notion。

### 使用者故事

> 我是店長，明天要排班，我想在手機上看「明天有誰預約、幾點、什麼服務、有沒有取消」，不要只看今天。

### 第一版範圍（要做）

- 業主可選日期（`YYYY-MM-DD`）
- 查詢該日預約並列表顯示
- 每筆顯示：**預約時間、客人姓名、服務名稱、狀態**
- 手機版好點、好讀
- Owner 權限仍由後端 `requireOwnerFromRequest` 驗證

### 第一版範圍（不做）

- ~~月曆 UI~~ → 已獨立為基礎款任務 `TASK-owner-calendar-bookings.md`（**非加購**）
- 週視圖、拖曳改期
- 業主在 App 內取消／改預約（維持客人自行取消）
- 匯出報表、統計
- 多員工篩選

---

## 2. 現況分析（實作前必讀）

| 項目 | 現況 | 與需求的差距 |
|------|------|----------------|
| 業主 Tab | 名稱為「今日預約」 | 文案易誤導，以為只能看今天 |
| 日期選擇器 | `owner-admin/index.html` 已有 `#today-date` | 已有，但 UX 不夠清楚 |
| API | `GET /api/owner/today?date=YYYY-MM-DD` | **已支援任意日期**（參數可選，預設今天） |
| 後端查詢 | `getTodayBookingsForOwner(env, date)` | 僅回傳狀態 **「已確認」**，不含「已取消」 |
| 前端列表 | `renderToday()` | **未顯示狀態**；空資料文案固定「今日尚無預約」 |
| 權限 | `requireOwnerFromRequest` | ✅ 已符合，須維持 |

**結論**：第一版以**前端 UX 強化為主**；後端可小改（顯示狀態、空文案語意），**不必**新建複雜 API，除非要更語意化的路徑別名。

---

## 3. 涉及檔案

### 預計修改

| 檔案 | 變更類型 |
|------|----------|
| `owner-admin/index.html` | Tab／區塊文案、列表結構、手機版面 |
| `owner-admin/js/app.js` | 查詢邏輯、渲染（含狀態）、空狀態文案、日期變更行為 |
| `owner-admin/js/api.js` | 可選：方法重新命名或包裝（`getBookingsByDate`） |
| `owner-admin/css/style.css` | 列表卡片、狀態標籤、日期列手機排版 |
| `docs/owner/**` | `sync-github-pages.sh` 同步產物 |
| `docs/owner/index.html` | bump `?v=` 版本號 |

### 後端（視方案，可能小改）

| 檔案 | 變更類型 |
|------|----------|
| `backend/src/index.js` | 可選：新增別名路由或擴充 query |
| `backend/src/notion.js` | 可選：`getTodayBookingsForOwner` 改為含「已取消」或加 `status` 篩選 |

### 參考（只讀）

| 檔案 | 用途 |
|------|------|
| `TASK-owner-api-auth.md` | Owner API 安全 Phase 1 |
| `TASK-owner-api-auth-phase2.md` | 前端 Bearer Token |
| `product-docs/DEMO-ACCEPTANCE-2026-07-14.md` | 驗收範本 |

---

## 4. 不可修改檔案

實作時**不得**變更（除非 Codex 明確批准另開任務）：

| 類別 | 說明 |
|------|------|
| `backend/.dev.vars` | 本機密碼 |
| `customer-ui/**` | 客人端不受影響 |
| Cloudflare Secrets | 本任務不需新 Secret |
| Notion 資料表結構 | 沿用既有 bookings 欄位 |
| `owner-admin/js/liff-init.js` | 登入流程已穩定，非必要不動 |
| `owner-admin/js/config.js` | 除非 bump 無關，否則不動 API URL |

---

## 5. API：新增或沿用？

### 建議方案 A（優先）：沿用現有 API

```
GET /api/owner/today?date=YYYY-MM-DD
Authorization: Bearer <LINE ID Token>
```

**回應格式（現有）**：

```json
{
  "date": "2026-07-20",
  "bookings": [
    {
      "id": "...",
      "time": "10:00",
      "customerName": "王小美",
      "serviceName": "基礎臉部護理",
      "status": "已確認"
    }
  ]
}
```

- ✅ 已有 `requireOwnerFromRequest`
- ✅ 已支援 `date` 參數
- ⚠️ 路徑名稱 `today` 語意不佳（可前端抽象，不必急著改路由）
- ⚠️ 後端目前 Notion 篩選僅「已確認」→ 若產品要顯示「已取消」，需改 `notion.js`

### 建議方案 B（可選）：新增語意化別名

```
GET /api/owner/bookings?date=YYYY-MM-DD
```

- 內部可呼叫同一個 `getTodayBookingsForOwner`（或更名為 `getBookingsForOwnerByDate`）
- 舊路徑 `/api/owner/today` **保留**向後相容
- 前端改用新路徑，文件較好懂

### 不建議

- 用 query `userId` 傳業主身分（已廢棄，安全 Phase 2 已改 Bearer）
- 讓前端直連 Notion

---

## 6. 前端實作步驟

1. **調整 Tab／區塊文案**  
   - 將「今日預約」改為「預約查詢」或「預約查詢（依日期）」  
   - 保留進入預設為**今天**（`getTodayIso()`）

2. **強化日期選擇 UX（手機）**  
   - `#today-date` 維持 `type="date"`（iOS／Android 原生選擇器）  
   - `change` 事件自動查詢（已有，確認保留）  
   - 可加「今天」快捷按鈕（選填，建議做）  
   - 顯示目前查詢日期中文：`2026/07/20（週一）`

3. **列表渲染**  
   每筆卡片至少顯示：
   - 時間（大字，左側或頂部）
   - 服務名稱
   - 客人姓名（無則顯示「客人」）
   - 狀態標籤（已確認／已取消，不同顏色）

4. **空狀態文案**  
   - 依所選日期顯示：「此日期尚無預約」  
   - 勿再寫死「今日尚無預約」

5. **載入與錯誤**  
   - 查詢中顯示簡短提示（沿用 `#status`）  
   - 401 顯示「請用業主 LINE 重新開啟」

6. **API 層（可選整理）**  
   - `ownerApi.getToday(userId, date)` → 可包裝為 `getBookingsByDate(date)`  
   - **移除**多餘的 `userId` 參數傳遞（Bearer 已驗證，與 Phase 2 一致）

7. **同步與快取**  
   - `./scripts/sync-github-pages.sh`  
   - `docs/owner/index.html` bump `?v=`（必做，避免 LINE WebView 快取舊 JS）

---

## 7. 後端實作步驟

### 最小改動（若只顯示已確認預約）

- **可不改後端**，僅前端 UX + 顯示既有 `status` 欄位

### 建議改動（若需顯示已取消）

1. `notion.js` — `getTodayBookingsForOwner`：  
   - 改為查該日所有預約，或 `狀態 in (已確認, 已取消)`  
   - 維持依 `time` 排序

2. `index.js` — 可選新增：  
   ```  
   GET /api/owner/bookings?date=  
   ```  
   與 `/api/owner/today` 共用 handler

3. **維持** `await requireOwnerFromRequest(request, env)`，不可省略

4. 部署前：`node --check` 相關檔案；**deploy 需 Codex 審查**

---

## 8. 驗收標準

### 功能

- [ ] 業主從 LINE 開啟管理頁，進入「預約查詢」區塊
- [ ] 預設顯示**今天**的預約（若有）
- [ ] 可選**非今日**日期（例：2026-07-20），列表正確更新
- [ ] 每筆顯示：時間、客人姓名、服務名稱、狀態
- [ ] 該日無預約時，顯示友善空狀態（非錯誤）
- [ ] 不需開啟 Notion 即可完成查詢

### 權限與安全

- [ ] 非業主 LINE 帳號呼叫 API → `401`
- [ ] 無 `Authorization: Bearer` → `401`
- [ ] 前端未暴露 Notion Token

### 手機體驗

- [ ] 日期選擇器在 LINE WebView 可正常操作
- [ ] 列表可讀、不需橫向捲動
- [ ] 狀態標籤一眼可辨

### 迴歸

- [ ] 服務管理、營業時段、店面設定 Tab 不受影響
- [ ] 客人端預約流程不受影響

---

## 9. 測試方式

### 後端（curl，需業主 Bearer Token）

```bash
# 替換為正式 Worker URL 與有效 idToken
curl -s -H "Authorization: Bearer <ID_TOKEN>" \
  "https://<worker>/api/owner/today?date=2026-07-20"
```

**預期**：`200`，`bookings` 陣列，每筆含 `time`、`customerName`、`serviceName`、`status`

```bash
# 無 Token
curl -s "https://<worker>/api/owner/today?date=2026-07-20"
```

**預期**：`401`

### 前端（實機 LINE）

1. 業主 LINE 開啟管理頁  
2. 預約查詢 → 確認今天列表  
3. 改選未來有預約的日期 → 確認列表更新  
4. 改選無預約日期 → 空狀態文案正確  
5. （若有測試取消紀錄）確認「已取消」狀態顯示

### 語法檢查

```bash
node --check backend/src/index.js   # 若有改後端
node --check backend/src/notion.js  # 若有改後端
```

---

## 10. 風險

| 風險 | 等級 | 說明 | 緩解 |
|------|------|------|------|
| 僅顯示「已確認」 | 中 | 業主看不到已取消紀錄，以為資料不見 | 產品決策：是否顯示已取消；改 Notion 篩選 |
| Tab 改名造成熟客困惑 | 低 | 老用戶習慣「今日預約」 | 副標註「可選其他日期」 |
| LINE WebView 快取舊 JS | 中 | 改完看不到新 UI | 必 bump `?v=` |
| 後端 deploy 影響正式環境 | 中 | 若改 API | 先 Codex 審查；保留舊路由相容 |
| 日期時區 | 低 | 日期應一律台北 | 沿用 `getTodayIso()` / `getTaipeiDateString()` |

---

## 11. Rollback 方式

### 僅前端變更

1. `git revert <本任務 commit>`  
2. `./scripts/sync-github-pages.sh`  
3. bump `?v=` 後 push `docs/owner/`（需 Codex 審查 push）

### 含後端變更

1. `git revert` 後端相關 commit  
2. `cd backend && npx wrangler deploy`（需 Codex 審查）  
3. 確認 `/api/owner/today` 行為恢復

### 快速止血（不改程式）

- GitHub Pages 指回上一版 `docs/owner` commit（仍須審查）

---

## 12. 建議實作順序

1. 產品確認：列表是否顯示「已取消」  
2. 前端：文案 + 列表 + 狀態標籤 + 空狀態  
3. 後端（若需要）：放寬狀態篩選  
4. sync `docs/owner` + bump `?v=`  
5. 實機驗收 → 更新 `DEMO-ACCEPTANCE` 或客戶驗收紀錄

---

## 13. Codex 審查前檢查清單

- [ ] 未修改 `.dev.vars`、未 commit secret  
- [ ] Owner API 仍帶 Bearer、後端仍 `requireOwnerFromRequest`  
- [ ] 客人端未受影響  
- [ ] `git diff` 範圍符合本任務  
- [ ] 若 deploy／push：另附 🟨 Cursor 回報

---

*任務包版本：1.0｜beauty-studio-booking｜不實作、不 deploy、不含任何 Token*
