# 版本架構路線圖（Demo／正式優化版 v2）

> **給老闆與工程看**：把「Demo 用 Notion」和「正式商品用 D1＋R2」鎖成產品架構規則，避免改壞展示環境。  
> **專案**：`beauty-studio-booking`  
> **建立日期**：2026-07-16  
> **性質**：架構決策文件（**只定規則，不實作**）  
> **相關**：`BASELINE-V1-SNAPSHOT.md`、`TASK-d1-migration-plan.md`、`TASK-owner-customer-notes-photos.md`、`INSTALLATION-PACKAGE-SOP.md`

---

## 0. 一句話

| 版本 | 資料怎麼存 | 用途 |
|------|------------|------|
| **Demo 版（現行母版）** | **Notion** | 展示、測試、銷售 Demo — **不可弄壞** |
| **正式優化版 v2** | **Cloudflare D1**（結構化資料）＋ **R2**（圖片檔） | 正式客戶、長期營運、可複製交付 |

**禁止**：為了做 v2，直接在 Demo 環境大改資料層。

---

## 1. Demo 版（現行）

### 定位

- 基礎款功能展示與成交用母版  
- 斷點說明見 [BASELINE-V1-SNAPSHOT.md](BASELINE-V1-SNAPSHOT.md)  
- 安裝／複製流程仍可依 Notion 版 SOP 操作  

### 架構規則（鎖定）

| 項目 | 決策 |
|------|------|
| 資料層 | **保留 Notion**（services／slots／bookings／settings；customers 可選） |
| D1 | **不改成 D1**；Demo 不接正式 D1 遷移實驗 |
| R2 | **不加入 R2**；Demo 不做前後照片正式儲存 |
| 允許的變更 | 安全修補、明顯 bug 修補、文件更新、不影響資料層的小幅 UI 修補 |
| 目的 | 展示、測試、銷售 Demo |

### Demo 版明確不要做

- 不要把 Demo Worker 的資料源切成 D1 當實驗場  
- 不要在 Demo 開 R2 上傳客戶照片  
- 不要為單一客戶需求直接改壞共用 Demo 資料  

---

## 2. 正式優化版 v2

### 定位

- 適合**正式客戶**、長期營運、商品化可複製交付  
- 資料層：**Cloudflare D1** 取代 Notion API 作為主資料庫  
- 詳細遷移階段見 [TASK-d1-migration-plan.md](../TASK-d1-migration-plan.md)（repo 根目錄任務包）

### D1 負責存什麼（結構化資料）

| 資料 | 存 D1 |
|------|--------|
| 服務項目 | ✅ |
| 營業時段 | ✅ |
| 預約紀錄 | ✅ |
| 店面設定（含訂金轉帳文字資訊） | ✅ |
| 客戶資料 | ✅ |
| **客戶注意事項** | ✅ |
| 包卡／儲值等加購資料（未來） | ✅（另開任務，schema 可預留） |

### 金流邊界（鎖定）

| 項目 | 決策 |
|------|------|
| **本產品不做金流** | 不自建刷卡、不串自家收款核心、不在 D1／R2 存完整卡號或金流密鑰流程 |
| **訂金轉帳「顯示帳號」** | 屬基礎款可選**文案／資訊顯示**（銀行、帳號、戶名、提醒文字），**不是**金流／自動對帳 |
| **若客戶要真正收款** | 交給 **LINE 官方金流能力**，或 **合法第三方金流／支付服務**（另案評估與報價），不混進 Demo／v2 核心預約架構 |

### 與 Demo 的關係

- v2 在**獨立環境／獨立 Worker／獨立 D1** 開發與驗收  
- Demo（Notion）繼續可開給準客戶看，直到產品決策宣布「新客戶預設 v2」  
- 舊 Notion 客戶搬 v2：走匯入工具／專案任務，不強迫改 Demo  

---

## 3. 前後照片功能

> 規劃細節見 [TASK-owner-customer-notes-photos.md](../TASK-owner-customer-notes-photos.md) Phase 2。

### 架構規則（鎖定）

| 項目 | 決策 |
|------|------|
| 圖片／檔案本體 | **Cloudflare R2** |
| D1 | **只存 metadata**（例如：客戶 ID、日期、服務／預約關聯、R2 key、備註、before／after） |
| 不把照片塞進 D1 | ✅ 禁止（BLOB 不進正式設計） |
| 不放 GitHub／Pages repo | ✅ 禁止 |
| 不放前端公開靜態目錄 | ✅ 禁止 |
| 不放 localStorage／IndexedDB 當正式儲存 | ✅ 禁止 |
| 存取 | Owner-only API；短時簽章 URL 或經 Worker；bucket 不公開列出 |
| 隱私 | 屬客戶個資／可能含身體影像；業主須取得客戶同意（產品與交付文案必寫） |

### 一句話

