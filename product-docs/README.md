## 中文導航

- [中文總目錄.md](中文總目錄.md)：中文文件導航，不用記英文檔名

# 商品化標準文件區

這個資料夾用來放「販售這套美業預約系統」需要的標準文件。

## 文件清單

| 文件 | 用途 |
|---|---|
| **PRODUCT-LINE-COMPARISON.md** | **美業工作室版 vs 小型教室版**比較（接案第一問） |
| **BASELINE-V1-SNAPSHOT.md** | **基礎款 v1.0 母版斷點**：已含功能、不含項目、正式網址與 commit |
| **TEMPLATE-CLONE-GUIDE.md** | **套版母版指南**：接新客戶時複製 repo、換帳號、換設定的總流程與驗收清單（老闆必讀） |
| **INSTALLATION-PACKAGE-SOP.md** | **新客戶整套架設流程／安裝包 SOP**：從複製到驗收交付的總地圖（老闆必讀） |
| CLIENT-INFO-CHECKLIST.md | 接新客戶前，蒐集店名、服務、價格、營業時間、品牌色等資料 |
| CLIENT-NOTION-SETUP-FLOW.md | 在 Notion 建立四個資料庫、連接 Integration、填入 Database ID |
| CLIENT-LINE-SETUP-FLOW.md | 新客戶 LINE / LIFF 逐步設定與驗收紀錄（含 Channel ID、LIFF ID、Endpoint） |
| **LINE-ENTRY-SETUP-FLOW.md** | **LINE 入口設定 SOP**：官方帳號圖文選單／按鈕、客人與業主入口、可公開網址、Demo 與正式切開、交付檢查 |
| PRICING-DRAFT.md | 報價方案草稿，協助判斷建置費與月維護費 |
| CLIENT-DELIVERY-CHECKLIST.md | 系統完成後，交付給客戶前逐項確認 |
| DEMO-ACCEPTANCE-2026-07-14.md | Demo 上線驗收紀錄（含客人端／業主端月曆），供交付 SOP 參考 |
| ACCEPTANCE-customer-profile-2026-07-15.md | 客人基本資料（姓名／電話／生日）上線驗收紀錄與手機勾選清單 |
| PRODUCT-TEMPLATE-MASTER.md | 商品母版總文件（基礎款功能清單含月曆） |
| README.md | 商品化文件總索引 |

## 使用順序

1. **母版斷點**：先看 [BASELINE-V1-SNAPSHOT.md](BASELINE-V1-SNAPSHOT.md)（基礎款 v1.0 賣什麼、不賣什麼）
2. **整套架設總覽**：再讀 [INSTALLATION-PACKAGE-SOP.md](INSTALLATION-PACKAGE-SOP.md)（新客戶從複製到交付的安裝包 SOP）
3. **新客戶套版細節**：再讀 [TEMPLATE-CLONE-GUIDE.md](TEMPLATE-CLONE-GUIDE.md)（複製什麼、換什麼、怎麼驗收）
4. 先填 `CLIENT-INFO-CHECKLIST.md`
5. 依 `CLIENT-NOTION-SETUP-FLOW.md` 建立 Notion 四個資料庫
6. 依 `CLIENT-LINE-SETUP-FLOW.md` 完成 LINE / LIFF 設定
7. 依 [LINE-ENTRY-SETUP-FLOW.md](LINE-ENTRY-SETUP-FLOW.md) 設定官方帳號「預約／管理」入口（圖文選單或按鈕）
8. 再依需求評估 `PRICING-DRAFT.md`
9. 建置完成後使用 `CLIENT-DELIVERY-CHECKLIST.md`
10. Demo 或正式上線後，可參考 `DEMO-ACCEPTANCE-2026-07-14.md` 作為驗收紀錄範本（含月曆選日期、月曆預約查詢）
11. 客人基本資料功能上線後，用 `ACCEPTANCE-customer-profile-2026-07-15.md` 做手機勾選驗收

## 基礎款月曆功能（交付新客戶必知）

| 端 | 功能 | 方案 |
|----|------|------|
| 客人端 | 月曆選日期 → 點可約日 → 選時段 | **基礎款**（非加購） |
| 業主端 | 月曆查詢各日預約 | **基礎款**（非加購） |

詳見 [PRODUCT-TEMPLATE-MASTER.md](PRODUCT-TEMPLATE-MASTER.md) 第 4 節、[DEMO-ACCEPTANCE-2026-07-14.md](DEMO-ACCEPTANCE-2026-07-14.md)。

所有文件不得放入 Token、密碼、客戶個資或機密資料。

## 重要原則

- 不把 `.dev.vars` 上傳 GitHub
- 不把 Notion Token 寫進前端
- 不把 Cloudflare API Token 交給客戶
- 客戶可自行改的項目，要寫清楚
- 需要我維護的項目，要列入維護費

## AI 使用規則

- [AI-USAGE-RULES.md](AI-USAGE-RULES.md)：AI 使用規則與省額度操作守則

## 客戶溝通話術

- [CLIENT-MESSAGE-TEMPLATES.md](CLIENT-MESSAGE-TEMPLATES.md)：新業主資料蒐集與溝通話術模板
