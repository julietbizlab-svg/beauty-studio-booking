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
