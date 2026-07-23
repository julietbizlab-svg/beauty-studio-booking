/**
 * Owner 改期（confirmed → 新 confirmed + 舊 rescheduled）整合測試
 *
 * 時間政策註記：
 * - Owner 改期第一版不套用 customer booking_min_notice_days。
 * - 仍必須拒絕已開始／已過去時段。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import worker from "../src/index.js";
import {
  rescheduleBookingByOwner,
  getOwnerBookingsForMonth,
  getUserBookings
} from "../src/d1-repository.js";
import * as dataRepository from "../src/data-repository.js";
import {
  BOOKING_STATUSES as S,
  OWNER_RESCHEDULED_REASON_CODE,
  CUSTOMER_VISIBLE_STATUS_SQL,
  CUSTOMER_VISIBLE_STATUSES,
  OWNER_VISIBLE_STATUSES
} from "../src/booking-state-machine.js";
import { computeCancellationDeadlineAt } from "../src/booking-notice-policy.js";

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
  "0009_booking_status_machine.sql",
  "0010_cleanup_duplicate_renamed_indexes.sql"
];

var TENANT = "tenant-resched-001";
var OTHER_TENANT = "tenant-resched-other";
var LOCATION = "location-resched-001";
var STAFF = "staff-resched-001";
var STAFF_B = "staff-resched-002";
var API = "https://example.com";
var NOW = "2026-07-20T12:00:00.000Z";

// 未來時段（避免 date flake）：台北 2099-08-01 10:00 → UTC
var OLD_START = "2099-08-01T02:00:00.000Z";
var OLD_END = "2099-08-01T03:00:00.000Z";
var NEW_DATE = "2099-08-15";
var NEW_TIME = "14:00";
var NEW_START = "2099-08-15T06:00:00.000Z";

var OWNER_TOKEN = "token-owner";
var STRANGER_TOKEN = "token-stranger";
var TOKEN_SUBS = {};
TOKEN_SUBS[OWNER_TOKEN] = "U-owner-1";
TOKEN_SUBS[STRANGER_TOKEN] = "U-stranger";

globalThis.fetch = async function (url, options) {
  if (String(url) === "https://api.line.me/oauth2/v2.1/verify") {
    var body = String((options && options.body) || "");
    var match = body.match(/id_token=([^&]*)/);
    var token = decodeURIComponent((match && match[1]) || "");
    var sub = TOKEN_SUBS[token];
    if (!sub) {
      return new Response(
        JSON.stringify({ error_description: "invalid token" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response(
      JSON.stringify({ sub: sub, name: "測試", picture: "" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
  throw new Error("測試不允許未預期的外部連線：" + url);
};

function applyMigrations(db) {
  db.exec("PRAGMA foreign_keys = ON;");
  MIGRATION_FILES.forEach(function (file) {
    db.exec(readFileSync(join(migrationsDir, file), "utf8"));
  });
}

function seedBase(db) {
  db.prepare(
    "INSERT INTO tenants (id, code, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  ).run(TENANT, "tn", "租戶", NOW, NOW);
  db.prepare(
    "INSERT INTO tenants (id, code, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  ).run(OTHER_TENANT, "to", "其他租戶", NOW, NOW);
  db.prepare(
    "INSERT INTO locations (id, tenant_id, code, name, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?, ?)"
  ).run(LOCATION, TENANT, "loc", "店面", NOW, NOW);
  db.prepare(
    "INSERT INTO staff (id, tenant_id, code, display_name, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?, ?)"
  ).run(STAFF, TENANT, "staff", "老師", NOW, NOW);
  db.prepare(
    "INSERT INTO staff (id, tenant_id, code, display_name, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?, ?)"
  ).run(STAFF_B, TENANT, "staffb", "老師乙", NOW, NOW);
  db.prepare(
    "INSERT INTO customers (id, tenant_id, display_name, mobile, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?, ?)"
  ).run("cust-a", TENANT, "客戶甲", "0912345678", NOW, NOW);
  db.prepare(
    "INSERT INTO customers (id, tenant_id, display_name, mobile, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?, ?)"
  ).run("cust-b", TENANT, "客戶乙", "0987654321", NOW, NOW);
  db.prepare(
    "INSERT INTO line_accounts (id, tenant_id, customer_id, line_user_id, linked_at) " +
    "VALUES (?, ?, ?, ?, ?)"
  ).run("la-a", TENANT, "cust-a", "U-customer-1", NOW);
  db.prepare(
    "INSERT INTO services (id, tenant_id, code, name, duration_minutes, price_amount, status, " +
    "sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run("svc-a", TENANT, "brow", "霧眉", 60, 3000, "active", 0, NOW, NOW);
  db.prepare(
    "INSERT INTO services (id, tenant_id, code, name, duration_minutes, price_amount, status, " +
    "sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run("svc-b", TENANT, "lip", "霧唇", 30, 1500, "active", 1, NOW, NOW);
}

function insertBooking(db, opts) {
  var o = opts || {};
  db.prepare(
    "INSERT INTO bookings (id, tenant_id, location_id, customer_id, staff_id, booking_no, " +
    "start_at, end_at, status, source, created_by_type, created_by_id, " +
    "cancellation_notice_days_snapshot, cancellation_deadline_at, " +
    "created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    o.id || "bk-1",
    o.tenantId || TENANT,
    o.locationId || LOCATION,
    o.customerId || "cust-a",
    o.staffId || STAFF,
    o.bookingNo || (o.id || "bk-1"),
    o.startAt || OLD_START,
    o.endAt || OLD_END,
    o.status || S.CONFIRMED,
    o.source || "line",
    o.createdByType || "customer",
    o.createdById || "cust-a",
    o.noticeSnapshot != null ? o.noticeSnapshot : 2,
    o.deadlineAt || "2099-07-30T02:00:00.000Z",
    NOW,
    NOW
  );
}

function insertItem(db, opts) {
  var o = opts || {};
  db.prepare(
    "INSERT INTO booking_items (id, tenant_id, booking_id, service_id, service_name_snapshot, " +
    "duration_minutes, quantity, unit_price_amount, discount_amount, final_amount, " +
    "sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    o.id || ("item-" + (o.bookingId || "bk-1")),
    o.tenantId || TENANT,
    o.bookingId || "bk-1",
    o.serviceId || "svc-a",
    o.serviceName || "霧眉",
    o.durationMinutes != null ? o.durationMinutes : 60,
    o.quantity != null ? o.quantity : 1,
    o.unitPrice != null ? o.unitPrice : 3000,
    o.discount != null ? o.discount : 0,
    o.finalAmount != null ? o.finalAmount : 3000,
    o.sortOrder != null ? o.sortOrder : 0,
    NOW
  );
}

function makeEnv(db, overrides) {
  return Object.assign({
    DATA_BACKEND: "d1",
    DB: {
      prepare: function (sql) {
        return {
          bind: function () {
            var binds = Array.prototype.slice.call(arguments);
            return {
              sql: sql,
              binds: binds,
              all: async function () {
                var stmt = db.prepare(sql);
                return { results: stmt.all.apply(stmt, binds) };
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
    },
    TENANT_ID: TENANT,
    LOCATION_ID: LOCATION,
    STAFF_ID: STAFF,
    LIFF_CHANNEL_ID: "liff-channel-test",
    OWNER_LINE_USER_IDS: "U-owner-1"
  }, overrides || {});
}

function makeD1LikeEnvWithThisAwareBind(db) {
  var batchCalls = [];
  var bindThisChecks = [];

  function makePreparedStatement(sql) {
    var statement = {
      dbSession: { id: "d1-session-" + Math.random().toString(16).slice(2) },
      bind: function () {
        if (this == null || this.dbSession == null) {
          throw new TypeError("Cannot read properties of null (reading 'dbSession')");
        }
        bindThisChecks.push({
          receiverIsStatement: this === statement,
          hasDbSession: Boolean(this.dbSession)
        });
        var binds = Array.prototype.slice.call(arguments);
        return {
          sql: sql,
          binds: binds,
          all: async function () {
            var stmt = db.prepare(sql);
            return { results: stmt.all.apply(stmt, binds) };
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
    return statement;
  }

  return {
    DATA_BACKEND: "d1",
    DB: {
      prepare: function (sql) {
        return makePreparedStatement(sql);
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
    },
    TENANT_ID: TENANT,
    LOCATION_ID: LOCATION,
    STAFF_ID: STAFF,
    _batchCalls: batchCalls,
    _bindThisChecks: bindThisChecks
  };
}

function jsonRequest(method, path, body, token) {
  var headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  return new Request(API + path, {
    method: method,
    headers: headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
}

function makeReadyDb(opts) {
  var db = new DatabaseSync(":memory:");
  applyMigrations(db);
  seedBase(db);
  var bookingOpts = opts || {};
  insertBooking(db, bookingOpts);
  if (bookingOpts.skipDefaultItem) {
    return db;
  }
  insertItem(db, {
    id: "item-1-" + (bookingOpts.id || "bk-1"),
    bookingId: bookingOpts.id || "bk-1"
  });
  if (bookingOpts.extraItems) {
    bookingOpts.extraItems.forEach(function (item) {
      insertItem(db, Object.assign({ bookingId: bookingOpts.id || "bk-1" }, item));
    });
  }
  return db;
}

function assertOldUnchanged(db, bookingId, expectedStatus) {
  assert.equal(
    db.prepare("SELECT status FROM bookings WHERE id = ?").get(bookingId).status,
    expectedStatus
  );
  assert.equal(
    db.prepare("SELECT COUNT(*) AS c FROM bookings WHERE parent_booking_id = ?")
      .get(bookingId).c,
    0
  );
  assert.equal(
    db.prepare(
      "SELECT COUNT(*) AS c FROM booking_status_logs WHERE booking_id = ? " +
      "AND to_status = 'rescheduled'"
    ).get(bookingId).c,
    0
  );
}

function countBookings(db) {
  return db.prepare("SELECT COUNT(*) AS c FROM bookings").get().c;
}

/** 目前時間 + N 天，轉為 Asia/Taipei 的 YYYY-MM-DD（測試用近未來，避免固定曆日失效） */
function taipeiDateDaysFromNow(days) {
  var target = new Date(Date.now() + Number(days) * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(target);
}

test("成功改期：欄位、parent、items、兩筆 status log、reason_code", async function () {
  var db = makeReadyDb({
    id: "bk-ok",
    noticeSnapshot: 3,
    deadlineAt: "2099-07-29T02:00:00.000Z",
    extraItems: [{
      id: "item-2-bk-ok",
      serviceId: "svc-b",
      serviceName: "霧唇",
      durationMinutes: 30,
      quantity: 1,
      unitPrice: 1500,
      discount: 100,
      finalAmount: 1400,
      sortOrder: 1
    }]
  });
  // 兩項合計 90 分；更新舊 end_at 以符合快照總時長（成功路徑以 item 時長重算）
  db.prepare("UPDATE bookings SET end_at = ? WHERE id = ?")
    .run("2099-08-01T03:30:00.000Z", "bk-ok");

  var response = await worker.fetch(
    jsonRequest(
      "POST",
      "/api/owner/bookings/bk-ok/reschedule",
      {
        date: NEW_DATE,
        time: NEW_TIME,
        actor: "customer",
        actorId: "forged-actor",
        tenantId: "forged-tenant",
        staffId: "forged-staff",
        customerId: "forged-customer",
        serviceId: "forged-service",
        duration: 999,
        price: 1,
        status: "pending",
        now: "2099-01-01T00:00:00.000Z",
        reasonCode: "forged_reason",
        parentBookingId: "forged-parent"
      },
      OWNER_TOKEN
    ),
    makeEnv(db)
  );
  assert.equal(response.status, 200);
  var body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.oldBookingId, "bk-ok");
  assert.equal(body.fromStatus, S.CONFIRMED);
  assert.equal(body.oldStatus, S.RESCHEDULED);
  assert.equal(body.newStatus, S.CONFIRMED);
  assert.equal(body.date, NEW_DATE);
  assert.equal(body.time, NEW_TIME);
  assert.ok(body.newBookingId);
  assert.ok(!body.customerId);
  assert.ok(!body.staffId);
  assert.ok(!body.tenantId);

  var oldRow = db.prepare(
    "SELECT status, parent_booking_id FROM bookings WHERE id = ?"
  ).get("bk-ok");
  assert.equal(oldRow.status, S.RESCHEDULED);
  assert.equal(oldRow.parent_booking_id, null);

  var newRow = db.prepare(
    "SELECT id, status, parent_booking_id, source, created_by_type, created_by_id, " +
    "customer_id, staff_id, location_id, start_at, end_at, " +
    "cancellation_notice_days_snapshot, cancellation_deadline_at, booking_no " +
    "FROM bookings WHERE id = ?"
  ).get(body.newBookingId);
  assert.equal(newRow.status, S.CONFIRMED);
  assert.equal(newRow.parent_booking_id, "bk-ok");
  assert.equal(newRow.source, "admin");
  assert.equal(newRow.created_by_type, "staff");
  assert.equal(newRow.created_by_id, STAFF);
  assert.equal(newRow.customer_id, "cust-a");
  assert.equal(newRow.staff_id, STAFF);
  assert.equal(newRow.location_id, LOCATION);
  assert.equal(newRow.start_at, NEW_START);
  assert.equal(newRow.end_at, "2099-08-15T07:30:00.000Z");
  assert.equal(newRow.cancellation_notice_days_snapshot, 3);
  assert.equal(
    newRow.cancellation_deadline_at,
    computeCancellationDeadlineAt(NEW_START, 3)
  );
  assert.ok(String(newRow.booking_no).indexOf("BK-") === 0);
  assert.notEqual(newRow.booking_no, "bk-ok");

  var newItems = db.prepare(
    "SELECT id, service_id, service_name_snapshot, duration_minutes, quantity, " +
    "unit_price_amount, discount_amount, final_amount, sort_order " +
    "FROM booking_items WHERE booking_id = ? ORDER BY sort_order ASC"
  ).all(body.newBookingId);
  assert.equal(newItems.length, 2);
  assert.notEqual(newItems[0].id, "item-1-bk-ok");
  assert.notEqual(newItems[1].id, "item-2-bk-ok");
  assert.equal(newItems[0].service_id, "svc-a");
  assert.equal(newItems[0].service_name_snapshot, "霧眉");
  assert.equal(newItems[0].duration_minutes, 60);
  assert.equal(newItems[0].final_amount, 3000);
  assert.equal(newItems[1].service_id, "svc-b");
  assert.equal(newItems[1].discount_amount, 100);
  assert.equal(newItems[1].final_amount, 1400);

  var oldLog = db.prepare(
    "SELECT from_status, to_status, changed_by_type, changed_by_id, reason_code " +
    "FROM booking_status_logs WHERE booking_id = ? AND to_status = 'rescheduled'"
  ).get("bk-ok");
  assert.equal(oldLog.from_status, S.CONFIRMED);
  assert.equal(oldLog.to_status, S.RESCHEDULED);
  assert.equal(oldLog.changed_by_type, "staff");
  assert.equal(oldLog.changed_by_id, STAFF);
  assert.equal(oldLog.reason_code, OWNER_RESCHEDULED_REASON_CODE);

  var newLog = db.prepare(
    "SELECT from_status, to_status, changed_by_type, changed_by_id, reason_code " +
    "FROM booking_status_logs WHERE booking_id = ?"
  ).get(body.newBookingId);
  assert.equal(newLog.from_status, null);
  assert.equal(newLog.to_status, S.CONFIRMED);
  assert.equal(newLog.changed_by_type, "staff");
  assert.equal(newLog.changed_by_id, STAFF);
});

