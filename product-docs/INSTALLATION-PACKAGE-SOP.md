# Juliet Studio OS v2｜安裝與升級 SOP

版本：2026-08-20
適用：D1 多 tenant、Cloudflare Workers／Pages、LINE LIFF 的標準版與旗艦 AI 版。

## 1. 先判斷是哪一種工作

| 情境 | 正確流程 |
|---|---|
| 新業主訂閱既有平台 | 不複製 repo；依 `OWNER-SUBSCRIPTION-ONBOARDING-SOP.md` 建 tenant、方案、邀請與 LINE 綁定 |
| 平台程式升級／除蟲 | 在唯一權威 worktree 修改並跑完整測試；取得授權後備份 v2-test D1，再部署 Worker／Pages |
| 獨立客製環境 | 另建隔離 Cloudflare／LINE 資源；不得沿用 v2-test、其他業主 secrets 或資料 |

## 2. 安裝包內容

目前 current 包暫時撤下。第一版營業時段手機排版實機不合格，已移至 `dist/封存-不可使用/`；第二版完成部署與手機實機確認前不得建立或交付新的 current 包。

包含：

- `backend/`：Worker、D1 repositories、migrations、測試。
- `customer-ui/`：客戶 LIFF。
- `owner-admin/`：業主 LIFF。
- `platform-admin/`：平台管理中心。
- `docs/`：Cloudflare Pages 發布來源。
- `product-docs/`：必要開通、交付及有效性文件。

不包含 `.dev.vars`、tokens、secrets、D1 備份、客戶個資、node_modules、舊安裝包或 Cursor 索引。

## 3. 新業主訂閱流程

一般訂閱不需要安裝程式、建立 LINE 頻道或重新部署。平台負責人應直接照 `OWNER-SUBSCRIPTION-ONBOARDING-SOP.md` 最前面的「以後替訂閱客戶安裝：照這 8 步做」操作。

完成交付前至少確認：

- 業主 LINE 已綁定，且只能進入自己的工作室。
- 專屬客戶入口顯示正確店名、服務與可預約時間。
- 客戶建立預約與取消預約時，客戶和業主兩邊都收到 LINE 通知。
- 標準版沒有旗艦版功能；旗艦版的評估題庫已設定正確。

逐步操作與禁止事項以 `OWNER-SUBSCRIPTION-ONBOARDING-SOP.md` 為準。

## 4. 本機升級與除蟲

1. 工程師只在目前指定的唯一權威工作目錄修改；不得把舊工作目錄當成正式來源。
2. 先讀 CURRENT handoff、總藍圖、worklog 與有效性清單。
3. 執行 `git status --short`，保留所有既有 dirty 修改。
4. 修改來源檔後同步對應 `docs/` 發布副本。
5. 執行：

```bash
cd backend
npm test
cd ..
git diff --check
```

6. 本機測試通過不等於已上線；部署仍需使用者當次授權。

## 5. v2-test 部署

Wrangler 固定：

`/Users/imac/project/beauty-studio-booking/backend/node_modules/.bin/wrangler`（3.114.17）

順序：

1. 取得當次明確部署授權。
2. 匯出並驗證 v2-test D1 備份。
3. 視修改範圍部署 Worker、Pages 或兩者。
4. 唯讀確認 `/api/health`、Pages 快取版本及線上資產雜湊。
5. 更新 CURRENT handoff 與 worklog。

不得以舊授權執行新部署；不得把五分鐘 cron 當即時通知主要流程。

## 6. D1 與 migration

- 一般 Worker／Pages 部署不等於授權寫入 D1。
- 每次遠端 D1 寫入需另外明確授權，且操作前再備份。
- migration 0030 獨立處理，不可混入一般部署或安裝。
- 不因檔案位於 `backend/migrations/` 就自動執行。

## 7. 驗收重點

- 客戶登入、服務、評估、日期、時段與送出流程。
- 美甲／美睫免評估；首次霧眉／首次霧唇依服務完成評估。
- 訂金通知、24 小時逾期、取消／改期與時段釋放。
- 標準版與旗艦版權限隔離。
- AI 只用業主核准資料，服務建議能銜接預約，專業判斷轉人工。
- 業主通知即時送出，cron 只補送舊失敗。
- 私有照片需 owner auth 與 tenant scope。

## 8. 交付與維護

- 交付前使用 `CLIENT-DELIVERY-CHECKLIST.md`。
- 每次版本更新保留測試數、部署 ID、備份檔名與雜湊。
- 舊 zip 不覆蓋；建立新日期＋`current` 包，舊包在有效性清單標記失效。
- 未經明確授權不刪歷史備份、worktree、舊包或 Cursor 索引。
