# Beauty Studio Booking v2｜2026-08-20 正式交接

## 1. 專案與權威文件

- 專案：`/Users/imac/project/beauty-studio-booking`
- 目前 Codex 工作目錄：`/Users/imac/.codex/worktrees/eca1/beauty-studio-booking`
- 產品總藍圖：`product-docs/V2-MASTER-BLUEPRINT-AND-PROGRESS-2026-08-09.md`
- 完整工作紀錄：`product-docs/V2-WORKLOG-2026-08-09-LINE-OA-OWNER-FLOW.md`
- 業主開通 SOP：`product-docs/OWNER-SUBSCRIPTION-ONBOARDING-SOP.md`
- 本文件只做目前狀態索引；細節與歷次部署以工作紀錄為準。

## 2. 不可違反的安全限制

- 完整保留大量 dirty worktree；不得 reset、clean、restore、commit、push 或覆蓋既有修改。
- 只處理本專案與 v2-test；不得碰 production／v2-production、Demo v1、Notion、main、`.dev.vars`、tokens 或 secrets。
- Wrangler 固定使用 `/Users/imac/project/beauty-studio-booking/backend/node_modules/.bin/wrangler`，版本 3.114.17。
- 每次新的遠端部署或 D1 遠端寫入，都必須取得使用者當次明確授權；部署前先備份 v2-test D1。
- migration 0030 必須獨立處理；未獲明確授權不得執行。
- 不公開 LINE user ID、Channel Secret、access token 或任何 secrets。
- 開始任何工程前，只做最小唯讀狀態確認。

## 3. 目前線上基準

- v2-test Worker：`bbe39b8c-8552-4d59-beef-f46b65ba7567`。
- v2-test Pages：`e5122297`。
- 日期欄位防溢出最新版 v2-test Pages：`95f7f132`；客戶與業主 CSS 均為 `20260820012`，線上雜湊與本機一致，尚待 iPhone／LINE 實機確認。
- 休假日期排版最新版 v2-test Pages：`4ed56796`；Owner CSS `20260820014`、Owner App `20260820013`，線上雜湊均與本機一致，尚待 iPhone／LINE 實機確認。
- 最近完整測試：888／888 通過（iPhone／LINE 休假日期欄位防溢出已本機完成，尚待部署）。
- 注意：`9a0fb33d` 的第一版營業時段對齊修正在 iPhone／LINE 實機不合格；第二版固定外框已部署為 `3719584f`，線上資產與本機一致，尚待使用者手機實機確認。確認前不重建 current 安裝包。
- 使用者已確認第二版不再重疊；週幾與時間文字加大、水平垂直置中及深色文字修正已部署為 `f6ff57ed`，CSS `20260820004` 與本機雜湊一致，尚待手機實機確認。
- Worker health：HTTP 200、`ok: true`、`dataBackend: d1`。
- Pages `e5122297` 已部署 Customer JS `20260820010`、Owner API `20260820010` 與 Owner App `20260820011`；alias 已確認載入休假日期欄位，線上 Owner App 與本機 SHA-256 一致。
- 本輪沒有寫入 D1 業務資料、沒有執行 migration、沒有碰 production。

### 2026-08-20 最近部署前備份

- `backups/v2-test-d1-20260820-223222-before-date-closure-worker-pages-deploy.sql`，326,153 bytes；SHA-256 `2c4661be0d9c4d6019e49bb0191f9d2e890b8ad493bda50b4abbc52c13e9d73d`。
- `backups/v2-test-d1-20260820-202725-before-deposit-receipt-worker-pages-deploy.sql`，323,608 bytes；SHA-256 `93e1c5aba530c846876926733acd74edb7c38073e1b0e67908e05ab9e996a0ca`。
- `backups/v2-test-d1-20260820-before-first-lip-ai-conversion-worker-pages-deploy.sql`，322,612 bytes。
- `backups/v2-test-d1-20260820-131219-before-ai-template-address-review-deploy.sql`，321,227 bytes。
- `backups/v2-test-d1-20260820-132504-before-owner-queue-template-pages-deploy.sql`，321,227 bytes。
- `backups/v2-test-d1-20260820-133542-before-address-intent-worker-deploy.sql`，321,291 bytes。

## 4. 已完成的重要功能與修正

