# JULIET 單一展示 OA 設定手冊

適用環境：Beauty Studio Booking v2／v2-test  
現行方向：標準與旗艦展示共用 `JULIET Studio OS｜工作室` OA；方案 tenant 與功能仍保持隔離。

---

## 1. OA 基本資料（可貼入 LINE Official Account Manager）

| 欄位 | 建議內容 |
|------|----------|
| OA 名稱 | JULIET Studio OS｜工作室 |
| 狀態訊息 | 美甲・美睫預約與店務管理展示 |
| 帳號介紹 | Juliet Studio OS 標準版展示，提供美甲、美睫、睫毛嫁接與睫毛管理的預約及業主管理流程體驗。 |

### 歡迎訊息建議

```text
歡迎來到 Juliet Studio OS 標準版展示。

• 業主請點選「業主端」
• 體驗預約請點選「客戶端」

本帳號為標準版展示環境，適用美甲、美睫與相關店務流程。
```

注意：

- 不要承諾真人立即回覆
- 不要加入醫療或療效內容
- 不要提及 tenant、v2-test、Demo、內部技術字樣
- 不要放入平台管理中心入口

---

## 2. 圖文選單素材

| 檔案 | 用途 |
|------|------|
| `owner-showcase/rich-menu-standard.svg` | 可編輯原稿 |
| `owner-showcase/rich-menu-standard.png` | 上傳用成品（2500×843） |

旗艦版素材（請勿覆蓋）：

- `owner-showcase/rich-menu-flagship.svg`

色系：

- 標準版：米色／暖裸
- 旗艦版：藕粉

文案僅「業主端」「客戶端」，不含 AI、霧眉、霧唇、新客評估、平台管理。

---

## 3. 左右按鈕用途與點擊區

半高圖文選單尺寸：`2500 × 843`

| 區塊 | 畫面文案 | 建議點擊區（整半幅） | 用途 |
|------|----------|----------------------|------|
| 左 | 業主端 | X `0–1250`，Y `0–843` | 進入共用 Owner Hub，選標準版展示 tenant |
| 右 | 客戶端 | X `1250–2500`，Y `0–843` | 進入標準版客戶預約 |

兩區各占一半，避免中間死角。

---

## 4. 業主端與客戶端入口

以下 LIFF ID 取自前端公開設定（`customer-ui`／`owner-admin`／`docs` 的 `config.js` 與 `frontend-config.test.js`），不含 secret。

### 業主端（左）

| 項目 | 值 |
|------|----|
| 用途 | 共用 Owner Hub |
| Pages | `https://v2-test.juliet-studio.pages.dev/owner/hub/` |
| LIFF | `https://liff.line.me/2010868233-3ziIABwR` |
| 規則 | 登入後必須選**標準版展示 tenant**；不得進平台管理中心；功能以後端 `plan=standard` 為準 |

建議圖文選單連結使用 LIFF URL（讓 LINE 登入正確帶入）。

### 客戶端（右）

| 項目 | 值 |
|------|----|
| 用途 | 標準版客戶預約 |
| Pages 路徑 | `/standard/customer/` |
| Pages | `https://v2-test.juliet-studio.pages.dev/standard/customer/` |
| 共用展示 LIFF | `https://liff.line.me/2010530394-QcklvIHd` |
| 規則 | 標準與旗艦共用登入 Channel；由安全展示路徑決定 showcase context，不由前端傳 tenant ID |

### 與旗艦展示對照（實機分流）

| OA | 業主端 | 客戶端 |
|----|--------|--------|
| JULIET Studio OS｜工作室（標準按鈕） | Owner Hub → 標準展示 tenant | `/standard/customer/` + 共用展示 LIFF |
| JULIET Studio OS｜工作室（旗艦按鈕） | Owner Hub → 旗艦展示 tenant | `/flagship/showcase/customer` + 共用展示 LIFF |

---

## 5. LINE Official Account Manager 人工步驟

1. 開啟 `JULIET Studio OS｜工作室` 官方帳號；不要再建立獨立標準或旗艦展示 OA。
2. 填入名稱、狀態訊息、帳號介紹、歡迎訊息（見第 1 節）。
3. 圖文選單 → 建立新選單 → 上傳 `rich-menu-standard.png`。
4. 選單模板選「大圖兩格（橫向半高）」或等價 2500×843 兩區。
5. 左區動作：連結 → 業主 LIFF URL。
6. 右區動作：連結 → 共用展示 LIFF 的標準路徑。
7. 設為預設選單並發布。
8. 確認選單上無平台管理、AI、霧眉／霧唇、v2-test 等文字。

---

## 6. LINE Developers／LIFF 人工核對

- [ ] 共用展示 LIFF Endpoint 可保留標準或旗艦展示路徑並正確回到 Pages
- [ ] 業主 Hub LIFF Endpoint 指向 `…/owner/hub/`
- [ ] 同一 OA 的標準與旗艦按鈕分別指向正確展示路徑
- [ ] 標準 OA **沒有**平台管理中心連結
- [ ] Channel Secret／Messaging Token 僅留在 Developers／伺服器，不寫進圖文選單或本文件

---

## 7. 四項實機驗收

1. **標準 OA → 業主端**  
   可進 Owner Hub；選到標準展示工作室；看不到平台管理中心；無旗艦專屬 AI／匯入入口（以後端 plan 為準）。

2. **標準 OA → 客戶端**  
   進入 `/standard/customer/`；可走美甲／美睫預約；無霧眉／霧唇問卷、無客戶 AI。

3. **旗艦 OA → 業主端**  
   仍進旗艦展示 tenant／旗艦流程；與標準 OA 互不混亂。

4. **旗艦 OA → 客戶端**  
   仍走旗艦客戶入口；可與標準客戶端並存。

另驗：

- [ ] 標準版不得出現 AI、客戶匯入或霧眉／霧唇評估
- [ ] 不記錄 token、secret 或 LINE user ID

---

## 8. 標準版展示 tenant

| 項目 | 值 |
|------|----|
| tenant ID | `acceptance-tenant_beauty_studio_default-beige` |
| 顯示名稱 | 美甲師／美睫師專屬後台 |
| 業主 | 朱飛霏 |
| plan | `standard` |
| `platform_acceptance_mode` | `false` |
| location ID | `acceptance-location-tenant_beauty_studio_default-beige` |
| staff ID | `acceptance-owner-tenant_beauty_studio_default-beige` |

客戶端映射：`/standard/customer/` → `SHOWCASE_CONTEXT=standard` → Worker `STANDARD_SHOWCASE_*` 白名單（不由前端傳 tenant ID）。

旗艦 tenant `acceptance-tenant_beauty_studio_default-mauve` 僅供旗艦展示，本文件不改動。

平台管理主帳號 `tenant_beauty_studio_default` 不得當展示 tenant。

---

## 9. 架構提醒（三帳分離）

1. **平台管理主帳號**：僅平台負責人；不展示、不改綁、不暴露管理入口。  
2. **旗艦展示按鈕**：霧眉／霧唇、旗艦、評估與 AI。  
3. **標準展示按鈕**：美甲／美睫、標準版、無霧眉霧唇問卷、無 AI；仍使用獨立 standard tenant。
