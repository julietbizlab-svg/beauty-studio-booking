import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  applyOwnerGeneralBookingStatusTransition,
  expireOverdueDepositBookings,
  expireOverdueDepositBookingsForAllTenants
} from "../src/d1-repository.js";
import {
  BOOKING_STATUSES as S,
  isSlotBlockingStatus
} from "../src/booking-state-machine.js";

var migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
var migrationFiles = [
  "0001_init_core.sql", "0002_bookings.sql", "0003_settings_schedules.sql",
  "0004_ops_tables.sql", "0005_customer_import.sql", "0006_customer_claim_invites.sql",
  "0007_customer_comparison_photos.sql", "0008_booking_notice_policy.sql",
  "0009_booking_status_machine.sql", "0010_cleanup_duplicate_renamed_indexes.sql",
  "0011_ai_customer_inquiries.sql", "0012_booking_review_deposit_deadline.sql"
];
var NOW = "2026-07-20T00:00:00.000Z";

function readyDb() {
  var db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  migrationFiles.forEach(function (file) {
    db.exec(readFileSync(join(migrationsDir, file), "utf8"));
  });
  db.prepare(
    "INSERT INTO tenants (id, code, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  ).run("t", "t", "店", NOW, NOW);
  db.prepare(
    "INSERT INTO locations (id, tenant_id, code, name, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?, ?)"
  ).run("l", "t", "l", "店", NOW, NOW);
  db.prepare(
    "INSERT INTO staff (id, tenant_id, code, display_name, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?, ?)"
  ).run("s", "t", "s", "老師", NOW, NOW);
  db.prepare(
    "INSERT INTO customers (id, tenant_id, display_name, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?)"
  ).run("c", "t", "客人", NOW, NOW);
  return db;
}

function envFor(db) {
  return {
    DATA_BACKEND: "d1", TENANT_ID: "t", LOCATION_ID: "l", STAFF_ID: "s",
    DEFAULT_LINE_TENANT_ID: "t", LINE_CHANNEL_ACCESS_TOKEN: "test-token",
    DB: {
      prepare: function (sql) {
        var prepared = {
          bind: function () {
            var binds = Array.prototype.slice.call(arguments);
            return {
              sql: sql, binds: binds,
              first: async function () { return db.prepare(sql).get.apply(db.prepare(sql), binds) || null; },
              all: async function () { return { results: db.prepare(sql).all.apply(db.prepare(sql), binds) }; },
              run: async function () {
                var info = db.prepare(sql).run.apply(db.prepare(sql), binds);
                return { meta: { changes: info.changes } };
              }
            };
          }
        };
        return prepared;
      },
      batch: async function (statements) {
        db.exec("BEGIN IMMEDIATE");
        try {
          var out = statements.map(function (item) {
            var info = db.prepare(item.sql).run.apply(db.prepare(item.sql), item.binds);
            return { meta: { changes: info.changes } };
          });
          db.exec("COMMIT");
          return out;
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
      }
    }
  };
}

function insertBooking(db, id, status, dueAt) {
  db.prepare(
    "INSERT INTO bookings (id, tenant_id, location_id, customer_id, staff_id, booking_no, " +
    "start_at, end_at, status, deposit_due_at, created_at, updated_at) " +
    "VALUES (?, 't', 'l', 'c', 's', ?, '2099-08-01T02:00:00.000Z', " +
    "'2099-08-01T03:00:00.000Z', ?, ?, ?, ?)"
  ).run(id, id, status, dueAt || null, NOW, NOW);
  db.prepare(
    "INSERT INTO booking_items " +
    "(id, tenant_id, booking_id, service_name_snapshot, duration_minutes, " +
    "quantity, unit_price_amount, discount_amount, final_amount, sort_order, created_at) " +
    "VALUES (?, 't', ?, '手部美甲', 60, 1, 1200, 0, 1200, 0, ?)"
  ).run("item-" + id, id, NOW);
}

test("0012 新增期限欄位、索引與 schema version", function () {
  var db = readyDb();
  var columns = db.prepare("PRAGMA table_info(bookings)").all().map(function (row) {
    return row.name;
  });
  assert.ok(columns.includes("review_accepted_at"));
  assert.ok(columns.includes("deposit_due_at"));
  assert.ok(columns.includes("deposit_confirmed_at"));
  assert.ok(db.prepare(
    "SELECT 1 FROM schema_versions WHERE version = '0012_booking_review_deposit_deadline'"
  ).get());
});

test("業主受理開始 24 小時期限，確認訂金後才正式成立", async function () {
  var db = readyDb();
  insertBooking(db, "b1", S.PENDING_REVIEW);
  [
    ["deposit_enabled", "true", "boolean"],
    ["deposit_amount", "500", "number"],
    ["bank_name", "玉山銀行", "string"],
    ["bank_code", "808", "string"],
    ["bank_account", "0123456789012", "string"],
    ["bank_account_name", "茱麗葉工作室", "string"],
    ["deposit_notice", "匯款後請提供末五碼", "string"]
  ].forEach(function (item, index) {
    db.prepare(
      "INSERT INTO tenant_settings " +
      "(id, tenant_id, setting_key, setting_value, value_type, created_at, updated_at) " +
      "VALUES (?, 't', ?, ?, ?, ?, ?)"
    ).run("setting-" + index, item[0], item[1], item[2], NOW, NOW);
  });
  var env = envFor(db);
  env.BOOKING_REQUIRES_OWNER_CONFIRMATION = "true";
  await applyOwnerGeneralBookingStatusTransition(env, {
    bookingId: "b1", toStatus: S.PENDING_CUSTOMER_CONFIRMATION
  });
  var accepted = db.prepare(
    "SELECT status, review_accepted_at, deposit_due_at FROM bookings WHERE id = 'b1'"
  ).get();
  assert.equal(accepted.status, S.PENDING_CUSTOMER_CONFIRMATION);
  assert.equal(
    Date.parse(accepted.deposit_due_at) - Date.parse(accepted.review_accepted_at),
    24 * 60 * 60 * 1000
  );
  await applyOwnerGeneralBookingStatusTransition(env, {
    bookingId: "b1", toStatus: S.CONFIRMED
  });
  var confirmed = db.prepare(
    "SELECT status, deposit_confirmed_at FROM bookings WHERE id = 'b1'"
  ).get();
  assert.equal(confirmed.status, S.CONFIRMED);
  assert.ok(confirmed.deposit_confirmed_at);
  assert.deepEqual(
    db.prepare("SELECT template_code FROM notifications ORDER BY created_at, rowid")
      .all().map(function (row) { return row.template_code; }),
    ["deposit_payment_requested", "booking_confirmed"]
  );
  var paymentNotice = db.prepare(
    "SELECT content_snapshot FROM notifications " +
    "WHERE booking_id = 'b1' AND template_code = 'deposit_payment_requested'"
  ).get().content_snapshot;
  assert.match(paymentNotice, /訂金金額：NT\$ 500/);
  assert.match(paymentNotice, /銀行：玉山銀行（808）/);
  assert.match(paymentNotice, /轉帳帳號：0123456789012/);
  assert.match(paymentNotice, /戶名：茱麗葉工作室/);
  assert.match(paymentNotice, /付款期限：/);
  assert.match(paymentNotice, /匯款後請提供末五碼/);
  var confirmedNotice = db.prepare(
    "SELECT content_snapshot FROM notifications " +
    "WHERE booking_id = 'b1' AND template_code = 'booking_confirmed'"
  ).get().content_snapshot;
  assert.match(confirmedNotice, /您的預約已正式成立/);
  assert.match(confirmedNotice, /服務項目：手部美甲/);
  assert.match(confirmedNotice, /預約日期：2099\/08\/01（週六）/);
  assert.match(confirmedNotice, /預約時間：10:00/);
  assert.equal(confirmedNotice.includes("請至預約頁查看"), false);
});

test("v2 受理前若未設定完整訂金資料則拒絕開始倒數", async function () {
  var db = readyDb();
  insertBooking(db, "missing-deposit", S.PENDING_REVIEW);
  var env = envFor(db);
  env.BOOKING_REQUIRES_OWNER_CONFIRMATION = "true";
  await assert.rejects(
    applyOwnerGeneralBookingStatusTransition(env, {
      bookingId: "missing-deposit",
      toStatus: S.PENDING_CUSTOMER_CONFIRMATION
    }),
    /請先到店面設定開啟訂金/
  );
  assert.equal(
    db.prepare("SELECT status FROM bookings WHERE id = 'missing-deposit'").get().status,
    S.PENDING_REVIEW
  );
});

test("沒有正確 tenant LINE 通知路由時不得開始訂金期限", async function () {
  var db = readyDb();
  insertBooking(db, "missing-line-route", S.PENDING_REVIEW);
  [
    ["deposit_enabled", "true", "boolean"],
    ["deposit_amount", "500", "number"],
    ["bank_account", "0123456789012", "string"],
    ["bank_account_name", "茱麗葉工作室", "string"]
  ].forEach(function (item, index) {
    db.prepare(
      "INSERT INTO tenant_settings " +
      "(id, tenant_id, setting_key, setting_value, value_type, created_at, updated_at) " +
      "VALUES (?, 't', ?, ?, ?, ?, ?)"
    ).run("line-setting-" + index, item[0], item[1], item[2], NOW, NOW);
  });
  var env = envFor(db);
  env.BOOKING_REQUIRES_OWNER_CONFIRMATION = "true";
  env.DEFAULT_LINE_TENANT_ID = "another-tenant";
  await assert.rejects(
    applyOwnerGeneralBookingStatusTransition(env, {
      bookingId: "missing-line-route",
      toStatus: S.PENDING_CUSTOMER_CONFIRMATION
    }),
    /尚未完成 LINE 通知頻道設定/
  );
  assert.equal(
    db.prepare("SELECT status FROM bookings WHERE id = 'missing-line-route'").get().status,
    S.PENDING_REVIEW
  );
});

test("逾期工作只取消到期的待付款預約並釋放時段", async function () {
  var db = readyDb();
  insertBooking(db, "expired", S.PENDING_CUSTOMER_CONFIRMATION, "2026-07-20T01:00:00.000Z");
  insertBooking(db, "future", S.PENDING_CUSTOMER_CONFIRMATION, "2026-07-22T01:00:00.000Z");
  var result = await expireOverdueDepositBookings(envFor(db), "2026-07-21T01:00:00.000Z");
  assert.equal(result.expiredCount, 1);
  assert.equal(db.prepare("SELECT status FROM bookings WHERE id = 'expired'").get().status, S.EXPIRED);
  assert.equal(isSlotBlockingStatus(S.EXPIRED), false);
  assert.equal(
    db.prepare("SELECT status FROM bookings WHERE id = 'future'").get().status,
    S.PENDING_CUSTOMER_CONFIRMATION
  );
  assert.equal(
    db.prepare("SELECT reason_code FROM booking_status_logs WHERE booking_id = 'expired'").get()
      .reason_code,
    "deposit_deadline_expired"
  );
  assert.equal(
    db.prepare(
      "SELECT template_code FROM notifications WHERE booking_id = 'expired'"
    ).get().template_code,
    "deposit_expired"
  );
});

test("排程跨 tenant 取消逾期訂金預約，標準版與旗艦版都釋放時段", async function () {
  var db = readyDb();
  db.prepare(
    "INSERT INTO tenants (id, code, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  ).run("flagship", "flagship", "旗艦店", NOW, NOW);
  db.prepare(
    "INSERT INTO locations (id, tenant_id, code, name, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?, ?)"
  ).run("flagship-location", "flagship", "main", "旗艦店", NOW, NOW);
  db.prepare(
    "INSERT INTO staff (id, tenant_id, code, display_name, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?, ?)"
  ).run("flagship-staff", "flagship", "owner", "旗艦老師", NOW, NOW);
  db.prepare(
    "INSERT INTO customers (id, tenant_id, display_name, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?)"
  ).run("flagship-customer", "flagship", "旗艦客人", NOW, NOW);
  insertBooking(
    db,
    "standard-expired",
    S.PENDING_CUSTOMER_CONFIRMATION,
    "2026-07-20T01:00:00.000Z"
  );
  db.prepare(
    "INSERT INTO bookings (id, tenant_id, location_id, customer_id, staff_id, booking_no, " +
    "start_at, end_at, status, deposit_due_at, created_at, updated_at) " +
    "VALUES ('flagship-expired', 'flagship', 'flagship-location', 'flagship-customer', " +
    "'flagship-staff', 'flagship-expired', '2099-08-01T02:00:00.000Z', " +
    "'2099-08-01T03:00:00.000Z', 'pending_customer_confirmation', " +
    "'2026-07-20T01:00:00.000Z', ?, ?)"
  ).run(NOW, NOW);
  var result = await expireOverdueDepositBookingsForAllTenants(
    envFor(db),
    "2026-07-21T01:00:00.000Z"
  );
  assert.equal(result.expiredCount, 2);
  assert.equal(
    db.prepare("SELECT status FROM bookings WHERE id = 'standard-expired'").get().status,
    S.EXPIRED
  );
  assert.equal(
    db.prepare("SELECT status FROM bookings WHERE id = 'flagship-expired'").get().status,
    S.EXPIRED
  );
  assert.equal(isSlotBlockingStatus(S.EXPIRED), false);
});
