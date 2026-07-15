# 整套架設流程／安裝包 SOP

> **給老闆看**：賣給新客戶時，照這一份就能複製、架設、驗收、交付。  
> **專案母版**：`beauty-studio-booking`（美業／個人工作室 LINE 預約系統）  
> **讀者**：接案老闆、業務窗口（不必會寫程式）  
> **原則**：只談流程與檢查；**不在本文件放任何 Token、密碼、真實客戶個資**

**口訣**：一個客戶 = 一套帳號 + 一份資料。母版只複製做法，不複製密碼與資料。

---

## 1. 這份安裝包是什麼

| 說法 | 意思 |
|------|------|
| **安裝包／母版** | 已經驗收過的「美業／個人工作室 LINE 預約系統」完整做法（程式＋文件＋流程） |
| **不是** | 直接拿 Demo 網址給正式店用、或多家店共用同一套 Notion／Secrets |
| **怎麼用** | **每個新客戶**都從母版**複製一套**專屬專案與帳號，再換成該客戶資料 |

### 務必記住

1. 母版用來**示範與複製**，不要直接在母版裡改正式客戶資料。  
2. 新客戶上線＝新的 repo／Notion／LINE／Cloudflare 設定（或合約約定由你代管的**專屬於該客戶**的一套）。  
3. 細節步驟分別寫在子文件；本文件是**總流程地圖**。

### 建議搭配閱讀

| 時機 | 文件 |
|------|------|
| 賣什麼、不賣什麼 | [BASELINE-V1-SNAPSHOT.md](BASELINE-V1-SNAPSHOT.md)、[PRODUCT-TEMPLATE-MASTER.md](PRODUCT-TEMPLATE-MASTER.md) |
| 套版總覽 | [TEMPLATE-CLONE-GUIDE.md](TEMPLATE-CLONE-GUIDE.md) |
| 收客戶資料 | [CLIENT-INFO-CHECKLIST.md](CLIENT-INFO-CHECKLIST.md)、[CLIENT-INFO-FORM.md](CLIENT-INFO-FORM.md) |
| Notion | [CLIENT-NOTION-SETUP-FLOW.md](CLIENT-NOTION-SETUP-FLOW.md) |
| LINE Developers／LIFF | [CLIENT-LINE-SETUP-FLOW.md](CLIENT-LINE-SETUP-FLOW.md) |
| 官方帳號入口（圖文選單） | [LINE-ENTRY-SETUP-FLOW.md](LINE-ENTRY-SETUP-FLOW.md) |
| 工程逐步交付 | [CLIENT-DELIVERY-SOP.md](CLIENT-DELIVERY-SOP.md) |
| 交件勾選 | [CLIENT-DELIVERY-CHECKLIST.md](CLIENT-DELIVERY-CHECKLIST.md) |

---

## 2. 每個新客戶要準備什麼

開工前請客戶（或你代辦）備齊：

### 帳號與平台

| 項目 | 用途 | 建議歸屬 |
|------|------|----------|
| **LINE 官方帳號** | 客人加好友、圖文選單入口 | 客戶自己的 |
| **LINE Developers／LIFF** | Login Channel、LIFF App | 客戶名下（或授權你代管） |
| **Notion 工作區** | 服務／時段／預約／店面設定四表 | 客戶或你代管的**專屬區** |
| **Cloudflare Workers** | 後端 API | 通常你代管，但 Secrets 屬該客戶 |
| **GitHub Pages** | 客人端／業主端網頁 | 通常你的 GitHub，但**每客戶獨立 repo 或獨立部署** |

### 客戶營運資料（沒有就不好上線）

- [ ] 店名／品牌名稱  
- [ ] 品牌主色（可選 Logo）  
- [ ] 服務項目、價格、時長（分鐘）  
- [ ] 可預約星期、營業起迄時間  
- [ ] 公告、取消規則  
- [ ] 業主 LINE（用來開管理頁；userId 由系統協助查）  
- [ ] （可選）訂金轉帳：銀行、帳號、戶名、提醒文字  

收資料表：[CLIENT-INFO-FORM.md](CLIENT-INFO-FORM.md)。

---

## 3. 完整架設流程（照順序）

> 下列每一步「誰做」見第 9 節。卡關時打開右側細文件，不要跳步。

