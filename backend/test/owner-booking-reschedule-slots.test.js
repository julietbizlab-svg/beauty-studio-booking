/**
 * Owner 改期可用時段 API（唯讀）測試
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import worker from "../src/index.js";
import { listOwnerRescheduleSlots } from "../src/d1-repository.js";
import * as dataRepository from "../src/data-repository.js";
import { BOOKING_STATUSES as S } from "../src/booking-state-machine.js";
import {
  buildSlotTimesWithStep,
  rangesOverlap,
  buildBusyIntervalClippedToDay,
  OWNER_RESCHEDULE_SLOT_STEP_MINUTES
} from "../src/slots.js";

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

var TENANT = "tenant-slots-001";
var OTHER_TENANT = "tenant-slots-other";
var LOCATION = "location-slots-001";
var STAFF = "staff-slots-001";
var API = "https://example.com";
var NOW = "2026-07-20T12:00:00.000Z";
var TARGET_DATE = "2099-08-03"; // 週一（weekday=1）
var OLD_START = "2099-08-01T02:00:00.000Z"; // 台北 10:00
var OLD_END = "2099-08-01T03:00:00.000Z";

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
  ).run(OTHER_TENANT, "to", "其他", NOW, NOW);
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
    "INSERT INTO customers (id, tenant_id, display_name, mobile, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?, ?)"
  ).run("cust-b", TENANT, "客戶乙", "0987654321", NOW, NOW);
  db.prepare(
    "INSERT INTO services (id, tenant_id, code, name, duration_minutes, price_amount, status, " +
    "sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run("svc-a", TENANT, "brow", "霧眉", 60, 3000, "active", 0, NOW, NOW);

  // 週一（weekday=1）10:00–12:00
  db.prepare(
    "INSERT INTO staff_schedules (id, tenant_id, location_id, staff_id, schedule_type, weekday, " +
    "start_time, end_time, is_available, is_active, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, 'weekly', 1, '10:00', '12:00', 1, 1, ?, ?)"
  ).run("sch-mon", TENANT, LOCATION, STAFF, NOW, NOW);
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
    o.startAt || OLD_START,
    o.endAt || OLD_END,
    o.status || S.CONFIRMED,
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
    TENANT,
    o.bookingId || "bk-1",
    o.serviceId || "svc-a",
    o.serviceName || "霧眉",
    o.durationMinutes != null ? o.durationMinutes : 60,
    o.quantity != null ? o.quantity : 1,
    3000,
    0,
    3000,
    o.sortOrder || 0,
    NOW
  );
}

function makeEnv(db, overrides) {
  var writeOps = [];
  return Object.assign({
    DATA_BACKEND: "d1",
    _writeOps: writeOps,
    DB: {
      prepare: function (sql) {
        return {
          bind: function () {
            var binds = Array.prototype.slice.call(arguments);
            return {
              sql: sql,
              binds: binds,
              all: async function () {
                if (/^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql)) writeOps.push(sql);
                var stmt = db.prepare(sql);
                return { results: stmt.all.apply(stmt, binds) };
              },
              first: async function () {
                if (/^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql)) writeOps.push(sql);
                var stmt = db.prepare(sql);
                return stmt.get.apply(stmt, binds) || null;
              },
              run: async function () {
                writeOps.push(sql);
                var stmt = db.prepare(sql);
                var info = stmt.run.apply(stmt, binds);
                return { meta: { changes: info.changes } };
              }
            };
          }
        };
      },
      batch: async function (statements) {
        writeOps.push("BATCH");
        throw new Error("reschedule-slots 不得呼叫 batch");
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
  var bookingOpts = opts || {};
  insertBooking(db, bookingOpts);
  if (!bookingOpts.skipItem) {
    insertItem(db, {
      id: "item-1",
      bookingId: bookingOpts.id || "bk-1",
      durationMinutes: bookingOpts.durationMinutes != null ? bookingOpts.durationMinutes : 60
    });
  }
  return db;
}

test("buildSlotTimesWithStep：60 分服務、30 分步進產生 10:00／10:30／11:00", function () {
  assert.equal(OWNER_RESCHEDULE_SLOT_STEP_MINUTES, 30);
  var slots = buildSlotTimesWithStep("10:00", "12:00", 60, 30);
  assert.deepEqual(slots, ["10:00", "10:30", "11:00"]);
  slots.forEach(function (slot) {
    assert.match(slot, /^([01]\d|2[0-3]):(00|30)$/);
  });
});

test("rangesOverlap：首尾相接不算衝突", function () {
  assert.equal(rangesOverlap(600, 660, 660, 720), false);
  assert.equal(rangesOverlap(600, 660, 630, 690), true);
});

test("buildBusyIntervalClippedToDay：跨日裁切、精度與 fail closed", function () {
  var dayStart = "2099-08-02T16:00:00.000Z"; // 台北 2099-08-03 00:00
  var dayEnd = "2099-08-03T16:00:00.000Z";   // 台北 2099-08-04 00:00

  // 前一天 23:30 → 所選日 00:30 → 裁切為當日 0–30
  assert.deepEqual(
    buildBusyIntervalClippedToDay(
      "2099-08-02T15:30:00.000Z",
      "2099-08-02T16:30:00.000Z",
      dayStart,
      dayEnd
    ),
    { start: 0, end: 30 }
  );

  // 所選日 23:30 → 隔日 00:30 → 裁切為 1410–1440
  assert.deepEqual(
    buildBusyIntervalClippedToDay(
      "2099-08-03T15:30:00.000Z",
      "2099-08-03T16:30:00.000Z",
      dayStart,
      dayEnd
    ),
    { start: 1410, end: 1440 }
  );

  // 整日涵蓋
  assert.deepEqual(
    buildBusyIntervalClippedToDay(
      "2099-08-02T10:00:00.000Z",
      "2099-08-04T10:00:00.000Z",
      dayStart,
      dayEnd
    ),
    { start: 0, end: 1440 }
  );

  // 首尾相接 dayStart：無重疊
  assert.equal(
    buildBusyIntervalClippedToDay(
      "2099-08-02T15:00:00.000Z",
      dayStart,
      dayStart,
      dayEnd
    ),
    null
  );

  // 含秒／毫秒：00:00:31–00:30:01 → floor/ceil 得 {0,31}，擋 00:30 候選
  assert.deepEqual(
    buildBusyIntervalClippedToDay(
      "2099-08-02T16:00:31.000Z",
      "2099-08-02T16:30:01.000Z",
      dayStart,
      dayEnd
    ),
    { start: 0, end: 31 }
  );
  assert.ok(
    rangesOverlap(30, 60, 0, 31),
    "00:30 開始的 30 分候選必須與 {0,31} 重疊"
  );

  // 精確整分 00:00–00:30 → {0,30}；00:30 首尾相接不重疊
  assert.deepEqual(
    buildBusyIntervalClippedToDay(
      "2099-08-02T16:00:00.000Z",
      "2099-08-02T16:30:00.000Z",
      dayStart,
      dayEnd
    ),
    { start: 0, end: 30 }
  );
  assert.equal(rangesOverlap(30, 60, 0, 30), false);

  // fail closed
  assert.equal(buildBusyIntervalClippedToDay("bad", "2099-08-03T01:00:00.000Z", dayStart, dayEnd), null);
  assert.equal(
    buildBusyIntervalClippedToDay(
      "2099-08-03T02:00:00.000Z",
      "2099-08-03T01:00:00.000Z",
      dayStart,
      dayEnd
    ),
    null
  );
  assert.equal(
    buildBusyIntervalClippedToDay(
      "2099-08-03T02:00:00.000Z",
      "2099-08-03T03:00:00.000Z",
      "bad-day",
      dayEnd
    ),
    null
  );
});

test("listOwnerRescheduleSlots：busy 列裁切失敗必須 fail closed 500", async function () {
  var db = makeReadyDb({ id: "bk-clip-fail" });
  var env = makeEnv(db);
  var originalPrepare = env.DB.prepare;
  env.DB.prepare = function (sql) {
    if (/SELECT id, start_at, end_at FROM bookings/.test(sql)) {
      return {
        bind: function () {
          return {
            all: async function () {
              // SQL 層已選出占用列，但時間無法解析 → 裁切 null → 必須 500
              return {
                results: [{
                  id: "bk-corrupt",
                  start_at: "not-a-date",
                  end_at: "also-not-a-date"
                }]
              };
            }
          };
        }
      };
    }
    return originalPrepare.call(env.DB, sql);
  };

  await assert.rejects(
    listOwnerRescheduleSlots(env, "bk-clip-fail", TARGET_DATE),
    function (error) {
      assert.equal(error.status, 500);
      assert.match(error.message, /無法計算預約占用時段/);
      assert.ok(!/SELECT|INSERT|UPDATE|SQL|start_at|not-a-date/i.test(error.message));
      return true;
    }
  );
});

test("跨日 busy：前一天跨入阻擋 00:00；當日跨出阻擋 23:30；00:30 首尾相接可選", async function () {
  var db = makeReadyDb({ id: "bk-midnight", durationMinutes: 30 });
  db.prepare("UPDATE booking_items SET duration_minutes = 30 WHERE booking_id = ?")
    .run("bk-midnight");
  // 週一凌晨與深夜營業，涵蓋午夜兩側候選
  db.prepare(
    "INSERT INTO staff_schedules (id, tenant_id, location_id, staff_id, schedule_type, weekday, " +
    "start_time, end_time, is_available, is_active, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, 'weekly', 1, '00:00', '01:00', 1, 1, ?, ?)"
  ).run("sch-dawn", TENANT, LOCATION, STAFF, NOW, NOW);
  db.prepare(
    "INSERT INTO staff_schedules (id, tenant_id, location_id, staff_id, schedule_type, weekday, " +
    "start_time, end_time, is_available, is_active, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, 'weekly', 1, '23:00', '24:00', 1, 1, ?, ?)"
  ).run("sch-late", TENANT, LOCATION, STAFF, NOW, NOW);

  // 前一天 23:30–所選日 00:30（台北）
  insertBooking(db, {
    id: "bk-prev-cross",
    customerId: "cust-b",
    startAt: "2099-08-02T15:30:00.000Z",
    endAt: "2099-08-02T16:30:00.000Z",
    bookingNo: "BK-PREV"
  });
  insertItem(db, { id: "item-prev", bookingId: "bk-prev-cross", durationMinutes: 60 });

  var dawn = await listOwnerRescheduleSlots(makeEnv(db), "bk-midnight", TARGET_DATE);
  assert.ok(!dawn.slots.includes("00:00"), "前一天跨入必須擋 00:00");
  assert.ok(dawn.slots.includes("00:30"), "與 busy 在 00:30 首尾相接應可選");

  db.prepare("DELETE FROM bookings WHERE id = ?").run("bk-prev-cross");

  // 所選日 23:30–隔日 00:30
  insertBooking(db, {
    id: "bk-next-cross",
    customerId: "cust-b",
    startAt: "2099-08-03T15:30:00.000Z",
    endAt: "2099-08-03T16:30:00.000Z",
    bookingNo: "BK-NEXT"
  });
  insertItem(db, { id: "item-next", bookingId: "bk-next-cross", durationMinutes: 60 });

  var late = await listOwnerRescheduleSlots(makeEnv(db), "bk-midnight", TARGET_DATE);
  assert.ok(!late.slots.includes("23:30"), "當日跨出必須擋 23:30");
  assert.ok(late.slots.includes("23:00"), "23:00 不與 23:30–24:00 重疊應可選");
});

test("成功：回傳 30 分 slots，不含內部欄位，零寫入", async function () {
  var db = makeReadyDb({ id: "bk-ok" });
  var env = makeEnv(db);
  var response = await worker.fetch(
    jsonRequest(
      "GET",
      "/api/owner/bookings/bk-ok/reschedule-slots?date=" + TARGET_DATE,
      undefined,
      OWNER_TOKEN
    ),
    env
  );
  assert.equal(response.status, 200);
  var body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.bookingId, "bk-ok");
  assert.equal(body.date, TARGET_DATE);
  assert.equal(body.durationMinutes, 60);
  assert.equal(body.stepMinutes, 30);
  assert.equal(body.bookable, true);
  assert.equal(body.reason, null);
  assert.deepEqual(body.slots, ["10:00", "10:30", "11:00"]);
  assert.ok(!Object.prototype.hasOwnProperty.call(body, "customerId"));
  assert.ok(!Object.prototype.hasOwnProperty.call(body, "staffId"));
  assert.ok(!Object.prototype.hasOwnProperty.call(body, "tenantId"));
  assert.equal(env._writeOps.length, 0);
});

test("無 token 401、非 Owner 403", async function () {
  var db = makeReadyDb({ id: "bk-auth" });
  var env = makeEnv(db);
  var noToken = await worker.fetch(
    jsonRequest("GET", "/api/owner/bookings/bk-auth/reschedule-slots?date=" + TARGET_DATE),
    env
  );
  assert.equal(noToken.status, 401);
  var stranger = await worker.fetch(
    jsonRequest(
      "GET",
      "/api/owner/bookings/bk-auth/reschedule-slots?date=" + TARGET_DATE,
      undefined,
      STRANGER_TOKEN
    ),
    env
  );
  assert.equal(stranger.status, 403);
});

test("Notion 501", async function () {
  var response = await worker.fetch(
    jsonRequest(
      "GET",
      "/api/owner/bookings/bk-1/reschedule-slots?date=" + TARGET_DATE,
      undefined,
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
      dataRepository.listOwnerRescheduleSlots(
        { DATA_BACKEND: "notion", NOTION_TOKEN: "x" },
        "bk-1",
        TARGET_DATE
      );
    },
    function (error) {
      assert.equal(error.status, 501);
      return true;
    }
  );
});

test("找不到 404；非 confirmed 400；無效日期 400", async function () {
  var db = makeReadyDb({ id: "bk-stat" });
  var missing = await worker.fetch(
    jsonRequest(
      "GET",
      "/api/owner/bookings/missing/reschedule-slots?date=" + TARGET_DATE,
      undefined,
      OWNER_TOKEN
    ),
    makeEnv(db)
  );
  assert.equal(missing.status, 404);

  db.prepare("UPDATE bookings SET status = ? WHERE id = ?").run(S.CHECKED_IN, "bk-stat");
  var badStatus = await worker.fetch(
    jsonRequest(
      "GET",
      "/api/owner/bookings/bk-stat/reschedule-slots?date=" + TARGET_DATE,
      undefined,
      OWNER_TOKEN
    ),
    makeEnv(db)
  );
  assert.equal(badStatus.status, 400);

  var badDate = await worker.fetch(
    jsonRequest(
      "GET",
      "/api/owner/bookings/bk-stat/reschedule-slots?date=2099-02-30",
      undefined,
      OWNER_TOKEN
    ),
    makeEnv(db)
  );
  assert.equal(badDate.status, 400);
});

test("缺 staff／items fail closed", async function () {
  var db = makeReadyDb({ id: "bk-nostaff" });
  db.prepare("UPDATE bookings SET staff_id = NULL WHERE id = ?").run("bk-nostaff");
  await assert.rejects(
    listOwnerRescheduleSlots(makeEnv(db), "bk-nostaff", TARGET_DATE),
    function (error) {
      assert.equal(error.status, 400);
      assert.match(error.message, /服務人員/);
      return true;
    }
  );

  var db2 = makeReadyDb({ id: "bk-noitem", skipItem: true });
  await assert.rejects(
    listOwnerRescheduleSlots(makeEnv(db2), "bk-noitem", TARGET_DATE),
    function (error) {
      assert.equal(error.status, 400);
      assert.match(error.message, /服務項目/);
      return true;
    }
  );
});

test("staff overlap 排除；首尾相接保留；排除原 booking 自身", async function () {
  var db = makeReadyDb({ id: "bk-self" });
  // 原 booking 在週日；查週一。再加週一 10:00–11:00 的其他預約
  insertBooking(db, {
    id: "bk-busy",
    customerId: "cust-b",
    startAt: "2099-08-03T02:00:00.000Z",
    endAt: "2099-08-03T03:00:00.000Z",
    bookingNo: "BK-BUSY"
  });
  insertItem(db, { id: "item-busy", bookingId: "bk-busy" });

  var body = await listOwnerRescheduleSlots(makeEnv(db), "bk-self", TARGET_DATE);
  assert.ok(!body.slots.includes("10:00"));
  assert.ok(!body.slots.includes("10:30"));
  assert.ok(body.slots.includes("11:00"), "11:00 與 10:00–11:00 首尾相接應可選");

  // 同日改期：原 booking 若在查詢日，不得擋自身
  db.prepare(
    "UPDATE bookings SET start_at = ?, end_at = ? WHERE id = ?"
  ).run("2099-08-03T02:00:00.000Z", "2099-08-03T03:00:00.000Z", "bk-self");
  db.prepare("DELETE FROM bookings WHERE id = ?").run("bk-busy");
  var selfBody = await listOwnerRescheduleSlots(makeEnv(db), "bk-self", TARGET_DATE);
  assert.ok(selfBody.slots.includes("10:00"), "必須排除原 booking 自身占用");
  assert.ok(selfBody.slots.includes("10:30"));
  assert.ok(selfBody.slots.includes("11:00"));
});

test("cancelled／completed／no_show／rescheduled 不阻擋", async function () {
  var db = makeReadyDb({ id: "bk-src" });
  var blockers = [
    { id: "bk-c", status: S.CANCELLED_BY_STORE, extra: true },
    { id: "bk-d", status: S.COMPLETED, extra: true },
    { id: "bk-n", status: S.NO_SHOW },
    { id: "bk-r", status: S.RESCHEDULED }
  ];
  blockers.forEach(function (b, i) {
    insertBooking(db, {
      id: b.id,
      customerId: "cust-b",
      startAt: "2099-08-03T02:00:00.000Z",
      endAt: "2099-08-03T03:00:00.000Z",
      bookingNo: "BK-" + i,
      status: S.CONFIRMED
    });
    if (b.status === S.COMPLETED) {
      db.prepare(
        "UPDATE bookings SET status = 'completed', completed_at = ? WHERE id = ?"
      ).run(NOW, b.id);
    } else if (b.status === S.CANCELLED_BY_STORE) {
      db.prepare(
        "UPDATE bookings SET status = ?, cancelled_at = ?, " +
        "cancellation_reason_code = ?, cancellation_note = ? WHERE id = ?"
      ).run(b.status, NOW, "store", "店休", b.id);
    } else {
      db.prepare("UPDATE bookings SET status = ? WHERE id = ?").run(b.status, b.id);
    }
    insertItem(db, { id: "item-" + b.id, bookingId: b.id });
  });

  var body = await listOwnerRescheduleSlots(makeEnv(db), "bk-src", TARGET_DATE);
  assert.deepEqual(body.slots, ["10:00", "10:30", "11:00"]);
});

test("跨越營業結束的候選被排除；closed／past reason", async function () {
  var db = makeReadyDb({ id: "bk-dur", durationMinutes: 90 });
  db.prepare("UPDATE booking_items SET duration_minutes = 90 WHERE booking_id = ?")
    .run("bk-dur");
  var body = await listOwnerRescheduleSlots(makeEnv(db), "bk-dur", TARGET_DATE);
  // 10:00–12:00、90 分 → 僅 10:00、10:30（11:00+90 > 12:00）
  assert.deepEqual(body.slots, ["10:00", "10:30"]);

  var closed = await listOwnerRescheduleSlots(makeEnv(db), "bk-dur", "2099-08-04"); // 週二無排班
  assert.equal(closed.bookable, false);
  assert.equal(closed.reason, "closed");
  assert.deepEqual(closed.slots, []);

  var past = await listOwnerRescheduleSlots(makeEnv(db), "bk-dur", "2020-01-15");
  assert.equal(past.bookable, false);
  assert.equal(past.reason, "past");
});

test("tenant 隔離；缺 STAFF_ID 500", async function () {
  var db = makeReadyDb({ id: "bk-ten" });
  var isolated = await worker.fetch(
    jsonRequest(
      "GET",
      "/api/owner/bookings/bk-ten/reschedule-slots?date=" + TARGET_DATE,
      undefined,
      OWNER_TOKEN
    ),
    makeEnv(db, { TENANT_ID: OTHER_TENANT })
  );
  assert.equal(isolated.status, 404);

  await assert.rejects(
    listOwnerRescheduleSlots(makeEnv(db, { STAFF_ID: "" }), "bk-ten", TARGET_DATE),
    function (error) {
      assert.equal(error.status, 500);
      assert.match(error.message, /STAFF_ID/);
      return true;
    }
  );
});
