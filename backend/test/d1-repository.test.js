/**
 * d1-repository.js 單元測試（node:test ＋ assert，零依賴）
 *
 * 使用最小 Fake D1：記錄每次 prepare 的 SQL 與 bind 值，由各測試自訂
 * 回傳資料。不連 Cloudflare、不執行 migration、不讀任何 SQL 草稿。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ensureD1Env,
  listServices,
  getServiceById,
  getServiceDurationMap,
  createService,
  updateService,
  getSettings,
  updateSettings,
  listWeeklySlots,
  replaceWeeklySlots,
  getActiveBookingsForMonth,
  getActiveBookingsByDate,
  getActiveBookingsByUser,
  getUserBookings
} from "../src/d1-repository.js";

var TENANT = "tenant-test-001";
var LOCATION = "location-test-001";
var STAFF = "staff-test-001";

/**
 * handler(sql, binds, method) 依測試情境回傳：
 * - method 'all'   → rows 陣列
 * - method 'first' → 單列或 null
 * - method 'run'   → { meta: { changes } }（未回傳時預設 changes: 1）
 */
function makeFakeDb(handler) {
  var db = {
    calls: [],
    batchedStatements: null,
    prepare: function (sql) {
      return {
        bind: function () {
          var binds = Array.prototype.slice.call(arguments);
          var statement = {
            sql: sql,
            binds: binds,
            all: async function () {
              db.calls.push({ sql: sql, binds: binds, method: "all" });
              return { results: (handler ? handler(sql, binds, "all") : []) || [] };
            },
            first: async function () {
              db.calls.push({ sql: sql, binds: binds, method: "first" });
              return handler ? handler(sql, binds, "first") : null;
            },
            run: async function () {
              db.calls.push({ sql: sql, binds: binds, method: "run" });
              return (handler ? handler(sql, binds, "run") : null) || { meta: { changes: 1 } };
            }
          };
          return statement;
        }
      };
    },
    batch: async function (statements) {
      db.batchedStatements = statements;
      statements.forEach(function (s) {
        db.calls.push({ sql: s.sql, binds: s.binds, method: "batch" });
      });
      return [];
    }
  };
  return db;
}

function makeEnv(db) {
  return { DB: db, TENANT_ID: TENANT };
}

function makeSlotsEnv(db) {
  return { DB: db, TENANT_ID: TENANT, LOCATION_ID: LOCATION, STAFF_ID: STAFF };
}

function serviceRow(overrides) {
  return Object.assign({
    id: "svc-1",
    name: "基礎護理",
    duration_minutes: 60,
    price_amount: 1200,
    description: "說明文字",
    status: "active",
    sort_order: 1
  }, overrides || {});
}

// ── 環境設定錯誤 ──────────────────────────────────────────────

test("缺少 env.DB 時丟 500 設定錯誤且不洩漏值", async function () {
  await assert.rejects(
    listServices({ TENANT_ID: TENANT }, true),
    function (error) {
      assert.equal(error.status, 500);
      assert.ok(!error.message.includes(TENANT), "錯誤訊息不得包含 TENANT_ID 值");
      return true;
    }
  );
});

test("缺少 env.TENANT_ID 時丟 500 設定錯誤", function () {
  assert.throws(
    function () { ensureD1Env({ DB: makeFakeDb() }); },
    function (error) {
      assert.equal(error.status, 500);
      assert.match(error.message, /TENANT_ID/);
      return true;
    }
  );
});

// ── listServices ─────────────────────────────────────────────

test("listServices 綁定 TENANT_ID、activeOnly 只查 active、DTO 為 camelCase", async function () {
  var db = makeFakeDb(function (sql, binds, method) {
    if (method === "all") return [serviceRow()];
    return null;
  });

  var services = await listServices(makeEnv(db), true);

  var call = db.calls[0];
  assert.equal(call.binds[0], TENANT);
  assert.match(call.sql, /status = 'active'/);
  assert.ok(!/IN \('active', 'inactive'\)/.test(call.sql));

  assert.deepEqual(services, [{
    id: "svc-1",
    name: "基礎護理",
    durationMinutes: 60,
    price: 1200,
    description: "說明文字",
    status: "上架",
    sortOrder: 1
  }]);
});