test("無 token 401、非 Owner 403", async function () {
  var db = makeReadyDb({ id: "bk-auth" });
  var env = makeEnv(db);
  var noToken = await worker.fetch(
    jsonRequest("POST", "/api/owner/bookings/bk-auth/reschedule", {
      date: NEW_DATE,
      time: NEW_TIME
    }),
    env
  );
  assert.equal(noToken.status, 401);

  var stranger = await worker.fetch(
    jsonRequest(
      "POST",
      "/api/owner/bookings/bk-auth/reschedule",
      { date: NEW_DATE, time: NEW_TIME },
      STRANGER_TOKEN
    ),
    env
  );
  assert.equal(stranger.status, 403);
  assertOldUnchanged(db, "bk-auth", S.CONFIRMED);
});

test("Notion 501", async function () {
  var response = await worker.fetch(
    jsonRequest(
      "POST",
      "/api/owner/bookings/bk-notion/reschedule",
      { date: NEW_DATE, time: NEW_TIME },
      OWNER_TOKEN
    ),
    {
      DATA_BACKEND: "notion",
      NOTION_TOKEN: "notion-secret",
      NOTION_DATABASE_SERVICES: "db-services",
      NOTION_DATABASE_SLOTS: "db-slots",
      NOTION_DATABASE_BOOKINGS: "db-bookings",
      NOTION_DATABASE_SETTINGS: "db-settings",
      LIFF_CHANNEL_ID: "liff-channel-test",
      OWNER_LINE_USER_IDS: "U-owner-1",
      STAFF_ID: STAFF,
      TENANT_ID: TENANT,
      LOCATION_ID: LOCATION
    }
  );
  assert.equal(response.status, 501);
});

