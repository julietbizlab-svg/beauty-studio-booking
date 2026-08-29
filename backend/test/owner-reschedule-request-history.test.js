import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

var repository = readFileSync(join(import.meta.dirname, "../src/d1-repository.js"), "utf8");
var ownerApp = readFileSync(join(import.meta.dirname, "../../docs/owner/js/app.js"), "utf8");
var ownerAdminApp = readFileSync(join(import.meta.dirname, "../../owner-admin/js/app.js"), "utf8");
var customerApp = readFileSync(join(import.meta.dirname, "../../docs/js/app.js"), "utf8");
var customerCss = readFileSync(join(import.meta.dirname, "../../docs/css/style.css"), "utf8");
var notifications = readFileSync(join(import.meta.dirname, "../src/d1-notifications.js"), "utf8");
var worker = readFileSync(join(import.meta.dirname, "../src/index.js"), "utf8");

test("owner booking DTO derives actual reschedule history from parent bookings", function () {
  assert.match(repository, /WITH RECURSIVE booking_history/);
  assert.match(repository, /reschedule_history_json/);
  assert.match(repository, /originalDate/);
  assert.match(repository, /rescheduleHistory: rescheduleHistory/);
});

test("owner booking card renders actual reschedule history only", function () {
  [ownerApp, ownerAdminApp].forEach(function (source) {
    assert.match(source, /變更紀錄/);
    assert.match(source, /原預約日期：/);
    assert.match(source, /操作變更時間：/);
    assert.doesNotMatch(source, /希望變更至：/);
    assert.doesNotMatch(source, /提出時間：/);
    assert.match(source, /rescheduleHistoryHtml/);
  });
});

test("owner booking card emphasizes the appointment date", function () {
  [ownerApp, ownerAdminApp].forEach(function (source) {
    assert.match(source, /預約日期/);
    assert.match(source, /booking-current-date/);
  });
});

test("customer booking card renders actual reschedule history", function () {
  assert.match(customerApp, /rescheduleHistoryLine/);
  assert.match(customerApp, /變更紀錄/);
  assert.match(customerApp, /原預約日期：/);
  assert.match(customerApp, /操作變更時間：/);
});

test("customer booking card emphasizes the current appointment date and time", function () {
  assert.match(customerApp, /class="booking-current-date"/);
  assert.match(customerCss, /\.booking-card h3\s*\{[^}]*font-size:\s*1\.4rem/);
  assert.match(customerCss, /\.booking-card h3\s*\{[^}]*font-weight:\s*700/);
  assert.match(customerCss, /\.booking-card \.booking-current-date\s*\{[^}]*font-size:\s*1\.15rem/);
  assert.match(customerCss, /\.booking-card \.booking-current-date\s*\{[^}]*font-weight:\s*600/);
});

test("owner reschedule queues one dynamic customer notification", function () {
  assert.match(worker, /booking_rescheduled/);
  assert.match(notifications, /buildBookingRescheduledMessage/);
  assert.match(notifications, /工作室已為您完成預約改期/);
  assert.match(notifications, /原預約日期：/);
  assert.match(notifications, /新預約日期：/);
});
