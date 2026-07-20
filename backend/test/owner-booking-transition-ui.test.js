/**
 * owner-admin 預約狀態操作 UI／API client 測試
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

var repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
var apiJsCode = readFileSync(join(repoRoot, "owner-admin/js/api.js"), "utf8");
var appJsCode = readFileSync(join(repoRoot, "owner-admin/js/app.js"), "utf8");

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
    (function (tagHtml, primaryValue) {
      var btn = makeElement("__attr_btn__");
      btn.getAttribute = function (name) {
        var m = new RegExp(name + '="([^"]*)"').exec(tagHtml);
        return m ? m[1] : null;
      };
      if (primaryValue != null) {
        btn._primaryAttr = attr;
        btn._primaryValue = primaryValue;
      }
      list.push(btn);
    })(tag, attrMatch[1]);
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
    className: "",
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
    setAttribute: function () {},
    getAttribute: function () { return null; },
    querySelector: function () { return null; },
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

function makeApiClient() {
  var calls = [];
  var fakeWindow = {
    BEAUTY_CONFIG: { API_BASE_URL: "https://api.example.test" },
    getBeautyIdToken: function () { return "token-test"; }
  };
  var fakeFetch = async function (url, options) {
    calls.push({ url: url, options: options || {} });
    return {
      ok: true,
      status: 200,
      json: async function () { return { ok: true }; }
    };
  };
  new Function("window", "fetch", apiJsCode)(fakeWindow, fakeFetch);
  return { api: fakeWindow.ownerApi, calls: calls };
}

var sampleBookings = [{
  id: "bk-confirmed",
  time: "10:00",
  status: "已確認",
  internalStatus: "confirmed",
  statusLabel: "已確認",
  serviceName: "霧眉",
  customerName: "客人甲",
  date: "2026-08-01"
}, {
  id: "bk-pending",
  time: "11:00",
  status: "已確認",
  internalStatus: "pending",
  statusLabel: "已確認",
  serviceName: "霧眉",
  customerName: "客人乙",
  date: "2026-08-01"
}, {
  id: "bk-checked",
  time: "12:00",
  status: "已確認",
  internalStatus: "checked_in",
  statusLabel: "已確認",
  serviceName: "霧眉",
  customerName: "客人丙",
  date: "2026-08-01"
}];

async function bootBookingApp(overrides) {
  var dom = makeFakeDom();
  var spy = {
    transitionBookingStatus: [],
    getBookingsForMonth: [],
    confirmCount: 0
  };
  var today = new Date();
  var monthKey = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0");
  var dateKey = monthKey + "-" + String(today.getDate()).padStart(2, "0");
  var bookingsForToday = sampleBookings.map(function (booking, index) {
    return Object.assign({}, booking, {
      date: dateKey,
      time: String(10 + index) + ":00"
    });
  });
  var api = {
    isConfigured: function () { return true; },
    getSettings: async function () { return {}; },
    getBookingsForMonth: async function (month) {
      spy.getBookingsForMonth.push(month);
      var days = {};
      days[dateKey] = {
        confirmedCount: bookingsForToday.length,
        bookings: bookingsForToday.slice()
      };
      return { month: month, days: days };
    },
    getServices: async function () { return []; },
    getSlots: async function () { return []; },
    cancelBooking: async function () { return { ok: true }; },
    transitionBookingStatus: async function (bookingId, toStatus) {
      spy.transitionBookingStatus.push({ bookingId: bookingId, toStatus: toStatus });
      return { ok: true, fromStatus: "confirmed", toStatus: toStatus };
    }
  };
  Object.assign(api, overrides || {});

  var fakeWindow = {
    beautyUser: { userId: "U-owner" },
    beautyLiffReady: Promise.resolve(),
    scrollTo: function () {},
    ownerApi: api
  };
  var fakeConfirm = function () {
    spy.confirmCount += 1;
    return true;
  };

  new Function("window", "document", "confirm", appJsCode)(
    fakeWindow, dom.document, fakeConfirm
  );
  await tick(6);

  return { els: dom.elements, spy: spy };
}

test("api client：transitionBookingStatus 使用 PATCH /status 且 body 只含白名單欄位", async function () {
  var ctx = makeApiClient();
  await ctx.api.transitionBookingStatus("bk-1", "checked_in", {
    reasonCode: "walk_in",
    note: "現場報到"
  });
  assert.equal(
    ctx.calls[0].url,
    "https://api.example.test/api/owner/bookings/bk-1/status"
  );
  assert.equal(ctx.calls[0].options.method, "PATCH");
  assert.deepEqual(JSON.parse(ctx.calls[0].options.body), {
    toStatus: "checked_in",
    reasonCode: "walk_in",
    note: "現場報到"
  });
  assert.ok(!apiJsCode.includes("actorType"));
  assert.ok(!apiJsCode.includes("actorId: function"));
});

test("api client：cancelBooking 路徑維持不變", async function () {
  var ctx = makeApiClient();
  await ctx.api.cancelBooking("bk-1", "客人改期");
  assert.equal(ctx.calls[0].url, "https://api.example.test/api/owner/bookings/cancel");
  assert.equal(ctx.calls[0].options.method, "POST");
});

test("預約清單：依 internalStatus 顯示允許的下一步按鈕", async function () {
  var app = await bootBookingApp();
  var html = app.els["today-list"].innerHTML;
  assert.ok(html.includes('data-transition-to="checked_in"'), "confirmed 應顯示報到");
  assert.ok(html.includes('data-transition-to="confirmed"'), "pending 應顯示升級");
  assert.ok(html.includes('data-transition-to="completed"'), "checked_in 應顯示完成");
  assert.ok(html.includes("取消預約"), "取消按鈕仍保留");
});

test("預約清單：完成操作需 confirm、成功後重新載入、loading 防重複", async function () {
  var resolveTransition;
  var app = await bootBookingApp({
    transitionBookingStatus: function (bookingId, toStatus) {
      app.spy.transitionBookingStatus.push({ bookingId: bookingId, toStatus: toStatus });
      return new Promise(function (resolve) {
        resolveTransition = resolve;
      });
    }
  });

  var completeBtn = app.els["today-list"]
    .querySelectorAll("[data-transition-id]")
    .find(function (btn) {
      return btn.getAttribute("data-transition-to") === "completed";
    });
  assert.ok(completeBtn, "應找到完成按鈕");

  completeBtn.fire("click");
  await tick(2);
  assert.equal(app.spy.confirmCount, 1, "完成前需 confirm");
  assert.ok(
    app.els["today-list"].innerHTML.includes(" disabled"),
    "處理中按鈕應停用"
  );

  completeBtn.fire("click");
  await tick(1);
  assert.equal(app.spy.transitionBookingStatus.length, 1, "loading 期間不得重複送出");

  resolveTransition({ ok: true, toStatus: "completed" });
  await tick(6);
  assert.ok(app.spy.getBookingsForMonth.length >= 2, "成功後應重新載入月曆");
});

test("預約清單：transition 錯誤顯示訊息且不洩漏內部細節", async function () {
  var app = await bootBookingApp({
    transitionBookingStatus: async function () {
      var error = new Error("不允許的預約狀態轉換");
      error.status = 400;
      throw error;
    }
  });

  var checkInBtn = app.els["today-list"]
    .querySelectorAll("[data-transition-id]")
    .find(function (btn) {
      return btn.getAttribute("data-transition-to") === "checked_in";
    });
  assert.ok(checkInBtn, "應找到報到按鈕");
  checkInBtn.fire("click");
  await tick(6);
  assert.equal(app.els.status.textContent, "不允許的預約狀態轉換");
  assert.ok(!app.els.status.textContent.includes("U-"), "錯誤訊息不得含 LINE userId");
});
