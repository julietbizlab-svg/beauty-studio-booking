# Demo 驗收紀錄｜beauty-studio-booking

> **驗收日期**：2026-07-14  
> **用途**：記錄 Demo 系統上線驗收結果，供未來交付客戶時複用為 SOP 參考。  
> **狀態**：主要功能驗收通過 ✅

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
| Worker 部署 | `wrangler deploy` 完成，`/api/health` → `notion: true` |
| 前端 API | `API_BASE_URL` 指向正式 Worker |

---

## 3. 客人端驗收結果

| 項目 | 結果 | 備註 |
|------|------|------|
| LINE LIFF 登入 | ✅ 通過 | 可取得 userId、顯示名稱 |
| 服務列表 | ✅ 通過 | 顯示上架服務與價格、時長 |
| 日期選擇 | ✅ 通過 | `YYYY-MM-DD` 格式 |
| 時段選擇 | ✅ 通過 | 先選服務再選日期、或先選日期再選服務皆可載入時段 |
| 建立預約 | ✅ 通過 | 寫入 Notion bookings |
| 我的預約 | ✅ 通過 | 顯示本人預約紀錄 |
| 取消預約 | ✅ 通過 | 狀態更新為已取消 |

---

## 4. 業主端驗收結果

| 項目 | 結果 | 備註 |
|------|------|------|
| Owner 驗證 | ✅ 通過 | Bearer LINE ID Token + 後端 `OWNER_LINE_USER_IDS` |
| 今日預約 | ✅ 通過 | 依日期列出預約 |
| 服務列表 | ✅ 通過 | 含上架與下架 |
| 新增服務 | ✅ 通過 | 寫入 Notion services |
| 下架服務 | ✅ 通過 | 狀態更新，客人端不再顯示 |
| 營業時段 | ✅ 通過 | 週期性時段寫入 Notion slots |
| 店面設定 | ✅ 通過 | 品牌名稱、主色、公告等 |

---

## 5. 已知注意事項

1. **營業時段目前主要設定週一**  
   Demo 階段 Notion `slots` 以週一為主；選其他星期可能顯示「此日期未開放預約」。交付客戶前應補齊週二～週日。

2. **今日已過時段會被系統隱藏**  
   後端依台北時間過濾已過時段；若當日傍晚測試週一，可能看到空時段（屬預期行為）。

3. **測試服務為 Demo 資料**  
   Notion 內可能有空白名稱或測試用服務，交付前可下架或刪除。

4. **前端操作順序**  
   已修正「先選日期再選服務」時段不載入問題（`customer-ui/js/app.js`）；部署時需 sync `docs/` 並 bump `?v=`。

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

1. **補齊週二～週日營業時段**（業主端或 Notion 直接維護）
2. **做客戶交付版 SOP**  
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

*文件版本：1.0｜beauty-studio-booking Demo｜不含任何 Token 或密碼*
