# 客戶 Notion 資料庫設定流程

> **用途**：接新客戶或建 Demo 時，照本文件在 Notion 建立四個資料庫，並對接後端 API。  
> **程式對照**：欄位名稱必須與 `backend/src/notion.js` 頂部註解**完全一致**。

---

## 一、Demo 版 vs 正式客戶版

| 項目 | Demo（本專案測試） | 正式客戶 |
|------|-------------------|----------|
| Notion 工作區 | 開發者自己的 Notion | **客戶自己的** Notion（或客戶授權的工作區） |
| 頁面名稱範例 | `Beauty Studio Booking Demo` | `{店名} 預約系統` |
| Integration | 開發者建立 | 客戶工作區內新建，或請客戶邀請你 |
| Token / Database ID | 填在開發者 `.dev.vars` | **每客戶一組**，不可沿用 Demo |

> **不要讓客戶正式系統綁在開發者 Demo 的 Notion 上。** 交付前為客戶新建整套資料庫與 Integration。

---

## 二、本專案目前進度（Demo）

在 Notion 頁面 **`Beauty Studio Booking Demo`** 底下建立四個資料庫：

| 步驟 | 資料庫 | Notion 建議標題 | 環境變數 | 狀態 |
|------|--------|-----------------|----------|------|
| 1 | 服務項目 | `services` | `NOTION_DATABASE_SERVICES` | 🟡 已建表，待補欄位 |
| 2 | 營業時段 | `slots` | `NOTION_DATABASE_SLOTS` | ⬜ 待建立 |
| 3 | 預約紀錄 | `bookings` | `NOTION_DATABASE_BOOKINGS` | ⬜ 待建立 |
| 4 | 店面設定 | `settings` | `NOTION_DATABASE_SETTINGS` | ⬜ 待建立 |
| 5 | 客人資料 | `customers` | `NOTION_DATABASE_CUSTOMERS` | ⬜ 建議建立 |

完成一格後把 ⬜ 改成 ✅。

---

## 三、事前準備：建立 Integration

