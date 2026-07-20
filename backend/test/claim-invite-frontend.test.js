/**
 * LINE 認領邀請前端測試（node:test ＋ assert，零依賴）
 *
 * 以最小假 DOM 執行 owner-admin 與 customer-ui 的 app.js／api.js，驗證：
 * - owner：只有未綁 LINE 客戶可建立邀請；GET 不期待 raw token；
 *   token 只存在記憶體（不進 localStorage／sessionStorage／console／
 *   data attribute）；QR 完全本機產生（不呼叫第三方 QR 服務）；
 *   重新產生需 confirm；離開詳情清除連結
 * - customer：只在 CLAIM_ENABLED（v2 設定）啟動；確認後才呼叫 API；
 *   成功後以 replaceState 移除 URL token；失敗顯示訊息；
 *   一般預約流程不受影響
 * - 靜態副本：customer-ui ↔ docs、owner-admin ↔ docs/owner 完全一致
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

var repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
var ownerApiJs = readFileSync(join(repoRoot, "owner-admin/js/api.js"), "utf8");
var ownerAppJs = readFileSync(join(repoRoot, "owner-admin/js/app.js"), "utf8");
var customerApiJs = readFileSync(join(repoRoot, "customer-ui/js/api.js"), "utf8");
var customerAppJs = readFileSync(join(repoRoot, "customer-ui/js/app.js"), "utf8");

var CLAIM_TOKEN = "tok_" + "x".repeat(39);

// ──────────────────────── 假 DOM ────────────────────────

function makeClassList() {
  var set = new Set();
  return {
    add: function (c) { set.add(c); },
    remove: function (c) { set.delete(c); },
    toggle: function (c, force) {
      var on = force === undefined ? !set.has(c) : Boolean(force);
      if (on) { set.add(c); } else { set.delete(c); }
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
  var re = new RegExp(attr + '="([^"]*)"', "g");
  var found;
  while ((found = re.exec(el.innerHTML)) !== null) {
    (function (value) {
      var btn = makeElement("__attr_btn__");
      btn.getAttribute = function (name) {
        return name === attr ? value : null;
      };
      list.push(btn);
    })(found[1]);
  }
  el._qsaCache = { key: cacheKey, list: list };
  return list;
}

function makeElement(id) {
  var el = {
    id: id,
    value: "",
    textContent: "",
    innerHTML: "",
    className: "",
    hidden: false,
    disabled: false,
    readOnly: false,
    checked: false,
    files: [],
    width: 0,
    height: 0,
    src: "",
    style: { display: "", opacity: "", animation: "", setProperty: function () {} },
    offsetWidth: 0,
    classList: makeClassList(),
    _listeners: {},
    _attrs: {},
    addEventListener: function (type, fn) {
      if (!el._listeners[type]) el._listeners[type] = [];
      el._listeners[type].push(fn);
    },
    fire: function (type, event) {
      (el._listeners[type] || []).forEach(function (fn) { fn(event || {}); });
    },
    setAttribute: function (name, value) { el._attrs[name] = String(value); },
    getAttribute: function (name) {
      return Object.prototype.hasOwnProperty.call(el._attrs, name)
        ? el._attrs[name]
        : null;
    },
    getContext: function () {
      return {
        fillStyle: "",
        fillRect: function () {},
        clearRect: function () {}
      };
    },
    querySelector: function () { return null; },
    querySelectorAll: function (selector) {
      return queryAttrButtons(el, selector);
    }
  };
  return el;
}

function makeFakeDom() {
  var elements = {};
  var docListeners = {};
  var fakeDocument = {
    addEventListener: function (type, fn) {
      if (!docListeners[type]) docListeners[type] = [];
      docListeners[type].push(fn);
    },
    fireDocument: function (type, event) {
      (docListeners[type] || []).forEach(function (fn) { fn(event || {}); });
    },
    getElementById: function (elementId) {
      if (!elements[elementId]) {
        elements[elementId] = makeElement(elementId);
      }
      return elements[elementId];
    },
    querySelectorAll: function () { return []; },
    documentElement: makeElement("__root__")
  };
  return { elements: elements, document: fakeDocument };
}

function makeRecordingStorage() {
  var store = {};
  var writes = [];
  return {
    writes: writes,
    getItem: function (key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem: function (key, value) {
      writes.push({ key: key, value: String(value) });
      store[key] = String(value);
    },
    removeItem: function (key) { delete store[key]; }
  };
}

function makeRecordingConsole() {
  var lines = [];
  function record() {
    lines.push(Array.prototype.slice.call(arguments).map(String).join(" "));
  }
  return { lines: lines, log: record, warn: record, error: record, info: record };
}

async function tick(times) {
  for (var i = 0; i < (times || 1); i++) {
    await new Promise(function (resolve) { setTimeout(resolve, 0); });
  }
}

/** token 不得出現在任何元素的 innerHTML／textContent／data attribute */
function assertTokenNotInDom(elements, token, allowValueIds) {
  Object.keys(elements).forEach(function (id) {
    var el = elements[id];
    assert.ok(
      String(el.innerHTML).indexOf(token) === -1,
      "#" + id + " 的 innerHTML 不得含 token"
    );
    assert.ok(
      String(el.textContent).indexOf(token) === -1,
      "#" + id + " 的 textContent 不得含 token"
    );
    Object.keys(el._attrs || {}).forEach(function (attr) {
      assert.ok(
        String(el._attrs[attr]).indexOf(token) === -1,
        "#" + id + " 的屬性 " + attr + " 不得含 token"
      );
    });
    if ((allowValueIds || []).indexOf(id) === -1) {
      assert.ok(
        String(el.value).indexOf(token) === -1,
        "#" + id + " 的 value 不得含 token"
      );
    }
  });
}

