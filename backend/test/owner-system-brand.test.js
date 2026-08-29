import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

var ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("系統品牌 Logo 只加入業主端且部署副本一致", function () {
  var ownerHtml = fs.readFileSync(path.join(ROOT, "owner-admin/index.html"), "utf8");
  var docsOwnerHtml = fs.readFileSync(path.join(ROOT, "docs/owner/index.html"), "utf8");
  var customerHtml = fs.readFileSync(path.join(ROOT, "customer-ui/index.html"), "utf8");

  assert.match(ownerHtml, /class="system-brand-logo"/);
  assert.match(ownerHtml, /juliet-studio-os-logo\.png/);
  assert.match(ownerHtml, /favicon-32\.png/);
  assert.match(ownerHtml, /class="brand visually-hidden"/);
  assert.doesNotMatch(ownerHtml, /id="product-role-label"/);
  assert.doesNotMatch(ownerHtml, />茱麗葉工作室｜旗艦版業主端</);
  assert.doesNotMatch(customerHtml, /juliet-studio-os-logo|system-brand-logo/);
  assert.equal(docsOwnerHtml, ownerHtml);

  var ownerApp = fs.readFileSync(path.join(ROOT, "owner-admin/js/app.js"), "utf8");
  assert.doesNotMatch(ownerApp, /isAiTier \? "AI" : "業主端"/);
  assert.match(ownerApp,
    /if \(state\.ownerMembership && state\.ownerMembership\.features\)/);
  assert.doesNotMatch(ownerHtml, /product-tier-label|product-identity/);
  assert.doesNotMatch(ownerHtml, /標準版|旗艦版/);
  assert.match(ownerApp, /applyOwnerPlanTheme/);
  assert.match(ownerApp, /owner-theme-beige/);
  assert.match(ownerApp, /owner-theme-mauve/);
  assert.match(ownerApp, /state\.ownerMembership\.features\.plan === "flagship"/);
  assert.doesNotMatch(ownerApp, /標準版｜不含 AI/);

  [
    "juliet-studio-os-logo.png",
    "juliet-studio-os-icon.png",
    "favicon-32.png",
    "apple-touch-icon.png"
  ].forEach(function (file) {
    var ownerAsset = fs.readFileSync(path.join(ROOT, "owner-admin/assets/brand", file));
    var docsAsset = fs.readFileSync(path.join(ROOT, "docs/owner/assets/brand", file));
    assert.deepEqual(docsAsset, ownerAsset);
  });
});
