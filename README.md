# beauty-studio-booking

美業一人工作室 LINE 預約管理系統（MVP）

## 專案結構

```
beauty-studio-booking/
├── customer-ui/      # 客人端 LIFF 頁面
├── owner-admin/      # 業主端 LIFF 管理頁面
├── backend/          # Cloudflare Workers API
├── docs/             # GitHub Pages 部署產物（由 sync 腳本產生）
└── scripts/
    └── sync-github-pages.sh
```

## 技術架構

| 層級 | 技術 |
|------|------|
| 客人端 | HTML / CSS / JavaScript + LINE LIFF |
| 業主端 | HTML / CSS / JavaScript + LINE LIFF |
| 後端 | Cloudflare Workers |
| 資料庫 | Notion |
| 前端部署 | GitHub Pages（`/docs` 資料夾） |

## 第一階段 MVP 範圍

**包含：**
- LINE LIFF 登入
- 服務項目瀏覽與預約
- 時段選擇與**時間區間重疊防呆**（長時服務須整段連續空檔；首尾相接可預約）
- 我的預約查詢與取消
- 業主今日預約、服務管理、營業時段、店面設定
- 客人端月曆選日期、業主端月曆預約查詢（基礎款）

**不包含：**
- 金流
- 多員工
- 報表

## API 一覽

### 客人端

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/api/settings` | 店面公開設定 |
| GET | `/api/services` | 上架中的服務項目 |
| GET | `/api/slots?date=&serviceId=` | 可預約開始時段（單日；依服務時長排除重疊區間） |
| GET | `/api/slots/month?month=&serviceId=` | 月份可預約摘要（客人月曆；同一套重疊邏輯） |
| POST | `/api/bookings` | 建立預約 |
| GET | `/api/bookings/me?userId=` | 我的預約 |
| POST | `/api/bookings/cancel` | 客人取消自己的預約 |
| POST | `/api/owner/bookings/cancel` | 業主取消預約（須填原因；Bearer） |

### 業主端（需 OWNER_LINE_USER_IDS 驗證）

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/api/owner/today?userId=&date=` | 今日預約 |
| GET/POST | `/api/owner/services` | 服務列表 / 新增 |
| PATCH | `/api/owner/services/:id` | 修改服務 |
| GET/POST | `/api/owner/slots` | 營業時段 |
| GET/PATCH | `/api/owner/settings` | 店面設定 |

## 快速開始

### 1. Notion 設定

在 [Notion Integrations](https://www.notion.so/my-integrations) 建立 Integration，並建立四個資料庫：

#### 服務項目

| 欄位 | 類型 |
|------|------|
| 服務名稱 | Title |
| 時長 | 數字 |
| 價格 | 數字 |
| 說明 | 文字 |
| 狀態 | 選項（上架、下架） |
| 排序 | 數字 |

#### 營業時段

| 欄位 | 類型 |
|------|------|
| 名稱 | Title |
| 星期 | 選項（日、一、二、三、四、五、六） |
| 開始時間 | 文字（例：10:00） |
| 結束時間 | 文字（例：18:00） |
| 狀態 | 選項（開放、關閉） |

#### 預約紀錄

| 欄位 | 類型 |
|------|------|
| 預約編號 | Title |
| LINE userId | 文字 |
| 客人姓名 | 文字 |
| 服務ID | 文字 |
| 服務名稱 | 文字 |
| 預約日期 | 日期 |
| 預約時段 | 文字 |
| 狀態 | 選項（已確認、已取消） |
| 取消原因 | 文字（rich_text） |
| 取消者 | 選項（客人、業主） |
| 取消時間 | 日期 |

#### 店面設定

| 欄位 | 類型 |
|------|------|
| 設定名稱 | Title |
| 品牌名稱 | 文字 |
| 主色 | 文字 |
| 公告文字 | 文字 |
| 取消規則 | 文字 |
| 是否收訂金 | Checkbox（可選；關閉則客人不顯示） |
| 訂金金額 | 數字 |
| 銀行名稱／銀行代碼／帳號／戶名 | 文字（僅顯示用，**非金流**） |
| 轉帳提醒文字 | 文字 |

> 訂金功能只顯示轉帳資訊，**不**串銀行、LINE Pay、也不追蹤付款狀態。帳號由 settings API 回傳，勿寫進前端 config。

每個資料庫需連接您的 Integration（Connections）。

### 2. 後端設定

```bash
cd backend
cp .dev.vars.example .dev.vars
# 編輯 .dev.vars 填入 Notion Token、Database ID、OWNER_LINE_USER_IDS

npm install
npm run dev        # 本機開發
npm run deploy     # 部署到 Cloudflare
```

正式環境上傳 secrets：

```bash
npx wrangler secret bulk .dev.vars
npx wrangler deploy
```

### 3. LINE LIFF 設定

1. 在 [LINE Developers](https://developers.line.biz/) 建立 Messaging API Channel
2. 建立 LIFF App（Size: Full）
3. Endpoint URL 設為 GitHub Pages 網址：
   - 客人端：`https://<username>.github.io/beauty-studio-booking/`
   - 業主端：`https://<username>.github.io/beauty-studio-booking/owner/`
4. 將 LIFF ID 填入 `customer-ui/js/config.js` 與 `owner-admin/js/config.js`
5. 將 Workers API 網址填入 `API_BASE_URL`

### 4. 前端部署

```bash
# 修改前端後，更新 HTML 中的 ?v= 版本號
./scripts/sync-github-pages.sh
git add customer-ui owner-admin docs
git commit -m "更新前端"
git push
```

GitHub Pages 設定：Branch `main`，資料夾 `/docs`。

### 5. 取得業主 LINE userId

讓業主從 LINE 開啟任一 LIFF 頁面，在瀏覽器開發者工具查看 `beautyUser.userId`，填入 `OWNER_LINE_USER_IDS`。

## 安全機制

- Notion Token 僅存於 Cloudflare Workers secrets，不暴露於前端
- 業主 API 由後端驗證 `OWNER_LINE_USER_IDS`
- 防止同一客人同一天重複預約
- **時間區間重疊防呆**（基礎款）：依「開始時間 + 該服務時長」占用區間；與現有已確認預約重疊的開始時間不可顯示、亦不可建立；首尾相接（例：10:00–11:00 與 11:00–12:00）可預約
- 所有 API 錯誤回傳 `{ ok: false, message: "..." }`

## 授權

MIT
