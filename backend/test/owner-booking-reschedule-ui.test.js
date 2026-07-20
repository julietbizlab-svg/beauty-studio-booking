/**
 * Owner 改期 UI／API client 測試
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
  if (!el._qsaCacheMap) el._qsaCacheMap = {};
  var cacheKey = selector + "\u0000" + el.innerHTML;
  if (el._qsaCacheMap[selector] && el._qsaCacheMap[selector].key === cacheKey) {
    return el._qsaCacheMap[selector].list;
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
      btn.disabled = /\sdisabled(?:\s|>)/.test(tagHtml);
      if (primaryValue != null) {
        btn._primaryAttr = attr;
        btn._primaryValue = primaryValue;
      }
      list.push(btn);
    })(tag, attrMatch[1]);
  }
  el._qsaCacheMap[selector] = { key: cacheKey, list: list };
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
        if (!elements[id]) {
          elements[id] = makeElement(id);
          if (id === "owner-reschedule-modal" || id === "owner-cancel-modal") {
            elements[id].classList.add("hidden");
          }
        }
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

function todayKeys() {
  var today = new Date();
  var monthKey = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0");
  var dateKey = monthKey + "-" + String(today.getDate()).padStart(2, "0");
  return { monthKey: monthKey, dateKey: dateKey };
}

function futureTaipeiDate(daysAhead) {
  var target = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(target);
}

async function bootBookingApp(overrides, confirmImpl) {
  var dom = makeFakeDom();
  var keys = todayKeys();
  var spy = {
    rescheduleBooking: [],
    getBookingsForMonth: [],
    confirmCount: 0,
    lastConfirmMessage: ""
  };
  var bookingsForToday = [{
    id: "bk-confirmed",
    time: "10:00",
    status: "已確認",
    internalStatus: "confirmed",
    statusLabel: "已確認",
    serviceName: "霧眉",
    customerName: "客人甲",
    date: keys.dateKey
  }, {
    id: "bk-pending",
    time: "11:00",
    status: "已確認",
    internalStatus: "pending",
    statusLabel: "已確認",
    serviceName: "霧眉",
    customerName: "客人乙",
    date: keys.dateKey
  }, {
    id: "bk-checked",
    time: "12:00",
    status: "已確認",
    internalStatus: "checked_in",
    statusLabel: "已確認",
    serviceName: "霧眉",
    customerName: "客人丙",
    date: keys.dateKey
  }, {
    id: "bk-done",
    time: "13:00",
    status: "已確認",
    internalStatus: "completed",
    statusLabel: "已完成",
    serviceName: "霧眉",
    customerName: "客人丁",
    date: keys.dateKey
  }, {
    id: "bk-cancel",
    time: "14:00",
    status: "已取消",
    internalStatus: "cancelled_by_store",
    statusLabel: "已取消",
    serviceName: "霧眉",
    customerName: "客人戊",
    date: keys.dateKey
  }, {
    id: "bk-noshow",
    time: "15:00",
    status: "未到",
    internalStatus: "no_show",
    statusLabel: "未到",
    serviceName: "霧眉",
    customerName: "客人己",
    date: keys.dateKey
  }];

  var api = {
    isConfigured: function () { return true; },
    getSettings: async function () { return {}; },
    getBookingsForMonth: async function (month) {
      spy.getBookingsForMonth.push(month);
      var days = {};
      days[keys.dateKey] = {
        confirmedCount: 1,
        bookings: bookingsForToday.slice()
      };
      return { month: month, days: days };
    },
    getServices: async function () { return []; },
    getSlots: async function () { return []; },
    cancelBooking: async function () { return { ok: true }; },
    transitionBookingStatus: async function () { return { ok: true }; },
    rescheduleBooking: async function (bookingId, date, time) {
      spy.rescheduleBooking.push({ bookingId: bookingId, date: date, time: time });
      return {
        ok: true,
        oldBookingId: bookingId,
        newBookingId: "bk-new",
        date: date,
        time: time
      };
    }
  };
  Object.assign(api, overrides || {});

  var fakeWindow = {
    beautyUser: { userId: "U-owner" },
    beautyLiffReady: Promise.resolve(),
    scrollTo: function () {},
    ownerApi: api
  };
  var fakeConfirm = confirmImpl || function (message) {
    spy.confirmCount += 1;
    spy.lastConfirmMessage = String(message || "");
    return true;
  };

  new Function("window", "document", "confirm", appJsCode)(
    fakeWindow, dom.document, fakeConfirm
  );
  await tick(6);

  return { els: dom.elements, spy: spy, keys: keys, bookings: bookingsForToday };
}

test("api client：rescheduleBooking 使用 POST /reschedule 且 body 僅 date／time", async function () {
  var ctx = makeApiClient();
  await ctx.api.rescheduleBooking("bk-1", "2099-08-15", "14:00");
  assert.equal(
    ctx.calls[0].url,
    "https://api.example.test/api/owner/bookings/bk-1/reschedule"
  );
  assert.equal(ctx.calls[0].options.method, "POST");
  assert.deepEqual(JSON.parse(ctx.calls[0].options.body), {
    date: "2099-08-15",
    time: "14:00"
  });
  var bodyKeys = Object.keys(JSON.parse(ctx.calls[0].options.body)).sort();
  assert.deepEqual(bodyKeys, ["date", "time"]);
  assert.ok(!/"actor"|"actorId"|"staffId"|"tenantId"|"userId"|"status"|"now"|"reasonCode"/.test(
    ctx.calls[0].options.body
  ));
});

test("api client：bookingId 會 encodeURIComponent", async function () {
  var ctx = makeApiClient();
  await ctx.api.rescheduleBooking("bk/特殊", "2099-08-15", "14:00");
  assert.ok(ctx.calls[0].url.includes(encodeURIComponent("bk/特殊")));
});

test("預約清單：僅 confirmed 顯示改期；其他狀態不顯示", async function () {
  var app = await bootBookingApp();
  var html = app.els["today-list"].innerHTML;
  assert.ok(html.includes('data-reschedule-id="bk-confirmed"'), "confirmed 應顯示改期");
  assert.ok(html.includes(">改期</button>"));
  assert.ok(!html.includes('data-reschedule-id="bk-pending"'));
  assert.ok(!html.includes('data-reschedule-id="bk-checked"'));
  assert.ok(!html.includes('data-reschedule-id="bk-done"'));
  assert.ok(!html.includes('data-reschedule-id="bk-cancel"'));
  assert.ok(!html.includes('data-reschedule-id="bk-noshow"'));
  assert.ok(html.includes('data-transition-to="checked_in"'), "報到仍保留");
  assert.ok(html.includes('data-transition-to="no_show"'), "未到仍保留");
  assert.ok(html.includes("取消預約"), "取消仍保留");
  assert.ok(!html.includes("data-customer-id"), "不得把 customerId 放入改期 DOM");
  assert.ok(!html.includes("data-staff-id"));
});

test("no_show 終態仍無取消／transition／改期按鈕", async function () {
  var keys = todayKeys();
  var app = await bootBookingApp({
    getBookingsForMonth: async function (month) {
      var days = {};
      days[keys.dateKey] = {
        confirmedCount: 0,
        bookings: [{
          id: "bk-only-noshow",
          time: "10:00",
          status: "未到",
          internalStatus: "no_show",
          statusLabel: "未到",
          serviceName: "霧眉",
          customerName: "未到客",
          date: keys.dateKey
        }]
      };
      return { month: month, days: days };
    }
  });
  var html = app.els["today-list"].innerHTML;
  assert.ok(!html.includes("data-cancel-id"));
  assert.ok(!html.includes("data-transition-id"));
  assert.ok(!html.includes("data-reschedule-id"));
  assert.ok(!html.includes("取消預約"));
  assert.ok(!html.includes(">改期<"));
});

test("點擊改期：顯示原預約摘要、新日期／時間空白", async function () {
  var app = await bootBookingApp();
  var btn = app.els["today-list"].querySelectorAll("[data-reschedule-id]")[0];
  assert.ok(btn);
  btn.fire("click");
  await tick(2);

  assert.ok(!app.els["owner-reschedule-modal"].classList.contains("hidden"));
  assert.equal(
    app.els["owner-reschedule-summary"].textContent,
    "客人甲｜霧眉｜" + app.keys.dateKey.replace(/-/g, "/") + " 10:00"
  );
  assert.equal(app.els["owner-reschedule-date"].value, "");
  assert.equal(app.els["owner-reschedule-time"].value, "");
});

test("缺日期或時間不呼叫 API", async function () {
  var app = await bootBookingApp();
  app.els["today-list"].querySelectorAll("[data-reschedule-id]")[0].fire("click");
  await tick(1);

  app.els["owner-reschedule-confirm"].fire("click");
  await tick(2);
  assert.equal(app.spy.rescheduleBooking.length, 0);
  assert.match(app.els.status.textContent, /日期/);

  app.els["owner-reschedule-date"].value = futureTaipeiDate(5);
  app.els["owner-reschedule-confirm"].fire("click");
  await tick(2);
  assert.equal(app.spy.rescheduleBooking.length, 0);
  assert.match(app.els.status.textContent, /時間/);
});

test("新時間明顯在過去時前端拒絕", async function () {
  var app = await bootBookingApp();
  app.els["today-list"].querySelectorAll("[data-reschedule-id]")[0].fire("click");
  await tick(1);
  app.els["owner-reschedule-date"].value = "2020-01-15";
  app.els["owner-reschedule-time"].value = "10:00";
  app.els["owner-reschedule-confirm"].fire("click");
  await tick(2);
  assert.equal(app.spy.rescheduleBooking.length, 0);
  assert.equal(app.spy.confirmCount, 0);
  assert.match(app.els.status.textContent, /過去|已開始/);
});

test("確認取消時不呼叫 API", async function () {
  var confirmCount = 0;
  var app = await bootBookingApp(null, function () {
    confirmCount += 1;
    return false;
  });
  app.els["today-list"].querySelectorAll("[data-reschedule-id]")[0].fire("click");
  await tick(1);
  app.els["owner-reschedule-date"].value = futureTaipeiDate(5);
  app.els["owner-reschedule-time"].value = "15:00";
  app.els["owner-reschedule-confirm"].fire("click");
  await tick(2);
  assert.equal(confirmCount, 1);
  assert.equal(app.spy.rescheduleBooking.length, 0);
});

test("loading 防重複提交；成功後關閉清除並重新載入", async function () {
  var resolveReschedule;
  var app = await bootBookingApp({
    rescheduleBooking: function (bookingId, date, time) {
      app.spy.rescheduleBooking.push({ bookingId: bookingId, date: date, time: time });
      return new Promise(function (resolve) {
        resolveReschedule = resolve;
      });
    }
  });

  app.els["today-list"].querySelectorAll("[data-reschedule-id]")[0].fire("click");
  await tick(1);
  var newDate = futureTaipeiDate(7);
  app.els["owner-reschedule-date"].value = newDate;
  app.els["owner-reschedule-time"].value = "15:00";

  app.els["owner-reschedule-confirm"].fire("click");
  await tick(2);
  assert.equal(app.spy.confirmCount, 1);
  assert.ok(app.spy.lastConfirmMessage.includes("原時段"));
  assert.ok(app.spy.lastConfirmMessage.includes("新時段"));
  assert.equal(app.els["owner-reschedule-confirm"].disabled, true);
  assert.equal(app.els["owner-reschedule-dismiss"].disabled, true);

  app.els["owner-reschedule-confirm"].fire("click");
  await tick(1);
  assert.equal(app.spy.rescheduleBooking.length, 1, "loading 期間不得重複送出");

  var loadsBefore = app.spy.getBookingsForMonth.length;
  resolveReschedule({ ok: true, newBookingId: "bk-new" });
  await tick(8);

  assert.ok(app.els["owner-reschedule-modal"].classList.contains("hidden"));
  assert.equal(app.els["owner-reschedule-summary"].textContent, "");
  assert.equal(app.els["owner-reschedule-date"].value, "");
  assert.equal(app.els["owner-reschedule-time"].value, "");
  assert.equal(app.els.status.textContent, "改期成功");
  assert.ok(app.spy.getBookingsForMonth.length > loadsBefore);
});

test("失敗後保留輸入並恢復操作；錯誤不洩漏內部細節", async function () {
  var app = await bootBookingApp({
    rescheduleBooking: async function () {
      var error = new Error("此時段與現有預約重疊，或同一天已有預約，請選擇其他時間");
      error.status = 400;
      error.stack = "Error: secret stack\n at d1-repository.js";
      throw error;
    }
  });
  app.els["today-list"].querySelectorAll("[data-reschedule-id]")[0].fire("click");
  await tick(1);
  var newDate = futureTaipeiDate(8);
  app.els["owner-reschedule-date"].value = newDate;
  app.els["owner-reschedule-time"].value = "16:30";
  app.els["owner-reschedule-confirm"].fire("click");
  await tick(6);

  assert.equal(app.els["owner-reschedule-date"].value, newDate);
  assert.equal(app.els["owner-reschedule-time"].value, "16:30");
  assert.ok(!app.els["owner-reschedule-modal"].classList.contains("hidden"));
  assert.equal(app.els["owner-reschedule-confirm"].disabled, false);
  assert.equal(app.els["owner-reschedule-dismiss"].disabled, false);
  assert.match(app.els.status.textContent, /重疊|同一天/);
  assert.ok(!app.els.status.textContent.includes("stack"));
  assert.ok(!app.els.status.textContent.includes("d1-repository"));
  assert.ok(!app.els.status.textContent.includes("token"));
  assert.ok(!app.els.status.textContent.includes("STAFF_ID"));
});

test("特殊字元不造成 XSS；關閉後清除 booking reference", async function () {
  var keys = todayKeys();
  var xssName = '<img src=x onerror=alert(1)>';
  var xssService = '<script>alert(2)</script>';
  var app = await bootBookingApp({
    getBookingsForMonth: async function (month) {
      var days = {};
      days[keys.dateKey] = {
        confirmedCount: 1,
        bookings: [{
          id: "bk-xss",
          time: "10:00",
          status: "已確認",
          internalStatus: "confirmed",
          statusLabel: "已確認",
          serviceName: xssService,
          customerName: xssName,
          date: keys.dateKey
        }]
      };
      return { month: month, days: days };
    }
  });

  var html = app.els["today-list"].innerHTML;
  assert.ok(html.includes("&lt;img"), "姓名應 escape");
  assert.ok(html.includes("&lt;script&gt;"), "服務名應 escape");
  assert.ok(!html.includes("<img src=x"));
  assert.ok(!html.includes("<script>alert"));

  app.els["today-list"].querySelectorAll("[data-reschedule-id]")[0].fire("click");
  await tick(1);
  assert.equal(
    app.els["owner-reschedule-summary"].textContent,
    xssName + "｜" + xssService + "｜" + keys.dateKey.replace(/-/g, "/") + " 10:00"
  );
  assert.ok(!String(app.els["owner-reschedule-summary"].innerHTML || "").includes("<img"));

  app.els["owner-reschedule-dismiss"].fire("click");
  await tick(1);
  assert.ok(app.els["owner-reschedule-modal"].classList.contains("hidden"));
  assert.equal(app.els["owner-reschedule-summary"].textContent, "");
  assert.equal(app.els["owner-reschedule-date"].value, "");
  assert.equal(app.els["owner-reschedule-time"].value, "");

  // 關閉後再提交不得打 API（booking reference 已清）
  app.els["owner-reschedule-date"].value = futureTaipeiDate(4);
  app.els["owner-reschedule-time"].value = "11:00";
  app.els["owner-reschedule-confirm"].fire("click");
  await tick(2);
  assert.equal(app.spy.rescheduleBooking.length, 0);
});

test("app.js 改期流程不寫入 storage，也不 console 輸出 booking DTO", function () {
  assert.ok(!appJsCode.includes("localStorage.setItem"));
  assert.ok(!appJsCode.includes("sessionStorage.setItem"));
  assert.ok(!appJsCode.includes("localStorage.getItem"));
  assert.ok(!appJsCode.includes("sessionStorage.getItem"));
  assert.ok(!/console\.(log|debug|info|warn|error)\s*\(\s*.*reschedule/i.test(appJsCode));
  assert.ok(appJsCode.includes("data-reschedule-id"));
  assert.ok(appJsCode.includes('data-reschedule-id="' + "' + escapeHtml(b.id)"));
  assert.ok(!appJsCode.includes("data-staff-id"));
  assert.ok(appJsCode.includes('internalStatus === "confirmed"'));
});

test("index.html：改期 modal 與 time step=1800；cache-busting 一致", function () {
  var html = readFileSync(join(repoRoot, "owner-admin/index.html"), "utf8");
  assert.ok(html.includes('id="owner-reschedule-modal"'));
  assert.ok(html.includes('id="owner-reschedule-date"'));
  assert.ok(html.includes('id="owner-reschedule-time"'));
  assert.ok(html.includes('step="1800"'));
  assert.ok(html.includes("css/style.css?v=20260721001"));
  assert.ok(html.includes("js/api.js?v=20260721001"));
  assert.ok(html.includes("js/app.js?v=20260721001"));
});

test("owner-admin 與 docs/owner 靜態副本完全一致（改期 UI）", function () {
  ["index.html", "js/api.js", "js/app.js", "css/style.css"].forEach(function (file) {
    var ownerAdmin = readFileSync(join(repoRoot, "owner-admin", file), "utf8");
    var docsOwner = readFileSync(join(repoRoot, "docs/owner", file), "utf8");
    assert.equal(docsOwner, ownerAdmin, "docs/owner/" + file + " 必須與 owner-admin 一致");
  });
});
