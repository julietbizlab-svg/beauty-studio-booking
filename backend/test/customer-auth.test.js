/**
 * 客人／業主 API 身分驗證整合測試（node:test ＋ assert，零依賴）
 *
 * 直接呼叫 index.js 的 fetch handler，搭配 Fake D1 與假 LINE verify
 * endpoint（攔截 globalThis.fetch，不連任何遠端服務）。
 *
 * 驗證重點：
 * - 客人 API 缺 token／無效 token 回 401
 * - payload／query 偽造 userId 時，一律使用驗證 token 的 sub
 * - GET /api/customer/me 只回 token 所屬客戶
 * - 業主 PATCH /api/owner/customers/:userId 缺 token 401、非 owner 403、
 *   owner 可更新且 tenant scoped
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

var TENANT = "tenant-auth-001";
var LOCATION = "location-auth-001";
var STAFF = "staff-auth-001";
var API = "https://example.com";

var CUSTOMER_TOKEN = "token-customer";
var OWNER_TOKEN = "token-owner";
var STRANGER_TOKEN = "token-stranger";

var TOKEN_SUBS = {};
TOKEN_SUBS[CUSTOMER_TOKEN] = "U-token-user";
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

/** 最小 Fake D1（與 d1-repository.test.js 相同介面） */
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

function serviceRow() {
  return {
    id: "svc-1",
    name: "基礎護理",
    duration_minutes: 60,
    price_amount: 1200,
    description: "",
    status: "active",
    sort_order: 1
  };
}

/** createBooking 情境用 handler：active 服務＋既有客戶 */
function bookingHandler(sql, binds, method) {
  if (method === "first" && /FROM services/.test(sql)) {
    return serviceRow();
  }
  if (method === "first" && /FROM line_accounts la/.test(sql)) {
    return {
      customer_id: "cust-existing-1",
      display_name: "既有姓名",
      mobile: "0900111222",
      birthday: "1990-01-01",
      notes: "",
      line_display_name: "舊暱稱"
    };
  }
  return null;
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

function bookingBody(overrides) {
  return Object.assign({
    customerName: "測試客",
    phone: "0912345678",
    serviceId: "svc-1",
    date: "2026-07-25",
    time: "10:00"
  }, overrides || {});
}

// ── 客人 API 缺 token／無效 token 回 401 ─────────────────────

test("客人 API 缺 token 一律回 401，且不觸發任何 SQL", async function () {
  var requests = [
    jsonRequest("POST", "/api/bookings", bookingBody()),
    jsonRequest("GET", "/api/bookings/me"),
    jsonRequest("POST", "/api/bookings/cancel", { bookingId: "bk-1" }),
    jsonRequest("GET", "/api/customer/me")
  ];
  for (var i = 0; i < requests.length; i++) {
    var db = makeFakeDb(bookingHandler);
    var response = await worker.fetch(requests[i], makeD1Env(db));
    assert.equal(response.status, 401, "案例 " + i + " 應回 401");
    var body = await response.json();
    assert.equal(body.ok, false);
    assert.equal(db.calls.length, 0, "案例 " + i + " 缺 token 不得觸發 SQL");
  }
});

test("客人 API 無效 token 回 401", async function () {
  var db = makeFakeDb(bookingHandler);
  var response = await worker.fetch(
    jsonRequest("GET", "/api/customer/me", undefined, "bad-token"),
    makeD1Env(db)
  );
  assert.equal(response.status, 401);
  assert.equal(db.calls.length, 0);
});

// ── payload／query 偽造 userId 時仍使用 token sub ────────────

test("POST /api/bookings：payload 偽造 userId 被忽略，一律用 token sub", async function () {
  var db = makeFakeDb(bookingHandler);
  var response = await worker.fetch(
    jsonRequest("POST", "/api/bookings", bookingBody({ userId: "U-attacker" }), CUSTOMER_TOKEN),
    makeD1Env(db)
  );

  assert.equal(response.status, 200);
  var body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.booking.userId, "U-token-user", "回傳 userId 必須為 token sub");

  var customerSelect = db.calls.find(function (c) {
    return c.method === "first" && /FROM line_accounts la/.test(c.sql);
  });
  assert.equal(customerSelect.binds[1], "U-token-user", "客戶查詢必須用 token sub");
  db.calls.forEach(function (call) {
    assert.ok(
      call.binds.indexOf("U-attacker") === -1,
      "偽造 userId 不得出現在任何 bind"
    );
  });
});