test("listServices activeOnly=false 查 active 與 inactive，inactive 轉為下架", async function () {
  var db = makeFakeDb(function (sql, binds, method) {
    if (method === "all") return [serviceRow({ status: "inactive" })];
    return null;
  });

  var services = await listServices(makeEnv(db), false);

  assert.match(db.calls[0].sql, /IN \('active', 'inactive'\)/);
  assert.equal(services[0].status, "下架");
});

// ── getServiceById ───────────────────────────────────────────

test("getServiceById 找不到時回 404", async function () {
  var db = makeFakeDb(function () { return null; });
  await assert.rejects(
    getServiceById(makeEnv(db), "no-such-id"),
    function (error) {
      assert.equal(error.status, 404);
      return true;
    }
  );
});

// ── createService ────────────────────────────────────────────

test("createService 拒絕空名稱且不觸發任何 SQL", async function () {
  var db = makeFakeDb();
  await assert.rejects(
    createService(makeEnv(db), { name: "" }),
    /服務名稱/
  );
  assert.equal(db.calls.length, 0);
});

test("createService 拒絕負價格", async function () {
  var db = makeFakeDb();
  await assert.rejects(
    createService(makeEnv(db), { name: "新服務", price: -100 }),
    /價格/
  );
  assert.equal(db.calls.length, 0);
});

test("createService 成功時 INSERT 綁定 tenant_id 並回傳 DTO", async function () {
  var insertedId = null;
  var db = makeFakeDb(function (sql, binds, method) {
    if (method === "run") {
      insertedId = binds[0];
      return { meta: { changes: 1 } };
    }
    if (method === "first") {
      return serviceRow({ id: insertedId, name: "新服務" });
    }
    return null;
  });

  var dto = await createService(makeEnv(db), { name: "新服務", durationMinutes: 60 });

  var insert = db.calls.find(function (c) { return /INSERT INTO services/.test(c.sql); });
  assert.ok(insert, "應執行 INSERT INTO services");
  assert.equal(insert.binds[1], TENANT);
  assert.equal(dto.id, insertedId);
  assert.equal(dto.name, "新服務");
});

// ── updateService ────────────────────────────────────────────

test("updateService 拒絕非法狀態", async function () {
  var db = makeFakeDb();
  await assert.rejects(
    updateService(makeEnv(db), "svc-1", { status: "封存" }),
    /上架.*下架|狀態/
  );
  assert.equal(db.calls.length, 0);
});

test("updateService 的 UPDATE 必含 tenant_id 條件", async function () {
  var db = makeFakeDb(function (sql, binds, method) {
    if (method === "first") return serviceRow();
    return null;
  });

  await updateService(makeEnv(db), "svc-1", { name: "改名" });

  var update = db.calls.find(function (c) { return /^UPDATE services/.test(c.sql); });
  assert.ok(update, "應執行 UPDATE services");
  assert.match(update.sql, /WHERE tenant_id = \?\d+ AND id = \?\d+/);
  assert.ok(update.binds.includes(TENANT));
  assert.ok(update.binds.includes("svc-1"));
});

// ── getServiceDurationMap ────────────────────────────────────

test("getServiceDurationMap 去除重複與空 ID，回傳時長對照", async function () {
  var db = makeFakeDb(function (sql, binds, method) {
    if (method === "all") {
      return [
        { id: "a", duration_minutes: 60 },
        { id: "b", duration_minutes: 90 }
      ];
    }
    return null;
  });

  var map = await getServiceDurationMap(
    makeEnv(db),
    ["a", "a", "b", null, "", "a"]
  );

  assert.deepEqual(db.calls[0].binds, [TENANT, "a", "b"]);
  assert.deepEqual(map, { a: 60, b: 90 });
});

