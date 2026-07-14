# 基礎款 v1.0 母版斷點

> **給老闆看**：這份文件記錄「目前可以當成母版賣／複製給新客戶」的基礎款停損點。  
> **斷點日期**：2026-07-15  
> **版本名稱**：**基礎款 v1.0**  
> **專案**：`beauty-studio-booking`  
> **狀態**：正式可用（Demo／母版），後續新功能請從這個斷點之後另開任務

**一句話**：客人從 LINE 用月曆預約；業主從 LINE 用月曆管店；資料在 Notion；**不含**包卡／儲值／金流。

---

## 1. 基礎款 v1.0 已包含

### 客人端

| 功能 | 白話 |
|------|------|
| 客人端 LINE LIFF 預約 | 從 LINE 開啟預約頁並登入 |
| 客人端月曆選日期 | 選服務後出現整月月曆 |
| 只顯示有空檔的日期 | 沒開放／已過期／約滿／今日已過時段 → 灰色不可點 |
| 點日期後顯示可預約時段 | 點可約日才出現時段按鈕 |
| 長時間服務鎖連續時段 | 120／180 分須整段空著才可約；避免與別人重疊（首尾相接可以） |
| 我的預約／取消 | 查看與取消自己的預約 |

### 業主端

| 功能 | 白話 |
|------|------|
| 業主端 LINE LIFF 管理 | 僅授權業主可進管理頁 |
| 業主端月曆查看整月預約 | 看哪些天有預約 |
| 點日期看當日預約 | 列出當日客人與時段 |
| 服務項目管理 | 新增、修改、上架／下架 |
| 營業時段管理 | 每週哪幾天、幾點到幾點 |
| 店面設定 | 店名、主色、公告等 |
| **訂金轉帳顯示（可選）** | 業主可開關並填銀行帳號；客人預約成功後看到轉帳資訊（**不是金流**） |
| owner 權限由後端驗證 | 不是藏按鈕而已，伺服器會擋非業主 |

### 技術架構（知道即可）

| 組件 | 用途 |
|------|------|
| Notion | 資料庫（服務、時段、預約、店面設定） |
| Cloudflare Workers | API |
| GitHub Pages | 客人／業主前端網頁 |
| LINE LIFF | 用 LINE 開網頁 |

---

## 2. 目前不包含（後續加購或進階）

下列**不要**說成基礎款已含，客戶要就**另報價**：

| 項目 | 類型 |
|------|------|
| 包卡 | 加購（規劃中，未實作） |
| 儲值金 | 加購（規劃中，未實作） |
| 剩餘堂數、已開卡／未開卡、扣堂紀錄 | 加購 |
| 金流（線上刷卡／LINE Pay／自動對帳） | 進階／另案（**訂金轉帳「只顯示帳號」屬基礎可選，不是金流**） |
| 多員工 | 進階／另案 |
| 報表 | 進階／另案 |
| SaaS 多租戶 | 進階／另案 |

加購規劃文件：`ADDON-PACKAGE-STORED-VALUE-MODULE.md`（若尚未 commit，僅作內部規劃草稿）。

---

## 3. 目前正式可用資訊（母版 Demo 環境）

> 僅公開網址與版本識別，**不含任何 Token／密碼**。  
> 新客戶上線時須換成**該客戶自己的**帳號與網址，不可共用本 Demo。

| 項目 | 值 |
|------|-----|
| Worker URL | https://beauty-studio-api.gosu-chill-book.workers.dev |
| GitHub Pages 客人端 | https://julietbizlab-svg.github.io/beauty-studio-booking/ |
| GitHub Pages 業主端 | https://julietbizlab-svg.github.io/beauty-studio-booking/owner/ |
| 基礎款斷點 commit | `b9748e3`（完整：`b9748e3475ff99b0babb5fc2a8b4fd5af65e50eb`） |
| Worker version id | `393c7c87-e997-4ddc-b711-0081b7f1f3d9` |
| 對應功能里程碑 | 長時服務重疊防呆已上線：`Fix booking overlap for long services` |

### 老闆使用提醒

1. **接新客戶**：從這個斷點的程式母版複製 → 換帳號／Secrets／Notion／LIFF（見 [TEMPLATE-CLONE-GUIDE.md](TEMPLATE-CLONE-GUIDE.md)）。  
2. **報價**：月曆、長時防重疊已進基礎款，勿當加購另賣。  
3. **包卡／儲值**：等實作完成再加進報價單；現在只能預售／另案。  
4. **不要**把 Demo 的 Notion、Secrets、業主 LINE ID 交給正式客戶共用。

---

## 4. 相關文件

| 文件 | 用途 |
|------|------|
| [PRODUCT-TEMPLATE-MASTER.md](PRODUCT-TEMPLATE-MASTER.md) | 商品母版總說明 |
| [TEMPLATE-CLONE-GUIDE.md](TEMPLATE-CLONE-GUIDE.md) | 新客戶怎麼套版 |
| [DEMO-ACCEPTANCE-2026-07-14.md](DEMO-ACCEPTANCE-2026-07-14.md) | Demo 驗收紀錄 |
| [PRICING-PACKAGES.md](PRICING-PACKAGES.md) | 報價方案 |

---

*文件版本：1.0｜基礎款 v1.0 母版斷點｜不含任何 Token、密碼或客戶個資*
