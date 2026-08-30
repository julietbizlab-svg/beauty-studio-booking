# Beauty Studio Booking v2 正式交接｜2026-08-22

## 權威工作目錄

`/Users/imac/.codex/worktrees/eca1/beauty-studio-booking`

保留大量 dirty worktree；禁止 reset、clean、restore、commit、push 或覆蓋既有修改。

## 本輪已完成並部署 v2-test

- 每項服務可設定 0～365 天回訪週期，0 表示停用，預設 21 天。
- 只在服務完成後依週期建立 tenant-scoped LINE 回訪。
- 同一客戶已有日期較晚的同服務有效預約時，尚未送出的回訪會取消。
- 店面設定可填 HTTPS 客戶 LIFF 網址；回訪連結帶 `serviceId`，客戶端自動選定原服務。
- 營業時段儲存按鈕具 dirty-state：載入與儲存成功後變暗；修改、新增或刪除後才亮起；失敗可重試。
- 回訪欄位與主要按鈕在手機／LINE WebView 維持同寬、同高與置中。

## 驗證與部署紀錄

- 完整測試：902／902 通過；`git diff --check` 通過。
- D1 備份：`backups/v2-test-d1-20260822-014859-before-service-cycle-worker-pages-deploy.sql`
- 備份大小：344,022 bytes
- SHA-256：`fb45cfa538576ccd698e53d97fbfa2482f4b69f7d178751c8a981e0bb62662a6`
- Worker：`ec8753dd-d687-4d11-b736-a12f3d9b743b`
- Pages：`5c3ef04d`
- Alias：`https://v2-test.juliet-studio.pages.dev`
- health：`ok:true`、`dataBackend:d1`
- 線上 Owner App `20260822002`、Customer App `20260822001`、Owner CSS `20260822001` 與本機 SHA-256 完全一致。

## 下一個聊天第一步

1. 讀本文件、`V2-MASTER-BLUEPRINT-AND-PROGRESS-2026-08-09.md`、`V2-WORKLOG-2026-08-09-LINE-OA-OWNER-FLOW.md` 與 `OWNER-SUBSCRIPTION-ONBOARDING-SOP.md`。
2. 最小唯讀檢查 `git status --short` 與必要目標檔案，不清理 dirty worktree。
3. 請使用者在 iPhone／LINE 實機驗證營業時段按鈕暗亮狀態及回訪欄位排版。
4. 實機確認合格後，才依安裝包 SOP 重建 `current` 商品安裝包。

## 本部署後新增且已部署的修改

- 評估題庫已改為單題摘要／展開編輯；沒有修改時儲存鍵停用，儲存成功自動收合，取消會還原，系統鎖定題沒有編輯入口。
- Owner App 快取 `20260822003`、Owner CSS `20260822002`；完整回歸 904／904 通過。
- 部署前備份：`backups/v2-test-d1-20260822-before-assessment-question-editor-pages-deploy.sql`（410,126 bytes；SHA-256 `0a11ef18b1db9657ee3ba8fe6477e1e958aeb44f538c3f8e9354ad8ff1d11ba1`）。
- v2-test Pages：`a224d1ac`；線上 Owner App 與 CSS 均和本機 SHA-256 完全一致。本次未部署 Worker、未寫入 D1。
- 平台清單四個統計格已改為可點擊篩選；再次點擊回到全部，選取格以深色標示。
- 此修正部署前備份：`backups/v2-test-d1-20260822-before-platform-summary-filter-pages-deploy.sql`（410,126 bytes；SHA-256 `8c1ca7607573ff64060402f8ead6f748b207080e34f94caae4f605f1f9f88850`）。
- 最新 v2-test Pages：`f1020dc3`；線上 Platform JS／CSS `20260822001` 與本機 SHA-256 完全一致。本次未部署 Worker、未寫入 D1。

## 持續安全規則

- 只處理本專案與 v2-test；不碰 production、v2-production、Demo v1、Notion、main、`.dev.vars`、tokens 或 secrets。
- Wrangler 固定 3.114.17：`/Users/imac/project/beauty-studio-booking/backend/node_modules/.bin/wrangler`。
- 每次新的部署或 D1 遠端寫入都要取得使用者當次明確授權；部署前先備份 v2-test D1。
- migration 0030 未授權不得執行。
- 舊聊天的部署授權不得延用。

## 本機新增、尚未部署：一般業主專屬客戶入口

- 新工作室自動產生 64 位公開入口代碼；既有工作室由平台本人在工作室管理卡片補建並複製。
- 客戶使用 `/studio/{entryKey}/`，前端不傳 tenant ID；Worker 查表後才套用 tenant／location／staff，未知入口 fail closed。
- 不需 migration；完整回歸 910／910 通過。
- 需要新的明確授權後先備份 v2-test D1，再部署 Worker＋Pages。若要替既有測試工作室建立入口，另包含該次平台操作造成的 tenant setting＋audit log 寫入。
