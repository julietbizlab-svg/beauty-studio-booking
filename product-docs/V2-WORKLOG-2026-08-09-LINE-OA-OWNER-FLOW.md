# Beauty Studio Booking v2 工作紀錄與接續說明

日期：2026-08-09（Asia/Taipei）  
專案：`/Users/imac/project/beauty-studio-booking`  
環境：僅 v2-test

## 1. 安全限制

- 這是大量 dirty worktree，完整保留所有既有修改。
- 不執行 reset、clean、restore、commit 或 push。
- 不碰 production、v2-production、Demo v1、Notion、main、`.dev.vars`、tokens 或 secrets。
- Wrangler 固定使用 3.114.17。
- 新的遠端部署或 D1 遠端寫入，必須取得使用者當次明確授權。
- 遠端 D1 寫入前先備份 v2-test D1。
- 不在文件、聊天或截圖中公開 LINE user ID、Channel Secret、token 或其他 secrets。
- migration 0030 與 OA 入口整理分開處理，未獲授權不得混在部署中執行。

## 2. 目前產品與 LINE OA 架構

### 平台管理主帳號

- 用途：平台負責人管理所有提供給業主的工作室。
- 顯示名稱預期：`Juliet Studio OS｜平台管理主帳號`。
- 不納入標準版／旗艦版租用統計。
- 不顯示一般方案異動、續約、付款、到期或邀請功能。
- 平台管理中心正式入口：
  `https://v2-test.juliet-studio.pages.dev/owner/hub/platform/`

### 標準版展示

- OA：美甲美睫標準展示 OA。
- 正式展示 tenant：`acceptance-tenant_beauty_studio_default-beige`。
- 目前名稱：`美甲師／美睫師專屬後台`。
- 方案：standard。
- 標準客戶 LIFF：`https://liff.line.me/2011029740-Q9PBV7FF`。
- 標準客戶 Pages：
  `https://v2-test.juliet-studio.pages.dev/standard/customer/`
- 標準展示不含 AI、紋繡評估與客戶匯入；客戶匯入可規劃為加購。

### 旗艦版展示

- 正式展示 tenant：`acceptance-tenant_beauty_studio_default-mauve`。
- 目前名稱：`霧眉師／霧唇師御用平台`。
- 方案：flagship。
- 業主：Juliet。
- 旗艦版保留 AI、評估與完整店務能力。

### 共用 Owner Hub

- Owner Hub LIFF：`https://liff.line.me/2010868233-3ziIABwR`。
- 共用入口會依已驗證的 LINE 身分取得可管理的 tenant。
- 一般業主只綁一間工作室時應直接進入，不顯示選擇器。
- 平台負責人同時管理標準與旗艦展示時，從共用入口才會看到兩間工作室。

## 3. 本次已完成

### 3.1 美甲美睫標準 OA 與 LIFF

- 建立並啟用 Messaging API。
- 建立標準客戶 LINE Login／LIFF。
- Worker bindings 已包含：
  - `STANDARD_LIFF_CLIENT_ID`
  - `STANDARD_SHOWCASE_TENANT_ID`
  - `STANDARD_SHOWCASE_LOCATION_ID`
  - `STANDARD_SHOWCASE_STAFF_ID`
- 標準客戶入口已部署並可正常開啟。

### 3.2 美甲美睫標準 OA 圖文選單

- 使用既有圖片：
  `owner-showcase/rich-menu-standard.png`
- 版型：小型、左右兩等分。
- 左側：業主端。
- 右側：客戶端。
- 圖文選單已建立並儲存。
- 排程：2026/08/09 02:00 至 2027/08/08 23:59。

### 3.3 業主工作室選擇器整理

已修改並部署：

- 一般 Owner Hub 排除平台管理主帳號。
- 排除 `platform_acceptance_mode=true` 的驗收 tenant。
- 平台負責人的一般入口只顯示正式指定的標準與旗艦展示 tenant。
- 舊重複測試 tenant 不再混入平台負責人的展示清單。
- 工作室名稱、方案 badge 與負責人分層顯示，不再擠在同一行。
- 一般業主只有一間工作室時直接進入，不出現工作室選擇器。

相關檔案：

- `backend/src/owner-hub.js`
- `owner-admin/js/app.js`
- `owner-admin/css/style.css`
- `owner-admin/index.html`
- `docs/owner/` 對應鏡像
- 相關測試

驗證：34/34 通過，鏡像一致，`git diff --check` 通過。

### 3.4 標準版錯誤顯示旗艦 AI 設定

問題：標準版業主端出現「AI 秘書設定」，並顯示：

- 霧眉師
- 霧唇師
- 全方位紋繡師

根因：`fillSettingsForm()` 使用共用頁面的靜態 `PRODUCT_TIER` 判斷，而不是已驗證 membership 的實際 plan。

修正：改成依 `state.ownerMembership.features.plan === "flagship"` 判斷。

結果：

- standard：隱藏 AI 秘書與紋繡評估設定。
- flagship：維持顯示。

驗證：39/39 通過，鏡像一致，`git diff --check` 通過。

## 4. 目前線上版本

### Worker

- Worker：`beauty-studio-api-v2-test`
- Version ID：`b58a870a-a1ac-4b9f-9cb6-51a17205be25`
- Health：HTTP 200
- 回應：`ok: true`、`dataBackend: d1`

### Pages

- Alias：`https://v2-test.juliet-studio.pages.dev`
- 最近一次 Pages Deployment ID：`472b8321`
- 業主端線上 app 版本：`20260809002`

### 本次備份

- `backups/v2-test-d1-20260809-before-owner-selector-deploy.sql`
- `backups/v2-test-d1-20260809-before-standard-ai-ui-deploy.sql`

## 5. 明天第一個待辦

### 修改標準 OA 的業主端圖文選單連結

目前「美甲美睫標準展示 OA」左側業主端仍連到共用 Owner Hub LIFF，所以平台負責人會看到標準／旗艦二選一。

正確行為：

- 從美甲美睫標準 OA 點「業主端」時，直接進入標準展示 tenant。
- 不再出現標準版／旗艦版二選一。
- 從旗艦 OA 點「業主端」時，應直接進入旗艦展示 tenant。
- 只有平台管理 OA 的共用入口保留工作室切換。

標準 OA 左側業主端應改成：

`https://v2-test.juliet-studio.pages.dev/owner/hub/?tenant=acceptance-tenant_beauty_studio_default-beige`

右側客戶端維持：

`https://liff.line.me/2011029740-Q9PBV7FF`

執行方式：

1. 解鎖 Mac。
2. 保持 Chrome 已登入 LINE Official Account Manager。
3. 進入美甲美睫標準展示 OA。
4. 打開目前有效的圖文選單。
5. 只修改左側 A 區的連結。
6. 不修改圖片、右側客戶端、排程、其他 OA 或帳號設定。
7. 儲存後用標準 OA 實機點擊「業主端」。
8. 確認直接進入 `美甲師／美睫師專屬後台`，不出現雙重選項。

本次尚未完成的原因：Mac 已鎖定，Computer Use 無法操作 Chrome。沒有半途修改或儲存 OA 設定。

## 6. 後續產品待辦

### 6.1 平台管理中心資訊架構

使用者已確認希望平台端分為：

1. 平台管理主帳號（獨立區塊）
2. 標準版工作室
3. 旗艦版工作室
4. 建立新工作室（預設收合）

不要再把標準版與旗艦版混在同一清單，只靠方案篩選。

標準版區塊應顯示可加購功能；旗艦版已內含完整功能。

### 6.2 標準版客戶匯入加購

現況：

- 後端已有 `customer_import_enabled` 權限欄位與完整 CSV 匯入流程。
- standard 預設關閉並隱藏匯入入口。
- flagship 預設開啟。
- 平台管理中心目前沒有獨立的「客戶資料匯入加購」開關。
- 標準版業主端也沒有顯示「可加購」提示。

若要正式販售，需補：

- 標準版業主端顯示「CSV 客戶匯入｜可加購」，未購買時不可操作。
- 平台管理中心增加 `customerImport` 獨立開關。
- 顯示未加購／已開啟、開通日、到期日或永久。
- 關閉加購只停止新的匯入，不刪除既有客戶資料。
- 操作需留下 audit log。

## 7. 資料辨識結果

v2-test D1 唯讀查詢確認有兩筆名稱相近的工作室：

| tenant | 名稱 | 方案 | 判定 |
|---|---|---|---|
| `acceptance-tenant_beauty_studio_default-beige` | 美甲師／美睫師專屬後台 | standard | 正式標準展示 |
| 舊 UUID tenant | 美甲師💅/美睫師專屬平台 | flagship | 舊重複測試，不作為標準展示 |

不要因為舊名稱有 💅 符號就改用舊 tenant。若偏好 emoji 名稱，應只更正正式標準展示 tenant 的顯示名稱。

## 8. 本次踩過的坑

### 8.1 `/platform/` 不是正式平台入口

錯誤／不完整入口：

`https://v2-test.juliet-studio.pages.dev/platform/`

正式入口：

`https://v2-test.juliet-studio.pages.dev/owner/hub/platform/`

正式路徑會經 Pages `_worker.js` 路由到平台管理頁，並沿用正確的 Owner Hub／LIFF 身分流程。

### 8.2 標準 OA 業主按鈕不能只連共用 Owner Hub

如果標準 OA 左側只連共用 Owner Hub LIFF，平台負責人因同時管理兩個展示 tenant，會看到二選一。

展示 OA 必須指定 tenant；共用切換只留給平台管理 OA。

### 8.3 「專業類型」不是題庫

畫面中的霧眉師／霧唇師／全方位紋繡師是 AI 秘書的專業類型，不是美甲／美睫服務範本或題庫。

標準版不含 AI，正確做法是隱藏整個區塊，不是加入美甲師選項。

### 8.4 靜態 config 不能取代已驗證 membership plan

Owner Hub 是共用頁面，不能只用 URL 或 `PRODUCT_TIER` 判斷方案。所有功能顯示與權限必須以後端驗證後的 `membership.features` 為準。

### 8.5 不可用名稱判斷 tenant 用途

名稱可能被更正、包含 emoji 或重複。展示 tenant 應由固定 binding／tenant ID 辨識，平台主帳號由 `env.TENANT_ID` 辨識。

### 8.6 D1 export 可能暫時 OAuth 失敗

第一次備份曾收到 Cloudflare authentication error；同一個 Wrangler 3.114.17 指令重試後成功。備份失敗時不可直接跳過備份部署。

### 8.7 從專案根目錄使用裸 `npx wrangler` 可能下載 Wrangler 4

曾在 Pages 部署時由專案根目錄執行裸 `npx wrangler`，因根目錄沒有該 dependency，`npx` 自動下載 Wrangler 4.120.0。

雖然部署成功，但不符合固定版本規則；隨後已使用專案既有 Wrangler 3.114.17 重新部署，最終線上版本符合規定。

往後 Pages 固定從 `backend` 執行：

```bash
./node_modules/.bin/wrangler pages deploy ../docs \
  --project-name=juliet-studio --branch=v2-test
```

Worker 固定從 `backend` 執行：

```bash
npx wrangler deploy --env v2-test
```

執行前先確認：

```bash
npx wrangler --version
```

必須輸出 `3.114.17`。

### 8.8 Mac 鎖定時無法用 UI 工具修改 LINE Manager

Computer Use 需要 Mac 已解鎖，且 Chrome 保持登入狀態。遇到鎖定時應停止，不要改走未授權的 secret／API 方式繞過。

## 9. 已建立的營運文件

- `product-docs/OWNER-SUBSCRIPTION-ONBOARDING-SOP.md`
  - 一般業主開通流程
  - 共用 LINE OA 模式
  - 一次性邀請與 LINE 綁定
  - 客製品牌 OA 分流
  - 異常處理與安全規則

## 10. 明天接續前最小確認

1. 確認 Mac 已解鎖。
2. 確認 Chrome 仍登入正確的美甲美睫標準展示 OA。
3. 不重新部署 Worker／Pages，因明天第一步只需改 OA 圖文選單連結。
4. 不修改 D1。
5. 修改後用標準 OA 實機測試業主端與客戶端兩個入口。
6. 再決定是否開始平台管理中心「標準版／旗艦版分區」與「標準版匯入加購」介面工程。

## 11. 2026-08-16 標準 OA 客戶通知修復與即時路徑驗證

### 修復內容

- LINE Developers 已確認正確標準美甲／美睫 OA 頻道。
- 舊長期 token 經 LINE 官方驗證為無效，已補發並安全更新 v2-test 的
  `STANDARD_LINE_CHANNEL_ACCESS_TOKEN`；值未寫入文件或專案檔案。
- Worker 通知派送改為依 tenant 選擇標準／旗艦／預設 OA token。
- booking 狀態轉換建立通知後，立即只派送該筆通知。
- 五分鐘 cron 保留為 queued 與超過五分鐘的舊 failed 通知保險重試，
  不作為新事件主要派送路徑。

### 備份與部署

- D1 備份：
  `backups/v2-test-d1-20260816-before-standard-token-reissue-worker-repair.sql`
  （272,508 bytes）。
- v2-test Worker Version ID：
  `6920e950-6e36-4fb2-9073-9b7f9666c900`。
- Worker health：HTTP 200、`dataBackend: d1`。
- 相關測試 838 項通過；另 1 項既有圖像測試因本工作樹缺少 `sharp`
  dependency 無法載入，與通知後端改動無關。

### 原失敗通知補送結果

- notification：`b2b24698-bad4-4fce-a127-fd0d9a0948ba`
- booking：`3bba13e4-6b7c-43a7-8215-7bdc232bf51b`
- template：`booking_confirmed`
- 最終狀態：`sent`
- sent_at：`2026-08-16T15:40:38.858Z`
  （Asia/Taipei：2026-08-16 23:40:38.858）。

### 新成立預約即時驗證

- 測試 booking：`359d229c-3a93-44dd-afa8-59dbdfc67712`
- 服務／時段：手部美甲，2026-08-18 16:00（Asia/Taipei）。
- `deposit_payment_requested`：
  - created_at：`2026-08-16T15:43:26.584Z`
  - sent_at：`2026-08-16T15:43:28.036Z`
  - 約 1.452 秒即時送出。
- `booking_confirmed`：
  - created_at：`2026-08-16T15:43:51.675Z`
  - sent_at：`2026-08-16T15:43:52.509Z`
  - 約 0.834 秒即時送出。
- 兩筆均為 `sent`、`failed_at = NULL`、`error_code = NULL`，證明新成立
  預約走即時派送；cron 僅負責舊失敗補送。

## 12. 2026-08-18 跨 tenant 訂金逾期與旗艦 LIFF 入口驗證

### 備份與部署

- D1 備份：
  `backups/v2-test-d1-20260818-before-cross-tenant-expiry-and-flagship-liff-deploy.sql`
  （285,592 bytes）。
- Pages rewrite 修正重部署前再次備份：
  `backups/v2-test-d1-20260818-before-flagship-liff-redirect-redeploy.sql`
  （285,592 bytes）。
- v2-test Worker Version ID：
  `0815be14-507d-419c-9abd-c60ac6f528fc`。
- Worker health：HTTP 200、`dataBackend: d1`。
- v2-test Pages 最終部署：`835b389d`。
- migration 0030 未執行；production 未修改。

### 跨 tenant cron 實際驗證

- 標準版測試 booking：`standard-expiry-test-20260818`
  - cron 自動從 `pending_customer_confirmation` 改為 `expired`：
    `2026-08-17T16:20:37.373Z`。
  - audit reason：`deposit_deadline_expired`。
  - `deposit_expired` notification：`sent`；sent_at：
    `2026-08-17T16:20:38.244Z`。
  - 測試時段 blocking booking count：0。
- 旗艦版測試 booking：`flagship-expiry-test-20260818`
  - cron 自動從 `pending_customer_confirmation` 改為 `expired`：
    `2026-08-17T16:20:38.494Z`。
  - audit reason：`deposit_deadline_expired`。
  - `deposit_expired` notification：`sent`；sent_at：
    `2026-08-17T16:20:39.099Z`。
  - 測試時段 blocking booking count：0。
- 兩筆期限均設定為受理後 24 小時，且在建立測試資料時已逾期；未人工觸發
  狀態轉換，等待 `*/5` cron 自然執行後才唯讀驗證。

### 旗艦客戶 LIFF 入口

- 旗艦客戶正式入口統一為 `/flagship/showcase/customer`。
- 舊 `/flagship/customer` 以 HTTP 302 導向正式入口並保留 query string。
- v2-test 線上驗證：舊入口 302、正式入口 200。
- 由旗艦 LIFF URL 實際進入 LINE OAuth 時，`redirect_uri` 已是正式入口；
  驗證 Chrome 頁籤未具客戶 LINE 登入狀態，因此未宣稱已看到登入後服務頁。

### LIFF 載入速度與網址清理

