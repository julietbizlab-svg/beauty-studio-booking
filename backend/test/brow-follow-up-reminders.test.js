import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  appendServiceToBookingUrl,
  schedulePigmentFollowUpReminders,
  updatePigmentFollowUpReminderDates
} from "../src/d1-brow-reminders.js";

test("0025 建立霧眉與霧唇提醒防重複索引與版本紀錄", function () {
  var db = new DatabaseSync(":memory:");
  var root = join(import.meta.dirname, "..");
  ["0001_init_core.sql", "0002_bookings.sql", "0004_ops_tables.sql",
    "0020_brow_follow_up_reminders.sql", "0025_pigment_follow_up_reminders.sql"].forEach(function (name) {
    db.exec(readFileSync(join(root, "migrations", name), "utf8"));
  });
  assert.equal(db.prepare(
    "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='index' AND name='uq_notifications_brow_follow_up'"
  ).get().n, 1);
  assert.equal(db.prepare(
    "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='index' AND name='uq_notifications_pigment_follow_up'"
  ).get().n, 1);
  assert.equal(db.prepare(
    "SELECT COUNT(*) AS n FROM schema_versions WHERE version='0025_pigment_follow_up_reminders'"
  ).get().n, 1);
});

test("0026 建立標準版21天回訪提醒防重複索引與版本紀錄", function () {
  var db = new DatabaseSync(":memory:");
  var root = join(import.meta.dirname, "..");
  ["0001_init_core.sql", "0002_bookings.sql", "0004_ops_tables.sql",
    "0026_standard_care_follow_up_reminder.sql"].forEach(function (name) {
    db.exec(readFileSync(join(root, "migrations", name), "utf8"));
  });
  assert.equal(db.prepare(
    "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='index' AND name='uq_notifications_standard_care_follow_up'"
  ).get().n, 1);
  assert.equal(db.prepare(
    "SELECT COUNT(*) AS n FROM schema_versions WHERE version='0026_standard_care_follow_up_reminder'"
  ).get().n, 1);
});

function fakeDb(serviceName, planCode, options) {
  var opts = options || {};
  var prepared = [];
  return {
    prepared: prepared,
    prepare: function (sql) {
      var item = { sql: sql, binds: [], bind: function () {
        this.binds = Array.from(arguments); return this;
      }, first: async function () {
        if (/tenant_features/.test(sql)) return { plan_code: planCode || "standard" };
        if (/customer_booking_url/.test(sql)) return { setting_value: opts.customerBookingUrl || "" };
        return { id: "b1", customer_id: "c1", service_name: serviceName,
          plan_code: planCode || (/霧眉|霧唇/.test(serviceName) ? "flagship" : "standard"),
          service_id: "svc-1",
          service_settings_json: JSON.stringify({ followUpDays: opts.followUpDays }),
          start_at: "2026-01-31T02:00:00.000Z" };
      }, run: async function () { return { meta: { changes: 1 } }; } };
      prepared.push(item); return item;
    },
    batch: async function (items) { return items.map(function () { return { meta: { changes: 1 } }; }); }
  };
}

test("再次預約網址只接受 https 並帶入原服務", function () {
  assert.equal(
    appendServiceToBookingUrl("https://liff.line.me/example", "svc-1"),
    "https://liff.line.me/example?serviceId=svc-1"
  );
  assert.equal(appendServiceToBookingUrl("javascript:alert(1)", "svc-1"), "");
});

test("完成霧眉後排定第28天贈送補色與第11個月付費維持提醒", async function () {
  var db = fakeDb("自然霧眉");
  var result = await schedulePigmentFollowUpReminders(
    { DB: db, TENANT_ID: "t1" }, "b1", "2026-01-31T02:00:00.000Z"
  );
  assert.equal(result.complimentaryAt, "2026-02-28T02:00:00.000Z");
  assert.equal(result.maintenanceAt, "2026-12-31T02:00:00.000Z");
  assert.equal(result.serviceKind, "brow");
  var inserts = db.prepared.filter(function (item) { return /INSERT OR IGNORE/.test(item.sql); });
  assert.equal(inserts.length, 2);
  assert.match(inserts[0].binds[5], /贈送的補色服務/);
  assert.match(inserts[1].binds[5], /另外計費/);
  assert.match(inserts[1].binds[5], /眉部清楚照片回傳給老師/);
  assert.match(inserts[1].binds[5], /老師本人檢視後.*評估是否需要回店/);
  assert.doesNotMatch(inserts[1].binds[5], /免費|贈送/);
});

test("完成霧唇後排定滿月補色與滿年前付費維持提醒且不宣稱免費", async function () {
  var db = fakeDb("自然裸色霧唇");
  var result = await schedulePigmentFollowUpReminders(
    { DB: db, TENANT_ID: "t1" }, "b1", "2026-01-31T02:00:00.000Z"
  );
  assert.equal(result.serviceKind, "lip");
  assert.equal(result.touchupAt, "2026-02-28T02:00:00.000Z");
  assert.equal(result.maintenanceAt, "2026-12-31T02:00:00.000Z");
  var inserts = db.prepared.filter(function (item) { return /INSERT OR IGNORE/.test(item.sql); });
  assert.equal(inserts.length, 2);
  assert.equal(inserts[0].binds[4], "lip_touchup_28d");
  assert.doesNotMatch(inserts[0].binds[5], /免費|贈送/);
  assert.equal(inserts[1].binds[4], "lip_paid_maintenance_11m");
  assert.match(inserts[1].binds[5], /另外計費/);
  assert.match(inserts[1].binds[5], /唇部清楚照片回傳給老師/);
  assert.match(inserts[1].binds[5], /老師本人檢視後.*評估是否需要回店/);
  assert.doesNotMatch(inserts[1].binds[5], /系統判斷|一定需要|直接預約/);
});

