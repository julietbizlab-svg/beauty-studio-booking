# Beauty Studio Booking v2｜遠端驗收清單

適用環境：`v2-test`  
Wrangler：固定 `3.114.17`  
原則：終端機優先；只有 LINE 登入、LIFF 與實際畫面互動才使用瀏覽器。

## 一、部署前

- [ ] `git status --short`：確認並保留既有 dirty worktree。
- [ ] `git diff --check`：不得有空白或 patch 格式錯誤。
- [ ] `npm test`：完整測試全數通過。
- [ ] 全專案通過職稱禁用詞掃描，對外統一使用「本工作室」。
- [ ] `npx wrangler --version` 必須為 `3.114.17`。
- [ ] 確認所有指令只指向 `env.v2-test`，不得指向 production。

## 二、D1

- [ ] 先匯出 v2-test D1 備份，記錄檔案大小與 SHA-256。
- [ ] 執行 `migrations list`，確認實際待套用項目。
- [ ] migration 已存在時不得重複強制套用。
- [ ] 套用後確認 `schema_versions` 與 `d1_migrations`。
- [ ] 執行 `PRAGMA foreign_key_check;`，結果必須為空。
- [ ] 不在輸出或紀錄中顯示 LINE user ID、token、客戶健康資料或照片位置。

## 三、Worker／Pages

- [ ] Worker dry-run 可解析 v2-test 的 D1、R2、AI、vars 與 Cron。
- [ ] 部署 Worker 後記錄 Version ID。
- [ ] 確認 Cron 為每 5 分鐘，且只綁定 v2-test Worker。
- [ ] 部署 Pages preview branch `v2-test`。
- [ ] `/api/health` 回傳 `ok=true`、`dataBackend=d1`。
- [ ] 比對遠端 customer／owner JS 與本機部署來源 SHA-256。

## 四、標準版

- [ ] LINE 登入成功，頁面只顯示工作室品牌與預約內容。
- [ ] 不顯示 AI 入口，不呼叫 AI API。
- [ ] 可載入服務、日期、時段與客戶既有資料。
- [ ] 已有其他日期有效預約時，送出追加預約前再次提醒。
- [ ] 建立申請前必須填寫審核問卷。
- [ ] 客戶可查看待本工作室確認、補件、待訂金及正式成立狀態。

## 五、旗艦版

- [ ] 核心預約流程與標準版一致。
- [ ] AI 入口位於主要預約流程下方。
- [ ] 開啟頁面不自動呼叫 AI；只有按下「取得 AI 建議」才使用額度。
- [ ] AI 洽詢成功寫入業主端待辦。
- [ ] 業主端只顯示必要資料與 AI 整理重點，最終操作仍由業主完成。
- [ ] 業主回覆後，客戶端「工作室回覆」可正確顯示。

## 六、LINE

- [ ] 補答通知成功。
- [ ] 補照片通知成功。
- [ ] 受理後付款通知包含訂金金額、期限與轉帳資料。
- [ ] 正式成立通知成功。
- [ ] 逾時取消通知成功。
- [ ] AI 洽詢業主回覆成功，D1 `ai_inquiry_owner_replies.status='sent'`。
- [ ] 失敗紀錄只保存安全錯誤分類，不保存 token、LINE user ID 或供應商原文。

## 七、驗收後

- [ ] 清理或取消本次建立的測試預約，釋放時段。
- [ ] 測試資料使用明確的 `v2-test 驗收` 標記。
- [ ] 再次執行 `PRAGMA foreign_key_check;`。
- [ ] 再次執行完整測試、`git diff --check` 與禁用詞掃描。
- [ ] 記錄 Worker Version、Pages deployment、migration、D1 備份雜湊與 LINE 發送結果。
- [ ] 明確註記 production 未操作。

## 2026-07-26 驗收基準

- Worker Version：`1658d62e-b40e-49bb-a452-6dbbbe6f0962`
- Pages deployment：`d8c369e8.juliet-studio.pages.dev`
- Pages alias：<https://v2-test.juliet-studio.pages.dev>
- D1 migration：`0016_ai_inquiry_owner_replies` 已存在
- D1 備份 SHA-256：`7e97fef07ed82baead0f02b57c51b8e1a7b8c509ba984f1779c6a0caea994ad3`
- LINE 業主回覆：遠端狀態 `sent`
- 自動測試：`658/658`
- production：未操作
