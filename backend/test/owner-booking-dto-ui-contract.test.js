/**
 * API DTO → Owner UI contract 回歸測試
 *
 * 使用真實 getOwnerBookingsForMonth DTO（非手寫 internalStatus mock），
 * 驗證 Owner 預約清單依 internalStatus 渲染 transition 按鈕。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import worker from "../src/index.js";
import { getOwnerBookingsForMonth } from "../src/d1-repository.js";

var repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
var appJsCode = readFileSync(join(repoRoot, "owner-admin/js/app.js"), "utf8");

var TENANT = "tenant-dto-contract";
var LOCATION = "location-dto-contract";
var STAFF = "staff-dto-contract";
var API = "https://example.com";
var OWNER_TOKEN = "token-owner";
var TOKEN_SUBS = {};
TOKEN_SUBS[OWNER_TOKEN] = "U-owner-1";

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

function bookingRow(overrides) {
  return Object.assign({
    id: "bk-confirmed",
    booking_no: "BK-001",
    start_at: "2026-07-20T02:00:00.000Z",
    end_at: "2026-07-20T03:00:00.000Z",
    status: "confirmed",
    cancellation_reason_code: null,
    cancellation_note: null,
    cancelled_at: null,
    created_at: "2026-07-19T01:00:00.000Z",
    display_name: "測試客",
    mobile: "0912345678",
    birthday: "1990-01-01",
    line_user_id: "U-customer-secret",
    service_id: "svc-1",
    service_name_snapshot: "霧眉"
  }, overrides || {});
}

function makeFakeDb(rows) {
  return {
    calls: [],
    prepare: function (sql) {
      return {
        bind: function () {
          var binds = Array.prototype.slice.call(arguments);
          return {
            all: async function () {
              return { results: rows || [] };
            },
            first: async function () {
              return null;
            }
          };
        }
      };
    },
    batch: async function () { return []; }
  };
}

function makeEnv(db) {
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

function jsonRequest(path, token) {
  return new Request(API + path, {
    method: "GET",
    headers: { Authorization: "Bearer " + token }
  });
}

function makeClassList() {
  var set = new Set();
  return {
    add: function (c) { set.add(c); },
    remove: function (c) { set.delete(c); },
    toggle: function (c, force) {
      var on = force === undefined ? !set.has(c) : Boolean(force);
      if (on) set.add(c); else set.delete(c);
      return on;
    },
    contains: function (c) { return set.has(c); }
  };
}

function queryAttrButtons(el, selector) {
  var match = /^\[([a-z-]+)\]$/.exec(selector);
  if (!match) return [];
  var attr = match[1];
  var cacheKey = selector + "\u0000" + el.innerHTML;
  if (el._qsaCache && el._qsaCache.key === cacheKey) {
    return el._qsaCache.list;
  }
  var list = [];
  var tagRe = /<button\b[^>]*>/g;
  var tagMatch;
  while ((tagMatch = tagRe.exec(el.innerHTML)) !== null) {
    var tag = tagMatch[0];
    var attrMatch = new RegExp(attr + '="([^"]*)"').exec(tag);
    if (!attrMatch) continue;
    (function (tagHtml) {
      var btn = {
        disabled: false,
        _listeners: {},
        addEventListener: function (type, fn) {
          if (!btn._listeners[type]) btn._listeners[type] = [];
          btn._listeners[type].push(fn);
        },
        fire: function (type, event) {
          (btn._listeners[type] || []).forEach(function (fn) { fn(event || {}); });
        },
        getAttribute: function (name) {
          var m = new RegExp(name + '="([^"]*)"').exec(tagHtml);
          return m ? m[1] : null;
        }
      };
      list.push(btn);
    })(tagMatch[0]);
  }
  el._qsaCache = { key: cacheKey, list: list };
  return list;
}

function makeElement(id) {
  return {
    id: id,
    value: "",
    textContent: "",
    innerHTML: "",
    hidden: false,
    disabled: false,
    _listeners: {},
    addEventListener: function (type, fn) {
      if (!this._listeners[type]) this._listeners[type] = [];
      this._listeners[type].push(fn);
    },
    fire: function (type, event) {
      (this._listeners[type] || []).forEach(function (fn) { fn(event || {}); });
    },
    querySelectorAll: function (selector) {
      return queryAttrButtons(this, selector);
    },
    classList: makeClassList(),
    style: { display: "" }
  };
}

function makeFakeDom() {
  var elements = {};
  return {
    elements: elements,
    document: {
      addEventListener: function () {},
      getElementById: function (id) {
        if (!elements[id]) elements[id] = makeElement(id);
        return elements[id];
      },
      querySelectorAll: function () { return []; },
      documentElement: makeElement("__root__")
    }
  };
}

async function tick(times) {
  for (var i = 0; i < (times || 1); i++) {
    await new Promise(function (resolve) { setTimeout(resolve, 0); });
  }
}

function taipeiDateKey(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date || new Date());
}

function taipeiMonthKey(date) {
  return taipeiDateKey(date).slice(0, 7);
}

function bookingRowForToday(overrides) {
  var dateKey = taipeiDateKey();
  return bookingRow(Object.assign({
    start_at: dateKey + "T02:00:00.000Z",
    end_at: dateKey + "T03:00:00.000Z"
  }, overrides || {}));
}

async function buildRepositoryMonthResult(rows) {
  var month = taipeiMonthKey();
  var db = makeFakeDb(rows);
  return getOwnerBookingsForMonth(makeEnv(db), month);
}

async function bootOwnerListFromRepositoryMonth(monthResult) {
  var dom = makeFakeDom();
  var api = {
    isConfigured: function () { return true; },
    getSettings: async function () { return {}; },
    getBookingsForMonth: async function () { return monthResult; },
    getServices: async function () { return []; },
    getSlots: async function () { return []; },
    cancelBooking: async function () { return { ok: true }; },
    transitionBookingStatus: async function () { return { ok: true }; }
  };
  var fakeWindow = {
    beautyUser: { userId: "U-owner-1" },
    beautyLiffReady: Promise.resolve(),
    scrollTo: function () {},
    ownerApi: api
  };
  new Function("window", "document", "confirm", appJsCode)(
    fakeWindow, dom.document, function () { return true; }
  );
  await tick(8);
  return dom.elements;
}

test("getOwnerBookingsForMonth：confirmed DTO 含 internalStatus=confirmed", async function () {
  var result = await buildRepositoryMonthResult([
    bookingRowForToday({ id: "bk-confirmed", status: "confirmed" })
  ]);
  var dayKey = taipeiDateKey();
  var day = result.days[dayKey];
  assert.ok(day, "應依台北日期分組：" + dayKey);
  assert.equal(day.bookings[0].internalStatus, "confirmed");
  assert.equal(day.bookings[0].status, "已確認");
  assert.ok(!Object.prototype.hasOwnProperty.call(day.bookings[0], "userId"));
  assert.ok(!Object.prototype.hasOwnProperty.call(day.bookings[0], "publicStatus"));
});

test("GET /api/owner/bookings/month route 回傳 repository DTO 的 internalStatus", async function () {
  var month = taipeiMonthKey();
  var dayKey = taipeiDateKey();
  var db = makeFakeDb([
    bookingRowForToday({ id: "bk-route", status: "confirmed" })
  ]);
  var response = await worker.fetch(
    jsonRequest("/api/owner/bookings/month?month=" + encodeURIComponent(month), OWNER_TOKEN),
    makeEnv(db)
  );
  assert.equal(response.status, 200);
  var body = await response.json();
  assert.equal(body.days[dayKey].bookings[0].internalStatus, "confirmed");
});

test("repository confirmed DTO 餵入 Owner UI 產生 checked_in 按鈕", async function () {
  var monthResult = await buildRepositoryMonthResult([
    bookingRowForToday({ id: "bk-confirmed", status: "confirmed" })
  ]);
  var els = await bootOwnerListFromRepositoryMonth(monthResult);
  var html = els["today-list"].innerHTML;
  assert.ok(html.includes('data-transition-to="checked_in"'), "confirmed 應顯示報到");
  assert.ok(!html.includes("U-customer-secret"), "owner 月曆 DTO 不得洩漏 LINE userId");
});

test("repository checked_in DTO 餵入 Owner UI 產生 completed 按鈕", async function () {
  var monthResult = await buildRepositoryMonthResult([
    bookingRowForToday({ id: "bk-checked", status: "checked_in" })
  ]);
  var els = await bootOwnerListFromRepositoryMonth(monthResult);
  var html = els["today-list"].innerHTML;
  assert.ok(html.includes('data-transition-to="completed"'), "checked_in 應顯示完成");
});

test("repository 取消 DTO 餵入 Owner UI 不產生 transition 按鈕", async function () {
  var monthResult = await buildRepositoryMonthResult([
    bookingRowForToday({
      id: "bk-cancelled",
      status: "cancelled_by_customer",
      cancelled_at: "2026-07-19T10:00:00.000Z",
      cancellation_note: "客人改期"
    })
  ]);
  var els = await bootOwnerListFromRepositoryMonth(monthResult);
  var html = els["today-list"].innerHTML;
  assert.ok(!html.includes("data-transition-to="), "已取消卡片不得有 transition");
  assert.ok(!html.includes("btn-cancel-booking"), "已取消卡片不得有取消按鈕");
});