- 新預約通知採即時發送；五分鐘 cron 只負責舊失敗重試，不能當主要流程。
- 標準版與旗艦版訂金逾期會自動 expired、通知客戶並釋放時段。
- 成立通知直接包含正確預約日期與時間。
- 訂金確認後，客戶預約卡醒目顯示「已收訂金 NT$ 金額」、「本次預約已保留」與確認時間；LINE 成立通知也明確告知工作室已收到訂金及時段已保留。
- 業主預約卡與客戶歷史明確區分「待收訂金」、「待核對訂金」與「已收訂金」，已收狀態顯示金額及確認時間。
- 客戶在設定尚未載入完成時切換「我的預約」不再因讀取空的銀行帳號而顯示內部英文錯誤。
- 美甲／美睫免評估，預約後直接顯示訂金資料、轉帳回報提醒與 24 小時逾期釋放規則。
- 已繳訂金的客戶不能直接取消，必須選擇業主實際開放的日期與時段提出改期，後端再次驗證並通知業主。
- 客戶與業主端通知具短時間內容去重與並行發送租約，避免即時流程與 cron 重複傳送。
- AI 客戶訊息草稿必須符合實際服務項目、繁體中文與店名；服務後保養、改期協調採安全固定範本。
- 客戶詢問地址、住址、店址、地點、位置、在哪裡、怎麼去、導航、交通、捷運、公車或停車時，系統先判斷地址意圖；只依工作室已設定資料回答，缺資料即轉人工，不得編造。
- 地址目前由業主填在「AI 秘書設定 → 工作室介紹」，建議使用 `工作室地址：……` 的明確格式；也可放在「專業知識與回答規則」。
- 「全方位紋繡師」已有獨立一鍵 AI 新客評估規範，會先確認客人詢問的施作部位，再套用相符的霧眉、霧唇或其他紋繡規則。
- 業主端禁止在預約時間尚未到達前標記未到。
- 每位客戶有獨立相簿，照片由新到舊；私有照片仍經 owner auth 與 tenant scope 讀取。
- 客戶資料儲存、題庫收合、相片載入、防閃爍、跳轉延遲及手機版欄位對齊均已修正。
- 業主端營業時段第二版改以固定 44px 外框包住 iOS 原生時間輸入，避免原生控制項撐高或壓到刪除鍵；869／869 通過並已部署 v2-test，尚待手機實機確認。
- 旗艦版業主端顯示「客戶實際填寫的服務評估題庫」，預設收合，按「查看／管理題庫」後才載入；標準版維持隱藏。
- 題庫中健康、安全、療程、資料同意及照片規格為系統鎖定，前端不提供編輯且後端以 `system_locked` 再次限制；業主只能修改非安全服務需求題。
- 「AI 回答範本」與「客戶實際填寫的服務評估題庫」已用標題與說明明確區分。
- 優先待辦工作台的待審核、待補答、待補照片、待訂金、即將逾時五個統計格皆可點擊篩選；再次點擊同一格恢復全部。
- 「待補答」只計入業主已勾選問題並按下「通知客人補答」的案件；要求補照片不會被誤算成待補答。
- 預約補件會依服務項目防止霧唇案件顯示眉毛補照文案；不相符時改為中性的施作部位提示。
- 疤痕、過敏、健康狀況在客戶補充資料畫面以紅字提示，但維持選填；補充服務部位照片也明確標示選填。
- 客戶匯入未開通時顯示平台加購提示。
- 所有主要舊入口由 Pages Function 同次回傳正確頁面，不使用站內 HTTP 302。
- 首次霧唇即使做過其他服務仍必須完成霧唇評估；只有完成過相同服務才可免重做。
- 客戶 AI 已從純留言改為安全預約引導：需求明確時顯示核准服務與「開始預約」按鈕，接回既有評估、日期與時段流程；不會替客戶靜默下單。
- 業主自訂每月 1～28 日開放下月預約已部署 v2-test：設定日前只開放本月，設定日後最多開放至下個月，後端建立預約前再次檢查。
- 業主可選指定日期設為整日不開放或恢復每週時段已部署 v2-test；使用既有 tenant-scoped date override，不需 migration。
- iPhone／LINE 原生日期控制項的防溢出已由個別畫面修正擴大為客戶端與業主端全站規則；客戶生日、業主休假日期與月份欄位均納入，CSS 使用全新快取版號 `20260820012`，完整測試 889／889 通過。
- 業主休假紀錄列已改為固定兩欄對齊；休假日期與查看月份欄位也統一為 56px 高度。Owner CSS 為 `20260820014`、Owner App 為全新 `20260820013`，889／889 通過。

## 5. 最新跳轉與網址處理

