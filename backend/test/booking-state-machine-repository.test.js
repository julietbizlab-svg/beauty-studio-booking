/**
 * applyBookingStatusTransition repository 整合測試
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  applyBookingStatusTransition,
  createBooking,
  cancelBooking,
  cancelBookingByOwner
} from "../src/d1-repository.js";
import { BOOKING_STATUSES as S, BOOKING_ACTORS } from "../src/booking-state-machine.js";

var migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
var MIGRATION_FILES = [
  "0001_init_core.sql",
  "0002_bookings.sql",
  "0003_settings_schedules.sql",
  "0004_ops_tables.sql",
  "0005_customer_import.sql",
  "0006_customer_claim_invites.sql",
  "0007_customer_comparison_photos.sql",
  "0008_booking_notice_policy.sql",
  "0009_booking_status_machine.sql"
];

var NOW = "2026-07-20T00:00:00.000Z";
var FUTURE_START = "2026-08-01T02:00:00.000Z";
var FUTURE_END = "2026-08-01T03:00:00.000Z";

function applyMigrations(db) {
  db.exec("PRAGMA foreign_keys = ON;");
  MIGRATION_FILES.forEach(function (file) {
    db.exec(readFileSync(join(migrationsDir, file), "utf8"));
  });
}

function seedBase(db) {
  db.prepare(
    "INSERT INTO tenants (id, code, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  ).run("tenant-a", "ta", "租戶Ａ", NOW, NOW);
  db.prepare(
    "INSERT INTO locations (id, tenant_id, code, name, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?, ?)"
  ).run("loc-a", "tenant-a", "loc", "店面", NOW, NOW);
  db.prepare(
    "INSERT INTO staff (id, tenant_id, code, display_name, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?, ?)"
  ).run("staff-a", "tenant-a", "staff-a", "老師", NOW, NOW);
  db.prepare(
    "INSERT INTO customers (id, tenant_id, display_name, mobile, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?, ?)"
  ).run("cust-a", "tenant-a", "客戶甲", "0912345678", NOW, NOW);
  db.prepare(
    "INSERT INTO line_accounts (id, tenant_id, customer_id, line_user_id, linked_at) " +
    "VALUES (?, ?, ?, ?, ?)"
  ).run("la-a", "tenant-a", "cust-a", "U-test-user", NOW);
  db.prepare(
    "INSERT INTO services (id, tenant_id, code, name, duration_minutes, price_amount, status, " +
    "sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run("svc-a", "tenant-a", "brow", "霧眉", 60, 3000, "active", 0, NOW, NOW);
  db.prepare(
    "INSERT INTO tenant_settings (id, tenant_id, setting_key, setting_value, value_type, " +
    "created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run("ts-1", "tenant-a", "booking_min_notice_days", "0", "number", NOW, NOW);
  db.prepare(
    "INSERT INTO tenant_settings (id, tenant_id, setting_key, setting_value, value_type, " +
    "created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run("ts-2", "tenant-a", "cancellation_min_notice_days", "1", "number", NOW, NOW);
}

function makeEnv(db) {
  var batchCalls = [];
  var wrapped = {
    prepare: function (sql) {
      return {
        bind: function () {
          var binds = Array.prototype.slice.call(arguments);
          return {
            sql: sql,
            binds: binds,
            all: async function () {
              var stmt = db.prepare(sql);
              var rows = stmt.all.apply(stmt, binds);
              return { results: rows };
            },
            first: async function () {
              var stmt = db.prepare(sql);
              return stmt.get.apply(stmt, binds) || null;
            },
            run: async function () {
              var stmt = db.prepare(sql);
              var info = stmt.run.apply(stmt, binds);
              return { meta: { changes: info.changes } };
            }
          };
        }
      };
    },
    batch: async function (statements) {
      batchCalls.push(statements);
      db.exec("BEGIN IMMEDIATE");
      try {
        var results = [];
        for (var i = 0; i < statements.length; i++) {
          var s = statements[i];
          var stmt = db.prepare(s.sql);
          var info = stmt.run.apply(stmt, s.binds);
          results.push({ meta: { changes: info.changes } });
        }
        db.exec("COMMIT");
        return results;
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    }
  };
  return {
    DB: wrapped,
    TENANT_ID: "tenant-a",
    LOCATION_ID: "loc-a",
    STAFF_ID: "staff-a",
    DATA_BACKEND: "d1",
    _batchCalls: batchCalls
  };
}

function insertConfirmedBooking(db, id, bookingNo) {
  db.prepare(
    "INSERT INTO bookings (id, tenant_id, location_id, customer_id, staff_id, booking_no, " +
    "start_at, end_at, status, cancellation_notice_days_snapshot, cancellation_deadline_at, " +
    "created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', 1, ?, ?, ?)"
  ).run(
    id, "tenant-a", "loc-a", "cust-a", "staff-a", bookingNo,
    FUTURE_START, FUTURE_END, "2026-07-31T02:00:00.000Z", NOW, NOW
  );
}

test("合法 transition 寫入 booking update 與 status log 同一 batch", async function () {
  var db = new DatabaseSync(":memory:");
  applyMigrations(db);
  seedBase(db);
  insertConfirmedBooking(db, "bk-1", "BK-1");
  var env = makeEnv(db);

  var result = await applyBookingStatusTransition(env, {
    bookingId: "bk-1",
    toStatus: S.COMPLETED,
    actor: BOOKING_ACTORS.STAFF,
    actorId: "staff-a"
  });

  assert.equal(result.fromStatus, S.CONFIRMED);
  assert.equal(result.toStatus, S.COMPLETED);
  assert.equal(env._batchCalls.length, 1);
  assert.equal(env._batchCalls[0].length, 2);

  var row = db.prepare("SELECT status, completed_at FROM bookings WHERE id = ?").get("bk-1");
  assert.equal(row.status, S.COMPLETED);
  assert.ok(row.completed_at);

  var log = db.prepare(
    "SELECT from_status, to_status FROM booking_status_logs WHERE booking_id = ?"
  ).get("bk-1");
  assert.equal(log.from_status, S.CONFIRMED);
  assert.equal(log.to_status, S.COMPLETED);
});

test("非法 transition 零 DB 寫入", async function () {
  var db = new DatabaseSync(":memory:");
  applyMigrations(db);
  seedBase(db);
  insertConfirmedBooking(db, "bk-2", "BK-2");
  var env = makeEnv(db);

  await assert.rejects(
    applyBookingStatusTransition(env, {
      bookingId: "bk-2",
      toStatus: S.DRAFT,
      actor: BOOKING_ACTORS.STAFF,
      actorId: "staff-a"
    }),
    /不允許的預約狀態轉換/
  );

  assert.equal(env._batchCalls.length, 0);
  var logCount = db.prepare(
    "SELECT COUNT(*) AS c FROM booking_status_logs WHERE booking_id = ?"
  ).get("bk-2").c;
  assert.equal(logCount, 0);
  assert.equal(
    db.prepare("SELECT status FROM bookings WHERE id = ?").get("bk-2").status,
    S.CONFIRMED
  );
});

test("customer 不得將 completed 恢復 confirmed", async function () {
  var db = new DatabaseSync(":memory:");
  applyMigrations(db);
  seedBase(db);
  db.prepare(
    "INSERT INTO bookings (id, tenant_id, location_id, customer_id, staff_id, booking_no, " +
    "start_at, end_at, status, completed_at, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?)"
  ).run(
    "bk-done", "tenant-a", "loc-a", "cust-a", "staff-a", "BK-DONE",
    FUTURE_START, FUTURE_END, NOW, NOW, NOW
  );
  var env = makeEnv(db);

  await assert.rejects(
    applyBookingStatusTransition(env, {
      bookingId: "bk-done",
      toStatus: S.CONFIRMED,
      actor: BOOKING_ACTORS.CUSTOMER,
      customerUserId: "U-test-user"
    }),
    /不允許的預約狀態轉換/
  );
});

test("tenant 隔離：其他 tenant booking 不可轉換", async function () {
  var db = new DatabaseSync(":memory:");
  applyMigrations(db);
  seedBase(db);
  db.prepare(
    "INSERT INTO tenants (id, code, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  ).run("tenant-b", "tb", "租戶Ｂ", NOW, NOW);
  db.prepare(
    "INSERT INTO locations (id, tenant_id, code, name, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?, ?)"
  ).run("loc-b", "tenant-b", "locb", "店面Ｂ", NOW, NOW);
  db.prepare(
    "INSERT INTO customers (id, tenant_id, display_name, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?)"
  ).run("cust-b", "tenant-b", "客戶乙", NOW, NOW);
  db.prepare(
    "INSERT INTO bookings (id, tenant_id, location_id, customer_id, booking_no, " +
    "start_at, end_at, status, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?)"
  ).run(
    "bk-other", "tenant-b", "loc-b", "cust-b", "BK-OTHER",
    FUTURE_START, FUTURE_END, NOW, NOW
  );
  var env = makeEnv(db);

  await assert.rejects(
    applyBookingStatusTransition(env, {
      bookingId: "bk-other",
      toStatus: S.COMPLETED,
      actor: BOOKING_ACTORS.STAFF,
      actorId: "staff-a"
    }),
    /找不到此預約/
  );
});

test("同狀態 transition batch 前拒絕、零寫入", async function () {
  var db = new DatabaseSync(":memory:");
  applyMigrations(db);
  seedBase(db);
  insertConfirmedBooking(db, "bk-same", "BK-SAME");
  var env = makeEnv(db);

  await assert.rejects(
    applyBookingStatusTransition(env, {
      bookingId: "bk-same",
      toStatus: S.CONFIRMED,
      actor: BOOKING_ACTORS.STAFF,
      actorId: "staff-a"
    }),
    /狀態未變更/
  );

  assert.equal(env._batchCalls.length, 0);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS c FROM booking_status_logs WHERE booking_id = ?").get("bk-same").c,
    0
  );
});

test("未知 actor batch 前拒絕、零寫入", async function () {
  var db = new DatabaseSync(":memory:");
  applyMigrations(db);
  seedBase(db);
  insertConfirmedBooking(db, "bk-bad-actor", "BK-BAD");
  var env = makeEnv(db);

  await assert.rejects(
    applyBookingStatusTransition(env, {
      bookingId: "bk-bad-actor",
      toStatus: S.COMPLETED,
      actor: "hacker",
      actorId: "staff-a"
    }),
    /未知的操作者/
  );

  assert.equal(env._batchCalls.length, 0);
});

test("customer 所有權 tenant scoped：錯誤 userId 403、零 batch", async function () {
  var db = new DatabaseSync(":memory:");
  applyMigrations(db);
  seedBase(db);
  insertConfirmedBooking(db, "bk-own", "BK-OWN");
  var env = makeEnv(db);

  await assert.rejects(
    applyBookingStatusTransition(env, {
      bookingId: "bk-own",
      toStatus: S.CANCELLED_BY_CUSTOMER,
      actor: BOOKING_ACTORS.CUSTOMER,
      customerUserId: "U-wrong-user",
      actorId: "cust-a"
    }),
    /無法操作他人的預約/
  );

  assert.equal(env._batchCalls.length, 0);
});

test("createBooking／cancelBooking／cancelBookingByOwner 無退步", async function () {
  var db = new DatabaseSync(":memory:");
  applyMigrations(db);
  seedBase(db);
  var env = makeEnv(db);

  var created = await createBooking(env, {
    userId: "U-test-user",
    customerName: "客戶甲",
    phone: "0912345678",
    serviceId: "svc-a",
    date: "2027-06-15",
    time: "10:00"
  });
  assert.equal(created.booking.status, "已確認");
  assert.equal(created.booking.isConfirmed, true);
  assert.equal(created.booking.publicStatus, "confirmed");

  var bookingId = created.booking.id;
  var cancelled = await cancelBooking(env, "U-test-user", bookingId);
  assert.equal(cancelled.ok, true);
  assert.equal(
    db.prepare("SELECT status FROM bookings WHERE id = ?").get(bookingId).status,
    S.CANCELLED_BY_CUSTOMER
  );

  insertConfirmedBooking(db, "bk-owner", "BK-OWNER");
  var ownerCancel = await cancelBookingByOwner(env, "bk-owner", "  業主原因  ");
  assert.equal(ownerCancel.ok, true);
  assert.equal(
    db.prepare("SELECT status FROM bookings WHERE id = ?").get("bk-owner").status,
    S.CANCELLED_BY_STORE
  );
});
