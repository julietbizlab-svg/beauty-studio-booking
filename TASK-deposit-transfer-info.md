# Cursor 任務包：訂金轉帳帳號顯示

> **專案**：`beauty-studio-booking`  
> **檔案**：`TASK-deposit-transfer-info.md`  
> **建立日期**：2026-07-15  
> **狀態**：待執行（本文件僅整理任務，**不實作**）  
> **產品定位**：**基礎款可選功能**（不是金流、不是加購包卡模組）  
> **產品線**：美業個人工作室版（基礎款 v1.0 之上）  
> **前置**：店面設定 `GET/PATCH /api/settings`、`/api/owner/settings`、預約成功流程已存在

---

## 0. 產品定位（必讀）

| 項目 | 說明 |
|------|------|
| **屬於哪個方案** | 基礎買斷／建置加維護的**可選開關**（業主可關） |
| **是否金流** | **否** — 只顯示業主提供的轉帳資訊 |
| **是否加購包卡** | **否** — 與 `ADDON-PACKAGE-STORED-VALUE-MODULE.md` 無關 |
| **一句話** | 業主填銀行帳號 → 客人預約成功後看到「請轉訂金」提醒與帳號 |

### 現況 vs 目標

| 現況 | 目標 |
|------|------|
| 店面設定只有店名／主色／公告／取消規則 | 可多填訂金與轉帳資訊 |
| 預約成功只顯示「預約成功」 | 若有開訂金，多顯示轉帳區塊 |
| 無銀行 API | **維持無**銀行 API、無收款、無對帳 |

---

## 1. 目標

讓業主在 owner-admin「店面設定」填寫訂金轉帳資訊；客人**預約完成後**可看到轉帳提醒與帳號。關閉「是否收訂金」時，客人端完全不顯示此區塊。

### 使用者故事

> **業主**：我想在 LINE 後台写一次銀行帳號，客人約完就看得到，不用我私訊复制。  
> **客人**：約完我想知道訂金多少、轉到哪個帳號；我自己去轉，不用在 App 付款。

### 第一版要做

1. Notion `settings` 增加訂金／轉帳相關欄位（見 §3）  
2. 公開 `GET /api/settings` 回傳這些欄位  
3. `PATCH /api/owner/settings` 可寫入（需 owner 驗證）  
4. owner-admin 店面設定區：開關＋表單（手機好填）  
5. customer-ui：預約成功後依設定顯示轉帳資訊  
6. sync `docs/` + bump `?v=`  

### 第一版不做（見 §9）

線上刷卡、LINE Pay、銀行 API、自動對帳、截圖審核、付款狀態追蹤。

---

## 2. 涉及檔案（預計）

### 後端

| 檔案 | 變更 |
|------|------|
| `backend/src/notion.js` | `parseSettingsPage`／`defaultSettings`／`updateSettings` 增訂金欄位對應 |
| `backend/src/index.js` | 通常**無需新路由**；沿用既有 settings GET／owner PATCH |

### 業主前端

| 檔案 | 變更 |
|------|------|
| `owner-admin/index.html` | 店面設定頁「訂金／轉帳」區塊 |
| `owner-admin/js/app.js` | 載入／儲存新欄位；開關控制表單顯示 |
| `owner-admin/css/style.css` | 區塊間距（必要時） |

### 客人前端

| 檔案 | 變更 |
|------|------|
| `customer-ui/index.html` | 預約成功用轉帳資訊區塊（可隱藏） |
| `customer-ui/js/app.js` | 預約成功後依 `settings` 渲染；關閉訂金則不顯示 |
| `customer-ui/css/style.css` | 轉帳資訊卡片／可複製樣式（選配） |

### 部署產物

| 檔案 | 變更 |
|------|------|
| `docs/**`、`docs/owner/**` | sync + bump `?v=` |

### 說明文件（建議同步，可同 PR 或另 commit）

| 檔案 | 變更 |
|------|------|
| `product-docs/BASELINE-V1-SNAPSHOT.md` 或 `PRODUCT-TEMPLATE-MASTER.md` | 註記「基礎款可選：訂金轉帳顯示」 |
| `README.md` | 簡短說明非金流 |

### 不可修改

| 類別 | 說明 |
|------|------|
| `backend/.dev.vars` | 不需新 Secret |
| Cloudflare Secrets | **不新增**任何 secret |
| `customer-ui/js/config.js`、`owner-admin/js/config.js` | **禁止**寫死銀行帳號 |
| Notion bookings 付款狀態 | 本任務不擴充付款狀態欄 |
| 長時重疊邏輯 `slots.js` | **不要改**防重疊邏輯 |

---

## 3. Notion settings 欄位規劃

