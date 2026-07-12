# Cursor 任務包：Owner API 身分驗證安全修正

> **專案**：`beauty-studio-booking`  
> **建立日期**：2026-07-12  
> **狀態**：待執行  
> **優先級**：高（資安）

---

## 1. 目標

修正 owner API **不可直接信任前端傳入 `userId`** 的安全漏洞。

### 現況問題

目前 `backend/src/index.js` 中，所有 `/api/owner/*` 路由皆從 **query 或 JSON body** 讀取 `userId`，再呼叫 `requireOwner(env, userId)`：

```javascript
// 現況（不安全）：userId 可被偽造
var ownerUserId = url.searchParams.get("userId");
requireOwner(env, ownerUserId);
```

`requireOwner`（`backend/src/owner-auth.js`）僅比對 `env.OWNER_LINE_USER_IDS` 白名單，**無法確認請求是否真的來自該 LINE 帳號**。攻擊者若知道（或猜到）業主的 LINE userId，即可用 curl 呼叫 owner API，修改服務、營業時段、店面設定。

### 修正後應達成

1. Owner 身分必須由**後端**從可驗證來源取得（LINE ID Token），不可僅依賴 query/body 的 `userId`。
2. 採 **fail closed**：無有效 token 或驗證失敗 → 回傳 `401` 或 `403`，不執行任何 owner 操作。
3. 本任務**僅改後端**；前端畫面不動。前端傳 token 的配套列為獨立後續任務（見「不做範圍」）。

---

## 2. 涉及檔案

| 檔案 | 動作 | 說明 |
|------|------|------|
| `backend/src/liff-verify.js` | **新增** | LINE ID Token 伺服器端驗證 |
| `backend/src/owner-auth.js` | **修改** | 新增 `requireOwnerFromRequest()`，整合 token 驗證 + 白名單 |
| `backend/src/index.js` | **修改** | 所有 `/api/owner/*` 改呼叫新驗證函式 |
| `backend/.dev.vars.example` | **修改**（僅範本） | 補充 `LIFF_CHANNEL_ID` 說明 |
| `backend/wrangler.toml` | **不建議改** | 機密不放此處 |

### 受影響的 owner API 路由（共 8 處）

| 方法 | 路徑 | 目前 userId 來源 |
|------|------|------------------|
| GET | `/api/owner/today` | `query.userId` |
| GET | `/api/owner/services` | `query.userId` |
| POST | `/api/owner/services` | `body.userId` |
| PATCH | `/api/owner/services/:id` | `body.userId` |
| GET | `/api/owner/slots` | `query.userId` |
| POST | `/api/owner/slots` | `body.userId` |
| GET | `/api/owner/settings` | `query.userId` |
| PATCH | `/api/owner/settings` | `body.userId` |

---

## 3. 不可修改檔案

執行本任務時，**禁止修改**以下檔案：

| 類別 | 路徑 | 原因 |
|------|------|------|
| 客人端前端 | `customer-ui/**` | 與本任務無關 |
| 業主端前端 | `owner-admin/**` | 本任務不改前端畫面與 API 客戶端 |
| 部署產物 | `docs/**` | 由 sync 腳本產生 |
| Notion 資料層 | `backend/src/notion.js` | 不涉及資料庫邏輯 |
| 時段計算 | `backend/src/slots.js` | 不涉及權限 |
| 真實機密 | `backend/.dev.vars` | 任務執行期間不動真實 secrets |
| 文件（除非另指示） | `CLIENT-SETUP-GUIDE.md`、`README.md` | 本任務專注後端 |

---

## 4. 不做範圍

以下**不在本任務內**，請勿順手修改：

| 項目 | 說明 |
|------|------|
| 前端畫面 / UI | 不修改任何 HTML、CSS |
| 前端 API 客戶端 | 不修改 `owner-admin/js/api.js`（後續獨立任務） |
| 客人端 API | `/api/bookings`、`/api/bookings/me`、`/api/bookings/cancel` 的 userId 信任問題另案處理 |
| Notion 真實資料 | 測試時不可寫入正式客戶資料庫 |
| Token 寫入前端設定 | `config.js` 不可放任何 secret |
| 修改 `.dev.vars` | 本任務不直接編輯；僅更新 `.dev.vars.example` 文件 |
| 金流 / 多員工 / 報表 | MVP 範圍外 |
| CORS 大改 | 僅確保 `Authorization` header 已在 OPTIONS 允許（目前已允許） |