- 部署前 D1 備份：
  `backups/v2-test-d1-20260818-before-liff-speed-url-cleanup-pages-deploy.sql`
  （290,778 bytes）。
- v2-test Pages 部署：`1a241f01`。
- HTML 提前對 LINE SDK 網域做 preconnect／DNS prefetch，並 preload LIFF SDK。
- LIFF 初始化完成後，以 `history.replaceState` 清除 OAuth callback 的
  `code`、`state`、`liffClientId`、`liffRedirectUri`、`error` 等過渡參數，
  不新增瀏覽紀錄並保留真正的預約 query／fragment。
- 線上 HTML 與 `liff-init.js?v=20260818001` 已唯讀確認包含上述修正。

## 13. 2026-08-19 業主端品牌確認視窗

- 部署前 D1 備份：
  `backups/v2-test-d1-20260819-before-owner-branded-dialog-pages-deploy.sql`
  （294,872 bytes）。
- v2-test Pages 部署：`eca1c546`。
- 業主端移除原生 `confirm()`、`prompt()`、`alert()`，避免顯示 Pages 網域的
  瀏覽器系統視窗。
- 未到、取消、狀態轉換、改期、邀請與照片刪除統一使用品牌確認視窗；
  補色提醒改用頁內日期表單。
- 完整測試 844 項通過；v2-test alias 線上 JS／CSS 已確認為新版且不含原生彈窗。
- Worker、production 與 migration 0030 均未修改。

## 14. 2026-08-19 未到時間防呆

- 問題：尚未到預約日期／開始時間，業主端仍會顯示「未到」並開啟確認視窗。
- 修正：以台北時間判斷預約開始時間；時間未到時不提供「未到」操作，送出前再檢查一次；後端既有拒絕規則保留為第二層防護。
- 完整測試 845 項通過。
- 部署前 D1 備份：
  `backups/v2-test-d1-20260819-before-owner-future-no-show-pages-deploy.sql`
  （294,872 bytes）。
- v2-test Pages 部署：`a01ba671`。
- v2-test alias 已確認載入 `js/app.js?v=20260819002`；線上 JS 與本機檔案 SHA-256 完全一致。
- 本次未部署 Worker，未碰 production、migration 0030 或 secrets。

## 15. 2026-08-19 AI 服務階段、店名與補色名稱修正

- 「服務後保養」AI prompt 明確限定服務已完成，禁止混入預約確認、提前抵達、攜帶證件、到店準備或改期等服務前內容。
- AI 訊息草稿 payload 新增該 tenant 的工作室名稱；優先讀取 `brand_name`，其次 tenant 名稱，不再使用泛稱「美業工作室」署名。
- 霧眉 tenant 的服務主檔與唯一既有預約快照，由
  `韓系霧眉｜首次免費補色` 精準更新為 `韓系霧眉｜免費補色乙次`，各異動 1 筆。
- 部署前 D1 備份：
  `backups/v2-test-d1-20260819-before-ai-aftercare-studio-service-name-worker-deploy.sql`
  （297,309 bytes）。
- v2-test Worker 版本：`6fc95d59-06fe-459c-8f0b-4be13428263b`。
- 完整測試 846 項通過；遠端 D1 已唯讀確認服務主檔、預約快照與解析後店名，Worker health 正常。
- Chrome 已登入業主分頁兩次接管逾時，因此未宣稱已完成瀏覽器內實際 AI 文案驗證。
- 未碰 production、migration 0030 或 secrets。

## 16. 2026-08-19 服務前抵達時間業主設定

- 新增「業主端 → 店面設定 → 預約與取消時間限制 → 服務前建議抵達時間（分鐘前）」。
- 預設 5 分鐘，可由業主設定 0～60；0 代表依預約時間抵達。
- AI「服務前叮嚀」只能使用該 tenant 的設定值，不得自行杜撰其他分鐘數。
- 使用既有 `tenant_settings` key-value 結構，無需 migration；未設定 tenant 安全 fallback 為 5。
- 完整測試 846 項通過。
- 部署前 D1 備份：
  `backups/v2-test-d1-20260819-before-arrival-reminder-setting-worker-pages-deploy.sql`
  （297,304 bytes）。
- v2-test Worker：`905b2bd4-bd9c-4ec7-9f31-5c610f98c290`。
- v2-test Pages：`90a37b68`；alias 已確認載入 `js/app.js?v=20260819003`。
- 線上 HTML／JS 與本機 SHA-256 完全一致，Worker health 正常。
- 未碰 production、migration 0030 或 secrets。

## 17. 2026-08-19 AI 草稿內容安全閘

- AI payload 新增明確服務分類：霧眉、唇部、美甲、美睫與其他。
- 服務分類互斥：霧眉草稿若出現唇部、美甲或美睫內容，後端直接拒絕顯示；其他分類亦採相同防護。
- 草稿含簡體中文字形時拒絕顯示。
- 草稿含 `draftType`、`payload`、英文內部類型代碼、系統指示、推理或任務說明時拒絕顯示。
- 客戶訊息必須直接以「您好」開頭，否則不進入可複製欄位。
- 完整測試 847 項通過。
- 部署前 D1 備份：
  `backups/v2-test-d1-20260819-before-ai-draft-content-guard-worker-deploy.sql`
  （297,791 bytes）。
- v2-test Worker：`8f03214a-6bc7-486c-a61e-9cf1c152bc8b`；health 正常。
- 本次未寫入 D1、未部署 Pages，未碰 production、migration 0030 或 secrets。

## 18. 2026-08-19 改期協調固定安全草稿

- 「改期協調」不再呼叫生成式 provider，自動依該筆預約的日期、時間、服務名稱與 tenant 店名產生固定繁體中文客戶訊息。
- 不會再出現跨服務技能、簡體中文、內部英文代碼、系統指示或推理文字，也不再要求業主反覆重試。
- 完整測試 849 項通過。
- 部署前 D1 備份：
  `backups/v2-test-d1-20260819-before-safe-reschedule-draft-worker-deploy.sql`
  （297,791 bytes）。
- v2-test Worker：`3586f07d-43e8-4182-ab5d-e0dbe8531b0c`；health 正常。
- 本次未寫入 D1、未部署 Pages，未碰 production、migration 0030 或 secrets。

## 19. 2026-08-19 服務後保養固定分類範本

- 「服務後保養」不再呼叫生成式 provider；依實際預約分類使用霧眉、唇部、美甲、美睫或保守通用範本。
- 草稿自動帶入實際服務名稱與 tenant 店名，避免跨服務技能、簡體中文與反覆重試。
- 完整測試 850 項通過。
- 部署前 D1 備份：
  `backups/v2-test-d1-20260819-before-safe-post-service-care-worker-deploy.sql`
  （297,791 bytes）。
- v2-test Worker：`d5d250bf-e13f-4ebd-b231-ef4771436999`；health 正常。
- 本次未寫入 D1、未部署 Pages，未碰 production、migration 0030 或 secrets。

## 20. 2026-08-19 店名跨服務字樣誤判修正

- 根因：霧眉 tenant 店名本身同時含霧眉與霧唇字樣，舊檢查把可信店名署名誤判為正文跨服務內容。
- 服務一致性改為只檢查訊息正文；先排除該筆實際服務名稱與 tenant 店名，再檢查跨服務詞彙。
- 簡體中文與內部系統文字仍檢查全文，未放寬安全規則。
- 完整測試 850 項通過，並加入實際多技能店名回歸案例。
- 部署前 D1 備份：
  `backups/v2-test-d1-20260819-before-ai-studio-name-false-positive-worker-deploy.sql`
  （297,791 bytes）。
- v2-test Worker：`f48488e9-8801-4dd3-9bab-b76366889781`；health 正常。

## 21. 旗艦版業主評估題庫載入修正（2026-08-19）

- 問題原因：業主題庫清單會把服務設定中的 `none` 一併送進題庫初始化，導致整批回傳「不支援的評估服務」。
- 修正：題庫清單只保留系統已支援且實際啟用的評估代碼；`none`、空值、未知代碼均略過，不改變各服務是否需要評估的設定。
- 遠端唯讀確認：旗艦展示工作室同時存在有效題庫服務與 `none` 服務，符合本次錯誤條件；查詢未寫入資料。
- 完整測試：851 項通過。
- 部署前備份：`backups/v2-test-d1-20260819-before-assessment-none-filter-worker-deploy.sql`（315,644 bytes）。
- v2-test Worker：`9ac6968e-29b2-4f9a-81d3-38e0840bf2b9`；`/api/health` 正常，`dataBackend: d1`。
- 本次未寫入 D1、未部署 Pages、未碰 production。

## 22. 業主評估題庫收合互動（2026-08-19）

- 題庫預設收合，只有按「載入題庫」且載入成功後才展開。
- 最下方「儲存設定」成功後會清空並收起題庫，需再次按「載入題庫」才會展開。
- JavaScript 快取版本更新為 `20260819004`。
- 完整測試：852 項通過。
- 部署前備份：`backups/v2-test-d1-20260819-before-assessment-collapse-pages-deploy.sql`（307,984 bytes）。
- v2-test Pages 部署：`f731f33a`；alias 線上 HTML 已載入新版本，線上 JavaScript 與本機 SHA-256 一致。
- 本次未寫入 D1、未部署 Worker、未碰 production。

## 23. 補件 LINE 通知短時間防重複（2026-08-19）

- 原因：業主連點「要求補照片」時，每次請求都會建立獨立通知，造成客人收到相同訊息兩次以上。
- 後端：同一 tenant、預約、LINE 通知類型於 2 分鐘內採原子式去重，只保留第一筆並回用既有通知。
- 前端：補照片、取消照片需求與補答請求送出期間鎖定按鈕，並將過期提示改為「LINE 通知已排入傳送」。
- 完整測試：853 項通過；新增同預約重複補照片只建立一筆通知的回歸測試。
- 部署前備份：`backups/v2-test-d1-20260819-before-notification-dedup-worker-pages-deploy.sql`（312,490 bytes）。
- v2-test Worker：`19c4c0ba-2b26-4565-a582-485e8feac3e9`；`/api/health` 正常。
- v2-test Pages：`a45ba000`；alias 已載入 `js/app.js?v=20260819005`，線上 HTML／JavaScript 與本機 SHA-256 一致。
- 本次未寫入 D1、未碰 production；部署前既有的第 3 筆 queued 通知未經授權修改。

### 23.1 舊第 3 筆重複通知處理結果

- 使用者授權取消後先完成備份：`backups/v2-test-d1-20260819-before-cancel-duplicate-photo-notification.sql`（312,479 bytes）。
- 寫入前唯讀確認顯示該筆已於 2026-08-19 22:05:37（台北時間）由 cron 送出，不再是 `queued`。
- 已送出的 LINE 訊息無法撤回；為保留真實稽核紀錄，未將 `sent` 偽改成 `cancelled`，本次零 D1 寫入。
- 本次未寫入 D1、未部署 Pages，未碰 production、migration 0030 或 secrets。

## 24. 統一網址、客戶相簿與照片防閃爍（2026-08-19）

- 所有支援中的舊入口改由 Pages Function 同次回傳正確頁面，避免站內 302 中繼；前端再以 `history.replaceState` 統一成固定 v2-test 網址，查詢參數與 hash 仍保留。
- `/index.html` 由 Cloudflare 平台正規化為 `/`；其餘抽查的標準客戶、旗艦客戶、業主與平台入口皆為 `200`、`0 redirects`。
- 每位客戶新增一本統一相簿，依拍攝／建立時間由新到舊聚合新客評估、舊眉評估、預約補充、施作前與施作後照片。
- 相簿只聚合既有 D1 metadata；不搬動、不複製 R2，不公開 object key，照片內容仍走 owner auth API 與 tenant scope。
- 照片下載後保留於該客戶頁的記憶體快取；縮圖完成解碼才淡入，點開大圖重用已下載 Blob，避免第二次網路等待與畫面閃白；切換客戶即釋放 object URL 與快取。
- 完整測試：856 項通過；`git diff --check` 通過。
- 部署前備份：`backups/v2-test-d1-20260819-before-customer-album-image-speed-redirect-deploy.sql`（314,610 bytes）。
- v2-test Worker：`b9b2d526-6c5b-4b7f-b4be-c2213f711828`；health 200，相簿未登入請求正確回 401。
- v2-test Pages：`dfcd7a75`；alias 線上 HTML 與 JavaScript 已確認包含相簿、快取與防閃爍版本。
- 本次未寫入 D1、未執行 migration、未碰 production 或 secrets。

## 25. 通知並行去重、客戶資料 dirty-state、相簿讀取修復（2026-08-19）

- 通知送出前新增 D1 原子租約：即時發送與五分鐘 cron 同時取得同一筆通知時，只有一方能呼叫 LINE；同客戶短時間內相同內容也不重複建立。
- 新增並行回歸測試，確認即時發送與 cron 同時執行仍只呼叫 LINE 一次。
- 客戶資料表單建立已儲存基準值；沒有修改或儲存成功後「儲存客戶資料」按鈕會熄滅，欄位再次變更才恢復可按。
- 客戶相簿照片改走單一 customer-scoped owner API；後端依來源重新驗證照片屬於該 tenant 與 customer，再由私有 R2 串流，不再依賴四種舊案件網址。
- 完整測試：857 項通過；`git diff --check` 通過。
- 部署前備份：`backups/v2-test-d1-20260819-before-dedup-customer-dirty-album-photo-fix.sql`（314,610 bytes）。
- v2-test Worker：`61c80e2c-7540-4e13-9ee0-7e46e6e50c53`；health 200，相簿照片未登入請求正確回 401。
- v2-test Pages：`f7e9e26b`；alias 已載入 `js/app.js?v=20260819008`，線上檔案含 dirty-state 與相簿快取修正。
- 本次未寫入 D1、未執行 migration、未碰 production 或 secrets。

## 26. 不需評估服務直接預約（2026-08-19）

- 問題原因：客戶端原本把所有 v2 服務一律判定為預約前需評估，未尊重服務的 `assessmentTemplateCode` 設定。
- 修正：只有明確設定非 `none` 評估代碼的服務才開啟評估表；足部美甲與其他設定為 `none` 的服務直接進入預約流程。
- 完整測試：857 項通過；`git diff --check` 通過。
- 部署前備份：`backups/v2-test-d1-20260819-before-no-assessment-service-pages-deploy.sql`（314,610 bytes）。
- v2-test Pages：`3d2ed353`；alias 已載入 `js/app.js?v=20260819009`，線上 JavaScript 已確認包含 `code !== "none"` 判斷。
- 本次未寫入 D1、未部署 Worker、未執行 migration、未碰 production 或 secrets。

## 27. 美甲／美睫免評估與題庫入口暫時關閉（2026-08-19）

- 美甲、美睫與睫毛相關服務一律直接預約；客戶端、服務 DTO 與評估 API 均有防護，即使舊資料誤設題庫也視為不需要評估。
- 業主建立或編輯美甲／美睫服務時，評估選項自動隱藏並固定為 `none`；評估功能只保留給 AI／旗艦方案中明確指定題庫的其他服務。
- 「本工作室服務評估題庫／載入題庫」區塊暫時以 `hidden` 關閉，功能、程式與既有資料均未刪除。
- 完整測試：857 項通過；`git diff --check` 通過。
- 部署前備份：`backups/v2-test-d1-20260819-before-nail-lash-no-assessment-worker-pages-deploy.sql`（314,610 bytes）。
- v2-test Worker：`efb4ccdf-bfc9-4603-860d-995abd97a97e`；health 正常，`dataBackend: d1`。
- v2-test Pages：`59379114`；alias 已載入客戶端與業主端 `js/app.js?v=20260819010`，線上題庫設定區確認為 hidden。
- 本次未寫入 D1、未執行 migration、未碰 production 或 secrets。

## 28. 美甲／美睫直接待訂金與客戶端速度改善（2026-08-19）

- 美甲、美睫與睫毛服務送出預約後直接進入待訂金，立即起算 24 小時期限；訂金核對完成後才正式成立，逾期沿用既有 cron 自動取消並釋放時段。
- 預約成功畫面立即顯示訂金金額、銀行、帳號、戶名，並提醒轉帳後通知工作室核對及逾期釋放規則；LINE 同步建立完整訂金通知並以 `waitUntil` 背景即時發送，不阻塞 API 回應。
- 免評估服務選定後不再等待題庫 API 才顯示月曆；預約成功畫面先顯示，設定、profile、月曆與預約紀錄改為背景同步。
- 若工作室未開啟訂金或缺少金額、帳號、戶名，後端拒絕建立不完整的待訂金預約。
- 完整測試：859 項通過；`git diff --check` 通過。
- 部署前備份：`backups/v2-test-d1-20260819-before-direct-deposit-flow-worker-pages-deploy.sql`（316,506 bytes）。
- v2-test Worker：`eecd250d-6074-4418-94ab-00b3f829ab53`；health 正常，`dataBackend: d1`。
- v2-test Pages：`69485c3e`；alias 已載入 `js/app.js?v=20260819012`，線上程式已確認包含轉帳通知與背景同步修正。
- 本次未寫入 D1、未執行 migration、未碰 production 或 secrets。

