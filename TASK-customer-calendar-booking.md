# Cursor 任務包：客人端「月曆選日期」預約

> **專案**：`beauty-studio-booking`  
> **檔案**：`TASK-customer-calendar-booking.md`  
> **建立日期**：2026-07-14  
> **狀態**：待執行（本文件僅整理任務，**不實作**）｜Codex 審查決策已寫入 §14  
> **產品定位**：**基礎款**功能（**不是加購**）  
> **前置**：服務選擇 + `/api/slots` 單日查詢已存在；業主端月曆見 `TASK-owner-calendar-bookings.md`（已上線）

---

## 0. 產品定位（必讀）

| 項目 | 說明 |
|------|------|
| **屬於哪個方案** | 基礎買斷版／建置加維護版 |
| **是否加購** | **否** |
| **與加購界線** | 堂數卡／儲值見 `TASK-addon-package-cards.md`，與本任務無關 |

### 現況 vs 目標

| 現況 | 目標 |
|------|------|
| `<input type="date">` 選一天 | **月曆格**選一天 |
| 選服務 → 選日期 → 選時段 | **保留**相同三步驟 |
| 單日呼叫 `/api/slots` | 月曆用**月份摘要 API**；點日後載入時段 |

---

## 1. 目標

讓客人／學員在 LINE 預約頁以**月曆**選擇可預約日期，點日期後選時段並完成預約；手機上一眼看懂哪天能約。

### 使用者故事

> 我想先看這個月哪天還有空，再點那一天選具體時間，不要在一長串日期選單裡找。

### 第一版要做

1. 顯示**整月月曆**
2. **可預約**日期（業主有開放營業時段 + 仍有空檔）→ 可點、明顯樣式
3. **不可預約**（未開放／已過期／無空位）→ 灰色、不可點
4. 點日期 → 下方顯示**可預約時段**按鈕
5. 選時段 → **確認預約**（沿用 `POST /api/bookings`）
6. **保留**步驟 1 服務選擇流程
7. 手機操作簡單、視覺清楚

### 第一版不做

- 候補名單
- 付款／金流
- 多員工排班
- Google Calendar
- 拖曳改期
- 客人端月曆顯示「已約滿但可排隊」

---

## 2. 涉及檔案

### 後端（預計）

| 檔案 | 變更 |
|------|------|
| `backend/src/index.js` | 新增 `GET /api/slots/month` 路由 |
| `backend/src/slots.js` 或 `notion.js` | 新增 `getAvailableSlotsForMonth(env, month, serviceId)` |

### 客人前端（預計）

| 檔案 | 變更 |
|------|------|
| `customer-ui/index.html` | 以月曆區塊取代 `#date-input` |
| `customer-ui/js/app.js` | 月曆渲染、月份切換、選日、載入時段 |
| `customer-ui/js/api.js` | `getSlotsForMonth(month, serviceId)` |
| `customer-ui/css/style.css` | 月曆格、可約／不可約／選中／今天樣式 |

### 部署產物

| 檔案 | 變更 |
|------|------|
| `docs/js/**`、`docs/index.html`、`docs/css/**` | sync + bump `?v=` |

### 參考（可複用 UI 邏輯）

| 檔案 | 說明 |
|------|------|
| `owner-admin/js/app.js` | 業主月曆實作可參考結構（標記規則不同） |

---

## 3. 不可修改檔案

| 類別 | 說明 |
|------|------|
| `backend/.dev.vars` | 本機密碼 |
| `owner-admin/**` | 業主端不受影響（除非 sync 腳本覆蓋 docs 結構） |
| Notion schema | 沿用 slots / bookings / services |
| `customer-ui/js/liff-init.js` | 非必要不動 |
| Cloudflare Secrets | 本任務不需新 Secret |
| `TASK-addon-package-cards.md` | 加購模組，另案 |

---

## 4. 前端畫面設計

### 步驟 1：選擇服務（不變）

- 服務卡片列表，點選後高亮
- **選服務後**才載入／更新月曆（因時長影響可切時段數）

### 步驟 2：選擇日期（改為月曆）

**區塊 A — 月份列**

```
◀  2026年7月  ▶     [今天]
```

**區塊 B — 月曆格（日～六）**

| 狀態 | 視覺 | 互動 |
|------|------|------|
| 可預約（有空檔） | 白底／淡主色底 + 可選 | 可點 |
| 已選中 | 實心主色 + 白字 | 可點 |
| 今天 | 外框強調 | 可點（若仍有空檔） |
| 未開放營業 | 灰底、灰字 | `disabled` |
| 已過期（早於今天） | 灰底、灰字 | `disabled` |
| 今日已無空檔／已約滿 | 灰色不可點 | `disabled`（與 `today_past`、`full` 相同，**不細分**顯示） |

> 與業主月曆不同：客人端標記的是「**還能約**」，不是「已有預約筆數」。

**區塊 C — 已選日期提示**

例：`已選：2026/07/20（週一）`

