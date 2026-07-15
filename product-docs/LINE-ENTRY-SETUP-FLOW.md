# LINE 入口設定 SOP

> **專案**：beauty-studio-booking（美業工作室預約，基礎款）  
> **文件用途**：教你如何在 **LINE 官方帳號** 上，讓客人點「預約」、業主點「管理」  
> **相關文件**：[CLIENT-LINE-SETUP-FLOW.md](CLIENT-LINE-SETUP-FLOW.md)（建立 Login Channel／LIFF／Secret）  
> **本文件不做**：改程式、deploy、Notion、Cloudflare Secrets

---

## 0. 這份文件在講什麼

| 文件 | 聚焦 |
|------|------|
| [CLIENT-LINE-SETUP-FLOW.md](CLIENT-LINE-SETUP-FLOW.md) | Developers 後台：Channel、LIFF ID、Callback、Secret |
| **本文件 LINE-ENTRY-SETUP-FLOW.md** | **官方帳號入口**：圖文選單／按鈕／連結怎麼掛，誰可以點什麼 |

先完成 LIFF 與 GitHub Pages，再回來做本文件的「入口」。

---

## 1. LINE 入口是什麼

**LINE 入口**＝客人或業主在 **LINE 官方帳號聊天畫面**裡，點到的那一顆按鈕／圖文選單／訊息連結，最後打開預約系統。

常見三種形式（擇一或併用）：

| 形式 | 說明 |
|------|------|
| **圖文選單（Rich Menu）** | 聊天室底部固定選單，例如「立即預約」「店家管理」 |
| **圖文訊息／選單訊息按鍵** | 歡迎訊息、自動回覆裡的按鈕 |
| **純文字 LIFF 連結** | 私訊貼上 `https://liff.line.me/{LIFF_ID}` 或附路徑 |

技術上，點進去後多半是：

```
LINE 官方帳號按鈕
  → LIFF 連結（liff.line.me/…）
    → GitHub Pages 前端頁面
      → 呼叫 Cloudflare Worker API
```

沒有入口，系統就算已上線，客人也「找不到從哪預約」。

---

## 2. 兩種入口：客人 vs 業主

| 入口 | 打開哪一頁 | 誰用 | 目的 |
|------|------------|------|------|
| **客人入口** | 客人端（Pages 根目錄） | 客人／加友的使用者 | 選服務、選日、預約、看「我的預約」 |
| **業主入口** | 業主端（Pages 的 `/owner/`） | 店長（已列入白名單的 LINE） | 查預約、改服務、改時段、店面設定、客戶資料 |

建議在圖文選單上**分開兩顆**，文案清楚，例如：

- 客人：「📅 立即預約」
- 業主：「🛠 店家管理」（只交給老闆；一般客人點了也會被後端擋下，但仍建議不要把業主入口掛在超顯眼公共選單，或改用「僅管理員可見」策略／私訊連結）

---

## 3. 客人入口怎麼設定

### 3.1 先確認技術前提

- [ ] 客人端 GitHub Pages 可開（`https://帳號.github.io/repo/`）
- [ ] LIFF 已建立，Endpoint 指向上述客人端網址
- [ ] 前端 `config.js` 已填該客戶的 `LIFF_ID`、`API_BASE_URL`
- [ ] 用手機 LINE 直接開 LIFF 可登入、可看到服務

細部步驟見 [CLIENT-LINE-SETUP-FLOW.md](CLIENT-LINE-SETUP-FLOW.md)。

### 3.2 在官方帳號掛「預約」

