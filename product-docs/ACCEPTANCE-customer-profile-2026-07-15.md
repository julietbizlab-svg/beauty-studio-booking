# 驗收紀錄｜客人基本資料上線

> **驗收日期**：2026-07-15  
> **功能**：客人預約時填寫姓名、電話（必填）、生日（選填）；寫入 bookings；業主端可看  
> **狀態**：後端已 deploy、前端已 push；**手機實機驗收項目請現場勾選**

---

## 1. 驗收日期與範圍

| 項目 | 內容 |
|------|------|
| 日期 | 2026-07-15（台北時間） |
| 產品 | beauty-studio-booking（基礎款） |
| 本次範圍 | 客人基本資料建立（姓名／電話／生日） |
| **不含** | 生日優惠提醒、會員等級、儲值金、包卡、`NOTION_DATABASE_CUSTOMERS` 正式啟用 |

---

## 2. 系統環境

| 項目 | 值 |
|------|-----|
| 客人端 | https://julietbizlab-svg.github.io/beauty-studio-booking/ |
| 業主端 | https://julietbizlab-svg.github.io/beauty-studio-booking/owner/ |
| Cloudflare Worker | `beauty-studio-api` |
| Worker URL | https://beauty-studio-api.gosu-chill-book.workers.dev |
| Worker Version ID（本功能上線） | `2919f5dd-6b97-4d1e-8e8d-51315d1c257f` |
| `/api/health` | `ok: true`，`notion: true` |

### 相關 commit（本次 push）

| Commit | 說明 |
|--------|------|
| `fec8764` | Sort customer bookings by active status（已確認排上、已取消排下） |
| `e829c46` | Add customer profile on booking（姓名／電話／生日） |

### 環境變數備註

| 項目 | 狀態 |
|------|------|
| `.dev.vars` | 本功能上線**未修改** |
| `NOTION_DATABASE_CUSTOMERS` | **尚未設定**（刻意延後） |
| 當前寫入目標 | **bookings** 的客人姓名、客人電話、客人生日（缺欄可於首次寫入時自動補 schema） |

---

## 3. 部署前檢查（已通過）

| 項目 | 結果 |
|------|------|
| `git status --short` | 乾淨 |
| `node --check`（notion / index / customer app / owner app） | 通過 |
| customer-ui ↔ docs 同步 | 通過 |
| owner-admin ↔ docs/owner 同步 | 通過 |
| 前端／docs 無 secret | 通過 |
| `.dev.vars` 未動、未追蹤 | 通過 |

---

## 4. 客人端驗收（手機 LIFF）

> 以 LINE 開啟客人端；硬重整以更新 `?v=20260715010` 快取。

| # | 項目 | 預期 | 實測 |
|---|------|------|------|
| 1 | 預約流程出現「步驟 4：填寫聯絡資料」 | 有姓名、電話、生日欄 | ☐ |
| 2 | 姓名、電話必填 | 未填完時「確認預約」不可送／有提示 | ☐ |
| 3 | 生日選填 | 可不填仍可成功預約 | ☐ |
| 4 | 填寫後送出成功 | 出現預約成功畫面；成功畫面姓名為表單姓名 | ☐ |
| 5 | Notion bookings | 該筆有客人姓名、客人電話；（有填）客人生日 | ☐ |
| 6 | 同一天僅一筆 | 阻擋提示仍正常、醒目 | ☐ |
| 7 | 長時服務重疊 | 原重疊防呆不受影響 | ☐ |
| 8 | 再次開啟表單 | 本機可帶出上次姓名／電話（localStorage） | ☐ |

---

## 5. 業主端驗收（手機 LIFF）

> 硬重整業主端以更新 `?v=20260715005`。

| # | 項目 | 預期 | 實測 |
|---|------|------|------|
| 1 | 當日／選定日預約卡片 | 顯示客人姓名 | ☐ |
| 2 | 電話 | 顯示「電話：…」 | ☐ |
| 3 | 生日 | 有填才顯示「生日：…」 | ☐ |
| 4 | 排序 | 已確認在上、已取消在下、取消卡淡化 | ☐ |
| 5 | 取消預約 | 已確認仍可取消；取消原因仍可見 | ☐ |

---

## 6. API／後端驗收（已測＋可再測）

| 項目 | 結果 | 備註 |
|------|------|------|
| `GET /api/health` | ✅ | `{"ok":true,"studio":"美業工作室","notion":true}` |
| Worker deploy | ✅ | Version `2919f5dd-6b97-4d1e-8e8d-51315d1c257f` |
| `git push origin main` | ✅ | `ce58c95..e829c46` |
| `POST /api/bookings`（含 customerName / phone / birthday） | 待手機測 | 姓名／電話缺漏應 400 |
| customers upsert | ⏭️ 略過 | 未設 `NOTION_DATABASE_CUSTOMERS` 屬預期 |

---

## 7. 回歸（建議一併確認）

| 項目 | 預期 | 實測 |
|------|------|------|
| 訂金轉帳資訊 | 開啟訂金時成功畫面仍顯示 | ☐ |
| 客人取消二次確認 | `confirm` 文案與行為正常 | ☐ |
| 預約成功彈窗 | 服務／日期／時段／姓名清楚 | ☐ |

---

## 8. 已知與後續

1. **`NOTION_DATABASE_CUSTOMERS`**：建議稍後再建 customers 表並掛 Secret；目前 bookings 已足夠上線測聯絡資料。  
2. **Notion bookings** 若尚未手動建「客人電話」「客人生日」，首次成功預約時後端可能自動補 schema（Integration 需有更新 DB 權限）。  
3. 前端 cache：若看不到新表單，請關閉 LIFF 重開或清快取。

---

## 9. 驗收結論

| 階段 | 狀態 |
|------|------|
| 程式與文件 | ✅ commit `e829c46` |
| Worker + Pages | ✅ deploy + push 完成 |
| 手機實機（客人＋業主） | ☐ 待勾選第 4、5 節 |

**總評（部署端）**：可進行手機驗收。  
**總評（功能端）**：待手機測完後將第 4、5 節打勾，並更新下方簽核。

| 角色 | 簽名／日期 |
|------|------------|
| 實測人 | |
| 覆核 | |

---

*文件版本：1.0｜對應功能：客人基本資料 on booking｜不含金流／包卡／儲值*
