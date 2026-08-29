# Beauty Studio Booking v2 工作交接：LIFF 永久專屬入口

## 權威工作目錄

`/Users/imac/.codex/worktrees/eca1/beauty-studio-booking`

保留大量 dirty worktree；禁止 reset、clean、restore、commit、push。

## 目前真實狀態

- 已部署 Pages `7f34048c` 的 session／`liff.state` 還原方案，實機仍失敗，不得宣稱已修好。
- 正確修正已在本機完成：平台與業主端產生 `https://liff.line.me/{LIFF_ID}/studio/{customer_entry_key}/`。
- 已撤除 `liff.init()` 前讀取或改寫 `liff.state` 的錯誤邏輯。
- 客戶端頁面大標題與 LINE／瀏覽器頂端標題已統一只顯示業主設定的 `brandName`，不再附加「｜線上預約」。
- 完整測試 914／914 通過；靜態副本及 `git diff --check` 通過。
- 本機快取：Customer Config `20260822003`、Customer LIFF Init `20260822002`、Customer App `20260822004`、Owner App `20260822006`、Platform JS `20260822004`。
- 最終修正已部署至 v2-test Pages `77867517`；alias 已驗證 Customer App 與 Platform JS 均為本機相同版本及雜湊。

## 下一步

1. 讀取總藍圖、目前 handoff、worklog 第 55 節及本文件。
2. 最小唯讀確認 dirty worktree 與上述修改仍存在。
3. 請使用者從平台重新複製 LIFF 專屬入口並以 LINE 實機驗證；舊 Pages 網址無效。
4. 若後續需再次部署，仍須取得新的當次明確授權並重新備份 v2-test D1。

## 安全限制

- 不碰 production／v2-production、Demo v1、Notion、main、secrets、migration 0030。
- Wrangler 固定 3.114.17：`/Users/imac/project/beauty-studio-booking/backend/node_modules/.bin/wrangler`。
- 每次部署或遠端 D1 寫入都需要當次明確授權；部署前先備份 v2-test D1。