// ──────────────────────── API client ────────────────────────

test("owner api client：claim-invite POST／GET／DELETE 路徑正確", async function () {
  var calls = [];
  var fakeWindow = {
    BEAUTY_CONFIG: { API_BASE_URL: "https://api.example.test" },
    getBeautyIdToken: function () { return "token-test"; }
  };
  var fakeFetch = async function (url, options) {
    calls.push({ url: url, options: options || {} });
    return { ok: true, status: 200, json: async function () { return { ok: true }; } };
  };
  new Function("window", "fetch", ownerApiJs)(fakeWindow, fakeFetch);

  await fakeWindow.ownerApi.createClaimInvite("cus 1");
  assert.equal(
    calls[0].url,
    "https://api.example.test/api/owner/customers/by-id/cus%201/claim-invite"
  );
  assert.equal(calls[0].options.method, "POST");

  await fakeWindow.ownerApi.getClaimInvite("cus-1");
  assert.equal(
    calls[1].url,
    "https://api.example.test/api/owner/customers/by-id/cus-1/claim-invite"
  );
  assert.equal(calls[1].options.method, undefined, "GET 不設定 method");

  await fakeWindow.ownerApi.revokeClaimInvite("cus-1");
  assert.equal(calls[2].options.method, "DELETE");
});

test("customer api client：claimInvite 走 POST body，token 不進 URL", async function () {
  var calls = [];
  var fakeWindow = {
    BEAUTY_CONFIG: { API_BASE_URL: "https://api.example.test" },
    beautyUser: { idToken: "id-token-test" }
  };
  var fakeFetch = async function (url, options) {
    calls.push({ url: url, options: options || {} });
    return { ok: true, status: 200, json: async function () { return { ok: true }; } };
  };
  new Function("window", "fetch", customerApiJs)(fakeWindow, fakeFetch);

  await fakeWindow.beautyApi.claimInvite(CLAIM_TOKEN);
  assert.equal(calls[0].url, "https://api.example.test/api/customer/claim-invite");
  assert.equal(calls[0].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].options.body), { claimToken: CLAIM_TOKEN });
  assert.ok(calls[0].url.indexOf(CLAIM_TOKEN) === -1, "token 不得出現在 URL");
  assert.equal(
    calls[0].options.headers.Authorization,
    "Bearer id-token-test",
    "必須帶 LINE ID token"
  );
});

