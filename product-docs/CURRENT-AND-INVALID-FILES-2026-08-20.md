# Beauty Studio Booking｜目前有效與無效檔案清單

更新日期：2026-08-20（Asia/Taipei）

本文件供終端機、Cursor 與後續維護者判斷檔案用途。這裡的「無效」是指不可再當成目前安裝、部署或產品規格依據，不代表可以直接刪除。

## 一、目前有效且應優先使用

- `商品營運中心/00-先打開這裡.md`：對外販售、開通、交付與售後的唯一營運入口。
- `商品營運中心/安裝包/`：平台維護用的目前安裝包副本；一般新業主開通不使用。
- `README.md`：v2 工程入口。
- `product-docs/V2-HANDOFF-2026-08-20-CURRENT.md`：目前線上與工程狀態。
- `product-docs/V2-MASTER-BLUEPRINT-AND-PROGRESS-2026-08-09.md`：產品總藍圖。
- `product-docs/V2-WORKLOG-2026-08-09-LINE-OA-OWNER-FLOW.md`：完整變更與部署紀錄。
- `product-docs/OWNER-SUBSCRIPTION-ONBOARDING-SOP.md`：平台開通業主步驟。
- `backend/`、`customer-ui/`、`owner-admin/`、`platform-admin/`、`docs/`：目前程式與發布副本。
- `backups/v2-test-d1-20260820-211900-before-pages-20260820009-deploy.sql`：最近一次部署前 D1 備份，325,509 bytes，SHA-256 `03652318e545f0ccadcba3e7d40b1df75fae6e342a33ebce459ff8b4dbe02d18`。
- `dist/juliet-studio-os-v2-install-kit-20260820-current.zip`：目前暫時撤下；待第二版營業時段手機排版完成部署與實機確認後才重建，不得用封存錯誤版交付。

## 二、已過期／不可再當操作依據

### 舊 v1 說明

下列文件內容以 Notion、GitHub Pages、每客戶複製 repo 或 OWNER_LINE_USER_IDS 為主要架構，與目前 D1、多 tenant、Owner Hub 及 Cloudflare Pages v2 不一致；已於 2026-08-22 移至 `封存-不可使用/歷史檔案-20260822/`：

- `CLIENT-SETUP-GUIDE.md`
- `COPY-FOR-NEW-CLIENT.md`
- `PRODUCT-MASTER.md`
- `PROJECT-FOLDER-MAP.md`
- `product-docs/BASELINE-V1-SNAPSHOT.md`
- `product-docs/V2-HANDOFF-NEXT-SESSION-2026-07-24.md`
- `product-docs/V2-PROJECT-PROGRESS-2026-07-24.md`
- `product-docs/V2-WORKLOG-2026-07-24.md`

用途：僅供歷史追溯。新安裝、新租戶、新部署不得照其步驟直接操作；原路徑已不再保留，避免誤開。

### 已完成或被 v2 取代的 Cursor 任務包

- `TASK-customer-calendar-booking.md`
- `TASK-cloudflare-deploy-check.md`
- `TASK-d1-migration-plan.md`
- `TASK-deposit-transfer-info.md`
- `TASK-owner-api-auth.md`
- `TASK-owner-api-auth-phase2.md`
- `TASK-owner-booking-date-query.md`
- `TASK-owner-calendar-bookings.md`
- `TASK-owner-customer-directory.md`
- `TASK-owner-customer-notes-photos.md`

用途：只保留需求來源與決策歷史；已移至 `封存-不可使用/歷史檔案-20260822/已完成TASK/`，不能再把「待執行」當成目前待辦。`TASK-addon-package-cards.md` 仍是尚未實作的加購規劃，不列為無效。

### 舊安裝包

以下 2026-08-19 安裝包及其解壓資料夾早於首次霧唇評估修正、AI 預約引導與 868 項回歸基準，均已失效：

- `dist/juliet-studio-os-v2-install-kit-20260819.zip`
- `dist/juliet-studio-os-v2-install-kit-20260819-r2.zip`
- `dist/juliet-studio-os-v2-install-kit-20260819-r3.zip`
- `dist/juliet-studio-os-v2-install-kit-20260819-final.zip`
- 對應 `.sha256` 及四個同名解壓資料夾。

這些檔案不可交付新業主；已移至 `dist/封存-不可使用/20260819-舊安裝包/`，沒有永久刪除。

另有 `dist/封存-不可使用/juliet-studio-os-v2-install-kit-20260820-buggy-slot-layout.zip`，包含第一版營業時段手機排版錯誤，只供追溯，禁止安裝或交付。

### 未被目前頁面引用的舊 CSS 快照

- `customer-ui/css/style-20260726001.css`
- `customer-ui/css/style-20260726002.css`
- `customer-ui/css/style-20260726003.css`
- `docs/css/style-20260726001.css`
- `docs/css/style-20260726002.css`
- `docs/css/style-20260726003.css`

目前客戶頁實際引用 `style-20260726004.css`。舊檔只具有歷史快照用途，已移至 `封存-不可使用/歷史檔案-20260822/舊CSS快照/`，不應再修改或引用。

### 無產品價值的系統垃圾

- 專案根目錄與 `dist/` 內的 `.DS_Store`。
- 舊 zip 內的 `__MACOSX/` 與 `._*` AppleDouble metadata。

這些不是程式或客戶資料；目前找到的 `.DS_Store` 已移至 `封存-不可使用/歷史檔案-20260822/系統垃圾/`，沒有永久刪除。

## 三、仍有效但容易被誤判

- `owner-admin/customer-import-template.csv` 與 `customer-import-template-v2.csv`：目前測試仍要求兩者存在，不可直接刪除。
- `customer-ui/css/style.css`：雖然線上入口引用版本化 CSS，部分來源／相容流程仍保留此檔，不列為無效。
- `docs/`：是 Pages 發布來源，不是可任意清除的編譯垃圾。
- `backups/`：歷史 D1 復原資產，不因日期較舊就視為無效。
- `4d94`、`bb11` 舊 worktree：仍含尚未整合功能證據；詳見 `LEGACY-WORKTREE-FEATURE-AUDIT-2026-08-20.md`。

## 四、Cursor／終端機使用規則

1. Cursor 開啟唯一權威目錄：`/Users/imac/.codex/worktrees/eca1/beauty-studio-booking`。
2. 搜尋現況先讀 CURRENT handoff 與本清單，不從舊 TASK 或 2026-07 文件推斷。
3. 終端機先執行 `git status --short`、`git diff --check` 與 `cd backend && npm test`。
4. 不 reset、clean、restore、commit 或 push；不手動清除 Cursor 索引。
5. 部署與遠端 D1 寫入仍需逐次授權；部署前先備份 v2-test D1。
6. 每次已完成的功能修改、文字調整、流程變更或除蟲，都要同步更新 `商品營運中心/` 內受影響文件；涉及可安裝程式時，同步重建並驗證 current 安裝包，舊包不得繼續當最新版本使用。
