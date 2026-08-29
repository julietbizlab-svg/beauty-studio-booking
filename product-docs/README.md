## 中文導航

- [中文總目錄.md](中文總目錄.md)：中文文件導航，不用記英文檔名
- [CURRENT-AND-INVALID-FILES-2026-08-20.md](CURRENT-AND-INVALID-FILES-2026-08-20.md)：目前有效、過期與不可交付檔案清單
- [V2-HANDOFF-2026-08-20-CURRENT.md](V2-HANDOFF-2026-08-20-CURRENT.md)：目前線上版本、測試與工程交接

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
| **OWNER-SUBSCRIPTION-ONBOARDING-SOP.md** | **業主訂閱開通 SOP**：共用 LINE OA 模式下，平台建工作室、一次性邀請、業主綁定、實機驗收與客製 OA 分流 |
| **V2-WORKLOG-2026-08-09-LINE-OA-OWNER-FLOW.md** | **2026-08-09 工作紀錄**：標準／旗艦 OA、Owner Hub、部署版本、待辦與踩坑避雷 |
| **V2-MASTER-BLUEPRINT-AND-PROGRESS-2026-08-09.md** | **v2 總藍圖與進度報告**：產品、平台、OA、方案、權限、部署、進度與後續順序的單一總覽 |
| PRICING-DRAFT.md | 報價方案草稿，協助判斷建置費與月維護費 |
| CLIENT-DELIVERY-CHECKLIST.md | 系統完成後，交付給客戶前逐項確認 |
| DEMO-ACCEPTANCE-2026-07-14.md | Demo 上線驗收紀錄（含客人端／業主端月曆），供交付 SOP 參考 |
| ACCEPTANCE-customer-profile-2026-07-15.md | 客人基本資料（姓名／電話／生日）上線驗收紀錄與手機勾選清單 |
| PRODUCT-TEMPLATE-MASTER.md | 商品母版總文件（基礎款功能清單含月曆） |
| README.md | 商品化文件總索引 |

## 使用順序

1. **先確認有效版本**：看 [CURRENT-AND-INVALID-FILES-2026-08-20.md](CURRENT-AND-INVALID-FILES-2026-08-20.md) 與 [V2-HANDOFF-2026-08-20-CURRENT.md](V2-HANDOFF-2026-08-20-CURRENT.md)
2. **平台開通業主**：讀 [OWNER-SUBSCRIPTION-ONBOARDING-SOP.md](OWNER-SUBSCRIPTION-ONBOARDING-SOP.md)
3. **整套架設總覽**：再讀 [INSTALLATION-PACKAGE-SOP.md](INSTALLATION-PACKAGE-SOP.md)
4. 需要獨立客製部署時，再把 `TEMPLATE-CLONE-GUIDE.md` 當歷史套版參考，不得直接沿用 v1 secrets／Notion 步驟
5. 收集業主資料時填 `CLIENT-INFO-CHECKLIST.md` 或 `CLIENT-INFO-FORM.md`
6. 依 `CLIENT-LINE-SETUP-FLOW.md` 與 `LINE-ENTRY-SETUP-FLOW.md` 完成 LINE／LIFF／OA 入口
7. 依需求確認標準版、旗艦版與加購範圍
8. 建置完成後使用 `CLIENT-DELIVERY-CHECKLIST.md` 做手機實機驗收

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