test("getServiceDurationMap 空清單不查 DB", async function () {
  var db = makeFakeDb();
  var map = await getServiceDurationMap(makeEnv(db), []);
  assert.deepEqual(map, {});
  assert.equal(db.calls.length, 0);
});

// ── getSettings ──────────────────────────────────────────────

test("getSettings 無資料時回傳預設值", async function () {
  var db = makeFakeDb(function () { return []; });
  var settings = await getSettings(makeEnv(db));

  assert.deepEqual(settings, {
    id: "default",
    brandName: "美業工作室",
    primaryColor: "#E8B4B8",
    announcement: "",
    cancelPolicy: "預約日前 24 小時可免費取消。",
    depositEnabled: false,
    depositAmount: null,
    bankName: "",
    bankCode: "",
    bankAccount: "",
    bankAccountName: "",
    depositNote: ""
  });
});

test("getSettings 正確解析 boolean／number／string", async function () {
  var db = makeFakeDb(function (sql, binds, method) {
    if (method === "all") {
      return [
        { setting_key: "brand_name", setting_value: "測試工作室" },
        { setting_key: "theme_color", setting_value: "#123456" },
        { setting_key: "deposit_enabled", setting_value: "true" },
        { setting_key: "deposit_amount", setting_value: "500" }
      ];
    }
    return null;
  });

  var settings = await getSettings(makeEnv(db));

  assert.equal(settings.brandName, "測試工作室");
  assert.equal(settings.primaryColor, "#123456");
  assert.equal(settings.depositEnabled, true);
  assert.equal(settings.depositAmount, 500);
  assert.equal(settings.announcement, "");
});

// ── updateSettings ───────────────────────────────────────────

test("updateSettings 只寫白名單 key，未知欄位忽略", async function () {
  var db = makeFakeDb(function () { return []; });

  await updateSettings(makeEnv(db), {
    brandName: "新店名",
    announcement: "公告",
    evilKey: "DROP TABLE tenant_settings",
    settingKey: "任意鍵"
  });

  assert.ok(db.batchedStatements, "應以 batch 寫入");
  assert.equal(db.batchedStatements.length, 2);

  var writtenKeys = db.batchedStatements.map(function (s) { return s.binds[2]; });
  assert.deepEqual(writtenKeys.sort(), ["announcement", "brand_name"]);
  db.batchedStatements.forEach(function (s) {
    assert.ok(!s.binds.includes("evilKey"));
    assert.ok(!s.binds.includes("DROP TABLE tenant_settings"));
  });
});

test("開啟訂金但缺帳號或戶名時拒絕", async function () {
  var db = makeFakeDb();
  await assert.rejects(
    updateSettings(makeEnv(db), {
      depositEnabled: true,
      bankAccount: "",
      bankAccountName: "測試戶名",
      depositAmount: 500
    }),
    /帳號與戶名/
  );
  assert.equal(db.calls.length, 0);
});

test("開啟訂金但金額無效時拒絕", async function () {
  var db = makeFakeDb();
  await assert.rejects(
    updateSettings(makeEnv(db), {
      depositEnabled: true,
      bankAccount: "000123456789",
      bankAccountName: "測試戶名",
      depositAmount: 0
    }),
    /訂金金額須大於 0/
  );
  assert.equal(db.calls.length, 0);
});

// ── weekly slots：環境設定 ───────────────────────────────────

test("缺少 LOCATION_ID 時回 500 且不洩漏實際值", async function () {
  var db = makeFakeDb();
  await assert.rejects(
    listWeeklySlots({ DB: db, TENANT_ID: TENANT, STAFF_ID: STAFF }),
    function (error) {
      assert.equal(error.status, 500);
      assert.match(error.message, /LOCATION_ID/);
      assert.ok(!error.message.includes(TENANT));
      assert.ok(!error.message.includes(STAFF));
      return true;
    }
  );
  assert.equal(db.calls.length, 0);
});

