import { test } from "node:test";
import assert from "node:assert/strict";
import {
  customerCancelCutoffIso,
  purgeExpiredCustomerCancelledBookings
} from "../src/booking-retention.js";

function statement(sql, handlers) {
  return {
    sql: sql,
    binds: [],
    bind: function () { this.binds = Array.from(arguments); return this; },
    all: async function () { return handlers.all(this); }
  };
}

test("客戶取消保留精確 2 天，只有超過 48 小時才進入清理", function () {
  assert.equal(
    customerCancelCutoffIso(Date.parse("2026-08-06T12:00:00.000Z")),
    "2026-08-04T12:00:00.000Z"
  );
});

test("排程只查客戶取消且以 cancelled_at 嚴格早於 2 天為準", async function () {
  var prepared = [];
  var db = {
    prepare: function (sql) {
      var item = statement(sql, { all: async function () { return { results: [] }; } });
      prepared.push(item); return item;
    },
    batch: async function () { throw new Error("空清單不應刪除"); }
  };
  var result = await purgeExpiredCustomerCancelledBookings({ DB: db },
    Date.parse("2026-08-06T12:00:00.000Z"));
  assert.equal(result.deleted, 0);
  assert.match(prepared[0].sql,
    /status='cancelled_by_customer' AND cancelled_at<\?1/);
  assert.doesNotMatch(prepared[0].sql, /cancelled_by_store/);
  assert.equal(prepared[0].binds[0], "2026-08-04T12:00:00.000Z");
});

test("有私有照片時先刪 R2，再刪照片列與客戶取消預約", async function () {
  var events = [];
  var db = {
    prepare: function (sql) {
      return statement(sql, { all: async function (item) {
        if (/SELECT id, tenant_id FROM bookings/.test(item.sql)) {
          return { results: [{ id: "booking-1", tenant_id: "tenant-1" }] };
        }
        if (/SELECT object_key/.test(item.sql)) {
          return { results: [{ object_key: "private/a.jpg" }] };
        }
        return { results: [] };
      } });
    },
    batch: async function (items) {
      events.push("d1:" + items.map(function (item) { return item.sql; }).join("|"));
      return [
        { meta: { changes: 1 } },
        { meta: { changes: 1 } },
        { meta: { changes: 1 } }
      ];
    }
  };
  var bucket = { delete: async function (keys) { events.push("r2:" + keys.join(",")); } };
  var result = await purgeExpiredCustomerCancelledBookings({ DB: db, PHOTO_BUCKET: bucket },
    Date.parse("2026-08-06T12:00:00.000Z"));
  assert.equal(result.deleted, 1);
  assert.equal(events[0], "r2:private/a.jpg");
  assert.match(events[1], /DELETE FROM booking_review_photos/);
  assert.match(events[1], /UPDATE customer_photo_sets SET booking_id=NULL/);
  assert.match(events[1], /DELETE FROM bookings/);
});

test("R2 刪除失敗時不刪 D1，留待下次排程重試", async function () {
  var batches = 0;
  var db = {
    prepare: function (sql) {
      return statement(sql, { all: async function (item) {
        return /SELECT id, tenant_id FROM bookings/.test(item.sql)
          ? { results: [{ id: "booking-1", tenant_id: "tenant-1" }] }
          : { results: [{ object_key: "private/a.jpg" }] };
      } });
    },
    batch: async function () { batches += 1; return []; }
  };
  await assert.rejects(purgeExpiredCustomerCancelledBookings({
    DB: db,
    PHOTO_BUCKET: { delete: async function () { throw new Error("R2 unavailable"); } }
  }, Date.parse("2026-08-06T12:00:00.000Z")), /R2 unavailable/);
  assert.equal(batches, 0);
});