- 客戶與業主 LIFF 在登入、憑證恢復、跨入口切換前顯示 Juliet Studio OS 品牌載入畫面，不再只顯示白頁。
- 客戶、業主、平台與旗艦展示頁標題已提前至 head 最前段，避免 LINE 暫時以網域當頁面標題。
- LINE 內建瀏覽器灰色安全網址列由 LINE 控制，網頁不能隱藏。
- 使用者目前不打算購買或設定自訂網域，因此維持 `v2-test.juliet-studio.pages.dev`，不得自行新增網域或修改 LIFF Endpoint。

## 6. LINE 與通知注意事項

- 標準美甲客戶 OA token 曾因顯示值含異常空白而正規化更新；不得再次顯示或讀出 token。
- AI 功能與交易通知是兩套機制；通知失敗不能歸因為沒有 AI。
- 所有新事件都應走即時通知；cron 僅作保險重試。
- 已送出的 LINE 訊息不可撤回，也不可為了表面狀態修改真實稽核紀錄。

## 7. 下一個聊天室的開始方式

1. 先讀本文件、總藍圖、完整工作紀錄與業主開通 SOP。
2. 執行最小唯讀檢查：`git status --short`、Wrangler 版本、必要的目標檔案與測試。
3. 不重做已完成工作，不整理或清除 dirty worktree。
4. 使用者提出新問題時，先本機修正與測試；只有取得該次明確授權後才能備份並部署。
5. 若需要自訂網域、D1 寫入、migration 或任何 production 動作，必須停止並重新取得精確授權。

## 8. 本次正式交接的立即任務

- 目前最高優先不是再次改版或部署，而是請使用者用 iPhone／LINE 實機檢查 Pages `f6ff57ed`：週幾、開始時間、結束時間文字應水平／垂直置中、字體放大、各欄無重疊。
- 未取得這項實機確認前，`current` 安裝包維持撤下，不得交付業主，也不得把封存的 buggy 安裝包改回 current。
- 確認合格後才重建、測試並同步 `dist/` 與 `商品營運中心/安裝包/` 的 current 商品包及相關說明。
- 舊聊天中的部署授權不延續到新聊天；任何新 Pages／Worker 部署或 D1 遠端寫入都必須重新取得當次明確授權，並在部署前備份 v2-test D1。
- 本次交接只更新本機文件與建立新聊天，沒有部署、沒有 D1 寫入、沒有碰 production。

## 9. 2026-08-21 本機完成、尚未部署：明日正式預約提醒

- 排程只在台北時間每天 12:20 建立提醒，並查找「明天」且狀態仍為 `confirmed` 的正式預約；其他五分鐘排程不建立新提醒，只處理既有失敗重試。
- 只有具 tenant-scoped `line_accounts` 綁定的客戶才建立提醒。
- `pending_review`、`pending_customer_confirmation`、取消、過期及其他非 `confirmed` 狀態不建立提醒。
- 通知使用預約 tenant 對應的 LINE OA；標準、旗艦及預設 tenant 嚴格匹配，未知 tenant 不得回退共用 OA。
- 通知 ID 固定為每筆預約唯一的 `booking-tomorrow-reminder:<bookingId>`，排程重跑採 `INSERT OR IGNORE`，同一預約永久只建立一次。
- 派送前再次檢查預約仍為 `confirmed` 且仍落在台北明日區間；建立後取消或失敗拖到非明日區間的提醒改為 `cancelled`，不發送過時內容。
- 發送成功／失敗沿用 tenant-scoped `notifications` 紀錄與既有五分鐘安全重試、原子租約機制。
- 新增 `backend/test/tomorrow-booking-reminders.test.js`；完整回歸 892／892 通過。
- 此功能目前只存在本機 dirty worktree：尚未部署 Worker、未寫入遠端 D1、未碰 production。若要部署，必須取得新的明確授權並先備份 v2-test D1。

## 10. 2026-08-22 已部署 v2-test：依服務週期一鍵再次預約