// ──────────────────────── owner app ────────────────────────

async function bootOwnerApp(options) {
  var opts = options || {};
  var dom = makeFakeDom();
  var storage = makeRecordingStorage();
  var sessionStorage = makeRecordingStorage();
  var recordingConsole = makeRecordingConsole();
  var spy = {
    getClaimInvite: [],
    createClaimInvite: [],
    revokeClaimInvite: [],
    confirms: []
  };

  var customerDetail = Object.assign({
    ok: true,
    customerId: "cus-1",
    userId: "",
    linkedLine: false,
    customerName: "匯入客",
    phone: "",
    birthday: "",
    note: "",
    bookings: []
  }, opts.detail || {});

  var api = {
    isConfigured: function () { return true; },
    getSettings: async function () { return {}; },
    getBookingsForMonth: async function () { return { month: "2026-07", days: {} }; },
    getServices: async function () { return []; },
    getSlots: async function () { return []; },
    getCustomers: async function () {
      return {
        ok: true,
        customers: [{
          customerId: "cus-1",
          userId: customerDetail.userId,
          linkedLine: customerDetail.linkedLine,
          customerName: customerDetail.customerName
        }]
      };
    },
    getCustomerById: async function () { return customerDetail; },
    updateCustomerById: async function () { return { ok: true }; },
    getClaimInvite: async function (customerId) {
      spy.getClaimInvite.push(customerId);
      return {
        ok: true,
        linkedLine: customerDetail.linkedLine,
        invite: opts.invite !== undefined ? opts.invite : null
      };
    },
    createClaimInvite: async function (customerId) {
      spy.createClaimInvite.push(customerId);
      return {
        ok: true,
        claimToken: CLAIM_TOKEN,
        invite: {
          status: "active",
          expiresAt: "2026-07-20T15:00:00.000Z",
          createdAt: "2026-07-19T15:00:00.000Z",
          claimedAt: null,
          revokedAt: null
        }
      };
    },
    revokeClaimInvite: async function (customerId) {
      spy.revokeClaimInvite.push(customerId);
      return { ok: true, revoked: true };
    }
  };
  Object.assign(api, opts.api || {});

  var fakeWindow = {
    beautyUser: { userId: "U-owner" },
    beautyLiffReady: Promise.resolve(),
    scrollTo: function () {},
    localStorage: storage,
    sessionStorage: sessionStorage,
    navigator: {},
    BEAUTY_CONFIG: opts.config !== undefined ? opts.config : {
      CLAIM_ENABLED: true,
      CUSTOMER_APP_URL: "https://juliet-studio.pages.dev/"
    },
    ownerApi: api
  };
  var fakeConfirm = function (message) {
    spy.confirms.push(String(message));
    return opts.confirmResult !== undefined ? opts.confirmResult : true;
  };

  new Function("window", "document", "confirm", "console", ownerAppJs)(
    fakeWindow, dom.document, fakeConfirm, recordingConsole
  );
  await tick(4);

  return {
    els: dom.elements,
    spy: spy,
    storage: storage,
    sessionStorage: sessionStorage,
    console: recordingConsole
  };
}

async function openDetail(app) {
  app.els["customer-search-btn"].fire("click");
  await tick(2);
  var cards = app.els["customer-list"].querySelectorAll("[data-customer-id]");
  cards[0].fire("click");
  await tick(3);
}

test("owner：未綁 LINE 客戶顯示建立邀請；GET 只讀狀態、不期待 raw token", async function () {
  var app = await bootOwnerApp({ invite: null });
  await openDetail(app);

  assert.deepEqual(app.spy.getClaimInvite, ["cus-1"], "開詳情必須查邀請狀態");
  assert.equal(app.els["claim-invite-create"].hidden, false);
  assert.ok(app.els["claim-invite-status"].innerHTML.indexOf("目前沒有邀請") !== -1);
  assert.equal(app.els["claim-invite-result"].hidden, true, "GET 後不得出現連結區塊");
  assert.equal(app.els["claim-invite-link"].value, "", "GET 拿不到 raw token");
});

