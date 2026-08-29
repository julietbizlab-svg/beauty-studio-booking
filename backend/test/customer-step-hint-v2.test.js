/**
 * customer-ui v2 步驟標題樣式測試（node:test ＋ assert，零依賴）
 *
 * 驗證：
 * - config.js：v2 hostname 在 documentElement 加 is-v2 class；Demo v1 hostname 不加
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
var appCode = readFileSync(join(repoRoot, "customer-ui/js/app.js"), "utf8");

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

test("config.js：v2 hostname 加 is-v2 class（正式與 preview）", function () {
  [
    {
      host: "juliet-studio.pages.dev",
      api: "https://beauty-studio-api-v2-production.gosu-chill-book.workers.dev"
    },
    {
      host: "abc123.juliet-studio.pages.dev",
      api: "https://beauty-studio-api-v2-test.gosu-chill-book.workers.dev"
    }
  ].forEach(function (item) {
    var result = runConfig(item.host);
    assert.ok(result.rootClasses.has("is-v2"), item.host + " 必須加 is-v2");
    assert.equal(result.config.CLAIM_ENABLED, true);
    assert.equal(result.config.API_BASE_URL, item.api);
  });
});

test("config.js：Demo v1 hostname 不加 is-v2 class，設定不變", function () {
  ["demo.example.com", "localhost", "gosu-chill-book.github.io"].forEach(function (host) {
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

test("CSS：評估日期欄在 iOS／LINE 內建瀏覽器不會凸出 modal", function () {
  var rule = cssCode.match(/#review-last-treatment\s*\{[^}]*\}/s);
  assert.ok(rule, "必須有 #review-last-treatment 專屬防溢出規則");
  assert.match(rule[0], /-webkit-appearance:\s*none/);
  assert.match(rule[0], /\bappearance:\s*none/);
  assert.match(rule[0], /width:\s*100%/);
  assert.match(rule[0], /min-width:\s*0/);
  assert.match(rule[0], /max-width:\s*100%/);
  assert.match(rule[0], /box-sizing:\s*border-box/);
  assert.match(
    cssCode,
    /#review-last-treatment::-webkit-date-and-time-value\s*\{[^}]*min-width:\s*0[^}]*margin:\s*0/s
  );
});

test("CSS：通用問卷日期欄在 iOS／LINE 內建瀏覽器不會凸出卡片", function () {
  var rule = cssCode.match(/#assessment-date\s*\{[^}]*\}/s);
  assert.ok(rule);
  assert.match(rule[0], /min-width:\s*0/);
  assert.match(rule[0], /max-width:\s*100%/);
  assert.match(rule[0], /box-sizing:\s*border-box/);
});

test("CSS：已繳訂金改期月曆與時段限制於 modal", function () {
  assert.match(cssCode, /\.customer-reschedule-calendar\s*\{[^}]*min-width:\s*0/);
  assert.match(cssCode, /#customer-reschedule-modal \.modal-card\s*\{[^}]*max-width:\s*480px/);
  assert.match(cssCode, /#customer-reschedule-slot-grid\s*\{[^}]*min-height:\s*52px/);
});

test("CSS：主預約月曆年份與月份同列且不拆字，四欄工具列在手機保持對齊", function () {
  var css = cssCode;
  assert.match(css, /\.calendar-toolbar\s*\{[\s\S]*grid-template-columns:\s*58px minmax\(92px, 1fr\) 58px 76px/);
  assert.match(css, /\.calendar-month-label\s*\{[\s\S]*white-space:\s*nowrap/);
  assert.match(css, /word-break:\s*keep-all/);
  assert.match(css, /\.calendar-month-label\s*\{[\s\S]*flex-direction:\s*row/);
  assert.match(css, /\.calendar-month-label\s*\{[\s\S]*gap:\s*6px/);
  assert.match(css, /\.calendar-title-year,[\s\S]*\.calendar-title-month[\s\S]*white-space:\s*nowrap/);
  assert.match(appCode, /formatMainCalendarMonthTitle/);
  assert.match(appCode, /calendar-title-year/);
  assert.match(appCode, /calendar-title-month/);
  assert.match(appCode, /calendarMonthLabel\.innerHTML = formatMainCalendarMonthTitle\(month\)/);
});

test("CSS：客人評估填答字體與緊湊欄位適合手機閱讀", function () {
  assert.match(
    cssCode,
    /#review-intake-modal label,[\s\S]*?#review-intake-modal legend\s*\{[^}]*font-size:\s*0\.95rem/s
  );
  assert.match(
    cssCode,
    /#review-intake-modal textarea,[\s\S]*?#review-intake-modal input\s*\{[^}]*font-size:\s*1rem/s
  );
  assert.match(
    cssCode,
    /\.review-choice-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s
  );
  assert.match(cssCode, /\.review-choice\s*\{[^}]*min-height:\s*44px/s);
});

test("HTML：五個步驟標題存在且 cache-busting 已更新", function () {
  var html = readFileSync(join(repoRoot, "customer-ui/index.html"), "utf8");
  ["步驟 1", "步驟 2", "步驟 3", "步驟 4", "步驟 5"].forEach(function (label) {
    assert.match(html, new RegExp('class="step-hint"(?: id="[^"]+")?>' + label), "缺少 " + label);
  });
  assert.ok(html.includes("js/config.js?v=20260823002"));
  assert.match(html, /<title>Juliet Studio OS \| Booking<\/title>/);
  assert.match(html, /<style>\.brand\.is-loading\{visibility:hidden\}<\/style>/);
  assert.match(html, /<h1 class="brand is-loading" id="brand" aria-busy="true">工作室名稱<\/h1>/);
  assert.match(appCode, /classList\.remove\("is-loading"\)/);
  assert.match(cssCode, /\.brand\.is-loading\s*\{[^}]*visibility:\s*hidden/s);
  assert.match(appCode, /document\.title = brandName;/);
  assert.doesNotMatch(appCode, /document\.title = brandName \+ "｜線上預約"/);
  assert.match(html, /get\("liff\.state"\)/);
  assert.match(html, /\^\\\/owner/);
  assert.match(html, /window\.BEAUTY_CONFIG\.OWNER_LIFF_URL/);
  assert.ok(
    html.indexOf('get("liff.state")') < html.indexOf("<body>"),
    "舊業主 LIFF 必須在客戶畫面繪製前切到獨立業主入口"
  );
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