- 每項服務可設定 0～365 天回訪週期，預設 21 天；0 表示停用。設定儲存在既有 `services.settings_json`，不需 migration。
- 只在服務完成後依週期建立 tenant-scoped 回訪；客戶已有較晚的同服務有效預約時，派送前會取消提醒。
- 店面設定可填工作室客戶端 HTTPS LIFF 網址；通知加入 `serviceId`，客戶點開後自動選定原服務。
- 回訪仍使用預約 tenant 所屬 LINE OA 與既有安全重試／去重機制，不跨工作室混用。
- Owner 營業時段儲存按鈕具 dirty-state；儲存成功後變暗，異動後才重新亮起。Owner App 快取為 `20260822002`，Customer App 為 `20260822001`，完整回歸 902／902 通過。
- 備份：`backups/v2-test-d1-20260822-014859-before-service-cycle-worker-pages-deploy.sql`（344,022 bytes；SHA-256 `fb45cfa538576ccd698e53d97fbfa2482f4b69f7d178751c8a981e0bb62662a6`）。
- Worker：`ec8753dd-d687-4d11-b736-a12f3d9b743b`；Pages：`5c3ef04d`。health 為 D1，線上 Owner／Customer App 與 Owner CSS 雜湊均與本機一致。
- 未寫入遠端 D1、未執行 migration 0030、未碰 production。

## 11. 2026-08-22 已部署 v2-test：一般業主專屬客戶入口

- 新工作室 provisioning 會在既有 `tenant_settings` 建立不可猜測的 64 位 `customer_entry_key`；既有工作室可由平台管理卡片按「建立客戶入口」補建。
- 客戶入口格式為 `/studio/{customer_entry_key}/`，Pages 直接回傳客戶端、不增加跳轉；API 只傳 `X-Beauty-Studio-Entry`，不向客戶端暴露 tenant ID。
- Worker 解析入口後確認 active／trial tenant、default active location 與 active owner staff，再套用既有 tenant scope；錯誤或未知代碼一律 fail closed。
- 部署前備份：`backups/v2-test-d1-20260822-before-tenant-customer-entry-worker-pages-deploy.sql`（410,126 bytes；SHA-256 `8c1ca7607573ff64060402f8ead6f748b207080e34f94caae4f605f1f9f88850`）。
- Worker：`b172f2b4-5819-49ff-a774-44677724822e`；Pages：`16fd6f28`。health 正常，未知入口 API 回傳 404，六個線上靜態檔與本機雜湊一致。
- 本輪沒有寫入遠端 D1、沒有執行 migration 0030、沒有碰 production。既有測試工作室仍須由平台本人按鈕建立入口；若要代為遠端建立，必須取得新的當次 D1 寫入授權。

## 12. 2026-08-22 已部署 v2-test：客戶端標題同步業主店名

- 客戶頁主標題改以 tenant 設定的 `brandName` 優先，LINE／瀏覽器標題同步為「店名｜線上預約」，不再固定顯示產品展示標題。
- 備份：`backups/v2-test-d1-20260822-before-tenant-brand-title-pages-deploy.sql`（410,964 bytes；SHA-256 `cdd9a96efab1dc07c766a4587fb9feb49443356c03d128e421f67b29d7d61868`）。
- Pages：`a2d7a25f`；alias 與專屬工作室路徑已載入 Customer App `20260822002`，線上雜湊與本機一致，完整回歸 911／911 通過。
- 未部署 Worker、未寫入遠端 D1、未執行 migration 0030、未碰 production。

## 13. 2026-08-22 已部署 v2-test：業主邀請自動使用 tenant 專屬客戶入口

- 業主端建立客戶認領邀請時，不再使用共用 `CUSTOMER_APP_URL`；已驗證的 owner settings 會取得目前 tenant 的 `customer_entry_key`，連結固定為 `/studio/{key}/#claim=...`。
- 新 tenant provisioning 已自動建立入口代碼，往後新業主不需逐一設定；v2-test 共用根入口 fail closed，避免客戶誤入平台 tenant。
- 備份：`backups/v2-test-d1-20260822-before-auto-tenant-customer-entry-worker-pages-line-oa.sql`（410,964 bytes；SHA-256 `cdd9a96efab1dc07c766a4587fb9feb49443356c03d128e421f67b29d7d61868`）。
- Worker：`547c1873-6903-48ff-b755-9bc2f538b143`；Pages：`ebe928ee`。完整回歸 912／912，線上 Owner App `20260822004`、Customer App `20260822003`。
- 未寫入遠端 D1、未執行 migration 0030、未碰 production；未在無法確認正確來源時猜測修改 LINE OA。

## 14. 2026-08-22 已部署 v2-test：LIFF 登入保留專屬工作室路徑

