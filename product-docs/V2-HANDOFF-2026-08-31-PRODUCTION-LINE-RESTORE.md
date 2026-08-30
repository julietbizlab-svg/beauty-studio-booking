# Beauty Studio Booking v2｜2026-08-31 正式 LINE 回復交接

## 目前權威位置

- 唯一可寫工作目錄：`/Users/imac/project/beauty-studio-v2-consolidate`
- A `/Users/imac/project/beauty-studio-booking` 與 B `/Users/imac/.codex/worktrees/eca1/beauty-studio-booking` 只讀。
- PR #9 已合併，merge commit：`5c8eafe2a846da6b73437c2d5376089b67fa2dd6`。

## 線上目前狀態

- 正式 Worker 已部署回復版本：`17d510b5-32d1-460f-b5b7-ac6768e68b14`。
- 正式 Pages 已部署回復版本，正式 alias：`https://juliet-studio.pages.dev`。
- 健康檢查正常。
- production frontend 已恢復客戶 LIFF `2010530394-orSKMGcU`、業主 LIFF `2010530394-zDbXbhXT`。
- `2011217307-krdMabXG` 與 `2011217307-pdNvwLwJ` 的 LINE Developers Endpoint 已恢復為原本 v2-test tenant 客戶／業主用途。
- 不得再使用已撤回 PR #8 的做法。

## 使用者已確認的產品關係

- `朱麗葉紋繡個人工作室` 原本已與 `JULIET 業主管理中心` 連結。
- 一般業主應走既有 JULIET 業主管理中心流程，不是平台管理頁。
- 不申請新 LINE 帳號。
- 未重新確認整張關係圖前，不新增 LIFF、不改 Endpoint、不切 Provider、不改 token。

## 已知問題

- 正式預約與取消通知尚未完成兩端實機驗收。
- production 預設 tenant 的有效業主 LINE 綁定為 0，owner invite 也為 0；直接開一般業主基底網址會顯示「無業主管理權限」。
- PR #9 GitHub CI 兩次為 973 pass／13 fail；本機為 986 pass／0 fail。需另開獨立工作確認午夜／時區或測試並行因素，不可混入 LINE 修復。

## 下一輪第一步（只讀）

1. `git fetch origin main` 後確認 main 含 PR #9 merge commit，且工作樹乾淨。
2. 完整讀本交接、08-30 worklog、lessons、master blueprint 與標準 OA 驗收文件。
3. 唯讀列出四張表：客戶 OA、業主入口、LINE Login／LIFF、Provider／Messaging OA；記錄各自 ID、Endpoint、用途與是否正式／測試，但不得在聊天輸出 secret 或 LINE user ID。
4. 唯讀檢查 OA 圖文選單目前實際連結，不做修改。
5. 把現況用白話表格交給使用者確認，確認後才提出最小修正方案。
6. 正式 D1、LINE Developers、Worker secrets、merge、deploy 都必須重新取得當次明確授權。
