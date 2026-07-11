# 美業預約系統 — 客戶複製設定指南

> 這份文件給**非工程師**使用。  
> 目的：讓您能把這套系統，照步驟複製給下一位美業客戶使用。

---

## 一、這套系統有哪些主要資料夾？

```
beauty-studio-booking/
├── customer-ui/      ← 客人用的預約頁面（原始碼）
├── owner-admin/      ← 業主用的管理頁面（原始碼）
├── backend/          ← 後端 API（連接 Notion 資料庫）
├── docs/             ← 網頁正式上線用的副本（由腳本自動產生）
├── scripts/          ← 部署用的小工具
├── README.md         ← 工程師技術說明
└── CLIENT-SETUP-GUIDE.md  ← 就是這份文件
```

---

## 二、每個資料夾是做什麼用的？

| 資料夾 | 用途 | 誰會用到 |
|--------|------|----------|
| `customer-ui/` | 客人從 LINE 開啟的預約畫面。可選服務、選日期、選時段、查預約、取消預約。 | 客人、業主（看畫面效果） |
| `owner-admin/` | 業主從 LINE 開啟的管理後台。可看今日預約、管理服務、設定營業時段、改店名與主色。 | 業主 |
| `backend/` | 系統的「大腦」。負責讀寫 Notion 資料、驗證業主身分、防止重複預約。部署在 Cloudflare Workers。 | 工程師或協助部署的人員 |
| `docs/` | 給 GitHub Pages 用的網頁檔案。**不要手動改這裡**，改 `customer-ui/` 和 `owner-admin/` 後再執行同步腳本。 | 系統自動產生 |
| `scripts/` | 把前端原始碼複製到 `docs/` 的腳本。 | 工程師或協助部署的人員 |

---

## 三、哪些檔案是客戶「可以」調整的？

### 日常營運（建議業主自己操作，不用改程式碼）

透過 **業主管理頁面**（`owner-admin`）即可處理：

- 店名（品牌名稱）
- 主色
- 公告文字
- 取消規則
- 服務項目（新增、修改、上架、下架）
- 每週營業時段

### 新客戶上線時（需有人協助改設定檔）

| 檔案 | 說明 |
|------|------|
| `customer-ui/js/config.js` | 填入此客戶的 LINE LIFF ID 與 API 網址 |
| `owner-admin/js/config.js` | 同上（業主端也要填） |
| `backend/.dev.vars` | 填入此客戶專屬的 Notion 與業主 LINE ID（**不可上傳 GitHub**） |
| `backend/wrangler.toml` | 可改 Workers 專案名稱與預設店名（選用） |

### 外觀微調（選用，需基本 HTML/CSS 知識）

| 檔案 | 說明 |
|------|------|
| `customer-ui/css/style.css` | 客人端畫面樣式 |
| `owner-admin/css/style.css` | 業主端畫面樣式 |
| `customer-ui/index.html` | 客人端頁面標題等文字 |
| `owner-admin/index.html` | 業主端頁面標題等文字 |

---

## 四、哪些檔案「絕對不能」亂改？

以下檔案牽涉系統邏輯與資料安全，**非工程師請勿修改**：

| 檔案 | 原因 |
|------|------|
| `backend/src/index.js` | API 路由總入口，改錯會導致整個系統無法運作 |
| `backend/src/notion.js` | Notion 資料庫讀寫邏輯，欄位名稱必須與 Notion 一致 |
| `backend/src/owner-auth.js` | 業主權限驗證，改錯可能讓外人進入管理後台 |
| `backend/src/slots.js` | 可預約時段計算邏輯 |
| `customer-ui/js/app.js` | 客人端預約流程 |
| `customer-ui/js/api.js` | 客人端 API 呼叫 |
| `customer-ui/js/liff-init.js` | LINE 登入流程，改錯可能無法登入 |
| `owner-admin/js/app.js` | 業主端管理流程 |
| `owner-admin/js/api.js` | 業主端 API 呼叫 |
| `owner-admin/js/liff-init.js` | LINE 登入流程 |
| `docs/` 底下所有檔案 | 這是自動產生的副本，手改會在下次同步時被覆蓋 |
| `backend/node_modules/` | 套件資料夾，不可手動修改 |