### 後續獨立任務（本包完成後）

- **TASK-OWNER-FRONTEND-AUTH**：`owner-admin/js/api.js` 在每次請求帶入 `Authorization: Bearer <idToken>`（`liff.getIDToken()`），並移除 query/body 中的 `userId`（或保留僅供除錯、後端忽略）。

---

## 5. 實作步驟

### 階段規劃

| 階段 | 內容 | 本任務是否包含 |
|------|------|----------------|
| **Phase 1** | 後端 fail closed + ID Token 驗證模組 | ✅ 是 |
| **Phase 2** | 前端傳送 ID Token | ❌ 否（後續任務） |
| **Phase 3** | 客人端 booking API token 驗證 | ❌ 否（另案） |

---

### Step 1：新增 `backend/src/liff-verify.js`

實作 LINE ID Token 伺服器端驗證。

**輸入**：`idToken`（字串）、`env`（需 `LIFF_CHANNEL_ID`）

**流程**：
1. 若 `idToken` 為空 → throw `401`「缺少登入憑證」
2. 呼叫 LINE Verify API：
   ```
   POST https://api.line.me/oauth2/v2.1/verify
   Content-Type: application/x-www-form-urlencoded

   id_token=<token>&client_id=<LIFF_CHANNEL_ID>
   ```
3. 回應非 200 或解析失敗 → throw `401`「登入憑證無效或已過期」
4. 從回應取 `sub` 作為 **已驗證的 LINE userId**
5. 回傳 `{ userId: sub, name, picture }`（僅需 `userId` 亦可）

**參考**：LINE Login v2.1 ID Token 驗證文件  
https://developers.line.biz/en/docs/line-login/verify-id-token/

**注意**：
- `LIFF_CHANNEL_ID` = LINE Developers 上該 LIFF 所屬 Channel 的 **Channel ID**（數字），不是 LIFF ID
- 不可把 channel secret 放前端；驗證 ID token 只需 `client_id`（channel id）

---

### Step 2：擴充 `backend/src/owner-auth.js`

新增函式，**取代** owner 路由直接呼叫 `requireOwner(env, userId)` 的模式：

```javascript
/**
 * 從 request 驗證業主身分（fail closed）
 * @returns {string} 已驗證的 owner userId
 */
export async function requireOwnerFromRequest(request, env) {
  // 1. 從 Authorization: Bearer <idToken> 取 token
  // 2. await verifyLineIdToken(idToken, env) → verifiedUserId
  // 3. isOwnerUser(env, verifiedUserId) 否則 403
  // 4. （選用）若 query/body 也有 userId 且與 verified 不符 → 403「身分不一致」
  // 5. return verifiedUserId
}
```

**保留**既有 `parseOwnerUserIds`、`isOwnerUser` 供單元測試與白名單比對。  
`requireOwner(env, userId)` 可標記 `@deprecated` 或改為僅內部由 `requireOwnerFromRequest` 呼叫。

**Fail closed 規則**：
- 無 `Authorization` header → `401`
- Token 格式錯誤 → `401`
- LINE 驗證失敗 → `401`
- 驗證成功但不在 `OWNER_LINE_USER_IDS` → `403`
- **不可**在無 token 時 fallback 使用 query/body 的 `userId`

---

### Step 3：修改 `backend/src/index.js`

對所有 `/api/owner/*` 路由：

**修改前**：
```javascript
var ownerUserId = url.searchParams.get("userId");
requireOwner(env, ownerUserId);
```

**修改後**：
```javascript
await requireOwnerFromRequest(request, env);
// 不再使用 query/body 的 userId 做授權決策
```

具體位置（行號供參考，以實際檔案為準）：

| 行號（約） | 路由 |
|-----------|------|
| 132–135 | GET `/api/owner/today` |
| 145–148 | GET `/api/owner/services` |
| 153–156 | POST `/api/owner/services` |
| 161–165 | PATCH `/api/owner/services/:id` |
| 170–173 | GET `/api/owner/slots` |
| 178–181 | POST `/api/owner/slots` |
| 186–189 | GET `/api/owner/settings` |
| 194–197 | PATCH `/api/owner/settings` |

`readJson` 與業務邏輯（`createService`、`updateSettings` 等）維持不變；僅授權層替換。

---

