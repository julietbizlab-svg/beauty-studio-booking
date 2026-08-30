# Beauty Studio Booking v2｜乾淨整合完成與 AI 評估修正工作紀錄

日期：2026-08-30（Asia/Taipei）
狀態：乾淨整合已完成、測試全綠、分支已推送並建立 Draft PR；AI 評估修正尚未 commit／push

## 1. 目前權威工作定位

| 代稱 | 路徑 | 定位 |
|---|---|---|
| A | `/Users/imac/project/beauty-studio-booking` | 舊主目錄，保留；不得回寫 |
| B | `/Users/imac/.codex/worktrees/eca1/beauty-studio-booking` | v2-test 線上比對來源，保留；不得回寫 |
| C | `/Users/imac/project/beauty-studio-v2-consolidate` | 候選整合 worktree；所有後續程式工作在此進行 |

分支：`codex/v2-consolidate-20260828`
基準：`12f7754a77d9ccf0ebb776df5ac2a02304a8dc91`

## 2. 乾淨整合結果

- 第 1 批：backend 核心 72 檔；快照 `/private/tmp/v2-batch1-snapshot-X5wWbkak`。
- 第 2 批：backend tests 87 檔；快照 `/private/tmp/v2-batch2-snapshot-LL37nWvo`。
- 第 3 批：前端來源 41 檔；快照 `/private/tmp/v2-batch3-snapshot-kNbeTzUy`。
- 第 4 批：docs 鏡像 37 檔；快照 `/private/tmp/v2-batch4-snapshot-Du1m2DB5`。
- 第 5 批：product-docs 42 檔；快照 `/private/tmp/v2-batch5-snapshot-XyIjNmm6`。
- 第 6A 批：B 剩餘允許檔 30 檔；快照 `/private/tmp/v2-batch6a-snapshot-sPKDnQJ4`。
- 第 6B 批：A 的 2026-08-28 OA／LIFF 驗收交接 1 檔；快照 `/private/tmp/v2-batch6b-snapshot-l8xxJQnA`。
- 第 7 批：完整結構、來源鏡像、禁止項目及跨批基線驗證通過。
- 第 8 批：修正 9 個測試檔內 27 個落後期望。
- 15 個 legacy v1 追蹤檔仍保留，因現行文件仍有引用；未擅自刪除。

整合完成時測試：`979 passed / 0 failed`。
最終 TAP：`/private/tmp/v2-post-commit-final-979.tap`。
SHA-256：`ac917c2b739054081ab3cc44b4f0262c3e6031f4815a81d9fb1b22a31f63ad6e`。

## 3. 已提交與遠端狀態

已建立並推送三個 commit：

1. `9d4336d7cb6ca6f87ce7a6e815e53b7634229e12` — `feat: consolidate v2 application sources`
2. `4c06b2b4c263c5bed87ac8587dc57806a1ed40c2` — `docs: add standard OA LIFF acceptance handoff`
3. `5cae07c5eca7d077fcdd8f3f130a84198e3192ae` — `test: align expectations with consolidated v2`

本地與遠端分支一致；相對 `origin/main` 為 3 個 commit。
Draft PR：<https://github.com/julietbizlab-svg/beauty-studio-booking/pull/3>
PR base：`main`；compare：`codex/v2-consolidate-20260828`。
PR 尚未 merge，且本日未部署。

## 4. 旗艦版 AI 新客評估問題

### 使用者目標

旗艦版 AI 的主要任務不是照題庫聊天，而是協助業主的客戶以自然、最少來回的方式完成預約。新客評估只是預約流程中的安全與資料收集步驟，不得在完成或已有進度後重複啟動。

### 根因

系統同時保留新版通用評估與舊版霧眉對話 SOP。舊 SOP 原先只有在新版評估狀態為 `approved` 時退出，因此客戶已開始或已送出新版評估、但仍待人工審核時，AI 仍可能建立或續跑第二份舊評估。

### 本地修正（尚未 commit）

- `backend/src/brow-intake-sop.js`
  - 只要目前客戶已有任何新版 `assessment_sessions` 紀錄，舊霧眉 SOP 就不再建立或續跑第二份評估。
  - 已通過人工預約審核的既有判定仍保留。
  - 原評估資料不刪除，預約人工審核門檻不放寬。
- `backend/test/brow-intake-sop.test.js`
  - 更新既有測試，使「已有新版評估紀錄」即退出舊 SOP。
  - 新增既有舊 SOP session 遇到新版評估時，應交回一般預約 AI 且保留舊資料的回歸測試。

修正後完整測試：`980 passed / 0 failed`。
`git diff --check`：通過。
目前 C 只有上述 2 個程式／測試檔與本次新增文件處於未提交狀態。

## 5. 本日未做