| 步驟 | 做什麼 | 細文件 |
|------|--------|--------|
| **1** | **複製專案**（從母版複製 repo；不要帶入 `.dev.vars`） | [TEMPLATE-CLONE-GUIDE.md](TEMPLATE-CLONE-GUIDE.md) |
| **2** | **建 Notion 四表**與必要欄位（服務、時段、預約、店面設定） | [CLIENT-NOTION-SETUP-FLOW.md](CLIENT-NOTION-SETUP-FLOW.md) |
| **3** | **建 Notion Integration** | 同上 |
| **4** | **把 Integration 連到四個資料庫**（沒連＝之後一直 invalid／空白） | 同上 |
| **5** | **取得 Notion Token 與四個 Database ID**（只放後端 Secret／本機 `.dev.vars`，不進前端、不 commit） | 同上 |
| **6** | **建 LINE Login Channel** | [CLIENT-LINE-SETUP-FLOW.md](CLIENT-LINE-SETUP-FLOW.md) |
| **7** | **建 LIFF App**（Size Full；Scope 含 profile、openid） | 同上 |
| **8** | **設定 LIFF ID** 到客人端／業主端 `config.js`（可公開） | 同上 |
| **9** | **設定 Cloudflare Secrets**（Notion、Channel ID、業主 userId 等） | [CLIENT-DELIVERY-SOP.md](CLIENT-DELIVERY-SOP.md) |
| **10** | **部署 Worker**；確認 `/api/health` 正常 | 同上 |
| **11** | **填入 API_BASE_URL**（前端指到該客戶 Worker） | 同上 |
| **12** | **同步 docs**（`customer-ui`→`docs`、`owner-admin`→`docs/owner`） | 腳本／交付 SOP |
| **13** | **設定 GitHub Pages**；LIFF Endpoint／Callback 改成正式 Pages 網址 | LINE＋交付 SOP |
| **14** | **設定 LINE OA 圖文選單入口**（客人預約、業主管理） | [LINE-ENTRY-SETUP-FLOW.md](LINE-ENTRY-SETUP-FLOW.md) |
| **15** | **手機實機驗收**（用客戶 LINE／店長 LINE 勾第 6 節） | 本文件＋驗收範本 |

**建議時機**：訂金收到、資料表大致齊全再開工。

---

## 4. 哪些資料每個客戶都一定要換

新客戶上線時，下列**不可沿用 Demo／上一間店**：

| 一定要換 | 放哪裡（概念） |
|----------|----------------|
| **LIFF ID** | 前端 `config.js`（可公開） |
| **LIFF Channel ID**（＝Login Channel 的 Channel ID，不是 LIFF ID） | Cloudflare Secret／本機 `.dev.vars` |
| **OWNER_LINE_USER_IDS** | Cloudflare Secret／本機 `.dev.vars` |
| **Notion Token** | 同上（後端 only） |
| **Notion Database IDs**（四表） | 同上 |
| **API_BASE_URL** | 前端 `config.js`（該客戶 Worker 網址） |
| **GitHub Pages 網址** | LIFF Endpoint、Callback、圖文選單連結 |
| **LINE OA 圖文選單入口** | 指到該客戶 LIFF，不要留 Demo 連結 |
| **品牌名稱／主色／服務項目／營業時段** | Notion＋業主端設定（依客戶資料建） |

記住：

- **LIFF ID** ≠ **Channel ID（LIFF_CHANNEL_ID）**  
- 前端只能出現「LIFF ID + API 網址」這類公開設定，不能出現 Token。

---

## 5. 哪些東西不能複製錯

| 禁止事項 | 為什麼 |
|----------|--------|
| ❌ 沿用上一個客戶的 **Notion Token** | 會讀寫別人店的資料 |
| ❌ 沿用上一個客戶的 **Notion 資料庫** | 預約串店、隱私災難 |
| ❌ 把 **`.dev.vars` commit** 上 GitHub | 密碼外洩 |
| ❌ 把 **Token 放前端**（HTML／JS／Pages） | 訪客看得見就能盜用 |
| ❌ 把客戶資料**帶回母版**混改 | 母版變髒、下一家難複製、責任不清 |
| ❌ 沿用 Demo／舊店的 **OWNER_LINE_USER_IDS** | 錯的人能開管理後台 |
| ❌ 多家店共用同一組 Cloudflare Secrets | 等於共用後門 |

**可以複製**：程式架構、文件流程、驗收方式、報價邏輯。  
**不可複製共用**：Token、DB ID、Secrets、Demo 當正式入口、業主 userId。

---

## 6. 交付前檢查表（手機實機）

> 用**客戶自己的**官方帳號入口測；不要只在電腦開 Pages。

### 客人端

- [ ] 客戶端可登入（LINE LIFF 正常）
- [ ] 可看到月曆
- [ ] 可選有空位日期（約滿／未開放不可點）
- [ ] 長時間服務不會重疊（長時服務須整段空檔）
- [ ] 可完成預約
- [ ] 預約成功畫面明顯
- [ ] 「我的預約」排序正確（已確認在上、已取消在下等既有規則）
- [ ] 取消預約有二次確認（自訂彈窗，不是硬摸黑點取消）
- [ ] （若有開）訂金轉帳資訊可顯示

### 業主端

- [ ] 業主端可登入（授權帳號）
- [ ] 業主可看月曆、點日期看當日預約
- [ ] 業主可查客戶資料（客戶名單／歷史預約，基礎款已含方向）
- [ ] 業主可取消預約並填原因
- [ ] 店面設定／服務／時段可改（依交付範圍）
- [ ] 非業主無法操作管理功能

### 安全必勾

- [ ] 前端無 Token  
- [ ] `.dev.vars` 未進 Git  
- [ ] 未混用 Demo／他店 Secrets 與 DB  

驗收紀錄可參考：[DEMO-ACCEPTANCE-2026-07-14.md](DEMO-ACCEPTANCE-2026-07-14.md)、[ACCEPTANCE-customer-profile-2026-07-15.md](ACCEPTANCE-customer-profile-2026-07-15.md)。