### Step 4：更新 `backend/.dev.vars.example`（僅範本）

新增說明（不填真實值）：

```bash
# LINE Login Channel ID（用於驗證 LIFF ID Token，在 LINE Developers → Basic settings 可見）
LIFF_CHANNEL_ID=1234567890
```

並註明：正式環境透過 `wrangler secret put LIFF_CHANNEL_ID` 或 `secret bulk` 設定。

---

### Step 5：本地驗證（不碰正式 Notion）

1. 使用測試用 `.dev.vars`（或 wrangler dev 的 vars）
2. `npm run dev` 啟動本機 API
3. 依「測試指令」章節執行 curl
4. 確認無 token 時 owner API 全部拒絕

---

## 6. 驗收標準

### 必須通過（本任務完成定義）

- [ ] 新增 `backend/src/liff-verify.js`，可驗證 LINE ID Token 並回傳 `sub`
- [ ] `requireOwnerFromRequest` 實作完成，且為 **fail closed**
- [ ] 8 個 owner API 皆改為使用 `requireOwnerFromRequest`，不再以 query/body `userId` 作為授權依據
- [ ] 無 `Authorization` header 的 owner 請求 → `401` + `{ ok: false, message: "..." }`
- [ ] 無效 token 的 owner 請求 → `401`
- [ ] 有效 token 但 userId 不在白名單 → `403`
- [ ] 有效 token 且在白名單 → 正常回應（與修改前行為一致）
- [ ] 客人端 API（`/api/services`、`/api/bookings` 等）行為不變
- [ ] 未修改 `owner-admin/**`、`customer-ui/**`
- [ ] 未修改 `backend/.dev.vars` 真實檔
- [ ] 未將任何 token / secret 寫入前端或 commit

### 預期副作用（可接受，需記錄）

- [ ] **業主管理頁在 Phase 2 完成前將無法呼叫 owner API**（因前端尚未送 ID Token）— 這是預期的 fail closed 行為，需在交付說明中註明

### 建議加強（非必須）

- [ ] query/body 若帶 `userId` 且與 token 的 `sub` 不一致 → `403`（防止混淆攻擊）
- [ ] 驗證失敗 log（不含完整 token，僅記錄原因與時間）

---

## 7. 測試指令

> 將 `API_BASE` 換為本機 `http://127.0.0.1:8787` 或部署網址。  
> 將 `FAKE_OWNER_ID` 換為白名單內真實 owner userId。  
> **不要**對正式 Notion 環境執行 POST/PATCH 寫入測試；GET 與授權測試優先。

### 7.1 健康檢查（對照組，應成功）

```bash
curl -s "$API_BASE/api/health" | jq .
```

預期：`{ "ok": true, ... }`

---

### 7.2 偽造 userId、無 token（應失敗 — 修正後核心驗收）

```bash
# 模擬攻擊：知道 owner userId，但無 LINE token
curl -s -w "\nHTTP %{http_code}\n" \
  "$API_BASE/api/owner/today?userId=$FAKE_OWNER_ID"
```

**修正前（漏洞）**：`200` + 預約資料  
**修正後（預期）**：`401` + `{ "ok": false, "message": "缺少登入憑證" }`（或類似訊息）

---

### 7.3 偽造 body userId、無 token（應失敗）

```bash
curl -s -w "\nHTTP %{http_code}\n" \
  -X PATCH "$API_BASE/api/owner/settings" \
  -H "Content-Type: application/json" \
  -d "{\"userId\":\"$FAKE_OWNER_ID\",\"brandName\":\"被駭入的店名\"}"
```

**修正後（預期）**：`401`，Notion 資料不被修改

---

### 7.4 無效 Bearer token（應失敗）

```bash
curl -s -w "\nHTTP %{http_code}\n" \
  -H "Authorization: Bearer invalid.token.here" \
  "$API_BASE/api/owner/services?userId=$FAKE_OWNER_ID"
```

**預期**：`401`「登入憑證無效或已過期」

---

### 7.5 有效 token + 非 owner 帳號（應失敗）

需從非 owner 的 LINE 帳號在 LIFF 內取得真實 `idToken`（瀏覽器 console：`liff.getIDToken()`）：

```bash
curl -s -w "\nHTTP %{http_code}\n" \
  -H "Authorization: Bearer $NON_OWNER_ID_TOKEN" \
  "$API_BASE/api/owner/today"
```