1. 開啟 [Notion Integrations](https://www.notion.so/my-integrations)
2. 點 **New integration**
3. 名稱範例：`Beauty Studio Booking Demo`
4. 選擇工作區（與 `Beauty Studio Booking Demo` 頁面相同）
5. 複製 **Internal Integration Secret** → 這就是 `NOTION_TOKEN`

**注意**：Token 只放在 `backend/.dev.vars` 或 Cloudflare Secrets，**不可**寫進前端或 GitHub。

---

## 四、頁面結構建議

在 **`Beauty Studio Booking Demo`** 頁面內，由上而下建議排列：

```
Beauty Studio Booking Demo
├── services      ← 服務項目（inline database）
├── slots         ← 營業時段
├── bookings      ← 預約紀錄（平時可摺疊，資料由系統寫入）
└── settings      ← 店面設定（至少 1 筆）
```

每個區塊用 Notion 的 **/database → Inline** 建立表格資料庫即可。

---

## 五、資料庫 1：services（服務項目）

### 建立方式

1. 在 `Beauty Studio Booking Demo` 頁面輸入 `/database` → 選 **Inline**
2. 資料庫標題可命名為 `services`（僅供辨識，程式讀的是**欄位名稱**）
3. 依下表新增屬性（**+ 新增屬性**）

### 欄位一覽

| 欄位名稱 | Notion 類型 | 設定 |
|----------|-------------|------|
| 服務名稱 | **Title** | 預設已有，勿改名 |
| 時長 | 數字 | 單位：分鐘 |
| 價格 | 數字 | 可留空 |
| 說明 | 文字 | |
| 狀態 | 選項 | 選項值必須是：`上架`、`下架` |
| 排序 | 數字 | 越小越前面 |

### Demo 範例資料（建 1～2 筆測試）

| 服務名稱 | 時長 | 價格 | 狀態 | 排序 |
|----------|------|------|------|------|
| 臉部保養 | 60 | 1200 | 上架 | 0 |
| 美甲造型 | 90 | 1500 | 上架 | 1 |

### 連接 Integration

資料庫右上角 **··· → 連接** → 選你的 Integration。

### 取得 Database ID

1. 點資料庫右上角 **··· → 在全新分頁中開啟**
2. 複製網址，取最後 **32 字元**（可含連字號）
3. 填入 `.dev.vars`：`NOTION_DATABASE_SERVICES=...`

---

## 六、資料庫 2：slots（營業時段）

### 欄位一覽

| 欄位名稱 | Notion 類型 | 設定 |
|----------|-------------|------|
| 名稱 | **Title** | 例：週一上午 |
| 星期 | 選項 | 選項值：`日`、`一`、`二`、`三`、`四`、`五`、`六` |
| 開始時間 | 文字 | 格式 `10:00`（不要用時間類型，用**文字**） |
| 結束時間 | 文字 | 格式 `18:00` |
| 狀態 | 選項 | 選項值：`開放`、`關閉` |

### Demo 範例（週一～週五 10:00～18:00）

| 名稱 | 星期 | 開始時間 | 結束時間 | 狀態 |
|------|------|----------|----------|------|
| 週一營業 | 一 | 10:00 | 18:00 | 開放 |
| 週二營業 | 二 | 10:00 | 18:00 | 開放 |
| … | … | … | … | … |

> 也可先不手動建資料，之後由**業主管理頁**「營業時段」寫入；但 Demo 建議先手動建幾筆方便測試。

### 環境變數

`NOTION_DATABASE_SLOTS=...`（同樣取網址最後 32 字元）

---

## 七、資料庫 3：bookings（預約紀錄）

### 欄位一覽

| 欄位名稱 | Notion 類型 | 說明 |
|----------|-------------|------|
| 預約編號 | **Title** | 系統自動產生 |
| LINE userId | 文字 | |
| 客人姓名 | 文字 | |
| 客人電話 | 文字 | 預約當下電話（可首次寫入時自動補欄） |
| 客人生日 | 日期 | 選填 |
| 服務ID | 文字 | Notion 服務項目的 page ID |
| 服務名稱 | 文字 | |
| 預約日期 | 日期 | |
| 預約時段 | 文字 | 例：`14:00` |
| 狀態 | 選項 | 選項值：`已確認`、`已取消` |
| 取消原因 | 文字 | 業主取消時必填；客人自行取消可寫「客人自行取消」 |
| 取消者 | 選項 | 選項值：`客人`、`業主` |
| 取消時間 | 日期 | 取消當日（台北） |

### 注意

- **不必**手動新增預約資料，測試時由客人端 LIFF 建立
- 欄位名稱 `LINE userId` 中間有空格，請完全一致

### 環境變數

`NOTION_DATABASE_BOOKINGS=...`

---

## 八、資料庫 4：settings（店面設定）

### 欄位一覽

| 欄位名稱 | Notion 類型 | 說明 |
|----------|-------------|------|
| 設定名稱 | **Title** | 例：預設 |
| 品牌名稱 | 文字 | 客人端顯示店名 |
| 主色 | 文字 | 例：`#E8B4B8` |
| 公告文字 | 文字 | 首頁公告 |
| 取消規則 | 文字 | |

### 至少新增 1 筆

| 設定名稱 | 品牌名稱 | 主色 | 公告文字 | 取消規則 |
|----------|----------|------|----------|----------|
| 預設 | Beauty Studio Demo | #E8B4B8 | 歡迎線上預約 | 預約日前 24 小時可免費取消 |

> 系統讀取**第一筆**作為預設；之後也可由業主管理頁修改。

### 環境變數

`NOTION_DATABASE_SETTINGS=...`

---

## 八－B、資料庫 5：customers（客人資料，建議）

### 欄位一覽

| 欄位名稱 | Notion 類型 | 說明 |
|----------|-------------|------|
| 客人名稱 | **Title** | 真實姓名 |
| LINE userId | 文字 | 以 userId 建立／更新 |
| 電話 | 文字 | |
| 生日 | 日期 | 選填 |
| LINE 暱稱 | 文字 | |
| 備註 | 文字 | |

### 環境變數

`NOTION_DATABASE_CUSTOMERS=...`（`.dev.vars`／Cloudflare Secret；**不要**寫進前端）

> 未設定時仍可預約：姓名／電話會寫入 bookings。設定後可累積同一位客人資料。

---

## 九、寫入 backend/.dev.vars

```bash
cd backend
cp .dev.vars.example .dev.vars
```

編輯 `.dev.vars`（**不要 commit**）：

```bash
NOTION_TOKEN=secret_你的IntegrationSecret

NOTION_DATABASE_SERVICES=服務項目DatabaseID
NOTION_DATABASE_SLOTS=營業時段DatabaseID
NOTION_DATABASE_BOOKINGS=預約紀錄DatabaseID
NOTION_DATABASE_SETTINGS=店面設定DatabaseID
# 建議：
# NOTION_DATABASE_CUSTOMERS=客人資料DatabaseID

OWNER_LINE_USER_IDS=U業主userId
LIFF_CHANNEL_ID=你的ChannelID
```

---

## 十、驗收測試

```bash
cd backend
npm run dev
```

另開終端機：

```bash
# 健康檢查（notion 應為 true）
curl -s http://127.0.0.1:8787/api/health

# 服務項目（應回傳陣列）
curl -s http://127.0.0.1:8787/api/services

# 店面設定（應有 brandName、primaryColor）
curl -s http://127.0.0.1:8787/api/settings
```

| 測試 | 預期 |
|------|------|
| `/api/health` | `{ "ok": true, "notion": true }` |
| `/api/services` | 回傳上架中的服務 JSON 陣列 |
| `/api/settings` | 回傳品牌名稱、主色等 |

若失敗，見下方「常見錯誤」。

---

## 十一、客戶交付時怎麼切割

正式客戶**不要**沿用 Demo 的 Notion：

1. 在客戶 Notion 新建頁面與四個資料庫（欄位與本文件相同）
2. 新建 Integration，取得新 `NOTION_TOKEN`
3. 取得四個新 Database ID
4. 填入客戶專屬 `.dev.vars` / Cloudflare Secrets
5. 確認 Demo 的 Token 與 ID **未**寫入客戶 repo 或前端

交付給客戶的內容：

| 交付 | 不交付 |
|------|--------|
| 操作說明（業主管理頁） | Notion Integration Token |
| 預約 / 管理 LIFF 連結 | Database ID（可選，視維護合約） |
| 若合約含維護：你代管 Notion | `.dev.vars` 全文 |

---

## 十二、常見錯誤

| 症狀 | 原因 | 修正 |
|------|------|------|
| `缺少 NOTION_TOKEN` | `.dev.vars` 未建或未填 | 完成第九節 |
| `Notion API 錯誤 404` | Database ID 錯誤 | 重抄網址最後 32 字元 |
| `Notion API 錯誤 403` | 未連接 Integration | 每個資料庫都要 Connections |
| 服務列表空陣列 | 狀態不是「上架」 | 選項值改為 `上架` / `下架` |
| 讀不到欄位 | 欄位名稱打錯 | 對照第五～八節逐字檢查 |
| 時段無法計算 | 開始/結束時間用了「時間」類型 | 改為**文字**類型 |

---

## 十三、完成檢查表

```
[ ] Integration 已建立，NOTION_TOKEN 已記錄（僅 .dev.vars）
[ ] Beauty Studio Booking Demo 頁面已建立
[ ] services：6 個欄位正確 + 已連接 Integration + 至少 1 筆上架服務
[ ] slots：5 個欄位正確 + 已連接 Integration
[ ] bookings：8 個欄位正確 + 已連接 Integration
[ ] settings：5 個欄位正確 + 已連接 Integration + 至少 1 筆預設
[ ] 四個 Database ID 已填入 .dev.vars
[ ] 本機 /api/health notion: true
[ ] 本機 /api/services 可讀
[ ] 本機 /api/settings 可讀
[ ] .dev.vars 未 commit 到 Git
```

---

## 十四、與其他交付文件的順序

```
CLIENT-INFO-CHECKLIST.md     → 先蒐集店名、服務、營業時間
        ↓
CLIENT-NOTION-SETUP-FLOW.md  → 本文件：建 Notion 四表（你現在在這）
        ↓
CLIENT-LINE-SETUP-FLOW.md    → LINE / LIFF 設定
        ↓
（部署 Cloudflare + GitHub Pages）
        ↓
CLIENT-DELIVERY-CHECKLIST.md → 交付前總驗收
```

---

## 相關文件

- `CLIENT-INFO-CHECKLIST.md` — 客戶資料蒐集
- `CLIENT-LINE-SETUP-FLOW.md` — LINE 設定
- `CLIENT-DELIVERY-CHECKLIST.md` — 交付檢查
- `backend/src/notion.js` — 欄位名稱程式對照（工程師用）

---

*請勿在本文件填寫真實 Token 或 Database ID。*