---

## 7. 安裝包交付模式

### 基礎款包含哪些功能（對外可這樣講）

- 客人 LINE 預約：選服務 → 月曆選日 → 選時段 → 預約／取消  
- 長時服務連續空檔與重疊防呆  
- 客人姓名／電話（必填）／生日（選填）  
- 業主 LINE 管理：月曆查預約、服務、營業時段、店面設定  
- 業主客戶資料查詢、業主取消預約（含原因）  
- 訂金轉帳「顯示帳號」可選（**不是**線上刷卡金流）  
- owner 權限後端驗證  

完整斷點：[BASELINE-V1-SNAPSHOT.md](BASELINE-V1-SNAPSHOT.md)。

### 加購模組有哪些（要另報價）

| 加購 | 說明 |
|------|------|
| 包卡／堂數卡 | 購買次數、扣堂 |
| 儲值金 | 預儲、扣款 |
| 剩餘堂數／開卡狀態／扣堂紀錄 | 搭配包卡或儲值 |
| （規劃中）其他營運報表等 | 見加購規劃文件 |

詳見：[ADDON-PACKAGE-STORED-VALUE-MODULE.md](ADDON-PACKAGE-STORED-VALUE-MODULE.md)、[PRICING-PACKAGES.md](PRICING-PACKAGES.md)。

### 哪些功能先不做（基礎安裝包不要承諾）

- 線上刷卡／LINE Pay／自動對帳金流  
- 多員工、多分店排班  
- SaaS 多租戶同一後台切換  
- 把「小型教室多人一團」硬套進美業一對一邏輯（屬另一產品線）  

產品線差異：[PRODUCT-LINE-COMPARISON.md](PRODUCT-LINE-COMPARISON.md)。

### 改版原則

- **每次客戶改版／客製** → 另開任務包，在**該客戶專案**做。  
- **不要**把單一客戶奇葩需求直接混進母版，除非你決定「全線基礎款都要有」並另行凍結新斷點。  
- 母版升級基礎款功能時：先在母版驗收 → 再決定要不要同步到已售出客戶（通常另計維護）。

---

## 8. 常見踩坑

| 症狀 | 常見原因 | 怎麼想 |
|------|----------|--------|
| 登入／API 驗證怪 | **LIFF ID** 和 **Channel ID** 搞混 | Channel ID 只放後端 Secret；前端只放 LIFF ID |
| Notion 讀不到／空 | Integration **沒連到**資料庫 | 每個 DB 都要邀請 Integration |
| `API token invalid` | Token 錯、過期、或連錯工作區 | 換正確 Integration Token；不要貼到前端 |
| LINE 開到舊畫面 | GitHub Pages **沒同步 docs** 或 `?v=` 沒升 | sync → push → LINE 內重開 |
| LINE 仍舊版快取 | WebView 快取 | 升 `?v=`、關 LIFF 重開 |
| 業主突然不能管 | owner **登入過期**／ID Token 失效 | 重新從官方帳號進管理頁登入 |
| Secrets 有設仍失敗 | Cloudflare Secrets 已設但**忘記 deploy** 新程式 | 改程式後要再 deploy |
| 欄位怎麼都不對 | Notion **欄位名稱少一個字／全形半形** | 欄位名必須與文件完全一致 |
| 客人約得到但入口找不到 | 圖文選單還指 **Demo** | 換正式 LIFF；見入口 SOP |
| 人人變業主 | 白名單過寬或後端沒驗證 | **立刻停用**，走安全審查 |

---

## 9. Cursor／Codex／老闆分工

| 角色 | 負責 | 不負責（通常） |
|------|------|----------------|
| **老闆** | 接案、報價、收資料、確認需求、**手機實機驗收**、跟客戶溝通 | 自己猜 Secrets、自己亂 push 正式環境 |
| **Cursor** | 照任務包改檔、跑約定測試、整理 🟨 回報 | 擅自決定是否 push／deploy／碰本番資料 |
| **Codex** | 判斷流程、拆任務、**安全審查**、整理／審 SOP | 代替老闆做商務承諾 |
| **終端機** | 只做檢查指令、約定好的 git／測試／（經核准的）deploy | 把密碼印在聊天紀錄 |

### 建議節奏

1. 老闆確認範圍（基礎款 vs 加購）→ 收資料表  
2. Codex／文件對齊流程 → 產出任務包給 Cursor  
3. Cursor 執行與回報 → Codex 審查  
4. 核准後才 deploy／push  
5. 老闆手機勾第 6 節 → 交件  

### AI 使用規則

見 [AI-USAGE-RULES.md](AI-USAGE-RULES.md)。

---

## 10. 交件一句話（可對客戶說）

> 這是專屬於妳工作室的 LINE 預約系統：客人從官方帳號點預約，妳從官方帳號點管理；資料在妳的（或約定代管的）Notion，不是跟別家店共用。

---

*文件版本：1.0｜整套架設流程／安裝包 SOP｜不含任何 Token、密碼或真實客戶個資*