test("owner：已綁 LINE 客戶不顯示建立邀請操作", async function () {
  var app = await bootOwnerApp({ detail: { linkedLine: true, userId: "U-linked" } });
  await openDetail(app);

  assert.equal(app.spy.getClaimInvite.length, 0, "已綁定不需查邀請");
  assert.equal(app.els["claim-invite-create"].hidden, true);
  assert.equal(app.els["claim-invite-revoke"].hidden, true);
  assert.ok(app.els["claim-invite-status"].innerHTML.indexOf("已綁定 LINE") !== -1);
});

test("owner：建立邀請後 token 只在記憶體與連結欄位，不進 storage／console／DOM 屬性", async function () {
  var app = await bootOwnerApp({ invite: null });
  await openDetail(app);

  app.els["claim-invite-create"].fire("click");
  await tick(3);

  assert.deepEqual(app.spy.createClaimInvite, ["cus-1"]);
  var link = app.els["claim-invite-link"].value;
  assert.equal(
    link,
    "https://juliet-studio.pages.dev/#claim=" + encodeURIComponent(CLAIM_TOKEN),
    "連結必須以 customer app origin ＋ fragment 組合"
  );
  assert.ok(link.indexOf("?claim=") === -1, "token 不得放在 query string");
  assert.equal(app.els["claim-invite-result"].hidden, false);

  assert.equal(app.storage.writes.length, 0, "token 不得寫入 localStorage");
  assert.equal(app.sessionStorage.writes.length, 0, "token 不得寫入 sessionStorage");
  app.console.lines.forEach(function (line) {
    assert.ok(line.indexOf(CLAIM_TOKEN) === -1, "token 不得進 console");
  });
  assertTokenNotInDom(app.els, CLAIM_TOKEN, ["claim-invite-link"]);
});

test("owner：有 active 邀請時重新產生需 confirm，取消則不建立", async function () {
  var app = await bootOwnerApp({
    invite: {
      status: "active",
      expiresAt: "2026-07-20T15:00:00.000Z",
      createdAt: "2026-07-19T15:00:00.000Z"
    },
    confirmResult: false
  });
  await openDetail(app);

  assert.equal(app.els["claim-invite-create"].textContent, "重新產生邀請連結");
  assert.equal(app.els["claim-invite-revoke"].hidden, false);
  assert.ok(app.els["claim-invite-status"].innerHTML.indexOf("邀請有效") !== -1);

  app.els["claim-invite-create"].fire("click");
  await tick(2);
  assert.equal(app.spy.confirms.length, 1, "重新產生前必須 confirm");
  assert.ok(app.spy.confirms[0].indexOf("失效") !== -1, "confirm 必須說明舊連結會失效");
  assert.equal(app.spy.createClaimInvite.length, 0, "取消 confirm 不得建立");
});

test("owner：撤銷邀請經 confirm 後呼叫 DELETE 並清除連結", async function () {
  var app = await bootOwnerApp({
    invite: {
      status: "active",
      expiresAt: "2026-07-20T15:00:00.000Z",
      createdAt: "2026-07-19T15:00:00.000Z"
    }
  });
  await openDetail(app);

  app.els["claim-invite-create"].fire("click");
  await tick(3);
  assert.ok(app.els["claim-invite-link"].value.length > 0);

  app.els["claim-invite-revoke"].fire("click");
  await tick(3);
  assert.deepEqual(app.spy.revokeClaimInvite, ["cus-1"]);
  assert.equal(app.els["claim-invite-link"].value, "", "撤銷後必須清除連結");
  assert.equal(app.els["claim-invite-result"].hidden, true);
});

test("owner：返回客戶名單即清除記憶體連結與畫面", async function () {
  var app = await bootOwnerApp({ invite: null });
  await openDetail(app);
  app.els["claim-invite-create"].fire("click");
  await tick(3);
  assert.ok(app.els["claim-invite-link"].value.indexOf(CLAIM_TOKEN) !== -1);

  app.els["customer-back-btn"].fire("click");
  await tick(1);
  assert.equal(app.els["claim-invite-link"].value, "", "返回名單必須清除連結");
  assert.equal(app.els["claim-invite-result"].hidden, true);
});

