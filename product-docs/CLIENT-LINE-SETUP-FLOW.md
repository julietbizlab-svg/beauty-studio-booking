# 客戶 LINE 設定流程

這份文件說明：從建立 LINE Login Channel 開始，到取得 `LIFF_CHANNEL_ID`、建立 LIFF、設定回呼網址，以及未來交付客戶時如何**切開開發者帳號與客戶帳號**。

---

## 一、先搞懂兩種模式

### Demo 版（自己測試用）

| 項目 | 做法 |
|------|------|
| LINE 帳號 | 可用**開發者自己的** LINE 帳號 |
| 信箱 | 可用**開發者私人信箱** |
| LINE Developers | 建在開發者自己的 Provider 底下 |
| 目的 | 測功能、練流程、給客戶看 Demo |

### 正式客戶版（上線用）

| 項目 | 做法 |
|------|------|
| LINE 官方帳號 | 必須用**客戶自己的** LINE 官方帳號 |
| LINE Developers | 必須建在**客戶名下**（或客戶授權的 Provider） |
| 信箱 | 用客戶可長期管理的信箱 |
| 目的 | 正式營運、預約、業主管理 |

### 最重要原則

> **不要讓客戶正式系統綁在開發者私人帳號上。**

若 Demo 建在開發者帳號下，交付客戶前必須**整套重建**在客戶自己的 LINE Developers 與官方帳號，並更換所有相關 ID 與金鑰。

---

## 二、名詞對照（很容易搞混）

| 名稱 | 是什麼 | 放哪裡 | 能否放前端 |
|------|--------|--------|------------|
| **Channel ID**（`LIFF_CHANNEL_ID`） | LINE Login / Messaging API 的**通道 ID**（一串數字） | Cloudflare Secret 或 `.dev.vars` | ❌ 不可 |
| **LIFF ID** | LIFF App 的 ID（格式如 `2010xxxx-xxxx`） | `customer-ui/js/config.js`、`owner-admin/js/config.js` | ✅ 可以 |
| **LINE userId** | 某個 LINE 使用者的 ID（`U` 開頭） | `OWNER_LINE_USER_IDS`（後端 Secret） | ❌ 不可 |

記住一句話：

- **`LIFF_CHANNEL_ID` = 通道 ID，不是 LIFF ID。**

---

## 三、建立 LINE Login Channel（逐步）

以下以 Demo 為例；正式客戶版步驟相同，但請改用**客戶的** LINE Developers 與官方帳號。

### Step 1：進入 LINE Developers