- 未修改 `.dev.vars`、secrets、LINE OA／LIFF、D1、Worker vars。
- 未執行 migration、D1 遠端寫入、Pages／Worker 部署。
- 未合併 Draft PR。
- AI 修正與 08-30 文件尚未 commit 或 push。

## 6. 下一次接續順序

1. 在 C 唯讀確認分支、HEAD、dirty 檔案與本文件記載一致。
2. 審查 AI 修正是否符合產品決策：已有新版評估即由新版流程接手，舊 SOP 不再攔截。
3. 重跑 `node --test backend/test/brow-intake-sop.test.js`、完整 `node --test backend/test/*.test.js` 與 `git diff --check`。
4. 維持門檻 `980 passed / 0 failed`。
5. 取得使用者明確授權後，才可為 AI 修正與本日文件建立獨立 commit 並 push 至現有 Draft PR。
6. 不得 merge 或部署，除非另有當次明確授權。

## 7. 2026-08-30～31 實際完成紀錄

本節取代本文件前段的「尚未 merge／deploy」舊狀態；前段保留作歷史現場紀錄。

- PR #3 已合併，整合版本進入 `main`。
- AI 重複評估修正已完成；只要已有新版評估紀錄，舊霧眉 SOP 不再建立或續跑第二份評估，既有資料及人工審核門檻保留。
- PR #4 已合併：新增預約時建立客戶與業主 LINE 通知。
- PR #5 已合併：客戶或業主取消預約時，建立客戶與業主 LINE 通知。
- v2-test 曾完成預約與取消通知實機驗收，使用者確認兩邊均收到。
- 正式 D1 `beauty-studio-booking-v2` 已先備份，再套用 migrations 0011～0030；`foreign_key_check` 無錯誤，migration 計數為 30。
- 正式 D1 備份：`/private/tmp/beauty-studio-booking-v2-production-20260830-before-schema-line-readiness.sql`；SHA-256 `80fff15ee229ae58865de13cd6e8cd7433c2111ff6e3f3be69f149aa3bc04fcd`。
- PR #6 已合併：評估按鈕文案改為「確認送出」、補正式非秘密設定，並將一般訂閱開通整理成 8 個白話步驟。
- PR #7 已合併：曾依當時判讀調整正式 LINE Provider；後續確認使用者原有 LINE 關係後，不再作為最終狀態。
- PR #8 已合併但判定為錯誤變更：誤將正式客戶／業主 LIFF 統一切到 `朱麗葉紋繡個人工作室` 的兩個 LIFF，並修改兩個既有 LIFF Endpoint。
- PR #9 已依使用者明確授權合併，完整撤回 PR #8 程式變更；正式 Worker 與 Pages 已部署回復版本。
- LINE Developers 內 `2011217307-krdMabXG` 已恢復至原本 v2-test 專屬客戶入口；`2011217307-pdNvwLwJ` 已恢復至 v2-test Owner Hub 並帶 tenant owner LIFF 參數。
- 正式網站目前再次輸出原本 production LIFF：客戶 `2010530394-orSKMGcU`、業主 `2010530394-zDbXbhXT`。
- 正式 Worker 目前版本：`17d510b5-32d1-460f-b5b7-ac6768e68b14`；健康檢查正常。
- PR #9 merge commit：`5c8eafe2a846da6b73437c2d5376089b67fa2dd6`。

## 8. 測試與已知未完成事項

- 本機完整測試：`986 passed / 0 failed`；`git diff --check` 通過；前端來源與 `docs/` 鏡像相同。
- PR #9 GitHub Actions 在 2026-08-31 午夜前後連續兩次出現相同的 13 個業主畫面測試失敗，結果為 `973 passed / 13 failed`；失敗集中在改期與預約狀態按鈕測試，與 PR #9 的 LINE config revert 無直接檔案關係。使用者已明確同意在此已知風險下合併回復版本。
- 正式預約／取消 LINE 通知尚未完成端到端實機驗收，不得宣稱兩邊正式通知已完成。
- 正式 D1 的 `tenant_beauty_studio_default` 目前 `staff_line_accounts` 業主有效綁定數為 0，且沒有可用 `owner_access_invites`；直接開一般業主頁會顯示「無業主管理權限」。
- 使用者確認的產品關係：`朱麗葉紋繡個人工作室` 原本已與 `JULIET 業主管理中心` 接好；一般業主應由既有流程進入 JULIET 業主管理中心，不可再擅自建立新 LIFF、改既有 Endpoint 或把一般業主導向平台管理頁。
- 下一輪只能先唯讀盤點既有 OA 圖文選單、LIFF、Provider、平台／一般業主入口及資料庫綁定流程，畫出現況後請使用者確認；未確認前不得再修改 LINE Developers、token、Worker vars、D1 或部署。
