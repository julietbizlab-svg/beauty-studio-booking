# Juliet Studio OS｜Beauty Studio Booking v2

美業工作室 LINE 預約、客戶管理、訂金流程與 AI 預約協助系統。

> 對外出租與業主開通，請直接進入 [`商品營運中心/`](商品營運中心/00-先打開這裡.md)。一般新增業主不需要進入程式碼、部署或資料庫。

## 目前技術基準

| 項目 | 現況 |
|---|---|
| 客戶端／業主端 | LINE LIFF + Cloudflare Pages |
| 後端 | Cloudflare Workers |
| 資料庫 | Cloudflare D1（v2） |
| 私有照片 | Cloudflare R2 |
| 方案 | 標準版、旗艦 AI 版 |
| 測試基準 | 868／868 通過（2026-08-20） |

Notion／GitHub Pages 的說明屬 Demo v1 歷史架構，不可用於目前 v2 安裝或部署。

## 權威目錄

- `backend/`：Worker、D1 repository、migrations 與測試。
- `customer-ui/`：客戶 LIFF 原始檔。
- `owner-admin/`：業主 LIFF 原始檔。
- `platform-admin/`：平台管理中心。
- `docs/`：v2-test Pages 發布副本，須與各原始前端保持一致。
- `product-docs/`：安裝、業主開通、交付與工程紀錄。
- `dist/`：安裝包；只有標記為 CURRENT 的版本可交付。

## 開始工作前

依序閱讀：

1. `product-docs/V2-HANDOFF-2026-08-20-CURRENT.md`
2. `product-docs/V2-MASTER-BLUEPRINT-AND-PROGRESS-2026-08-09.md`
3. `product-docs/V2-WORKLOG-2026-08-09-LINE-OA-OWNER-FLOW.md`
4. `product-docs/OWNER-SUBSCRIPTION-ONBOARDING-SOP.md`
5. `product-docs/CURRENT-AND-INVALID-FILES-2026-08-20.md`

## 本機驗證

```bash
cd backend
npm test
```

Wrangler 必須固定使用 `/Users/imac/project/beauty-studio-booking/backend/node_modules/.bin/wrangler` 3.114.17。部署與遠端 D1 寫入需逐次授權；v2-test 部署前必須先備份 D1。

## 商品化與安裝

- 平台端開通業主：`product-docs/OWNER-SUBSCRIPTION-ONBOARDING-SOP.md`
- 安裝包總覽：`product-docs/INSTALLATION-PACKAGE-SOP.md`
- 交付流程：`product-docs/CLIENT-DELIVERY-SOP.md`
- 目錄與有效性：`product-docs/CURRENT-AND-INVALID-FILES-2026-08-20.md`

不得把 `.dev.vars`、tokens、secrets、LINE user ID 或客戶個資放入文件、前端或安裝包。