### 步驟 3：選擇時段（不變邏輯）

- 時段按鈕 grid（沿用 `.slot-btn`）
- 無時段：「此日期沒有可預約時段」

### 確認預約

- 沿用 `#book-btn`，需服務 + 日期 + 時段皆選定

---

## 5. 手機操作流程

1. LINE 開啟預約頁 → 登入成功  
2. **步驟 1**：點選服務  
3. **步驟 2**：月曆顯示當月；可約日期可點，其餘灰色  
4. 點某一天 → 下方載入時段  
5. **步驟 3**：點時段 →「確認預約」可按  
6. 送出預約 → 成功提示 → 可切到「我的預約」  

### 換月規則（Codex 已確認）

| 情境 | 行為 |
|------|------|
| **換月後**（含切到本月／其他月） | **不自動選任何日期**；清空已選日期與時段，等客人自己點 |
| 初次顯示月曆（選服務後） | 顯示當月格狀；**不預選日期**，等客人點 |
| 點「今天」按鈕（若有） | 切回當月並選今天，再載入該日時段 |

> **禁止**：換月後自動選第一個可約日。

### 服務變更

- 換服務 → 清空已選日期／時段 → 重新載入月曆摘要（時長不同）

---

## 6. API 設計

### 評估結論

| 方案 | 優點 | 缺點 | 建議 |
|------|------|------|------|
| **A. 僅沿用** `/api/slots?date=` | 無後端改動 | 換月需 28～31 次請求，慢、耗 Notion | ❌ 不建議 |
| **B. 新增** `/api/slots/month` | 一次回傳整月摘要；點日再取詳細時段 | 需後端小改 | ✅ **建議** |
| **C. month API 含每日完整 slots** | 點日無需再請求 | payload 大 | 可選優化，第一版不必 |

### 建議新增（客人端公開 API）

```
GET /api/slots/month?month=YYYY-MM&serviceId=<id>
```

| 參數 | 必填 | 說明 |
|------|:----:|------|
| `month` | ✅ | `2026-07` |
| `serviceId` | ✅ | 上架服務 ID |

**無需** Owner Bearer；與現有 `/api/slots` 相同為公開讀取。

### 回應格式（建議）

```json
{
  "ok": true,
  "month": "2026-07",
  "serviceId": "...",
  "durationMinutes": 60,
  "days": {
    "2026-07-20": {
      "bookable": true,
      "slotCount": 8,
      "reason": null
    },
    "2026-07-21": {
      "bookable": false,
      "slotCount": 0,
      "reason": "closed"
    },
    "2026-07-13": {
      "bookable": false,
      "slotCount": 0,
      "reason": "past"
    }
  }
}
```

**`reason` 建議枚舉（後端用；前端第一版 UI 不細分）**

| reason | 含義 | 月曆 UI（第一版） |
|--------|------|-------------------|
| `null` | 可預約（`slotCount > 0`） | 可點、明顯樣式 |
| `closed` | 當日無營業時段 | 灰色不可點 |
| `full` | 有營業但已約滿 | 灰色不可點 |
| `past` | 日期早於今天（台北） | 灰色不可點 |
| `today_past` | 今天但可預約時段已全部過去 | 灰色不可點（與 `full` 相同，不另做樣式） |

### 點日期後載入時段（沿用）

```
GET /api/slots?date=YYYY-MM-DD&serviceId=...
```

回傳既有 `slots: ["10:00", ...]`，供下方按鈕渲染。

> 進階：若 month API 已含 `slots` 陣列，可快取避免二次請求（第二版優化）。

### 錯誤

| 情況 | HTTP | message |
|------|------|---------|
| 缺參數 | 400 | 缺少 month / serviceId |
| 服務不存在或下架 | 400/404 | 服務不存在或已下架 |

---

## 7. Notion 資料讀取方式

### 資料來源（與現有 `/api/slots` 相同）

| 資料 | 用途 |
|------|------|
| `NOTION_DATABASE_SLOTS` | 每週營業時段 → 判斷星期是否開放 |
| `NOTION_DATABASE_BOOKINGS` | 當月「已確認」預約 → 排除已佔用時段 |
| `NOTION_DATABASE_SERVICES` | 服務時長 `durationMinutes` |

### 後端計算邏輯（每個月內每一天）

1. 由 `date` 得台北星期 → 對應 `listWeeklySlots` 中該星期時段  
2. 無時段 → `bookable: false`, `reason: closed`  
3. `date < today`（台北）→ `past`  
4. `buildSlotTimes` + `getActiveBookingsByDate`（或一次查整月 bookings 再分組）  
5. `filterAvailableSlots`（今日需過濾已過時段）  
6. `slotCount = slots.length`；`bookable = slotCount > 0`  

### 查詢優化（建議）

```javascript
// 一次查整月已確認預約
query bookings where 預約日期 on_or_after monthStart AND on_or_before monthEnd AND 狀態=已確認
// 一次讀 weeklySlots + service
// 迴圈 month 內每一天在記憶體計算（與單日 API 同邏輯）
```

