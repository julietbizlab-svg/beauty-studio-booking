# Tenant 專屬 LINE Channel Routing

狀態：v2-test 已部署 tenant routing、專屬 webhook 與展示 OA cutover；正式 tenant registry 與 production 尚未部署。

## 邊界

- 每個正式 tenant 使用自己的 LINE Provider、Messaging API channel、LINE Login／LIFF 與 access token。
- 一般 tenant 不得回退 JULIET 共用 OA；缺少映射時通知保留 queued，需補齊設定後才可發送。
- token、Channel Secret 不進前端、不進 D1、不進安裝包、不寫入 `wrangler.toml`。
- 現有 default／standard showcase／flagship showcase 環境變數暫留相容；一般 tenant 走 registry。

## 本機 registry 契約

Worker secret 名稱為 `LINE_TENANT_CHANNELS_JSON`，內容是以 tenant ID 為 key 的 JSON object：

```json
{
  "tenant-example": {
    "providerId": "provider-id",
    "messagingAccessToken": "secret-value",
    "liffClientIds": ["customer-login-channel-id", "owner-login-channel-id"],
    "webhookSecret": "secret-value",
    "webhookRouteKey": "random-opaque-value-at-least-32-characters"
  }
}
```

以上只有欄位格式示意，不可填入真實值後保存到 repo。第一階段已接上：

1. 通知派送依 notification 的 `tenant_id` 解析專屬 Messaging token。
2. 客戶專屬入口完成 tenant scope 後，ID token 只嘗試該 tenant 的 LIFF Client IDs。
3. registry 缺漏或 JSON 無效時 fail closed，不借用 JULIET token。
4. tenant webhook 使用 `/api/line/webhook/{webhookRouteKey}`；route key 只在伺服器端映射 tenant 與 Channel Secret，不信任 payload 內的 tenant。
5. readiness 只回報缺少的欄位名稱，不回傳 Provider ID、token、secret、route key 或 LIFF ID 實值。

## 展示 OA 退役開關

`LINE_LEGACY_SHOWCASE_ROUTES_ENABLED=false` 可在完成 registry 與前端入口切換後，停止 Worker 使用舊標準／旗艦 Messaging token，也停止 LIFF 驗證嘗試舊標準／旗艦 Client ID。預設仍為啟用，避免尚未完成前端切換時誤中斷 v2-test。

`LINE_SHOWCASE_SHARED_OA_ENABLED=true` 搭配上述 legacy 開關關閉時，只允許固定白名單中的標準／旗艦 showcase tenant 使用 JULIET 展示 OA token。一般 tenant 與未知 tenant 仍不得回退共用 token。

在以下條件全部完成前，不得於遠端開啟退役模式或刪除 OA：

1. 前端不再固定輸出標準／旗艦舊 LIFF ID。（v2-test 已完成並部署）
2. `/standard/customer/`、`/flagship/showcase/customer/` 已改由 JULIET 展示 OA 的單一 LIFF 安全分流。（v2-test 已完成並實機驗收）
3. registry readiness 通過，通知與 webhook 都使用 tenant 專屬設定。
4. 客戶登入、業主登入、通知與圖文選單完成實機驗收。（展示客戶登入、tenant 隔離、標準版建立預約與業主收件已完成；正式 tenant 仍須個別驗收）

目前 `LINE_LEGACY_SHOWCASE_ROUTES_ENABLED=false` 與 `LINE_SHOWCASE_SHARED_OA_ENABLED=true` 已套用 v2-test。舊標準／旗艦 Client ID 仍保留於 Worker 相容環境欄位及受上述開關保護的驗證程式，不代表仍有有效前端入口。未完成 LINE 後台流量觀察與正式 tenant readiness 前，不得刪除任何舊 OA、Channel 或 LIFF。

## 尚未接線

- 舊共用 `/api/line/webhook` 與 `LINE_CHANNEL_SECRET` 暫留相容；正式 tenant 使用新的 opaque route。
- Provider ID 現階段只作 registry metadata 與 readiness 必填項；後續 provisioning／驗收仍需核對 Messaging API 與 Login Channel 屬於預期 Provider。
- 前端 LIFF ID 目前仍是展示入口配置；正式 tenant 專屬 LIFF URL 的公開配置與 platform provisioning 尚未完成。
- 正式 tenant 的真實 registry secret 建立、遠端設定、Worker 部署與實機驗收均需另次明確授權；v2-test 展示 cutover 已完成。
