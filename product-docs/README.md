## 中文導航

- [中文總目錄.md](中文總目錄.md)：中文文件導航，不用記英文檔名

# 商品化標準文件區

這個資料夾用來放「販售這套美業預約系統」需要的標準文件。

## 文件清單

| 文件 | 用途 |
|---|---|
| CLIENT-INFO-CHECKLIST.md | 接新客戶前，蒐集店名、服務、價格、營業時間、品牌色等資料 |
| CLIENT-NOTION-SETUP-FLOW.md | 在 Notion 建立四個資料庫、連接 Integration、填入 Database ID |
| CLIENT-LINE-SETUP-FLOW.md | 新客戶 LINE / LIFF 逐步設定與驗收紀錄（含 Channel ID、LIFF ID、Endpoint） |
| PRICING-DRAFT.md | 報價方案草稿，協助判斷建置費與月維護費 |
| CLIENT-DELIVERY-CHECKLIST.md | 系統完成後，交付給客戶前逐項確認 |
| DEMO-ACCEPTANCE-2026-07-14.md | Demo 上線驗收紀錄（含客人端／業主端月曆），供交付 SOP 參考 |
| PRODUCT-TEMPLATE-MASTER.md | 商品母版總文件（基礎款功能清單含月曆） |
| README.md | 商品化文件總索引 |

## 使用順序

1. 先填 `CLIENT-INFO-CHECKLIST.md`
2. 依 `CLIENT-NOTION-SETUP-FLOW.md` 建立 Notion 四個資料庫
3. 依 `CLIENT-LINE-SETUP-FLOW.md` 完成 LINE / LIFF 設定
4. 再依需求評估 `PRICING-DRAFT.md`
5. 建置完成後使用 `CLIENT-DELIVERY-CHECKLIST.md`
6. Demo 或正式上線後，可參考 `DEMO-ACCEPTANCE-2026-07-14.md` 作為驗收紀錄範本（含月曆選日期、月曆預約查詢）

## 基礎款月曆功能（交付新客戶必知）

| 端 | 功能 | 方案 |
|----|------|------|
| 客人端 | 月曆選日期 → 點可約日 → 選時段 | **基礎款**（非加購） |
| 業主端 | 月曆查詢各日預約 | **基礎款**（非加購） |

詳見 [PRODUCT-TEMPLATE-MASTER.md](PRODUCT-TEMPLATE-MASTER.md) 第 4 節、[DEMO-ACCEPTANCE-2026-07-14.md](DEMO-ACCEPTANCE-2026-07-14.md)。

所有文件不得放入 Token、密碼、客戶個資或機密資料。

## 重要原則

- 不把 `.dev.vars` 上傳 GitHub
- 不把 Notion Token 寫進前端
- 不把 Cloudflare API Token 交給客戶
- 客戶可自行改的項目，要寫清楚
- 需要我維護的項目，要列入維護費

## AI 使用規則

- [AI-USAGE-RULES.md](AI-USAGE-RULES.md)：AI 使用規則與省額度操作守則

## 客戶溝通話術

- [CLIENT-MESSAGE-TEMPLATES.md](CLIENT-MESSAGE-TEMPLATES.md)：新業主資料蒐集與溝通話術模板