test("owner：未啟用 claim 設定（Demo v1）不提供邀請操作、不呼叫 API", async function () {
  var app = await bootOwnerApp({ config: { CLAIM_ENABLED: false, CUSTOMER_APP_URL: null } });
  await openDetail(app);

  assert.equal(app.spy.getClaimInvite.length, 0);
  assert.equal(app.els["claim-invite-create"].hidden, true);
  assert.ok(app.els["claim-invite-status"].innerHTML.indexOf("未啟用") !== -1);
});

test("owner：QR 完全本機產生，程式碼不含第三方 QR 服務", function () {
  ["chart.googleapis.com", "api.qrserver.com", "quickchart.io", "qr-code-api"]
    .forEach(function (host) {
      assert.ok(ownerAppJs.indexOf(host) === -1, "不得使用 " + host);
      assert.ok(ownerApiJs.indexOf(host) === -1, "不得使用 " + host);
    });
  assert.ok(
    /window\.qrcode/.test(ownerAppJs),
    "QR 必須使用本機 vendored qrcode-generator"
  );
  var vendor = readFileSync(join(repoRoot, "owner-admin/js/vendor/qrcode.js"), "utf8");
  assert.ok(vendor.indexOf("Kazuhiko Arase") !== -1, "vendored 檔案來源必須完整");
  assert.ok(vendor.indexOf("MIT license") !== -1, "vendored 檔案必須保留授權聲明");
  assert.ok(
    vendor.indexOf("http://www.opensource.org/licenses/mit-license.php") !== -1
  );

  var html = readFileSync(join(repoRoot, "owner-admin/index.html"), "utf8");
  assert.ok(
    html.indexOf('src="js/vendor/qrcode.js') !== -1,
    "QR 套件必須本機託管載入，不使用 CDN"
  );
});

// ──────────────────────── customer app ────────────────────────

async function bootCustomerApp(options) {
  var opts = options || {};
  var dom = makeFakeDom();
  var storage = makeRecordingStorage();
  var sessionStorage = makeRecordingStorage();
  var recordingConsole = makeRecordingConsole();
  var spy = { claimInvite: [], replaceState: [] };

  var api = {
    isConfigured: function () { return true; },
    getSettings: async function () { return {}; },
    getServices: async function () { return []; },
    getCustomerMe: async function () {
      return { ok: true, exists: false, customer: null };
    },
    getMyBookings: async function () { return []; },
    claimInvite: async function (token) {
      spy.claimInvite.push(token);
      if (opts.claimError) {
        var error = new Error(opts.claimError);
        error.status = 410;
        throw error;
      }
      return { ok: true, claimed: true, customer: { customerName: "匯入客" } };
    }
  };
  Object.assign(api, opts.api || {});

  // 對齊真實 HTML：claim-modal 初始為 hidden
  dom.document.getElementById("claim-modal").classList.add("hidden");

  var fakeWindow = {
    beautyUser: { userId: "U-claim-test", displayName: "客人", pictureUrl: "" },
    beautyLiffReady: Promise.resolve(),
    localStorage: storage,
    sessionStorage: sessionStorage,
    navigator: {},
    location: {
      hostname: "juliet-studio.pages.dev",
      pathname: "/",
      search: opts.search !== undefined ? opts.search : "",
      hash: opts.hash !== undefined ? opts.hash : ""
    },
    history: {
      replaceState: function (stateObj, title, url) {
        spy.replaceState.push(String(url));
      }
    },
    BEAUTY_CONFIG: opts.config !== undefined ? opts.config : {
      CLAIM_ENABLED: true,
      CUSTOMER_APP_URL: "https://juliet-studio.pages.dev/"
    },
    beautyApi: api
  };

  new Function("window", "document", "console", customerAppJs)(
    fakeWindow, dom.document, recordingConsole
  );
  await tick(4);

  return {
    els: dom.elements,
    spy: spy,
    storage: storage,
    sessionStorage: sessionStorage,
    console: recordingConsole
  };
}

