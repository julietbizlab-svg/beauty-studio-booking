import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

var ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(path) {
  return readFileSync(join(ROOT, path), "utf8");
}

test("業主可設定每月 1～28 日開放下月預約，原始檔與 Pages 副本一致", function () {
  var sourceHtml = read("owner-admin/index.html");
  var sourceJs = read("owner-admin/js/app.js");
  assert.equal(sourceHtml, read("docs/owner/index.html"));
  assert.equal(sourceJs, read("docs/owner/js/app.js"));
  assert.match(sourceHtml, /id="next-month-booking-open-day"[^>]*min="1"[^>]*max="28"/);
  assert.match(sourceHtml, /最多只開放到下個月/);
  assert.match(sourceJs, /nextMonthBookingOpenDay/);
  assert.match(sourceJs, /下個月預約開放日須為 1～28 的整數/);
});

test("客戶月曆依設定日限制下個月，並停用超出上限的下一月按鈕", function () {
  var sourceJs = read("customer-ui/js/app.js");
  assert.equal(sourceJs, read("docs/js/app.js"));
  assert.match(sourceJs, /function getMaxBookableMonth\(\)/);
  assert.match(sourceJs, /nextMonthBookingOpenDay/);
  assert.match(sourceJs, /calendarNext\.disabled = month >= maxBookableMonth/);
  assert.match(sourceJs, /if \(month > maxBookableMonth\)/);
});

test("後端月份與單日空檔 API 都強制檢查預約月份上限", function () {
  var worker = read("backend/src/index.js");
  var repository = read("backend/src/d1-repository.js");
  assert.match(worker, /\/api\/slots\/month[\s\S]*assertBookingWindow\(monthParam, monthSettings\)/);
  assert.match(worker, /assertBookingWindow\(date, slotSettings\)/);
  assert.match(repository, /此月份尚未開放預約，請於工作室設定的開放日後再查看/);
});

test("指定日期整日休假在業主介面、API 與客戶預約後端完整封鎖", function () {
  var ownerHtml = read("owner-admin/index.html");
  var ownerJs = read("owner-admin/js/app.js");
  var ownerApi = read("owner-admin/js/api.js");
  var worker = read("backend/src/index.js");
  var repository = read("backend/src/d1-repository.js");
  assert.equal(ownerHtml, read("docs/owner/index.html"));
  assert.equal(ownerJs, read("docs/owner/js/app.js"));
  assert.equal(ownerApi, read("docs/owner/js/api.js"));
  assert.match(ownerHtml, /id="closed-date-input"/);
  assert.match(ownerHtml, /指定日期整日不開放/);
  assert.match(ownerJs, /setDateClosed/);
  assert.match(ownerApi, /\/api\/owner\/closed-dates/);
  assert.match(worker, /reason: "date_closed"/);
  assert.match(worker, /await isDateClosed\(env, date\)/);
  assert.match(repository, /if \(await isDateClosed\(env, date\)\)/);
  assert.match(repository, /tenant_id = \?1 AND location_id = \?2 AND staff_id = \?3/);
});

test("指定日期 date／month 欄位在 iPhone LINE 內不超出面板", function () {
  var html = read("owner-admin/index.html");
  var css = read("owner-admin/css/style.css");
  assert.equal(css, read("docs/owner/css/style.css"));
  assert.match(html, /class="settings-section date-closure-settings"/);
  assert.match(html, /css\/style\.css\?v=20260825002/);
  assert.match(css, /\.date-closure-settings input\[type="date"\][\s\S]*min-width: 0/);
  assert.match(css, /\.date-closure-settings input\[type="month"\][\s\S]*inline-size: 100%/);
  assert.match(css, /\.date-closure-settings input\[type="date"\],[\s\S]*height: 56px[\s\S]*min-height: 56px[\s\S]*max-height: 56px/);
  assert.match(css, /::-webkit-date-and-time-value/);
  assert.match(css, /#closed-date-list[\s\S]*overflow-wrap: anywhere/);
  assert.match(html, /js\/app\.js\?v=20260825005/);
  assert.match(read("owner-admin/js/app.js"), /class="card closed-date-row"/);
  assert.match(css, /\.closed-date-row[\s\S]*grid-template-columns: minmax\(0, 1fr\) 108px/);
  assert.match(css, /\.closed-date-reopen[\s\S]*width: 108px[\s\S]*margin: 0/);
});

test("客戶生日與全站日期控制項在 iPhone LINE 內統一防溢出", function () {
  var html = read("customer-ui/index.html");
  var css = read("customer-ui/css/style.css");
  assert.equal(html, read("docs/index.html"));
  assert.equal(css, read("docs/css/style.css"));
  assert.match(html, /id="customer-birthday"/);
  assert.match(html, /css\/style\.css\?v=20260825002/);
  assert.match(css, /input\[type="date"\],[\s\S]*input\[type="month"\],[\s\S]*input\[type="time"\][\s\S]*-webkit-appearance: none/);
  assert.match(css, /input,[\s\S]*textarea,[\s\S]*select[\s\S]*min-width: 0/);
  assert.match(css, /\.customer-profile-form[\s\S]*overflow: hidden/);
  assert.match(css, /::-webkit-date-and-time-value[\s\S]*max-width: 100%/);
});