## 29. 已繳訂金改期保護與客戶匯入加購提示（2026-08-19）

- 標準版與旗艦版共用：已確認訂金的預約不再允許客戶直接取消，改顯示「變更時間」；客戶須選擇希望日期與時間，原預約與時段在業主處理前維持不變。
- 後端拒絕繞過前端直接取消已確認訂金預約；改期需求寫入 audit log，並使用該 tenant 對應 OA 即時通知已綁定的 owner／manager，兩分鐘內相同內容防重複。
- 未開通客戶匯入功能的業主顯示「既有客戶名單批次匯入」及洽平台加購說明；已開通者只顯示既有 CSV 工具，不顯示加購提示。
- 完整測試：861 項通過；`git diff --check` 通過。
- 部署前備份：`backups/v2-test-d1-20260819-before-paid-reschedule-and-import-upsell-worker-pages-deploy.sql`（320,052 bytes）。
- v2-test Worker：`b7f701db-8c7e-48bb-b82c-daf006d3bdad`；health 正常，`dataBackend: d1`。
- v2-test Pages：`1dd33f3f`；alias 已載入客戶端 `js/app.js?v=20260819013`、業主端 `js/app.js?v=20260819014`，線上加購標題確認無問號。
- 本次未寫入 D1、未執行 migration、未碰 production 或 secrets。

## 30. 客戶改期欄位手機版對齊（2026-08-20）

- 修正 iPhone／LINE 內建瀏覽器替原生日期與時間欄位保留不可收縮寬度，造成已繳訂金改期視窗的日期格凸出右側邊界。
- 日期與時間欄位現在限制於 modal 內容寬度，並與「通知工作室／返回」按鈕左右對齊；標準版與旗艦版共用。
- 完整測試：862 項通過；`git diff --check` 通過。
- 部署前備份：`backups/v2-test-d1-20260820-before-customer-reschedule-field-alignment-pages-deploy.sql`（320,052 bytes）。
- v2-test Pages：`d5adbd7f`；alias 已載入 `css/style-20260726004.css?v=20260820001`，線上 CSS 與本機 SHA-256 完全一致。
- 本次未寫入 D1、未部署 Worker、未執行 migration、未碰 production 或 secrets。

## 31. 已繳訂金改期限定可預約空檔與介面整理（2026-08-20）

- 修正改期視窗「返回」事件原本錯放於取消視窗關閉函式的問題；頁面初始化即綁定返回與送出，點擊遮罩亦可安全關閉。
- 客戶不能再自行輸入任意日期與時間；改期視窗依原預約服務載入業主開放月曆，只有仍有空檔的日期可選，選定日期後再載入即時可預約時段。
- 後端在建立改期需求前以相同營業時段、服務時長、提前預約天數及既有預約衝突規則再次複驗；被搶走或非開放時段回 409，不寫 audit、不通知業主。
- 手機版日期固定七欄正方形對齊；時段一般三欄、窄螢幕兩欄，按鈕等寬等高並更新選取狀態層級。
- 完整測試：863 項通過；`git diff --check` 通過。
- 部署前備份：`backups/v2-test-d1-20260820-before-customer-reschedule-availability-worker-pages-deploy.sql`（320,052 bytes）。
- v2-test Worker：`97f801b9-7dcf-4ad4-a270-4632b2ae1c17`；health 正常，`dataBackend: d1`。
- v2-test Pages：`d63282ac`；alias 已載入 `js/app.js?v=20260820001` 與 `css/style-20260726004.css?v=20260820003`，線上 JavaScript／CSS 與本機 SHA-256 完全一致。
- 本次未寫入 D1、未執行 migration、未碰 production 或 secrets。

## 32. LINE／LIFF 跳轉品牌載入與入口標題修正（2026-08-20）

- 全面檢查標準客戶、旗艦客戶、業主、平台與展示入口；主要路徑皆直接回傳 `200`，沒有站內 HTTP 轉址。
- 客戶與業主 LIFF 在登入、憑證恢復或跨入口切換前，先固定 Juliet Studio OS 頁面標題並顯示「正在安全開啟…」品牌載入畫面，避免白頁期間以 Pages 網域充當頁面標題。
- 客戶、業主、平台與旗艦展示頁的 `<title>` 提前至 head 最前段，降低 LINE 內建瀏覽器解析初期顯示網域名稱的機會。
- LINE 內建瀏覽器灰色安全網址列無法由網頁隱藏；若要移除 `pages.dev` 字樣，需另行綁定自訂品牌網域並更新 LINE LIFF Endpoint。
- 完整測試：863 項通過；部署副本與來源一致。
- 部署前備份：`backups/v2-test-d1-20260820-before-branded-liff-transition-pages-deploy.sql`（320,052 bytes）。
- v2-test Pages：`6ad010df`；alias 的客戶、業主與平台入口皆為 `200`、`0 redirects`，並已載入新標題與品牌跳轉畫面。
- 本次未寫入 D1、未部署 Worker、未執行 migration、未碰 production 或 secrets。

## 33. 首次霧唇必須完成評估（2026-08-20，本機完成、尚未部署）

- 問題原因：原客戶流程以「是否做過任何完成服務」判定整體回訪客；曾做過美甲、霧眉或其他服務的客戶，第一次選擇霧唇時也可能錯誤略過霧唇評估。
- 修正後改為服務別判斷：只有已完成相同服務的回訪客可免重做該服務評估；完成其他服務不會解除首次霧唇或首次霧眉的評估要求。
- 後端建立預約時不再用全域回訪客狀態繞過評估，仍會依該服務設定的 `assessmentTemplateCode` 驗證人工核准狀態，防止繞過前端直接送單。
- 客戶端每次選擇需評估服務都向後端取得該服務的實際要求，不再因做過其他服務直接開放日期時段。
- 新增回歸測試：首次霧唇即使完成過其他服務仍須 `lip_blush_new_client`；只有已完成相同霧唇服務才可免重做。
- 客戶端 JavaScript 快取版本更新為 `20260820003`；完整測試 867／867 通過，靜態發布副本一致，`git diff --check` 通過。
- 本次只完成本機程式與文件；未備份或寫入 D1、未部署 Worker／Pages、未執行 migration、未碰 production 或 secrets。

## 34. 客戶 AI 從問答改為安全預約引導（2026-08-20，已部署 v2-test）

- 目標改為協助客人完成下一步，而非只留下問題等待業主回覆。
- AI 僅能使用業主已公開的服務與知識庫；不得捏造價格、效果、政策或時段。
- 後端保留模型判讀與內部欄位，只對客戶回傳安全答案及經服務清單驗證的 `nextAction`。
- 客戶需求明確且不需人工判斷時，畫面提供「選擇此服務並開始預約」按鈕，將服務帶入既有預約／評估流程；不會靜默建立預約。
- 客人詢問最快時段時，日期與時間仍由系統依營業時段及現有預約確定性計算，AI 不得生成。
- 專業判斷、未公開服務、知識庫缺漏及需業主決定的事項仍轉人工。
- 客戶頁標示 AI 使用工作室核准資料，預約送出前仍由客戶本人確認。
- 完整回歸測試：868／868 通過；客戶頁與 `docs` 發布副本一致，`git diff --check` 通過。
- 部署前備份：`backups/v2-test-d1-20260820-before-first-lip-ai-conversion-worker-pages-deploy.sql`（322,612 bytes；SHA-256 `eaf2f9c5a004417a906c0e03788776c06374a16d108dd4f029bec8201e684cd7`）。
- v2-test Worker：`5d1ee415-5360-484d-befc-ed6efe76b162`；`/api/health` 正常，`dataBackend: d1`。
- v2-test Pages：`2e074836`；alias 已載入 `js/app.js?v=20260820004` 與 `css/style-20260726004.css?v=20260820005`，線上 JavaScript／CSS 與本機 SHA-256 完全一致。
- 本輪沒有寫入 D1、沒有執行 migration、沒有碰 production 或 secrets。

## 35. 業主端營業時段四欄手機版對齊（2026-08-20，已部署 v2-test）

- 修正週幾、開始時間、結束時間與刪除按鈕原本使用三個等分欄加自動寬度，iPhone／LINE 內建瀏覽器會因原生時間欄最小寬度造成擠壓、重疊與右側凸出。
- 改為四欄可收縮網格：週幾保留可讀寬度，開始／結束時間使用 `minmax(0, 1fr)`，刪除欄固定 48px；四個控制項統一 48px 高並採 `box-sizing: border-box`。
- 同步更新 `owner-admin` 來源與 `docs/owner` Pages 副本，CSS 快取版本為 `20260820002`。
- 新增營業時段四欄對齊回歸測試；完整測試 869／869 通過，靜態副本一致，`git diff --check` 通過。
- 部署前備份：`backups/v2-test-d1-20260820-before-owner-slots-alignment-pages-deploy.sql`（323,283 bytes；SHA-256 `9bb8cba4367a3b1047bcd841d66814754e5b3ea8a2dac14d12b0bdc0a1c488d4`）。
- v2-test Pages：`9a0fb33d`；alias 已載入業主端 `css/style.css?v=20260820002`，線上 CSS 已確認包含新四欄網格與 48px 對齊規則。
- 本次未寫入 D1、未部署 Worker、未執行 migration、未碰 production 或 secrets。

### 實機驗收結果：不合格

- 17:58 使用者提供的兩張 iPhone／LINE 截圖證實：雖然新 CSS 已上線，iOS 原生 `time` 控制項仍自行撐高，結束時間外觀壓到刪除按鈕，週幾與時間格高度也不一致。
- 原因是第一版只限制網格欄寬與 input 尺寸，沒有用獨立容器限制 iOS 原生時間控制項的繪製範圍；「線上 CSS 存在」不等於實機畫面驗收通過。
- `9a0fb33d` 不得再宣稱此問題已修好。

## 36. 業主端營業時段第二版固定外框修正（2026-08-20，已部署 v2-test、待手機確認）

- 週幾固定 76px，開始／結束使用兩個可收縮欄，刪除固定 44px，欄距縮為 4px。
- 開始與結束時間各增加獨立 `slot-time-cell` 外框；外框固定 44px 並 `overflow: hidden`，內部 iOS 原生 `time` input 固定 42px、移除原生外觀邊界，因此即使原生控制項有最小尺寸也不能跨欄壓到刪除鍵。
- 保留原生時間選擇功能與既有 `.slot-start`／`.slot-end` 資料收集，不更改營業時段資料結構或 API。
- 業主端 CSS 快取預計版本 `20260820003`，JavaScript 快取預計版本 `20260820004`；來源與 `docs/owner` 副本一致。
- 新增／更新固定外框、尺寸、溢出與無障礙標籤回歸檢查；完整測試 869／869 通過，`git diff --check` 通過。
- 部署前備份：`backups/v2-test-d1-20260820-before-owner-slots-ios-wrapper-pages-deploy.sql`（323,283 bytes；SHA-256 `9bb8cba4367a3b1047bcd841d66814754e5b3ea8a2dac14d12b0bdc0a1c488d4`）。
- v2-test Pages：`3719584f`；alias 已載入業主端 CSS `20260820003` 與 JavaScript `20260820004`。線上 JavaScript SHA-256 與本機一致：`b23d394ea748ef3912a67a4b7adcff32de72b1c2cf814a6d471aa1e354c26c87`。
- 原錯誤 current 安裝包已撤下並移至 `封存-不可使用/`；第二版仍需使用者手機實機確認後才建立新的 current 包。
- 本次未寫入 D1、未部署 Worker、未執行 migration、未碰 production 或 secrets。

## 37. 營業時段文字置中與放大（2026-08-20，已部署 v2-test、待手機確認）

- 18:10 iPhone／LINE 實機截圖確認第二版已消除重疊，但原生時間文字仍貼近外框上緣且呈 iOS 藍色；週幾文字也需更清楚並置中。
- 週幾調整為 1rem，使用 `text-align` 與 `text-align-last` 水平置中；欄位仍維持 44px，不改四欄寬度。
- 開始／結束時間調整為 1rem 深色字，`::-webkit-date-and-time-value` 與 `::-webkit-datetime-edit` 使用 flex 水平／垂直置中並填滿固定外框。
- 業主端 CSS 快取更新為 `20260820004`；來源與 `docs/owner` 副本一致，針對性測試 24／24、完整測試 869／869 通過，`git diff --check` 通過。
- 部署前備份：`backups/v2-test-d1-20260820-before-owner-slots-centered-text-pages-deploy.sql`（323,283 bytes；SHA-256 `9bb8cba4367a3b1047bcd841d66814754e5b3ea8a2dac14d12b0bdc0a1c488d4`）。
- v2-test Pages：`f6ff57ed`；alias 已載入 CSS `20260820004` 與 JavaScript `20260820004`。線上 CSS SHA-256 與本機一致：`9a57e7a6ba608caccdfc5696fb8eeabe907f5b09a7faf94b8fb2565fb976e925`。
- 本次未寫入 D1、未部署 Worker、未執行 migration、未碰 production 或 secrets。
- current 安裝包維持撤下，待本次細節修正部署並經手機確認後才重建。

## 38. 客戶端已收訂金信任憑證（2026-08-20，已部署 v2-test）

- 問題：訂金確認後，客戶端原本只顯示一般「已確認」，未明確告知工作室是否已收到訂金，容易讓客戶對付款與時段保留狀態沒有安全感。
- 客戶「我的預約」卡片新增醒目的綠色信任提示，顯示「已收訂金 NT$ 金額」、「本次預約已保留」及訂金確認時間（台北時間）。只有 `confirmed` 且存在 `depositConfirmedAt` 的預約會顯示。
- LINE 成立通知改為明確告知「工作室已確認收到訂金：NT$ 金額」，並保留服務、預約日期、時間及「預約時段已為您保留」。
- 同步更新 `customer-ui` 來源與 `docs` Pages 副本；客戶 JavaScript 快取為 `20260820005`，CSS 快取為 `20260820006`。
- 新增客戶端顯示、實際載入版本化 CSS、LINE 通知與既有改期相容性測試；完整測試 873／873 通過，部署副本一致，`git diff --check` 通過。
- 部署前 D1 備份：`backups/v2-test-d1-20260820-202725-before-deposit-receipt-worker-pages-deploy.sql`（323,608 bytes；SHA-256 `93e1c5aba530c846876926733acd74edb7c38073e1b0e67908e05ab9e996a0ca`）。
- v2-test Worker：`8c4fe426-36d9-49db-a325-9f227529be91`；`/api/health` 為 `ok: true`、`dataBackend: d1`。
- v2-test Pages：`2ec3503f`；alias 已載入 `js/app.js?v=20260820005` 與 `css/style-20260726004.css?v=20260820006`。線上 JavaScript SHA-256 `05b38f9a11eba5be13a71a40a148161df5f926a82fb24af5774c4c23b0cefd9d`、CSS SHA-256 `5d88b90eec9b5f89441bbcf5109890b9c1bcb97557a9c425aab232d2f06a0753`，均與本機一致。
- 本次沒有寫入 D1、沒有執行 migration、沒有碰 production、v2-production、Demo v1、Notion、main 或 secrets。
- current 商品安裝包仍維持撤下；營業時段最新版尚待 iPhone／LINE 實機確認，不得交付封存的 buggy 安裝包。

## 39. 業主訂金狀態與客戶端空值競態修正（2026-08-20，已部署 v2-test）

