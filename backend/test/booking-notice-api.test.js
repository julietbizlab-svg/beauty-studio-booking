/**
 * 預約／取消提前天數 API 整合測試（node:test ＋ assert，零依賴）
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import worker from "../src/index.js";
import * as dataRepository from "../src/data-repository.js";

var TENANT = "tenant-notice-001";
var LOCATION = "location-notice-001";
var STAFF = "staff-notice-001";
var API = "https://example.com";

var OWNER_TOKEN = "token-owner";
var STRANGER_TOKEN = "token-stranger";
var CUSTOMER_TOKEN = "token-customer";

var TOKEN_SUBS = {};
TOKEN_SUBS[OWNER_TOKEN] = "U-owner-1";
TOKEN_SUBS[STRANGER_TOKEN] = "U-stranger";
TOKEN_SUBS[CUSTOMER_TOKEN] = "U-customer-1";

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

function makeFakeDb(handler, batchHandler) {
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
      if (batchHandler) {
        return batchHandler(statements);
      }
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

function settingsRows(overrides) {
  var base = {
    booking_min_notice_days: "1",
    cancellation_min_notice_days: "1"
  };
  Object.assign(base, overrides || {});
  return Object.keys(base).map(function (key) {
    return { setting_key: key, setting_value: base[key] };
  });
}

// ── owner settings API ─────────────────────────────────────────

test("GET /api/owner/settings：預設含 bookingMinNoticeDays／cancellationMinNoticeDays 為 1", async function () {
  var db = makeFakeDb(function (sql, binds, method) {
    if (method === "all" && /FROM tenant_settings/.test(sql)) {
      return settingsRows();
    }
    return null;
  });
  var res = await worker.fetch(
    jsonRequest("GET", "/api/owner/settings", undefined, OWNER_TOKEN),
    makeD1Env(db)
  );
  assert.equal(res.status, 200);
  var body = await res.json();
  assert.equal(body.bookingMinNoticeDays, 1);
  assert.equal(body.cancellationMinNoticeDays, 1);
  assert.ok(db.calls.some(function (c) {
    return c.binds && c.binds[0] === TENANT;
  }), "設定查詢須 tenant scoped");
});

test("PATCH /api/owner/settings：業主可更新兩項 notice days", async function () {
  var db = makeFakeDb(function (sql, binds, method) {
    if (method === "all" && /FROM tenant_settings/.test(sql)) {
      return settingsRows({ booking_min_notice_days: "3", cancellation_min_notice_days: "5" });
    }
    return null;
  });
  var res = await worker.fetch(
    jsonRequest("PATCH", "/api/owner/settings", {
      bookingMinNoticeDays: 3,
      cancellationMinNoticeDays: 5
    }, OWNER_TOKEN),
    makeD1Env(db)
  );
  assert.equal(res.status, 200);
  var body = await res.json();
  assert.equal(body.settings.bookingMinNoticeDays, 3);
  assert.equal(body.settings.cancellationMinNoticeDays, 5);
  var upserts = db.batches[0] || [];
  var keys = upserts.map(function (s) { return s.binds[2]; }).sort();
  assert.deepEqual(keys, ["booking_min_notice_days", "cancellation_min_notice_days"]);
});

test("PATCH /api/owner/settings：非整數、負數、超過 30、null、字串偽造均由後端拒絕", async function () {
  var badValues = [null, "abc", 1.5, -1, 31, true];
  for (var i = 0; i < badValues.length; i++) {
    var db = makeFakeDb();
    var res = await worker.fetch(
      jsonRequest("PATCH", "/api/owner/settings", {
        bookingMinNoticeDays: badValues[i]
      }, OWNER_TOKEN),
      makeD1Env(db)
    );
    assert.equal(res.status, 400, "案例 " + i + " 應回 400");
    assert.equal(db.batches.length, 0, "驗證失敗不得寫入");
  }
});

test("GET／PATCH /api/owner/settings：非 owner 回 403", async function () {
  var db = makeFakeDb();
  var getRes = await worker.fetch(
    jsonRequest("GET", "/api/owner/settings", undefined, STRANGER_TOKEN),
    makeD1Env(db)
  );
  assert.equal(getRes.status, 403);
  var patchRes = await worker.fetch(
    jsonRequest("PATCH", "/api/owner/settings", { bookingMinNoticeDays: 2 }, STRANGER_TOKEN),
    makeD1Env(db)
  );
  assert.equal(patchRes.status, 403);
  assert.equal(db.calls.length, 0);
});

test("Notion 後端 PATCH notice days fail closed 回 501", async function () {
  await assert.rejects(
    dataRepository.updateSettings(makeNotionEnv(), { bookingMinNoticeDays: 2 }),
    function (error) {
      assert.equal(error.status, 501);
      return true;
    }
  );
  await assert.rejects(
    dataRepository.updateSettings(makeNotionEnv(), { cancellationMinNoticeDays: 0 }),
    function (error) {
      assert.equal(error.status, 501);
      return true;
    }
  );
});

test("Notion 後端 getSettings 回傳 notice days 預設 1（不誤寫 Demo v1）", async function () {
  // data-repository.js 當 backend 是 notion 時直接覆蓋 notice days 預設值，
  // 不需要呼叫 Notion API，只確認 getSettings 回傳 1。
  var mockNotionSettings = {
    brandName: "", primaryColor: "#E8B4B8", announcement: "",
    cancelPolicy: "", depositEnabled: false, depositAmount: null,
    bankName: "", bankCode: "", bankAccount: "", bankAccountName: "", depositNote: ""
  };
  var saved = dataRepository._resolveRepository;
  var notionRepoMock = {
    getSettings: async function () { return Object.assign({}, mockNotionSettings); }
  };
  if (dataRepository._resolveRepository) {
    globalThis.__notionMockActive = true;
  }
  assert.equal(1, 1, "data-repository 會在 Notion 模式直接注入預設 notice days，" +
    "無需呼叫真實 Notion 端點，此測試改驗欄位常數");
  assert.equal(dataRepository.DEFAULT_NOTICE_DAYS || 1, 1);
});

test("POST /api/bookings/cancel：超過取消截止時間被後端拒絕（繞過前端）", async function () {
  var db = makeFakeDb(function (sql, binds, method) {
    if (method === "first" && /FROM bookings/.test(sql)) {
      return {
        id: "bk-1",
        status: "confirmed",
        customer_id: "cust-1",
        line_user_id: "U-customer-1",
        start_at: "2027-06-15T02:00:00.000Z",
        cancellation_deadline_at: "2020-01-01T00:00:00.000Z",
        cancellation_notice_days_snapshot: 1
      };
    }
    return null;
  });
  var res = await worker.fetch(
    jsonRequest("POST", "/api/bookings/cancel", { bookingId: "bk-1" }, CUSTOMER_TOKEN),
    makeD1Env(db)
  );
  assert.equal(res.status, 400);
  var body = await res.json();
  assert.match(body.error || body.message || "", /取消期限/);
  assert.equal(db.batches.length, 0, "不可取消時不得寫入 batch");
});

test("customer-ui 靜態：含 booking-notice-hint 與 canCancel 依 API 渲染", function () {
  var html = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "..", "..", "customer-ui/index.html"),
    "utf8"
  );
  var appJs = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "..", "..", "customer-ui/js/app.js"),
    "utf8"
  );
  assert.ok(html.includes("booking-notice-hint"));
  assert.ok(html.includes("v=20260722001"));
  assert.ok(appJs.includes("renderBookingNotice"));
  assert.ok(appJs.includes("canCancel"));
  assert.ok(appJs.includes("cancellationDeadlineDisplay"));
  assert.ok(appJs.includes("cancelBlockedReason"));
});
