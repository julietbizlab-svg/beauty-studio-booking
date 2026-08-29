import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

var root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
var api = readFileSync(join(root, "owner-admin/js/api.js"), "utf8");
var app = readFileSync(join(root, "owner-admin/js/app.js"), "utf8");
var html = readFileSync(join(root, "owner-admin/index.html"), "utf8");

test("tenant 選擇只保存在記憶體並以 header 傳送", function () {
  assert.match(api, /var selectedOwnerTenantId = ""/);
  assert.match(api, /headers\["X-Owner-Tenant-Id"\] = selectedOwnerTenantId/);
  assert.match(api, /setOwnerTenant/);
  assert.match(api, /\/api\/owner\/hub\/session/);
  assert.doesNotMatch(api, /localStorage|sessionStorage/);
});

test("多店與平台驗收入口都只能選後端 memberships，選後再次向後端驗證", function () {
  assert.match(app, /initializeOwnerTenant/);
  assert.match(app, /memberships\.some/);
  assert.match(app, /verified\.selected\.tenantId !== tenantId/);
  assert.match(app, /setOwnerTenant\(""\)/);
  assert.match(app, /URLSearchParams\(window\.location\.search\)\.get\("tenant"\)/);
  assert.match(app, /getHubSession\(\)/);
});

test("工作室選擇器不提供任意 tenant 輸入欄位", function () {
  assert.match(html, /id="owner-tenant-selector"/);
  assert.match(html, /id="owner-tenant-options"/);
  assert.doesNotMatch(html, /<input[^>]+tenant/i);
  assert.match(html, /auth-pending[^<]+:not\(#owner-tenant-selector\)/);
  assert.match(html, /js\/api\.js\?v=20260822001/);
  assert.match(html, /js\/app\.js\?v=20260825005/);
  assert.match(html, /js\/liff-init\.js\?v=20260808002/);
  assert.match(app, /beautyOwnerClearRequestedTenant/);
  assert.match(app, /owner-tenant-option-main/);
  assert.match(app, /owner-tenant-plan/);
  assert.match(app, /state\.ownerMembership\.features\.plan === "flagship"/);
});