test("data-repository wrapper：notion 501", function () {
  assert.throws(
    function () {
      dataRepository.rescheduleBookingByOwner(
        { DATA_BACKEND: "notion", NOTION_TOKEN: "x" },
        "bk-1",
        { date: NEW_DATE, time: NEW_TIME }
      );
    },
    function (error) {
      assert.equal(error.status, 501);
      assert.match(error.message, /不支援/);
      return true;
    }
  );
});

test("缺 STAFF_ID／LOCATION_ID／TENANT_ID fail closed 500", async function () {
  var db = makeReadyDb({ id: "bk-cfg" });
  await assert.rejects(
    rescheduleBookingByOwner(makeEnv(db, { STAFF_ID: "" }), "bk-cfg", {
      date: NEW_DATE,
      time: NEW_TIME
    }),
    function (error) {
      assert.equal(error.status, 500);
      assert.match(error.message, /STAFF_ID/);
      return true;
    }
  );
  await assert.rejects(
    rescheduleBookingByOwner(makeEnv(db, { LOCATION_ID: "" }), "bk-cfg", {
      date: NEW_DATE,
      time: NEW_TIME
    }),
    function (error) {
      assert.equal(error.status, 500);
      assert.match(error.message, /LOCATION_ID/);
      return true;
    }
  );
  await assert.rejects(
    rescheduleBookingByOwner(makeEnv(db, { TENANT_ID: "" }), "bk-cfg", {
      date: NEW_DATE,
      time: NEW_TIME
    }),
    function (error) {
      assert.equal(error.status, 500);
      assert.match(error.message, /TENANT_ID/);
      return true;
    }
  );
  assertOldUnchanged(db, "bk-cfg", S.CONFIRMED);
});