test("缺少 STAFF_ID 時回 500 且不洩漏實際值", async function () {
  var db = makeFakeDb();
  await assert.rejects(
    replaceWeeklySlots({ DB: db, TENANT_ID: TENANT, LOCATION_ID: LOCATION }, []),
    function (error) {
      assert.equal(error.status, 500);
      assert.match(error.message, /STAFF_ID/);
      assert.ok(!error.message.includes(TENANT));
      assert.ok(!error.message.includes(LOCATION));
      return true;
    }
  );
  assert.equal(db.calls.length, 0);
});

// ── listWeeklySlots ──────────────────────────────────────────

test("listWeeklySlots 綁定 tenant/location/staff、只查 weekly 開放時段、DTO 相容", async function () {
  var db = makeFakeDb(function (sql, binds, method) {
    if (method === "all") {
      return [
        { id: "slot-sun", weekday: 0, start_time: "10:00", end_time: "12:00", is_available: 1 },
        { id: "slot-sat", weekday: 6, start_time: "14:00", end_time: "18:00", is_available: 1 }
      ];
    }
    return null;
  });

  var slots = await listWeeklySlots(makeSlotsEnv(db));

  var call = db.calls[0];
  assert.deepEqual(call.binds, [TENANT, LOCATION, STAFF]);
  assert.match(call.sql, /schedule_type = 'weekly'/);
  assert.match(call.sql, /is_active = 1/);
  assert.match(call.sql, /is_available = 1/);

  assert.deepEqual(slots, [
    {
      id: "slot-sun",
      name: "週日 10:00~12:00",
      weekday: "日",
      startTime: "10:00",
      endTime: "12:00",
      status: "開放"
    },
    {
      id: "slot-sat",
      name: "週六 14:00~18:00",
      weekday: "六",
      startTime: "14:00",
      endTime: "18:00",
      status: "開放"
    }
  ]);
});

// ── replaceWeeklySlots：範圍與 batch ─────────────────────────

test("replaceWeeklySlots 的 DELETE 限制 tenant/location/staff/weekly，不含 date_override", async function () {
  var db = makeFakeDb();
  await replaceWeeklySlots(makeSlotsEnv(db), [
    { weekday: "一", startTime: "10:00", endTime: "18:00" }
  ]);

  var deletes = db.batchedStatements.filter(function (s) { return /^DELETE/.test(s.sql); });
  assert.equal(deletes.length, 1);
  var del = deletes[0];
  assert.match(del.sql, /tenant_id = \?\d+/);
  assert.match(del.sql, /location_id = \?\d+/);
  assert.match(del.sql, /staff_id = \?\d+/);
  assert.match(del.sql, /schedule_type = 'weekly'/);
  assert.ok(!del.sql.includes("date_override"));
  assert.deepEqual(del.binds, [TENANT, LOCATION, STAFF]);
});

test("replaceWeeklySlots 的 DELETE 與 INSERT 在同一次 batch", async function () {
  var db = makeFakeDb();
  await replaceWeeklySlots(makeSlotsEnv(db), [
    { weekday: "一", startTime: "10:00", endTime: "12:00" },
    { weekday: "二", startTime: "13:00", endTime: "18:00" }
  ]);

  assert.ok(db.batchedStatements, "應使用 batch");
  assert.equal(db.batchedStatements.length, 3);
  assert.match(db.batchedStatements[0].sql, /^DELETE/);
  assert.match(db.batchedStatements[1].sql, /^INSERT INTO staff_schedules/);
  assert.match(db.batchedStatements[2].sql, /^INSERT INTO staff_schedules/);
});