- LINE LIFF 登入回到根入口時，Customer Config 會從 `liff.state` 或本次 session 還原 `/studio/{customer_entry_key}/`，避免遺失 tenant 後觸發共用入口阻擋。
- 備份：`backups/v2-test-d1-20260822-before-liff-studio-path-recovery-pages-deploy.sql`（417,390 bytes；SHA-256 `e98d54b7f734c000f95cc9b040eb771fe226556db9a46738920c375541207769`）。
- Pages：`7f34048c`；Customer Config `20260822002`、LIFF Init `20260822001`，完整回歸 913／913。
- 未部署 Worker、未寫入遠端 D1、未執行 migration 0030、未碰 production。

## 15. 下一個聊天室立即任務：部署 LIFF 永久專屬入口修正

- 第 14 節方案實機仍失敗，不得宣稱已修復。畫面仍顯示共用入口安全阻擋。
- 本機已將平台複製入口與業主客戶認領入口由 Pages URL 改為官方 LIFF 永久網址：`https://liff.line.me/{LIFF_ID}/studio/{customer_entry_key}/`。
- 已撤除在 `liff.init()` 前改寫 `liff.state` 的錯誤補丁；Customer Config `20260822003`、Owner App `20260822005`、Platform JS `20260822003`，完整回歸 913／913。
- **目前尚未部署**。下一個聊天室先做最小唯讀確認；取得新授權後重新備份 v2-test D1，只部署 Pages，不部署 Worker、不寫入 D1、不碰 production。
- 部署後唯讀驗證三個線上快取版本，並要求使用者回平台重新複製 LIFF 入口；舊 Pages 專屬網址不可再測。

## 16. 2026-08-24 已驗收：朱麗葉紋繡個人工作室正式 tenant 串接與改期流程

- tenant：`e92ac486-f646-4e6c-bd6b-aa7a2305dabf`；維持 `trial / flagship / trial`，業主姓名維持「朱麗葉測試員」。
- 專屬 Customer／Owner LIFF 與 LINE OA 主頁選單均已完成實機驗收。這些連結目前正確；往後任何變動都必須先提醒使用者並取得同意，不得自行更換。
- 業主通知重試已改為 `LEFT JOIN line_accounts`，收件者使用 `COALESCE(NULLIF(n.recipient,''),la.line_user_id)`；owner notification 的 `customer_id=NULL` 不再阻斷自動重試。
- 業主實際改期採新 booking 的 `parent_booking_id` 串接舊 booking；業主端與客戶端皆從 booking parent chain 顯示真實「變更歷史」，不再把客戶提出的期望時間或通知建立時間冒充實際改期紀錄。
- 預約卡醒目顯示目前「預約日期」；實際改期後顯示「原預約日期」。本次實測由 `2026/08/26 10:00` 改為 `2026/08/25 10:00`，新舊預約與客戶端同步均驗收成功。
- Android／LINE 內建瀏覽器的改期時間欄位同時監聽 `change` 與 `input`；二次確認視窗以較高 z-index 顯示，避免被改期 modal 蓋住而看似卡死。
- 業主實際改期成功後會建立唯一 `booking_rescheduled` 客戶通知，內容同時列出原時段與新時段，使用 tenant 專屬 LINE OA 即時派送；D1 的唯一通知紀錄仍可由五分鐘排程安全重試。
- 客戶端提示文字統一為：「如需變更預約時間，請點選『變更時間』通知工作室協助處理。」
- 本次漏發的改期通知已在備份後以唯一 ID 補建，D1 最終狀態 `sent`，使用者確認客戶只收到一次。
- 最新 v2-test Worker：`f7711b21-91fd-4a00-b646-db4bd04260be`；最新 v2-test Pages：`5fceaf60`。
- 補送前 D1 備份：`backups/v2-test/beauty-studio-booking-v2-test-20260824-before-reschedule-notice-backfill.sql`。
- 本輪未執行 migration 0030、未碰 production／v2-production／Demo v1／Notion／main，未修改 secrets 或 LINE 連結。
- 本次首次正式獨立 tenant 串接與手機驗收窗口約 2026-08-23 23:14 至 2026-08-24 02:02（Asia/Taipei），約 2 小時 48 分；不代表未來標準安裝工時，應在自動化安裝器完成後重新計時。

## 17. 2026-08-24 已部署 v2-test：每 tenant 明日預約提醒設定

