/**
 * Owner 改期 UI／API client 測試（30 分 select＋slots 重新確認）
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

var repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
var apiJsCode = readFileSync(join(repoRoot, "owner-admin/js/api.js"), "utf8");
var appJsCode = readFileSync(join(repoRoot, "owner-admin/js/app.js"), "utf8");
var cssCode = readFileSync(join(repoRoot, "owner-admin/css/style.css"), "utf8");
var htmlCode = readFileSync(join(repoRoot, "owner-admin/index.html"), "utf8");

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
      list.push(btn);
    })(tag, attrMatch[1]);
  }
  el._qsaCacheMap[selector] = { key: cacheKey, list: list };
  return list;
}

function makeElement(id) {
  var childNodes = [];
  var el = {
    id: id,
    value: "",
    textContent: "",
    innerHTML: "",
    className: "",
    hidden: false,
    disabled: false,
    _listeners: {},
    childNodes: childNodes,
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
    appendChild: function (child) {
      childNodes.push(child);
      return child;
    },
    removeChild: function (child) {
      var i = childNodes.indexOf(child);
      if (i >= 0) childNodes.splice(i, 1);
      return child;
    },
    classList: makeClassList(),
    style: { display: "" }
  };
  Object.defineProperty(el, "firstChild", {
    get: function () { return childNodes[0] || null; }
  });
  return el;
}

function makeFakeDom() {
  var elements = {};
  var document = {
    addEventListener: function () {},
    createElement: function (tag) {
      return makeElement("__" + tag);
    },
    getElementById: function (id) {
      if (!elements[id]) {
        elements[id] = makeElement(id);
        if (id === "owner-reschedule-modal" || id === "owner-cancel-modal") {
          elements[id].classList.add("hidden");
        }
        if (id === "owner-reschedule-confirm" || id === "owner-reschedule-time") {
          elements[id].disabled = true;
        }
      }
      return elements[id];
    },
    querySelectorAll: function () { return []; },
    documentElement: makeElement("__root__")
  };
  return { elements: elements, document: document };
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
      json: async function () { return { ok: true, slots: ["10:00", "10:30"] }; }
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
    getRescheduleSlots: [],
    getBookingsForMonth: [],
    confirmCount: 0,
    lastConfirmMessage: ""
  };
  var api = {
    isConfigured: function () { return true; },
    getSettings: async function () { return {}; },
    getBookingsForMonth: async function (month) {
      spy.getBookingsForMonth.push(month);
      var days = {};
      days[keys.dateKey] = {
        confirmedCount: 1,
        bookings: [{
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
          id: "bk-noshow",
          time: "15:00",
          status: "未到",
          internalStatus: "no_show",
          statusLabel: "未到",
          serviceName: "霧眉",
          customerName: "客人己",
          date: keys.dateKey
        }]
      };
      return { month: month, days: days };
    },
    getServices: async function () { return []; },
    getSlots: async function () { return []; },
    cancelBooking: async function () { return { ok: true }; },
    transitionBookingStatus: async function () { return { ok: true }; },
    getRescheduleSlots: async function (bookingId, date) {
      spy.getRescheduleSlots.push({ bookingId: bookingId, date: date });
      return {
        ok: true,
        bookingId: bookingId,
        date: date,
        durationMinutes: 60,
        stepMinutes: 30,
        slots: ["10:00", "10:30", "11:00"],
        bookable: true,
        reason: null
      };
    },
    rescheduleBooking: async function (bookingId, date, time) {
      spy.rescheduleBooking.push({ bookingId: bookingId, date: date, time: time });
      return { ok: true, newBookingId: "bk-new", date: date, time: time };
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

  return { els: dom.elements, spy: spy, keys: keys, document: dom.document };
}

function openReschedule(app) {
  app.els["today-list"].querySelectorAll("[data-reschedule-id]")[0].fire("click");
}

test("api client：getRescheduleSlots 使用 GET 且 encode 參數", async function () {
  var ctx = makeApiClient();
  await ctx.api.getRescheduleSlots("bk/特殊", "2099-08-03");
  assert.equal(
    ctx.calls[0].url,
    "https://api.example.test/api/owner/bookings/" +
    encodeURIComponent("bk/特殊") +
    "/reschedule-slots?date=" + encodeURIComponent("2099-08-03")
  );
  assert.equal(ctx.calls[0].options.method || "GET", "GET");
  assert.ok(!/"staffId"|"tenantId"|"userId"|"serviceId"|"now"/.test(
    JSON.stringify(ctx.calls[0])
  ));
});

test("api client：rescheduleBooking body 仍僅 date／time", async function () {
  var ctx = makeApiClient();
  await ctx.api.rescheduleBooking("bk-1", "2099-08-15", "14:00");
  assert.deepEqual(JSON.parse(ctx.calls[0].options.body), {
    date: "2099-08-15",
    time: "14:00"
  });
});

test("CSS：modal／input／select 有防溢出規則", function () {
  assert.ok(/\.modal-card\s*\{[^}]*min-width:\s*0/s.test(cssCode));
  assert.ok(/\.modal-card\s*\{[^}]*overflow-x:\s*hidden/s.test(cssCode));
  assert.ok(/\.modal-card input[\s\S]*?min-width:\s*0/.test(cssCode));
  assert.ok(/\.modal-card select[\s\S]*?max-width:\s*100%/.test(cssCode));
  assert.ok(/\.modal-card (input|select|textarea)[\s\S]*?box-sizing:\s*border-box/.test(cssCode));
  assert.ok(/\.form-group\s*\{[^}]*min-width:\s*0/s.test(cssCode));
});

test("HTML：時間欄為 select，無 time input step", function () {
  assert.ok(htmlCode.includes('<select id="owner-reschedule-time"'));
  assert.ok(!htmlCode.includes('id="owner-reschedule-time" step='));
  assert.ok(!htmlCode.includes('type="time" id="owner-reschedule-time"'));
  assert.ok(htmlCode.includes("請先選擇日期"));
  assert.ok(htmlCode.includes("v=20260721002"));
});

test("開啟時 time／confirm disabled；僅 confirmed 有改期", async function () {
  var app = await bootBookingApp();
  var html = app.els["today-list"].innerHTML;
  assert.ok(html.includes('data-reschedule-id="bk-confirmed"'));
  assert.ok(!html.includes('data-reschedule-id="bk-pending"'));
  assert.ok(!html.includes('data-reschedule-id="bk-noshow"'));

  openReschedule(app);
  await tick(1);
  assert.ok(!app.els["owner-reschedule-modal"].classList.contains("hidden"));
  assert.equal(app.els["owner-reschedule-time"].disabled, true);
  assert.equal(app.els["owner-reschedule-confirm"].disabled, true);
  assert.equal(app.els["owner-reschedule-date"].value, "");
});

test("日期 change 呼叫 slots API；僅渲染 00／30", async function () {
  var app = await bootBookingApp();
  openReschedule(app);
  await tick(1);
  var date = futureTaipeiDate(5);
  app.els["owner-reschedule-date"].value = date;
  app.els["owner-reschedule-date"].fire("change");
  await tick(4);

  assert.equal(app.spy.getRescheduleSlots.length, 1);
  assert.equal(app.spy.getRescheduleSlots[0].bookingId, "bk-confirmed");
  assert.equal(app.spy.getRescheduleSlots[0].date, date);
  assert.equal(app.els["owner-reschedule-time"].disabled, false);
  var options = app.els["owner-reschedule-time"].childNodes.slice(1);
  assert.equal(options.length, 3);
  options.forEach(function (opt) {
    assert.match(opt.value, /^([01]\d|2[0-3]):(00|30)$/);
    assert.equal(opt.textContent, opt.value);
  });
});

test("無 slots 時提示並禁止提交", async function () {
  var app = await bootBookingApp({
    getRescheduleSlots: async function (bookingId, date) {
      app.spy.getRescheduleSlots.push({ bookingId: bookingId, date: date });
      return { ok: true, slots: [], bookable: false, reason: "full" };
    }
  });
  openReschedule(app);
  await tick(1);
  app.els["owner-reschedule-date"].value = futureTaipeiDate(6);
  app.els["owner-reschedule-date"].fire("change");
  await tick(4);
  assert.equal(app.els["owner-reschedule-time"].disabled, true);
  assert.equal(app.els["owner-reschedule-confirm"].disabled, true);
  assert.equal(app.els["owner-reschedule-time"].firstChild.textContent, "此日期沒有可改期時段");
});

test("快速切換日期：舊回應不覆蓋新結果", async function () {
  var resolvers = [];
  var app = await bootBookingApp({
    getRescheduleSlots: function (bookingId, date) {
      app.spy.getRescheduleSlots.push({ bookingId: bookingId, date: date });
      return new Promise(function (resolve) {
        resolvers.push({ date: date, resolve: resolve });
      });
    }
  });
  openReschedule(app);
  await tick(1);
  var d1 = futureTaipeiDate(7);
  var d2 = futureTaipeiDate(8);
  app.els["owner-reschedule-date"].value = d1;
  app.els["owner-reschedule-date"].fire("change");
  await tick(1);
  app.els["owner-reschedule-date"].value = d2;
  app.els["owner-reschedule-date"].fire("change");
  await tick(1);

  assert.equal(resolvers.length, 2);
  resolvers[0].resolve({ ok: true, slots: ["09:00"], bookable: true });
  await tick(2);
  assert.ok(
    !app.els["owner-reschedule-time"].childNodes.some(function (n) {
      return n.value === "09:00";
    }),
    "舊回應不得渲染"
  );

  resolvers[1].resolve({ ok: true, slots: ["15:00", "15:30"], bookable: true });
  await tick(2);
  var values = app.els["owner-reschedule-time"].childNodes.slice(1).map(function (n) {
    return n.value;
  });
  assert.deepEqual(values, ["15:00", "15:30"]);
});

test("偽造非 slots 時間不可提交；提交前重新查詢", async function () {
  var app = await bootBookingApp();
  openReschedule(app);
  await tick(1);
  var date = futureTaipeiDate(9);
  app.els["owner-reschedule-date"].value = date;
  app.els["owner-reschedule-date"].fire("change");
  await tick(4);

  app.els["owner-reschedule-time"].value = "10:15";
  app.els["owner-reschedule-time"].fire("change");
  assert.equal(app.els["owner-reschedule-confirm"].disabled, true);
  app.els["owner-reschedule-confirm"].fire("click");
  await tick(2);
  assert.equal(app.spy.rescheduleBooking.length, 0);

  app.els["owner-reschedule-time"].value = "10:00";
  app.els["owner-reschedule-time"].fire("change");
  assert.equal(app.els["owner-reschedule-confirm"].disabled, false);

  var slotsBeforeSubmit = app.spy.getRescheduleSlots.length;
  app.els["owner-reschedule-confirm"].fire("click");
  await tick(6);
  assert.ok(app.spy.getRescheduleSlots.length > slotsBeforeSubmit, "提交前應再查一次");
  assert.equal(app.spy.rescheduleBooking.length, 1);
  assert.deepEqual(app.spy.rescheduleBooking[0], {
    bookingId: "bk-confirmed",
    date: date,
    time: "10:00"
  });
});

test("時段被搶走時不呼叫改期 API", async function () {
  var call = 0;
  var app = await bootBookingApp({
    getRescheduleSlots: async function (bookingId, date) {
      app.spy.getRescheduleSlots.push({ bookingId: bookingId, date: date });
      call += 1;
      if (call === 1) {
        return { ok: true, slots: ["10:00", "10:30"], bookable: true };
      }
      return { ok: true, slots: ["10:30"], bookable: true };
    }
  });
  openReschedule(app);
  await tick(1);
  app.els["owner-reschedule-date"].value = futureTaipeiDate(10);
  app.els["owner-reschedule-date"].fire("change");
  await tick(4);
  app.els["owner-reschedule-time"].value = "10:00";
  app.els["owner-reschedule-time"].fire("change");
  app.els["owner-reschedule-confirm"].fire("click");
  await tick(6);
  assert.equal(app.spy.rescheduleBooking.length, 0);
  assert.match(app.els.status.textContent, /剛被預約/);
  assert.equal(app.spy.confirmCount, 0);
});

test("loading 防重複；成功後清除；關閉後完整清除", async function () {
  var resolveReschedule;
  var app = await bootBookingApp({
    rescheduleBooking: function (bookingId, date, time) {
      app.spy.rescheduleBooking.push({ bookingId: bookingId, date: date, time: time });
      return new Promise(function (resolve) { resolveReschedule = resolve; });
    }
  });
  openReschedule(app);
  await tick(1);
  var date = futureTaipeiDate(11);
  app.els["owner-reschedule-date"].value = date;
  app.els["owner-reschedule-date"].fire("change");
  await tick(4);
  app.els["owner-reschedule-time"].value = "11:00";
  app.els["owner-reschedule-time"].fire("change");
  app.els["owner-reschedule-confirm"].fire("click");
  await tick(3);
  assert.equal(app.els["owner-reschedule-confirm"].disabled, true);
  app.els["owner-reschedule-confirm"].fire("click");
  await tick(1);
  assert.equal(app.spy.rescheduleBooking.length, 1);

  resolveReschedule({ ok: true });
  await tick(8);
  assert.ok(app.els["owner-reschedule-modal"].classList.contains("hidden"));
  assert.equal(app.els.status.textContent, "改期成功");
  assert.equal(app.els["owner-reschedule-date"].value, "");
  assert.equal(app.els["owner-reschedule-time"].disabled, true);

  openReschedule(app);
  await tick(1);
  app.els["owner-reschedule-dismiss"].fire("click");
  await tick(1);
  assert.equal(app.els["owner-reschedule-summary"].textContent, "");
  app.els["owner-reschedule-confirm"].fire("click");
  await tick(2);
  assert.equal(app.spy.rescheduleBooking.length, 1);
});

test("app.js 改期不寫 storage／不 console slots", function () {
  assert.ok(!appJsCode.includes("localStorage.setItem"));
  assert.ok(!appJsCode.includes("sessionStorage.setItem"));
  assert.ok(appJsCode.includes("slotsRequestSeq"));
  assert.ok(appJsCode.includes("getRescheduleSlots"));
  assert.ok(!/console\.(log|debug|info|warn|error)\s*\(\s*.*slots/i.test(appJsCode));
});

test("owner-admin 與 docs/owner 靜態副本完全一致", function () {
  ["index.html", "js/api.js", "js/app.js", "css/style.css"].forEach(function (file) {
    var ownerAdmin = readFileSync(join(repoRoot, "owner-admin", file), "utf8");
    var docsOwner = readFileSync(join(repoRoot, "docs/owner", file), "utf8");
    assert.equal(docsOwner, ownerAdmin, "docs/owner/" + file + " 必須與 owner-admin 一致");
  });
});