在既有「店面設定」資料庫（`NOTION_DATABASE_SETTINGS`）**同一筆**設定列新增欄位（不新建資料庫）：

| Notion 欄位名（建議中文） | API JSON 鍵（建議） | 類型建議 | 說明 |
|---------------------------|---------------------|----------|------|
| 是否收訂金 | `depositEnabled` | 選項或 Checkbox | `是／否`；預設否 |
| 訂金金額 | `depositAmount` | 數字 | 例：500；關閉訂金時可忽略 |
| 銀行名稱 | `bankName` | 文字 | 例：玉山銀行 |
| 銀行代碼 | `bankCode` | 文字 | 例：808 |
| 帳號 | `bankAccount` | 文字 | 匯款帳號 |
| 戶名 | `bankAccountName` | 文字 | 帳戶戶名 |
| 轉帳提醒文字 | `depositNote` | 文字 | 例：請於 24 小時內轉帳並私訊姓名 |

### 讀寫規則

- `depositEnabled !== true`（或「否」）時：客人端**不渲染**轉帳區；API 仍可回傳欄位（前端判斷），或回傳 `depositEnabled: false` 其餘可空。  
- 金額顯示格式：前端格式化為「NT$ xxx」即可，不強制幣別欄。  
- **手動**：交付客戶時在 Notion 建好欄位並連 Integration；本任務包不自動建庫。

### SCHEMA 註記位置

更新 `backend/src/notion.js` 檔頭註解中的 settings 欄位表，方便之後套版。

---

## 4. Backend API 規劃

### 4.1 沿用既有路徑（不新增金流 API）

| 方法 | 路徑 | 變更 |
|------|------|------|
| GET | `/api/settings` | 公開讀取；回應多上述訂金欄位 |
| GET | `/api/owner/settings` | owner；同結構 |
| PATCH | `/api/owner/settings` | owner；可寫入訂金欄位 |

**禁止**：`/api/payments`、Webhook、第三方付款 SDK。

### 4.2 回應範例（建議）

```json
{
  "brandName": "花漾美甲",
  "primaryColor": "#E8B4B8",
  "announcement": "",
  "cancelPolicy": "…",
  "depositEnabled": true,
  "depositAmount": 500,
  "bankName": "玉山銀行",
  "bankCode": "808",
  "bankAccount": "1234567890123",
  "bankAccountName": "王小明",
  "depositNote": "請於預約後 24 小時內完成轉帳，並私訊姓名與預約時段。"
}
```

關閉時：

```json
{
  "depositEnabled": false,
  "depositAmount": null,
  "bankName": "",
  "bankCode": "",
  "bankAccount": "",
  "bankAccountName": "",
  "depositNote": ""
}
```

### 4.3 驗證（建議）

| 情況 | 行為 |
|------|------|
| `depositEnabled` 為 true 但帳號／戶名空白 | owner 儲存時 **400** 提示補齊；或允許存但客人端顯示「請聯絡工作室」（產品二選一，建議：**擋儲存**較乾淨） |
| 訂金金額 ≤ 0 且有開訂金 | 400 |
| 非 owner PATCH | 既有 401／403 |

建立預約 `POST /api/bookings`：**不需**因訂金改變成功條件；預約邏輯與長時重疊檢查**不變**。

---

## 5. owner-admin UI

### 位置

「店面設定」分頁，既有品牌／公告／取消規則**下方**新增區塊：

**標題**：訂金與轉帳資訊（可選）

| 控制項 | 說明 |
|--------|------|
| 開關「是否收訂金」 | checkbox／toggle；關閉時其餘輸入可 disabled 或隱藏 |
| 訂金金額 | number |
| 銀行名稱 | text |
| 銀行代碼 | text |
| 帳號 | text（input mode numeric 可選） |
| 戶名 | text |
| 轉帳提醒文字 | textarea |
| 儲存 | 沿用「儲存設定」一次送出 |

### UX

- 手機單欄、大觸控區  
- 短提示：「僅顯示給客人看，系統不代收款、不對帳」  
- 不要求上傳任何檔案  

---

## 6. customer-ui UI

### 顯示時機

**預約成功之後**（`createBooking` 成功）顯示轉帳區塊；可同時保留成功提示，再顯示轉帳資訊。

可選進階（第一版可不做）：「我的預約」詳情也顯示同一區塊（需 settings 已載入）。

### 顯示條件

```
settings.depositEnabled === true
→ 顯示：訂金金額、銀行名稱、代碼、帳號、戶名、提醒文字
否則 → 不插入 DOM／保持 hidden
```

### 明確不做

- 不上傳匯款截圖  
- 不選「已付款／未付款」  
- 不擋住「回我的預約」按鈕  

### 建議文案骨架

