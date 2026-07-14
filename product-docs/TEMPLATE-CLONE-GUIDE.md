# 套版母版指南｜beauty-studio-booking

> **用途**：未來接新客戶時，照這份文件**複製整套做法**、換成該客戶自己的帳號與資料。  
> **讀者**：接案老闆、業務窗口（不用懂程式也能看懂）。  
> **母版來源**：`beauty-studio-booking`（2026-07 基礎款已驗收）

**口訣**：一個客戶 = 一套帳號 + 一份資料，不混用 Demo、不混用其他客戶。

---

## 1. 這套母版目前包含哪些基礎功能

以下皆屬**基礎款**（基礎買斷／建置加維護），交付時**不必另報月曆**。

### 客人端（LINE 預約頁）

| 功能 | 白話說明 |
|------|----------|
| 客戶端 LINE 預約 | 客人從 LINE 開啟預約頁，自動登入辨識身分 |
| 客戶端月曆選日期 | 選服務後出現整月月曆，可切換月份 |
| 有空位日期才可點 | 只有「當天有開放營業、且還有空檔」才可點；未開放／已過期／已額滿／今日時段已過 → 灰色不可點 |
| 點日期後顯示可預約時段 | 點可約日後，下方出現時段按鈕 |
| 我的預約／取消預約 | 查看自己的預約；依規則取消 |

**客人三步驟**：選服務 → 月曆選日期 → 選時段 → 確認預約。

### 業主端（LINE 管理頁）

| 功能 | 白話說明 |
|------|----------|
| 業主端月曆預約查詢 | 月曆查看各日預約；點日期看當日清單 |
| 業主端服務管理 | 新增、修改、上架／下架服務 |
| 業主端營業時段管理 | 設定每週哪幾天、幾點到幾點可預約 |
| 業主端店面設定 | 店名、品牌色、公告文字等 |
| owner 權限後端驗證 | 只有授權的業主 LINE 帳號能操作；權限由伺服器驗證，不是藏按鈕 |

### 技術組成（知道即可）

| 組件 | 負責什麼 |
|------|----------|
| GitHub Pages | 客人／業主看得見的前端畫面 |
| Cloudflare Workers | API（預約、權限、跟 Notion 溝通） |
| Notion | 服務、時段、預約、店面設定 |
| LINE LIFF | 用 LINE 開預約頁／管理頁 |

更多商品說明見 [PRODUCT-TEMPLATE-MASTER.md](PRODUCT-TEMPLATE-MASTER.md)。  
Demo 驗收見 [DEMO-ACCEPTANCE-2026-07-14.md](DEMO-ACCEPTANCE-2026-07-14.md)。

---

## 2. 新客戶複製時一定要更換的項目

複製的是**程式架構與流程**，下列全部換成**該客戶專屬**：

| 一定要換 | 說明 |
|----------|------|
| GitHub repo | 每客戶獨立 repo（或獨立專案） |
| GitHub Pages URL | 客人端／業主端前端網址 |
| LINE Provider | 客戶自己的 LINE Developers 提供者 |
| LINE Login Channel | 客戶自己的 Login 通道 |
| LIFF ID | 客人端、業主端各一（或依方案） |
| LIFF Channel ID | Channel 的 Channel ID（數字），給後端驗證用，**不是** LIFF ID |
| owner LINE userId | 誰能開業主管理頁（`OWNER_LINE_USER_IDS`） |
| Notion Integration Token | 該客戶的 Integration Secret |
| Notion database IDs | 四表各自的 Database ID（服務、時段、預約、設定） |
| Cloudflare Worker | 該客戶的 Worker 名稱與網址 |
| Cloudflare Secrets | 上述密碼與 ID 上傳到該客戶 Worker |
| API_BASE_URL | 前端 config 指向該客戶 Worker |
| 店名、品牌色、公告文字、服務項目、營業時段 | 品牌與營運資料，不可沿用 Demo／舊客戶 |

### 前端要改的檔案（工程執行）

| 檔案 | 改什麼 |
|------|--------|
| `customer-ui/js/config.js` | 客人 LIFF ID、`API_BASE_URL` |
| `owner-admin/js/config.js` | 業主 LIFF ID、`API_BASE_URL` |
| sync 後的 `docs/js/config.js`、`docs/owner/js/config.js` | 與上相同（GitHub Pages 用） |

### 後端要設的項目（工程執行，不 commit）

| 項目 | 放哪裡 |
|------|--------|
| Notion Token、四表 Database ID | Cloudflare Secrets + 本機 `backend/.dev.vars` |
| `OWNER_LINE_USER_IDS` | 同上 |
| `LIFF_CHANNEL_ID` | 同上（Channel ID，不是 LIFF ID） |

細節步驟見 [CLIENT-NOTION-SETUP-FLOW.md](CLIENT-NOTION-SETUP-FLOW.md)、[CLIENT-LINE-SETUP-FLOW.md](CLIENT-LINE-SETUP-FLOW.md)、[CLIENT-DELIVERY-SOP.md](CLIENT-DELIVERY-SOP.md)。

---

## 3. 絕對不能直接複製給新客戶的東西