1. 開啟 [LINE Developers Console](https://developers.line.biz/console/)
2. 登入（Demo 用開發者帳號；正式版用客戶帳號）
3. 建立或選擇 **Provider**

### Step 2：建立 Channel

1. 點 **Create a new channel**
2. 選 **LINE Login**（或 Messaging API，若需官方帳號推播可再開 Messaging API）
3. 填寫基本資料

### Step 3：頻道名稱（注意 20 字元限制）

LINE 頻道名稱**最多 20 個字元**。

| 用途 | 建議名稱 | 字元數 |
|------|----------|--------|
| Demo 測試 | `BeautyBookingDemo` | 17 ✅ |
| 正式客戶 | 用店名縮寫，例如 `花漾美甲工作室` 太長時改 `花漾美甲` 或 `HuaYangNail` | 需 ≤ 20 |

### Step 4：記下 Channel ID（這就是 `LIFF_CHANNEL_ID`）

1. 進入該 Channel → **Basic settings**
2. 找到 **Channel ID**（純數字，例如 `1234567890`）
3. 這個值就是後端的 **`LIFF_CHANNEL_ID`**

```
LIFF_CHANNEL_ID = Channel ID（Basic settings 裡的那串數字）
```

### Step 5：設定回呼 URL（Callback URL）

在 LINE Login Channel 設定裡找到 **Callback URL**。

- 開發階段可先留空或填暫用網址
- **上線前**必須改成客戶的 **GitHub Pages 網址**

範例（請換成實際 repo）：

```
https://你的帳號.github.io/beauty-studio-booking/
```

注意：

- 必須是 `https://`
- 建議尾端加 `/`
- 網址必須與 GitHub Pages 實際網址**完全一致**

---

## 四、建立 LIFF App

### Step 1：在 Channel 底下新增 LIFF

1. 同一個 Channel → 點 **LIFF** 分頁
2. 點 **Add**
3. 建議設定：

| 欄位 | 建議值 |
|------|--------|
| LIFF app name | Demo 可用 `BeautyBooking 預約` |
| Size | **Full** |
| Endpoint URL | 見下方 |
| Scope | 勾選 `profile`、`openid`（openid 才能取得 ID Token 給業主 API 驗證） |

### Step 2：設定 LIFF Endpoint URL

**上線前**填 GitHub Pages 網址：

| 頁面 | Endpoint URL / 開啟方式 |
|------|------------------------|
| 客人端 | `https://帳號.github.io/repo名稱/` |
| 業主端 | 可共用同一 LIFF，但入口請依 GitHub Pages 部署確認 |

> 一個 LIFF 可以服務客人端與業主端，Endpoint 設在客人端根目錄即可。

### Step 3：複製 LIFF ID

建立完成後會看到 **LIFF ID**（例如 `2010530394-AbCdEfGh`）。

這個值填入前端：

- `customer-ui/js/config.js` → `LIFF_ID`
- `owner-admin/js/config.js` → `LIFF_ID`

**LIFF ID 可以放在前端 config，沒問題。**

---

## 五、後端要設定的機密（不可放前端）

在 `backend/.dev.vars`（本機）與 Cloudflare Secrets（正式環境）設定：

```bash
# Channel ID，不是 LIFF ID
LIFF_CHANNEL_ID=1234567890

# 業主 LINE userId（白名單）
OWNER_LINE_USER_IDS=Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

上傳 Cloudflare：

```bash
cd backend
npx wrangler secret put LIFF_CHANNEL_ID
npx wrangler secret put OWNER_LINE_USER_IDS
```

**`LIFF_CHANNEL_ID` 不可寫進前端 config.js，也不可 commit 到 GitHub。**

---

## 六、取得業主 LINE userId

1. 先在前端 config 填好 `LIFF_ID`
2. 同步並部署 GitHub Pages
3. 請業主從 LINE 開啟：
   ```
   https://liff.line.me/{LIFF_ID}/owner/my-line-id.html
   ```
4. 畫面會顯示 `U` 開頭的 userId
5. 填入 `OWNER_LINE_USER_IDS`

---

## 七、每個客戶都要換自己的設定

複製給**下一位客戶**時，以下項目**全部要換**，不能沿用上一個客戶或開發者 Demo 的值：

| 項目 | 說明 | 存放位置 |
|------|------|----------|
| **LIFF ID** | 客戶專屬 LIFF App | 前端 `config.js` |
| **LIFF_CHANNEL_ID** | 客戶 Channel 的 Channel ID | Cloudflare Secret / `.dev.vars` |
| **OWNER_LINE_USER_IDS** | 客戶業主的 LINE userId | Cloudflare Secret / `.dev.vars` |
| **Notion Token** | 客戶專屬 Integration | Cloudflare Secret / `.dev.vars` |
| **Notion Database ID** | 四個資料庫各自一組 ID | Cloudflare Secret / `.dev.vars` |
| **Cloudflare Worker 設定** | 建議每客戶獨立 Worker 或獨立 secrets | `wrangler.toml` + Secrets |

### 前端還要換

| 項目 | 檔案 |
|------|------|
| `API_BASE_URL` | `customer-ui/js/config.js`、`owner-admin/js/config.js` |
| GitHub Pages 網址 | LINE Callback URL、LIFF Endpoint URL |

---

## 八、Demo → 正式客戶：帳號切割流程

當 Demo 在開發者帳號下測完，要交給正式客戶時：

```
1. 請客戶提供（或協助建立）LINE 官方帳號
2. 在客戶名下建立新的 LINE Developers Provider + Channel
3. 建立新的 LIFF App（新的 LIFF ID）
4. 建立客戶專屬 Notion 工作區與資料庫
5. 建立客戶專屬 Cloudflare Worker / Secrets
6. 複製 GitHub repo（建議每客戶一個 repo）
7. 填入客戶專屬的 config.js、.dev.vars
8. 設定 Callback URL、LIFF Endpoint URL 為客戶 GitHub Pages
9. 取得客戶業主 userId → OWNER_LINE_USER_IDS
10. 部署後從 LINE 實機驗收
11. 交付客戶 LIFF 連結與操作說明
```

**不要**把開發者 Demo 的 LIFF 連結直接給客戶當正式系統。

---

## 九、設定檢查表

### Demo 上線前

- [ ] Channel 名稱 ≤ 20 字元（Demo 可用 `BeautyBookingDemo`）
- [ ] 已記下 Channel ID → `LIFF_CHANNEL_ID`
- [ ] 已建立 LIFF，Scope 含 `openid`
- [ ] LIFF ID 已填入兩個 `config.js`
- [ ] Callback URL、Endpoint URL 已指向 GitHub Pages
- [ ] `LIFF_CHANNEL_ID` 只在後端 Secret，不在前端
- [ ] 業主 userId 已填入 `OWNER_LINE_USER_IDS`

### 正式客戶交付前

- [ ] Channel 建在**客戶帳號**下，非開發者私人帳號
- [ ] 所有 ID / Token 都是客戶專屬，非 Demo 沿用
- [ ] `.dev.vars` 未 commit 到 GitHub
- [ ] 客人端、業主端皆可從 LINE 開啟並完成預約與管理

---

## 十、常見錯誤

| 錯誤 | 正確做法 |
|------|----------|
| 把 LIFF ID 當成 `LIFF_CHANNEL_ID` | Channel ID 在 Basic settings，是純數字 |
| 把 `LIFF_CHANNEL_ID` 寫進 config.js | 只放 Cloudflare Secret |
| 正式客戶沿用開發者 Demo 的 LIFF | 每客戶新建 Channel + LIFF |
| Endpoint URL 少尾端 `/` | 與 GitHub Pages 網址完全一致 |
| 頻道名稱超過 20 字 | 縮短，Demo 用 `BeautyBookingDemo` |
| 用 Safari 直接開 GitHub 網址測 LIFF | 必須從 `liff.line.me` 開啟 |

---

## 相關文件

- `CLIENT-INFO-CHECKLIST.md` — 接案前向客戶蒐集資料
- `CLIENT-DELIVERY-CHECKLIST.md` — 交付前總驗收
- `CLIENT-SETUP-GUIDE.md` — 非工程師用的專案複製指南
- `COPY-FOR-NEW-CLIENT.md` — 工程師複製新客戶完整流程

---

*請勿在本文件填寫真實 Token、Channel Secret 或客戶個資。*