---

## 五～十、常見設定要去哪裡改？

### 5. 新客戶要改「店名」，要去哪裡？

**推薦方式（不用改程式碼）：**

1. 業主從 LINE 開啟管理頁面（`owner-admin`）
2. 點選「店面設定」分頁
3. 修改「品牌名稱」
4. 按「儲存設定」

儲存後，客人端首頁會自動顯示新店名。

**備用方式（工程師用）：**

- `backend/wrangler.toml` 裡的 `STUDIO_NAME`（僅影響 API 健康檢查顯示，不是客人看到的主店名）

---

### 6. 新客戶要改「主色」，要去哪裡？

**推薦方式（不用改程式碼）：**

1. 業主開啟管理頁面 →「店面設定」
2. 修改「主色（HEX）」，例如 `#E8B4B8`
3. 按「儲存設定」

客人端會自動套用新主色。

**備用方式（僅改預設值，新客戶上線前用）：**

- `customer-ui/css/style.css` 最上方的 `--primary` 變數

---

### 7. 新客戶要「新增服務項目」，要去哪裡？

**推薦方式（不用改程式碼）：**

1. 業主開啟管理頁面 →「服務項目」
2. 填寫服務名稱、時長、價格、說明
3. 按「新增服務」

也可在 Notion 的「服務項目」資料庫手動新增，但**欄位名稱必須完全一致**，不建議非工程師操作。

---

### 8. 新客戶要「設定營業時間」，要去哪裡？

**推薦方式（不用改程式碼）：**

1. 業主開啟管理頁面 →「營業時段」
2. 設定每週幾、幾點到幾點開放預約
3. 按「儲存營業時段」

系統會依服務時長，自動切出可預約的時間點（例如 60 分鐘服務，10:00～18:00 會產生 10:00、11:00… 等時段）。

---

### 9. 新客戶要更換「LINE LIFF ID」，要改哪個檔案？

必須改**兩個檔案**（內容要一致）：

1. `customer-ui/js/config.js`
2. `owner-admin/js/config.js`

找到這一行，填入新的 LIFF ID：

```javascript
LIFF_ID: "2010xxxxxxxx-xxxxx",
```

改完後，還要：

1. 執行 `./scripts/sync-github-pages.sh`（把變更同步到 `docs/`）
2. 推送到 GitHub，等網頁更新
3. 到 LINE Developers 確認 LIFF 的 Endpoint URL 與 GitHub Pages 網址一致

---

### 10. 新客戶要更換「Cloudflare API 網址」，要改哪個檔案？

必須改**兩個檔案**（內容要一致）：

1. `customer-ui/js/config.js`
2. `owner-admin/js/config.js`

找到這一行，填入此客戶的 Workers 網址：

```javascript
API_BASE_URL: "https://beauty-studio-api.xxxxx.workers.dev"
```

改完後同樣要執行同步腳本並推送到 GitHub。

---

## 十一、Notion Token 不可以放在哪裡？

**絕對不可以放在以下位置：**

| 不可以放的位置 | 原因 |
|--------------|------|
| `customer-ui/js/config.js` | 前端檔案會公開在網路上，任何人都能看到 |
| `owner-admin/js/config.js` | 同上 |
| `docs/` 底下任何檔案 | 這些是公開網頁 |
| GitHub 公開儲存庫的任何檔案 | 會被外人看到 |
| LINE LIFF 頁面的 HTML / JavaScript | 瀏覽器可查看原始碼 |

**正確存放位置：**

- 本機：`backend/.dev.vars`（僅存在您的電腦，不上傳 GitHub）
- 正式環境：Cloudflare Workers 的 Secrets（透過 `wrangler secret bulk` 上傳）