> ⚠️ 共用會造成資料外洩、預約混在一起、或客戶無法自主維護。

| 禁止項目 | 原因 |
|----------|------|
| `backend/.dev.vars` | 本機密碼檔，含 Token 與 ID |
| Notion Token（`NOTION_TOKEN`） | 等於資料庫主鑰匙 |
| Cloudflare API Token | 可改 Worker 與 Secrets |
| LINE Channel Secret | 可冒用 LINE 通道 |
| 任何舊客戶的 Notion database ID | 新客戶會讀到／寫到別人的資料 |
| 任何舊客戶的 owner userId | 錯誤的人能開管理後台 |
| Demo／其他客戶的 Secrets 與預約資料 | 多家店共用後門、資料混亂 |

**可以複製**：程式碼、文件流程、驗收方式、報價邏輯。  
**不可複製共用**：Token、Notion 庫 ID、Secrets、Demo 網址、業主 userId。

---

## 4. 新客戶套版流程

照順序做，漏一步容易上線失敗。

1. **複製 repo** — 從母版複製到新 GitHub repo（不要帶入 `.dev.vars`）。  
2. **建立新 Notion** — 建四表 + Integration，填入該客戶的 Token 與 Database ID。  
3. **建立新 LINE Channel／LIFF** — Provider、Login Channel、客人 LIFF、業主 LIFF；Endpoint 指到 GitHub Pages。  
4. **建立或設定 Cloudflare Worker** — 部署該客戶的後端 API。  
5. **上傳 Secrets** — 用 `wrangler secret put` 上傳該客戶密碼組（勿用舊客戶）。  
6. **填前端 config** — 兩端填入該客戶 LIFF ID、`API_BASE_URL`。  
7. **sync docs** — 執行 `scripts/sync-github-pages.sh`。  
8. **deploy backend** — `npx wrangler deploy`，確認 `/api/health` 正常。  
9. **push GitHub Pages** — push 並開啟 Pages，確認客人／業主網址可開。  
10. **手機 LINE 驗收** — 用實機 LINE 測完整流程（見第 5 節）。

**建議時機**：客戶資料齊全、訂金收到後再開工（見 [CLIENT-INFO-FORM.md](CLIENT-INFO-FORM.md)）。

---

## 5. 驗收清單

新客戶上線前請逐項勾選（可用 [DEMO-ACCEPTANCE-2026-07-14.md](DEMO-ACCEPTANCE-2026-07-14.md) 當紀錄範本）。

### 客人端

- [ ] 客戶端可開啟（LINE LIFF 正常）
- [ ] 客戶端可看到服務
- [ ] 客戶端月曆可看到可約日期（有開放且有空位才可點）
- [ ] 點可約日後可看到時段
- [ ] 客戶端可建立預約
- [ ] 客戶端可取消預約

### 業主端

- [ ] 業主端可登入（授權帳號）
- [ ] 業主端月曆可看到預約
- [ ] 業主端可管理服務
- [ ] 業主端可管理時段
- [ ] 業主端可管理店面設定

### 安全（必勾）

- [ ] 前端 config 只有 LIFF ID、`API_BASE_URL`（無 Token）
- [ ] `.dev.vars` 未 commit
- [ ] 未使用 Demo／舊客戶的 Notion ID、Secrets、owner userId

---

## 6. 加購模組入口（下一階段，非本次基礎款）

以下**尚未實作**，屬未來加購；接案時需**另外報價**，不要當基礎款免費做：

| 加購模組 | 說明 |
|----------|------|
| 包卡 | 客人購買次數方案 |
| 儲值金 | 預先儲值、扣款預約 |
| 剩餘堂數 | 顯示還剩幾堂可用 |
| 已開卡／未開卡 | 區分方案是否已啟用 |
| 扣堂紀錄 | 每次預約／消耗的堂數紀錄 |

規劃任務包（待實作）：專案根目錄 `TASK-addon-package-cards.md`。

**界線**：客人端／業主端月曆 → **基礎款已含**；包卡／儲值／堂數 → **加購**。

---

## 相關文件索引

| 文件 | 用途 |
|------|------|
| [PRODUCT-TEMPLATE-MASTER.md](PRODUCT-TEMPLATE-MASTER.md) | 商品一句話、報價、安全規則 |
| [CLIENT-DELIVERY-SOP.md](CLIENT-DELIVERY-SOP.md) | 工程交付細節 |
| [CLIENT-NOTION-SETUP-FLOW.md](CLIENT-NOTION-SETUP-FLOW.md) | Notion 建庫 |
| [CLIENT-LINE-SETUP-FLOW.md](CLIENT-LINE-SETUP-FLOW.md) | LINE／LIFF 設定 |
| [DEMO-ACCEPTANCE-2026-07-14.md](DEMO-ACCEPTANCE-2026-07-14.md) | 驗收紀錄範本 |
| [PRICING-PACKAGES.md](PRICING-PACKAGES.md) | 報價方案 |

---

*文件版本：1.1｜beauty-studio-booking 套版母版｜不含任何 Token、密碼或客戶個資*
