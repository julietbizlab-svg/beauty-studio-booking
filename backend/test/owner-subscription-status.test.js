import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getOwnerSubscriptionStatus } from "../src/subscription-status.js";

var ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("租用狀態依正式租用、試用、到期與未設定安全分類", function () {
  assert.equal(getOwnerSubscriptionStatus({
    OWNER_SUBSCRIPTION_END_DATE: "2026-12-31",
    OWNER_TRIAL_END_DATE: "2026-08-01"
  }, "2026-07-26").status, "active");
  assert.equal(getOwnerSubscriptionStatus({
    OWNER_TRIAL_END_DATE: "2026-08-01"
  }, "2026-07-26").status, "trial");
  assert.equal(getOwnerSubscriptionStatus({
    OWNER_TRIAL_END_DATE: "2026-07-01"
  }, "2026-07-26").status, "expired");
  assert.equal(getOwnerSubscriptionStatus({}, "2026-07-26").status, "unconfigured");
});

test("錯誤日期不外洩原值，業主端顯示兩種期限且客戶端不顯示", function () {
  var result = getOwnerSubscriptionStatus({
    OWNER_TRIAL_END_DATE: "not-a-date",
    OWNER_SUBSCRIPTION_END_DATE: "2026-02-30"
  }, "2026-07-26");
  assert.equal(result.trialEndsOn, null);
  assert.equal(result.subscriptionEndsOn, null);
  var ownerHtml = fs.readFileSync(path.join(ROOT, "owner-admin/index.html"), "utf8");
  var customerHtml = fs.readFileSync(path.join(ROOT, "customer-ui/index.html"), "utf8");
  assert.match(ownerHtml, /試用到期日/);
  assert.match(ownerHtml, /訂閱到期日/);
  assert.doesNotMatch(customerHtml, /試用到期日|訂閱到期日/);
});

test("業主端為 Pages、Cursor 與 docs 預覽提供樣式備援，不可退回原始 HTML", function () {
  var ownerHtml = fs.readFileSync(path.join(ROOT, "owner-admin/index.html"), "utf8");
  var style = fs.readFileSync(path.join(ROOT, "owner-admin/css/style.css"), "utf8");
  assert.match(ownerHtml, /href="\/owner\/css\/style\.css\?v=\d+"/);
  assert.match(ownerHtml, /href="\/owner-admin\/css\/style\.css\?v=\d+"/);
  assert.match(ownerHtml, /href="\/docs\/owner\/css\/style\.css\?v=\d+"/);
  assert.match(ownerHtml, /window\.location\.protocol === "file:"/);
  assert.match(ownerHtml, /new URL\("\.\/", window\.location\.href\)/);
  assert.match(ownerHtml, /href="css\/style\.css\?v=\d+"/);
  assert.doesNotMatch(ownerHtml, /style-\d+\.css/);
  assert.match(style, /\.owner-subscription-card\s*\{/);
  assert.match(style, /\.ai-work-queue-counts\s*\{/);
  assert.match(style, /button\.ai-work-queue-count\s*\{/);
  assert.match(style, /\.ai-work-queue-count\.is-active/);
  assert.match(style, /\.ai-work-queue-item\s*\{/);
});

test("租用狀態放在業主頁最下方，試用持續標示並在 7／3／1／0 天提醒", function () {
  var ownerHtml = fs.readFileSync(path.join(ROOT, "owner-admin/index.html"), "utf8");
  var app = fs.readFileSync(path.join(ROOT, "owner-admin/js/app.js"), "utf8");
  assert.ok(
    ownerHtml.indexOf('id="owner-subscription-card"') >
      ownerHtml.indexOf('id="save-settings"'),
    "租用狀態必須位於主要業主功能之後"
  );
  assert.match(ownerHtml, /id="subscription-reminder-modal"/);
  assert.match(ownerHtml, /id="owner-trial-banner"/);
  assert.match(app, /days > 30/);
  assert.match(app, /\[7, 3, 1, 0\]/);
  assert.match(app, /14 天免費試用/);
  assert.match(app, /AI、評估與完整店務功能/);
  assert.doesNotMatch(app, /標準版 14 天免費試用|旗艦版 14 天免費試用/);
  assert.match(app, /訂閱.*試用/);
});