test("找不到 booking 404；tenant 隔離 404", async function () {
  var db = makeReadyDb({ id: "bk-home" });
  var missing = await worker.fetch(
    jsonRequest(
      "POST",
      "/api/owner/bookings/missing/reschedule",
      { date: NEW_DATE, time: NEW_TIME },
      OWNER_TOKEN
    ),
    makeEnv(db)
  );
  assert.equal(missing.status, 404);

  var isolated = await worker.fetch(
    jsonRequest(
      "POST",
      "/api/owner/bookings/bk-home/reschedule",
      { date: NEW_DATE, time: NEW_TIME },
      OWNER_TOKEN
    ),
    makeEnv(db, { TENANT_ID: OTHER_TENANT })
  );
  assert.equal(isolated.status, 404);
  assertOldUnchanged(db, "bk-home", S.CONFIRMED);
});

test("非 confirmed 狀態全部拒絕、零寫入", async function () {
  var blocked = [
    S.PENDING,
    S.CHECKED_IN,
    S.COMPLETED,
    S.CANCELLED_BY_CUSTOMER,
    S.CANCELLED_BY_STORE,
    S.NO_SHOW,
    S.RESCHEDULED
  ];
  for (var i = 0; i < blocked.length; i++) {
    var status = blocked[i];
    var id = "rej-" + status;
    var db = makeReadyDb({ id: id, status: S.CONFIRMED });
    if (status === S.COMPLETED) {
      db.prepare(
        "UPDATE bookings SET status = 'completed', completed_at = ? WHERE id = ?"
      ).run(NOW, id);
    } else if (status === S.CANCELLED_BY_CUSTOMER || status === S.CANCELLED_BY_STORE) {
      db.prepare(
        "UPDATE bookings SET status = ?, cancelled_at = ?, " +
        "cancellation_reason_code = ?, cancellation_note = ? WHERE id = ?"
      ).run(status, NOW, "test", "測試取消", id);
    } else {
      db.prepare("UPDATE bookings SET status = ? WHERE id = ?").run(status, id);
    }
    var before = countBookings(db);
    var response = await worker.fetch(
      jsonRequest(
        "POST",
        "/api/owner/bookings/" + id + "/reschedule",
        { date: NEW_DATE, time: NEW_TIME },
        OWNER_TOKEN
      ),
      makeEnv(db)
    );
    assert.equal(response.status, 400, status + " 應拒絕");
    assert.equal(countBookings(db), before, status + " 不得新增 booking");
    assertOldUnchanged(db, id, status);
  }
});

