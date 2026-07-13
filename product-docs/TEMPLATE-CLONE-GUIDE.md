# 套版母版指南｜beauty-studio-booking

> **用途**：未來接新客戶時，照這份文件**複製整套做法**、換成該客戶自己的帳號與資料。  
> **讀者**：接案老闆、業務窗口（不用懂程式也能看懂流程）。  
> **母版來源**：`beauty-studio-booking`（2026-07 基礎款已驗收）

**口訣**：一個客戶 = 一套帳號 + 一份資料，不混用 Demo。

---

## 1. 這套母版目前包含哪些基礎款功能

以下皆屬**基礎買斷版／建置加維護版**，交付新客戶時**不需另報月曆**。

### 客人端（LINE LIFF 預約頁）

| 功能 | 白話說明 |
|------|----------|
| 客戶端 LINE LIFF 預約 | 客人從 LINE 開啟預約頁，自動登入辨識身分 |
| 服務列表 | 顯示上架中的服務、價格、時長 |
| **客戶端月曆選日期** | 選服務後出現整月月曆，可切換月份 |
| **有空位日期才能點** | 只有「當天有開放營業、且還有空檔」的日期可以點；未開放、已過期、已額滿、今日時段已過 → 灰色不可點 |
| **點日期後顯示可預約時段** | 點可約日後，下方出現時段按鈕供選擇 |
| 建立預約 | 選服務 + 日期 + 時段後送出，寫入預約紀錄 |
| 我的預約 | 客人查看自己的預約 |
| 取消預約 | 依規則取消，狀態更新 |

**客人預約三步驟**：選服務 → 月曆選日期 → 選時段 → 確認預約。

### 業主端（LINE 管理頁）

| 功能 | 白話說明 |
|------|----------|
| **業主端月曆預約查詢** | 以月曆查看各日預約；點日期看當日清單 |
| 業主端服務管理 | 新增、修改、上架／下架服務 |
| 業主端營業時段管理 | 設定每週哪幾天、幾點到幾點可預約 |
| 業主端店面設定 | 店名、主色、公告文字等 |
| **owner 權限後端驗證** | 只有授權的業主 LINE 帳號能操作管理功能；權限在伺服器驗證，不是藏按鈕而已 |

### 技術組成（知道即可）

| 組件 | 負責什麼 |
|------|----------|
| GitHub Pages | 放客人／業主看得見的前端畫面 |
| Cloudflare Workers | 放 API（預約、權限、跟 Notion 溝通） |
| Notion | 放服務、時段、預約、店面設定 |
| LINE LIFF | 讓客人和業主用 LINE 開網頁 |

更完整的商品說明見 [PRODUCT-TEMPLATE-MASTER.md](PRODUCT-TEMPLATE-MASTER.md)。  
Demo 驗收紀錄見 [DEMO-ACCEPTANCE-2026-07-14.md](DEMO-ACCEPTANCE-2026-07-14.md)。

---

## 2. 新客戶複製時要換哪些東西

複製的是**程式架構與流程**，以下全部換成**該客戶專屬**：

| 類別 | 要換什麼 | 說明 |
|------|----------|------|
| **GitHub** | repo 名稱、GitHub Pages 網址 | 每客戶獨立 repo 或獨立分支＋Pages |
| **LINE** | Provider、LINE Login Channel、LIFF ID | 客人端、業主端各需 LIFF（或依方案） |
| **Cloudflare** | Worker 名稱、Worker 網址 | 每客戶一個 API 網址 |
| **Cloudflare Secrets** | 後端密碼組 | 見下方「絕對不能共用」一節 |
| **Notion** | workspace、四個資料庫 | 服務、營業時段、預約、店面設定 |
| **業主權限** | `OWNER_LINE_USER_IDS` | 誰能開業主管理頁 |
| **前端設定** | `API_BASE_URL` | 指向該客戶的 Worker 網址 |
| **品牌與營運資料** | 店名、主色、公告、服務、營業時段 | 可在業主端或 Notion 維護 |

### 前端要改的檔案（工程執行）

| 檔案 | 改什麼 |
|------|--------|
| `customer-ui/js/config.js` | 客人 LIFF ID、`API_BASE_URL` |
| `owner-admin/js/config.js` | 業主 LIFF ID、`API_BASE_URL` |
| 同步後的 `docs/js/config.js`、`docs/owner/js/config.js` | 與上相同（GitHub Pages 用） |

### 後端要設的項目（工程執行，不 commit）

| 項目 | 放哪裡 |
|------|--------|
| Notion Token、四表 Database ID | Cloudflare Secrets + 本機 `backend/.dev.vars` |
| `OWNER_LINE_USER_IDS` | 同上 |
| `LIFF_CHANNEL_ID` | 同上（LINE Channel ID，不是 LIFF ID） |

詳細步驟可對照 [CLIENT-NOTION-SETUP-FLOW.md](CLIENT-NOTION-SETUP-FLOW.md)、[CLIENT-LINE-SETUP-FLOW.md](CLIENT-LINE-SETUP-FLOW.md)、[CLIENT-DELIVERY-SOP.md](CLIENT-DELIVERY-SOP.md)。

---

## 3. 絕對不能複製給客戶的東西

> ⚠️ 以下若共用，可能造成資料外洩、預約混在一起、或客戶無法自主維護。