test("customer：v2 設定＋fragment claim 參數顯示確認畫面，未確認前不呼叫 API", async function () {
  var app = await bootCustomerApp({
    hash: "#claim=" + encodeURIComponent(CLAIM_TOKEN)
  });

  assert.equal(
    app.els["claim-modal"].classList.contains("hidden"),
    false,
    "必須顯示認領確認畫面"
  );
  assert.equal(app.spy.claimInvite.length, 0, "未確認前不得呼叫 claim API");
  assertTokenNotInDom(app.els, CLAIM_TOKEN, []);
});

test("customer：不支援 ?claim= query token（不顯示畫面、不呼叫 API）", async function () {
  var app = await bootCustomerApp({
    search: "?claim=" + encodeURIComponent(CLAIM_TOKEN),
    hash: ""
  });

  assert.equal(
    app.els["claim-modal"].classList.contains("hidden"),
    true,
    "query token 不得啟動認領流程"
  );
  app.els["claim-confirm-btn"].fire("click");
  await tick(2);
  assert.equal(app.spy.claimInvite.length, 0, "query token 不得觸發 claim API");
});

test("customer：程式碼不得含從 query string 讀取 claim 的邏輯", function () {
  // 讀取端必須只認 fragment；任何 [?&]claim= 樣式或
  // URLSearchParams claim 讀取一律判定失敗，避免保留洩漏路徑
  assert.ok(
    customerAppJs.indexOf("[?&]claim=") === -1,
    "不得以 query 樣式解析 claim token"
  );
  assert.ok(
    customerAppJs.indexOf('get("claim")') === -1 &&
    customerAppJs.indexOf("get('claim')") === -1,
    "不得以 URLSearchParams 讀取 claim token"
  );
  assert.ok(
    customerAppJs.indexOf("[#&]claim=") !== -1,
    "必須從 location.hash fragment 讀取 claim token"
  );
  assert.ok(
    ownerAppJs.indexOf('"#claim="') !== -1 &&
    ownerAppJs.indexOf('"?claim="') === -1,
    "owner 連結必須使用 #claim= fragment"
  );
});

test("customer：確認後呼叫 claim API，成功即 replaceState 移除 fragment token 並保留既有 query", async function () {
  var app = await bootCustomerApp({
    search: "?foo=1",
    hash: "#claim=" + encodeURIComponent(CLAIM_TOKEN)
  });

  app.els["claim-confirm-btn"].fire("click");
  await tick(3);

  assert.deepEqual(app.spy.claimInvite, [CLAIM_TOKEN], "必須以原 token 呼叫 API");
  assert.equal(app.spy.replaceState.length, 1, "成功後必須 replaceState");
  assert.equal(
    app.spy.replaceState[0],
    "/?foo=1",
    "必須保留 pathname 與既有非 claim query，並移除 fragment token"
  );
  assert.ok(
    app.spy.replaceState[0].indexOf("claim=") === -1,
    "replaceState 後 URL 不得含 claim token"
  );
  assert.equal(app.els["claim-modal"].classList.contains("hidden"), true);
  assert.ok(app.els.status.textContent.indexOf("已完成 LINE 綁定") !== -1);

  assert.equal(
    app.storage.writes.filter(function (w) {
      return w.value.indexOf(CLAIM_TOKEN) !== -1;
    }).length,
    0,
    "token 不得寫入 localStorage"
  );
  assert.equal(app.sessionStorage.writes.length, 0, "token 不得寫入 sessionStorage");
  app.console.lines.forEach(function (line) {
    assert.ok(line.indexOf(CLAIM_TOKEN) === -1, "token 不得進 console");
  });
});