**預期**：`403`「無業主管理權限」

---

### 7.6 有效 token + owner 白名單帳號（應成功）

```bash
curl -s -w "\nHTTP %{http_code}\n" \
  -H "Authorization: Bearer $OWNER_ID_TOKEN" \
  "$API_BASE/api/owner/today"
```

**預期**：`200` + 今日預約資料

---

### 7.7 確認客人端未受影響

```bash
curl -s "$API_BASE/api/services" | jq 'length'
curl -s "$API_BASE/api/settings" | jq .
```

**預期**：與修改前相同，不需 Authorization

---

### 7.8 取得 ID Token 的方式（手動測試用）

在業主 LIFF 頁登入後，於瀏覽器 DevTools Console：

```javascript
liff.getIDToken()
```

複製輸出作為 `$OWNER_ID_TOKEN`。**勿將 token 提交到 Git。**

---

## 8. 風險

| 風險 | 嚴重度 | 說明 | 緩解 |
|------|--------|------|------|
| 業主頁暫時無法使用 | 高（營運） | 後端 fail closed 後，前端尚未送 token | 尽快執行 Phase 2；或短期內不部署到正式環境直到前後端一起上 |
| `LIFF_CHANNEL_ID` 設定錯誤 | 高 | 所有合法 owner 請求都 401 | 部署前用 7.6 驗證；文件註明 Channel ID ≠ LIFF ID |
| LINE Verify API 不可用 | 中 | 業主 API 全部失敗 | 回傳明確 502 訊息；勿 fallback 到 query userId |
| ID Token 過期 | 低 | LIFF token 有效期有限 | 前端 Phase 2 需在 401 時提示重新整理 / 重新登入 |
| 本機測試誤寫正式 Notion | 高 | POST/PATCH 測試改到真實資料 | 測試以 GET + 授權失敗案例為主；寫入測試用測試資料庫 |
| CORS preflight | 低 | 前端加 Authorization 後可能 preflight | `index.js` 已允許 `Authorization` header；Phase 2 再驗證 |

---

## 9. Rollback 方式

### 9.1 程式碼回復

```bash
cd backend
git checkout HEAD -- src/index.js src/owner-auth.js
git clean -f src/liff-verify.js   # 若為新檔
```

或 revert 整個 commit：

```bash
git revert <commit-sha>
```

### 9.2 部署回復

```bash
cd backend
git checkout <previous-commit> -- src/
npx wrangler deploy
```

### 9.3 設定回復

- 若已新增 `LIFF_CHANNEL_ID` secret，可保留（無害）或 `wrangler secret delete LIFF_CHANNEL_ID`
- **不需**還原 Notion 資料（本任務不應改動資料庫內容）

### 9.4 回復後狀態

- Owner API 恢復為「信任 query/body userId」的舊行為（有安全漏洞）
- 業主前端無需變更即可恢復運作

---

## 附錄 A：給 Cursor Agent 的執行提示詞

可直接複製以下內容作為 Cursor 任務開場：

```
請閱讀 beauty-studio-booking/TASK-owner-api-auth.md，嚴格依任務包執行。

重點：
1. 只改 backend/src/liff-verify.js（新增）、owner-auth.js、index.js，以及 .dev.vars.example
2. 不要改 owner-admin、customer-ui、notion.js、.dev.vars
3. owner API 必須 fail closed：只接受 Authorization Bearer 的 LINE ID Token，驗證 sub 後再比對 OWNER_LINE_USER_IDS
4. 不可在無 token 時 fallback 使用 query/body userId
5. 完成後用 curl 測試 7.2、7.3、7.4 應回 401/403
```

---

## 附錄 B：現況程式碼錨點

### `owner-auth.js` — 目前僅白名單比對

```23:28:backend/src/owner-auth.js
export function requireOwner(env, userId) {
  if (!isOwnerUser(env, userId)) {
    var error = new Error("無業主管理權限");
    error.status = 403;
    throw error;
  }
}
```

### `index.js` — 典型漏洞模式（共 8 處類似）

```132:135:backend/src/index.js
      if (url.pathname === "/api/owner/today" && request.method === "GET") {
        ensureNotionEnv(env);
        var ownerUserId = url.searchParams.get("userId");
        requireOwner(env, ownerUserId);
```

---

*任務包版本：1.0｜對應程式版本：beauty-studio-booking MVP*