test("標準版服務完成後第21天排定回訪與持續保養提醒", async function () {
  var standard = fakeDb("手部凝膠", "standard");
  var result = await schedulePigmentFollowUpReminders(
    { DB: standard, TENANT_ID: "t1" }, "b1", "2026-01-01T00:00:00.000Z"
  );
  assert.equal(result.serviceKind, "standard");
  assert.equal(result.followUpAt, "2026-02-21T02:00:00.000Z");
  var insert = standard.prepared.find(function (item) {
    return /standard_care_follow_up_21d/.test(item.sql);
  });
  assert.ok(insert);
  assert.match(insert.binds[4], /手部凝膠/);
  assert.match(insert.binds[4], /滿 21 天/);
  assert.match(insert.binds[4], /持續保養/);
});

test("標準版依服務類型套用手部21天、足部42天、手足合做以手部為主、睫毛21天", async function () {
  var cases = [
    ["手部美甲", 21],
    ["足部美甲", 42],
    ["足部美甲、手部美甲", 21],
    ["睫毛管理", 21]
  ];
  for (var item of cases) {
    var db = fakeDb(item[0], "standard", { followUpDays: 99 });
    var result = await schedulePigmentFollowUpReminders(
      { DB: db, TENANT_ID: "t1" }, "b1", "2026-01-01T00:00:00.000Z"
    );
    assert.equal(result.followUpDays, item[1], item[0]);
  }
});

test("標準版其他服務依自訂週期排定並附上再次預約連結，0 天可關閉", async function () {
  var custom = fakeDb("頭皮養護", "standard", {
    followUpDays: 28,
    customerBookingUrl: "https://liff.line.me/example"
  });
  var result = await schedulePigmentFollowUpReminders(
    { DB: custom, TENANT_ID: "t1" }, "b1", "2026-01-01T00:00:00.000Z"
  );
  assert.equal(result.followUpDays, 28);
  assert.equal(result.followUpAt, "2026-02-28T02:00:00.000Z");
  assert.equal(result.hasBookingUrl, true);
  var insert = custom.prepared.find(function (item) {
    return /standard_care_follow_up_21d/.test(item.sql);
  });
  assert.match(insert.binds[4], /再次預約：https:\/\/liff\.line\.me\/example\?serviceId=svc-1/);

  var disabled = fakeDb("頭皮養護", "standard", { followUpDays: 0 });
  var disabledResult = await schedulePigmentFollowUpReminders(
    { DB: disabled, TENANT_ID: "t1" }, "b1", "2026-01-01T00:00:00.000Z"
  );
  assert.equal(disabledResult.scheduled, false);
  assert.equal(disabledResult.reason, "follow_up_disabled");
});

test("排程派送前會排除已再次預約相同服務的客戶", function () {
  var source = readFileSync(join(import.meta.dirname, "../src/d1-notifications.js"), "utf8");
  assert.match(source, /template_code='standard_care_follow_up_21d'/);
  assert.match(source, /later_item\.service_id=original_item\.service_id/);
  assert.match(source, /later\.customer_id=original\.customer_id/);
  assert.match(source, /status='cancelled'/);
});

test("客戶再次預約連結會自動選取原服務", function () {
  var app = readFileSync(join(import.meta.dirname, "../../customer-ui/js/app.js"), "utf8");
  assert.match(app, /searchParams|URLSearchParams/);
  assert.match(app, /get\("serviceId"\)/);
  assert.match(app, /await selectServiceById\(requestedServiceId\)/);
});

test("旗艦版非霧眉霧唇服務不排標準版提醒，業主可手動改補色日期", async function () {
  var flagshipOther = fakeDb("手部凝膠", "flagship");
  assert.equal((await schedulePigmentFollowUpReminders(
    { DB: flagshipOther, TENANT_ID: "t1" }, "b1", "2026-01-01T00:00:00.000Z"
  )).scheduled, false);
  var db = fakeDb("自然霧眉");
  await updatePigmentFollowUpReminderDates({ DB: db, TENANT_ID: "t1" }, "b1", {
    touchupOn: "2026-03-01",
    maintenanceOn: "2026-12-31"
  });
  var updates = db.prepared.filter(function (item) { return /UPDATE notifications/.test(item.sql); });
  assert.equal(updates[0].binds[0], "2026-03-01T02:00:00.000Z");
  assert.equal(updates[1].binds[0], "2026-12-31T02:00:00.000Z");
});

test("業主端只在已完成霧眉或霧唇預約提供手動提醒日期", function () {
  var app = readFileSync(join(import.meta.dirname, "../../owner-admin/js/app.js"), "utf8");
  var api = readFileSync(join(import.meta.dirname, "../../owner-admin/js/api.js"), "utf8");
  var html = readFileSync(join(import.meta.dirname, "../../owner-admin/index.html"), "utf8");
  assert.match(app, /internalStatus === "completed"/);
  assert.match(app, /設定補色提醒日期/);
  assert.match(app, /霧唇/);
  assert.match(html, /滿月補色提醒日期/);
  assert.match(html, /滿年前維持補色保養提醒日期/);
  assert.match(app, /另外計費/);
  assert.match(app, /補色提醒日期/);
  assert.match(app, /pigmentTouchupReminderDate/);
  assert.match(app, /滿年前保養提醒/);
  assert.doesNotMatch(app, /(?:window\.)?prompt\s*\(/);
  assert.doesNotMatch(app, /(?:window\.)?confirm\s*\(/);
  assert.match(api, /\/pigment-reminders/);
});