- 客戶端問題：設定 API 尚未完成時若客人先切到「我的預約」，清單中又有待訂金案件，舊程式會直接讀取 `state.settings.bankAccount`，在 `state.settings` 為 `null` 時把內部英文錯誤顯示給客人。
- 客戶端修正：設定初始值及所有 API fallback 均使用空物件，預約渲染固定使用安全設定快照；即使設定與預約非同步抵達，也不會因銀行帳號空值中斷整份清單。Customer JS 快取更新為 `20260820006`。
- 業主端問題：資料庫與共用 booking DTO 已有 `depositConfirmedAt`，但業主 DTO 安全欄位子集漏傳，導致業主介面只能顯示一般「已確認」。
- 業主端修正：安全 DTO 加入非敏感 `depositConfirmedAt`，所有查詢仍帶 tenant scope；預約卡與客戶歷史依狀態顯示「待收訂金」、「待核對訂金＋末五碼」及「已收訂金＋金額＋確認時間」。已收案件右上狀態直接顯示「已收訂金」。Owner JS／CSS 快取更新為 `20260820005`。
- 新增設定空值、已收訂金 DTO 與業主介面回歸測試；完整測試 876／876 通過，來源與 Pages 副本一致，`git diff --check` 通過。
- 部署前備份：`backups/v2-test-d1-20260820-204317-before-owner-deposit-status-worker-pages-deploy.sql`（323,608 bytes；SHA-256 `93e1c5aba530c846876926733acd74edb7c38073e1b0e67908e05ab9e996a0ca`）。備份與上一份雜湊相同，兩次部署間沒有 D1 變動。
- v2-test Worker：`d4159bc8-5dd7-4009-bcf1-d5b5a8a183d6`；health 為 `ok: true`、`dataBackend: d1`。
- v2-test Pages：`74d177d4`；alias 已載入 Customer JS `20260820006`、Owner JS／CSS `20260820005`。
- 線上 SHA-256：Customer JS `d92e57078bbc1b4c2a03242e619946446b7280ce6300ab29b4958730ec3af998`、Owner JS `744d41aaf678bf35b6686280ecc5b0308a58348a332c202fb6ac8ade28167d39`、Owner CSS `c3c3c71c17adbaeffe479a81db59b3494dfd461c885cbe8fce787d707f513028`，均與本機一致。
- 本次沒有寫入 D1、沒有執行 migration、沒有碰 production、v2-production、Demo v1、Notion、main 或 secrets。
- current 商品安裝包仍維持撤下；營業時段最新版尚待 iPhone／LINE 實機確認，不得交付封存的 buggy 安裝包。

## 40. 服務尾款、免費補色與客戶月曆年月修正（2026-08-20，已部署 v2-test）

- 預約 DTO 增加預約建立當下的服務價格快照 `servicePrice`；客戶端與業主端顯示「服務費用 − 已收訂金 ＝ 到店應付」。
- 價格為 0 且服務名稱含「補色」時免收訂金，顯示「免費補色・免收訂金」及高雅的準時赴約／提前告知提醒。
- 客戶月曆年份與月份改成 `calendar-title-year`、`calendar-title-month` 兩個獨立元素；`009` 已部署為完整 `2026年　8月` 同一橫列置中。
- 完整測試 878／878 通過，來源與 Pages 副本一致，`git diff --check` 通過；最新客戶端 JS／CSS 為 `20260820009`，本輪未改動的 Owner JS／CSS 維持 `20260820008`。
- 部署前備份：`backups/v2-test-d1-20260820-211300-before-pages-20260820008-deploy.sql`（325,509 bytes；SHA-256 `03652318e545f0ccadcba3e7d40b1df75fae6e342a33ebce459ff8b4dbe02d18`）。
- v2-test Worker：`ac4d8fc5-daa4-47fd-9d36-e06565de2bf1`；最新 v2-test Pages：`e8ab06b6`。
- alias 的 `008` Customer JS／CSS、Owner JS／CSS 均與本機 SHA-256 完全一致；裸 `/` 曾短暫命中舊 `007` HTML，但無快取請求、帶 query 的入口及本次專屬部署已確認載入 `008`。仍須由使用者在 iPhone／LINE 實機重開確認，不宣稱手機驗收完成。
- 本輪未執行 migration 0030、未寫入遠端 D1、未碰 production；商品安裝包仍維持撤下。
- `009` 部署前備份：`backups/v2-test-d1-20260820-211900-before-pages-20260820009-deploy.sql`（325,509 bytes；SHA-256 `03652318e545f0ccadcba3e7d40b1df75fae6e342a33ebce459ff8b4dbe02d18`）。alias 裸首頁與無快取首頁均載入 Customer JS／CSS `20260820009`，兩個線上檔案與本機 SHA-256 完全一致。

## 41. 業主自訂下月預約開放日（2026-08-20，已部署 v2-test）

- 業主可在設定頁指定每月 1～28 日中的一天，作為「開放下個月預約」日期；預設為 15 日。
- 設定日前客戶只能預約本月；到達設定日後可預約本月與下個月；任何情況都不得再往後無限預約。
- 客戶月曆會停用超出上限的下一月按鈕；月份與單日空檔 API、最終建立預約 repository 均再次強制檢查，不能繞過前端。
- 最終建立預約會在任何 customer／booking 寫入前拒絕未開放月份，避免留下被拒案件的客戶資料。
- 設定使用既有 tenant-scoped `tenant_settings` 鍵值 `next_month_booking_open_day`，不需要 migration；每間業主 tenant 各自設定、互不影響。
- Customer 快取版號預備為 `20260820010`，Owner 快取版號預備為 `20260820009`；來源與 `docs` Pages 副本一致。
- 完整測試 883／883 通過；部署前備份 `backups/v2-test-d1-20260820-221121-before-booking-window-worker-pages-deploy.sql`（325,509 bytes；SHA-256 `03652318e545f0ccadcba3e7d40b1df75fae6e342a33ebce459ff8b4dbe02d18`）。
- v2-test Worker：`915905a9-368f-4f32-99a6-53422de783ae`；health 為 `ok: true`、`dataBackend: d1`。v2-test Pages：`32a201b8`。
- alias 已載入 Customer JS `20260820010`、Owner JS `20260820009` 與業主設定欄位；線上 Customer JS SHA-256 `fcf1fd7f6deb85ffa1cd66970aae9b6dfe7b833086364af7ed2e06cd7b073801`、Owner JS SHA-256 `f0ab5bcec140d7ad0d2419c59ae6b752bc95ec640d070933538e6701dff8d723`，均與本機一致。
- 本輪未寫遠端 D1、未執行 migration 0030、未碰 production、v2-production、Demo v1、Notion、main 或 secrets。

## 42. 指定日期整日不開放（2026-08-20，已部署 v2-test）

- 業主端「營業時段」新增指定日期休假，可選擇例如 `2026-09-17` 並設為整日不開放，也可按「恢復開放」回到每週固定營業時段。
- 使用既有 migration 0003 的 `staff_schedules.schedule_type='date_override'`，不新增 migration；所有讀寫均限制 tenant／location／staff 與精確日期。
- 客戶月份月曆將休假日標記為 `date_closed`、單日時段直接回傳不開放；最終建立預約仍在任何客戶或預約寫入前再次拒絕，不能繞過前端。
- 設為休假不會自動取消既有預約，介面明確提醒業主先確認並自行聯絡客人。
- Owner API 快取版號為 `20260820010`，Owner App 為 `20260820011`（避免 alias 命中先前同名快取）；來源與 `docs/owner` 副本一致。完整測試 887／887、部署修正版針對測試 31／31 通過，`git diff --check` 通過。
- 部署前備份：`backups/v2-test-d1-20260820-223222-before-date-closure-worker-pages-deploy.sql`（326,153 bytes；SHA-256 `2c4661be0d9c4d6019e49bb0191f9d2e890b8ad493bda50b4abbc52c13e9d73d`）。
- v2-test Worker：`bbe39b8c-8552-4d59-beef-f46b65ba7567`；health 為 `ok: true`、`dataBackend: d1`。最終 v2-test Pages：`e5122297`。
- alias 已載入休假日期欄位、Owner API `20260820010` 與 Owner App `20260820011`；線上 Owner App SHA-256 `0f37ee5fdc646ca3f1cb659dadc14d14410eb7a4a6e6f7f10695fb12cade6066` 與本機一致，新 API 未登入回 401。
- 本輪部署本身未寫遠端 D1、未執行 migration 0030、未碰 production、v2-production、Demo v1、Notion、main 或 secrets。

## 43. iPhone／LINE 全站日期欄位防溢出（2026-08-20，本機完成、待部署授權）

- 第一張實機截圖顯示 iOS 原生 `date`／`month` 控制項保留過大的最小寬度，超出業主端營業時段面板右側；後續客戶端生日欄位也出現同一類問題，證明只修單一區塊不足。
- 根因是 iOS／LINE WebView 的原生日期控制項具有自己的 intrinsic minimum width，會忽略一般表單容器的縮排期待；過去個別 selector 修正沒有覆蓋所有日期欄位。
- 客戶端改為全站 `input`／`select`／`textarea` 共用可縮寬度規則，並對 `date`／`month`／`time` 與 WebKit 內部日期值統一套用 `appearance: none`、`min-width: 0`、`max-width: 100%`、`inline-size: 100%` 與 `box-sizing: border-box`；基本資料卡同時限制容器溢出。
- 業主端 `date`／`month` 同步採全站規則；既有營業時段 `time` 固定外框維持原設計，避免回歸先前已修正的時間欄位問題。
- 初次 Pages 上傳後的線上核對發現：客戶首頁仍指向舊的版本化實體 CSS，業主端則重用了既有 `20260820011` URL 而命中舊邊緣快取；因此未將首次上傳誤報為修正完成。
- 客戶與業主均改為直接載入最新 `style.css`，並使用全新的 CSS 快取版號 `20260820012`；來源與 Pages 副本完全一致。新增生日、全域日期控制項及實際 CSS 入口回歸測試，完整測試 889／889 通過，`git diff --check` 通過。
- 部署前備份：`backups/v2-test-d1-20260820-224300-before-global-ios-date-overflow-pages-deploy.sql`（328,477 bytes；SHA-256 `cef01eb4515fe5017dcd1d34cc5850afec30238c0e21b14458719cccc32c60d3`）。
- 最終 v2-test Pages：`95f7f132`。alias 已載入客戶端與業主端 CSS `20260820012`；線上 Customer CSS SHA-256 `c02798921952022d17bdac37d896edab0a0da56cb006b4af460c898dc54c498a`、Owner CSS SHA-256 `6f748a48c78d2fad4d37c4979b2d0dc2cf833dca3ffe371cab2dd6bd5504207c`，均與本機完全一致。
- 本輪未寫遠端 D1、未執行 migration 0030、未碰 production、v2-production、Demo v1、Notion、main 或 secrets；仍須由使用者在 iPhone／LINE 實機確認生日與休假欄位，不先宣稱手機驗收完成。

## 44. 業主休假日期紀錄列對齊（2026-08-20，本機完成、待部署授權）

- iPhone／LINE 實機截圖確認日期欄位已不再溢出，但休假紀錄原本依文字自然寬度排列，造成不同日期列的「恢復開放」按鈕水平位置不一致。
- 每張休假紀錄卡改為固定兩欄 grid：左欄 `minmax(0, 1fr)` 承載日期與狀態，右欄固定 108px；按鈕固定寬度、取消行內 margin 並靠同一欄對齊。
- 後續實機回報也指出空白「休假日期」與已有值的「查看月份」原生高度不同；兩個控制項現統一固定為 56px 高度、相同水平內距與垂直置中，不再由 iOS 原生控制項自行決定高度。
- Owner CSS 快取為 `20260820014`、Owner App 為 `20260820013`；App 原預備版號 `20260820012` 在線上核對時發現曾被既有內容占用，因此立即改用全新版本，不能把只更新 CSS 的第一次上傳當作完成。來源與 Pages 副本一致，針對測試與完整測試均通過，完整結果 889／889，`git diff --check` 通過。
- 部署前備份：`backups/v2-test-d1-20260820-230300-before-closed-date-alignment-pages-deploy.sql`（328,477 bytes；SHA-256 `cef01eb4515fe5017dcd1d34cc5850afec30238c0e21b14458719cccc32c60d3`，與上一份一致，部署間 D1 無變動）。
- 最終 v2-test Pages：`4ed56796`。alias 已載入 Owner CSS `20260820014` 與 Owner App `20260820013`；線上 CSS SHA-256 `33d976bdf5e2ff4ed3f42590abe851e6c954102e2a89e4ddd64ad8e6dfc58c36`、App SHA-256 `8215a468bdb2be8be5da0081819add60fcf8b265cb2fcebbea54bc289cfcaa3a`，均與本機完全一致。
- 本輪未寫遠端 D1、未執行 migration 0030、未碰 production、v2-production、Demo v1、Notion、main 或 secrets；仍須使用者在 iPhone／LINE 實機確認，不先宣稱手機驗收完成。

## 45. 明日正式成立預約 LINE 提醒（2026-08-21，本機完成、尚未部署）

- 既有 `*/5` 排程只在台北時間每天 12:20 執行「今天查明天」並建立新提醒：只選 `bookings.status='confirmed'` 且已存在 tenant-scoped `line_accounts` 的客戶；其他輪次只保留既有失敗通知的安全重試，不建立新提醒。
- 待審核、待訂金、取消、過期及所有非正式成立狀態不建立通知；未綁 LINE 也不建立。
- 通知寫入既有 `notifications`，template 為 `booking_tomorrow_reminder`，內容包含明日日期、時間與服務項目。
- 每筆通知使用 deterministic primary key `booking-tomorrow-reminder:<bookingId>` 與 `INSERT OR IGNORE`，同一預約即使排程重跑也只建立一次，不需 migration。
- LINE token 路由改為嚴格 tenant 匹配：標準、旗艦及預設 tenant 各用自己的 OA；未知 tenant 不再回退共用 token，也不進入發送佇列。
- 派送前會再次核對預約仍為 confirmed 且仍屬台北明日；建立後取消，或失敗重試已跨到非明日區間時，通知改為 `cancelled` 且清除失敗欄位，不傳送過時提醒。
- LINE 網路或 provider 失敗仍沿用既有通知失敗紀錄、五分鐘重試門檻與原子發送租約。
- 新增 3 項整合測試；針對測試 3／3、完整回歸 892／892 通過。
- 本輪沒有部署 Worker、沒有寫遠端 D1、沒有執行 migration、沒有碰 production。部署需要新的當次明確授權，並先備份 v2-test D1。

## 46. 新工作室全方位／霧眉／霧唇評估開通（2026-08-21，已部署 v2-test）

- 平台建立旗艦工作室時，「新客評估類型」新增並預設為「全方位紋繡評估（依服務項目自動套用）」，同時保留可單獨指定「霧眉新客評估」或「霧唇新客評估」。
- 全方位模式不混合不同技術題目；客戶選定服務後，後端依該服務的 `assessmentTemplateCode` 套用相符問卷。
- 修正新 tenant 只有評估設定、卻沒有實際題庫資料的漏洞：建立工作室的同一個原子 batch 會初始化霧眉、霧唇、眼線、眼下、眉部淡化及唇部淡化六套題庫，不需新增 migration。
- 平台既有工作室的評估指定選單同步支援全方位模式；標準版仍不啟用評估，美甲／美睫免評估規則不變。
- 無 serviceId 的全方位查詢只回傳「依服務項目套用評估」路由狀態，不再錯誤假定為霧眉；實際預約仍須先選服務。
- 平台靜態來源與 Pages 副本同步，平台 JS 快取版號更新為 `20260821001`。
- 針對測試 44／44、完整回歸 893／893 通過，`git diff --check` 通過。
- 部署前備份：`backups/v2-test-d1-20260821-223308-before-platform-assessment-worker-pages-deploy.sql`（327,583 bytes；SHA-256 `3d9d8fbad2725f0abae98bc44ead6750f7f420e15f8510a7930801b169a0834f`）。
- v2-test Worker：`acd62e39-69c4-40fa-8e23-40bf41523830`；`/api/health` 為 `ok: true`、`dataBackend: d1`。v2-test Pages：`526a2cd3`。
- alias 已載入平台 JS `20260821001`，線上 HTML 可見全方位、霧眉及霧唇三種選項，線上 JS 可見 `all_supported` 分流與不混用題目的說明。
- 本輪部署沒有寫入遠端 D1、沒有執行 migration、沒有碰 production、v2-production、Demo v1、Notion、main 或 secrets。

## 47. 新業主尚未建立服務時顯示評估題庫（2026-08-22，已部署 v2-test）

- 根因：業主題庫清單只從 `services` 取得已指定題庫；新 tenant 尚未建立服務，因此即使平台設定為 `all_supported`，仍得到空清單。
- 修正：題庫清單同時讀取 tenant-scoped `assessment_template_code`；`all_supported` 載入六套題庫，單一霧眉／霧唇方案至少載入指定題庫，並沿用既有安全機制補齊缺少的 `assessment_questions`。
- 新增回歸測試；針對測試 37／37、完整測試 894／894 通過，`git diff --check` 通過。
- 部署前備份：`backups/v2-test-d1-20260822-004525-before-assessment-question-bank-worker-deploy.sql`（340,932 bytes；SHA-256 `71c03596b7e2ec9c04831affadb49457623942d691b823141c5090068be08bb0`）。
- v2-test Worker：`9d5ccc54-6862-43e0-8f50-4fe054ef40e2`；health 已確認為 D1。未寫入遠端 D1、未部署 Pages、未碰 production。

## 48. 依服務週期一鍵再次預約（2026-08-22，已部署 v2-test）