1. 開啟 [LINE Official Account Manager](https://manager.line.biz/)
2. 選**該客戶自己的**官方帳號
3. 做以下任一項（建議至少做圖文選單）：

**做法 A｜圖文選單（建議）**

1. 進入「圖文選單」→ 建立或編輯選單  
2. 配置一格按鈕，動作選 **連結（URI）**  
3. 連結填客人 LIFF：

```text
https://liff.line.me/{LIFF_ID}
```

或（若你的部署採 path 區分）：

```text
https://liff.line.me/{LIFF_ID}/
```

4. 發佈選單；用客人實機點一次驗收

**做法 B｜歡迎訊息／關鍵字自動回覆**

1. 歡迎訊息加按鈕「立即預約」  
2. 按鈕連結同上 LIFF  
3. 可再加關鍵字：客人傳「預約」→ 回覆含同一連結

### 3.3 客人入口驗收

- [ ] 從官方帳號點「立即預約」能開 LIFF（不是空白頁、不是下載 App）
- [ ] 可看到店名／服務／月曆
- [ ] 可完成一筆測試預約並在「我的預約」看到

---

## 4. 業主入口怎麼設定

### 4.1 先確認技術前提

- [ ] 業主端 Pages 可開（通常 `…/owner/`）
- [ ] 同一 LIFF 或獨立業主 LIFF 的 Endpoint／路徑可開到業主頁
- [ ] Cloudflare Secret `OWNER_LINE_USER_IDS` 已放**該店店長**的 LINE userId（可多位，逗號分隔）
- [ ] 非業主帳號開管理頁會被擋（顯示無權限／錯誤）

查業主 userId：可用部署後的輔助頁（勿公開貼在圖文選單）：

```text
https://liff.line.me/{LIFF_ID}/owner/my-line-id.html
```

（實際 path 以該客戶 Pages 為準。）

### 4.2 在官方帳號掛「管理」

建議其中一種：

| 做法 | 說明 |
|------|------|
| **圖文選單「店家管理」** | 方便老闆天天點；一般客人也看得到按鈕，但後端會擋 |
| **只傳私訊連結給老闆** | 較不曝露管理入口（基礎款可行） |
| **兩個官方帳號**（少見） | 一個客人、一個內部；基礎款通常不必要 |

連結範例：

```text
https://liff.line.me/{LIFF_ID}/owner/
```

若業主端與客人端共用同一 LIFF、Endpoint 設在 repo 根目錄，請確認實機路徑能正確開到 `/owner/`（必要時在 LIFF Endpoint 或 Pages 路徑上與工程對齊）。

### 4.3 業主入口驗收

- [ ] 店長 LINE 點「店家管理」可進管理頁
- [ ] 可看到月曆／預約、服務、時段、設定
- [ ] **用非業主 LINE** 點同一連結 → 不能操作管理功能（後端拒絕）

---

## 5. 哪些網址可以公開，哪些不可以

### ✅ 可以給客人／放在官方帳號選單

| 項目 | 例子（請換成該客戶實際值） |
|------|---------------------------|
| 客人端 GitHub Pages | `https://帳號.github.io/客戶repo/` |
| 業主端 GitHub Pages | `https://帳號.github.io/客戶repo/owner/` |
| LIFF 短網址 | `https://liff.line.me/{LIFF_ID}`（及 `/owner/`） |
| 前端公開設定 | `LIFF_ID`、`API_BASE_URL`（本來就在 `config.js`） |
| Worker health | `https://….workers.dev/api/health`（僅確認活著，勿當機密） |

### ❌ 不可以公開（聊天、選單、截圖、合約附件都不要）

| 項目 | 原因 |
|------|------|
| Notion Token | 可讀寫客戶資料庫 |
| Cloudflare API Token | 可改 Worker／Secrets |
| `LIFF_CHANNEL_ID`（Channel ID） | 後端驗證用，屬 Secret |
| Channel Secret | 可冒用 LINE 通道 |
| `OWNER_LINE_USER_IDS` | 雖是識別碼，勿貼公開處；只放 Secret |
| `.dev.vars` 全文 | 本機密碼檔 |
| Demo／其他客戶的 Token、DB ID、業主 userId | 會串錯店或開錯權限 |
| `my-line-id.html` 長期掛在公共圖文選單 | 容易讓路人拿出 userId；設定完建議拿掉或僅私訊使用 |

**一句話**：選單上只放「打開網頁／LIFF 的連結」；密碼類一律不出現在 LINE。

---

## 6. Demo 版與正式客戶版要怎麼切開

| 項目 | Demo（你自己測試／成交用） | 正式客戶版 |
|------|---------------------------|------------|
| LINE 官方帳號 | 你的 Demo 官方帳號 | **客戶自己的**官方帳號 |
| LINE Developers | 你的 Provider | **客戶名下** Provider／Channel |
| LIFF ID | Demo 專用 | **新的**客戶 LIFF |
| GitHub Pages | Demo repo 網址 | **客戶專屬** repo／Pages |
| Notion／Secrets | Demo 庫 | **客戶專屬**庫與 Secrets |
| 圖文選單按鈕 | 指到 Demo LIFF | **改指到客戶 LIFF**（不要沿用 Demo 連結） |

### 鐵律

1. **不要**把 Demo 圖文選單連結直接交給客戶當正式入口。  
2. **不要**多家店共用同一個 LIFF／同一個 Notion／同一組 Secrets。  
3. 正式交付後：官方帳號選單、自動回覆、常用貼文裡的連結，全部抽檢換成**該客戶**網址。  
4. Demo 可以繼續留著給下一個準客戶看，但與正式店**帳號與資料隔離**。

細節對照：[CLIENT-LINE-SETUP-FLOW.md](CLIENT-LINE-SETUP-FLOW.md) §一、§七；[TEMPLATE-CLONE-GUIDE.md](TEMPLATE-CLONE-GUIDE.md)。

---

## 7. 每個新客戶交付時：LINE 官方帳號入口檢查清單

交付前用**客戶官方帳號**＋**實機 LINE**勾選：

### 帳號與歸屬

- [ ] 官方帳號是客戶的（或合約約定的營運帳號），不是誤用 Demo
- [ ] LINE Developers／LIFF 與該官方帳號方案一致（Login／綁定關係已確認）
- [ ] 圖文選單／自動回覆內**沒有** Demo 網址

### 客人入口

- [ ] 有清楚的「預約」按鈕或選單
- [ ] 連結為該客戶 LIFF／Pages
- [ ] 客人實機：能登入 → 看到服務 → 月曆選日 → 預約成功

### 業主入口

- [ ] 有「管理」入口（選單或僅老闆私訊連結）
- [ ] 店長實機：能進業主頁並操作
- [ ] 非業主實機：不能管理
- [ ] `OWNER_LINE_USER_IDS` 已是本店店長（非 Demo 業主）

### 安全／可公開範圍

- [ ] 選單與訊息內無 Token、Secret、Channel Secret、`.dev.vars`
- [ ] 未把其他客戶的連結或 LIFF 誤貼進來
- [ ] （建議）設定完成後，不要把查 userId 頁長期掛在公共選單

---

## 8. 驗收清單（本文件最小通過標準）

> 通過定義：**客人能從 LINE 點預約；業主能從 LINE 點管理。**

### 客人能從 LINE 點預約

- [ ] 開啟客戶官方帳號聊天室
- [ ] 點「立即預約」（或約定的入口）
- [ ] 進入預約頁且 LIFF 登入成功
- [ ] 完成一筆測試預約

### 業主能從 LINE 點管理

- [ ] 用**店長** LINE 點「店家管理」（或約定的入口）
- [ ] 進入管理頁且可看見預約／設定
- [ ] （加分）非業主點同一連結被拒絕

### 與工程文件的銜接

| 若卡在… | 改看 |
|---------|------|
| Channel／LIFF／Callback 建不起來 | [CLIENT-LINE-SETUP-FLOW.md](CLIENT-LINE-SETUP-FLOW.md) |
| Notion／Database ID | [CLIENT-NOTION-SETUP-FLOW.md](CLIENT-NOTION-SETUP-FLOW.md) |
| 整案複製與 Secrets | [TEMPLATE-CLONE-GUIDE.md](TEMPLATE-CLONE-GUIDE.md) |
| 交件前後總清單 | [CLIENT-DELIVERY-CHECKLIST.md](CLIENT-DELIVERY-CHECKLIST.md) |

---

## 9. 常見問題（入口層）

| 狀況 | 可能原因 | 處理方向 |
|------|----------|----------|
| 點了沒反應／開外部瀏覽器怪怪的 | 連結不是 LIFF、或 Endpoint 不符 | 改用 `liff.line.me/{LIFF_ID}`，核對 Endpoint |
| 白屏、一直轉 | Pages 網址錯、LIFF ID 錯、快取舊 `?v=` | 核對 Pages／config；LINE 內重開 |
| 客人入口正常、業主進不去 | 路徑不是 `/owner/`、或 userId 未進白名單 | 核路徑與 `OWNER_LINE_USER_IDS` |
| 人人都能進管理頁 | 後端未驗證或白名單過寬 | **停止使用**，走工程＋Codex 查 owner 驗證 |
| 顧客點到「店家管理」 | 公共選單曝露 | 預期內會被擋；可改為僅私訊給老闆 |

---

*文件版本：1.0｜LINE 入口設定 SOP｜不含任何 Token、密碼或真實客戶個資*