test("GET /api/bookings/me：query 偽造 userId 被忽略，查詢綁 token sub", async function () {
  var db = makeFakeDb(function () { return []; });
  var response = await worker.fetch(
    jsonRequest("GET", "/api/bookings/me?userId=U-attacker", undefined, CUSTOMER_TOKEN),
    makeD1Env(db)
  );

  assert.equal(response.status, 200);
  var call = db.calls[0];
  assert.match(call.sql, /la\.line_user_id = \?2/);
  assert.deepEqual(call.binds, [TENANT, "U-token-user"]);
});

test("POST /api/bookings/cancel：body 偽造 userId 被忽略，所有權檢查用 token sub", async function () {
  var db = makeFakeDb(function (sql, binds, method) {
    if (method === "first" && /FROM bookings/.test(sql)) {
      return {
        id: "bk-1",
        status: "confirmed",
        customer_id: "cust-existing-1",
        line_user_id: "U-token-user"
      };
    }
    return null;
  });
  var response = await worker.fetch(
    jsonRequest("POST", "/api/bookings/cancel", { userId: "U-attacker", bookingId: "bk-1" }, CUSTOMER_TOKEN),
    makeD1Env(db)
  );

  assert.equal(response.status, 200);
  var body = await response.json();
  assert.equal(body.ok, true);
  db.calls.forEach(function (call) {
    assert.ok(call.binds.indexOf("U-attacker") === -1, "偽造 userId 不得出現在任何 bind");
  });
});

// ── LINE profile metadata 信任邊界 ───────────────────────────

test("POST /api/bookings：偽造 LINE nickname／displayName／picture 不進 SQL bind", async function () {
  var db = makeFakeDb(bookingHandler);
  var response = await worker.fetch(
    jsonRequest("POST", "/api/bookings", bookingBody({
      displayName: "偽造顯示名稱",
      lineDisplayName: "偽造LINE名稱",
      lineNickname: "偽造暱稱",
      picture: "https://evil.example/fake.png",
      pictureUrl: "https://evil.example/fake2.png"
    }), CUSTOMER_TOKEN),
    makeD1Env(db)
  );

  assert.equal(response.status, 200);
  var fakeValues = [
    "偽造顯示名稱",
    "偽造LINE名稱",
    "偽造暱稱",
    "https://evil.example/fake.png",
    "https://evil.example/fake2.png"
  ];
  db.calls.forEach(function (call) {
    fakeValues.forEach(function (value) {
      assert.ok(
        call.binds.indexOf(value) === -1,
        "偽造 metadata「" + value + "」不得出現在任何 bind"
      );
      assert.ok(
        !call.sql.includes(value),
        "偽造 metadata「" + value + "」不得拼接進 SQL"
      );
    });
  });
});

test("POST /api/bookings：line_accounts metadata 使用 LINE 驗證回傳的 name", async function () {
  var db = makeFakeDb(bookingHandler);
  var response = await worker.fetch(
    jsonRequest("POST", "/api/bookings", bookingBody({
      displayName: "偽造顯示名稱"
    }), CUSTOMER_TOKEN),
    makeD1Env(db)
  );

  assert.equal(response.status, 200);
  var lineUpdate = db.calls.find(function (c) {
    return /^UPDATE line_accounts SET /.test(c.sql);
  });
  assert.ok(lineUpdate, "既有客戶應更新 line_accounts metadata");
  assert.ok(
    lineUpdate.binds.indexOf("測試") !== -1,
    "line_accounts 暱稱必須為 LINE verify 回傳的 name"
  );
  assert.ok(lineUpdate.binds.indexOf("偽造顯示名稱") === -1);
});