- 沿用既有標準方案服務完成回訪通知，不新增 migration；每項服務可在 `services.settings_json.followUpDays` 設定 0～365 天，預設 21 天，0 表示停用。
- 回訪起算點為該服務完成日；只對完成狀態、已綁定 LINE 的客戶建立 tenant-scoped 通知，並使用預約 tenant 所屬 OA 發送。
- 派送前會再次檢查同一 tenant、同一客戶是否已有日期較晚且包含同一服務的有效預約；已有預約即取消尚未送出的回訪通知。
- 店面設定新增 tenant-scoped `customer_booking_url`。設定 HTTPS 客戶 LIFF 網址後，通知會附上帶 `serviceId` 的再次預約連結；客戶端開啟後自動選定原服務。
- 業主端新增每項服務回訪週期及客戶端 LIFF 網址設定；來源與 Pages 副本同步，App 快取版號為 `20260822001`。
- 新增回訪週期、網址安全、同服務排除與客戶端深連結測試；針對測試 183／183、完整回歸 900／900 通過，`git diff --check` 通過。
- 營業時段儲存按鈕同步補上 dirty-state：載入及儲存成功後停用變暗；週幾／時間異動、新增或刪除後才啟用；失敗時保持可重試。Owner App 快取更新為 `20260822002`，完整回歸 902／902 通過。
- 部署前備份：`backups/v2-test-d1-20260822-014859-before-service-cycle-worker-pages-deploy.sql`（344,022 bytes；SHA-256 `fb45cfa538576ccd698e53d97fbfa2482f4b69f7d178751c8a981e0bb62662a6`）。
- v2-test Worker：`ec8753dd-d687-4d11-b736-a12f3d9b743b`。v2-test Pages：`5c3ef04d`；alias 為 `https://v2-test.juliet-studio.pages.dev`。
- `/api/health` 已確認 `ok:true`、`dataBackend:d1`。線上 Owner App `20260822002`、Customer App `20260822001`、Owner CSS `20260822001` 均與本機 SHA-256 完全一致。
- 本輪沒有寫入遠端 D1、沒有執行 migration 0030、沒有碰 production、v2-production、Demo v1、Notion、main 或 secrets。

## 49. 評估題庫單題編輯體驗（2026-08-22，已部署 v2-test）

- 原問題：所有可編輯題目載入後直接攤開，「可編輯」只是狀態標籤，「儲存此題」沒有 dirty-state，手機頁面過長且難以確認是否真的有修改。
- 可編輯題現在預設只顯示題目與選項摘要；按「編輯題目」才展開，且同一時間只突出一題。
- 「儲存修改」初始停用，題目或選項有實際變更後才啟用；儲存中鎖定，成功後更新摘要並自動收合，失敗則保留編輯內容供重試。
- 「取消編輯」會還原尚未儲存的內容；系統鎖定題仍只讀且完全沒有編輯入口。
- 手機版取消／儲存按鈕固定等寬、至少 48px 高，題目與選項不溢出卡片。
- Owner App 快取準備為 `20260822003`、Owner CSS 為 `20260822002`；針對測試 45／45、完整回歸 904／904 通過，`git diff --check` 通過。
- 部署前備份：`backups/v2-test-d1-20260822-before-assessment-question-editor-pages-deploy.sql`（410,126 bytes；SHA-256 `0a11ef18b1db9657ee3ba8fe6477e1e958aeb44f538c3f8e9354ad8ff1d11ba1`）。
- v2-test Pages：`a224d1ac`；alias 已載入 Owner App `20260822003` 與 Owner CSS `20260822002`，兩個線上檔案與本機 SHA-256 完全一致。
- 本輪未部署 Worker、未寫入 D1、未執行 migration 0030、未碰 production。

## 50. 平台工作室統計格改為可操作篩選（2026-08-22，已部署 v2-test）

- 原問題：工作室清單上方「待開通、試用中、正式租用、即將到期」只是 `div` 統計資訊，外觀看似按鈕但沒有任何點擊功能。
- 四個統計格改為真正的按鈕，分別套用精確狀態篩選；再次點擊同一格會回到全部工作室。
- 被選取的統計格會顯示深色狀態，並同步下方狀態分頁的選取狀態與無障礙屬性。
- Platform JS／CSS 快取準備為 `20260822001`；平台前端針對測試 9／9、完整回歸 904／904 通過，靜態副本一致，`git diff --check` 通過。
- 部署前備份：`backups/v2-test-d1-20260822-before-platform-summary-filter-pages-deploy.sql`（410,126 bytes；SHA-256 `8c1ca7607573ff64060402f8ead6f748b207080e34f94caae4f605f1f9f88850`）。
- v2-test Pages：`f1020dc3`；alias 已載入 Platform JS／CSS `20260822001`，兩個線上檔案與本機 SHA-256 完全一致。
- 本輪未部署 Worker、未寫入 D1、未執行 migration 0030、未碰 production。

## 51. 一般業主專屬客戶入口與 tenant 安全分流（2026-08-22，已部署 v2-test）

- 新建立工作室會在既有 `tenant_settings` 寫入 64 位不可猜測的 `customer_entry_key`，不需 migration；平台清單只在已驗證的平台管理 API 回傳此代碼。
- 平台工作室卡片新增「專屬客戶入口」：新工作室直接顯示，既有工作室可由平台本人按「建立客戶入口」補建，之後入口固定且可複製，不會因重新整理而改變。
- Pages 支援 `/studio/{64位入口代碼}/` 並直接回傳客戶端，不增加跳轉；客戶端每個 API request 只帶 `X-Beauty-Studio-Entry`，不帶 tenant ID。
- Worker 只接受 64 位十六進位入口代碼，查 `tenant_settings` 並確認 active／trial tenant、default active location 與 active owner staff 後，才覆寫 `TENANT_ID`、`LOCATION_ID`、`STAFF_ID`；錯誤、未知或 tenant ID 偽造一律 fail closed。
- 客戶取得的服務、時段、設定、評估、客戶身分與預約寫入因此全部沿用既有 repository 的 tenant scope，不會跨工作室。
- Customer Config／API、Owner Config／API 快取準備為 `20260822001`；Platform JS／CSS 為 `20260822002`。新增客戶入口安全測試，完整回歸 910／910 通過，靜態副本一致，`git diff --check` 通過。
- 部署前備份：`backups/v2-test-d1-20260822-before-tenant-customer-entry-worker-pages-deploy.sql`（410,126 bytes；SHA-256 `8c1ca7607573ff64060402f8ead6f748b207080e34f94caae4f605f1f9f88850`）。
- v2-test Worker：`b172f2b4-5819-49ff-a774-44677724822e`；Pages：`16fd6f28`。health 為 `ok: true`、`dataBackend: d1`；`/studio/{64位代碼}/` 回傳客戶端，未知代碼 API fail closed 為 404。
- Customer Config／API、Owner Config／API、Platform JS／CSS 六個線上檔案均與本機 SHA-256 完全一致。本輪未寫入遠端 D1、未執行 migration 0030、未碰 production。
- 既有測試工作室尚未自動補建入口；第一次由平台本人按「建立客戶入口」會寫入一筆 tenant setting 與 audit log，須由使用者操作或另行取得當次明確 D1 寫入授權。

## 52. 客戶端標題同步業主店名（2026-08-22，已部署 v2-test）

- 修正客戶端固定產品展示標題優先於 tenant 店名的問題；載入設定後，頁面主標題改以業主端 `brandName` 為準。
- LINE／瀏覽器頁面標題同步為「`brandName`｜線上預約」；若 tenant 尚未設定店名，才回退既有產品標題或「工作室」。
- Customer App 快取更新為 `20260822002`；完整回歸 911／911 通過，Customer UI 與 Pages 靜態副本一致，`git diff --check` 通過。
- 部署前備份：`backups/v2-test-d1-20260822-before-tenant-brand-title-pages-deploy.sql`（410,964 bytes；SHA-256 `cdd9a96efab1dc07c766a4587fb9feb49443356c03d128e421f67b29d7d61868`）。
- v2-test Pages：`a2d7a25f`；alias 與 `/studio/{64位代碼}/` 均載入 Customer App `20260822002`，線上 SHA-256 `ca3b1d6bd14133bc0e02c651888ddec3a90acca92f762f08cd74cbb1f3818276` 與本機一致；API health 正常。
- 本輪未部署 Worker、未寫入遠端 D1、未執行 migration 0030、未碰 production。

## 53. 業主認領連結自動使用 tenant 專屬客戶入口（2026-08-22，已部署 v2-test）

- 根因：業主端建立客戶 LINE 認領邀請時仍取用共用 `CUSTOMER_APP_URL`，客戶因此進入平台預設 tenant；先前只修正標題渲染，沒有修正錯誤入口來源。
- `GET /api/owner/settings` 現在只向已驗證業主回傳目前 tenant 的有效 `customer_entry_key`；業主端據此產生 `/studio/{customer_entry_key}/#claim=...`，不再使用共用客戶網址。
- 新工作室 provisioning 原本就會自動建立 `customer_entry_key`，因此往後新業主不需逐一手動設定；共用 v2-test 根入口改為 fail closed，要求使用工作室專屬連結，避免再次誤載平台店名或跨 tenant。
- 完整回歸 912／912 通過，靜態副本一致，`git diff --check` 通過。
- 部署前備份：`backups/v2-test-d1-20260822-before-auto-tenant-customer-entry-worker-pages-line-oa.sql`（410,964 bytes；SHA-256 `cdd9a96efab1dc07c766a4587fb9feb49443356c03d128e421f67b29d7d61868`）。
- v2-test Worker：`547c1873-6903-48ff-b755-9bc2f538b143`；Pages：`ebe928ee`。health 為 `ok:true`、`dataBackend:d1`；線上 Owner App `20260822004`、Customer App `20260822003` 已驗證。
- 未寫入遠端 D1、未執行 migration 0030、未碰 production。因已登入 OA 的現有 rich menu 未找到可安全確認為本功能來源的客戶入口按鈕，本輪沒有猜測修改 OA。

## 54. LINE LIFF 登入保留 tenant 專屬路徑（2026-08-22，已部署 v2-test）

- 實機根因：客戶確實開啟 `/studio/{customer_entry_key}/`，但 LINE LIFF 首次登入／重新驗證後回到 Endpoint 根入口，專屬路徑遺失，因而觸發共用入口 fail closed。
- Customer Config 現在會從 LINE `liff.state` 還原合法的 64 位專屬工作室路徑，並以本次 session 作登入往返備援；LIFF 驗證成功後立即清除暫存與 OAuth 跳轉痕跡。
- Config 快取為 `20260822002`、LIFF Init 為 `20260822001`；完整回歸 913／913 通過，靜態副本一致，`git diff --check` 通過。
- 部署前備份：`backups/v2-test-d1-20260822-before-liff-studio-path-recovery-pages-deploy.sql`（417,390 bytes；SHA-256 `e98d54b7f734c000f95cc9b040eb771fe226556db9a46738920c375541207769`）。
- v2-test Pages：`7f34048c`；alias 已驗證載入上述版本及路徑還原程式。
- 未部署 Worker、未寫入遠端 D1、未執行 migration 0030、未碰 production。

## 55. 專屬客戶入口改用 LIFF 永久網址（2026-08-22，已部署 v2-test）

- 實機確認第 54 節部署仍無效：客戶從平台提供的 Pages 專屬網址進入後，LINE LIFF 仍回到 Endpoint 根入口，畫面顯示「請從工作室提供的專屬預約連結進入」。
- 最終根因：平台與業主端輸出的仍是 `https://v2-test.juliet-studio.pages.dev/studio/{key}/`；這不是帶附加路徑的 LIFF 永久網址，LINE 無法保證將 tenant 路徑跨登入帶回。
- 依 LINE 官方規則，正確入口改為 `https://liff.line.me/{LIFF_ID}/studio/{key}/`。平台「複製客戶入口」與業主建立客戶認領連結都改用 `BEAUTY_CONFIG.CUSTOMER_LIFF_URL`。
- 撤除第 54 節在 `liff.init()` 前讀取／改寫 `liff.state` 的錯誤補丁；LINE 官方明確要求 `liff.*` 參數在 `liff.init()` 完成前不可修改。
- 準備快取版本：Customer Config `20260822003`、Owner App `20260822005`、Platform JS `20260822003`。完整回歸 913／913 通過，三組靜態副本一致，`git diff --check` 通過。
- 已與第 56 節一併部署；部署紀錄與備份資訊記載於第 56 節。
- 部署後必須由平台管理中心重新複製新 LIFF 入口；先前複製的 Pages 網址不可繼續作為 LINE 客戶入口。

## 56. 客戶端標頭完全等同業主設定店名（2026-08-22，已部署 v2-test）

- 頁面大標題原本已使用業主端 `brandName`，但 LINE／瀏覽器頂端仍自行附加「｜線上預約」，因此兩處文字不完全一致。
- 客戶端載入 tenant 設定後，頁面大標題及 `document.title` 現在都只使用同一個 `brandName`，不再附加固定產品文字。
- Customer App 快取更新為 `20260822004`；Customer UI 與 Pages 靜態副本一致，完整回歸 914／914 通過，`git diff --check` 通過。
- 部署前備份：`backups/v2-test-d1-20260822-151512-before-liff-brand-title-pages-deploy.sql`（417,390 bytes；SHA-256 `e98d54b7f734c000f95cc9b040eb771fe226556db9a46738920c375541207769`）。
- v2-test Pages：`77867517`；alias 為 `https://v2-test.juliet-studio.pages.dev`。alias 已載入 Customer App `20260822004`，線上檔案與本機 SHA-256 `f685e20807583233528ba7d90a517187491bcbec45e252187e53de79713062a2` 完全一致。
- 平台端同步載入 Platform JS `20260822004`，LIFF 專屬入口程式的線上與本機 SHA-256 `7bb20a4ead836de87b77bda307717c05376a8f59c5cf85bebd600705acca5167` 完全一致。
- 本輪未部署 Worker、未寫入遠端 D1、未執行 migration 0030、未碰 production。

## 57. LIFF 初始化後從 pathname 恢復 tenant 專屬入口（2026-08-22，已部署 v2-test，待 LINE 實機驗收）

- 第 56 節部署後實機仍落入共用入口的 fail-closed 畫面，LINE 頂端因此維持靜態 `Juliet Studio OS | Booking`，業主店名無法載入；第 56 節僅完成線上檔案驗證，未完成實機驗證即回報完成，屬驗收不足。
- 確定缺口：LINE 官方規則是 `liff.init()` 完成後，LIFF URL 的附加路徑會還原至 `location.pathname`；現有備援只讀 `studio_entry` 與 `liff.state`，漏讀 `/studio/{64位代碼}/` pathname。
- 客戶 LIFF 現在於 init 完成後優先從 pathname 取得 tenant 入口，query／`liff.state` 僅作舊版備援；初始化完成前仍不改寫網址，也不以共用入口猜測 tenant。
- Customer LIFF Init 快取準備為 `20260822003`；完整回歸 914／914 通過，靜態副本一致，`git diff --check` 通過。
- 部署前備份：`backups/v2-test-d1-20260822-163051-before-liff-pathname-recovery-pages-deploy.sql`（417,390 bytes；SHA-256 `e98d54b7f734c000f95cc9b040eb771fe226556db9a46738920c375541207769`）。
- v2-test Pages：`fdfbb64a`；alias 已載入 Customer LIFF Init `20260822003`，線上與本機 SHA-256 `ef34e831edd9b800079227dc221a4db8ff79c1ae50f6c33bb951f265ca76cd26` 完全一致。
- 本輪未部署 Worker、未寫入遠端 D1、未執行 migration 0030、未碰 production。
- **尚待 LINE 實機驗收**：必須從平台重新複製的 LIFF 專屬入口開啟，確認不再顯示共用入口警告且標題為業主設定店名；未收到實機結果前不得宣稱完全修復。

## 58. 補建既有霧眉／霧唇測試 tenant 專屬入口（2026-08-22，已完成 v2-test D1）

- 連續實機失敗的資料根因已由唯讀查詢確認：`霧眉｜霧唇💋｜預約平台` 原本沒有任何 `customer_entry_key`，因此即使 LIFF 路徑程式已修正，也沒有 tenant 入口代碼可供分流。
- 不刪除或重建測試 tenant；經使用者當次明確授權，為該 active tenant 新增一筆 64 位十六進位 `customer_entry_key`，並新增一筆 `platform_customer_entry_created` 稽核紀錄。入口值全程未輸出。
- 寫入前備份：`backups/v2-test-d1-20260822-171524-before-brow-lip-customer-entry-repair.sql`（417,390 bytes；SHA-256 `e98d54b7f734c000f95cc9b040eb771fe226556db9a46738920c375541207769`）。
- 寫入後唯讀驗證：入口 1 筆、長度 64、格式正確、稽核 1 筆；以該入口呼叫 v2-test `/api/settings` 回 HTTP 200，`brandName` 正確為 `霧眉｜霧唇💋｜預約平台`。
- 權限考量：一般業主端沒有「建立客戶入口」功能；平台 API 會再次驗證平台本人。新 tenant provisioning 已自動建立入口；平台「建立客戶入口」只供缺資料的舊 tenant 一次性補建，完成後自動改為「複製客戶入口」，不建議完全移除。
- 下一步：平台本人重新登入並重新整理平台管理中心，於該工作室管理區複製新 LIFF 專屬入口，私下交付並完成 LINE 實機驗收。未部署 Worker／Pages、未執行 migration 0030、未碰 production。

