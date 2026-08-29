import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

var root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
var file = join(root, "customer-ui/js/liff-init.js");
var apiFile = join(root, "customer-ui/js/api.js");

test("客人端過期 access/id token 會登出並回 LIFF URL，不攜帶舊 query", function () {
  var code = readFileSync(file, "utf8");
  assert.match(code, /\(\?:access\|id\)/);
  assert.match(code, /liff\.logout\(\)/);
  assert.match(code, /payload\.exp \* 1000 <= Date\.now\(\) \+ 30000/);
  assert.match(code, /payload\.aud/);
  assert.match(code, /idTokenMatchesLiffChannel/);
  assert.match(code, /if \(isExpiredIdToken\(idToken\)\)/);
  assert.match(code, /https:\/\/liff\.line\.me\//);
  assert.match(code, /window\.location\.replace/);
  assert.match(code, /不攜帶原 query/);
  assert.match(code, /config\.STUDIO_ENTRY_KEY/);
  assert.match(code, /studio_entry=/);
  assert.match(code, /tenantLiffId === getLiffId\(\)/);
});

test("PKCE code_verifier 或 OAuth state 不一致時會清除舊登入並重新走 LIFF", function () {
  var code = readFileSync(file, "utf8");
  assert.match(code, /code_verifier does not match/);
  assert.match(code, /state.*does not match/);
  assert.match(code, /if \(isRecoverableLiffAuthError\(error\)\)/);
  assert.match(code, /liff\.logout\(\)/);
  assert.match(code, /window\.location\.replace\(getFreshLiffUrl\(\)\)/);
});

test("過期 token 恢復有 session cooldown，避免無限轉址", function () {
  var code = readFileSync(file, "utf8");
  assert.match(code, /EXPIRED_TOKEN_RECOVERY_COOLDOWN_MS/);
  assert.match(code, /sessionStorage\.getItem/);
  assert.match(code, /sessionStorage\.setItem/);
  assert.match(code, /請關閉此頁後從官方帳號重新開啟/);
});

test("後端判定 ID token 過期時也會立即重新取得 LIFF 登入", function () {
  var liffCode = readFileSync(file, "utf8");
  var apiCode = readFileSync(apiFile, "utf8");
  assert.match(liffCode, /window\.beautyRecoverExpiredLiffToken = recoverExpiredLiffToken/);
  assert.match(apiCode, /response\.status === 401/);
  assert.match(apiCode, /\(\?:access\|id\)/);
  assert.match(apiCode, /window\.beautyRecoverExpiredLiffToken\(\)/);
  assert.match(apiCode, /invalid idtoken audience/i);
});

test("LIFF 初始化後清除 OAuth 跳轉參數且不新增瀏覽紀錄", function () {
  var code = readFileSync(file, "utf8");
  assert.match(code, /function clearLiffRedirectTrace\(\)/);
  assert.match(code, /url\.searchParams\.delete\(key\)/);
  assert.match(code, /"code"/);
  assert.match(code, /"state"/);
  assert.match(code, /"liffClientId"/);
  assert.match(code, /"liffRedirectUri"/);
  assert.match(code, /"liff\.state"/);
  assert.match(code, /window\.history\.replaceState\(null, "", cleanUrl\)/);
  assert.match(code, /clearLiffRedirectTrace\(\);\s*if \(!liff\.isLoggedIn\(\)\)/);
});