test("POST /api/bookings：payload 夾帶 note／notes 不會寫入 customers.notes", async function () {
  var db = makeFakeDb(bookingHandler);
  var response = await worker.fetch(
    jsonRequest("POST", "/api/bookings", bookingBody({
      note: "駭客備註",
      notes: "駭客備註二"
    }), CUSTOMER_TOKEN),
    makeD1Env(db)
  );

  assert.equal(response.status, 200);
  db.calls.forEach(function (call) {
    assert.ok(call.binds.indexOf("駭客備註") === -1, "note 不得出現在任何 bind");
    assert.ok(call.binds.indexOf("駭客備註二") === -1, "notes 不得出現在任何 bind");
    if (/INSERT INTO customers|UPDATE customers/.test(call.sql)) {
      assert.ok(!call.sql.includes("notes"), "建立預約不得寫入 customers.notes");
    }
  });
});

test("新客戶建立預約時 line_accounts 顯示名稱同樣採用驗證後的 name", async function () {
  var db = makeFakeDb(function (sql, binds, method) {
    if (method === "first" && /FROM services/.test(sql)) {
      return serviceRow();
    }
    return null; // line_accounts 查無 → 新客戶
  });
  var response = await worker.fetch(
    jsonRequest("POST", "/api/bookings", bookingBody({
      lineNickname: "偽造暱稱"
    }), CUSTOMER_TOKEN),
    makeD1Env(db)
  );

  assert.equal(response.status, 200);
  var lineInsert = db.calls.find(function (c) {
    return /^INSERT INTO line_accounts /.test(c.sql);
  });
  assert.ok(lineInsert, "新客戶應建立 line_accounts");
  assert.equal(lineInsert.binds[4], "測試", "顯示名稱必須為 LINE verify 回傳的 name");
});

// ── GET /api/customer/me ─────────────────────────────────────

test("GET /api/customer/me 只用 token sub 查詢，忽略任意 userId query", async function () {
  var db = makeFakeDb(function (sql, binds, method) {
    if (method === "first" && binds[1] === "U-token-user") {
      return { display_name: "王小美", mobile: "0987654321", birthday: "1995-05-05" };
    }
    return null;
  });
  var response = await worker.fetch(
    jsonRequest("GET", "/api/customer/me?userId=U-attacker", undefined, CUSTOMER_TOKEN),
    makeD1Env(db)
  );

  assert.equal(response.status, 200);
  var body = await response.json();
  assert.deepEqual(body, {
    ok: true,
    exists: true,
    customer: {
      customerName: "王小美",
      phone: "0987654321",
      birthday: "1995-05-05"
    }
  });
  assert.deepEqual(db.calls[0].binds, [TENANT, "U-token-user"]);
});

test("GET /api/customer/me 尚未建檔回 exists:false、customer:null", async function () {
  var db = makeFakeDb(function () { return null; });
  var response = await worker.fetch(
    jsonRequest("GET", "/api/customer/me", undefined, CUSTOMER_TOKEN),
    makeD1Env(db)
  );

  assert.equal(response.status, 200);
  var body = await response.json();
  assert.deepEqual(body, { ok: true, exists: false, customer: null });
});

test("GET /api/customer/me 不洩漏業主備註（note／notes）", async function () {
  var db = makeFakeDb(function (sql, binds, method) {
    if (method === "first") {
      // 即使查詢意外帶回 notes 欄位，DTO 也不得輸出
      return {
        display_name: "王小美",
        mobile: "0987654321",
        birthday: "1995-05-05",
        notes: "秘密業主備註"
      };
    }
    return null;
  });
  var response = await worker.fetch(
    jsonRequest("GET", "/api/customer/me", undefined, CUSTOMER_TOKEN),
    makeD1Env(db)
  );

  assert.equal(response.status, 200);
  var text = await response.text();
  assert.ok(!text.includes("秘密業主備註"), "回應不得包含業主備註內容");
  var body = JSON.parse(text);
  assert.deepEqual(
    Object.keys(body.customer).sort(),
    ["birthday", "customerName", "phone"],
    "customer 只含姓名、電話、生日"
  );
  assert.ok(!db.calls[0].sql.includes("notes"), "查詢不得 SELECT notes");
});