## 59. 更正實機標題問題的目標 tenant（2026-08-22，唯讀確認）

- 使用者更正：目前客戶端標題無法同步的對象不是第 58 節的 `霧眉｜霧唇💋｜預約平台`，而是業主 `朱麗葉測試員` 的 `朱麗葉紋繡個人工作室`。
- 唯讀 D1 核對：正確 tenant 狀態為 trial，`tenant.name` 與 `brand_name` 都是 `朱麗葉紋繡個人工作室`，已有一筆長度 64 的 `customer_entry_key`。
- 以該 tenant 的入口在記憶體中呼叫 v2-test `/api/settings`，回 HTTP 200，`brandName` 正確為 `朱麗葉紋繡個人工作室`；入口值全程未輸出。
- 結論：正確 tenant 的資料、入口與客戶 API 店名同步皆正常；實機仍顯示固定產品標題，代表手機實際開啟的不是該 tenant 專屬入口，或使用了先前複製的其他 tenant／Pages 根網址。
- 下一步只能從平台管理中心的 `朱麗葉紋繡個人工作室` 卡片重新複製其專屬 LIFF 入口，再由 LINE 實機驗證。此輪未再寫 D1、未部署、未碰 production。

## 60. 修正專屬客戶 LIFF Endpoint（2026-08-22，LINE 後台已更新，待 tenant 實機驗收）

- 實機顯示 `Invalid LIFF ID`，證明失敗發生在 tenant 設定載入前，與 `朱麗葉紋繡個人工作室` 的店名或入口資料無關。
- 根因：專屬入口使用的 v2-test 客戶 LIFF Endpoint 仍指向 `/flagship/customer`，但平台產生的入口附加路徑是 `/studio/{customer_entry_key}/`；LINE 合併 Endpoint 與附加路徑後無法在正確入口初始化。
- 經使用者當次明確授權，已將該 LIFF Endpoint 從 `https://v2-test.juliet-studio.pages.dev/flagship/customer` 改為 `https://v2-test.juliet-studio.pages.dev/`。
- 使用不含真實 tenant 資料的 64 位測試路徑驗證：同一 LIFF ID 已正常進入 LINE OAuth 登入，回傳網址為 v2-test 根路徑，不再回傳 `Invalid LIFF ID`。
- 本輪沒有程式碼變更，因此沒有重複部署 Pages／Worker；未寫入 D1、未執行 migration 0030、未碰 production。
- **尚待 tenant 實機驗收**：手機完全關閉舊頁後，重新由平台複製 `朱麗葉紋繡個人工作室` 的專屬客戶入口開啟，確認頁面及 LINE 頂端標題均載入該業主店名。

## 61. 客戶生日欄位與姓名／電話等高（2026-08-22，已部署 v2-test Pages）

- LINE Android 內建瀏覽器將空白原生日期控制項壓縮成細長格，與姓名、電話欄位高度不一致。
- 客戶基本資料表單的生日欄位固定為 52px，並將原生日期編輯內容垂直置中；姓名、電話欄位及其他日期欄位不受影響。
- Customer CSS 快取更新為 `20260822001`；前端設定測試 20／20 通過、靜態副本一致、`git diff --check` 通過。
- 部署前備份：`backups/v2-test-d1-20260822-180309-before-customer-birthday-field-pages-deploy.sql`（418,247 bytes；SHA-256 `4fd1444d95298bd8c374ea454bdbd75e4137bf32ee92edbac6b467228c0bc9a6`）。
- v2-test Pages：`9efee809`；alias 已驗證載入 CSS `20260822001` 與 52px 日期欄位規則。
- 未部署 Worker、未寫入遠端 D1、未執行 migration 0030、未碰 production。

## 62. CSV 範本手機下載與訂金戶名隱私（2026-08-22，已部署 v2-test）

- LINE／Android 內建瀏覽器不一定支援 HTML `download`，造成「下載 CSV 範本」按鈕沒有反應；現在優先以 Web Share 提供檔案分享／儲存，不支援時使用 Blob 下載，再失敗則交由外部瀏覽器開啟範本。
- 訂金戶名改為選填：業主使用個人帳戶且不希望公開姓名時可留空；空白戶名不會出現在客戶通知，轉帳帳號與訂金金額仍為必填。
- Owner App 快取更新為 `20260822007`；相關測試 180／180 通過、Owner 靜態副本一致、`git diff --check` 通過。
- 部署前備份：`backups/v2-test-d1-20260822-182652-before-csv-download-optional-account-name-worker-pages-deploy.sql`（419,023 bytes；SHA-256 `25998e5963150165c8aa8350f0d0ec636d4c530f8bf772e6a6cfe9d88eeb1822`）。
- v2-test Worker：`cc21961b-0b2b-46fa-b302-6de53b8b7309`；`/api/health` 已確認 `ok:true`、`dataBackend:d1`。
- v2-test Pages：`56b1bd0d`；alias 已確認載入 Owner App `20260822007`、戶名選填文字與手機下載程式。
- 未寫入遠端 D1、未執行 migration 0030、未碰 production。

## 63. CSV 範本下載第二版（2026-08-22，已部署 v2-test Pages）

- 第 62 節版本在 click 後先等待 `fetch()`，LINE／Android 內建瀏覽器可能於等待期間撤銷使用者手勢權限，導致分享、下載或開新視窗仍無反應。
- 第二版不再等待網路：LINE 內直接同步交由外部瀏覽器開啟靜態範本；一般瀏覽器則使用內建 UTF-8 BOM CSV 內容即時建立 Blob 並下載。
- Owner App 快取更新為 `20260822008`；相關測試 26／26 通過、Owner 靜態副本一致、`git diff --check` 通過。
- 部署前備份：`backups/v2-test-d1-20260822-183530-before-csv-download-v2-pages-deploy.sql`（419,018 bytes；SHA-256 `1e8232588043599476db9b298c841a264224f105c4a9cbcb8bbafa30ec877e76`）。
- v2-test Pages：`3fda43f3`；alias 已確認載入 Owner App `20260822008`，下載 handler 為同步函式且包含內建 CSV Blob。
- 未部署 Worker、未寫入遠端 D1、未執行 migration 0030、未碰 production。

## 64. CSV 範本改用正確公開路徑（2026-08-22，已部署 v2-test Pages）

- 第二版以目前 `/owner/hub/` 網址解析相對路徑，錯誤產生 `/owner/hub/customer-import-template-v2.csv`；不存在的路徑回到業主 LIFF 應用，因而出現與下載無關的 LINE 認證頁。
- 範本現在固定使用公開靜態路徑 `/owner/customer-import-template-v2.csv`；下載不需 LINE 姓名、頭像或識別碼授權。
- Owner App 快取更新為 `20260822009`；相關測試 26／26 通過、Owner 靜態副本一致、`git diff --check` 通過。
- 部署前備份：`backups/v2-test-d1-20260822-184608-before-csv-public-path-pages-deploy.sql`（419,018 bytes；SHA-256 `1e8232588043599476db9b298c841a264224f105c4a9cbcb8bbafa30ec877e76`）。
- v2-test Pages：`f1caf5bb`；alias 已確認 Owner App `20260822009`，公開 CSV 回 HTTP 200 且 `content-type: text/csv`。
- 未部署 Worker、未寫入遠端 D1、未執行 migration 0030、未碰 production。

## 65. CSV 電話保留開頭 0（2026-08-22，已部署 v2-test）

- CSV 沒有試算表欄位格式，Google Sheets 會將一般電話數字當成數值，自動刪除開頭 `0`。
- 範本與內建下載內容改用 `="0912345678"` 的試算表文字格式；匯入後端只解開完整包住純電話數字的此固定格式，其他公式仍視為非法字元拒絕。
- Owner App 快取更新為 `20260822010`；匯入 API、正規化與 Owner UI 合計 98／98 測試通過，靜態副本一致、`git diff --check` 通過。
- 部署前備份：`backups/v2-test-d1-20260822-190811-before-csv-phone-leading-zero-worker-pages-deploy.sql`（419,018 bytes；SHA-256 `1e8232588043599476db9b298c841a264224f105c4a9cbcb8bbafa30ec877e76`）。
- v2-test Worker：`01aa9978-1a57-466f-9f36-d22390917c73`；`/api/health` 已確認 `ok:true`、`dataBackend:d1`。
- v2-test Pages：`2f7740f9`；alias 線上 CSV 已確認 HTTP 200、`text/csv`，並實際包含 `="0912345678"` 與 `="0987654321"`。
- 未寫入遠端 D1、未執行 migration 0030、未碰 production。

## 66. CSV 電話與 Google Drive 上傳相容（2026-08-22，已部署 v2-test Pages）

- 部分手機版 Google 試算表仍會將 `="0912345678"` 轉換為數值；範本改用 `0912-345-678`，確保開頭 `0` 可見，匯入時再正規化為 `0912345678`。
- Android／Google Drive 可能回傳無 `.csv` 副檔名或通用 MIME 的雲端檔；前端不再於讀取前只用檔名擋下，改為讀取內容後由 CSV 標頭與後端規則驗證。
- Owner App 快取更新為 `20260822012`；匯入 API、正規化與 Owner UI 合計 98／98 測試通過，靜態副本一致、`git diff --check` 通過。
- 部署前備份：`backups/v2-test-d1-20260822-194623-before-csv-phone-drive-upload-pages-deploy.sql`（419,018 bytes；SHA-256 `1e8232588043599476db9b298c841a264224f105c4a9cbcb8bbafa30ec877e76`）。
- v2-test Pages：`14eec783`；alias 已確認載入 Owner App `20260822012`、新的雲端檔 MIME 與線上 CSV `0912-345-678`。
- 未部署 Worker、未寫入遠端 D1、未執行 migration 0030、未碰 production。

## 67. AI 待辦新增待評估客戶（2026-08-22，已部署 v2-test Pages）

- AI 優先待辦工作台新增「待評估」按鈕與件數，只納入狀態為「一般待審核」或「優先待審核」的評估案件。
- 點擊後只顯示待評估客戶名稱與評估類型；「前往評估」會移動到該客戶完整逐題回答與人工審核操作。
- 六個待辦按鈕桌機版改為三欄、手機版維持兩欄；Owner App 快取更新為 `20260822013`。
- 相關測試 33／33 通過，JavaScript 語法、靜態副本與 `git diff --check` 均通過。
- 部署前備份：`backups/v2-test-d1-20260822-204359-before-pending-assessment-button-pages-deploy.sql`（431,649 bytes；SHA-256 `85247327b13d51fbc5c831600c4a2efcfd57f20108884bc71ce24b49cbd28c33`）。
- v2-test Pages：`1a78ff4d`；alias 已確認載入 Owner App `20260822013`、「待評估」篩選、案件導航與三欄佈局。
- 未部署 Worker、未寫入遠端 D1、未執行 migration 0030、未碰 production。

## 68. 未通過業主核准的新客評估統一列入待評估（2026-08-22，已部署 v2-test Pages）

- 實機發現「改由人工聯絡」的新客評估仍顯示在案件列表，但上方「待評估」顯示 0，原因是前端將該狀態當成已處理。
- 分類改為：只有狀態 `approved`（已核准，可預約）會移出「待評估」；其餘所有尚未通過業主核准的新客評估都列入。
- 上方「待評估」與下方「新客評估案件」共用同一判斷函式，避免數量再次不一致。
- Owner App 快取更新為 `20260822015`；相關測試 29／29 通過。
- 部署前備份：`backups/v2-test-d1-20260822-210353-before-unapproved-assessment-filter-pages-deploy.sql`（431,649 bytes；SHA-256 `85247327b13d51fbc5c831600c4a2efcfd57f20108884bc71ce24b49cbd28c33`）。
- v2-test Pages：`5ddfa2dd`；alias 已確認載入 Owner App `20260822015`，線上規則為 `item.status !== "approved"`。
- 未部署 Worker、未寫入遠端 D1、未執行 migration 0030、未碰 production。

## 69. 平台指定工作室匯出客戶 CSV（2026-08-22，已部署 v2-test）

- 平台管理的每個一般工作室管理區新增「匯出客戶 CSV」；下載前會顯示工作室名稱確認，檔名直接使用工作室名稱，方便大量業主管理。
- 新平台 API 只允許平台本人匯出指定 tenant；拒絕平台主帳號、找不到的 tenant 與隱藏驗收工作室，CSV 查詢仍固定帶入 `customers.tenant_id`。
- 匯出內容只有客戶編號、姓名、電話、生日、備註、建立時間、預約筆數與最近預約時間，不含 LINE 識別碼、照片、token 或 secrets，並沿用試算表公式注入防護。
- 指定平台／匯出測試 40／40 通過，完整測試只有既存的 5 個前端 cache-version 斷言失敗，與本功能無關；靜態副本一致、`git diff --check` 通過。
- 部署前備份：`backups/v2-test-d1-20260822-221432-before-platform-customer-csv-worker-pages-deploy.sql`（431,649 bytes；SHA-256 `85247327b13d51fbc5c831600c4a2efcfd57f20108884bc71ce24b49cbd28c33`）。
- v2-test Worker version：`094f8ac9-918b-44f8-8744-ccf648a28eaa`；`/api/health` 已確認 `ok:true`、`dataBackend:d1`，未登入存取平台 CSV API 回傳 `401`。
- v2-test Pages：`9130ebff`；正式 alias 已確認載入 Owner API `20260822002`、Platform App `20260822005`，且可見 `customerExportControls` 與「匯出客戶 CSV」。
- 未寫入遠端 D1、未執行 migration 0030、未碰 production。

## 70. 本機過期檔案隔離與商品工程副本同步（2026-08-22，本機完成）

- 權威目錄維持 `eca1`；本次只整理專案內已確認過期、已完成或未引用檔案，沒有碰 Desktop Demo v1、production、secrets、其他個人資料夾或舊 worktree 實體內容。
- 四套 2026-08-19 舊安裝包移至 `dist/封存-不可使用/20260819-舊安裝包/`；v1 舊說明、2026-07 舊文件、十份已完成 TASK、六份未引用 CSS 快照與 `.DS_Store` 移至 `封存-不可使用/歷史檔案-20260822/`。
- 所有隔離均為可復原移動，沒有永久刪除；`backups/`、目前程式、有效文件、兩份 CSV 匯入範本與尚未實作的加購 TASK 均保留。
- `dist/juliet-studio-os-v2-install-kit-20260820-current/` 已更新，重新產生 246 筆 SHA-256；並完整同步至 `商品營運中心/安裝包/current-工程同步版-尚待交付驗收/`，兩份目錄逐檔一致、校驗全數通過。
- Cursor 目前開啟的是 Cursor Agent 網頁而非本機編輯器；沒有把專案上傳到雲端。現行權威路徑與隔離規則已寫入清單，供 Cursor／終端機後續查核。
- 本階段沒有部署、沒有遠端 D1 寫入、沒有執行 migration 0030、沒有碰 production。

## 71. 平台 CSV 手機儲存／分享與專業確認視窗（2026-08-22，已部署 v2-test Pages）

- LINE／iPhone 內建瀏覽器對非同步完成後才觸發的 Blob 下載，會誤顯示「開啟外部應用程式」；允許後沒有可接手應用，因此沒有反應。
- 平台匯出改為兩階段：第一次按鈕只下載並準備 CSV；完成後按鈕改成「儲存／分享 CSV」，第二次由使用者手勢同步開啟手機分享選單，無 Web Share 時才回退一般下載。
- 原生 `window.confirm` 會顯示 `pages.dev` 網址且樣式陽春，已改為平台內建的品牌化確認視窗，清楚顯示工作室名稱、匯出範圍與隱私限制；支援返回、背景點擊與 Esc 取消。
- 使用者取消分享時保留已準備檔案，可再次按按鈕；檔名仍使用指定工作室名稱，tenant-scoped 匯出與平台限定權限不變。
- Platform App 快取更新為 `20260822007`、Platform CSS 快取更新為 `20260822003`；相關測試 13／13 通過、JavaScript 語法與平台靜態副本一致。
- 部署前備份：`backups/v2-test-d1-20260822-223953-before-platform-csv-mobile-modal-pages-deploy.sql`（431,649 bytes；SHA-256 `85247327b13d51fbc5c831600c4a2efcfd57f20108884bc71ce24b49cbd28c33`）。
- 首次部署誤落 `head` 預覽分支 `b7333d4a`，發現 v2-test alias 仍是舊快取後未誤報完成；已明確指定 `--branch v2-test` 重新部署。
- v2-test Pages：`3f1c7df9`；alias 已確認載入 Platform App `20260822007`、Platform CSS `20260822003`、品牌確認視窗與兩階段儲存／分享流程。
- 未部署 Worker、未寫入遠端 D1、未執行 migration 0030、未碰 production。

