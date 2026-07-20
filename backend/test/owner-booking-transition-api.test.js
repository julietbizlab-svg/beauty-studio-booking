/**
 * PATCH /api/owner/bookings/:bookingId/status 整合測試
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import worker from "../src/index.js";
import * as dataRepository from "../src/data-repository.js";
import { BOOKING_STATUSES as S } from "../src/booking-state-machine.js";

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

var TENANT = "tenant-transition-001";
var LOCATION = "location-transition-001";
var STAFF = "staff-transition-001";
var API = "https://example.com";
var NOW = "2026-07-20T00:00:00.000Z";
var FUTURE_START = "2026-08-01T02:00:00.000Z";
var FUTURE_END = "2026-08-01T03:00:00.000Z";

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
  ).run(TENANT, "ta", "租戶", NOW, NOW);
  db.prepare(
    "INSERT INTO locations (id, tenant_id, code, name, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?, ?)"
  ).run(LOCATION, TENANT, "loc", "店面", NOW, NOW);
  db.prepare(
    "INSERT INTO staff (id, tenant_id, code, display_name, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?, ?)"
  ).run(STAFF, TENANT, "staff", "老師", NOW, NOW);
  db.prepare(
    "INSERT INTO customers (id, tenant_id, display_name, mobile, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?, ?)"
  ).run("cust-a", TENANT, "客戶甲", "0912345678", NOW, NOW);
  db.prepare(
    "INSERT INTO line_accounts (id, tenant_id, customer_id, line_user_id, linked_at) " +
    "VALUES (?, ?, ?, ?, ?)"
  ).run("la-a", TENANT, "cust-a", "U-customer-1", NOW);
  db.prepare(
    "INSERT INTO services (id, tenant_id, code, name, duration_minutes, price_amount, status, " +
    "sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run("svc-a", TENANT, "brow", "霧眉", 60, 3000, "active", 0, NOW, NOW);
}

function insertBooking(db, id, status, bookingNo) {
  db.prepare(
    "INSERT INTO bookings (id, tenant_id, location_id, customer_id, staff_id, booking_no, " +
    "start_at, end_at, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    id, TENANT, LOCATION, "cust-a", STAFF, bookingNo || id,
    FUTURE_START, FUTURE_END, status, NOW, NOW
  );
}

function makeEnv(db) {
  return {
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
  };
}

function makeNotionEnv() {
  return {
    DATA_BACKEND: "notion",
    NOTION_TOKEN: "notion-secret",
    NOTION_DATABASE_SERVICES: "db-services",
    NOTION_DATABASE_SLOTS: "db-slots",
    NOTION_DATABASE_BOOKINGS: "db-bookings",
    NOTION_DATABASE_SETTINGS: "db-settings",
    LIFF_CHANNEL_ID: "liff-channel-test",
    OWNER_LINE_USER_IDS: "U-owner-1",
    STAFF_ID: STAFF
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

function makeReadyDb(status, bookingId) {
  var db = new DatabaseSync(":memory:");
  applyMigrations(db);
  seedBase(db);
  insertBooking(db, bookingId || "bk-1", status || S.CONFIRMED, "BK-001");
  return db;
}

test("PATCH status：無 token 401", async function () {
  var response = await worker.fetch(
    jsonRequest("PATCH", "/api/owner/bookings/bk-1/status", { toStatus: S.CHECKED_IN }),
    makeEnv(makeReadyDb())
  );
  assert.equal(response.status, 401);
});

test("PATCH status：非 owner 403", async function () {
  var response = await worker.fetch(
    jsonRequest(
      "PATCH",
      "/api/owner/bookings/bk-1/status",
      { toStatus: S.CHECKED_IN },
      STRANGER_TOKEN
    ),
    makeEnv(makeReadyDb())
  );
  assert.equal(response.status, 403);
});

test("PATCH status：Notion 501", async function () {
  var response = await worker.fetch(
    jsonRequest(
      "PATCH",
      "/api/owner/bookings/bk-1/status",
      { toStatus: S.CHECKED_IN },
      OWNER_TOKEN
    ),
    makeNotionEnv()
  );
  assert.equal(response.status, 501);
  var body = await response.json();
  assert.match(body.message, /不支援/);
});

test("PATCH status：未知 toStatus 400", async function () {
  var response = await worker.fetch(
    jsonRequest(
      "PATCH",
      "/api/owner/bookings/bk-1/status",
      { toStatus: "totally_invalid" },
      OWNER_TOKEN
    ),
    makeEnv(makeReadyDb())
  );
  assert.equal(response.status, 400);
  var body = await response.json();
  assert.match(body.message, /未知/);
});

function assertBookingUnchanged(db, bookingId, expectedStatus) {
  assert.equal(
    db.prepare("SELECT status FROM bookings WHERE id = ?").get(bookingId).status,
    expectedStatus
  );
  assert.equal(
    db.prepare("SELECT COUNT(*) AS c FROM booking_status_logs WHERE booking_id = ?").get(bookingId).c,
    0
  );
}

test("PATCH status：confirmed→completed／rescheduled／no_show 回 400 且 DB 零變更", async function () {
  var blockedTargets = [S.COMPLETED, S.RESCHEDULED, S.NO_SHOW];
  for (var i = 0; i < blockedTargets.length; i++) {
    var toStatus = blockedTargets[i];
    var db = makeReadyDb(S.CONFIRMED, "bk-block-" + i);
    var env = makeEnv(db);
    var response = await worker.fetch(
      jsonRequest(
        "PATCH",
        "/api/owner/bookings/bk-block-" + i + "/status",
        { toStatus: toStatus },
        OWNER_TOKEN
      ),
      env
    );
    assert.equal(response.status, 400, toStatus + " 應回 400");
    assertBookingUnchanged(db, "bk-block-" + i, S.CONFIRMED);
  }
});

test("PATCH status：checked_in→completed 成功", async function () {
  var db = makeReadyDb(S.CHECKED_IN, "bk-complete");
  var env = makeEnv(db);
  var response = await worker.fetch(
    jsonRequest(
      "PATCH",
      "/api/owner/bookings/bk-complete/status",
      { toStatus: S.COMPLETED },
      OWNER_TOKEN
    ),
    env
  );
  assert.equal(response.status, 200);
  assert.equal(
    db.prepare("SELECT status FROM bookings WHERE id = ?").get("bk-complete").status,
    S.COMPLETED
  );
  assert.equal(
    db.prepare("SELECT COUNT(*) AS c FROM booking_status_logs WHERE booking_id = ?").get("bk-complete").c,
    1
  );
});

test("PATCH status：pending→confirmed 與 pending→checked_in 成功", async function () {
  var db1 = makeReadyDb(S.PENDING, "bk-pending-confirmed");
  var env1 = makeEnv(db1);
  var response1 = await worker.fetch(
    jsonRequest(
      "PATCH",
      "/api/owner/bookings/bk-pending-confirmed/status",
      { toStatus: S.CONFIRMED },
      OWNER_TOKEN
    ),
    env1
  );
  assert.equal(response1.status, 200);
  assert.equal(
    db1.prepare("SELECT status FROM bookings WHERE id = ?").get("bk-pending-confirmed").status,
    S.CONFIRMED
  );

  var db2 = makeReadyDb(S.PENDING, "bk-pending-checkin");
  var env2 = makeEnv(db2);
  var response2 = await worker.fetch(
    jsonRequest(
      "PATCH",
      "/api/owner/bookings/bk-pending-checkin/status",
      { toStatus: S.CHECKED_IN },
      OWNER_TOKEN
    ),
    env2
  );
  assert.equal(response2.status, 200);
  assert.equal(
    db2.prepare("SELECT status FROM bookings WHERE id = ?").get("bk-pending-checkin").status,
    S.CHECKED_IN
  );
});

test("PATCH status：取消目標狀態 400，引導使用取消流程", async function () {
  var response = await worker.fetch(
    jsonRequest(
      "PATCH",
      "/api/owner/bookings/bk-1/status",
      { toStatus: S.CANCELLED_BY_STORE },
      OWNER_TOKEN
    ),
    makeEnv(makeReadyDb())
  );
  assert.equal(response.status, 400);
  var body = await response.json();
  assert.match(body.message, /取消預約/);
});

test("PATCH status：偽造 actor 欄位無效，仍使用 STAFF_ID", async function () {
  var db = makeReadyDb(S.CONFIRMED, "bk-forge");
  var env = makeEnv(db);
  var response = await worker.fetch(
    jsonRequest(
      "PATCH",
      "/api/owner/bookings/bk-forge/status",
      {
        toStatus: S.CHECKED_IN,
        actorType: "customer",
        actorId: "attacker",
        tenantId: "other-tenant",
        fromStatus: S.COMPLETED,
        userId: "U-attacker"
      },
      OWNER_TOKEN
    ),
    env
  );
  assert.equal(response.status, 200);
  var log = db.prepare(
    "SELECT changed_by_type, changed_by_id, to_status FROM booking_status_logs WHERE booking_id = ?"
  ).get("bk-forge");
  assert.equal(log.changed_by_type, "staff");
  assert.equal(log.changed_by_id, STAFF);
  assert.equal(log.to_status, S.CHECKED_IN);
});

test("PATCH status：合法 confirmed→checked_in 成功且只寫入一次 batch", async function () {
  var db = makeReadyDb(S.CONFIRMED, "bk-ok");
  var env = makeEnv(db);
  var response = await worker.fetch(
    jsonRequest(
      "PATCH",
      "/api/owner/bookings/bk-ok/status",
      { toStatus: S.CHECKED_IN },
      OWNER_TOKEN
    ),
    env
  );
  assert.equal(response.status, 200);
  var body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.fromStatus, S.CONFIRMED);
  assert.equal(body.toStatus, S.CHECKED_IN);
  assert.equal(
    db.prepare("SELECT status FROM bookings WHERE id = ?").get("bk-ok").status,
    S.CHECKED_IN
  );
  assert.equal(
    db.prepare("SELECT COUNT(*) AS c FROM booking_status_logs WHERE booking_id = ?").get("bk-ok").c,
    1
  );
});

test("PATCH status：非法 transition 零 DB 寫入", async function () {
  var db = makeReadyDb(S.CONFIRMED, "bk-bad");
  var env = makeEnv(db);
  var response = await worker.fetch(
    jsonRequest(
      "PATCH",
      "/api/owner/bookings/bk-bad/status",
      { toStatus: S.DRAFT },
      OWNER_TOKEN
    ),
    env
  );
  assert.equal(response.status, 400);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS c FROM booking_status_logs WHERE booking_id = ?").get("bk-bad").c,
    0
  );
  assert.equal(
    db.prepare("SELECT status FROM bookings WHERE id = ?").get("bk-bad").status,
    S.CONFIRMED
  );
});

test("PATCH status：同狀態 400 且不寫 log", async function () {
  var db = makeReadyDb(S.CHECKED_IN, "bk-same");
  var env = makeEnv(db);
  var response = await worker.fetch(
    jsonRequest(
      "PATCH",
      "/api/owner/bookings/bk-same/status",
      { toStatus: S.CHECKED_IN },
      OWNER_TOKEN
    ),
    env
  );
  assert.equal(response.status, 400);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS c FROM booking_status_logs WHERE booking_id = ?").get("bk-same").c,
    0
  );
});

test("PATCH status：競態失敗不留下 log", async function () {
  var db = makeReadyDb(S.CONFIRMED, "bk-race");
  var env = makeEnv(db);
  db.prepare("UPDATE bookings SET status = ? WHERE id = ?").run(S.CHECKED_IN, "bk-race");
  var response = await worker.fetch(
    jsonRequest(
      "PATCH",
      "/api/owner/bookings/bk-race/status",
      { toStatus: S.CHECKED_IN },
      OWNER_TOKEN
    ),
    env
  );
  assert.equal(response.status, 400);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS c FROM booking_status_logs WHERE booking_id = ?").get("bk-race").c,
    0
  );
});

test("applyOwnerGeneralBookingStatusTransition wrapper：notion 501", function () {
  assert.throws(
    function () {
      dataRepository.applyOwnerGeneralBookingStatusTransition(makeNotionEnv(), {
        bookingId: "bk-1",
        toStatus: S.CHECKED_IN,
        actorId: STAFF
      });
    },
    function (error) {
      assert.equal(error.status, 501);
      assert.match(error.message, /不支援/);
      return true;
    }
  );
});

test("data-repository：applyBookingStatusTransition notion 501", function () {
  assert.throws(
    function () {
      dataRepository.applyBookingStatusTransition(makeNotionEnv(), {
        bookingId: "bk-1",
        toStatus: S.COMPLETED,
        actor: "staff",
        actorId: STAFF
      });
    },
    function (error) {
      assert.equal(error.status, 501);
      assert.match(error.message, /不支援/);
      return true;
    }
  );
});

test("data-repository：applyBookingStatusTransition d1 dispatch", async function () {
  var db = makeReadyDb(S.CHECKED_IN, "bk-dispatch");
  var result = await dataRepository.applyBookingStatusTransition(makeEnv(db), {
    bookingId: "bk-dispatch",
    toStatus: S.COMPLETED,
    actor: "staff",
    actorId: STAFF
  });
  assert.equal(result.toStatus, S.COMPLETED);
  assert.equal(
    db.prepare("SELECT status FROM bookings WHERE id = ?").get("bk-dispatch").status,
    S.COMPLETED
  );
});
