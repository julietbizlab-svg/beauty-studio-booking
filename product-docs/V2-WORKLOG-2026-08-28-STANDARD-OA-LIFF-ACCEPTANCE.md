# Beauty Studio Booking v2｜標準 OA／LIFF 驗收交接

日期：2026-08-28（Asia/Taipei）  
環境：僅 `v2-test`  
狀態：業主端入口驗收通過；客戶端 `Invalid LIFF ID` 已找出根因，待授權才可修正

## 0. 2026-08-28 後續技術更正（最重要，先讀）

本文件第 3 節到第 6 節原本的推論是錯的。後續唯讀比對已找出 `Invalid LIFF ID` 的實際原因，與 LINE 帳號身分、Tester、發布狀態都無關。

### 0.1 權威工作目錄

v2-test 目前線上跑的前端，來源不是本工作目錄，而是：

`/Users/imac/.codex/worktrees/eca1/beauty-studio-booking`

比對證據：線上 `https://v2-test.juliet-studio.pages.dev/js/config.js` 與該 worktree 的 `customer-ui/js/config.js` 內容完全相同（diff 無差異）。本工作目錄 `/Users/imac/project/beauty-studio-booking` 的前端是較舊的分支，未部署。

### 0.2 根因

| 項目 | 實際值 |
|---|---|
| 標準 OA 右側客戶端連結 | `https://liff.line.me/2011029740-Q9PBV7FF` |
| 該 LIFF 的 Endpoint | `https://v2-test.juliet-studio.pages.dev/standard/customer/` |
| 線上 config.js 在該路徑輸出的 LIFF ID | `2010530394-QcklvIHd` |

LINE 以 `2011029740-Q9PBV7FF` 開啟頁面，頁面卻用 `2010530394-QcklvIHd` 呼叫 `liff.init()`。兩者不同，SDK 因此丟出 `Invalid LIFF ID`。

線上 config.js 全檔沒有任何 `2011029740` 字串；標準專屬 LIFF 已在 08-22 前後的架構改版中退役。

### 0.3 正確的標準展示客戶端入口

依權威 worktree 的 `product-docs/STANDARD-SHOWCASE-OA-SETUP.md`：

- Pages 路徑：`/standard/customer/`
- 共用展示 LIFF：`https://liff.line.me/2010530394-QcklvIHd`

同 worktree 的 `product-docs/TENANT-LINE-CHANNEL-ROUTING.md` 記載，`/standard/customer/` 與 `/flagship/showcase/customer/` 已改由 JULIET 展示 OA 的單一 LIFF 分流並完成 v2-test 部署，且 `LINE_LEGACY_SHOWCASE_ROUTES_ENABLED=false` 已套用 v2-test。因此即使前端硬改回舊標準 LIFF，Worker 端也不會接受該 Client ID 的 ID token。（此項為文件記載，本次未實際驗證 Worker 變數。）

### 0.4 本次未做

只做唯讀比對。未修改 OA 圖文選單、LIFF 設定、前端檔案、Worker 變數，未部署、未 commit。

## 1. 本次安全邊界

- 未發布任何 LINE Login channel。
- `美甲美睫標準展示LIF` 仍為 `Developing`。
- 未修改 production、v2-production、Demo v1、Notion、secrets 或 token。
- 未執行 D1 寫入、migration、Worker／Pages 部署、commit 或 push。
- 僅對 v2-test D1 做過遮罩後的唯讀身分比對，未顯示或記錄完整 LINE user ID。
- 工作目錄仍有大量既有 dirty changes，不可 reset、clean、restore 或覆蓋。

## 2. 已完成且已實機驗收

### 2.1 標準 OA 業主端入口

LINE Official Account：`美甲師＆美睫師｜預約系統`  
圖文選單：`美甲美睫標準展示｜業主端與客戶端`

左側「業主端」已改為：

`https://v2-test.juliet-studio.pages.dev/owner/hub/?tenant=acceptance-tenant_beauty_studio_default-beige`

右側「客戶端」維持：

`https://liff.line.me/2011029740-Q9PBV7FF`

未變更：

- 圖片
- 標題
- 右側客戶端連結
- 使用期間（2026/08/09 01:00～2027/08/08 23:59）
- 其他 OA 或 LINE channel

實機結果：從標準 OA 點左側「業主端」，會直接進入標準版後台，不再出現標準／旗艦二選一。此項驗收通過。

## 3. 客戶端目前狀態

### 3.1 當時的觀察（第 5 行起已被第 0 節更正）

- LIFF App 存在。
- LIFF ID：`2011029740-Q9PBV7FF`。
- LIFF URL：`https://liff.line.me/2011029740-Q9PBV7FF`。
- Endpoint URL：`https://v2-test.juliet-studio.pages.dev/standard/customer/`。
- Scopes：`openid, profile`。
- ~~前端 `customer-ui/js/config.js` 與 `docs/js/config.js` 會在標準客戶路徑選用上述 LIFF ID。~~ 錯誤：這是本工作目錄的舊版本，並未部署；線上版本輸出 `2010530394-QcklvIHd`。
- ~~Worker `STANDARD_LIFF_CLIENT_ID` 為 `2011029740`。~~ 僅為相容欄位，且展示 legacy 路由開關已關閉。
- Channel 仍為 `Developing`，符合目前「只做內部測試、不對外開放」決策。