## 72. 已報到終止取消與服務週期回訪（2026-08-22，已部署 v2-test）

- 業主將預約標記為 `checked_in` 後，後端只允許轉為 `completed`；取消、改期與未到均由狀態機拒絕，Owner App 也不再顯示「取消預約」。業主端狀態文字改為「已報到」，客戶端公開狀態仍維持「已確認」。
- 回訪提醒只在業主標記「已完成」後建立：手部美甲 21 天、足部美甲 42 天、手足合做以手部為主 21 天、美睫／睫毛管理 21 天；其他服務仍使用業主設定的回訪天數。
- 既有 tenant-scoped 防重複、再次預約後停止提醒及 LINE 失敗安全重試規則維持不變。
- Owner App 快取更新為 `20260822016`；針對性測試 206／206、完整測試 919／919 通過，JavaScript 語法、Owner 靜態副本與 `git diff --check` 均通過。
- 部署前備份：`backups/v2-test-d1-20260822-231535-before-checked-in-follow-up-worker-pages-deploy.sql`（433,199 bytes；SHA-256 `93ce2d19f244728433afe0e47588531f87789d6ad847f9339984e72a91d38bd3`）。
- v2-test Worker version：`dd0f9ee8-a701-465c-a87b-73863907ab10`；`/api/health` 已確認 `ok:true`、`dataBackend:d1`。
- v2-test Pages：`6e74b82e`；alias 已確認載入 Owner App `20260822016` 與取消白名單。
- 未寫入遠端 D1、未執行 migration 0030、未碰 production。

## 73. 新客評估照片放大與人工審核下一步（2026-08-22，已部署 v2-test Pages）

- 業主端評估照片不再直接取代按鈕並以長圖撐開案件卡片；改用既有安全全螢幕照片檢視器，以 authenticated fetch 取得私有照片 Blob，不在網址或 DOM 暴露 R2 路徑。
- 全螢幕檢視新增縮小、百分比還原、放大控制，可在 100%～400% 間調整，點擊照片可快速切換 100%／200%，方便業主細看評估照片。
- 未核准案件固定顯示「下一步：完成人工評估」，提供核准並開放預約、要求補資料／照片、暫停預約及改由人工聯絡；先前已標記人工聯絡但尚未核准的案件也不再隱藏後續操作。
- Owner App 快取準備為 `20260822017`、Owner CSS 為 `20260822003`；針對性測試 65／65、完整回歸 919／919 通過，JavaScript 語法、Owner 靜態副本一致。
- 部署前備份：`backups/v2-test-d1-20260822-233834-before-assessment-photo-zoom-pages-deploy.sql`（433,199 bytes；SHA-256 `93ce2d19f244728433afe0e47588531f87789d6ad847f9339984e72a91d38bd3`）。
- v2-test Pages：`b39c3067`；正式 alias 已確認載入 Owner App `20260822017`、Owner CSS `20260822003`、照片縮放控制與人工評估下一步，線上檔案 SHA-256 與本機完全一致。
- 未部署 Worker、未寫入遠端 D1、未執行 migration 0030、未碰 production。

## 74. 新客評估處理按鈕與客戶 LINE 結果通知（2026-08-23，已部署 v2-test）

- 根因確認：業主核准後，Owner App 會隱藏全部處理按鈕；後端只更新評估狀態與審核紀錄，沒有建立或即時發送客戶通知。
- 四個人工處理選項現在固定顯示於逐題回答與照片之前；目前狀態的按鈕停用，其餘選項仍可用來修正處理結果。
- 核准、要求補資料／照片、暫停預約及改由人工聯絡都會建立 tenant-scoped 通知；只傳送給該 tenant 已綁定 LINE 的客戶，立即發送失敗則保留既有排程安全重試。
- 核准通知明確告知評估已通過並可回到該工作室專屬入口預約；兩分鐘內相同評估與結果防止重複建立通知。
- 針對性測試 25／25 與 6／6、完整測試 920／920 通過；JavaScript 語法、靜態副本與 `git diff --check` 均通過。
- 部署前備份：`backups/v2-test-d1-20260823-000424-before-assessment-review-notification-worker-pages-deploy.sql`（433,199 bytes；SHA-256 `93ce2d19f244728433afe0e47588531f87789d6ad847f9339984e72a91d38bd3`）。
- v2-test Worker version：`188a923a-fb4c-42a9-9056-36413ac95e2b`；`/api/health` 已確認 `ok:true`、`dataBackend:d1`。
- v2-test Pages：`f54c0b1e`；正式 alias 已確認載入 Owner App `20260823001` 與四個人工處理選項。
- `dist/juliet-studio-os-v2-install-kit-20260820-current/` 與 `商品營運中心/安裝包/current-工程同步版-尚待交付驗收/` 已重新產生並逐檔同步；兩份套件的 manifest 與全部內容 SHA-256 校驗通過。
- 未寫入遠端 D1、未執行 migration 0030、未碰 production。

## 75. 新客評估處理按鈕對齊（2026-08-23，已部署 v2-test Pages）

- 四個人工處理按鈕改為固定兩欄網格，統一寬度、最低高度、間距與置中文字；長文字可正常換行，不再出現第三顆按鈕偏右。
- Owner CSS 快取準備更新為 `20260823001`；Owner 與 docs 靜態副本一致，針對性測試 7／7、`git diff --check` 通過。
- 本次只有前端樣式調整；已隨第 77 節部署至 v2-test Pages，沒有遠端 D1 寫入、沒有執行 migration 0030、沒有碰 production。

## 76. 舊眉輕色評估精簡與照片日期隱藏（2026-08-23，已部署 v2-test Pages）

- 舊眉輕色新客評估由原本最多 11 個問答與 4 張照片，精簡為 6 個必要問答與 2 張照片；只有曾做過淡化的客戶才追加恢復狀況，降低客戶中途放棄機率。
- 不再重複詢問可由照片或既有答案判斷的施作次數、舊色調、淡化日期、期待效果及左右眉分照；既有進行中案件仍保留舊題目銜接，不必重填。
- 修正 CSS 強制顯示日期欄位的問題；照片題只顯示檔案選擇與上傳，合法日期題仍可正常使用。
- Customer CSS 快取準備更新為 `20260823001`；針對性測試 14／14、靜態副本一致與 `git diff --check` 均通過。
- 已隨第 77 節部署至 v2-test Pages；沒有遠端 D1 寫入、沒有執行 migration 0030、沒有碰 production。

## 77. 人工評估後續引導補強（2026-08-23，已部署 v2-test Pages）

- 人工評估區新增依目前結果變化的「下一步引導」：核准後等待客戶預約、待補資料後等待客戶補充、暫停預約後持續追蹤、人工聯絡時主動聯絡客戶。
- 保留四種處理結果隨時可修正的操作，並明確提示目前結果按鈕會停用。
- Owner App／CSS 快取準備更新為 `20260823002`；Owner 與 docs 靜態副本同步，針對性測試通過。
- 部署前備份：`backups/v2-test-d1-20260823-003221-before-owner-guidance-layout-pages-deploy.sql`（439,296 bytes；SHA-256 `b4c35095343b26a77e40ac809695ecaa91665ec480d35e15b4fca741a3bcf69d`）。
- v2-test Pages：`00217a0e`；正式 alias 已確認載入 Owner App／CSS `20260823002` 與 Customer CSS `20260823001`，三個線上檔案 SHA-256 均與本機完全一致。
- 依使用者第二次明確授權重新部署相同內容：部署前備份 `backups/v2-test-d1-20260823-003436-before-owner-guidance-layout-pages-redeploy.sql`（SHA-256 `b4c35095343b26a77e40ac809695ecaa91665ec480d35e15b4fca741a3bcf69d`）；最終 v2-test Pages 為 `a7c77aad`，alias 已再次確認載入 Owner `20260823002`，線上 App 與本機 SHA-256 完全一致。
- 本次只部署 Pages；沒有部署 Worker、沒有遠端 D1 寫入、沒有執行 migration 0030、沒有碰 production。

## 78. 客戶核准後恢復評估狀態並直接預約（2026-08-23，已部署 v2-test）

- 根因：客戶重新開啟專屬入口後，前端評估狀態重設；選回原服務時，評估範本 API 只回傳題庫設定，未回傳既有案件已核准，導致日期與時段仍被鎖住，客戶必須再按一次「開始問卷評估」才會恢復。
- 評估範本 API 現在依 tenant、LINE 客戶與題庫取回最近案件狀態；客戶選到已核准服務時立即恢復 `approved`，保留既有答案與照片並直接開放日期／時段。
- 客戶端明確顯示「評估已通過，先前送出的資料與照片都已保留」，不再要求重按問卷；Customer App 快取準備更新為 `20260823001`。
- 針對性測試 25／25、JavaScript 語法、靜態副本與 `git diff --check` 均通過。
- 部署前備份：`backups/v2-test-d1-20260823-004558-before-approved-assessment-booking-recovery-worker-pages-deploy.sql`（SHA-256 `6c2025314dbea82cc91f21a49883919b9f153daf0011ac57081ca5ce7a2a8823`）。
- v2-test Worker version：`54b30758-35cd-4c63-8b50-6faf614ac40b`；`/api/health` 已確認 `ok:true`、`dataBackend:d1`。
- v2-test Pages：`9b4df6a2`；正式 alias 已確認載入 Customer App `20260823001`，線上 App SHA-256 `8ec43360c0b6199df18ec769056d24d4be35c9c0c06131e7e6fa55b3e27ae383` 與本機完全一致。
- 本次沒有遠端 D1 寫入、沒有執行 migration 0030、沒有碰 production。

## 79. 客戶評估摘要與核准服務自動續接（2026-08-23，已部署 v2-test）

- 前一輪只恢復 `approved` 並解鎖日曆，仍未顯示客戶先前送出的內容，也未自動帶回原服務；客戶回到入口仍可能誤認資料消失並重新尋找服務。
- 評估範本 API 現在對已登入的同 tenant 客戶回傳自己的既有逐題答案、提交／審核狀態與照片張數，不回傳照片物件或其他客戶資料。
- 客戶端新增「您先前送出的評估資料」摘要；優先恢復本機記錄的上次服務，無記錄時尋找已核准評估服務，自動帶入後直接開放日期與時段。
- Customer App／CSS 快取準備更新為 `20260823002`；針對性測試 25／25、JavaScript 語法、靜態副本與 `git diff --check` 均通過。
- 已隨第 80 節部署至 v2-test Worker 與 Pages；沒有遠端 D1 寫入、沒有執行 migration 0030、沒有碰 production。

## 80. 已完成預約禁止客戶改期與狀態一致（2026-08-23，已部署 v2-test）

- 遠端唯讀確認截圖案件實際為 `completed`；舊 API 相容欄位仍輸出 `status:已確認`，客戶端錯用該欄位顯示改期按鈕，造成同卡同時出現「已完成」與「變更時間」。
- 客戶端改以 `internalStatus===confirmed` 判斷改期，並限制原服務時間必須仍在未來；`completed`、`no_show`、取消、已改期及已過期 confirmed 均不顯示改期。
- 後端改期 API 同步要求 `status='confirmed'` 且原服務時間晚於現在，避免繞過前端；業主月份 DTO 補回 `statusLabel`，完成案件明確顯示「已完成」。
- 與第 79 節合併驗證：針對性測試 48／48、JavaScript 語法與 `git diff --check` 均通過。
- 部署前備份：`backups/v2-test-d1-20260823-010244-before-completed-booking-reschedule-assessment-summary-worker-pages-deploy.sql`（SHA-256 `6c2025314dbea82cc91f21a49883919b9f153daf0011ac57081ca5ce7a2a8823`）。
- v2-test Worker version：`37651c48-49ea-4584-990d-0a4a9fb0a286`；`/api/health` 已確認 `ok:true`、`dataBackend:d1`。
- v2-test Pages：`f0feff6d`；正式 alias 已確認載入 Customer App／CSS `20260823002`，線上 SHA-256 均與本機完全一致。
- 本次沒有遠端 D1 寫入、沒有執行 migration 0030、沒有碰 production。

## 81. 一般租戶禁止誤用 JULIET 共用 OA 通知（2026-08-23，已部署 v2-test Worker）

- 實機確認一般訂閱工作室的評估結果通知錯由 JULIET 共用 OA 發出；根因是客戶專屬入口會把 request-scoped `env.TENANT_ID` 改成目前租戶，通知路由又以同一欄位判斷預設 OA，導致任何一般租戶都被誤認成共用 OA 所屬 tenant。
- 通知路由改用不可被 request scope 覆寫的 `DEFAULT_LINE_TENANT_ID`；只有固定預設 tenant、標準展示 tenant、旗艦展示 tenant 可取得各自 token。沒有專屬 OA 設定的一般租戶通知會保持 queued，不再冒用 JULIET 共用 OA 發送。
- 若要由一般租戶自己的 OA 發送，仍必須另行完成該租戶 Messaging API、LINE Login／LIFF、provider 與 token 映射；本次不讀取、不新增也不公開任何 secrets。
- 新增 request scope 改寫 `TENANT_ID` 的回歸測試；通知路由、併發派送、安全錯誤紀錄及業主評估通知相關測試 21／21 通過，`git diff --check` 通過。
- 兩份 current 商品安裝包已同步本次 Worker、設定與測試修改，並重新產生 SHA-256 清單，逐檔校驗通過。
- 部署前備份：`backups/v2-test-d1-20260823-011756-before-line-channel-routing-worker-deploy.sql`（442,872 bytes；SHA-256 `6f4e661126840b254892a804ccd9f9c072318000efffacd1f94a2dfdb17405f9`）。
- v2-test Worker version：`18b7c11d-e9ab-4c4a-8c81-3b0ec03a9888`；`/api/health` 已確認 `ok:true`、`dataBackend:d1`。
- 本次沒有部署 Pages、沒有遠端 D1 寫入、沒有執行 migration 0030、沒有碰 production、v2-production、Demo v1、Notion、main 或 secrets；已送出的錯頻道 LINE 訊息無法撤回。

## 82. 已核准新客評估不再重複填寫預約評估（2026-08-23，已部署 v2-test Pages）

- 實機截圖確認客戶已完成且通過新客評估，選好日期與時段後仍被舊的「填寫預約評估資料」視窗攔住，造成同一客戶重複填寫相同類型資料。
- 根因是 `requiresReviewBeforeBooking()` 只檢查服務是否配置評估題庫，沒有檢查已恢復的 `assessmentState.status='approved'`。
- 已核准相同服務的新客評估現在直接建立預約，不再開啟第二份預約評估表；尚未核准或沒有新客評估結果的既有流程維持原規則，業主端預約審核也不受影響。
- Customer App 快取準備更新為 `20260823003`；Customer 與 docs 靜態副本一致，針對性測試 46／46、JavaScript 語法及 `git diff --check` 均通過。
- 兩份 current 商品安裝包已同步本次修改並重新產生 SHA-256 清單，逐檔校驗通過。
- 部署前備份：`backups/v2-test-d1-20260823-013329-before-approved-assessment-no-duplicate-intake-pages-deploy.sql`（442,872 bytes；SHA-256 `6f4e661126840b254892a804ccd9f9c072318000efffacd1f94a2dfdb17405f9`）。
- v2-test Pages：`29c30ff8`；正式 alias 已確認載入 Customer App `20260823003`，線上 App SHA-256 `f87b10c851951568e9b5e00fb853ba9a9bd47d9054c45c22e05149cf387b6c9e` 與本機完全一致。
- 本次沒有部署 Worker、沒有遠端 D1 寫入、沒有執行 migration 0030、沒有碰 production、v2-production、Demo v1、Notion、main 或 secrets。

## 83. 開始訂金期限不可假成功（2026-08-23，已部署 v2-test）

