# 新客戶交付 SOP

> **用途**：從成交到正式交付，照這 10 步做，每個新客戶都能重複使用。  
> **對象**：接案者、協作工程（Cursor／Codex），**不是**讓客戶自己照做的技術手冊。

---

## 使用前準備

請先請客戶填寫 [CLIENT-INFO-FORM.md](CLIENT-INFO-FORM.md)。  
技術細節可對照：

- [CLIENT-NOTION-SETUP-FLOW.md](CLIENT-NOTION-SETUP-FLOW.md)
- [CLIENT-LINE-SETUP-FLOW.md](CLIENT-LINE-SETUP-FLOW.md)
- [CLIENT-DELIVERY-CHECKLIST.md](CLIENT-DELIVERY-CHECKLIST.md)
- [DEMO-ACCEPTANCE-2026-07-14.md](DEMO-ACCEPTANCE-2026-07-14.md)（驗收範本）

---

## 第 1 步：確認客戶資料

**要做什麼**  
核對店名、服務、價格、營業時間、品牌色、取消規則、業主 LINE 是否齊全。

**完成標準**

- [ ] 客戶資料表已填完
- [ ] 服務項目與價格已確認
- [ ] 可預約星期與時段已確認
- [ ] 知道 Notion／LINE／Cloudflare 用誰的帳號

**常見漏項**  
業主 LINE userId、營業時間只寫「平日」沒寫具體時段。

---

## 第 2 步：建立客戶 Notion

**要做什麼**  
在客戶（或你代管）的 Notion 建立四個資料庫：服務、營業時段、預約紀錄、店面設定。

**完成標準**

- [ ] Integration 已建立
- [ ] 四表欄位正確
- [ ] 各表已連接 Integration
- [ ] 執行 `node scripts/check-notion.mjs` 四表皆 OK
- [ ] 至少一筆服務、一筆營業時段、一筆店面設定

**注意**  
Notion Token **不可**寫進前端，也**不可** commit 到 GitHub。

---

## 第 3 步：建立 LINE Login／LIFF

**要做什麼**  
在 LINE Developers 建立 Channel、LIFF，設定客人端與業主端兩個 LIFF（或依方案調整）。

**完成標準**

- [ ] Channel ID 已記錄（給後端 `LIFF_CHANNEL_ID` 用）
- [ ] 客人端 LIFF ID 已填入前端 `config.js`
- [ ] 業主端 LIFF ID 已填入前端 `config.js`
- [ ] 業主 LINE userId 已記錄（給後端 `OWNER_LINE_USER_IDS`）
- [ ] LIFF Endpoint URL 已規劃（等 GitHub Pages 網址出來再填）

**注意**  
Channel Secret **不可**放進前端。

---

## 第 4 步：建立 Cloudflare Worker／Secrets

**要做什麼**  
複製專案 `backend`，部署 Workers，把機密上傳到 Cloudflare Secrets。

**完成標準**

- [ ] `wrangler login` 成功
- [ ] `wrangler secret bulk .dev.vars` 上傳 7 個 Secrets
- [ ] `wrangler deploy` 成功
- [ ] `/api/health` 回傳 `ok: true`、`notion: true`
- [ ] `/api/services` 可讀到服務列表

**Secrets 清單（名稱即可，值不外流）**  
`NOTION_TOKEN`、四個 `NOTION_DATABASE_*`、`OWNER_LINE_USER_IDS`、`LIFF_CHANNEL_ID`

---

## 第 5 步：填入前端 API URL

**要做什麼**  
把 Cloudflare Worker 網址寫進客人端與業主端的 `config.js`。

**完成標準**

- [ ] `customer-ui/js/config.js` 的 `API_BASE_URL` 已填
- [ ] `owner-admin/js/config.js` 的 `API_BASE_URL` 已填
- [ ] 執行 `./scripts/sync-github-pages.sh` 同步到 `docs/`
- [ ] HTML 的 `?v=` 版本號已更新（避免 LINE 快取）

---

## 第 6 步：GitHub Pages 上線

**要做什麼**  
把 `docs/` 推到 GitHub，開啟 Pages，取得正式網址。

**完成標準**

- [ ] `docs/` 已 push 到客戶 repo
- [ ] GitHub Pages 已啟用
- [ ] 客人端網址可開啟
- [ ] 業主端網址可開啟（通常為 `/owner/`）
- [ ] 回到 LINE Developers 更新 LIFF Endpoint URL

---

## 第 7 步：客人端驗收

**要做什麼**  
用 LINE 實機走一遍客人預約流程。

**完成標準**

- [ ] LINE LIFF 可登入
- [ ] 服務列表正確
- [ ] 選日期後可看到時段
- [ ] 可成功建立預約
- [ ] 「我的預約」可看到紀錄
- [ ] 可取消預約

**參考**  
[DEMO-ACCEPTANCE-2026-07-14.md](DEMO-ACCEPTANCE-2026-07-14.md) 第 3 節

---

## 第 8 步：業主端驗收

**要做什麼**  
用業主 LINE 帳號開啟管理頁，確認權限與功能。

**完成標準**

- [ ] 非業主帳號無法操作（後端擋下）
- [ ] 今日預約可查看
- [ ] 可新增／下架服務
- [ ] 可修改營業時段
- [ ] 可修改店面設定（店名、主色、公告）

**參考**  
[DEMO-ACCEPTANCE-2026-07-14.md](DEMO-ACCEPTANCE-2026-07-14.md) 第 4 節

---

## 第 9 步：交付客戶操作說明

**要做什麼**  
交給客戶「他們自己會用到的部分」，技術後台不交給客戶。

**建議交付內容**

| 交給客戶 | 不交給客戶 |
|----------|------------|
| 客人端／業主端 LINE 入口說明 | Notion Token |
| 如何改服務、時段、公告（業主端操作） | Cloudflare API Token |
| 取消規則與注意事項 | `.dev.vars` |
| 聯絡你的維護方式 | Channel Secret |

可使用 [CLIENT-MESSAGE-TEMPLATES.md](CLIENT-MESSAGE-TEMPLATES.md) 撰寫交付訊息。

---

## 第 10 步：收尾與備份

**要做什麼**  
確認上線穩定，資料與設定有備份紀錄。

**完成標準**

- [ ] 驗收紀錄已存檔（可複製 DEMO 驗收格式）
- [ ] 客戶 repo、Notion、LINE、Cloudflare 帳號歸屬已記錄
- [ ] 合約／報價方案已對應 [PRICING-PACKAGES.md](PRICING-PACKAGES.md)
- [ ] 維護範圍與費用已說明
- [ ] Demo 測試資料已清理或標記

---

## 快速對照：誰負責什麼

| 步驟 | 主要執行者 | 客戶要做的事 |
|------|------------|--------------|
| 1 確認資料 | 你 | 填資料表 |
| 2 Notion | 你或工程 | 提供帳號（若用客戶帳號） |
| 3 LINE | 你或工程 | 提供官方帳號權限 |
| 4 Cloudflare | 工程 | 通常不需操作 |
| 5～6 前端上線 | 工程 | 不需操作 |
| 7～8 驗收 | 你＋客戶 | 實機點一遍 |
| 9～10 交付 | 你 | 收操作說明、確認維護方式 |

---

*文件版本：1.0｜beauty-studio-booking 商品化交付｜不含任何 Token 或密碼*