test("無效 date／time、過去時間、相同時段拒絕", async function () {
  async function expect400(id, body) {
    var db = makeReadyDb({ id: id });
    var before = countBookings(db);
    var response = await worker.fetch(
      jsonRequest("POST", "/api/owner/bookings/" + id + "/reschedule", body, OWNER_TOKEN),
      makeEnv(db)
    );
    assert.equal(response.status, 400, id);
    assert.equal(countBookings(db), before);
    assertOldUnchanged(db, id, S.CONFIRMED);
  }

  await expect400("bad-date", { date: "2099-02-30", time: NEW_TIME });
  await expect400("bad-time", { date: NEW_DATE, time: "25:00" });
  await expect400("past", { date: "2020-01-15", time: "10:00" });
  await expect400("same", { date: "2099-08-01", time: "10:00" });
});

test("不套用 booking_min_notice_days：只要未來時段即可改期", async function () {
  var db = makeReadyDb({ id: "bk-notice" });
  db.prepare(
    "UPDATE tenant_settings SET setting_value = '30' " +
    "WHERE tenant_id = ? AND setting_key = 'booking_min_notice_days'"
  ).run(TENANT);

  // 執行當下 +3 天（台北），確保小於 tenant 30 天 notice、且不依賴固定曆日
  var nearDate = taipeiDateDaysFromNow(3);
  var nearTime = "15:00";
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(nearDate));

  var response = await worker.fetch(
    jsonRequest(
      "POST",
      "/api/owner/bookings/bk-notice/reschedule",
      { date: nearDate, time: nearTime },
      OWNER_TOKEN
    ),
    makeEnv(db)
  );
  assert.equal(response.status, 200);
  var body = await response.json();
  assert.equal(body.date, nearDate);
  assert.equal(body.time, nearTime);
  assert.equal(
    db.prepare("SELECT status FROM bookings WHERE id = ?").get("bk-notice").status,
    S.RESCHEDULED
  );
});