---

## 十二、`.dev.vars` 是什麼？為什麼不能上傳 GitHub？

### `.dev.vars` 是什麼？

它是後端在本機開發與部署時使用的**機密設定檔**，裡面通常包含：

- `NOTION_TOKEN`（Notion 資料庫金鑰）
- 四個 Notion 資料庫 ID
- `OWNER_LINE_USER_IDS`（業主 LINE 帳號 ID）

### 為什麼不能上傳 GitHub？

1. GitHub 若是公開專案，上傳後**全世界都看得到**您的 Notion 金鑰
2. 外人拿到金鑰後，可以讀取、修改、刪除客戶的預約資料
3. 專案已在 `.gitignore` 排除 `backend/.dev.vars`，正常情況不會被 commit

### 可以上傳 GitHub 的類似檔案

- `backend/.dev.vars.example` — 這只是**範本**，裡面是假資料，可以公開

---

## 十三、複製給下一個客戶時的標準流程

以下假設您已有一份可正常運作的模板，要交給新客戶「花漾美甲工作室」使用。

### 階段 A：準備新客戶的帳號與資料庫

| 步驟 | 動作 | 負責人 |
|------|------|--------|
| A-1 | 在 Notion 建立新的 Integration，取得 Token | 工程師 |
| A-2 | 複製四個資料庫（服務項目、營業時段、預約紀錄、店面設定），欄位名稱不可改 | 工程師 |
| A-3 | 每個資料庫都要「連接」該 Integration | 工程師 |
| A-4 | 在 LINE Developers 建立新的 Messaging API Channel 與 LIFF App | 工程師 |
| A-5 | 在 Cloudflare 建立新的 Workers 專案（或複製部署設定） | 工程師 |
| A-6 | 建立新的 GitHub 儲存庫（建議每個客戶一個 repo） | 工程師 |

### 階段 B：修改設定檔

| 步驟 | 動作 | 負責人 |
|------|------|--------|
| B-1 | 複製整個 `beauty-studio-booking` 專案到新 repo | 工程師 |
| B-2 | 建立 `backend/.dev.vars`，填入新客戶的 Notion Token、Database ID、業主 LINE userId | 工程師 |
| B-3 | 修改 `customer-ui/js/config.js` 的 `LIFF_ID` 與 `API_BASE_URL` | 工程師 |
| B-4 | 修改 `owner-admin/js/config.js`（與 B-3 相同） | 工程師 |
| B-5 | 視需要修改 `backend/wrangler.toml` 的專案名稱 | 工程師 |

### 階段 C：部署

| 步驟 | 動作 | 負責人 |
|------|------|--------|
| C-1 | 在 `backend/` 執行 `npx wrangler secret bulk .dev.vars` 上傳機密 | 工程師 |
| C-2 | 在 `backend/` 執行 `npm run deploy` 部署 API | 工程師 |
| C-3 | 執行 `./scripts/sync-github-pages.sh` 同步前端到 `docs/` | 工程師 |
| C-4 | 推送到 GitHub，確認 GitHub Pages 已啟用（main 分支 / docs 資料夾） | 工程師 |
| C-5 | 在 LINE Developers 設定 LIFF Endpoint URL：<br>客人端 `https://<帳號>.github.io/<repo>/`<br>業主端 `https://<帳號>.github.io/<repo>/owner/` | 工程師 |

### 階段 D：驗收與交件

| 步驟 | 動作 | 負責人 |
|------|------|--------|
| D-1 | 業主從 LINE 開啟 `owner/my-line-id.html`，確認 LINE userId 已填入 `OWNER_LINE_USER_IDS` | 工程師 |
| D-2 | 業主登入管理頁，設定店名、主色、服務項目、營業時段 | 業主 |
| D-3 | 用另一個 LINE 帳號測試：選服務 → 選日期 → 選時段 → 預約 → 查詢 → 取消 | 業主 / 工程師 |
| D-4 | 業主確認「今日預約」能看到剛才的測試預約 | 業主 |
| D-5 | 交付：管理頁 LIFF 連結、預約頁 LIFF 連結、本文件 | 工程師 |