**R2 存圖，D1 存「這張圖是誰的、何時、哪種、對應哪個 key」。**

---

## 4. 客戶注意事項

> 規劃細節見 [TASK-owner-customer-notes-photos.md](../TASK-owner-customer-notes-photos.md) Phase 1。

### 架構規則（鎖定）

| 項目 | 決策 |
|------|------|
| 儲存位置（v2） | **D1**（customers 列文字欄，例如 `care_notes`） |
| 權限 | **owner-only**（`requireOwnerFromRequest`） |
| 內容方向 | 過敏、偏好、禁忌、皮膚狀況、常用色號、療程備註等 |
| 客人端／公開頁 | **不放、不回傳** |
| Demo（Notion） | 若未做 v2，可不啟用此加購；若要在 Notion 試作，屬進階模組且不得影響 Demo 主流程穩定性 |

### 一句話

**注意事項是店長內部備註，走 D1＋業主 API，絕不出現在客人預約頁。**

---

## 5. 開發順序（建議鎖定）

照此順序，降低「Demo 壞掉」與「一次做太大」的風險：

| 順序 | 工作 | 說明 |
|------|------|------|
| **1** | **先保護 Demo** | Notion Demo 只修安全／明顯 bug／文件；大改另開 v2 線 |
| **2** | D1 migration plan | 已有 `TASK-d1-migration-plan.md`，Codex 審查後再實作 |
| **3** | D1 schema／migration | Phase：建表、local apply，**先不接正式 Demo API** |
| **4** | 資料層切換（服務／設定 → 時段／預約） | 見 D1 任務包 Phase 3～4 |
| **5** | **客戶注意事項**（D1） | 進階客戶管理 Phase 1 |
| **6** | **R2 前後照片** | 進階客戶管理 Phase 2；metadata 在 D1 |
| **7** | 包卡／儲值金等加購 | 最後；見加購規劃文件 |

**不要**跳過 1～4 直接在 Demo 上做照片或改庫。

---

## 6. 禁止事項（鐵律）

| 禁止 | 原因 |
|------|------|
| ❌ 直接在 Demo 版大改資料庫／切 D1 | 弄壞展示與成交環境 |
| ❌ 把照片存進 D1 | 不適合大檔、難快取與 CDN、成本與實作差 |
| ❌ 把客戶隱私資料（注意事項、照片 URL 永久公開）放前端公開頁 | 外洩風險 |
| ❌ 把 token、R2 key、D1 憑證、Notion Token 寫進 GitHub Pages／前端 config | 安全事故 |
| ❌ 用 GitHub／localStorage 當照片正式儲存 | 不合規、不可維運 |
| ❌ 未經同意上線客戶影像功能 | 隱私與信任 |
| ❌ 自建金流／把支付密鑰寫進前端或 Pages | 合規與資安；收款另接 LINE 或合法第三方 |

---

## 7. 兩條產品線對照（速查）

| 區塊 | Demo 版 | 正式優化版 v2 |
|------|---------|----------------|
| 預約／服務／時段／設定 | Notion | **D1** |
| 客戶資料／注意事項 | Notion 可選／或不啟用加購 | **D1** |
| 前後照片 | 不做正式 R2 | **R2**（檔）＋ **D1**（metadata） |
| 包卡／儲值 | 不做 | D1（加購，後做） |
| 金流 | **不做** | **不做**（若要收款 → LINE／合法第三方，另案） |
| 變更政策 | 只修補與文件 | 可進化架構與進階模組 |

---

## 8. 與其他文件的關係

| 文件 | 角色 |
|------|------|
| 本文件 `VERSION-ARCHITECTURE-ROADMAP.md` | **架構分版規則（最高決策摘要）** |
| `BASELINE-V1-SNAPSHOT.md` | Demo／基礎款 v1 功能斷點 |
| `TASK-d1-migration-plan.md` | D1 怎麼遷（階段、schema、風險） |
| `TASK-owner-customer-notes-photos.md` | 注意事項＋照片功能怎麼做 |
| `INSTALLATION-PACKAGE-SOP.md` | 客戶怎麼裝；日後分「Notion Demo 裝法」與「v2 D1 裝法」 |
| `ADDON-PACKAGE-STORED-VALUE-MODULE.md` | 包卡／儲值加購（排在路線圖最後） |

---

## 9. 給 Cursor／Codex 的執行提醒

1. 接到「改資料庫／加照片／加注意事項」任務時，先對照本文件屬於 **Demo** 還是 **v2**。  
2. Demo 任務若要求改 Notion→D1 或上 R2 → **應拒絕或改開 v2 任務包**。  
3. v2 實作須另開任務、另環境；通過審查再 commit／deploy。  
4. 本文件更新屬「決策變更」，需老闆／Codex 同意，避免口頭漂移。  

---

*文件版本：1.1｜版本架構路線圖｜決策鎖定｜不含 Token、R2 key、密碼或真實客戶資料*