test("replaceWeeklySlots 空陣列時只執行 scoped DELETE", async function () {
  var db = makeFakeDb();
  var result = await replaceWeeklySlots(makeSlotsEnv(db), []);

  assert.equal(db.batchedStatements.length, 1);
  assert.match(db.batchedStatements[0].sql, /^DELETE/);
  assert.deepEqual(db.batchedStatements[0].binds, [TENANT, LOCATION, STAFF]);
  assert.deepEqual(result, []);
});

test("replaceWeeklySlots 的 INSERT 正確綁定 weekday、時間、is_available", async function () {
  var db = makeFakeDb();
  await replaceWeeklySlots(makeSlotsEnv(db), [
    { weekday: "三", startTime: "09:00", endTime: "17:30", status: "關閉" }
  ]);

  var insert = db.batchedStatements[1];
  // 綁定順序：id, tenant, location, staff, weekday, start, end, is_available, now
  assert.equal(insert.binds[1], TENANT);
  assert.equal(insert.binds[2], LOCATION);
  assert.equal(insert.binds[3], STAFF);
  assert.equal(insert.binds[4], 3);
  assert.equal(insert.binds[5], "09:00");
  assert.equal(insert.binds[6], "17:30");
  assert.equal(insert.binds[7], 0);
});

// ── replaceWeeklySlots：驗證拒絕 ─────────────────────────────

test("replaceWeeklySlots 拒絕非法星期", async function () {
  var db = makeFakeDb();
  await assert.rejects(
    replaceWeeklySlots(makeSlotsEnv(db), [
      { weekday: "週八", startTime: "10:00", endTime: "12:00" }
    ]),
    /星期格式錯誤/
  );
  assert.equal(db.batchedStatements, null);
});

test("replaceWeeklySlots 拒絕非 HH:MM 時間", async function () {
  var db = makeFakeDb();
  await assert.rejects(
    replaceWeeklySlots(makeSlotsEnv(db), [
      { weekday: "一", startTime: "9:00", endTime: "12:00" }
    ]),
    /HH:MM/
  );
  assert.equal(db.batchedStatements, null);
});

test("replaceWeeklySlots 拒絕 endTime <= startTime", async function () {
  var db = makeFakeDb();
  await assert.rejects(
    replaceWeeklySlots(makeSlotsEnv(db), [
      { weekday: "一", startTime: "12:00", endTime: "12:00" }
    ]),
    /結束時間必須晚於開始時間/
  );
  assert.equal(db.batchedStatements, null);
});

test("replaceWeeklySlots 拒絕重複時段", async function () {
  var db = makeFakeDb();
  await assert.rejects(
    replaceWeeklySlots(makeSlotsEnv(db), [
      { weekday: "一", startTime: "10:00", endTime: "12:00" },
      { weekday: "一", startTime: "10:00", endTime: "12:00" }
    ]),
    /時段重複/
  );
  assert.equal(db.batchedStatements, null);
});

test("replaceWeeklySlots 拒絕非法 status", async function () {
  var db = makeFakeDb();
  await assert.rejects(
    replaceWeeklySlots(makeSlotsEnv(db), [
      { weekday: "一", startTime: "10:00", endTime: "12:00", status: "暫停" }
    ]),
    /僅允許「開放」或「關閉」/
  );
  assert.equal(db.batchedStatements, null);
});

// ── replaceWeeklySlots：status 轉換 ──────────────────────────

test("status 開放／關閉／未提供 正確轉成 1／0／1", async function () {
  var db = makeFakeDb();
  var result = await replaceWeeklySlots(makeSlotsEnv(db), [
    { weekday: "一", startTime: "10:00", endTime: "12:00", status: "開放" },
    { weekday: "二", startTime: "10:00", endTime: "12:00", status: "關閉" },
    { weekday: "三", startTime: "10:00", endTime: "12:00" }
  ]);

  var inserts = db.batchedStatements.filter(function (s) { return /^INSERT/.test(s.sql); });
  assert.deepEqual(
    inserts.map(function (s) { return s.binds[7]; }),
    [1, 0, 1]
  );
  assert.deepEqual(
    result.map(function (r) { return r.status; }),
    ["開放", "關閉", "開放"]
  );
});