### 階段 E：日常維護（交件後）

業主可自行透過管理頁處理：

- 改店名、主色、公告、取消規則
- 新增 / 修改服務項目
- 調整營業時段
- 查看今日預約

需要工程師協助的情況：

- 更換 LINE Channel / LIFF ID
- 更換 Cloudflare 或 Notion 帳號
- 系統出錯或要加新功能

---

## 十四、檔案對照總表

| 檔案路徑 | 用途 | 誰可以改 | 什麼時候改 | 注意事項 |
|----------|------|----------|------------|----------|
| `customer-ui/js/config.js` | 客人端 LIFF ID 與 API 網址 | 工程師 | 新客戶上線、換 LINE / API 時 | 改完要同步 `docs/` 並推送 GitHub；**不可放 Notion Token** |
| `owner-admin/js/config.js` | 業主端 LIFF ID 與 API 網址 | 工程師 | 同上 | 必須與客人端 `config.js` 一致 |
| `customer-ui/index.html` | 客人端頁面結構 | 工程師（選用） | 要改頁面標題或版面時 | 改完要同步 `docs/`；更新 `?v=` 版本號避免 LINE 快取 |
| `owner-admin/index.html` | 業主端頁面結構 | 工程師（選用） | 同上 | 同上 |
| `customer-ui/css/style.css` | 客人端預設樣式 | 工程師（選用） | 新客戶上線前想改預設外觀 | 主色建議優先用管理後台改；改完要同步 `docs/` |
| `owner-admin/css/style.css` | 業主端預設樣式 | 工程師（選用） | 同上 | 同上 |
| `customer-ui/js/app.js` | 客人預約流程邏輯 | 工程師 only | 修 bug 或加功能時 | 非工程師勿改 |
| `customer-ui/js/api.js` | 客人端 API 呼叫 | 工程師 only | API 路徑變更時 | 非工程師勿改 |
| `customer-ui/js/liff-init.js` | 客人端 LINE 登入 | 工程師 only | 登入異常排查時 | 非工程師勿改 |
| `owner-admin/js/app.js` | 業主管理流程邏輯 | 工程師 only | 修 bug 或加功能時 | 非工程師勿改 |
| `owner-admin/js/api.js` | 業主端 API 呼叫 | 工程師 only | API 路徑變更時 | 非工程師勿改 |
| `owner-admin/js/liff-init.js` | 業主端 LINE 登入 | 工程師 only | 登入異常排查時 | 非工程師勿改 |
| `owner-admin/my-line-id.html` | 查詢業主 LINE userId | 工程師 | 設定業主權限時 | 僅用於取得 ID，不是日常頁面 |
| `backend/.dev.vars` | 本機 / 部署用機密設定 | 工程師 | 新客戶上線、換 Notion / 業主 ID | **絕對不可上傳 GitHub** |
| `backend/.dev.vars.example` | 機密設定範本 | 工程師 | 更新文件說明時 | 只放假資料，可公開 |
| `backend/wrangler.toml` | Cloudflare Workers 專案設定 | 工程師 | 新客戶建立新 Worker 時 | `STUDIO_NAME` 可改；機密不放這裡 |
| `backend/src/index.js` | API 路由入口 | 工程師 only | 加新 API 時 | 非工程師勿改 |
| `backend/src/notion.js` | Notion 資料讀寫 | 工程師 only | 資料庫欄位變更時 | 欄位名稱必須與 Notion 一致 |
| `backend/src/owner-auth.js` | 業主權限驗證 | 工程師 only | 調整權限邏輯時 | 改錯有資安風險 |
| `backend/src/slots.js` | 可預約時段計算 | 工程師 only | 調整時段邏輯時 | 非工程師勿改 |
| `scripts/sync-github-pages.sh` | 同步前端到 `docs/` | 工程師 | 每次改前端後 | 執行後才推送 GitHub |
| `docs/`（整個資料夾） | GitHub Pages 正式網頁 | 系統自動產生 | 執行同步腳本後 | **不要手動改**；改 `customer-ui/` 和 `owner-admin/` |
| **業主管理頁 → 店面設定** | 店名、主色、公告、取消規則 | 業主 | 開店、換品牌、活動公告 | 最推薦的日常方式，不用改程式碼 |
| **業主管理頁 → 服務項目** | 新增 / 修改服務 | 業主 | 新增療程、調價格、上下架 | 最推薦的日常方式 |
| **業主管理頁 → 營業時段** | 每週可預約時間 | 業主 | 調整營業日、午休、公休 | 儲存後立即生效 |
| **業主管理頁 → 今日預約** | 查看當日預約 | 業主 | 每天營業前 | 僅查看，不需改檔案 |
| **Notion 服務項目資料庫** | 服務資料儲存 | 工程師（備用） | 大量匯入時 | 欄位名稱不可改；日常請用管理頁 |
| **Notion 營業時段資料庫** | 營業時間儲存 | 工程師（備用） | 批量設定時 | 日常請用管理頁 |
| **Notion 預約紀錄資料庫** | 所有預約資料 | 系統自動寫入 | — | 不建議手動改狀態，請用系統取消功能 |
| **Notion 店面設定資料庫** | 店名、主色等設定 | 系統 / 管理頁 | — | 日常請用管理頁 |
| **Cloudflare Workers Secrets** | 正式環境機密 | 工程師 | 部署新客戶時 | 透過 `wrangler secret bulk` 上傳，不寫在程式碼裡 |