test("同 staff 重疊拒絕", async function () {
  var db = makeReadyDb({ id: "bk-overlap-src" });
  insertBooking(db, {
    id: "bk-overlap-other",
    customerId: "cust-b",
    startAt: NEW_START,
    endAt: "2099-08-15T07:00:00.000Z",
    bookingNo: "BK-OTHER"
  });
  insertItem(db, { id: "item-other", bookingId: "bk-overlap-other" });

  var before = countBookings(db);
  var response = await worker.fetch(
    jsonRequest(
      "POST",
      "/api/owner/bookings/bk-overlap-src/reschedule",
      { date: NEW_DATE, time: NEW_TIME },
      OWNER_TOKEN
    ),
    makeEnv(db)
  );
  assert.equal(response.status, 400);
  assert.equal(countBookings(db), before);
  assertOldUnchanged(db, "bk-overlap-src", S.CONFIRMED);
});

test("同 customer 同台北日衝突拒絕", async function () {
  var db = makeReadyDb({ id: "bk-day-src" });
  insertBooking(db, {
    id: "bk-day-other",
    staffId: STAFF_B,
    startAt: "2099-08-15T01:00:00.000Z",
    endAt: "2099-08-15T02:00:00.000Z",
    bookingNo: "BK-DAY"
  });
  insertItem(db, { id: "item-day", bookingId: "bk-day-other" });

  var before = countBookings(db);
  var response = await worker.fetch(
    jsonRequest(
      "POST",
      "/api/owner/bookings/bk-day-src/reschedule",
      { date: NEW_DATE, time: NEW_TIME },
      OWNER_TOKEN
    ),
    makeEnv(db)
  );
  assert.equal(response.status, 400);
  assert.equal(countBookings(db), before);
  assertOldUnchanged(db, "bk-day-src", S.CONFIRMED);
});

