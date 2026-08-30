import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

var root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
var liffCode = readFileSync(join(root, "owner-admin/js/liff-init.js"), "utf8");
var apiCode = readFileSync(join(root, "owner-admin/js/api.js"), "utf8");

test("業主端在啟動畫面前攔截過期 ID token，避免先進頁面再跳回 LINE", function () {
  assert.match(liffCode, /payload\.exp \* 1000 <= Date\.now\(\) \+ 30000/);
  assert.match(liffCode, /if \(isExpiredIdToken\(idToken\)\)\s*\{\s*requestLogin\(\)/);
  assert.match(liffCode, /\(\?:access\|id\)\\s\*token expired/);
});

test("業主端 PKCE 或 OAuth state 不一致時改走正確 LIFF 建立全新登入", function () {
  assert.match(liffCode, /code_verifier does not match/);
  assert.match(liffCode, /state\(\?:\\s\+parameter\)\?/);
  assert.match(liffCode, /isRecoverableLiffAuthError\(error\)/);
  assert.match(liffCode, /liff\.logout\(\)/);
  assert.match(liffCode, /window\.location\.replace\("https:\/\/liff\.line\.me\/"/);
  assert.match(liffCode, /AUTH_RECOVERY_COOLDOWN_MS = 90000/);
  assert.match(liffCode, /請關閉此頁後從官方帳號重新開啟業主中心/);
});

test("指定工作室會跨 LINE OAuth 回呼保存並於登入完成後恢復", function () {
  assert.match(liffCode, /REQUESTED_TENANT_KEY = "beauty-owner-requested-tenant"/);
  assert.match(liffCode, /sessionStorage\.setItem\(REQUESTED_TENANT_KEY, tenantId\)/);
  assert.match(liffCode, /restoreRequestedTenantToUrl\(\)/);
  assert.match(liffCode, /url\.searchParams\.set\("tenant", tenantId\)/);
  assert.match(liffCode, /beautyOwnerClearRequestedTenant/);
});

test("業主 API 觸發重新登入時保持載入狀態，不短暫渲染錯誤頁", function () {
  assert.match(apiCode, /if \(triggerOwnerReLogin\(\)\) \{\s*return new Promise\(function \(\) \{\}\)/);
  assert.doesNotMatch(apiCode, /throw makeAuthError\("登入已過期，正在重新導向 LINE 登入…"\)/);
});

test("業主管理中心邀請只從 fragment 讀取，成功後立即清除", function () {
  assert.match(liffCode, /new URLSearchParams\(raw\)\.get\("owner_invite"\)/);
  assert.match(liffCode, /\/api\/owner-hub\/claim/);
  assert.match(liffCode, /"Authorization": "Bearer " \+ idToken/);
  assert.match(
    liffCode,
    /history\.replaceState\(null, "", window\.location\.pathname \+ window\.location\.search\)/
  );
  assert.doesNotMatch(liffCode, /(?:localStorage|sessionStorage)\.setItem\([^\n]*owner_invite/);
});
