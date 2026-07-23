/**
 * customer-ui v2 步驟標題樣式測試（node:test ＋ assert，零依賴）
 *
 * 驗證：
 * - config.js：僅 v2 preview hostname 加 is-v2 class；正式站與 Demo v1 不加
 * - CSS：步驟標題加強樣式以 html.is-v2 scope，基礎 .step-hint 不變（Demo v1 不受影響）
 * - customer-ui 與 docs 靜態副本逐位元一致
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

var repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
var configJsCode = readFileSync(join(repoRoot, "customer-ui/js/config.js"), "utf8");
var cssCode = readFileSync(join(repoRoot, "customer-ui/css/style.css"), "utf8");

function runConfig(hostname) {
  var rootClasses = new Set();
  var fakeDocument = {
    documentElement: {
      classList: {
        add: function (c) { rootClasses.add(c); },
        remove: function (c) { rootClasses.delete(c); },
        contains: function (c) { return rootClasses.has(c); }
      }
    }
  };
  var fakeWindow = { location: { hostname: hostname } };
  new Function("window", "document", configJsCode)(fakeWindow, fakeDocument);
  return { config: fakeWindow.BEAUTY_CONFIG, rootClasses: rootClasses };
}

test("config.js：僅 v2 preview hostname 加 is-v2 class", function () {
  var host = "abc123.juliet-studio.pages.dev";
  var result = runConfig(host);
  assert.ok(result.rootClasses.has("is-v2"), host + " 必須加 is-v2");
  assert.equal(result.config.CLAIM_ENABLED, true);
  assert.equal(
    result.config.API_BASE_URL,
    "https://beauty-studio-api-v2-test.gosu-chill-book.workers.dev"
  );
});

test("config.js：正式站與 Demo v1 hostname 不加 is-v2 class，設定不變", function () {
  [
    "juliet-studio.pages.dev",
    "demo.example.com",
    "localhost",
    "gosu-chill-book.github.io"
  ].forEach(function (host) {
    var result = runConfig(host);
    assert.equal(result.rootClasses.size, 0, host + " 不得加任何 class");
    assert.equal(result.config.CLAIM_ENABLED, false);
    assert.equal(result.config.CUSTOMER_APP_URL, null);
  });
});

test("CSS：步驟標題加強樣式限定 html.is-v2，基礎 .step-hint 不變", function () {
  var v2Rule = cssCode.match(/html\.is-v2 \.step-hint\s*\{[^}]*\}/s);
  assert.ok(v2Rule, "必須有 html.is-v2 .step-hint 規則");
  assert.ok(/font-size:\s*1\.1rem/.test(v2Rule[0]));
  assert.ok(/font-weight:\s*700/.test(v2Rule[0]));
  assert.ok(/color:\s*var\(--text\)/.test(v2Rule[0]));
  assert.ok(/border-left:\s*4px solid var\(--primary\)/.test(v2Rule[0]));
  assert.ok(/background:/.test(v2Rule[0]));
  assert.ok(/padding:/.test(v2Rule[0]));
  assert.ok(/border-radius:/.test(v2Rule[0]));
  // 防橫向溢出
  assert.ok(/max-width:\s*100%/.test(v2Rule[0]));
  assert.ok(/box-sizing:\s*border-box/.test(v2Rule[0]));
  assert.ok(/overflow-wrap:\s*anywhere/.test(v2Rule[0]));

  // 基礎規則保持 Demo v1 原樣
  var baseRule = cssCode.match(/(?<!html\.is-v2 )\.step-hint\s*\{[^}]*\}/s);
  assert.ok(baseRule, "必須保留基礎 .step-hint 規則");
  assert.ok(/font-size:\s*0\.85rem/.test(baseRule[0]));
  assert.ok(/color:\s*var\(--muted\)/.test(baseRule[0]));
});

test("HTML：四個步驟標題存在且 cache-busting 已更新", function () {
  var html = readFileSync(join(repoRoot, "customer-ui/index.html"), "utf8");
  ["步驟 1", "步驟 2", "步驟 3", "步驟 4"].forEach(function (label) {
    assert.ok(html.includes('class="step-hint">' + label), "缺少 " + label);
  });
  assert.ok(html.includes("v=20260722001"));
  assert.ok(!html.includes("v=20260720004"), "舊版本號必須全部更新");
});

test("customer-ui 與 docs 靜態副本完全一致", function () {
  ["index.html", "css/style.css", "js/config.js", "js/api.js", "js/app.js", "js/liff-init.js"]
    .forEach(function (file) {
      var customerUi = readFileSync(join(repoRoot, "customer-ui", file), "utf8");
      var docsCopy = readFileSync(join(repoRoot, "docs", file), "utf8");
      assert.equal(docsCopy, customerUi, "docs/" + file + " 必須與 customer-ui 一致");
    });
});
