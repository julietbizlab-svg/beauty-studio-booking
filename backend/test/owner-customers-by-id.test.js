/**
 * Phase 3c-1：customerId 版業主客戶詳情／更新整合測試
 * （node:test ＋ assert，零依賴）
 *
 * 直接呼叫 index.js 的 fetch handler，搭配 Fake D1 與假 LINE verify
 * endpoint（攔截 globalThis.fetch，不連任何遠端服務）。
 *
 * 驗證重點：
 * - GET／PATCH /api/owner/customers/by-id/:customerId 的 owner auth
 * - 未綁 LINE／無預約（CSV 匯入）客戶仍可讀取與更新
 * - deleted 客戶 404／不可更新
 * - 電話允許空白；白名單欄位；不碰 line_accounts
 * - UPDATE 與 audit INSERT 同一 D1 batch；audit 不含 LINE userId
 * - STAFF_ID tenant 驗證；Notion fail closed 501
 * - 舊 /api/owner/customers/:userId 路徑不被 by-id 誤判
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

var TENANT = "tenant-byid-001";
var LOCATION = "location-byid-001";
var STAFF = "staff-byid-001";
var API = "https://example.com";

var OWNER_TOKEN = "token-owner";
var STRANGER_TOKEN = "token-stranger";

var TOKEN_SUBS = {};
TOKEN_SUBS[OWNER_TOKEN] = "U-owner-1";
TOKEN_SUBS[STRANGER_TOKEN] = "U-stranger";

// 攔截 LINE verify endpoint；其他外部連線一律拒絕
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

/** 最小 Fake D1（與 customer-auth.test.js 相同介面） */
function makeFakeDb(handler) {
  var db = {
    calls: [],
    batches: [],
    prepare: function (sql) {
      return {
        bind: function () {
          var binds = Array.prototype.slice.call(arguments);
          return {
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
        }
      };
    },
    batch: async function (statements) {
      db.batches.push(statements);
      statements.forEach(function (s) {
        db.calls.push({ sql: s.sql, binds: s.binds, method: "batch" });
      });
      return statements.map(function () { return { meta: { changes: 1 } }; });
    }
  };
  return db;
}

function makeD1Env(db) {
  return {
    DATA_BACKEND: "d1",
    DB: db,
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
    OWNER_LINE_USER_IDS: "U-owner-1"
  };
}

function jsonRequest(method, path, body, token) {
  var headers = { "Content-Type": "application/json" };
  if (token) {
    headers.Authorization = "Bearer " + token;
  }
  return new Request(API + path, {
    method: method,
    headers: headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
}

function customerRow(overrides) {
  return Object.assign({
    customer_id: "cust-imported-1",
    id: "cust-imported-1",
    display_name: "匯入客",
    mobile: null,
    birthday: null,
    notes: "",
    source: "import",
    line_user_id: null
  }, overrides || {});
}

function bookingRow(overrides) {
  return Object.assign({
    id: "bk-1",
    booking_no: "BK-0001",
    start_at: "2026-07-17T02:00:00.000Z",
    status: "confirmed",
    cancellation_reason_code: null,
    cancellation_note: null,
    cancelled_at: null,
    created_at: "2026-07-10T02:00:00.000Z",
    display_name: "常客",
    mobile: "0912345678",
    birthday: "1990-01-01",
    notes: "業主私人備註",
    line_user_id: "U-linked-1",
    service_id: "svc-1",
    service_name_snapshot: "基礎護理",
    sort_order: 1
  }, overrides || {});
}

/** 詳情情境 handler：customers first ＋ bookings all */
function detailHandler(customer, bookings) {
  return function (sql, binds, method) {
    if (method === "first" && /FROM customers c/.test(sql)) {
      return customer;
    }
    if (method === "all" && /FROM bookings b/.test(sql)) {
      return bookings || [];
    }
    return null;
  };
}

/** 更新情境 handler：staff 檢查 ＋ customers first */
function updateHandler(customer, staffRow) {
  return function (sql, binds, method) {
    if (method === "first" && /FROM staff/.test(sql)) {
      return staffRow === undefined ? { id: STAFF } : staffRow;
    }
    if (method === "first" && /FROM customers/.test(sql)) {
      return customer;
    }
    return null;
  };
}

var PATCH_BODY = { customerName: "改名客", phone: "0912345678", birthday: "1990-01-01" };

// ── owner auth ───────────────────────────────────────────────

test("by-id GET／PATCH 缺 token 回 401，且不觸發任何 SQL", async function () {
  var requests = [
    jsonRequest("GET", "/api/owner/customers/by-id/cust-1"),
    jsonRequest("PATCH", "/api/owner/customers/by-id/cust-1", PATCH_BODY)
  ];
  for (var i = 0; i < requests.length; i++) {
    var db = makeFakeDb();
    var response = await worker.fetch(requests[i], makeD1Env(db));
    assert.equal(response.status, 401, "案例 " + i + " 應回 401");
    assert.equal(db.calls.length, 0, "案例 " + i + " 缺 token 不得觸發 SQL");
  }
});

test("by-id GET／PATCH 非 owner 回 403", async function () {
  var requests = [
    jsonRequest("GET", "/api/owner/customers/by-id/cust-1", undefined, STRANGER_TOKEN),
    jsonRequest("PATCH", "/api/owner/customers/by-id/cust-1", PATCH_BODY, STRANGER_TOKEN)
  ];
  for (var i = 0; i < requests.length; i++) {
    var db = makeFakeDb();
    var response = await worker.fetch(requests[i], makeD1Env(db));
    assert.equal(response.status, 403, "案例 " + i + " 應回 403");
    assert.equal(db.calls.length, 0, "案例 " + i + " 非 owner 不得觸發 SQL");
  }
});

// ── 詳情 GET /api/owner/customers/by-id/:customerId ──────────

test("by-id 詳情：未綁 LINE、無 booking 的匯入客戶正常回傳", async function () {
  var db = makeFakeDb(detailHandler(customerRow()));
  var response = await worker.fetch(
    jsonRequest("GET", "/api/owner/customers/by-id/cust-imported-1", undefined, OWNER_TOKEN),
    makeD1Env(db)
  );
  assert.equal(response.status, 200);
  var body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.customerId, "cust-imported-1");
  assert.equal(body.userId, "", "未綁 LINE 回空字串");
  assert.equal(body.linkedLine, false);
  assert.equal(body.customerName, "匯入客");
  assert.equal(body.phone, "");
  assert.equal(body.birthday, "");
  assert.equal(body.note, "");
  assert.equal(body.source, "import");
  assert.deepEqual(body.bookings, []);
});

test("by-id 詳情：有 LINE、有 booking 正常回傳，bookings 不含 note", async function () {
  var db = makeFakeDb(detailHandler(
    customerRow({
      customer_id: "cust-linked-1",
      display_name: "常客",
      mobile: "0912345678",
      birthday: "1990-01-01",
      notes: "業主私人備註",
      source: "line",
      line_user_id: "U-linked-1"
    }),
    [bookingRow()]
  ));
  var response = await worker.fetch(
    jsonRequest("GET", "/api/owner/customers/by-id/cust-linked-1", undefined, OWNER_TOKEN),
    makeD1Env(db)
  );
  assert.equal(response.status, 200);
  var body = await response.json();
  assert.equal(body.linkedLine, true);
  assert.equal(body.userId, "U-linked-1");
  assert.equal(body.note, "業主私人備註");
  assert.equal(body.bookings.length, 1);
  var booking = body.bookings[0];
  assert.equal(booking.id, "bk-1");
  assert.equal(booking.serviceName, "基礎護理");
  assert.ok(!("note" in booking), "bookings DTO 不得含 note");
  assert.ok(!("userId" in booking), "bookings DTO 不得含 LINE userId");
});

test("by-id 詳情：找不到或 deleted 客戶回 404", async function () {
  var db = makeFakeDb(detailHandler(null));
  var response = await worker.fetch(
    jsonRequest("GET", "/api/owner/customers/by-id/cust-gone", undefined, OWNER_TOKEN),
    makeD1Env(db)
  );
  assert.equal(response.status, 404);
});

test("by-id 詳情：tenant scoped、排除 deleted、customerId 走 bind", async function () {
  var db = makeFakeDb(detailHandler(customerRow()));
  await worker.fetch(
    jsonRequest("GET", "/api/owner/customers/by-id/cust-imported-1", undefined, OWNER_TOKEN),
    makeD1Env(db)
  );

  var customerCall = db.calls.find(function (c) { return /FROM customers c/.test(c.sql); });
  assert.match(customerCall.sql, /c\.tenant_id = \?1 AND c\.id = \?2/);
  assert.match(customerCall.sql, /c\.deleted_at IS NULL/);
  assert.deepEqual(customerCall.binds, [TENANT, "cust-imported-1"]);

  var bookingCall = db.calls.find(function (c) { return /FROM bookings b/.test(c.sql); });
  assert.match(bookingCall.sql, /b\.tenant_id = \?1 AND b\.customer_id = \?2/);
  assert.deepEqual(bookingCall.binds, [TENANT, "cust-imported-1"]);
});

// ── 更新 PATCH /api/owner/customers/by-id/:customerId ────────

test("by-id 更新：姓名空白回 400，且不寫入", async function () {
  var db = makeFakeDb(updateHandler(customerRow()));
  var response = await worker.fetch(
    jsonRequest("PATCH", "/api/owner/customers/by-id/cust-imported-1",
      { customerName: "   ", phone: "0912345678" }, OWNER_TOKEN),
    makeD1Env(db)
  );
  assert.equal(response.status, 400);
  assert.equal(db.batches.length, 0, "驗證失敗不得寫入");
});

test("by-id 更新：電話允許空白（匯入客戶可能沒有電話），寫入 NULL", async function () {
  var db = makeFakeDb(updateHandler(customerRow()));
  var response = await worker.fetch(
    jsonRequest("PATCH", "/api/owner/customers/by-id/cust-imported-1",
      { customerName: "匯入客", phone: "" }, OWNER_TOKEN),
    makeD1Env(db)
  );
  assert.equal(response.status, 200);
  var body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.customer.phone, "");

  var update = db.batches[0][0];
  assert.match(update.sql, /mobile = \?2/);
  assert.equal(update.binds[1], null, "空電話應寫 NULL");
});

test("by-id 更新：非空電話仍驗證格式", async function () {
  var db = makeFakeDb(updateHandler(customerRow()));
  var response = await worker.fetch(
    jsonRequest("PATCH", "/api/owner/customers/by-id/cust-imported-1",
      { customerName: "匯入客", phone: "abc123" }, OWNER_TOKEN),
    makeD1Env(db)
  );
  assert.equal(response.status, 400);
  assert.equal(db.batches.length, 0);
});

test("by-id 更新：birthday 非真實日期回 400；合法日期通過", async function () {
  var badDb = makeFakeDb(updateHandler(customerRow()));
  var badResponse = await worker.fetch(
    jsonRequest("PATCH", "/api/owner/customers/by-id/cust-imported-1",
      { customerName: "匯入客", birthday: "2026-02-30" }, OWNER_TOKEN),
    makeD1Env(badDb)
  );
  assert.equal(badResponse.status, 400);
  assert.equal(badDb.batches.length, 0);

  var okDb = makeFakeDb(updateHandler(customerRow()));
  var okResponse = await worker.fetch(
    jsonRequest("PATCH", "/api/owner/customers/by-id/cust-imported-1",
      { customerName: "匯入客", birthday: "1995-05-05" }, OWNER_TOKEN),
    makeD1Env(okDb)
  );
  assert.equal(okResponse.status, 200);
  var okBody = await okResponse.json();
  assert.equal(okBody.customer.birthday, "1995-05-05");
});

test("by-id 更新：note 新增／清除／省略保留／超過 2000 字回 400", async function () {
  // 新增
  var addDb = makeFakeDb(updateHandler(customerRow()));
  var addResponse = await worker.fetch(
    jsonRequest("PATCH", "/api/owner/customers/by-id/cust-imported-1",
      { customerName: "匯入客", note: " 對精油過敏 " }, OWNER_TOKEN),
    makeD1Env(addDb)
  );
  var addBody = await addResponse.json();
  assert.equal(addBody.customer.note, "對精油過敏", "note 應 trim 後寫入");
  assert.match(addDb.batches[0][0].sql, /notes = \?/);

  // 清除
  var clearDb = makeFakeDb(updateHandler(customerRow({ notes: "舊備註" })));
  var clearResponse = await worker.fetch(
    jsonRequest("PATCH", "/api/owner/customers/by-id/cust-imported-1",
      { customerName: "匯入客", note: "" }, OWNER_TOKEN),
    makeD1Env(clearDb)
  );
  var clearBody = await clearResponse.json();
  assert.equal(clearBody.customer.note, "");

  // 省略保留
  var keepDb = makeFakeDb(updateHandler(customerRow({ notes: "既有備註" })));
  var keepResponse = await worker.fetch(
    jsonRequest("PATCH", "/api/owner/customers/by-id/cust-imported-1",
      { customerName: "匯入客" }, OWNER_TOKEN),
    makeD1Env(keepDb)
  );
  var keepBody = await keepResponse.json();
  assert.equal(keepBody.customer.note, "既有備註", "省略 note 應保留原值");
  assert.ok(!/notes = \?/.test(keepDb.batches[0][0].sql), "省略 note 不得更新 notes 欄");

  // 超長
  var longDb = makeFakeDb(updateHandler(customerRow()));
  var longResponse = await worker.fetch(
    jsonRequest("PATCH", "/api/owner/customers/by-id/cust-imported-1",
      { customerName: "匯入客", note: "多".repeat(2001) }, OWNER_TOKEN),
    makeD1Env(longDb)
  );
  assert.equal(longResponse.status, 400);
  assert.equal(longDb.batches.length, 0, "超長備註不得寫入");
});

test("by-id 更新：deleted 客戶回 404 且不寫入", async function () {
  var db = makeFakeDb(updateHandler(null));
  var response = await worker.fetch(
    jsonRequest("PATCH", "/api/owner/customers/by-id/cust-deleted",
      PATCH_BODY, OWNER_TOKEN),
    makeD1Env(db)
  );
  assert.equal(response.status, 404);
  assert.equal(db.batches.length, 0);

  var customerCall = db.calls.find(function (c) {
    return c.method === "first" && /FROM customers/.test(c.sql);
  });
  assert.match(customerCall.sql, /deleted_at IS NULL/, "查詢必須排除 deleted 客戶");
});

test("by-id 更新：只更新白名單欄位，不動 customer_no／source／line_accounts", async function () {
  var db = makeFakeDb(updateHandler(customerRow()));
  await worker.fetch(
    jsonRequest("PATCH", "/api/owner/customers/by-id/cust-imported-1",
      { customerName: "改名客", phone: "0912345678", birthday: "1990-01-01", note: "備" },
      OWNER_TOKEN),
    makeD1Env(db)
  );

  var update = db.batches[0][0];
  assert.match(update.sql, /^UPDATE customers SET /);
  assert.match(update.sql, /display_name = \?1/);
  assert.match(update.sql, /mobile = \?2/);
  assert.match(update.sql, /birthday = \?3/);
  assert.match(update.sql, /notes = \?4/);
  assert.match(update.sql, /updated_at = \?5/);
  var setClause = update.sql.split(" WHERE ")[0];
  assert.ok(!/customer_no/.test(setClause), "不得更新 customer_no");
  assert.ok(!/source/.test(setClause), "不得更新 source");
  assert.ok(!/tenant_id/.test(setClause), "不得更新 tenant_id");
  assert.match(update.sql, /WHERE tenant_id = \?6 AND id = \?7/, "更新必須 tenant scoped");

  db.calls.forEach(function (call) {
    assert.ok(
      !(/line_accounts/.test(call.sql) && /INSERT|UPDATE|DELETE/i.test(call.sql)),
      "不得建立或修改 line_accounts"
    );
  });
});

test("by-id 更新：UPDATE 與 audit INSERT 在同一 D1 batch，值全走 bind", async function () {
  var db = makeFakeDb(updateHandler(customerRow({ display_name: "舊名", mobile: "0900000000" })));
  var response = await worker.fetch(
    jsonRequest("PATCH", "/api/owner/customers/by-id/cust-imported-1",
      PATCH_BODY, OWNER_TOKEN),
    makeD1Env(db)
  );
  assert.equal(response.status, 200);

  assert.equal(db.batches.length, 1, "必須恰好一次 batch");
  assert.equal(db.batches[0].length, 2, "batch 內為 UPDATE ＋ audit INSERT");

  var audit = db.batches[0][1];
  assert.match(audit.sql, /INSERT INTO audit_logs/);
  assert.match(audit.sql, /'staff'/);
  assert.match(audit.sql, /'customer\.update_by_owner'/);
  assert.match(audit.sql, /'customer'/);
  assert.match(audit.sql, /'admin'/);
  assert.equal(audit.binds[1], TENANT);
  assert.equal(audit.binds[2], STAFF);
  assert.equal(audit.binds[3], "cust-imported-1");
  assert.ok(!audit.sql.includes("改名客"), "客戶資料不得拼接進 SQL");
});

test("by-id 更新：audit before_json／after_json 不含 LINE userId", async function () {
  var db = makeFakeDb(updateHandler(customerRow({
    display_name: "舊名",
    mobile: "0900000000",
    notes: "舊備註"
  })));
  await worker.fetch(
    jsonRequest("PATCH", "/api/owner/customers/by-id/cust-imported-1",
      { customerName: "改名客", phone: "0912345678", note: "新備註" }, OWNER_TOKEN),
    makeD1Env(db)
  );

  var audit = db.batches[0][1];
  var beforeJson = JSON.parse(audit.binds[4]);
  var afterJson = JSON.parse(audit.binds[5]);

  assert.deepEqual(
    Object.keys(beforeJson).sort(),
    ["birthday", "customerName", "note", "phone"]
  );
  assert.deepEqual(
    Object.keys(afterJson).sort(),
    ["birthday", "customerName", "note", "phone"]
  );
  assert.equal(beforeJson.customerName, "舊名");
  assert.equal(afterJson.customerName, "改名客");
  assert.ok(!audit.binds[4].includes("userId"), "before_json 不得含 LINE userId");
  assert.ok(!audit.binds[5].includes("userId"), "after_json 不得含 LINE userId");
});

test("by-id 更新：STAFF_ID 不屬於 tenant 時 fail closed，不寫入", async function () {
  var db = makeFakeDb(updateHandler(customerRow(), null));
  var response = await worker.fetch(
    jsonRequest("PATCH", "/api/owner/customers/by-id/cust-imported-1",
      PATCH_BODY, OWNER_TOKEN),
    makeD1Env(db)
  );
  assert.equal(response.status, 500);
  assert.equal(db.batches.length, 0, "staff 驗證失敗不得寫入");

  var staffCall = db.calls.find(function (c) { return /FROM staff/.test(c.sql); });
  assert.match(staffCall.sql, /tenant_id = \?1 AND id = \?2/);
  assert.deepEqual(staffCall.binds, [TENANT, STAFF]);
});

// ── Notion fail closed ───────────────────────────────────────

test("by-id GET／PATCH 在 Notion 模式 fail closed 回 501", async function () {
  var requests = [
    jsonRequest("GET", "/api/owner/customers/by-id/cust-1", undefined, OWNER_TOKEN),
    jsonRequest("PATCH", "/api/owner/customers/by-id/cust-1", PATCH_BODY, OWNER_TOKEN)
  ];
  for (var i = 0; i < requests.length; i++) {
    var response = await worker.fetch(requests[i], makeNotionEnv());
    assert.equal(response.status, 501, "案例 " + i + " 應回 501");
    var body = await response.json();
    assert.equal(body.ok, false);
    assert.match(body.message, /不支援/);
  }
});

// ── 相容性：舊 userId 路徑不受 by-id 影響 ────────────────────

test("舊 PATCH /api/owner/customers/:userId 仍以 line_user_id 定位客戶", async function () {
  var db = makeFakeDb(function (sql, binds, method) {
    if (method === "first" && /FROM line_accounts la/.test(sql)) {
      return { customer_id: "cust-old-1", notes: "" };
    }
    return null;
  });
  var response = await worker.fetch(
    jsonRequest("PATCH", "/api/owner/customers/U-old-user",
      PATCH_BODY, OWNER_TOKEN),
    makeD1Env(db)
  );
  assert.equal(response.status, 200);

  var lookup = db.calls.find(function (c) { return /FROM line_accounts la/.test(c.sql); });
  assert.match(lookup.sql, /la\.line_user_id = \?2/);
  assert.equal(lookup.binds[1], "U-old-user");
});