// ── PATCH /api/owner/customers/:userId ───────────────────────

function ownerPatchRequest(token) {
  return jsonRequest(
    "PATCH",
    "/api/owner/customers/U-target-customer",
    { customerName: "王小美", phone: "0987654321", birthday: "1995-05-05", note: "VIP 客戶" },
    token
  );
}

function ownerCustomerHandler(sql, binds, method) {
  if (method === "first" && /FROM line_accounts la/.test(sql)) {
    return { customer_id: "cust-existing-1" };
  }
  return null;
}

test("業主 PATCH 缺 token 回 401、非 owner 回 403，且都不寫入", async function () {
  var dbNoToken = makeFakeDb(ownerCustomerHandler);
  var responseNoToken = await worker.fetch(ownerPatchRequest(null), makeD1Env(dbNoToken));
  assert.equal(responseNoToken.status, 401);
  assert.equal(dbNoToken.calls.length, 0);

  var dbStranger = makeFakeDb(ownerCustomerHandler);
  var responseStranger = await worker.fetch(ownerPatchRequest(STRANGER_TOKEN), makeD1Env(dbStranger));
  assert.equal(responseStranger.status, 403);
  var strangerBody = await responseStranger.json();
  assert.match(strangerBody.message, /無業主管理權限/);
  assert.equal(dbStranger.calls.length, 0);
});

test("業主 PATCH 可更新姓名、電話、生日，查詢與 UPDATE 都 tenant scoped", async function () {
  var db = makeFakeDb(ownerCustomerHandler);
  var response = await worker.fetch(ownerPatchRequest(OWNER_TOKEN), makeD1Env(db));

  assert.equal(response.status, 200);
  var body = await response.json();
  assert.deepEqual(body, {
    ok: true,
    customer: {
      customerName: "王小美",
      phone: "0987654321",
      birthday: "1995-05-05",
      note: "VIP 客戶"
    }
  });

  var select = db.calls.find(function (c) { return c.method === "first"; });
  assert.match(select.sql, /la\.tenant_id = \?1 AND la\.line_user_id = \?2/);
  assert.deepEqual(select.binds, [TENANT, "U-target-customer"]);

  var update = db.calls.find(function (c) { return /^UPDATE customers SET /.test(c.sql); });
  assert.ok(update, "應執行 UPDATE customers");
  assert.ok(update.binds.includes(TENANT), "UPDATE 必須綁定 TENANT_ID");
  assert.ok(!update.sql.includes("line_user_id"), "不得改 LINE userId");
});

test("業主 PATCH 找不到客戶回 404、姓名空白回 400", async function () {
  var dbNotFound = makeFakeDb(function () { return null; });
  var responseNotFound = await worker.fetch(ownerPatchRequest(OWNER_TOKEN), makeD1Env(dbNotFound));
  assert.equal(responseNotFound.status, 404);

  var dbBadInput = makeFakeDb(ownerCustomerHandler);
  var responseBadInput = await worker.fetch(
    jsonRequest(
      "PATCH",
      "/api/owner/customers/U-target-customer",
      { customerName: "  ", phone: "0987654321" },
      OWNER_TOKEN
    ),
    makeD1Env(dbBadInput)
  );
  assert.equal(responseBadInput.status, 400);
  var writes = dbBadInput.calls.filter(function (c) { return c.method !== "first"; });
  assert.equal(writes.length, 0, "驗證失敗不得寫入");
});
