/**
 * 前後對比照片前端測試（node:test ＋ assert，零依賴）
 *
 * 以最小假 DOM 執行 owner-admin 的 app.js／api.js，驗證：
 * - api client：photo set／photo 路徑與 method；binary 上傳不強制
 *   JSON Content-Type；圖片 GET 以 blob 處理非 JSON response
 * - 上傳前必經 Canvas 重新編碼（移除 EXIF／GPS），不直接上傳原始 File；
 *   無法解碼時停止並提示
 * - 圖片以帶 Authorization 的 authenticated fetch 取 blob 顯示；
 *   token／object key 不進 img src、storage、console
 * - object URL 於返回名單／重新 render 時 revoke
 * - 上傳／刪除防重複點擊；刪除需 confirm
 * - 不使用第三方圖片／QR 服務；Demo v1 與 customer-ui 不受影響
 * - owner-admin ↔ docs/owner 靜態副本一致（由既有測試涵蓋檔案比對）
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

var repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
var ownerApiJs = readFileSync(join(repoRoot, "owner-admin/js/api.js"), "utf8");
var ownerAppJs = readFileSync(join(repoRoot, "owner-admin/js/app.js"), "utf8");
var customerAppJs = readFileSync(join(repoRoot, "customer-ui/js/app.js"), "utf8");
var customerApiJs = readFileSync(join(repoRoot, "customer-ui/js/api.js"), "utf8");

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
  if (!el._qsaCaches) el._qsaCaches = {};
  if (el._qsaCaches[attr] && el._qsaCaches[attr].key === cacheKey) {
    return el._qsaCaches[attr].list;
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
  el._qsaCaches[attr] = { key: cacheKey, list: list };
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
    alt: "",
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
    click: function () { el.fire("click"); },
    getContext: function () {
      return {
        fillStyle: "",
        fillRect: function () {},
        clearRect: function () {},
        drawImage: function () {}
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
  var createdCanvases = [];
  var fakeDocument = {
    getElementById: function (elementId) {
      if (!elements[elementId]) {
        elements[elementId] = makeElement(elementId);
      }
      return elements[elementId];
    },
    createElement: function (tagName) {
      var el = makeElement("__created_" + tagName + "__");
      if (tagName === "canvas") {
        var ctx = {
          fillStyle: "",
          fillRect: function () { ctx.fillRectCalls = (ctx.fillRectCalls || 0) + 1; },
          clearRect: function () {},
          drawImage: function () { ctx.drawImageCalls = (ctx.drawImageCalls || 0) + 1; }
        };
        el._ctx = ctx;
        el.getContext = function () { return ctx; };
        el.toBlob = function (callback, type, quality) {
          el._toBlobArgs = { type: type, quality: quality };
          callback({
            size: 200 * 1024,
            type: type || "image/jpeg",
            _reencodedByCanvas: true,
            _canvasWidth: el.width,
            _canvasHeight: el.height
          });
        };
        createdCanvases.push(el);
      }
      return el;
    },
    querySelectorAll: function () { return []; },
    documentElement: makeElement("__root__")
  };
  return { elements: elements, document: fakeDocument, canvases: createdCanvases };
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

var OBJECT_KEY_SAMPLE = "customer-photos/tenant-x/11111111-2222-3333-4444-555555555555";

function photoDto(overrides) {
  return Object.assign({
    photoId: "photo-1",
    kind: "before",
    mimeType: "image/jpeg",
    byteSize: 2048,
    width: 800,
    height: 600,
    createdAt: "2026-07-02T00:00:00.000Z",
    contentPath: "/api/owner/customers/by-id/cus-1/photos/photo-1/content"
  }, overrides || {});
}

function photoSetDto(overrides) {
  return Object.assign({
    setId: "set-1",
    title: "臉部護理",
    capturedAt: "2026-07-01",
    bookingId: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    before: null,
    after: null
  }, overrides || {});
}

// ──────────────────────── API client ────────────────────────

function bootApiClient() {
  var calls = [];
  var fakeWindow = {
    BEAUTY_CONFIG: { API_BASE_URL: "https://api.example.test" },
    getBeautyIdToken: function () { return "owner-id-token"; }
  };
  var fakeBlob = { size: 10, type: "image/webp", _isBlobResult: true };
  var fakeFetch = async function (url, options) {
    calls.push({ url: url, options: options || {} });
    return {
      ok: true,
      status: 200,
      json: async function () { return { ok: true }; },
      blob: async function () { return fakeBlob; }
    };
  };
  new Function("window", "fetch", ownerApiJs)(fakeWindow, fakeFetch);
  return { api: fakeWindow.ownerApi, calls: calls, blob: fakeBlob };
}

test("owner api client：photo set 路徑與 method 正確", async function () {
  var ctx = bootApiClient();

  await ctx.api.listPhotoSets("cus 1");
  assert.equal(
    ctx.calls[0].url,
    "https://api.example.test/api/owner/customers/by-id/cus%201/photo-sets"
  );
  assert.equal(ctx.calls[0].options.method, undefined, "GET 不設定 method");

  await ctx.api.createPhotoSet("cus-1", { title: "術後", capturedAt: "2026-07-01" });
  assert.equal(ctx.calls[1].options.method, "POST");
  assert.deepEqual(JSON.parse(ctx.calls[1].options.body),
    { title: "術後", capturedAt: "2026-07-01" });

  await ctx.api.updatePhotoSet("cus-1", "set 1", { title: "新標題" });
  assert.equal(
    ctx.calls[2].url,
    "https://api.example.test/api/owner/customers/by-id/cus-1/photo-sets/set%201"
  );
  assert.equal(ctx.calls[2].options.method, "PATCH");

  await ctx.api.deletePhotoSet("cus-1", "set-1");
  assert.equal(ctx.calls[3].options.method, "DELETE");

  await ctx.api.deleteComparisonPhoto("cus-1", "photo-1");
  assert.equal(
    ctx.calls[4].url,
    "https://api.example.test/api/owner/customers/by-id/cus-1/photos/photo-1"
  );
  assert.equal(ctx.calls[4].options.method, "DELETE");
});

test("owner api client：binary 上傳不強制 JSON Content-Type、帶 Authorization", async function () {
  var ctx = bootApiClient();
  var blob = { size: 1234, type: "image/jpeg" };

  await ctx.api.uploadComparisonPhoto("cus-1", "set-1", "before", blob,
    { width: 1600, height: 1200 });

  var call = ctx.calls[0];
  assert.equal(
    call.url,
    "https://api.example.test/api/owner/customers/by-id/cus-1/photo-sets/set-1" +
    "/photos/before?width=1600&height=1200"
  );
  assert.equal(call.options.method, "PUT");
  assert.equal(call.options.body, blob, "body 必須是 blob 本體");
  assert.equal(call.options.headers["Content-Type"], "image/jpeg",
    "Content-Type 必須是圖片格式，不可強制 application/json");
  assert.equal(call.options.headers.Authorization, "Bearer owner-id-token");
});

test("owner api client：圖片 GET 以 blob 處理非 JSON response", async function () {
  var ctx = bootApiClient();
  var result = await ctx.api.fetchComparisonPhotoBlob("cus-1", "photo-1");
  assert.equal(
    ctx.calls[0].url,
    "https://api.example.test/api/owner/customers/by-id/cus-1/photos/photo-1/content"
  );
  assert.equal(result._isBlobResult, true, "必須回傳 blob 而非 JSON");
  assert.equal(ctx.calls[0].options.headers.Authorization, "Bearer owner-id-token",
    "圖片 GET 必須帶 owner Authorization header");
});

// ──────────────────────── owner app ────────────────────────

async function bootOwnerApp(options) {
  var opts = options || {};
  var dom = makeFakeDom();
  var storage = makeRecordingStorage();
  var sessionStorage = makeRecordingStorage();
  var recordingConsole = makeRecordingConsole();
  var spy = {
    listPhotoSets: [],
    createPhotoSet: [],
    deletePhotoSet: [],
    uploads: [],
    blobFetches: [],
    photoDeletes: [],
    confirms: [],
    createdObjectUrls: [],
    revokedObjectUrls: [],
    bitmapSources: []
  };

  var state = { photoSets: opts.photoSets || [] };

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
          customerId: "cus-1", userId: "", linkedLine: false, customerName: "匯入客"
        }]
      };
    },
    getCustomerById: async function () {
      return {
        ok: true, customerId: "cus-1", userId: "", linkedLine: false,
        customerName: "匯入客", phone: "", birthday: "", note: "", bookings: []
      };
    },
    updateCustomerById: async function () { return { ok: true }; },
    getClaimInvite: async function () {
      return { ok: true, linkedLine: false, invite: null };
    },
    listPhotoSets: async function (customerId) {
      spy.listPhotoSets.push(customerId);
      return { ok: true, photoSets: state.photoSets };
    },
    createPhotoSet: async function (customerId, data) {
      spy.createPhotoSet.push({ customerId: customerId, data: data });
      return { ok: true, photoSet: photoSetDto() };
    },
    updatePhotoSet: async function () { return { ok: true }; },
    deletePhotoSet: async function (customerId, setId) {
      spy.deletePhotoSet.push({ customerId: customerId, setId: setId });
      return { ok: true, deleted: true };
    },
    uploadComparisonPhoto: async function (customerId, setId, kind, blob, metadata) {
      spy.uploads.push({
        customerId: customerId, setId: setId, kind: kind,
        blob: blob, metadata: metadata
      });
      return { ok: true, photo: photoDto({ kind: kind }) };
    },
    fetchComparisonPhotoBlob: async function (customerId, photoId) {
      spy.blobFetches.push({ customerId: customerId, photoId: photoId });
      if (opts.blobFetchFails) {
        throw new Error("載入失敗");
      }
      return { size: 2048, type: "image/jpeg", _photoBlob: photoId };
    },
    deleteComparisonPhoto: async function (customerId, photoId) {
      spy.photoDeletes.push({ customerId: customerId, photoId: photoId });
      return { ok: true, deleted: true };
    }
  };
  Object.assign(api, opts.api || {});

  var objectUrlSeq = 0;
  var fakeWindow = {
    beautyUser: { userId: "U-owner" },
    beautyLiffReady: Promise.resolve(),
    scrollTo: function () {},
    localStorage: storage,
    sessionStorage: sessionStorage,
    navigator: {},
    URL: {
      createObjectURL: function (blob) {
        objectUrlSeq += 1;
        var objectUrl = "blob:fake-" + objectUrlSeq;
        spy.createdObjectUrls.push({ url: objectUrl, blob: blob });
        return objectUrl;
      },
      revokeObjectURL: function (objectUrl) {
        spy.revokedObjectUrls.push(objectUrl);
      }
    },
    createImageBitmap: async function (source) {
      spy.bitmapSources.push(source);
      if (source && source._failDecode) {
        throw new Error("decode error");
      }
      return {
        width: (source && source._bitmapWidth) || 4000,
        height: (source && source._bitmapHeight) || 3000,
        close: function () {}
      };
    },
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
    state: state,
    storage: storage,
    sessionStorage: sessionStorage,
    console: recordingConsole,
    canvases: dom.canvases
  };
}

async function openDetail(app) {
  app.els["customer-search-btn"].fire("click");
  await tick(2);
  var cards = app.els["customer-list"].querySelectorAll("[data-customer-id]");
  cards[0].fire("click");
  await tick(3);
}

function findByAttr(app, attr, value) {
  var list = app.els["photo-set-list"].querySelectorAll("[" + attr + "]");
  for (var i = 0; i < list.length; i++) {
    if (list[i].getAttribute(attr) === value) return list[i];
  }
  return null;
}

test("owner：開啟客戶詳情載入照片組，最新資料經 DTO 呈現", async function () {
  var app = await bootOwnerApp({
    photoSets: [photoSetDto({ before: photoDto() })]
  });
  await openDetail(app);

  assert.deepEqual(app.spy.listPhotoSets, ["cus-1"]);
  var html = app.els["photo-set-list"].innerHTML;
  assert.ok(html.indexOf("臉部護理") !== -1);
  assert.ok(html.indexOf("Before") !== -1 && html.indexOf("After") !== -1,
    "Before／After 必須以文字標示，不只靠顏色");
  assert.ok(html.indexOf("尚未上傳") !== -1, "after 未上傳需顯示清楚文字");
});

test("owner：照片以 authenticated fetch blob 載入，token／key 不進 img src", async function () {
  var app = await bootOwnerApp({
    photoSets: [photoSetDto({ before: photoDto() })]
  });
  await openDetail(app);
  await tick(2);

  assert.deepEqual(app.spy.blobFetches, [{ customerId: "cus-1", photoId: "photo-1" }]);
  assert.equal(app.spy.createdObjectUrls.length, 1);

  var img = findByAttr(app, "data-photo-img", "photo-1");
  assert.ok(img, "必須渲染照片 img");
  assert.equal(img.src, "blob:fake-1", "img src 必須是本機 object URL");
  assert.ok(img.src.indexOf("Authorization") === -1 && img.src.indexOf("token") === -1);
  assert.ok(img.src.indexOf("customer-photos/") === -1, "img src 不得含 object key");

  assert.equal(app.storage.writes.length, 0, "圖片不得寫入 localStorage");
  assert.equal(app.sessionStorage.writes.length, 0, "圖片不得寫入 sessionStorage");
});

test("owner：返回客戶名單時 revoke 所有 object URL", async function () {
  var app = await bootOwnerApp({
    photoSets: [photoSetDto({ before: photoDto(), after: photoDto({ photoId: "photo-2", kind: "after" }) })]
  });
  await openDetail(app);
  await tick(2);
  assert.equal(app.spy.createdObjectUrls.length, 2);

  app.els["customer-back-btn"].fire("click");
  await tick(1);
  assert.deepEqual(
    app.spy.revokedObjectUrls.slice().sort(),
    app.spy.createdObjectUrls.map(function (u) { return u.url; }).sort(),
    "返回名單必須 revoke 全部 object URL"
  );
  assert.equal(app.els["photo-set-list"].innerHTML, "", "返回名單必須清空照片區");
});

test("owner：上傳前必經 Canvas 重新編碼（長邊 2000、JPEG 0.88），不上傳原始 File", async function () {
  var app = await bootOwnerApp({ photoSets: [photoSetDto()] });
  await openDetail(app);

  var rawFile = { name: "IMG_1234.jpg", type: "image/jpeg", size: 9 * 1024 * 1024 };
  var input = findByAttr(app, "data-photo-file", "set-1:before");
  assert.ok(input, "必須渲染檔案輸入");
  input.files = [rawFile];
  input.fire("change");
  await tick(4);

  assert.equal(app.spy.uploads.length, 1);
  var upload = app.spy.uploads[0];
  assert.notEqual(upload.blob, rawFile, "不得直接上傳原始 File");
  assert.equal(upload.blob._reencodedByCanvas, true, "必須上傳 Canvas 重新編碼結果");
  assert.equal(upload.kind, "before");
  // 4000×3000 → 長邊縮至 2000
  assert.deepEqual(upload.metadata, { width: 2000, height: 1500 });

  assert.equal(app.canvases.length, 1);
  assert.equal(app.canvases[0]._toBlobArgs.type, "image/jpeg");
  assert.equal(app.canvases[0]._toBlobArgs.quality, 0.88);
  assert.equal(app.canvases[0]._ctx.fillRectCalls, 1, "透明背景必須鋪白");
  assert.deepEqual(app.spy.bitmapSources, [rawFile], "必須以原始 File 解碼");
});

test("owner：無法安全解碼時停止並提示，不上傳任何內容", async function () {
  var app = await bootOwnerApp({ photoSets: [photoSetDto()] });
  await openDetail(app);

  var input = findByAttr(app, "data-photo-file", "set-1:before");
  input.files = [{ name: "broken.bin", type: "application/octet-stream", _failDecode: true }];
  input.fire("change");
  await tick(4);

  assert.equal(app.spy.uploads.length, 0, "解碼失敗不得上傳");
  assert.ok(app.els["status"].textContent.indexOf("無法讀取此圖片") !== -1,
    "必須顯示清楚錯誤提示");
});

test("owner：上傳期間防重複觸發", async function () {
  var app = await bootOwnerApp({ photoSets: [photoSetDto()] });
  await openDetail(app);

  var input = findByAttr(app, "data-photo-file", "set-1:before");
  input.files = [{ name: "a.jpg", type: "image/jpeg" }];
  input.fire("change");
  input.files = [{ name: "b.jpg", type: "image/jpeg" }];
  input.fire("change");
  await tick(4);

  assert.equal(app.spy.uploads.length, 1, "處理期間重複選檔只能觸發一次上傳");
});

test("owner：刪除照片需 confirm，取消則不呼叫 API", async function () {
  var app = await bootOwnerApp({
    photoSets: [photoSetDto({ before: photoDto() })],
    confirmResult: false
  });
  await openDetail(app);

  var deleteBtn = findByAttr(app, "data-photo-delete", "photo-1");
  deleteBtn.fire("click");
  await tick(2);
  assert.equal(app.spy.confirms.length, 1, "刪除照片前必須 confirm");
  assert.equal(app.spy.photoDeletes.length, 0, "取消 confirm 不得刪除");
});

test("owner：刪除整組需 confirm，確認後呼叫 deletePhotoSet 並重新載入", async function () {
  var app = await bootOwnerApp({ photoSets: [photoSetDto()] });
  await openDetail(app);
  assert.equal(app.spy.listPhotoSets.length, 1);

  var deleteBtn = findByAttr(app, "data-photo-set-delete", "set-1");
  deleteBtn.fire("click");
  await tick(3);

  assert.equal(app.spy.confirms.length, 1);
  assert.ok(app.spy.confirms[0].indexOf("整組") !== -1);
  assert.deepEqual(app.spy.deletePhotoSet, [{ customerId: "cus-1", setId: "set-1" }]);
  assert.equal(app.spy.listPhotoSets.length, 2, "刪除後必須重新載入照片組");
});

test("owner：建立照片組帶標題與拍攝日期，成功後清空欄位", async function () {
  var app = await bootOwnerApp({ photoSets: [] });
  await openDetail(app);

  app.els["photo-set-title"].value = "美白護理";
  app.els["photo-set-date"].value = "2026-07-15";
  app.els["photo-set-create-btn"].fire("click");
  await tick(3);

  assert.deepEqual(app.spy.createPhotoSet, [{
    customerId: "cus-1",
    data: { title: "美白護理", capturedAt: "2026-07-15" }
  }]);
  assert.equal(app.els["photo-set-title"].value, "");
  assert.equal(app.els["photo-set-date"].value, "");
  assert.equal(app.spy.listPhotoSets.length, 2, "建立後必須重新載入");
});

test("owner：照片載入失敗時隱藏 img 並顯示清楚文字", async function () {
  var app = await bootOwnerApp({
    photoSets: [photoSetDto({ before: photoDto() })],
    blobFetchFails: true
  });
  await openDetail(app);
  await tick(2);

  var img = findByAttr(app, "data-photo-img", "photo-1");
  assert.equal(img.hidden, true, "載入失敗必須隱藏 img");
  var errorEl = findByAttr(app, "data-photo-error", "photo-1");
  assert.equal(errorEl.hidden, false, "必須顯示載入失敗文字");
  assert.ok(app.els["photo-set-list"].innerHTML.indexOf("照片載入失敗") !== -1);
});

test("owner：object key 不出現在 DOM，console 無 blob／key 內容", async function () {
  var app = await bootOwnerApp({
    photoSets: [photoSetDto({ before: photoDto() })]
  });
  await openDetail(app);
  await tick(2);

  Object.keys(app.els).forEach(function (id) {
    assert.ok(String(app.els[id].innerHTML).indexOf("customer-photos/") === -1,
      "#" + id + " 不得含 object key");
    assert.ok(String(app.els[id].src || "").indexOf("customer-photos/") === -1);
  });
  app.console.lines.forEach(function (line) {
    assert.ok(line.indexOf("customer-photos/") === -1, "console 不得含 object key");
    assert.ok(line.indexOf(OBJECT_KEY_SAMPLE) === -1);
  });
});

// ──────────────────────── 靜態安全檢查 ────────────────────────

test("靜態檢查：不使用第三方圖片／QR 服務，圖片處理完全本機", function () {
  [ownerAppJs, ownerApiJs].forEach(function (source) {
    ["chart.googleapis.com", "api.qrserver.com", "quickchart.io",
      "cloudinary", "imgix", "imgur", "res.cloudinary"].forEach(function (host) {
      assert.ok(source.indexOf(host) === -1, "不得使用第三方服務：" + host);
    });
  });
  assert.ok(ownerAppJs.indexOf("createImageBitmap") !== -1, "必須本機解碼圖片");
  assert.ok(ownerAppJs.indexOf("toBlob") !== -1, "必須以 Canvas 重新編碼");
  assert.ok(ownerAppJs.indexOf("revokeObjectURL") !== -1, "必須 revoke object URL");
});

test("靜態檢查：Demo v1／customer-ui 不含照片功能程式碼", function () {
  [customerAppJs, customerApiJs].forEach(function (source) {
    assert.ok(source.indexOf("photo-sets") === -1, "customer-ui 不得呼叫照片 API");
    assert.ok(source.indexOf("uploadComparisonPhoto") === -1);
    assert.ok(source.indexOf("PHOTO_BUCKET") === -1);
  });
});

test("靜態檢查：照片依原始比例自然顯示，不裁切、不用固定比例盒", function () {
  var css = readFileSync(join(repoRoot, "owner-admin/css/style.css"), "utf8");

  var photoImgRule = css.match(/\.photo-img\s*\{[^}]*\}/);
  assert.ok(photoImgRule, ".photo-img 樣式必須存在");
  var rule = photoImgRule[0];
  assert.ok(rule.indexOf("width: 100%") !== -1, "圖片寬度必須貼齊欄寬");
  assert.ok(rule.indexOf("max-width: 100%") !== -1, "圖片不得超出容器");
  assert.ok(rule.indexOf("height: auto") !== -1, "高度必須依原始比例自動推得");
  assert.ok(rule.indexOf("display: block") !== -1);
  assert.ok(rule.indexOf("aspect-ratio") === -1,
    "不得使用固定比例盒（會產生留白）");
  assert.ok(rule.indexOf("max-height") === -1, "不得以 max-height 截斷照片");
  assert.ok(!/height:\s*\d/.test(rule), "不得設定固定 height");
  assert.ok(rule.indexOf("padding") === -1 && rule.indexOf("background") === -1,
    "不得以背景／padding 產生固定空白盒");

  assert.ok(css.indexOf("object-fit: cover") === -1,
    "照片相關樣式不得使用 object-fit: cover 裁切");
});

test("靜態檢查：手機仍維持 Before／After 左右兩欄，按鈕可讀可點", function () {
  var css = readFileSync(join(repoRoot, "owner-admin/css/style.css"), "utf8");

  var slotRule = css.match(/\.photo-slot\s*\{[^}]*\}/);
  assert.ok(slotRule, ".photo-slot 樣式必須存在");
  assert.ok(/flex:\s*1 1 calc\(50%/.test(slotRule[0]),
    ".photo-slot 必須維持兩欄各半");
  assert.ok(slotRule[0].indexOf("min-width: 0") !== -1,
    ".photo-slot 必須可安全縮小避免溢出");

  assert.ok(!/\.photo-slot[^{]*\{[^}]*flex-basis:\s*100%/.test(css),
    "不得存在 .photo-slot flex-basis: 100% 的上下排列規則");

  var compareRule = css.match(/\.photo-compare\s*\{[^}]*\}/);
  assert.ok(compareRule && compareRule[0].indexOf("flex-start") !== -1,
    "兩欄圖片必須頂端對齊");

  var actionsBtnRule = css.match(/\.photo-slot-actions \.btn\s*\{[^}]*\}/);
  assert.ok(actionsBtnRule && actionsBtnRule[0].indexOf("min-height: 44px") !== -1,
    "觸控按鈕高度至少 44px");
});

test("靜態副本：owner-admin ↔ docs/owner 完全一致", function () {
  ["index.html", "js/api.js", "js/app.js", "css/style.css"].forEach(function (file) {
    var ownerAdmin = readFileSync(join(repoRoot, "owner-admin", file), "utf8");
    var docsOwner = readFileSync(join(repoRoot, "docs/owner", file), "utf8");
    assert.equal(docsOwner, ownerAdmin, "docs/owner/" + file + " 必須與 owner-admin 一致");
  });
});
