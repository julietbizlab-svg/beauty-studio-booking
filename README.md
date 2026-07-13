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
- 時段選擇與衝突防護
- 我的預約查詢與取消
- 業主今日預約、服務管理、營業時段、店面設定

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
| GET | `/api/slots?date=&serviceId=` | 可預約時段（單日） |
| GET | `/api/slots/month?month=&serviceId=` | 月份可預約摘要（客人月曆） |
| POST | `/api/bookings` | 建立預約 |
| GET | `/api/bookings/me?userId=` | 我的預約 |
| POST | `/api/bookings/cancel` | 取消預約 |

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

#### 店面設定

| 欄位 | 類型 |
|------|------|
| 設定名稱 | Title |
| 品牌名稱 | 文字 |
| 主色 | 文字 |
| 公告文字 | 文字 |
| 取消規則 | 文字 |

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
- 防止同一時段被多人預約（一人工作室）
- 所有 API 錯誤回傳 `{ ok: false, message: "..." }`

## 授權

MIT