| 禁止項目 | 原因 |
|----------|------|
| `backend/.dev.vars` | 本機密碼檔，含 Token 與 ID |
| `NOTION_TOKEN` | 等於資料庫主鑰匙 |
| Cloudflare API Token | 可改 Worker 與 Secrets |
| LINE Channel Secret | 可冒用 LINE 通道 |
| 任何私人帳號 token | 開發者個人帳號不當正式客戶環境 |
| Demo 客戶資料 | Demo 的 Notion、預約紀錄、測試服務不可給正式客戶用 |
| Demo Cloudflare Secrets | 多家店共用同一把後門鑰匙 |

**可以複製的**：程式碼、文件流程、驗收方式、報價邏輯。  
**不可複製共用的**：Token、Notion 庫、Secrets、Demo 網址、業主 userId。

---

## 4. 新客戶套版流程

照順序做，漏一步容易上線失敗。

| 步驟 | 要做什麼 | 完成標準 |
|------|----------|----------|
| **1. 複製 repo** | 從母版複製到新 GitHub repo | 程式完整、`.dev.vars` 不在版控內 |
| **2. 建立新 Notion** | 四表 + Integration | `check-notion.mjs` 四表 OK |
| **3. 建立新 LINE LIFF** | Channel、客人 LIFF、業主 LIFF、Endpoint 指到 GitHub Pages | 從 LINE 可開啟兩個頁面 |
| **4. 建立新 Cloudflare Worker** | 部署同一套 backend | `/api/health` 回傳正常 |
| **5. 填 secrets** | `wrangler secret put` 上傳密碼組 | 7 項 Secrets 齊全 |
| **6. 填前端 config** | LIFF ID、`API_BASE_URL` | 兩端 config 指向正確 |
| **7. sync docs** | 執行 `scripts/sync-github-pages.sh` | `docs/` 與前端一致 |
| **8. deploy backend** | `npx wrangler deploy` | Worker 網址可連、新 API 正常 |
| **9. push GitHub Pages** | push 到 GitHub，開啟 Pages | 客人／業主網址可開 |
| **10. 實機驗收** | 用手機 LINE 測完整流程 | 見下方第 5 節清單 |

**建議時機**：客戶資料齊全、訂金收到後再開工（見 [CLIENT-INFO-FORM.md](CLIENT-INFO-FORM.md)）。

---

## 5. 驗收清單

新客戶上線前，請逐項勾選（可用 [DEMO-ACCEPTANCE-2026-07-14.md](DEMO-ACCEPTANCE-2026-07-14.md) 當紀錄範本）。

### 客人端

- [ ] 客戶端可登入（LINE LIFF 正常）
- [ ] 可看到服務列表（僅上架服務）
- [ ] 選服務後月曆可顯示
- [ ] 月曆可顯示可預約日期（有開放且有空位的日可點）
- [ ] 不可約日期為灰色、無法點選
- [ ] 點可約日後可看到時段按鈕
- [ ] 可建立預約（Notion 有紀錄）
- [ ] 我的預約可看到新預約
- [ ] 可取消預約

### 業主端

- [ ] 業主端可登入（授權帳號）
- [ ] 非業主帳號無法操作管理 API
- [ ] 業主端月曆可看到預約（有預約的日期有標記）
- [ ] 點日期可看當日預約清單
- [ ] 可新增／修改／上架／下架服務
- [ ] 可設定營業時段（影響客人月曆可約日）
- [ ] 可修改店面設定（店名、主色、公告）

### 安全

- [ ] 前端 `config.js` 只有 LIFF ID、`API_BASE_URL`（無 Token）
- [ ] `.dev.vars` 未 commit
- [ ] 客戶環境未使用 Demo 的 Notion 或 Secrets

---

## 6. 加購模組規劃入口（下一階段，非本次基礎款）

以下功能**尚未實作**，屬未來加購模組，接案時需**另外報價**，不要當成基礎款免費做：

| 模組 | 說明 |
|------|------|
| 包卡 | 客人購買次數方案 |
| 儲值金 | 預先儲值、扣款預約 |
| 剩餘堂數 | 顯示還剩幾堂可用 |
| 已開卡／未開卡 | 區分客人是否已購買方案 |

規劃文件（任務包，待實作）：`TASK-addon-package-cards.md`（專案根目錄）。

**與基礎款的界線**：客人端月曆選日期、業主端月曆預約查詢 → **基礎款已含**；堂數卡／儲值 → **加購**。

---

## 相關文件索引

| 文件 | 用途 |
|------|------|
| [PRODUCT-TEMPLATE-MASTER.md](PRODUCT-TEMPLATE-MASTER.md) | 商品一句話、報價、安全規則 |
| [CLIENT-DELIVERY-SOP.md](CLIENT-DELIVERY-SOP.md) | 工程 10 步交付細節 |
| [CLIENT-NOTION-SETUP-FLOW.md](CLIENT-NOTION-SETUP-FLOW.md) | Notion 建庫 |
| [CLIENT-LINE-SETUP-FLOW.md](CLIENT-LINE-SETUP-FLOW.md) | LINE／LIFF 設定 |
| [DEMO-ACCEPTANCE-2026-07-14.md](DEMO-ACCEPTANCE-2026-07-14.md) | 驗收紀錄範本 |
| [PRICING-PACKAGES.md](PRICING-PACKAGES.md) | 報價方案 |

---

*文件版本：1.0｜beauty-studio-booking 套版母版｜不含任何 Token、密碼或客戶個資*