- 遠端唯讀確認問題預約仍為 `pending_review`、沒有 `deposit_due_at`、沒有訂金通知；工作室已開啟訂金並填寫金額與帳號，但缺少轉帳戶名。業主端只檢查前三項，後端檢查四項，因此確認視窗可開啟但狀態轉換被拒絕，錯誤又只顯示在頁面頂端。
- 業主預約卡現在與後端使用相同條件檢查訂金開關、金額、轉帳帳號與轉帳戶名；缺漏時「受理／開始 24 小時訂金期限」按鈕直接停用，並在同張卡片列出缺少欄位。
- 狀態轉換 API 失敗會保存於該預約卡的紅色提示，不再只有離操作區很遠的全頁訊息；成功後才清除提示、重新讀取預約並切換下一步按鈕。
- 後端在開始 24 小時期限前新增 tenant LINE 通知路由前置檢查；沒有正確 OA token 路由時回傳 409，預約維持 `pending_review`，不會形成期限已開始但客戶收不到通知的不一致狀態。
- Owner App／CSS 快取準備更新為 `20260823003`；Owner 與 docs 靜態副本一致，訂金狀態機、通知安全與業主介面相關測試 29／29、JavaScript 語法及 `git diff --check` 均通過。
- 兩份 current 商品安裝包已同步本次修改並重新產生 SHA-256 清單，逐檔校驗通過。
- 部署前備份：`backups/v2-test-d1-20260823-015440-before-deposit-deadline-guard-worker-pages-deploy.sql`（444,709 bytes；SHA-256 `a85a1ae90b9e391e79524cbed9f08ff3892646cf3bd23678ccdb229f65187cf2`）。
- v2-test Worker version：`49ffca3e-cfb2-432a-bef8-7f08f026bf54`；`/api/health` 已確認 `ok:true`、`dataBackend:d1`。v2-test Pages：`ae2c97c6`。
- 正式 alias 使用 no-cache 與 cache-busting query 均確認載入 Owner App／CSS `20260823003`；線上 App SHA-256 `90671a38c630016021227a833fb17610e6c24d08b0c000aa14e7dd226e2fd239`、CSS SHA-256 `1bd4f1cdd74f1350c6852fafbceed8197385229661bd299010f633cf03b510f3`，與本機完全一致。
- 本次沒有遠端 D1 寫入、沒有執行 migration 0030、沒有碰 production、v2-production、Demo v1、Notion、main 或 secrets。

## 84. Tenant 專屬 LINE channel registry 第一階段（2026-08-23，本機完成）

- 新增集中式 tenant LINE channel registry 解析層；預定由 Worker secret `LINE_TENANT_CHANNELS_JSON` 注入 provider、Messaging token、LIFF Client IDs 與 webhook secret，不將真實憑證寫入 repo、D1 或前端。
- 通知派送已先接上 tenant 專屬 Messaging token；一般 tenant 沒有映射時保持 fail closed，絕不回退 JULIET 共用 OA。既有 default、標準展示與旗艦展示路由暫時保留相容。
- LIFF ID token 驗證已先接上 tenant-scoped Client IDs；客戶專屬入口完成 tenant scope 後，只嘗試該 tenant 的 Login Channels，不再跨 tenant 嘗試 JULIET Client ID。
- 新增架構文件 `TENANT-LINE-CHANNEL-ROUTING.md`，明列尚未完成的多 OA webhook route、provider 核對、正式 tenant LIFF 公開配置與 provisioning。
- 新增與既有回歸合計 17／17 通過，`git diff --check` 通過；兩份 current 商品安裝包已同步本次程式、測試與文件，並重新產生 SHA-256 清單、逐檔校驗通過。
- 完整回歸 935 項中 925 通過、10 項失敗；失敗均為本輪前即存在的前端 cache-version／靜態斷言與 owner DTO 斷言，tenant LINE routing 的新增與既有針對性測試全數通過。
- 本次沒有部署、沒有遠端 D1 寫入、沒有執行 migration 0030、沒有讀寫 `.dev.vars`、tokens 或 secrets，沒有碰 production、v2-production、Demo v1、Notion 或 main。

## 85. Tenant 專屬 LINE webhook 與 readiness（2026-08-23，本機完成）

- 新增 `/api/line/webhook/{webhookRouteKey}` 本機路由；route key 必須為 32～128 字元的 opaque 值，由伺服器端 registry 映射 tenant 與 Channel Secret，不接受 payload 自稱 tenant。
- 每個 webhook 只使用該 route 所屬 OA 的 Channel Secret 驗證 LINE 簽章；錯誤 OA 簽章、未知 route 與 tenant-shaped 短路徑一律 fail closed。舊共用 webhook 暫留相容。
- 新增安全 readiness 檢查，僅回報 registry 是否存在及缺少的欄位名稱；不回傳 Provider ID、Messaging token、LIFF IDs、Channel Secret 或 route key 實值。
- tenant routing、LIFF、通知、舊 webhook 與新 webhook 針對性測試 25／25 通過，JavaScript 語法與 `git diff --check` 通過。
- 兩份 current 商品安裝包已同步本次程式、測試與文件，並重新產生 SHA-256 清單、逐檔校驗通過。
- 本次沒有部署、沒有遠端 D1 寫入、沒有執行 migration 0030、沒有讀寫 `.dev.vars`、tokens 或 secrets，沒有碰 production、v2-production、Demo v1、Notion 或 main。

## 86. 標準／旗艦展示 OA 安全退役開關（2026-08-23，本機完成）

- 依現行程式盤點兩個展示 OA 的有效依賴：Worker 舊 Messaging token、LIFF 驗證白名單、客戶與業主前端固定 LIFF ID，以及 `/standard/customer/`、`/flagship/customer/` 展示路徑。
- 新增 `LINE_LEGACY_SHOWCASE_ROUTES_ENABLED=false` cutover 模式；啟用後 Worker 不再取得標準／旗艦舊 token，也不再以其 Client ID 驗證 token；tenant registry 的專屬 Messaging、LIFF 與 webhook routing 維持正常。
- 開關預設仍啟用，避免前端展示入口尚未切換時誤中斷 v2-test；兩個展示 OA 目前仍不可刪除，下一階段需先移除前端固定 LIFF ID 與展示路徑依賴。
- tenant routing、LIFF、通知與 webhook 針對性測試 27／27 通過，`git diff --check` 通過。
- 兩份 current 商品安裝包已同步本次程式、測試與文件，並重新產生 SHA-256 清單、逐檔校驗通過。
- 本次沒有部署、沒有遠端 D1 寫入、沒有執行 migration 0030、沒有讀寫 `.dev.vars`、tokens 或 secrets，沒有碰 LINE 後台、production、v2-production、Demo v1、Notion 或 main。

## 87. 標準／旗艦改為單一 JULIET 展示 OA（2026-08-23，已部署 v2-test）

- 標準與旗艦客戶入口不再固定使用兩個獨立展示 LIFF，統一改用 `JULIET Studio OS｜工作室` 的 v2-test 客戶 LIFF；展示路徑仍分別保留 standard／flagship showcase context。
- 所有 v2-test 業主入口統一使用 `JULIET 業主管理中心` LIFF；標準與旗艦展示 tenant、方案能力、資料與後端白名單仍完全分開。
- 新增 `LINE_SHOWCASE_SHARED_OA_ENABLED=true` 本機模式；只有明確的標準與旗艦 showcase tenant 可共用 JULIET 展示 OA token，一般 tenant 與未知 tenant 仍 fail closed，不會回退 JULIET。
- 更新單一展示 OA 操作文件；前端四份 config 靜態副本一致，舊標準／旗艦 LIFF ID 已從有效前端設定移除。
- 前端分流、tenant isolation、LIFF、Messaging routing 與 webhook 針對性測試 52／52 通過；cache key 相關追加測試 34／34 通過，`git diff --check` 通過。
- 兩份 current 商品安裝包已同步本次程式、前端、測試與文件，並重新產生 SHA-256 清單、逐檔校驗通過。
- 部署前備份：`backups/v2-test-d1-20260823-154908-before-shared-showcase-oa-worker-pages-deploy.sql`（444,714 bytes；SHA-256 `600f8df608559254d71a4a08038158d30e7a3b07f7cee37df8dd8676fdf8d2fc`）。
- v2-test Worker version：`889af12d-5e21-4ea4-9a88-78c530d17489`；線上 bindings 已確認 `LINE_LEGACY_SHOWCASE_ROUTES_ENABLED=false`、`LINE_SHOWCASE_SHARED_OA_ENABLED=true`，`/api/health` 為 `ok:true`、`dataBackend:d1`。
- 首次 Pages `bd7d8fc9` 的部署網址內容正確，但 alias 仍命中舊 config；未誤報完成。四個入口 config cache key 更新為 `20260823001` 後重新部署，最終 v2-test Pages 為 `c5b80c12`。
- 最終 alias 的標準與旗艦頁面均載入 `config.js?v=20260823001`；線上 config SHA-256 `384b9c5f7154dcecfc7dc009dfe43d7d9befe6a05f7c8fdc60759464ff3e8cdb` 與本機完全一致，且不含舊標準／旗艦 LIFF ID。
- 使用者以 iPhone／LINE 實機驗收兩個共用 LIFF 深連結：兩者都能完成登入且沒有跳錯工作室；標準版正確顯示美甲／美睫且無 AI／旗艦評估，旗艦版正確顯示霧眉／霧唇與 AI 預約小幫手。截圖時間為 16:04、16:05，均顯示 v2-test Pages 網域。
- 本輪手機驗收已確認登入、品牌、方案與 AI 隔離；日期／時段與實際建立預約未在本次截圖驗收範圍內。下一步是將 `JULIET Studio OS｜工作室` 圖文選單切換為標準／旗艦兩個共用 LIFF 深連結，再確認舊展示 OA 無流量與無有效依賴。
- 本次沒有遠端 D1 寫入、沒有執行 migration 0030、沒有讀寫 `.dev.vars`、tokens 或 secrets，沒有碰 LINE 後台、production、v2-production、Demo v1、Notion 或 main；兩個展示 OA 仍不可刪除，必須等手機實機驗收與 LINE 圖文選單切換完成。

## 88. 單一 JULIET 展示 OA 圖文選單切換（2026-08-23，LINE 後台已完成）

- 已在 `JULIET Studio OS｜工作室`（OA ID `@368yltwq`）更新既有圖文選單 `19797114`；標題為「標準版／旗艦版展示」，維持原使用期間 `2026/07/15 00:00 - 2027/07/15 23:59` 與預設顯示。
- 圖文選單改為 2500×843 左右兩欄：左側標準版展示（美甲／美睫、無 AI）連至 `https://liff.line.me/2010530394-QcklvIHd/standard/customer/`；右側旗艦 AI 版展示（霧眉／霧唇、AI 諮詢／新客評估）連至 `https://liff.line.me/2010530394-QcklvIHd/flagship/showcase/customer`。
- 後台儲存後回到圖文選單一覽，已確認「目前顯示的選單」為新標題、新圖片與上述兩個 LIFF 深連結；選單列文字為「選擇展示版本」。
- 新增可維護的 `owner-showcase/rich-menu-unified-showcase.svg` 與實際上傳的 `owner-showcase/rich-menu-unified-showcase.png`；PNG 為 2500×843、117,327 bytes、SHA-256 `cdc3078be83de51a236a55b6396cef624273bb7aecb54d84b9560b42160ea7d2`。
- 本次沒有刪除任何 OA、Channel、LIFF 或圖文選單，沒有遠端 D1 寫入、沒有執行 migration 0030，也沒有碰 production、v2-production、Demo v1、Notion、main、`.dev.vars`、tokens 或 secrets。舊展示 OA 是否可退役仍須等待新選單兩側手機實機點擊與流量觀察，不在本次刪除範圍。

## 89. 平台工作室案件邊框辨識強化（2026-08-23，本機完成）

- 平台工作室清單的每張案件卡片由 1px 淺灰紫邊框改為 2px 明確紫灰邊框，卡片間距由 8px 增加為 14px，並加入低強度陰影，長清單可更快辨識案件界線。
- 展開管理中的案件使用較深紫色邊框與較明顯陰影；案件內詳細設定區的頂部分隔線同步加粗，避免展開內容與下一案視覺混在一起。
- Platform CSS cache key 已更新為 `20260823004`；`platform-admin` 與 `docs/platform` 靜態副本一致。
- 部署前備份：`backups/v2-test-d1-20260823-174329-before-platform-card-border-pages-deploy.sql`（450,675 bytes；SHA-256 `ddad18f422d8b829dca08028bb763a0ac93c387ae9157ea49e4524696246c224`）。
- v2-test Pages：`0e87d4cf`；正式 alias 已確認載入 Platform CSS `20260823004`，線上與本機 SHA-256 均為 `930c1999ffbe8fdf1873105905ee86ffd0ca2f8271853f8505e4ddaf261833d4`。
- 本次沒有遠端 D1 寫入、沒有執行 migration 0030，沒有碰 production、v2-production、Demo v1、Notion、main、`.dev.vars`、tokens、secrets、OA、Channel 或 LIFF。

## 90. 平台邊框驗收與舊展示 OA 依賴稽核（2026-08-23，本機完成）

- 使用者重新整理正式平台管理入口後，確認案件卡邊框、展開狀態與案件間距辨識效果「可以」，第 89 節前端樣式驗收完成。
- 使用者已從 JULIET 共用展示 OA 實機完成標準版預約：2026/08/25 10:00 手部美甲；業主端正確收到待確認訂金案件，補足第 87～88 節的日期、時段、建立預約與 tenant 隔離驗收。
- 本機依賴稽核確認，有效前端設定只使用 JULIET 展示 OA 的共用 LIFF；舊標準／旗艦完整 LIFF ID 未出現在有效前端設定，測試亦明確禁止其重新出現。
- v2-test 已使用 `LINE_LEGACY_SHOWCASE_ROUTES_ENABLED=false` 與 `LINE_SHOWCASE_SHARED_OA_ENABLED=true`。舊 Client ID 目前只保留於 Worker 相容環境欄位與受開關保護的驗證程式，不構成有效展示入口。
- 舊展示 OA 仍不可刪除；下一個外部驗收點是 LINE 後台流量觀察。任何 OA、Channel、LIFF 變更或刪除都必須另行取得明確授權。
- 本次只有本機文件稽核與紀錄更新；沒有部署、沒有遠端 D1 寫入、沒有執行 migration 0030，沒有碰 production、v2-production、Demo v1、Notion、main、`.dev.vars`、tokens 或 secrets。

## 91. 舊展示 OA 切換後流量基準（2026-08-23，LINE 後台唯讀確認）

- 舊旗艦展示 OA「霧眉師&霧唇師｜專屬系統」為 `@532eeliv`；過去 7 天顯示 1 位好友、0 個活躍聊天室、0 則接收訊息、0 則聊天傳送訊息。
- 舊標準展示 OA「美甲師＆美睫師｜預約系統」為 `@910swqoh`；過去 7 天顯示 1 位好友、0 個活躍聊天室、0 則接收訊息、0 則聊天傳送訊息。
- 上述數據只是圖文選單切換當日的基準；「傳送訊息」總數可包含系統先前發送，不代表切換後仍有客戶互動。需在後續觀察窗口再次查核。
- 兩個舊 OA、其 Channel 與 LIFF 全數保留，未停用、未修改、未刪除。沒有部署、遠端 D1 寫入或 migration 0030。

## 92. 平台案件 LINE readiness 狀態（2026-08-23，已部署 v2-test）

- 平台工作室清單已接上既有 tenant LINE readiness；每案顯示「LINE 已就緒」、「LINE 未設定」或「LINE 待補 N 項」。
- 展開案件可看到待補的 Provider、Messaging、LIFF 與 webhook 類別；API 只回傳 `configured`、`ready` 與缺少欄位名稱，不回傳 token、Channel Secret、LIFF ID 或 route key 實值。
- 一般 tenant 缺少 registry 時繼續 fail closed，不會回退 JULIET 共用 OA。Platform App cache key 更新為 `20260823008`。
- 平台 provisioning、前端靜態契約與 LINE routing 合計 45／45 測試通過；JavaScript 語法、靜態副本與 `git diff --check` 通過。
- 部署前備份：`backups/v2-test-d1-20260823-184509-before-platform-line-readiness-worker-pages-deploy.sql`（450,675 bytes；SHA-256 `ddad18f422d8b829dca08028bb763a0ac93c387ae9157ea49e4524696246c224`）。
- v2-test Worker version：`b4179f9e-f71d-41bf-ae84-f578b699b876`；`/api/health` 確認 `ok:true`、`dataBackend:d1`。
- v2-test Pages：`0cdf6d0b`；正式 alias 已載入 Platform App `20260823008` 與 CSS `20260823004`，線上 Platform App SHA-256 `df39f73c6482c4bbcecb9a4b32a2587d22cbce57110455af28956128ab3eb0f1` 與本機兩份靜態副本完全一致。
- 本次沒有建立或讀取真實憑證、沒有遠端 D1 寫入、沒有執行 migration 0030，沒有碰 production、OA、Channel 或 LIFF。

## 93. 平台 LINE readiness 線上驗收（2026-08-23，已完成）

- 使用已登入的平台本人帳號開啟正式入口，平台權限驗證成功，所有一般工作室案件均正常顯示 LINE readiness badge。
- 實際展開「朱麗葉紋繡個人工作室」，顯示「LINE 未設定」與「尚未建立 tenant registry」，與 v2-test 當前未放入正式 tenant registry 的狀態一致。
- 展開區只列待補類別，並明確顯示「不顯示 token、secret、LIFF ID 或 route key」；頁面未出現任何憑證實值。
- 此次為線上唯讀驗收；沒有寫入 D1、沒有執行 migration 0030，沒有修改 OA、Channel、LIFF、Worker secret 或 production。
