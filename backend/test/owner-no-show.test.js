/**
 * Owner 標記未到（confirmed → no_show）整合測試
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import worker from "../src/index.js";
import {
  getOwnerBookingsForMonth,
  getUserBookings,
  applyOwnerGeneralBookingStatusTransition
} from "../src/d1-repository.js";
import {
  BOOKING_STATUSES as S,
  OWNER_NO_SHOW_REASON_CODE,
  CUSTOMER_VISIBLE_STATUS_SQL,
  getStatusLabelZh,
  bookingStatusToLegacyApiLabel as legacyLabel
} from "../src/booking-state-machine.js";

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

var TENANT = "tenant-noshow-001";
var OTHER_TENANT = "tenant-noshow-other";
var LOCATION = "location-noshow-001";
var STAFF = "staff-noshow-001";
var API = "https://example.com";
var NOW = "2026-07-20T12:00:00.000Z";
var PAST_START = "2020-01-15T02:00:00.000Z";
var PAST_END = "2020-01-15T03:00:00.000Z";
var FUTURE_START = "2099-08-01T02:00:00.000Z";
var FUTURE_END = "2099-08-01T03:00:00.000Z";

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

function insertBooking(db, opts) {
  var o = opts || {};
  db.prepare(
    "INSERT INTO bookings (id, tenant_id, location_id, customer_id, staff_id, booking_no, " +
    "start_at, end_at, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    o.id || "bk-1",
    o.tenantId || TENANT,
    o.locationId || LOCATION,
    o.customerId || "cust-a",
    o.staffId || STAFF,
    o.bookingNo || (o.id || "bk-1"),
    o.startAt || PAST_START,
    o.endAt || PAST_END,
    o.status || S.CONFIRMED,
    NOW,
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
  insertBooking(db, opts);
  return db;
}

function assertZeroWrites(db, bookingId, expectedStatus) {
  assert.equal(
    db.prepare("SELECT status FROM bookings WHERE id = ?").get(bookingId).status,
    expectedStatus
  );
  assert.equal(
    db.prepare("SELECT COUNT(*) AS c FROM booking_status_logs WHERE booking_id = ?")
      .get(bookingId).c,
    0
  );
}

test("confirmed 且 start_at 已到：成功轉 no_show，log 欄位正確", async function () {
  var db = makeReadyDb({ id: "bk-ok", status: S.CONFIRMED, startAt: PAST_START });
  var env = makeEnv(db);
  var response = await worker.fetch(
    jsonRequest(
      "PATCH",
      "/api/owner/bookings/bk-ok/status",
      {
        toStatus: S.NO_SHOW,
        reasonCode: "forged_reason",
        actorType: "customer",
        actorId: "attacker",
        now: "2099-01-01T00:00:00.000Z"
      },
      OWNER_TOKEN
    ),
    env
  );
  assert.equal(response.status, 200);
  var body = await response.json();
  assert.equal(body.toStatus, S.NO_SHOW);
  assert.equal(body.fromStatus, S.CONFIRMED);

  var row = db.prepare("SELECT status FROM bookings WHERE id = ?").get("bk-ok");
  assert.equal(row.status, S.NO_SHOW);

  var log = db.prepare(
    "SELECT from_status, to_status, changed_by_type, changed_by_id, reason_code, note " +
    "FROM booking_status_logs WHERE booking_id = ?"
  ).get("bk-ok");
  assert.equal(log.from_status, S.CONFIRMED);
  assert.equal(log.to_status, S.NO_SHOW);
  assert.equal(log.changed_by_type, "staff");
  assert.equal(log.changed_by_id, STAFF);
  assert.equal(log.reason_code, OWNER_NO_SHOW_REASON_CODE);
  assert.equal(log.note, "");
});

test("applyOwnerGeneralBookingStatusTransition：偽造 actorId 無效，log 仍用 STAFF_ID", async function () {
  var db = makeReadyDb({ id: "bk-actor", status: S.CONFIRMED, startAt: PAST_START });
  var env = makeEnv(db);
  await applyOwnerGeneralBookingStatusTransition(env, {
    bookingId: "bk-actor",
    toStatus: S.NO_SHOW,
    actorId: "forged-staff-id",
    reasonCode: "forged_reason"
  });
  var log = db.prepare(
    "SELECT changed_by_type, changed_by_id, reason_code FROM booking_status_logs WHERE booking_id = ?"
  ).get("bk-actor");
  assert.equal(log.changed_by_type, "staff");
  assert.equal(log.changed_by_id, STAFF);
  assert.notEqual(log.changed_by_id, "forged-staff-id");
  assert.equal(log.reason_code, OWNER_NO_SHOW_REASON_CODE);
});

test("applyOwnerGeneralBookingStatusTransition：缺 STAFF_ID 回 500", async function () {
  var db = makeReadyDb({ id: "bk-nostaff", status: S.CONFIRMED, startAt: PAST_START });
  var env = makeEnv(db, { STAFF_ID: "" });
  await assert.rejects(
    applyOwnerGeneralBookingStatusTransition(env, {
      bookingId: "bk-nostaff",
      toStatus: S.NO_SHOW
    }),
    function (error) {
      assert.equal(error.status, 500);
      assert.match(error.message, /STAFF_ID/);
      return true;
    }
  );
  assertZeroWrites(db, "bk-nostaff", S.CONFIRMED);
});

test("confirmed 且 start_at 未到：400 零寫入", async function () {
  var db = makeReadyDb({
    id: "bk-future",
    status: S.CONFIRMED,
    startAt: FUTURE_START,
    endAt: FUTURE_END
  });
  var response = await worker.fetch(
    jsonRequest(
      "PATCH",
      "/api/owner/bookings/bk-future/status",
      { toStatus: S.NO_SHOW },
      OWNER_TOKEN
    ),
    makeEnv(db)
  );
  assert.equal(response.status, 400);
  assertZeroWrites(db, "bk-future", S.CONFIRMED);
});

test("checked_in／completed／cancelled／no_show／未知狀態拒絕零寫入", async function () {
  async function expectReject(spec) {
    var db = makeReadyDb({ id: spec.id, status: S.CONFIRMED, startAt: PAST_START });
    if (spec.status === S.COMPLETED) {
      db.prepare(
        "UPDATE bookings SET status = 'completed', completed_at = ? WHERE id = ?"
      ).run(NOW, spec.id);
    } else if (spec.status === S.CANCELLED_BY_CUSTOMER) {
      db.prepare(
        "UPDATE bookings SET status = 'cancelled_by_customer', cancelled_at = ?, " +
        "cancellation_reason_code = ?, cancellation_note = ? WHERE id = ?"
      ).run(NOW, "customer_cancelled", "客人自行取消", spec.id);
    } else {
      db.prepare("UPDATE bookings SET status = ? WHERE id = ?").run(spec.status, spec.id);
    }
    var response = await worker.fetch(
      jsonRequest(
        "PATCH",
        "/api/owner/bookings/" + spec.id + "/status",
        { toStatus: S.NO_SHOW },
        OWNER_TOKEN
      ),
      makeEnv(db)
    );
    assert.equal(response.status, 400, spec.id + " 應拒絕");
    assertZeroWrites(db, spec.id, spec.status);
  }

  await expectReject({ id: "rej-ci", status: S.CHECKED_IN });
  await expectReject({ id: "rej-done", status: S.COMPLETED });
  await expectReject({ id: "rej-cancel", status: S.CANCELLED_BY_CUSTOMER });
  await expectReject({ id: "rej-ns", status: S.NO_SHOW });

  var dbUnknown = makeReadyDb({ id: "rej-unk", status: S.CONFIRMED, startAt: PAST_START });
  var unkRes = await worker.fetch(
    jsonRequest(
      "PATCH",
      "/api/owner/bookings/rej-unk/status",
      { toStatus: "totally_invalid" },
      OWNER_TOKEN
    ),
    makeEnv(dbUnknown)
  );
  assert.equal(unkRes.status, 400);
  assertZeroWrites(dbUnknown, "rej-unk", S.CONFIRMED);
});

test("no_show：無 token 401、非 Owner 403", async function () {
  var db = makeReadyDb({ id: "bk-auth", status: S.CONFIRMED, startAt: PAST_START });
  var env = makeEnv(db);
  var noToken = await worker.fetch(
    jsonRequest("PATCH", "/api/owner/bookings/bk-auth/status", { toStatus: S.NO_SHOW }),
    env
  );
  assert.equal(noToken.status, 401);

  var stranger = await worker.fetch(
    jsonRequest(
      "PATCH",
      "/api/owner/bookings/bk-auth/status",
      { toStatus: S.NO_SHOW },
      STRANGER_TOKEN
    ),
    env
  );
  assert.equal(stranger.status, 403);
  assertZeroWrites(db, "bk-auth", S.CONFIRMED);
});

test("no_show：tenant 隔離，其他租戶預約回 404 零寫入", async function () {
  var db = makeReadyDb({ id: "bk-home", status: S.CONFIRMED, startAt: PAST_START });
  // 其他租戶需要 location/customer — 簡化：同 DB 但 booking 用 OTHER_TENANT 會 FK fail
  // 改測：env.TENANT_ID 不同 → 找不到
  var response = await worker.fetch(
    jsonRequest(
      "PATCH",
      "/api/owner/bookings/bk-home/status",
      { toStatus: S.NO_SHOW },
      OWNER_TOKEN
    ),
    makeEnv(db, { TENANT_ID: OTHER_TENANT })
  );
  assert.equal(response.status, 404);
  assertZeroWrites(db, "bk-home", S.CONFIRMED);
});

test("no_show：競態失敗不留下 status log", async function () {
  var db = makeReadyDb({ id: "bk-race", status: S.CONFIRMED, startAt: PAST_START });
  db.prepare("UPDATE bookings SET status = ? WHERE id = ?").run(S.CHECKED_IN, "bk-race");
  var response = await worker.fetch(
    jsonRequest(
      "PATCH",
      "/api/owner/bookings/bk-race/status",
      { toStatus: S.NO_SHOW },
      OWNER_TOKEN
    ),
    makeEnv(db)
  );
  assert.equal(response.status, 400);
  assertZeroWrites(db, "bk-race", S.CHECKED_IN);
});

test("DTO／label：no_show 對外顯示未到", function () {
  assert.equal(legacyLabel(S.NO_SHOW), "未到");
  assert.equal(getStatusLabelZh(S.NO_SHOW), "未到");
  assert.ok(CUSTOMER_VISIBLE_STATUS_SQL.includes("'no_show'"));
  assert.ok(!CUSTOMER_VISIBLE_STATUS_SQL.includes("'rescheduled'"));
});

test("Owner 月曆查詢保留 no_show；客戶列表可見未到", async function () {
  var db = makeReadyDb({
    id: "bk-visible",
    status: S.NO_SHOW,
    startAt: "2026-07-20T02:00:00.000Z",
    endAt: "2026-07-20T03:00:00.000Z"
  });
  var env = makeEnv(db);

  var month = await getOwnerBookingsForMonth(env, "2026-07");
  var day = month.days["2026-07-20"];
  assert.ok(day, "Owner 月曆應含 no_show 當日");
  assert.equal(day.bookings[0].internalStatus, S.NO_SHOW);
  assert.equal(day.bookings[0].status, "未到");

  var customerList = await getUserBookings(env, "U-customer-1");
  assert.equal(customerList.length, 1);
  assert.equal(customerList[0].status, "未到");
  assert.equal(customerList[0].internalStatus, S.NO_SHOW);
  assert.equal(customerList[0].statusLabel, "未到");
  assert.equal(customerList[0].canCancel, false);
});

test("Wrangler 精確固定為 3.114.17", function () {
  var pkg = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8"));
  var lock = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "package-lock.json"), "utf8"));
  assert.equal(pkg.devDependencies.wrangler, "3.114.17");
  assert.equal(lock.packages[""].devDependencies.wrangler, "3.114.17");
  assert.equal(lock.packages["node_modules/wrangler"].version, "3.114.17");
});