test("customer：取消認領即 replaceState 清除 fragment token", async function () {
  var app = await bootCustomerApp({
    search: "?foo=1",
    hash: "#claim=" + encodeURIComponent(CLAIM_TOKEN)
  });

  app.els["claim-dismiss-btn"].fire("click");
  await tick(1);

  assert.equal(app.spy.claimInvite.length, 0, "取消不得呼叫 claim API");
  assert.equal(app.spy.replaceState.length, 1, "取消後必須 replaceState");
  assert.equal(
    app.spy.replaceState[0],
    "/?foo=1",
    "取消後必須移除 fragment token 並保留既有 query"
  );
  assert.equal(app.els["claim-modal"].classList.contains("hidden"), true);
});

test("customer：claim 失敗顯示後端訊息並隱藏確認鍵", async function () {
  var app = await bootCustomerApp({
    hash: "#claim=" + encodeURIComponent(CLAIM_TOKEN),
    claimError: "此邀請已過期，請聯絡店家重新產生"
  });

  app.els["claim-confirm-btn"].fire("click");
  await tick(3);

  assert.ok(
    app.els["claim-body"].innerHTML.indexOf("此邀請已過期") !== -1,
    "必須顯示失敗訊息"
  );
  assert.equal(app.els["claim-confirm-btn"].hidden, true);
  assert.equal(
    app.els["claim-modal"].classList.contains("hidden"),
    false,
    "失敗時保留畫面讓使用者關閉"
  );
});

test("customer：重複點擊確認只呼叫一次 claim API", async function () {
  var resolveClaim;
  var app = await bootCustomerApp({
    hash: "#claim=" + encodeURIComponent(CLAIM_TOKEN),
    api: {
      claimInvite: function (token) {
        app.spy.claimInvite.push(token);
        return new Promise(function (resolve) {
          resolveClaim = function () {
            resolve({ ok: true, claimed: true, customer: {} });
          };
        });
      }
    }
  });

  app.els["claim-confirm-btn"].fire("click");
  await tick(1);
  app.els["claim-confirm-btn"].fire("click");
  await tick(1);
  assert.equal(app.spy.claimInvite.length, 1, "處理中不得重複送出");
  resolveClaim();
  await tick(3);
  assert.equal(app.spy.claimInvite.length, 1);
});

test("customer：Demo v1 設定（CLAIM_ENABLED=false）完全不啟動認領流程", async function () {
  var app = await bootCustomerApp({
    hash: "#claim=" + encodeURIComponent(CLAIM_TOKEN),
    config: { CLAIM_ENABLED: false, CUSTOMER_APP_URL: null }
  });

  assert.equal(
    app.els["claim-modal"].classList.contains("hidden"),
    true,
    "Demo v1 不得顯示認領畫面"
  );
  app.els["claim-confirm-btn"].fire("click");
  await tick(2);
  assert.equal(app.spy.claimInvite.length, 0, "Demo v1 不得呼叫 claim API");
});

test("customer：無 claim 參數時一般預約流程不受影響", async function () {
  var app = await bootCustomerApp({ search: "" });
  assert.equal(app.els["claim-modal"].classList.contains("hidden"), true);
  assert.equal(app.spy.claimInvite.length, 0);
  assert.equal(app.els.status.textContent, "", "boot 完成後狀態列應為空");
});

// ──────────────────────── 靜態副本一致性 ────────────────────────

test("customer-ui 與 docs 靜態副本完全一致", function () {
  ["index.html", "js/api.js", "js/app.js", "js/config.js", "css/style.css"]
    .forEach(function (file) {
      var source = readFileSync(join(repoRoot, "customer-ui", file), "utf8");
      var copy = readFileSync(join(repoRoot, "docs", file), "utf8");
      assert.equal(copy, source, "docs/" + file + " 必須與 customer-ui 一致");
    });
});

test("owner-admin 與 docs/owner 靜態副本完全一致（含 config 與 vendor）", function () {
  ["index.html", "js/api.js", "js/app.js", "js/config.js",
    "js/vendor/qrcode.js", "css/style.css"]
    .forEach(function (file) {
      var source = readFileSync(join(repoRoot, "owner-admin", file), "utf8");
      var copy = readFileSync(join(repoRoot, "docs/owner", file), "utf8");
      assert.equal(copy, source, "docs/owner/" + file + " 必須與 owner-admin 一致");
    });
});