---

## 十五、快速查詢：我想做這件事，該去哪裡？

| 我想… | 去哪裡 |
|-------|--------|
| 改店名 | 業主管理頁 → 店面設定 |
| 改主色 | 業主管理頁 → 店面設定 |
| 改公告 | 業主管理頁 → 店面設定 |
| 改取消規則 | 業主管理頁 → 店面設定 |
| 新增服務 | 業主管理頁 → 服務項目 |
| 設定營業時間 | 業主管理頁 → 營業時段 |
| 看今天誰來 | 業主管理頁 → 今日預約 |
| 換 LINE LIFF ID | `customer-ui/js/config.js` + `owner-admin/js/config.js` |
| 換 API 網址 | `customer-ui/js/config.js` + `owner-admin/js/config.js` |
| 設定 Notion 金鑰 | `backend/.dev.vars`（本機）+ Cloudflare Secrets（正式） |
| 設定業主是誰 | `backend/.dev.vars` 的 `OWNER_LINE_USER_IDS` |
| 查業主 LINE ID | 從 LINE 開啟 `owner/my-line-id.html` |
| 讓網頁上線 | 執行 `sync-github-pages.sh` → 推送到 GitHub |

---

## 十六、常見錯誤提醒

1. **改了 `customer-ui/` 卻忘了同步 `docs/`**  
   → 網頁不會更新。請執行 `./scripts/sync-github-pages.sh`。

2. **只改了客人端 `config.js`，忘了改業主端**  
   → 業主頁可能無法登入或連不到 API。

3. **把 `.dev.vars` 推上 GitHub**  
   → 嚴重資安風險。若已誤推，請立即在 Notion 重新產生 Token。

4. **在 `docs/` 手動改檔案**  
   → 下次同步會被蓋掉。請改 `customer-ui/` 或 `owner-admin/`。

5. **用 Safari 直接開網址測試 LIFF**  
   → 可能登入異常。請從 LINE 的 `liff.line.me/...` 連結開啟。

6. **Notion 資料庫欄位名稱被改名**  
   → 系統會讀不到資料。欄位名稱必須與 `backend/src/notion.js` 註解一致。

---

*文件版本：2026-07-12｜適用專案：beauty-studio-booking MVP*