**禁止**前端帶 `NOTION_TOKEN` 或直接呼叫 Notion API。

---

## 8. 安全檢查

| 項目 | 要求 |
|------|------|
| 前端 config | 僅 `LIFF_ID`、`API_BASE_URL` |
| 不暴露 secret | grep 確認 customer-ui / docs |
| 公開 API 範圍 | 僅回傳可預約摘要與時段，不回傳其他客人姓名／userId |
| 建立預約 | 沿用 `POST /api/bookings`，帶本人 `userId` |
| CORS | 維持 `*`（與現案一致） |
| `.dev.vars` | 不 commit |

---

## 9. 驗收標準

### 月曆

- [ ] 選服務後顯示當月月曆
- [ ] 可切換上／下月
- [ ] 有可預約空檔的日期明顯可點
- [ ] 未開放／已過期／無空位日期灰色不可點
- [ ] 「今天」有視覺標示

### 預約流程

- [ ] 點可約日期 → 下方出現時段按鈕
- [ ] 選時段 → 可送出預約
- [ ] 預約成功寫入 Notion
- [ ] 「我的預約」可看到新預約
- [ ] 換服務後月曆依新服務時長更新

### 迴歸

- [ ] 業主端不受影響
- [ ] LIFF 登入正常
- [ ] 取消預約流程正常

### 明確不驗收

- [ ] ~~候補~~、~~付款~~、~~Google Calendar~~

---

## 10. 測試方式

### 靜態

```bash
node --check backend/src/index.js
node --check backend/src/slots.js   # 若新增函式
```

### API（curl，公開端點）

```bash
# 需已知上架 serviceId
curl -s "https://<worker>/api/slots/month?month=2026-07&serviceId=<ID>"

# 單日時段（點日後）
curl -s "https://<worker>/api/slots?date=2026-07-20&serviceId=<ID>"
```

**檢查**：週一有營業且有空檔 → `bookable: true`；無營業星期 → `closed`；過去日期 → `past`。

### 實機（LINE）

1. 選「基礎臉部護理」→ 月曆出現  
2. 點未來週一（有營業）→ 8 個時段（依 Demo 設定）  
3. 點僅週二無營業日 → 不可點或無時段  
4. 完成預約 → 我的預約有紀錄  

### 前端安全 grep

```bash
grep -R "NOTION_TOKEN\|secret_" customer-ui docs/js
```

---

## 11. 風險

| 風險 | 等級 | 說明 | 緩解 |
|------|------|------|------|
| 整月計算與單日不一致 | 中 | 邏輯分叉 | 共用同一 helper 函式 |
| 單月請求過慢 | 中 | Notion 查詢 + 31 天迴圈 | 整月 bookings 一次查；必要時快取 |
| 時區邊界 | 中 | 過去／今天判斷錯 | 一律 `Asia/Taipei` |
| LINE WebView 快取 | 中 | 舊 JS | bump `?v=` |
| 先選日期再選服務 | 低 | 已於 f928692 修過 | 換服務清空日期；月曆需服務後才顯示 |
| deploy 影響正式環境 | 中 | 新 API | Codex 審查後 deploy |

---

## 12. Rollback 方式

### 僅前端回退

1. `git revert` customer-ui + docs 月曆 commits  
2. 恢復 `<input type="date">`  
3. sync `docs/` + bump `?v=` + push  

### 含後端回退

1. revert `GET /api/slots/month`  
2. `wrangler deploy`  
3. 前端可繼續用單日 `/api/slots` + date input（若前端一併 revert）

### 功能開關（可選）

- 第一版可不做了；若需漸進上線可加 `settings` 旗標 `calendarBookingEnabled`

---

## 13. 建議實作順序

1. 後端：`getAvailableSlotsForMonth` + 單元邏輯與 `/api/slots` 對照測試  
2. 路由 `GET /api/slots/month`  
3. `customer-ui/js/api.js`  
4. 月曆 UI（可參考 owner-admin 結構，樣式獨立）  
5. 接選日 → `getSlots` → 預約  
6. sync `docs/` + bump `?v=`  
7. deploy 後端 → push 前端 → LINE 實機驗收  

---

## 14. Codex 審查決策（已確認）

| # | 決策 | 實作要求 |
|---|------|----------|
| 1 | 換月後不自動選第一個可約日 | 換月清空選日；等客人自己點 |
| 2 | `today_past` 與 `full` 不細分顯示 | 月曆上皆灰色不可點；`reason` 僅供後端／除錯 |
| 3 | 客戶端月曆選日期屬**基礎款** | **不是加購**；不列入堂數卡加購報價 |
| 4 | 月曆不顯示 `slotCount` 數字 | 第一版僅色塊／圓點表示可約 |

---

*任務包版本：1.1｜beauty-studio-booking 基礎款｜不實作、不含任何 Token*
