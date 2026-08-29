import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

var root = join(import.meta.dirname, "../..");

test("客戶端首頁只等待三項必要資料，預約與 AI 在背景完成", function () {
  var app = readFileSync(join(root, "customer-ui/js/app.js"), "utf8");
  assert.match(app, /var aiCapabilityPromise = loadAiCapability\(\);\s*var bookingsPromise = loadBookings\(\);/);
  assert.match(app, /await Promise\.all\(\[\s*loadSettings\(\),\s*loadServices\(\),\s*loadServerProfile\(\)\s*\]\)/);
  assert.match(app, /var deferredStartupPromise = Promise\.allSettled\(\[aiCapabilityPromise, bookingsPromise\]\);/);
  assert.match(app, /deferredStartupPromise\.then\(/);
  assert.match(app, /\]\);\s*\/\/ 訂金顯示依賴 settings；[\s\S]*?renderBookings\(\);/);
});

test("客戶端來源與 Pages 部署副本一致且使用新快取版本", function () {
  assert.equal(
    readFileSync(join(root, "customer-ui/js/app.js"), "utf8"),
    readFileSync(join(root, "docs/js/app.js"), "utf8")
  );
  assert.match(readFileSync(join(root, "docs/index.html"), "utf8"), /js\/app\.js\?v=20260825003/);
});