### 3.2 尚未通過

手機從標準 OA 點右側「客戶端」後，頁面可載入，但 `liff.init()` 顯示：

`Invalid LIFF ID`

原因見第 0.2 節：圖文選單使用的 LIFF ID 與頁面實際 `liff.init()` 的 LIFF ID 不一致。此項尚未驗收通過，修正動作需另行授權。

## 4. 帳號角色與重要更正

目前有兩個不同用途的帳號：

| 帳號 | 用途 | LINE Developers 狀態 |
|---|---|---|
| 平台管理帳號 | 管理 OA、平台與展示工作室 | 標準 LINE Login channel 的 Admin |
| 業主測試帳號 | 模擬一般業主／內部測試 | 已加入標準 LINE Login channel 的 Tester |

重要：LINE Developers 的角色屬於「Business ID／與其連結的 LINE 帳號」，不等於系統內的業主、平台或 tenant 權限。

### 4.1 本次錯誤判斷

看到 `Invalid LIFF ID` 後，曾錯誤推論手機正在使用「業主測試帳號」，因此新增業主測試帳號為 Tester。

後來使用者澄清：當時手機實際上是用「平台管理 LINE 帳號」查看客戶端。

因此：

- 新增 Tester 本身有效且未破壞系統，可保留供日後內部測試。
- 但它無法修正平台管理帳號看到的 `Invalid LIFF ID`。
- 不可再把「手機正在使用的 LINE 帳號」與「剛接受 Tester 邀請的 Business ID」視為同一身分。

補充更正：`Invalid LIFF ID` 與帳號身分無關，見第 0.2 節。本節保留只為記錄當時的錯誤推論，不可再據此執行任何帳號動作。

### 4.2 已確認的身分差異

- 業主測試 Business ID 已接受 Tester 邀請。
- Tester 的 Basic settings 有 `Your user ID`，表示它確實連結了一個 LINE 帳號。
- 遮罩後的唯讀比對確認：Tester 所連結的 LINE 身分與系統平台管理身分不同。
- 這是兩個帳號的正常隔離，不是資料庫綁錯。

完整 LINE user ID 不得寫入文件、聊天、截圖或 commit。

## 5. 產品決策

- 現在仍是內部測試，不發布 LINE Login channel。
- 不強迫正式顧客先加入 OA；正式產品仍可依已驗證的 LINE ID token 辨識本人。
- `Tester` 電子郵件邀請只屬於 Developing 階段白名單，不代表未來顧客需要用電子郵件登入。
- 未來若發布為 `Published`，一般 LINE 使用者不需要 Tester 信箱；但發布不可改回 Developing，必須另行評估並取得明確授權。
- 本次已取消發布確認，沒有按下最終 Publish。

## 6. 下一次正確接續點

原本規劃的「身分核對」路線已作廢，不要執行。

先不要：

- 不要發布 channel。
- 不要再邀請其他 Tester。
- 不要解除或重綁任何 LINE 帳號。
- 不要在本工作目錄改前端後部署；本目錄前端是舊分支，部署會覆蓋線上較新的架構。
- 不要把 `Invalid LIFF ID` 當成帳號或權限問題。

下一步（需使用者當次明確授權才能執行）：

1. 改用權威工作目錄 `/Users/imac/.codex/worktrees/eca1/beauty-studio-booking` 作為後續工作基準。
2. 先讀該目錄的 `product-docs/STANDARD-SHOWCASE-OA-SETUP.md` 與 `product-docs/TENANT-LINE-CHANNEL-ROUTING.md`，確認展示入口的現行設計。
3. 唯一需要的修正是 LINE 後台設定：把標準 OA 圖文選單右側「客戶端」改成共用展示 LIFF `https://liff.line.me/2010530394-QcklvIHd`。
4. 只改右側連結，不動圖片、標題、左側業主端、使用期間與其他 OA。
5. 儲存後從標準 OA 右側實機重新驗收，依第 7 節完成定義逐項確認。
6. 舊標準 LIFF `2011029740-Q9PBV7FF` 與其 channel 先保留不刪，等 LINE 後台流量觀察與正式 tenant readiness 完成再評估。

## 7. 完成定義

客戶端驗收通過必須同時符合：

- 不再顯示 `Invalid LIFF ID`。
- 正常取得 LINE 登入身分。
- 顯示標準版美甲／美睫內容。
- 不顯示旗艦 AI、霧眉／霧唇評估功能。
- 可看到服務、日期與可預約時段。
- 「我的預約」只能讀取目前 LINE 身分自己的資料。
- 不需真的送出預約；若送出測試資料，必須記錄並清理。

