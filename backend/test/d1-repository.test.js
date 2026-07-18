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
  getUserBookings,
  upsertCustomer,
  createBooking,
  cancelBooking,
  cancelBookingByOwner
} from "../src/d1-repository.js";

var TENANT = "tenant-test-001";
var LOCATION = "location-test-001";
var STAFF = "staff-test-001";

/**
 * handler(sql, binds, method) 依測試情境回傳：
 * - method 'all'   → rows 陣列
 * - method 'first' → 單列或 null
 * - method 'run'   → { meta: { changes } }（未回傳時預設 changes: 1）
 *
 * options.batchResults（選用，向後相容擴充）：
 * function (statements, batchIndex) → 該次 batch 的結果陣列；
 * 未提供時預設每筆 { meta: { changes: 1 } }。
 * db.batches 記錄每一次 batch 的 statements；db.batchedStatements 為最後一次。
 */
function makeFakeDb(handler, options) {
  var opts = options || {};
  var db = {
    calls: [],
    batches: [],
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
      var batchIndex = db.batches.length;
      db.batches.push(statements);
      db.batchedStatements = statements;
      statements.forEach(function (s) {
        db.calls.push({ sql: s.sql, binds: s.binds, method: "batch" });
      });
      if (typeof opts.batchResults === "function") {
        return opts.batchResults(statements, batchIndex);
      }
      return statements.map(function () { return { meta: { changes: 1 } }; });
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

// ── upsertCustomer ───────────────────────────────────────────

var UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function customerPayload(overrides) {
  return Object.assign({
    userId: "U-upsert-user",
    name: "測試客",
    phone: "0912345678"
  }, overrides || {});
}

function existingCustomerRow(overrides) {
  return Object.assign({
    customer_id: "cust-existing-1",
    birthday: "1990-01-01",
    notes: "既有備註",
    line_display_name: "舊暱稱"
  }, overrides || {});
}

test("upsertCustomer 拒絕缺 userId、空白 name、缺 phone", async function () {
  var db = makeFakeDb();
  var badPayloads = [
    customerPayload({ userId: "" }),
    customerPayload({ name: "   " }),
    customerPayload({ phone: "" })
  ];
  for (var i = 0; i < badPayloads.length; i++) {
    await assert.rejects(
      upsertCustomer(makeEnv(db), badPayloads[i]),
      /客人姓名與電話為必填/
    );
  }
  assert.equal(db.calls.length, 0);
});

test("upsertCustomer 拒絕不足 8 碼、超過 15 碼或含非法字元的電話", async function () {
  var db = makeFakeDb();
  var badPhones = ["1234567", "1234567890123456", "09-12ab-345"];
  for (var i = 0; i < badPhones.length; i++) {
    await assert.rejects(
      upsertCustomer(makeEnv(db), customerPayload({ phone: badPhones[i] })),
      /電話格式不正確/
    );
  }
  assert.equal(db.calls.length, 0);
});

test("upsertCustomer 電話接受空白／連字號／可選 +，保存正規化結果", async function () {
  var db = makeFakeDb(function () { return null; });
  var dto = await upsertCustomer(
    makeEnv(db),
    customerPayload({ phone: " +886 912-345-678 " })
  );

  // 與 notion.js normalizePhoneInput 相同：只移除空白，保留 + 與連字號
  assert.equal(dto.phone, "+886912-345-678");
  var customerInsert = db.batchedStatements[0];
  assert.ok(customerInsert.binds.includes("+886912-345-678"));
});

test("upsertCustomer birthday 未提供可通過、閏年可通過、不存在日期拒絕", async function () {
  var db = makeFakeDb(function () { return null; });

  await upsertCustomer(makeEnv(db), customerPayload());
  var dtoLeap = await upsertCustomer(
    makeEnv(db),
    customerPayload({ userId: "U-leap", birthday: "2024-02-29" })
  );
  assert.equal(dtoLeap.birthday, "2024-02-29");

  var badBirthdays = ["2026-02-29", "2026-02-30", "2026-04-31"];
  for (var i = 0; i < badBirthdays.length; i++) {
    await assert.rejects(
      upsertCustomer(makeEnv(db), customerPayload({ birthday: badBirthdays[i] })),
      /生日格式請使用 YYYY-MM-DD/
    );
  }
});

test("upsertCustomer 的 SELECT 以 tenant_id＋line_user_id bind 查詢", async function () {
  var db = makeFakeDb(function () { return null; });
  await upsertCustomer(makeEnv(db), customerPayload());

  var select = db.calls.find(function (c) { return c.method === "first"; });
  assert.match(select.sql, /FROM line_accounts la/);
  assert.match(select.sql, /la\.tenant_id = \?1 AND la\.line_user_id = \?2/);
  assert.deepEqual(select.binds, [TENANT, "U-upsert-user"]);
});

test("既有客戶：雙 UPDATE 同一 batch、皆限制 tenant_id、不改綁 customer_id", async function () {
  var db = makeFakeDb(function (sql, binds, method) {
    if (method === "first") return existingCustomerRow();
    return null;
  });

  var dto = await upsertCustomer(makeEnv(db), customerPayload());

  assert.equal(db.batchedStatements.length, 2);
  var customerUpdate = db.batchedStatements[0];
  var lineUpdate = db.batchedStatements[1];

  assert.match(customerUpdate.sql, /^UPDATE customers SET /);
  assert.match(customerUpdate.sql, /WHERE tenant_id = \?\d+ AND id = \?\d+/);
  assert.ok(customerUpdate.binds.includes(TENANT));
  assert.ok(customerUpdate.binds.includes("cust-existing-1"));

  assert.match(lineUpdate.sql, /^UPDATE line_accounts SET /);
  assert.match(lineUpdate.sql, /WHERE tenant_id = \?\d+ AND line_user_id = \?\d+/);
  assert.ok(lineUpdate.binds.includes(TENANT));
  assert.ok(
    !lineUpdate.sql.includes("customer_id"),
    "line_accounts UPDATE 不得改動 customer_id"
  );

  assert.equal(dto.id, "cust-existing-1");
});

test("既有客戶：未提供 birthday 與暱稱時保留既有值", async function () {
  var db = makeFakeDb(function (sql, binds, method) {
    if (method === "first") return existingCustomerRow();
    return null;
  });

  var dto = await upsertCustomer(makeEnv(db), customerPayload());

  var customerUpdate = db.batchedStatements[0];
  var lineUpdate = db.batchedStatements[1];
  assert.ok(!customerUpdate.sql.includes("birthday"), "未提供生日不得更新 birthday 欄");
  assert.ok(!lineUpdate.sql.includes("display_name"), "未提供暱稱不得更新 display_name 欄");

  assert.equal(dto.birthday, "1990-01-01");
  assert.equal(dto.lineNickname, "舊暱稱");
  assert.equal(dto.note, "既有備註");
});

test("新客戶：雙 INSERT 同一 batch、同一 customer_id、ID 為不同 UUID", async function () {
  var db = makeFakeDb(function () { return null; });
  var dto = await upsertCustomer(makeEnv(db), customerPayload());

  assert.equal(db.batchedStatements.length, 2);
  var customerInsert = db.batchedStatements[0];
  var lineInsert = db.batchedStatements[1];

  assert.match(customerInsert.sql, /^INSERT INTO customers /);
  assert.match(lineInsert.sql, /^INSERT INTO line_accounts /);

  var customerId = customerInsert.binds[0];
  var lineAccountId = lineInsert.binds[0];
  assert.match(customerId, UUID_PATTERN);
  assert.match(lineAccountId, UUID_PATTERN);
  assert.notEqual(customerId, lineAccountId);
  assert.equal(lineInsert.binds[2], customerId, "line_accounts 必須綁到同一 customer_id");
  assert.equal(customerInsert.binds[1], TENANT);
  assert.equal(lineInsert.binds[1], TENANT);
  assert.equal(dto.id, customerId);
});

test("新客戶：lineNickname／lineDisplayName fallback，userId 不寫成顯示名稱", async function () {
  var db1 = makeFakeDb(function () { return null; });
  var dto1 = await upsertCustomer(
    makeEnv(db1),
    customerPayload({ lineNickname: "暱稱A", lineDisplayName: "暱稱B" })
  );
  assert.equal(dto1.lineNickname, "暱稱A");

  var db2 = makeFakeDb(function () { return null; });
  var dto2 = await upsertCustomer(
    makeEnv(db2),
    customerPayload({ lineDisplayName: "暱稱B" })
  );
  assert.equal(dto2.lineNickname, "暱稱B");
  assert.equal(db2.batchedStatements[1].binds[4], "暱稱B");

  var db3 = makeFakeDb(function () { return null; });
  await upsertCustomer(makeEnv(db3), customerPayload());
  var lineInsert = db3.batchedStatements[1];
  assert.equal(lineInsert.binds[4], null, "未提供暱稱時 display_name 為 null");
  assert.ok(
    lineInsert.binds[4] !== "U-upsert-user",
    "LINE userId 不得寫成顯示名稱"
  );
});

test("upsertCustomer DTO 欄位完整且輸入值只出現在 bind、不在 SQL", async function () {
  var db = makeFakeDb(function () { return null; });
  var dto = await upsertCustomer(
    makeEnv(db),
    customerPayload({ birthday: "1995-05-05", lineNickname: "小美" })
  );

  assert.deepEqual(Object.keys(dto).sort(), [
    "birthday", "id", "lineNickname", "name", "note", "phone", "userId"
  ]);
  assert.equal(dto.name, "測試客");
  assert.equal(dto.userId, "U-upsert-user");

  var inputValues = ["U-upsert-user", "測試客", "0912345678", "1995-05-05", "小美"];
  db.calls.forEach(function (call) {
    inputValues.forEach(function (value) {
      assert.ok(
        !call.sql.includes(value),
        "輸入值「" + value + "」不得拼接進 SQL"
      );
    });
  });
});

// ── createBooking ────────────────────────────────────────────

function bookingPayload(overrides) {
  return Object.assign({
    userId: "U-booking-user",
    name: "測試客",
    phone: "0912345678",
    serviceId: "svc-1",
    date: "2026-07-18",
    time: "00:30"
  }, overrides || {});
}

/**
 * createBooking 情境用 DB：
 * - services SELECT → opts.service（預設 active 服務）
 * - line_accounts SELECT → opts.existingCustomer（預設既有客戶 cust-existing-1）
 * - opts.batchResults 可指定 batch 結果
 */
function makeBookingDb(opts) {
  var o = opts || {};
  return makeFakeDb(function (sql, binds, method) {
    if (method === "first" && /FROM services/.test(sql)) {
      return o.service !== undefined ? o.service : serviceRow();
    }
    if (method === "first" && /FROM line_accounts la/.test(sql)) {
      return o.existingCustomer !== undefined ? o.existingCustomer : existingCustomerRow();
    }
    return null;
  }, { batchResults: o.batchResults });
}

function findBookingBatch(db) {
  return db.batches.find(function (statements) {
    return /INSERT INTO bookings /.test(statements[0].sql);
  });
}

test("createBooking 缺 DB／TENANT_ID／LOCATION_ID／STAFF_ID 回 500", async function () {
  var db = makeBookingDb();
  var badEnvs = [
    { TENANT_ID: TENANT, LOCATION_ID: LOCATION, STAFF_ID: STAFF },
    { DB: db, LOCATION_ID: LOCATION, STAFF_ID: STAFF },
    { DB: db, TENANT_ID: TENANT, STAFF_ID: STAFF },
    { DB: db, TENANT_ID: TENANT, LOCATION_ID: LOCATION }
  ];
  for (var i = 0; i < badEnvs.length; i++) {
    await assert.rejects(
      createBooking(badEnvs[i], bookingPayload()),
      function (error) {
        assert.equal(error.status, 500);
        return true;
      }
    );
  }
  assert.equal(db.calls.length, 0);
});

test("createBooking 輸入驗證逐項拒絕，且不觸發任何 SQL", async function () {
  var cases = [
    [{ userId: "" }, /缺少 LINE userId/],
    [{ name: "   ", customerName: "" }, /請填寫姓名/],
    [{ phone: "12ab34" }, /電話格式不正確/],
    [{ birthday: "2026-02-30" }, /生日格式請使用 YYYY-MM-DD/],
    [{ serviceId: "" }, /請選擇服務項目/],
    [{ date: "2026-02-30" }, /date 格式錯誤/],
    [{ time: "24:30" }, /時間格式錯誤/]
  ];
  for (var i = 0; i < cases.length; i++) {
    var db = makeBookingDb();
    await assert.rejects(
      createBooking(makeSlotsEnv(db), bookingPayload(cases[i][0])),
      cases[i][1]
    );
    assert.equal(db.calls.length, 0, "驗證失敗不得觸發 SQL：案例 " + i);
  }
});

test("createBooking 的 service SELECT 限制 tenant；inactive 不建 customer 與 booking", async function () {
  var db = makeBookingDb({ service: serviceRow({ status: "inactive" }) });
  await assert.rejects(
    createBooking(makeSlotsEnv(db), bookingPayload()),
    /未開放預約/
  );

  var serviceSelect = db.calls[0];
  assert.match(serviceSelect.sql, /FROM services WHERE tenant_id = \?1 AND id = \?2/);
  assert.deepEqual(serviceSelect.binds, [TENANT, "svc-1"]);

  var customerLookups = db.calls.filter(function (c) { return /FROM line_accounts/.test(c.sql); });
  assert.equal(customerLookups.length, 0, "inactive 服務不得繼續查／建 customer");
  assert.equal(db.batches.length, 0, "inactive 服務不得有任何寫入");
});

test("createBooking 先 upsertCustomer，booking 綁定回傳的 customer_id", async function () {
  var db = makeBookingDb();
  await createBooking(makeSlotsEnv(db), bookingPayload());

  var bookingBatch = findBookingBatch(db);
  assert.ok(bookingBatch, "應有 booking batch");
  var bookingInsert = bookingBatch[0];
  assert.equal(bookingInsert.binds[3], "cust-existing-1", "customer_id 必須來自 upsertCustomer");

  var customerSelectIndex = db.calls.findIndex(function (c) { return /FROM line_accounts la/.test(c.sql); });
  var bookingInsertIndex = db.calls.findIndex(function (c) { return /INSERT INTO bookings /.test(c.sql); });
  assert.ok(customerSelectIndex < bookingInsertIndex, "upsertCustomer 必須先於 booking 寫入");
});

test("createBooking 台北時間轉 UTC：start_at／end_at／同日範圍", async function () {
  var db = makeBookingDb();
  await createBooking(makeSlotsEnv(db), bookingPayload({ date: "2026-07-18", time: "00:30" }));

  var binds = findBookingBatch(db)[0].binds;
  // 綁定順序：id, tenant, location, customer, staff, booking_no,
  //           start_at, end_at, now, dayStart, dayEnd
  assert.equal(binds[6], "2026-07-17T16:30:00.000Z");
  assert.equal(binds[7], "2026-07-17T17:30:00.000Z", "end_at 應為 start_at＋60 分鐘");
  assert.equal(binds[9], "2026-07-17T16:00:00.000Z", "同日下界＝台北 7/18 00:00");
  assert.equal(binds[10], "2026-07-18T16:00:00.000Z", "同日上界＝台北 7/19 00:00");
});

test("createBooking 的 bookings INSERT 為條件式且同時檢查同日與重疊", async function () {
  var db = makeBookingDb();
  await createBooking(makeSlotsEnv(db), bookingPayload());

  var sql = findBookingBatch(db)[0].sql;
  assert.match(sql, /^INSERT INTO bookings [\s\S]*SELECT [\s\S]*WHERE NOT EXISTS/);
  assert.match(sql, /b\.customer_id = \?4/);
  assert.match(sql, /b\.start_at >= \?10 AND b\.start_at < \?11/);
  assert.match(sql, /b\.staff_id = \?5/);
  assert.match(sql, /b\.start_at < \?8 AND b\.end_at > \?7/);

  var statusLists = sql.match(/status IN \([^)]*\)/g) || [];
  assert.equal(statusLists.length, 2, "同日與重疊檢查各一組 active statuses");
  statusLists.forEach(function (list) {
    assert.equal(list, "status IN ('pending', 'confirmed', 'checked_in')");
  });
});

test("createBooking 三筆寫入同一 batch 且順序正確，items／log 以 WHERE EXISTS 依附", async function () {
  var db = makeBookingDb();
  await createBooking(makeSlotsEnv(db), bookingPayload());

  var bookingBatch = findBookingBatch(db);
  assert.equal(bookingBatch.length, 3);
  assert.match(bookingBatch[0].sql, /^INSERT INTO bookings /);
  assert.match(bookingBatch[1].sql, /^INSERT INTO booking_items /);
  assert.match(bookingBatch[2].sql, /^INSERT INTO booking_status_logs /);

  var guard = /WHERE EXISTS \(SELECT 1 FROM bookings WHERE tenant_id = \?2 AND id = \?3\)/;
  assert.match(bookingBatch[1].sql, guard);
  assert.match(bookingBatch[2].sql, guard);

  var bookingId = bookingBatch[0].binds[0];
  assert.equal(bookingBatch[1].binds[2], bookingId);
  assert.equal(bookingBatch[2].binds[2], bookingId);
});

test("booking_items 保存 service ID、名稱、時長、價格快照", async function () {
  var db = makeBookingDb();
  await createBooking(makeSlotsEnv(db), bookingPayload());

  var itemInsert = findBookingBatch(db)[1];
  // 綁定順序：id, tenant, booking_id, service_id, name, duration, price, now
  assert.equal(itemInsert.binds[3], "svc-1");
  assert.equal(itemInsert.binds[4], "基礎護理");
  assert.equal(itemInsert.binds[5], 60);
  assert.equal(itemInsert.binds[6], 1200);
});

test("status log 為 NULL→confirmed、changed_by_type='customer'", async function () {
  var db = makeBookingDb();
  await createBooking(makeSlotsEnv(db), bookingPayload());

  var logInsert = findBookingBatch(db)[2];
  assert.match(logInsert.sql, /SELECT \?1, \?2, \?3, NULL, 'confirmed', 'customer', \?4, \?5/);
  assert.equal(logInsert.binds[3], "cust-existing-1");
});

test("bookings changes=0 時回 400 並提示重疊或同日已有預約", async function () {
  var db = makeBookingDb({
    batchResults: function (statements) {
      if (/INSERT INTO bookings /.test(statements[0].sql)) {
        return statements.map(function () { return { meta: { changes: 0 } }; });
      }
      return statements.map(function () { return { meta: { changes: 1 } }; });
    }
  });

  await assert.rejects(
    createBooking(makeSlotsEnv(db), bookingPayload()),
    function (error) {
      assert.equal(error.status, 400);
      assert.match(error.message, /重疊/);
      assert.match(error.message, /同一天已有預約/);
      return true;
    }
  );
});

test("changes=1 時回傳 ok、預約成功與完整相容 DTO", async function () {
  var db = makeBookingDb();
  var result = await createBooking(makeSlotsEnv(db), bookingPayload({ birthday: "1995-05-05" }));

  assert.equal(result.ok, true);
  assert.equal(result.message, "預約成功");

  var booking = result.booking;
  assert.deepEqual(Object.keys(booking).sort(), [
    "birthday", "cancelReason", "canceledAt", "canceledBy", "createdAt",
    "customerName", "date", "id", "phone", "serviceId", "serviceName",
    "status", "time", "title", "userId"
  ]);
  assert.match(booking.id, UUID_PATTERN);
  assert.equal(booking.userId, "U-booking-user");
  assert.equal(booking.customerName, "測試客");
  assert.equal(booking.phone, "0912345678");
  assert.equal(booking.birthday, "1995-05-05");
  assert.equal(booking.serviceId, "svc-1");
  assert.equal(booking.serviceName, "基礎護理");
  assert.equal(booking.date, "2026-07-18");
  assert.equal(booking.time, "00:30");
  assert.equal(booking.status, "已確認");
  assert.equal(booking.cancelReason, "");
  assert.equal(booking.canceledBy, "");
  assert.equal(booking.canceledAt, "");
  assert.ok(booking.createdAt);
});

test("booking_no 以 BK- 開頭且不含姓名、電話、LINE userId；輸入只在 bind", async function () {
  var db = makeBookingDb();
  var result = await createBooking(makeSlotsEnv(db), bookingPayload());

  var bookingNo = result.booking.title;
  assert.match(bookingNo, /^BK-/);
  assert.ok(!bookingNo.includes("測試客"));
  assert.ok(!bookingNo.includes("0912345678"));
  assert.ok(!bookingNo.includes("U-booking-user"));

  var inputValues = ["U-booking-user", "測試客", "0912345678", "00:30"];
  db.calls.forEach(function (call) {
    inputValues.forEach(function (value) {
      assert.ok(
        !call.sql.includes(value),
        "輸入值「" + value + "」不得拼接進 SQL"
      );
    });
  });
});

// ── cancelBooking（客戶取消） ────────────────────────────────

var ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
var ACTIVE_STATUS_LIST = "('pending', 'confirmed', 'checked_in')";

function makeCancelDb(opts) {
  var o = opts || {};
  return makeFakeDb(function (sql, binds, method) {
    if (method === "first" && /FROM bookings/.test(sql)) {
      return o.booking !== undefined ? o.booking : {
        id: "bk-1",
        status: "confirmed",
        customer_id: "cust-existing-1",
        line_user_id: "U-cancel-user"
      };
    }
    return null;
  }, { batchResults: o.batchResults });
}

function makeOwnerEnv(db) {
  return { DB: db, TENANT_ID: TENANT, STAFF_ID: STAFF };
}

test("cancelBooking 缺 userId／bookingId 拒絕且不觸發 SQL", async function () {
  var db = makeCancelDb();
  await assert.rejects(cancelBooking(makeEnv(db), "", "bk-1"), /缺少 LINE userId/);
  await assert.rejects(cancelBooking(makeEnv(db), "U-cancel-user", ""), /缺少預約編號/);
  assert.equal(db.calls.length, 0);
});

test("cancelBooking 找不到 booking 回 404", async function () {
  var db = makeCancelDb({ booking: null });
  await assert.rejects(
    cancelBooking(makeEnv(db), "U-cancel-user", "bk-x"),
    function (error) {
      assert.equal(error.status, 404);
      return true;
    }
  );
});

test("cancelBooking 非本人回 403 且不執行 batch", async function () {
  var db = makeCancelDb();
  await assert.rejects(
    cancelBooking(makeEnv(db), "U-other-user", "bk-1"),
    function (error) {
      assert.equal(error.status, 403);
      assert.match(error.message, /無法取消他人的預約/);
      return true;
    }
  );
  assert.equal(db.batches.length, 0);
});

test("cancelBooking 已取消狀態回「已取消」，不可取消狀態回「無法取消」", async function () {
  var cancelledStatuses = ["cancelled_by_customer", "cancelled_by_store"];
  for (var i = 0; i < cancelledStatuses.length; i++) {
    var db1 = makeCancelDb({
      booking: { id: "bk-1", status: cancelledStatuses[i], customer_id: "cust-existing-1", line_user_id: "U-cancel-user" }
    });
    await assert.rejects(
      cancelBooking(makeEnv(db1), "U-cancel-user", "bk-1"),
      /此預約已取消/
    );
    assert.equal(db1.batches.length, 0);
  }

  var blockedStatuses = ["completed", "no_show", "rescheduled"];
  for (var j = 0; j < blockedStatuses.length; j++) {
    var db2 = makeCancelDb({
      booking: { id: "bk-1", status: blockedStatuses[j], customer_id: "cust-existing-1", line_user_id: "U-cancel-user" }
    });
    await assert.rejects(
      cancelBooking(makeEnv(db2), "U-cancel-user", "bk-1"),
      /此預約無法取消/
    );
    assert.equal(db2.batches.length, 0);
  }
});

test("cancelBooking 預讀 SELECT 限制 tenant_id＋bookingId", async function () {
  var db = makeCancelDb();
  await cancelBooking(makeEnv(db), "U-cancel-user", "bk-1");

  var select = db.calls.find(function (c) { return c.method === "first"; });
  assert.match(select.sql, /b\.tenant_id = \?1 AND b\.id = \?2/);
  assert.deepEqual(select.binds, [TENANT, "bk-1"]);
});

test("cancelBooking batch 順序為 log INSERT...SELECT → booking UPDATE，且都限 active statuses", async function () {
  var db = makeCancelDb();
  await cancelBooking(makeEnv(db), "U-cancel-user", "bk-1");

  assert.equal(db.batches.length, 1);
  var statements = db.batches[0];
  assert.equal(statements.length, 2);
  assert.match(statements[0].sql, /^INSERT INTO booking_status_logs [\s\S]*SELECT /);
  assert.match(statements[1].sql, /^UPDATE bookings SET /);
  assert.ok(statements[0].sql.includes("b.status IN " + ACTIVE_STATUS_LIST));
  assert.ok(statements[1].sql.includes("status IN " + ACTIVE_STATUS_LIST));
});

test("cancelBooking 的 log 與 UPDATE 都以 line_accounts＋bind userId 再驗所有權", async function () {
  var db = makeCancelDb();
  await cancelBooking(makeEnv(db), "U-cancel-user", "bk-1");

  var logInsert = db.batches[0][0];
  var update = db.batches[0][1];

  assert.match(
    logInsert.sql,
    /JOIN line_accounts la ON la\.tenant_id = b\.tenant_id AND la\.customer_id = b\.customer_id AND la\.line_user_id = \?6/
  );
  assert.equal(logInsert.binds[5], "U-cancel-user");

  assert.match(
    update.sql,
    /AND EXISTS \(SELECT 1 FROM line_accounts la WHERE la\.tenant_id = bookings\.tenant_id AND la\.customer_id = bookings\.customer_id AND la\.line_user_id = \?4\)/
  );
  assert.equal(update.binds[3], "U-cancel-user");

  [logInsert, update].forEach(function (s) {
    assert.ok(!s.sql.includes("U-cancel-user"), "userId 不得拼接進 SQL");
  });
});

test("cancelBooking 的 log 保存實際 from_status 與 customer 身分", async function () {
  var db = makeCancelDb();
  await cancelBooking(makeEnv(db), "U-cancel-user", "bk-1");

  var logInsert = db.batches[0][0];
  assert.match(
    logInsert.sql,
    /SELECT \?1, \?2, \?3, b\.status, 'cancelled_by_customer', 'customer', \?4/
  );
  assert.equal(logInsert.binds[1], TENANT);
  assert.equal(logInsert.binds[2], "bk-1");
  assert.equal(logInsert.binds[3], "cust-existing-1", "changed_by_id 必須為 customer_id");
});

test("cancelBooking 的 UPDATE 寫入 customer_cancelled、客人自行取消與 UTC 時間", async function () {
  var db = makeCancelDb();
  await cancelBooking(makeEnv(db), "U-cancel-user", "bk-1");

  var update = db.batches[0][1];
  assert.ok(update.sql.includes("status = 'cancelled_by_customer'"));
  assert.ok(update.sql.includes("cancellation_reason_code = 'customer_cancelled'"));
  assert.ok(update.sql.includes("cancellation_note = '客人自行取消'"));
  assert.ok(update.sql.includes("cancelled_at = ?1, updated_at = ?1"));
  assert.match(update.binds[0], ISO_UTC_PATTERN);
  assert.equal(update.binds[1], TENANT);
  assert.equal(update.binds[2], "bk-1");
});

test("cancelBooking UPDATE changes=0 回 400 不回成功；成功回傳相容格式", async function () {
  var dbFail = makeCancelDb({
    batchResults: function (statements) {
      return statements.map(function (s) {
        return { meta: { changes: /^UPDATE/.test(s.sql) ? 0 : 1 } };
      });
    }
  });
  await assert.rejects(
    cancelBooking(makeEnv(dbFail), "U-cancel-user", "bk-1"),
    function (error) {
      assert.equal(error.status, 400);
      return true;
    }
  );

  var dbOk = makeCancelDb();
  var result = await cancelBooking(makeEnv(dbOk), "U-cancel-user", "bk-1");
  assert.deepEqual(result, { ok: true, message: "已取消預約", bookingId: "bk-1" });
});

// ── cancelBookingByOwner（業主取消） ─────────────────────────

test("cancelBookingByOwner 缺 STAFF_ID 回 500", async function () {
  var db = makeCancelDb();
  await assert.rejects(
    cancelBookingByOwner({ DB: db, TENANT_ID: TENANT }, "bk-1", "原因"),
    function (error) {
      assert.equal(error.status, 500);
      assert.match(error.message, /STAFF_ID/);
      return true;
    }
  );
  assert.equal(db.calls.length, 0);
});

test("cancelBookingByOwner 缺 bookingId／空白 reason 拒絕", async function () {
  var db = makeCancelDb();
  await assert.rejects(cancelBookingByOwner(makeOwnerEnv(db), "", "原因"), /缺少預約編號/);
  await assert.rejects(cancelBookingByOwner(makeOwnerEnv(db), "bk-1", "   "), /請填寫取消原因/);
  assert.equal(db.calls.length, 0);
});

test("cancelBookingByOwner 找不到回 404；已取消與不可取消狀態拒絕", async function () {
  var dbNotFound = makeCancelDb({ booking: null });
  await assert.rejects(
    cancelBookingByOwner(makeOwnerEnv(dbNotFound), "bk-x", "原因"),
    function (error) {
      assert.equal(error.status, 404);
      return true;
    }
  );

  var dbCancelled = makeCancelDb({ booking: { id: "bk-1", status: "cancelled_by_store" } });
  await assert.rejects(
    cancelBookingByOwner(makeOwnerEnv(dbCancelled), "bk-1", "原因"),
    /此預約已取消/
  );

  var dbCompleted = makeCancelDb({ booking: { id: "bk-1", status: "completed" } });
  await assert.rejects(
    cancelBookingByOwner(makeOwnerEnv(dbCompleted), "bk-1", "原因"),
    /此預約無法取消/
  );
  assert.equal(dbCompleted.batches.length, 0);
});

test("cancelBookingByOwner 的 SELECT／log／UPDATE 都限制 tenant_id，順序 log→UPDATE", async function () {
  var db = makeCancelDb();
  await cancelBookingByOwner(makeOwnerEnv(db), "bk-1", "原因");

  var select = db.calls.find(function (c) { return c.method === "first"; });
  assert.match(select.sql, /WHERE tenant_id = \?1 AND id = \?2/);
  assert.deepEqual(select.binds, [TENANT, "bk-1"]);

  var statements = db.batches[0];
  assert.equal(statements.length, 2);
  assert.match(statements[0].sql, /^INSERT INTO booking_status_logs /);
  assert.match(statements[1].sql, /^UPDATE bookings SET /);
  assert.match(statements[0].sql, /b\.tenant_id = \?2/);
  assert.match(statements[1].sql, /WHERE tenant_id = \?3/);
  assert.equal(statements[0].binds[1], TENANT);
  assert.equal(statements[1].binds[2], TENANT);
  assert.ok(statements[0].sql.includes("b.status IN " + ACTIVE_STATUS_LIST));
  assert.ok(statements[1].sql.includes("status IN " + ACTIVE_STATUS_LIST));
});

test("cancelBookingByOwner 的 log 用實際 from_status、staff 身分與 STAFF_ID", async function () {
  var db = makeCancelDb();
  await cancelBookingByOwner(makeOwnerEnv(db), "bk-1", "原因");

  var logInsert = db.batches[0][0];
  assert.match(
    logInsert.sql,
    /SELECT \?1, \?2, \?3, b\.status, 'cancelled_by_store', 'staff', \?4/
  );
  assert.equal(logInsert.binds[3], STAFF, "changed_by_id 必須為 STAFF_ID");
});

test("cancelBookingByOwner 的 UPDATE 寫入 store_cancelled 與 trim 後 reason（走 bind）", async function () {
  var db = makeCancelDb();
  await cancelBookingByOwner(makeOwnerEnv(db), "bk-1", "  老師臨時有事  ");

  var logInsert = db.batches[0][0];
  var update = db.batches[0][1];

  assert.ok(update.sql.includes("status = 'cancelled_by_store'"));
  assert.ok(update.sql.includes("cancellation_reason_code = 'store_cancelled'"));
  assert.ok(update.sql.includes("cancellation_note = ?1"));
  assert.ok(update.sql.includes("cancelled_at = ?2, updated_at = ?2"));
  assert.equal(update.binds[0], "老師臨時有事");
  assert.match(update.binds[1], ISO_UTC_PATTERN);
  assert.equal(logInsert.binds[4], "老師臨時有事");

  db.calls.forEach(function (call) {
    assert.ok(!call.sql.includes("老師臨時有事"), "reason 不得拼接進 SQL");
  });
});

test("cancelBookingByOwner changes=0 回 400；成功回傳 cancelReason 與 canceledBy 業主", async function () {
  var dbFail = makeCancelDb({
    batchResults: function (statements) {
      return statements.map(function (s) {
        return { meta: { changes: /^UPDATE/.test(s.sql) ? 0 : 1 } };
      });
    }
  });
  await assert.rejects(
    cancelBookingByOwner(makeOwnerEnv(dbFail), "bk-1", "原因"),
    function (error) {
      assert.equal(error.status, 400);
      return true;
    }
  );

  var dbOk = makeCancelDb();
  var result = await cancelBookingByOwner(makeOwnerEnv(dbOk), "bk-1", " 原因 ");
  assert.deepEqual(result, {
    ok: true,
    message: "已取消預約",
    bookingId: "bk-1",
    cancelReason: "原因",
    canceledBy: "業主"
  });
});