- 業主可在「店面設定 → 明日預約 LINE 提醒」自行設定通知時間與內容；時間固定採 5 分鐘刻度，符合既有每 5 分鐘 Worker 排程。
- 服務項目、預約日期與時間仍由系統自動帶入，業主只設定符合自身定位的親切提醒文字，避免手動填錯交易資料。
- 所有業主輸入欄位皆為選填；通知時間或內容留白時沿用平台預設，業主畫面在欄位外以小字註明可依工作室需求調整及留白 fallback 規則。
- 未設定的業主沿用平台預設台北時間 `12:20`；已自訂的業主清空欄位並儲存即可恢復平台預設。
- 平台預設已刪除「提醒您：明天有一筆已正式成立的預約。」；預設結尾改為「明天見！請在約定時間前 5 分鐘到場，讓我們可以從容為您準備。」
- tenant-scoped 排程、專屬 LINE OA 路由、唯一通知 ID 與取消後不發送過時提醒的安全機制維持不變。
- 新增自訂時間、內容、清空恢復平台 fallback 與業主設定頁契約測試；相關測試通過。
- 部署前備份：`backups/v2-test/beauty-studio-booking-v2-test-20260824-before-custom-tomorrow-reminders.sql`。
- v2-test Worker：`ad02fd15-7530-45a2-a64e-fac24c43d88d`；v2-test Pages：`8c925b97`；Owner App 快取 `20260824008`。
- 線上 HTML 與 Owner App 已唯讀確認載入選填欄位、平台 fallback 小字及清空恢復預設提示。
- 未執行 migration、未寫入業務資料、未碰 production、LINE 連結或 secrets。

## 18. 2026-08-24 已部署 v2-test：客戶端目前預約日期加強

- 客戶「我的預約」卡片最終文字層級：服務名稱 `1.4rem / 700`；目前預約日期時間 `1.15rem / 600`，使用柔和深棕與等寬數字，服務名稱維持主要視覺重點。
- 只加強目前生效的預約日期與時間；下方「變更歷史／原預約日期」維持獨立區塊，避免新舊日期混淆。
- Customer CSS 快取 `20260824005`、Customer App 快取 `20260824002`；本機測試通過。
- 部署前備份：`backups/v2-test/beauty-studio-booking-v2-test-20260824-before-customer-date-emphasis-pages.sql`。
- 最終層級調整部署前備份：`backups/v2-test/beauty-studio-booking-v2-test-20260824-before-customer-card-hierarchy-pages.sql`。
- 最終 v2-test Pages：`65f8d877`；線上 CSS 已確認服務名稱 `1.4rem / 700`、日期時間 `1.15rem / 600`。
- 本輪未部署 Worker、未寫入 D1、未執行 migration、未碰 production 或 LINE 連結。

## 19. 2026-08-24 已部署 v2-test：改期操作時間紀錄

- 客戶端與業主端的「變更歷史」統一更名為「變更紀錄」。
- 每筆紀錄除「原預約日期」外，增加「操作變更時間」，以 `changedAt` 轉台北時間顯示，明確區分實際操作時間與新預約時段。
- Customer App 快取 `20260824003`；Owner App 快取 `20260824009`；本機測試通過。
- 部署前備份：`backups/v2-test/beauty-studio-booking-v2-test-20260824-before-reschedule-operation-time-pages.sql`。
- v2-test Pages：`abcea1fe`；線上客戶端與業主端 JS 已唯讀確認載入「變更紀錄」及「操作變更時間」。
- 本輪未部署 Worker、未寫入 D1、未執行 migration、未碰 production 或 LINE 連結。

## 20. 2026-08-24 實機驗收結論與下一步

- 業主端「明日預約 LINE 提醒」的自訂時間、內容、留白恢復平台預設與小字說明均已由使用者確認無誤。
- 客戶端與業主端的「變更紀錄／原預約日期／操作變更時間」內容一致，已由使用者確認無誤。
- 客戶預約卡最終層級已部署：服務名稱為主要視覺，日期時間為清楚的次要資訊。
- 目前有效基準：Worker `ad02fd15-7530-45a2-a64e-fac24c43d88d`；Pages `abcea1fe`。
- 明天等待預約開始後測到店服務流程：客戶已到店、服務狀態、完成服務，以及業主端與客戶端同步；今天不得提前操作未開始預約。
- 兩份 current 安裝包應維持 release `2026-08-24-reschedule-operation-timestamp` 並通過 SHA-256。
- 繼續直接使用 `/Users/imac/.codex/worktrees/eca1/beauty-studio-booking`；不得建立新 worktree，不得以 `/Users/imac/project/beauty-studio-booking` 作為工程來源。
- 保留 dirty worktree；不得 reset、clean、restore、commit、push。不得碰 production、migration 0030、LINE 連結、secrets；任何連結變動前必須先提醒並取得同意。