test("衝突檢查排除原 booking 自身：同日改時段成功", async function () {
  var db = makeReadyDb({ id: "bk-self" });
  var response = await worker.fetch(
    jsonRequest(
      "POST",
      "/api/owner/bookings/bk-self/reschedule",
      { date: "2099-08-01", time: "16:00" },
      OWNER_TOKEN
    ),
    makeEnv(db)
  );
  assert.equal(response.status, 200);
  var body = await response.json();
  assert.equal(body.date, "2099-08-01");
  assert.equal(body.time, "16:00");
  assert.equal(
    db.prepare("SELECT status FROM bookings WHERE id = ?").get("bk-self").status,
    S.RESCHEDULED
  );
  assert.equal(
    db.prepare("SELECT start_at FROM bookings WHERE id = ?").get(body.newBookingId).start_at,
    "2099-08-01T08:00:00.000Z"
  );
});

test("條件式寫入競態：UPDATE 失敗時只清本次資料，保留既有歷史 reschedule log", async function () {
  var db = makeReadyDb({ id: "bk-race" });
  var historicalLogId = "log-hist-owner-rescheduled";
  db.prepare(
    "INSERT INTO booking_status_logs " +
    "(id, tenant_id, booking_id, from_status, to_status, changed_by_type, " +
    "changed_by_id, reason_code, note, created_at) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    historicalLogId,
    TENANT,
    "bk-race",
    S.CONFIRMED,
    S.RESCHEDULED,
    "staff",
    STAFF,
    OWNER_RESCHEDULED_REASON_CODE,
    "既有歷史稽核，不得被補償刪除",
    "2025-01-01T00:00:00.000Z"
  );

  var env = makeEnv(db);
  var realBatch = env.DB.batch;
  env.DB.batch = async function (statements) {
    var patched = statements.map(function (s) {
      if (/UPDATE bookings SET status = 'rescheduled'/.test(s.sql)) {
        return { sql: s.sql + " AND 1 = 0", binds: s.binds };
      }
      return s;
    });
    return realBatch.call(env.DB, patched);
  };

  var beforeBookings = countBookings(db);
  await assert.rejects(
    rescheduleBookingByOwner(env, "bk-race", { date: NEW_DATE, time: NEW_TIME }),
    function (error) {
      assert.equal(error.status, 400);
      assert.match(error.message, /狀態已變更|無法改期/);
      return true;
    }
  );
  assert.equal(countBookings(db), beforeBookings);
  assert.equal(
    db.prepare("SELECT status FROM bookings WHERE id = ?").get("bk-race").status,
    S.CONFIRMED
  );
  assert.equal(
    db.prepare("SELECT COUNT(*) AS c FROM bookings WHERE parent_booking_id = ?")
      .get("bk-race").c,
    0
  );
  assert.equal(
    db.prepare(
      "SELECT COUNT(*) AS c FROM booking_status_logs WHERE booking_id = ? " +
      "AND id <> ?"
    ).get("bk-race", historicalLogId).c,
    0,
    "本次新寫入的 status log 必須清除"
  );

  var historical = db.prepare(
    "SELECT id, to_status, reason_code, note FROM booking_status_logs WHERE id = ?"
  ).get(historicalLogId);
  assert.ok(historical, "既有歷史 log 必須完整保留");
  assert.equal(historical.to_status, S.RESCHEDULED);
  assert.equal(historical.reason_code, OWNER_RESCHEDULED_REASON_CODE);
  assert.equal(historical.note, "既有歷史稽核，不得被補償刪除");
});

test("缺 staff_id：fail closed 400，零寫入，不改派 env.STAFF_ID", async function () {
  var db = makeReadyDb({ id: "bk-nostaff" });
  db.prepare("UPDATE bookings SET staff_id = NULL WHERE id = ?").run("bk-nostaff");
  var before = countBookings(db);
  var beforeLogs = db.prepare("SELECT COUNT(*) AS c FROM booking_status_logs").get().c;

  var response = await worker.fetch(
    jsonRequest(
      "POST",
      "/api/owner/bookings/bk-nostaff/reschedule",
      { date: NEW_DATE, time: NEW_TIME, staffId: STAFF_B },
      OWNER_TOKEN
    ),
    makeEnv(db)
  );
  assert.equal(response.status, 400);
  var body = await response.json();
  assert.equal(body.ok, false);
  assert.match(body.message, /服務人員/);
  assert.ok(!body.stack);
  assert.equal(countBookings(db), before);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS c FROM booking_status_logs").get().c,
    beforeLogs
  );
  assert.equal(
    db.prepare("SELECT status, staff_id FROM bookings WHERE id = ?").get("bk-nostaff").status,
    S.CONFIRMED
  );
  assert.equal(
    db.prepare("SELECT staff_id FROM bookings WHERE id = ?").get("bk-nostaff").staff_id,
    null
  );
});