// ── bookings 唯讀查詢 ────────────────────────────────────────

function bookingRow(overrides) {
  return Object.assign({
    id: "bk-1",
    booking_no: "BK-0001",
    start_at: "2026-07-17T16:30:00.000Z",
    status: "confirmed",
    cancellation_reason_code: null,
    cancellation_note: null,
    cancelled_at: null,
    created_at: "2026-07-10T01:00:00.000Z",
    display_name: "測試客",
    mobile: "0912345678",
    birthday: "1990-01-01",
    line_user_id: "U-test-user",
    service_id: "svc-1",
    service_name_snapshot: "基礎護理"
  }, overrides || {});
}

test("getActiveBookingsForMonth 拒絕非法 month", async function () {
  var db = makeFakeDb();
  var badMonths = ["2026-00", "2026-13", "2026-7"];
  for (var i = 0; i < badMonths.length; i++) {
    await assert.rejects(
      getActiveBookingsForMonth(makeEnv(db), badMonths[i]),
      /month 格式錯誤/
    );
  }
  assert.equal(db.calls.length, 0);
});

test("getActiveBookingsForMonth 2026-07 的 UTC 邊界對應台北 7/1～8/1 00:00", async function () {
  var db = makeFakeDb(function () { return []; });
  await getActiveBookingsForMonth(makeEnv(db), "2026-07");

  var call = db.calls[0];
  assert.equal(call.binds[0], TENANT);
  assert.equal(call.binds[1], "2026-06-30T16:00:00.000Z");
  assert.equal(call.binds[2], "2026-07-31T16:00:00.000Z");
  assert.match(call.sql, /b\.start_at >= \?2 AND b\.start_at < \?3/);
});

test("getActiveBookingsForMonth 限制 tenant_id 與 active statuses，range 相容", async function () {
  var db = makeFakeDb(function () { return []; });
  var result = await getActiveBookingsForMonth(makeEnv(db), "2026-07");

  var call = db.calls[0];
  assert.match(call.sql, /b\.tenant_id = \?1/);
  assert.match(call.sql, /b\.status IN \('pending', 'confirmed', 'checked_in'\)/);

  assert.deepEqual(result.range, {
    month: "2026-07",
    start: "2026-07-01",
    end: "2026-07-31"
  });
  assert.deepEqual(result.bookings, []);
});

test("getActiveBookingsByDate 拒絕不存在的日期、接受閏年 2024-02-29", async function () {
  var db = makeFakeDb(function () { return []; });
  var badDates = ["2026-02-29", "2026-02-30", "2026-04-31"];
  for (var i = 0; i < badDates.length; i++) {
    await assert.rejects(
      getActiveBookingsByDate(makeEnv(db), badDates[i]),
      /date 格式錯誤/
    );
  }
  assert.equal(db.calls.length, 0);

  var bookings = await getActiveBookingsByDate(makeEnv(db), "2024-02-29");
  assert.deepEqual(bookings, []);
  assert.equal(db.calls.length, 1);
});

test("getActiveBookingsByDate 的 UTC 範圍正好涵蓋台北該日 24 小時", async function () {
  var db = makeFakeDb(function () { return []; });
  await getActiveBookingsByDate(makeEnv(db), "2026-07-18");

  var call = db.calls[0];
  assert.equal(call.binds[0], TENANT);
  assert.equal(call.binds[1], "2026-07-17T16:00:00.000Z");
  assert.equal(call.binds[2], "2026-07-18T16:00:00.000Z");
  var spanMs = new Date(call.binds[2]).getTime() - new Date(call.binds[1]).getTime();
  assert.equal(spanMs, 24 * 60 * 60 * 1000);
  assert.match(call.sql, /b\.start_at >= \?2 AND b\.start_at < \?3/);
});

