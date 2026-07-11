# 複製給新客戶流程清單

本文件用途：當我要把 beauty-studio-booking 複製給下一個美業客戶時，照這份清單一步一步做。

## 1. 新客戶要先提供的資料

| 項目 | 客戶提供 | 我設定 | 檔案位置 | 注意事項 |
|---|---|---|---|---|
| 店名 | 是 | 是 | 業主後台或店面設定 | 用於前台顯示 |
| 主色 | 是 | 是 | 業主後台或設定檔 | 建議提供色碼 |
| LINE 官方帳號 | 是 | 是 | LINE Developers | 需要建立 LIFF |
| 業主 LINE 帳號 | 是 | 是 | owner_users / .dev.vars | 用於業主權限 |
| 服務項目 | 是 | 是 | Notion services | 名稱、價格、時間 |
| 營業時間 | 是 | 是 | Notion time_slots | 需確認休息日 |
| 預約規則 | 是 | 是 | settings | 取消規則、公告 |
| Logo / 圖片 | 選填 | 是 | settings 或檔案 | 第二階段再優化 |

## 2. 複製專案前準備

- 確認原始專案可以正常開啟
- 確認 GitHub Pages 正常
- 確認沒有未存檔修改：git status 應顯示 clean
- 不要複製 .dev.vars 給客戶
- 不要把 Notion Token 放到前端

## 3. 新客戶設定流程

1. 建立新的 GitHub repo
2. 複製 beauty-studio-booking 專案
3. 修改 customer-ui/js/config.js
4. 修改 owner-admin/js/config.js
5. 建立或複製 Notion 資料庫
6. 建立 Cloudflare Worker
7. 設定 backend/.dev.vars
8. 上傳 Cloudflare secrets
9. 部署 backend
10. 執行 scripts/sync-github-pages.sh
11. 推送到 GitHub
12. 設定 GitHub Pages 使用 main / docs
13. 建立 LINE LIFF
14. 設定 LIFF Endpoint URL
15. 從 LINE 實機測試

## 4. 需要替換的設定

| 要改什麼 | 檔案位置 | 說明 |
|---|---|---|
| 客人端 LIFF ID | customer-ui/js/config.js | 客人入口 |
| 業主端 LIFF ID | owner-admin/js/config.js | 業主入口 |
| API 網址 | customer-ui/js/config.js、owner-admin/js/config.js | Cloudflare Worker 網址 |
| Notion Token | backend/.dev.vars | 不可上傳 GitHub |
| Database ID | backend/.dev.vars | 對應客戶 Notion |
| 業主 LINE ID | backend/.dev.vars | OWNER_LINE_USER_IDS |

## 5. 不能外流的資料

- Notion Token
- Cloudflare API Token
- LINE Channel Secret
- LINE Channel Access Token
- backend/.dev.vars
- 任何客戶個資
- 預約紀錄
- 客戶電話

## 6. 上線前驗收清單

- [ ] GitHub Pages 可以打開
- [ ] 客人端可以從 LINE 開啟
- [ ] 業主端可以從 LINE 開啟
- [ ] 業主 LINE ID 驗證正常
- [ ] 可以看到服務項目
- [ ] 可以選日期與時段
- [ ] 可以建立預約
- [ ] 同一時段不能重複預約
- [ ] 業主可以看到今日預約
- [ ] 業主可以修改服務
- [ ] 業主可以修改品牌名稱與主色
- [ ] Notion 沒有錯誤資料
- [ ] .dev.vars 沒有被 commit

## 7. 客戶交付清單

- [ ] 客人預約網址
- [ ] 業主後台網址
- [ ] LINE 官方帳號入口
- [ ] 操作說明
- [ ] 可修改項目清單
- [ ] 保固或維護範圍
- [ ] 禁止修改項目說明

## 8. 常見錯誤提醒

1. 改了 customer-ui 忘記同步 docs
2. 忘記更新 LIFF ID
3. API 網址填錯
4. .dev.vars 被誤傳到 GitHub
5. Notion 欄位名稱不一致
6. GitHub Pages 沒選 main / docs
7. 沒有用 LINE 開 LIFF，直接用 Safari 測試

文件版本：2026-07-12