```
預約成功！
若需支付訂金，請轉帳至以下帳戶：
金額：NT$ {depositAmount}
銀行：{bankName}（{bankCode}）
帳號：{bankAccount}
戶名：{bankAccountName}
{depositNote}
```

可選：帳號一鍵複製（`navigator.clipboard`，失敗則略過）。

資料來源：頁面載入時已呼叫的 `getSettings()`，或成功後再讀一次 settings（避免業主剛改完客人還看舊的 — 可選 `reload settings`）。

---

## 7. 安全規則

| 規則 | 說明 |
|------|------|
| 銀行帳號**不是** token／secret | 屬公開營業資訊，但仍**勿寫死**在前端 repo |
| 一律由 **backend settings API** 回傳 | Notion → Worker → 前端 |
| **禁止**寫入 `config.js` | 僅 LIFF_ID、API_BASE_URL |
| **不新增** Cloudflare Secret、不改 `.dev.vars` | |
| Owner 寫入須 `requireOwnerFromRequest` | 既有機制 |
| 日誌 | 勿在 log 特別 dump 完整帳號（一般錯誤訊息即可） |

銀行帳號會出現在公開 `GET /api/settings`：屬預期（客人要看得）。若不希望未登入也讀到，可改為「僅 LIFF 登入後的 settings」— **第一版建議維持公開 settings 與現況一致**（設定頁本就公開品牌資料）。

---

## 8. 驗收標準

### 業主端

- [ ] 可在 LINE 後台「店面設定」開關是否收訂金  
- [ ] 可填金額、銀行、代碼、帳號、戶名、提醒文字並儲存  
- [ ] 重新開啟頁面仍看得到已存內容  

### 客人端

- [ ] 開啟訂金：預約成功後看得到轉帳資訊與金額  
- [ ] 關閉訂金：預約成功後**不顯示**轉帳區塊  
- [ ] 預約建立仍成功；流程不被訂金擋住  

### 迴歸

- [ ] 不影響長時間服務防重疊（`/api/slots`、createBooking 重疊檢查）  
- [ ] 不影響月曆選日期、取消預約  
- [ ] owner 非授權仍無法 PATCH settings  
- [ ] `config.js` 無銀行字樣；grep `帳號|bankAccount` 僅動態渲染  

### 明確不驗收

- [ ] ~~線上刷卡~~、~~LINE Pay~~、~~對帳~~、~~截圖審核~~、~~付款狀態~~

---

## 9. 不做範圍

- 線上刷卡／信用卡  
- LINE Pay／街口等第三方付款  
- 銀行 Open API／虛擬帳號串接  
- 自動對帳、入帳通知  
- 匯款截圖上傳與審核  
- 預約單「已付訂金／未付」狀態機  
- 未轉帳自動取消預約  
- 金流相關 Webhook  

---

## 10. 測試方式（實作後）

```bash
node --check backend/src/notion.js
node --check backend/src/index.js

# owner 需 Bearer；略 — 以 LIFF 實機為準
curl -s "https://<worker>/api/settings"   # 檢查 deposit* 欄位存在
```

1. 業主開啟訂金、填帳號、儲存  
2. 客人完成一筆預約 → 看到轉帳區  
3. 業主關閉訂金、儲存 → 再約一筆 → 無轉帳區  
4. `grep -R "bankAccount\|808\|請填入銀行" customer-ui/js/config.js` → 無業務帳號硬編碼  

---

## 11. 風險與 Rollback

| 風險 | 緩解 |
|------|------|
| Notion 欄位未建導致讀寫失敗 | 交付 SOP 加欄位檢查；程式對缺欄給預設 `depositEnabled: false` |
| 公開 API 曝光帳號 | 產品預期；文件寫明 |
| LINE WebView 快取舊 JS | bump `?v=` |

**Rollback**：前端隱藏區塊 + settings 忽略新欄位即可；Notion 欄位可留著不用。

---

## 12. 建議實作順序

1. Notion 補欄位（手動）+ `notion.js` 讀寫  
2. 確認 `GET /api/settings` JSON  
3. owner-admin 表單 + 儲存  
4. customer-ui 預約成功 UI  
5. sync docs、bump `?v=`  
6. Codex 審查 → deploy backend → push Pages → LINE 實機驗收  

---

## 13. Codex 審查前待決（可於審查時敲定）

1. 開啟訂金但帳號空白：擋儲存 vs 允許並顯示「請聯絡工作室」？（建議：擋儲存）  
2. 「我的預約」是否也顯示轉帳資訊？（建議：第一版只在預約成功當下）  
3. `depositEnabled` Notion 用 Checkbox 還是選項「是／否」？（擇一，前後端對齊）

---

*任務包版本：1.0｜基礎款可選｜非金流｜不實作、不含任何 Token*
