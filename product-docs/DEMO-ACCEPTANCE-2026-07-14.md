# Demo 驗收紀錄｜beauty-studio-booking

> **驗收日期**：2026-07-14  
> **用途**：記錄 Demo 系統上線驗收結果，供未來交付客戶時複用為 SOP 參考。  
> **狀態**：主要功能驗收通過 ✅（含客人端／業主端月曆，2026-07-14 更新）

---

## 1. 驗收日期

**2026-07-14**（台北時間）

---

## 2. 系統環境

| 項目 | 值 |
|------|-----|
| GitHub Pages（客人端） | https://julietbizlab-svg.github.io/beauty-studio-booking/ |
| GitHub Pages（業主端） | https://julietbizlab-svg.github.io/beauty-studio-booking/owner/ |
| LIFF ID | `2010678480-dKQ3afnw` |
| Cloudflare Worker | `beauty-studio-api` |
| Cloudflare Worker URL | https://beauty-studio-api.gosu-chill-book.workers.dev |
| Notion 四表 | services / slots / bookings / settings — 已連線，只讀檢查通過 |

### 相關 commit 里程碑（參考）

| 項目 | 說明 |
|------|------|
| Cloudflare Secrets | 7 個 Secrets 已上傳（`NOTION_TOKEN`、四表 ID、`OWNER_LINE_USER_IDS`、`LIFF_CHANNEL_ID`） |
| Worker 部署（業主月曆） | Version `1edcca3b-1978-4064-bb8d-fcef81ad3545` |
| Worker 部署（客人月曆 API） | Version `600d6dd4-6fe8-40ac-9dc7-4182cf66baa4` |
| 前端 API | `API_BASE_URL` 指向正式 Worker |
| Git commit（客人月曆） | `843fa9a` — `feat: add customer calendar date picker for booking` |

---

## 3. 客人端驗收結果

| 項目 | 結果 | 備註 |
|------|------|------|
| LINE LIFF 登入 | ✅ 通過 | 可取得 userId、顯示名稱 |
| 服務列表 | ✅ 通過 | 顯示上架服務與價格、時長 |
| **月曆選日期（基礎款）** | ✅ 通過 | 選服務後顯示當月月曆；可切換上／下月 |
| **可約日可點、不可約灰色** | ✅ 通過 | 僅「有開放營業且仍有空位」可點；未開放／已過期／已額滿／今日時段已過皆灰色不可點 |
| **點日期載入時段** | ✅ 通過 | 點可約日後下方顯示時段按鈕 |
| 時段選擇 | ✅ 通過 | 換服務會重載月曆；換月不自動選第一個可約日 |
| 建立預約 | ✅ 通過 | 寫入 Notion bookings |
| 我的預約 | ✅ 通過 | 顯示本人預約紀錄 |
| 取消預約 | ✅ 通過 | 狀態更新為已取消 |

### 客人端月曆 API 驗收（2026-07-14）

| 項目 | 結果 |
|------|------|
| `GET /api/health` | ✅ `ok: true`，`notion: true` |
| `GET /api/slots/month?month=2026-07&serviceId=…` | ✅ 回傳整月每日 `bookable` / `slotCount` / `reason` |
| `GET /api/slots?date=2026-07-20&serviceId=…` | ✅ 與 month API 一致（例：8 個時段 `10:00`～`17:00`） |
| Demo 2026-07 可約日 | 週一 `2026-07-20`、`2026-07-27` 各 8 空檔（依當時 slots 僅週一開放） |

**產品定位**：客人端月曆選日期屬**基礎款**，不是加購。

---

## 4. 業主端驗收結果

| 項目 | 結果 | 備註 |
|------|------|------|
| Owner 驗證 | ✅ 通過 | Bearer LINE ID Token + 後端 `OWNER_LINE_USER_IDS` |
| **月曆預約查詢（基礎款）** | ✅ 通過 | `GET /api/owner/bookings/month`；月曆顯示有已確認預約的日期 |
| **點日期看當日清單** | ✅ 通過 | 點日期顯示當日預約；已取消淡化、不標記日期 |
| 服務列表 | ✅ 通過 | 含上架與下架 |
| 新增服務 | ✅ 通過 | 寫入 Notion services |
| 下架服務 | ✅ 通過 | 狀態更新，客人端不再顯示 |
| 營業時段 | ✅ 通過 | 週期性時段寫入 Notion slots |
| 店面設定 | ✅ 通過 | 品牌名稱、主色、公告等 |

**產品定位**：業主端月曆預約查詢屬**基礎款**，不是加購。

---

## 5. 已知注意事項

1. **營業時段目前主要設定週一**  
   Demo 階段 Notion `slots` 以週一為主；選其他星期可能顯示「此日期未開放預約」。交付客戶前應補齊週二～週日。

2. **今日已過時段會被系統隱藏**  
   後端依台北時間過濾已過時段；若當日傍晚測試週一，可能看到空時段（屬預期行為）。

3. **測試服務為 Demo 資料**  
   Notion 內可能有空白名稱或測試用服務，交付前可下架或刪除。

4. **前端快取**  
   月曆功能上線後需 sync `docs/` 並 bump `?v=`，避免 LINE WebView 載入舊 JS。

5. **`.cursor/` 協作規則**  
   若尚未 commit，可另行納入版本庫，不影響 Demo 運作。

---

## 6. 安全確認

| 項目 | 狀態 |
|------|------|
| Notion Token 未進前端 | ✅ `config.js` 僅含 LIFF_ID、API_BASE_URL |
| Cloudflare Secrets 已上傳 | ✅ 7 個 Secrets 於 Worker `beauty-studio-api` |
| `.dev.vars` 未 commit | ✅ 已列入 `.gitignore` |
| Owner 權限由後端驗證 | ✅ `requireOwnerFromRequest` + `LIFF_CHANNEL_ID` |

---

## 7. 下一步建議

1. **補齊週二～週日營業時段**（業主端或 Notion 直接維護）— 客人月曆會依此顯示更多可約日
2. **push 客人端月曆前端**（`docs/` 已含月曆 UI，待 Codex 審查後 push GitHub Pages）
3. **做客戶交付版 SOP**  
   整合 `CLIENT-DELIVERY-CHECKLIST.md`、`CLIENT-NOTION-SETUP-FLOW.md`、`CLIENT-LINE-SETUP-FLOW.md` 為單一交付流程
3. **做每位新客戶複製流程**  
   參考 `COPY-FOR-NEW-CLIENT.md`：複製 repo → 新 Notion → 新 LINE Channel → 新 Cloudflare Worker → 新 GitHub Pages
4. **正式客戶上線前**  
   - 更換 LIFF Endpoint 為客戶 GitHub Pages  
   - 重新上傳該客戶的 Cloudflare Secrets  
   - 移除 Demo 測試資料

---

## 8. 驗收簽核（內部用）

| 角色 | 姓名 | 日期 |
|------|------|------|
| 工程驗收 | Cursor + Codex 流程 | 2026-07-14 |
| 產品／業務確認 | （待填） | |

---

*文件版本：1.1｜beauty-studio-booking Demo｜不含任何 Token 或密碼*
