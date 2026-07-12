## 中文導航

- [中文總目錄.md](中文總目錄.md)：中文文件導航，不用記英文檔名

# 商品化標準文件區

這個資料夾用來放「販售這套美業預約系統」需要的標準文件。

## 文件清單

| 文件 | 用途 |
|---|---|
| CLIENT-INFO-CHECKLIST.md | 接新客戶前，蒐集店名、服務、價格、營業時間、品牌色等資料 |
| CLIENT-LINE-SETUP-FLOW.md | 新客戶 LINE / LIFF 逐步設定與驗收紀錄（含 Channel ID、LIFF ID、Endpoint） |
| PRICING-DRAFT.md | 報價方案草稿，協助判斷建置費與月維護費 |
| CLIENT-DELIVERY-CHECKLIST.md | 系統完成後，交付給客戶前逐項確認 |
| README.md | 商品化文件總索引 |

## 使用順序

1. 先填 `CLIENT-INFO-CHECKLIST.md`
2. 依 `CLIENT-LINE-SETUP-FLOW.md` 完成 LINE / LIFF 設定
3. 再依需求評估 `PRICING-DRAFT.md`
4. 建置完成後使用 `CLIENT-DELIVERY-CHECKLIST.md`

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
