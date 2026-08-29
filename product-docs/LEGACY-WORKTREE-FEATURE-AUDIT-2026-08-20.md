# 4d94／bb11 舊功能等價性稽核

稽核日期：2026-08-20（Asia/Taipei）

## 稽核方式

- 唯讀檢查舊 worktree 的獨有模組、測試、`index.js` 接入點及目前 `eca1` 的對應流程。
- 在原 worktree 離線執行 7 個目標測試檔，共 26 項測試，全部通過。
- 沒有把舊程式複製或合併進 `eca1`，也沒有部署或寫入 D1。

## 判讀結果

### 已由新規則取代，不應恢復舊測試

`4d94/backend/test/first-visit-brow-assessment-policy.test.js`

- 舊規則只有旗艦「首次霧眉」需要評估，霧唇、眼線、臥蠶與淡色管理直接預約。
- 現行 `eca1/backend/src/d1-assessments.js` 已正式支援霧眉、霧唇、眼線、臥蠶、舊眉輕色與舊唇輕色六類評估；其中首次霧眉與首次霧唇都必須完成評估，美甲、美睫才固定免評估。
- 結論：舊測試與現行產品規則衝突，屬已淘汰規格，不能併回。

### 尚未等價取代，必須保留待工程整合

#### 1. 訂閱生命週期

來源：

- `4d94/backend/src/subscription-lifecycle.js`
- `4d94/backend/test/subscription-lifecycle.test.js`

舊版曾實際接入 Worker scheduled 與建立預約 API，提供：

- 到期前 14 天通知業主與平台。
- 到期後 7 天唯讀緩衝。
- 緩衝結束自動將 tenant 暫停並留下 audit。
- 到期工作室禁止新增預約。

目前 `eca1` 有訂閱狀態顯示、平台續約／試用管理，但 scheduled 只處理訂金逾期、通知重試與取消資料清理，沒有上述自動生命週期；建立預約 API 也沒有相同的 subscription bookable guard。

結論：這是尚未等價取代的功能，不可隨舊 worktree 一併丟失。舊實作不可直接搬回，須依目前 owner hub、tenant scope、通知租約與平台規則重新整合。

#### 2. 客戶回報匯款後即時通知業主

來源測試：

- `4d94/backend/test/owner-deposit-immediate-notification.test.js`
- `4d94/backend/test/notification-lifecycle-immediate.test.js`

舊版在客戶回報末五碼時，同次請求建立 audit、依 tenant 的 owner／manager 綁定收件人，並使用業主 OA 即時通知。

目前 `eca1/backend/src/d1-deposit-report.js` 只更新 `deposit_transfer_last5` 與 `deposit_reported_at`；沒有建立業主通知或對應 audit。

結論：功能尚未等價取代，需按目前通知去重、原子租約與 tenant credential 規則重新實作。

#### 3. 新預約即時通知業主

來源：

- `bb11/backend/src/d1-owner-booking-notifications.js`
- `bb11/backend/test/owner-booking-created-notification.test.js`

舊版在預約建立成功後即時通知業主，失敗時由五分鐘排程補送最近 24 小時事件，且不讓通知失敗阻斷預約。

目前 `eca1` 會即時通知客戶訂金、成立、逾期等狀態，也會通知業主已繳訂金改期需求；但沒有「新預約建立」的業主通知入口或補送查詢。

結論：功能尚未等價取代。未來整合時仍須遵守「即時為主、cron 只補舊失敗」原則，且需避免與現有通知佇列重複發送。

#### 4. LINE credential 路由架構

來源：

- `4d94/backend/src/line-credential-router.js`
- `4d94/backend/test/line-credential-router.test.js`
- `bb11/backend/src/line-messaging-credential.js`
- `bb11/backend/test/line-messaging-credential.test.js`

`bb11` 是標準／旗艦客戶 OA 加獨立業主 OA 的中間版本；`4d94` 再演進為 tenant 可指定安全 env binding 名稱的路由，並讓 webhook、客戶通知與 AI 回覆共用。

目前 `eca1` 客戶通知可依標準／旗艦展示 tenant 選 token，其餘回退共用 token；webhook 仍只讀共用 Channel Secret，業主通知也沒有完整獨立 OA 路由。

結論：舊架構包含目前尚未完整保留的多 tenant／多 OA 能力，但不能直接合併，因現行通知資料模型、secret 命名與 OA 綁定規則已改變。應在重新實作前三者統一：客戶 OA、業主 OA、webhook secret 的 tenant routing。

## 舊測試執行結果

- `4d94`：17／17 通過。
- `bb11`：9／9 通過。
- 合計：26／26 通過。

測試通過只代表舊 worktree 內部自洽，不代表可直接部署到目前 v2-test。

## 安全結論

- `6b9b` 沒有非備份獨有路徑，可繼續列為實體刪除候選，但刪除仍需使用者明確授權。
- `4d94`、`bb11` 目前不可刪除：除了已集中保存的 D1，仍承載三組尚未整合功能及 credential 演進紀錄。
- 下一個工程階段應在 `eca1` 重新設計並測試：訂閱生命週期、匯款回報通知業主、新預約通知業主及統一 tenant OA 路由。這會修改 Worker，完成後若要部署仍須重新取得當次授權並先備份 v2-test D1。