test("DTO 時區：UTC 16:30 輸出台北隔日 00:30，cancelled_at 轉台北日期", async function () {
  var db = makeFakeDb(function (sql, binds, method) {
    if (method === "all") {
      return [bookingRow({
        status: "cancelled_by_customer",
        start_at: "2026-07-17T16:30:00.000Z",
        cancelled_at: "2026-07-17T16:30:00.000Z",
        cancellation_note: "客人自行取消"
      })];
    }
    return null;
  });

  var bookings = await getUserBookings(makeEnv(db), "U-test-user");
  var dto = bookings[0];

  assert.equal(dto.date, "2026-07-18");
  assert.equal(dto.time, "00:30");
  assert.equal(dto.canceledAt, "2026-07-18");
  assert.equal(dto.cancelReason, "客人自行取消");
});

test("狀態轉換：四種 active/completed 皆為已確認；兩種取消對應客人／業主", async function () {
  var rows = [
    bookingRow({ id: "b1", status: "pending" }),
    bookingRow({ id: "b2", status: "confirmed" }),
    bookingRow({ id: "b3", status: "checked_in" }),
    bookingRow({ id: "b4", status: "completed" }),
    bookingRow({ id: "b5", status: "cancelled_by_customer", cancelled_at: "2026-07-01T02:00:00.000Z" }),
    bookingRow({ id: "b6", status: "cancelled_by_store", cancelled_at: "2026-07-01T02:00:00.000Z" })
  ];
  var db = makeFakeDb(function (sql, binds, method) {
    return method === "all" ? rows : null;
  });

  var bookings = await getUserBookings(makeEnv(db), "U-test-user");

  assert.deepEqual(
    bookings.map(function (b) { return b.status; }),
    ["已確認", "已確認", "已確認", "已確認", "已取消", "已取消"]
  );
  assert.deepEqual(
    bookings.map(function (b) { return b.canceledBy; }),
    ["", "", "", "", "客人", "業主"]
  );
});

test("user 查詢透過 line_accounts.line_user_id，userId 與 tenant 都走 bind", async function () {
  var db = makeFakeDb(function () { return []; });
  await getActiveBookingsByUser(makeEnv(db), "U-test-user");

  var call = db.calls[0];
  assert.match(call.sql, /la\.line_user_id = \?2/);
  assert.deepEqual(call.binds, [TENANT, "U-test-user"]);
  assert.ok(
    !/b\.customer_id = \?/.test(call.sql),
    "userId 不得綁成 customer_id 條件"
  );
  assert.ok(!call.sql.includes("U-test-user"), "userId 不得拼接進 SQL");
});

test("bookings SQL 以 booking_items sort_order 最前一筆子查詢取服務", async function () {
  var db = makeFakeDb(function () { return []; });
  await getActiveBookingsByDate(makeEnv(db), "2026-07-18");

  var sql = db.calls[0].sql;
  assert.match(sql, /SELECT bi2\.id FROM booking_items bi2/);
  assert.match(sql, /ORDER BY bi2\.sort_order ASC, bi2\.created_at ASC LIMIT 1/);
});

test("getUserBookings 排除 rescheduled／no_show，已確認在前、已取消在後", async function () {
  var db = makeFakeDb(function () { return []; });
  await getUserBookings(makeEnv(db), "U-test-user");

  var sql = db.calls[0].sql;
  assert.ok(!sql.includes("rescheduled"), "查詢不得包含 rescheduled");
  assert.ok(!sql.includes("no_show"), "查詢不得包含 no_show");
  assert.match(
    sql,
    /ORDER BY CASE WHEN b\.status IN \('pending', 'confirmed', 'checked_in'\) OR b\.status = 'completed' THEN 0 ELSE 1 END ASC, b\.start_at DESC/
  );
});