test("JSON null／array／primitive body：400 零寫入，不回內部細節", async function () {
  var db = makeReadyDb({ id: "bk-body" });
  var env = makeEnv(db);
  var before = countBookings(db);
  var beforeLogs = db.prepare("SELECT COUNT(*) AS c FROM booking_status_logs").get().c;

  async function expectBadBody(rawBody, label) {
    var response = await worker.fetch(
      new Request(API + "/api/owner/bookings/bk-body/reschedule", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + OWNER_TOKEN
        },
        body: rawBody
      }),
      env
    );
    assert.equal(response.status, 400, label);
    var body = await response.json();
    assert.equal(body.ok, false, label);
    assert.equal(typeof body.message, "string", label);
    assert.ok(!body.stack, label);
    assert.ok(!/SELECT|INSERT|UPDATE|SQL/i.test(JSON.stringify(body)), label);
    assert.equal(countBookings(db), before, label);
    assert.equal(
      db.prepare("SELECT COUNT(*) AS c FROM booking_status_logs").get().c,
      beforeLogs,
      label
    );
    assertOldUnchanged(db, "bk-body", S.CONFIRMED);
  }

  await expectBadBody("null", "null");
  await expectBadBody("[]", "array");
  await expectBadBody("\"string\"", "string");
  await expectBadBody("123", "number");
  await expectBadBody("true", "boolean");

  var emptyObj = await worker.fetch(
    jsonRequest("POST", "/api/owner/bookings/bk-body/reschedule", {}, OWNER_TOKEN),
    env
  );
  assert.equal(emptyObj.status, 400);
  var emptyBody = await emptyObj.json();
  assert.match(emptyBody.message, /日期/);
  assert.equal(countBookings(db), before);
  assertOldUnchanged(db, "bk-body", S.CONFIRMED);
});

test("D1-like bind 必須保留 PreparedStatement this", async function () {
  var db = makeReadyDb({ id: "bk-bind" });
  var env = makeD1LikeEnvWithThisAwareBind(db);
  var result = await rescheduleBookingByOwner(env, "bk-bind", {
    date: NEW_DATE,
    time: NEW_TIME
  });
  assert.equal(result.ok, true);
  assert.equal(env._batchCalls.length, 1);
  assert.ok(env._batchCalls[0].length >= 6);
  var batchBinds = env._bindThisChecks.filter(function (c) {
    return c.receiverIsStatement && c.hasDbSession;
  });
  assert.ok(batchBinds.length >= 6, "batch 內所有 bind 須保留 receiver");
});

test("rescheduled 舊預約隱藏、新 confirmed 可見", async function () {
  var db = makeReadyDb({
    id: "bk-hide",
    startAt: "2099-08-01T02:00:00.000Z",
    endAt: "2099-08-01T03:00:00.000Z"
  });
  var env = makeEnv(db);
  var result = await rescheduleBookingByOwner(env, "bk-hide", {
    date: "2099-08-20",
    time: "11:00"
  });

  assert.ok(!CUSTOMER_VISIBLE_STATUS_SQL.includes("'rescheduled'"));
  assert.ok(CUSTOMER_VISIBLE_STATUSES.indexOf(S.RESCHEDULED) === -1);
  assert.ok(OWNER_VISIBLE_STATUSES.indexOf(S.RESCHEDULED) === -1);
  assert.ok(CUSTOMER_VISIBLE_STATUS_SQL.includes("'confirmed'"));

  var month = await getOwnerBookingsForMonth(env, "2099-08");
  var oldDay = month.days["2099-08-01"];
  var newDay = month.days["2099-08-20"];
  assert.ok(!oldDay || !oldDay.bookings.some(function (b) {
    return b.id === "bk-hide";
  }), "舊 rescheduled 不得出現在 Owner 月曆");
  assert.ok(newDay, "新 confirmed 應出現在 Owner 月曆");
  assert.ok(newDay.bookings.some(function (b) {
    return b.id === result.newBookingId;
  }));

  var userBookings = await getUserBookings(env, "U-customer-1");
  assert.ok(!userBookings.some(function (b) {
    return b.id === "bk-hide";
  }));
  assert.ok(userBookings.some(function (b) {
    return b.id === result.newBookingId;
  }));
});
