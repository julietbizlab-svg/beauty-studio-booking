/**
 * owner-admin 客戶 UI 測試（node:test ＋ assert，零依賴）
 *
 * 以最小假 DOM 執行 owner-admin/js/app.js 與 api.js，驗證 Phase 3c-2：
 * - API client 使用 customerId 路徑與匯入 preview／commit 契約
 * - 客戶卡片使用 data-customer-id，不依賴空的 userId
 * - 未綁 LINE／無預約客戶可開啟詳情；電話空白不被前端阻擋
 * - CSV 匯入：mapping 驗證、preview 只渲染 maskedPreview、
 *   缺 canonicalHash 或 preview 有 errors 時不可 commit、防重複 commit
 * - docs/owner 靜態副本與 owner-admin 完全一致
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

var repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
var apiJsCode = readFileSync(join(repoRoot, "owner-admin/js/api.js"), "utf8");
var appJsCode = readFileSync(join(repoRoot, "owner-admin/js/app.js"), "utf8");

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

/**
 * 支援 querySelectorAll("[data-xxx]")：從 innerHTML 解析屬性值，
 * 產生可註冊／觸發事件的假按鈕（同一份 innerHTML 回傳同一批按鈕，
 * 讓 render 註冊的 listener 可以由測試觸發）。
 */
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
    checked: false,
    files: [],
    style: { display: "", opacity: "", setProperty: function () {} },
    classList: makeClassList(),
    _listeners: {},
    addEventListener: function (type, fn) {
      if (!el._listeners[type]) el._listeners[type] = [];
      el._listeners[type].push(fn);
    },
    fire: function (type, event) {
      (el._listeners[type] || []).forEach(function (fn) { fn(event || {}); });
    },
    setAttribute: function () {},
    getAttribute: function () { return null; },
    querySelector: function () { return null; },
    querySelectorAll: function (selector) {
      return queryAttrButtons(el, selector);
    }
  };
  return el;
}

function makeFakeDom() {
  var elements = {};
  var fakeDocument = {
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

async function tick(times) {
  for (var i = 0; i < (times || 1); i++) {
    await new Promise(function (resolve) { setTimeout(resolve, 0); });
  }
}

// ──────────────────────── api.js 測試 ────────────────────────

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

test("api client：getCustomerById／updateCustomerById 使用 by-id customerId 路徑", async function () {
  var ctx = makeApiClient();

  await ctx.api.getCustomerById("cus 001");
  assert.equal(
    ctx.calls[0].url,
    "https://api.example.test/api/owner/customers/by-id/cus%20001"
  );
  assert.equal(ctx.calls[0].options.method, undefined, "詳情應為 GET");

  await ctx.api.updateCustomerById("cus-002", {
    customerName: "王小明",
    phone: ""
  });
  assert.equal(
    ctx.calls[1].url,
    "https://api.example.test/api/owner/customers/by-id/cus-002"
  );
  assert.equal(ctx.calls[1].options.method, "PATCH");
  assert.deepEqual(JSON.parse(ctx.calls[1].options.body), {
    customerName: "王小明",
    phone: ""
  });
  assert.equal(
    ctx.calls[1].options.headers.Authorization,
    "Bearer token-test",
    "沿用既有 Authorization 機制"
  );
});

test("api client：previewCustomerImport／commitCustomerImport 路徑與 body 正確", async function () {
  var ctx = makeApiClient();
  var mapping = { name: "姓名", phone: "電話", birthday: "", note: "", customer_no: "" };

  await ctx.api.previewCustomerImport("姓名,電話\nA,0912345678\n", mapping);
  assert.equal(
    ctx.calls[0].url,
    "https://api.example.test/api/owner/customers/import/preview"
  );
  assert.equal(ctx.calls[0].options.method, "POST");
  assert.deepEqual(JSON.parse(ctx.calls[0].options.body), {
    csvText: "姓名,電話\nA,0912345678\n",
    mapping: mapping
  });

  await ctx.api.commitCustomerImport("姓名,電話\nA,0912345678\n", mapping, "hash-abc");
  assert.equal(
    ctx.calls[1].url,
    "https://api.example.test/api/owner/customers/import/commit"
  );
  assert.equal(ctx.calls[1].options.method, "POST");
  assert.deepEqual(JSON.parse(ctx.calls[1].options.body), {
    csvText: "姓名,電話\nA,0912345678\n",
    mapping: mapping,
    canonicalHash: "hash-abc"
  });
});

test("api client：保留舊 userId API（updateCustomer／getCustomerBookings）以維持相容", async function () {
  var ctx = makeApiClient();
  await ctx.api.updateCustomer("U-legacy", { customerName: "A" });
  assert.equal(
    ctx.calls[0].url,
    "https://api.example.test/api/owner/customers/U-legacy"
  );
  await ctx.api.getCustomerBookings("U-legacy");
  assert.equal(
    ctx.calls[1].url,
    "https://api.example.test/api/owner/customer-bookings?userId=U-legacy"
  );
});

// ──────────────────────── app.js 測試 ────────────────────────

/**
 * 執行 owner-admin app.js 並等 boot 完成。
 * overrides 可覆蓋 ownerApi 個別方法（皆為 spy）。
 */
async function bootOwnerApp(overrides) {
  var dom = makeFakeDom();
  var spy = {
    getCustomers: [],
    getCustomerById: [],
    updateCustomerById: [],
    updateCustomer: [],
    getCustomerBookings: [],
    previewCustomerImport: [],
    commitCustomerImport: [],
    confirmCount: 0
  };

  var api = {
    isConfigured: function () { return true; },
    getSettings: async function () { return {}; },
    getBookingsForMonth: async function () { return { month: "2026-07", days: {} }; },
    getServices: async function () { return []; },
    getSlots: async function () { return []; },
    getCustomers: async function (q) {
      spy.getCustomers.push(q);
      return { ok: true, customers: [] };
    },
    getCustomerById: async function (customerId) {
      spy.getCustomerById.push(customerId);
      return {
        ok: true,
        customerId: customerId,
        userId: "",
        linkedLine: false,
        customerName: "客人",
        phone: "",
        birthday: "",
        note: "",
        bookings: []
      };
    },
    updateCustomerById: async function (customerId, data) {
      spy.updateCustomerById.push({ customerId: customerId, data: data });
      return { ok: true };
    },
    updateCustomer: async function (userId, data) {
      spy.updateCustomer.push({ userId: userId, data: data });
      return { ok: true };
    },
    getCustomerBookings: async function (userId) {
      spy.getCustomerBookings.push(userId);
      return { ok: true, bookings: [] };
    },
    previewCustomerImport: async function (csvText, mapping) {
      spy.previewCustomerImport.push({ csvText: csvText, mapping: mapping });
      return {
        ok: true,
        canonicalHash: "hash-1",
        summary: { total: 1, willCreate: 1, skipped: 0, conflicts: 0, errors: 0, warnings: 0 },
        rows: []
      };
    },
    commitCustomerImport: async function (csvText, mapping, canonicalHash) {
      spy.commitCustomerImport.push({
        csvText: csvText,
        mapping: mapping,
        canonicalHash: canonicalHash
      });
      return {
        ok: true,
        alreadyImported: false,
        summary: { total: 1, created: 1, skipped: 0, conflicts: 0, warnings: 0 },
        rows: []
      };
    }
  };
  Object.assign(api, overrides || {});

  var fileReaders = [];
  function FakeFileReader() {
    this.result = "";
    this.onload = null;
    this.onerror = null;
    this.readAsText = function () {};
    fileReaders.push(this);
  }

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

  new Function("window", "document", "confirm", "FileReader", appJsCode)(
    fakeWindow, dom.document, fakeConfirm, FakeFileReader
  );
  await tick(4);

  return {
    els: dom.elements,
    spy: spy,
    fileReaders: fileReaders
  };
}

/** 以假 FileReader 完成選檔＋讀檔（回傳完成 onload 後的狀態） */
async function loadCsvFile(app, csvText) {
  app.els["import-file"].files = [{ name: "客戶.csv" }];
  app.els["import-file"].fire("change");
  var reader = app.fileReaders[app.fileReaders.length - 1];
  reader.result = csvText;
  reader.onload();
  await tick(1);
}

test("客戶卡片使用 data-customer-id，userId 空白仍可開啟未綁 LINE／無預約客戶", async function () {
  var app = await bootOwnerApp({
    getCustomers: async function () {
      return {
        ok: true,
        customers: [{
          customerId: "cus-1",
          userId: "",
          linkedLine: false,
          customerName: "匯入客",
          phone: "",
          birthday: "",
          bookingCount: 0,
          lastBookingDate: ""
        }]
      };
    },
    getCustomerById: async function (customerId) {
      return {
        ok: true,
        customerId: customerId,
        userId: "",
        linkedLine: false,
        customerName: "匯入客",
        phone: "",
        birthday: "",
        note: "",
        bookings: []
      };
    }
  });

  app.els["customer-search-btn"].fire("click");
  await tick(2);

  var listHtml = app.els["customer-list"].innerHTML;
  assert.ok(listHtml.includes('data-customer-id="cus-1"'), "卡片必須使用 customerId");
  assert.ok(!listHtml.includes("data-user-id"), "卡片不得再使用 data-user-id");

  var cards = app.els["customer-list"].querySelectorAll("[data-customer-id]");
  assert.equal(cards.length, 1);
  cards[0].fire("click");
  await tick(2);

  assert.equal(
    app.els["customer-detail-view"].classList.contains("hidden"),
    false,
    "userId 為空也必須能開啟詳情"
  );
  assert.ok(
    app.els["customer-detail-header"].innerHTML.includes("未綁定 LINE"),
    "linkedLine === false 應顯示未綁定 LINE"
  );
  assert.ok(
    app.els["customer-booking-list"].innerHTML.includes("此客戶尚無預約紀錄"),
    "無預約應顯示尚無預約紀錄"
  );
});

test("linkedLine === true 顯示已綁定 LINE 且不洩漏 LINE userId", async function () {
  var app = await bootOwnerApp({
    getCustomers: async function () {
      return {
        ok: true,
        customers: [{
          customerId: "cus-2",
          userId: "U-line-secret-xyz",
          linkedLine: true,
          customerName: "綁定客",
          phone: "0911222333",
          bookingCount: 3
        }]
      };
    },
    getCustomerById: async function (customerId) {
      return {
        ok: true,
        customerId: customerId,
        userId: "U-line-secret-xyz",
        linkedLine: true,
        customerName: "綁定客",
        phone: "0911222333",
        birthday: "",
        note: "",
        bookings: []
      };
    }
  });

  app.els["customer-search-btn"].fire("click");
  await tick(2);
  app.els["customer-list"].querySelectorAll("[data-customer-id]")[0].fire("click");
  await tick(2);

  var headerHtml = app.els["customer-detail-header"].innerHTML;
  assert.ok(headerHtml.includes("已綁定 LINE"));
  assert.ok(
    !headerHtml.includes("U-line-secret-xyz"),
    "詳情不得顯示 LINE userId"
  );
  assert.ok(
    !app.els["customer-list"].innerHTML.includes("U-line-secret-xyz"),
    "名單不得顯示 LINE userId"
  );
});

test("儲存客戶以 customerId 為準：不要求 userId、電話空白不被阻擋", async function () {
  var app = await bootOwnerApp();

  app.els["customer-search-btn"].fire("click");
  await tick(2);

  // 直接以 getCustomers 空名單開詳情不可行，改由假卡片開啟
  var appWithCustomer = await bootOwnerApp({
    getCustomers: async function () {
      return {
        ok: true,
        customers: [{ customerId: "cus-3", userId: "", linkedLine: false, customerName: "A" }]
      };
    }
  });
  appWithCustomer.els["customer-search-btn"].fire("click");
  await tick(2);
  appWithCustomer.els["customer-list"]
    .querySelectorAll("[data-customer-id]")[0].fire("click");
  await tick(2);

  appWithCustomer.els["customer-edit-name"].value = "改名客";
  appWithCustomer.els["customer-edit-phone"].value = "";
  appWithCustomer.els["customer-edit-birthday"].value = "";
  appWithCustomer.els["customer-edit-note"].value = "";
  appWithCustomer.els["customer-edit-save"].fire("click");
  await tick(3);

  assert.equal(appWithCustomer.spy.updateCustomerById.length, 1, "必須呼叫 by-id PATCH");
  assert.equal(appWithCustomer.spy.updateCustomerById[0].customerId, "cus-3");
  assert.equal(
    appWithCustomer.spy.updateCustomerById[0].data.phone,
    "",
    "電話空白不得被前端阻擋"
  );
  assert.equal(appWithCustomer.spy.updateCustomer.length, 0, "不得呼叫舊 userId PATCH");
  assert.equal(appWithCustomer.spy.getCustomerBookings.length, 0, "不得依賴 userId 查詢");
  assert.equal(
    appWithCustomer.els.status.textContent,
    "客戶資料已更新",
    "電話空白時仍應成功儲存"
  );

  assert.equal(app.spy.updateCustomer.length, 0);
});

test("儲存客戶：姓名仍為必填", async function () {
  var app = await bootOwnerApp({
    getCustomers: async function () {
      return {
        ok: true,
        customers: [{ customerId: "cus-4", userId: "", linkedLine: false, customerName: "A" }]
      };
    }
  });
  app.els["customer-search-btn"].fire("click");
  await tick(2);
  app.els["customer-list"].querySelectorAll("[data-customer-id]")[0].fire("click");
  await tick(2);

  app.els["customer-edit-name"].value = "";
  app.els["customer-edit-save"].fire("click");
  await tick(2);

  assert.equal(app.spy.updateCustomerById.length, 0, "姓名空白不得送出");
  assert.equal(app.els.status.textContent, "請填寫姓名");
});

test("CSV 匯入：preview 送出正確 csvText 與 mapping，只渲染 maskedPreview 電話", async function () {
  var csvText = "姓名,電話\n王小明,0912345678\n";
  var app = await bootOwnerApp({
    previewCustomerImport: async function (text, mapping) {
      app.spy.previewCustomerImport.push({ csvText: text, mapping: mapping });
      return {
        ok: true,
        canonicalHash: "hash-preview",
        summary: { total: 1, willCreate: 1, skipped: 0, conflicts: 0, errors: 0, warnings: 1 },
        rows: [{
          rowNumber: 2,
          outcome: "willCreate",
          errors: [],
          warnings: ["非台灣手機格式，請確認號碼"],
          conflicts: [],
          maskedPreview: {
            name: "王小明",
            phone: "09******78",
            birthday: "",
            note: "",
            customerNo: ""
          }
        }]
      };
    }
  });

  await loadCsvFile(app, csvText);
  assert.equal(
    app.els["import-mapping"].classList.contains("hidden"),
    false,
    "選檔後應顯示欄位對應"
  );

  app.els["import-map-name"].value = "姓名";
  app.els["import-map-phone"].value = "電話";
  app.els["import-preview-btn"].fire("click");
  await tick(3);

  assert.equal(app.spy.previewCustomerImport.length, 1);
  assert.equal(app.spy.previewCustomerImport[0].csvText, csvText);
  assert.deepEqual(app.spy.previewCustomerImport[0].mapping, {
    name: "姓名",
    phone: "電話",
    birthday: "",
    note: "",
    customer_no: ""
  });

  var summaryHtml = app.els["import-summary"].innerHTML;
  ["可建立", "略過", "衝突", "錯誤", "警告"].forEach(function (label) {
    assert.ok(summaryHtml.includes(label), "摘要必須包含「" + label + "」");
  });

  var previewHtml = app.els["import-preview-list"].innerHTML;
  assert.ok(previewHtml.includes("09******78"), "必須顯示遮罩電話");
  assert.ok(previewHtml.includes("可建立"), "outcome 必須有文字標籤");
  assert.ok(previewHtml.includes("第 2 列"), "必須顯示 rowNumber");
  assert.ok(previewHtml.includes("非台灣手機格式"), "必須顯示 warnings");
  assert.ok(
    !previewHtml.includes("0912345678"),
    "嚴禁渲染完整電話"
  );
  assert.ok(
    !app.els["import-summary"].innerHTML.includes("0912345678"),
    "摘要不得含完整電話"
  );

  assert.equal(
    app.els["import-commit-btn"].disabled,
    false,
    "preview 成功且無錯誤時可啟用確認匯入"
  );
});

test("CSV 匯入：同一來源欄不可對應多個目標欄，姓名對應必填", async function () {
  var app = await bootOwnerApp();
  await loadCsvFile(app, "姓名,電話\nA,0911\n");

  app.els["import-map-name"].value = "";
  app.els["import-preview-btn"].fire("click");
  await tick(2);
  assert.equal(app.spy.previewCustomerImport.length, 0, "姓名未對應不得送出");
  assert.equal(app.els.status.textContent, "請選擇姓名對應的來源欄位");

  app.els["import-map-name"].value = "姓名";
  app.els["import-map-phone"].value = "姓名";
  app.els["import-preview-btn"].fire("click");
  await tick(2);
  assert.equal(app.spy.previewCustomerImport.length, 0, "重複來源欄不得送出");
  assert.ok(app.els.status.textContent.includes("不可同時對應多個目標欄位"));
});

test("CSV 匯入：缺 canonicalHash 或 preview 有 errors 時不可 commit", async function () {
  var app = await bootOwnerApp({
    previewCustomerImport: async function () {
      return {
        ok: true,
        canonicalHash: "hash-err",
        summary: { total: 2, willCreate: 1, skipped: 0, conflicts: 0, errors: 1, warnings: 0 },
        rows: []
      };
    }
  });
  await loadCsvFile(app, "姓名\nA\n");
  app.els["import-map-name"].value = "姓名";

  // 尚未 preview：無 canonicalHash
  app.els["import-commit-btn"].fire("click");
  await tick(2);
  assert.equal(app.spy.commitCustomerImport.length, 0, "缺 canonicalHash 不得 commit");
  assert.equal(app.spy.confirmCount, 0, "不得跳出 confirm");

  // preview 有 errors
  app.els["import-preview-btn"].fire("click");
  await tick(3);
  assert.equal(app.els["import-commit-btn"].disabled, true, "有錯誤時按鈕必須停用");
  app.els["import-commit-btn"].fire("click");
  await tick(2);
  assert.equal(app.spy.commitCustomerImport.length, 0, "preview 有 errors 不得 commit");
});

test("CSV 匯入：commit 用相同 csvText／mapping／canonicalHash，成功後防重複並重載名單", async function () {
  var csvText = "姓名,電話\n王小明,0912345678\n";
  var app = await bootOwnerApp();
  await loadCsvFile(app, csvText);
  app.els["import-map-name"].value = "姓名";
  app.els["import-map-phone"].value = "電話";

  app.els["import-preview-btn"].fire("click");
  await tick(3);
  assert.equal(app.els["import-commit-btn"].disabled, false);

  var customersLoadsBefore = app.spy.getCustomers.length;
  app.els["import-commit-btn"].fire("click");
  await tick(4);

  assert.equal(app.spy.confirmCount, 1, "commit 前必須 confirm");
  assert.equal(app.spy.commitCustomerImport.length, 1);
  assert.equal(app.spy.commitCustomerImport[0].csvText, csvText);
  assert.deepEqual(app.spy.commitCustomerImport[0].mapping, {
    name: "姓名",
    phone: "電話",
    birthday: "",
    note: "",
    customer_no: ""
  });
  assert.equal(app.spy.commitCustomerImport[0].canonicalHash, "hash-1");
  assert.ok(
    app.els["import-result"].innerHTML.includes("已建立 1 位客戶"),
    "應顯示 commit 結果"
  );
  assert.ok(
    app.spy.getCustomers.length > customersLoadsBefore,
    "commit 成功後必須重新載入客戶名單"
  );

  // 成功後 canonicalHash 已清除：再點不得重複 commit
  app.els["import-commit-btn"].fire("click");
  await tick(2);
  assert.equal(app.spy.commitCustomerImport.length, 1, "不得重複 commit 同一批次");
  assert.equal(app.els["import-commit-btn"].disabled, true);
});

test("CSV 匯入：請求進行中再點 commit 不會重複送出", async function () {
  var resolveCommit;
  var app = await bootOwnerApp({
    commitCustomerImport: function (csvText, mapping, canonicalHash) {
      app.spy.commitCustomerImport.push({ canonicalHash: canonicalHash });
      return new Promise(function (resolve) {
        resolveCommit = function () {
          resolve({
            ok: true,
            alreadyImported: false,
            summary: { total: 1, created: 1, skipped: 0, conflicts: 0, warnings: 0 },
            rows: []
          });
        };
      });
    }
  });
  await loadCsvFile(app, "姓名\nA\n");
  app.els["import-map-name"].value = "姓名";
  app.els["import-preview-btn"].fire("click");
  await tick(3);

  app.els["import-commit-btn"].fire("click");
  await tick(1);
  assert.equal(app.els["import-commit-btn"].disabled, true, "處理中按鈕必須停用");
  assert.equal(app.els["import-commit-btn"].textContent, "匯入處理中…");

  app.els["import-commit-btn"].fire("click");
  await tick(1);
  assert.equal(app.spy.commitCustomerImport.length, 1, "進行中不得重複送出");
  assert.equal(app.spy.confirmCount, 1, "進行中不得再次 confirm");

  resolveCommit();
  await tick(3);
  assert.equal(app.els["import-commit-btn"].textContent, "確認匯入");
});

test("CSV 匯入：後端回傳 alreadyImported 時清楚顯示先前已匯入", async function () {
  var app = await bootOwnerApp({
    commitCustomerImport: async function () {
      return {
        ok: true,
        alreadyImported: true,
        summary: { total: 1, created: 1, skipped: 0, conflicts: 0, warnings: 0 }
      };
    }
  });
  await loadCsvFile(app, "姓名\nA\n");
  app.els["import-map-name"].value = "姓名";
  app.els["import-preview-btn"].fire("click");
  await tick(3);
  app.els["import-commit-btn"].fire("click");
  await tick(4);

  assert.ok(
    app.els["import-result"].innerHTML.includes("先前已匯入"),
    "冪等批次必須清楚顯示先前已匯入"
  );
  assert.ok(
    app.els["import-result"].innerHTML.includes("未重複建立"),
    "必須說明不重複建立"
  );
});

test("CSV 匯入：更換檔案後清除舊 preview、canonicalHash 與 commit 狀態", async function () {
  var app = await bootOwnerApp();
  await loadCsvFile(app, "姓名\nA\n");
  app.els["import-map-name"].value = "姓名";
  app.els["import-preview-btn"].fire("click");
  await tick(3);
  assert.equal(app.els["import-commit-btn"].disabled, false);

  await loadCsvFile(app, "姓名\nB\n");
  assert.equal(
    app.els["import-commit-btn"].disabled,
    true,
    "更換檔案後必須重新 preview 才可 commit"
  );
  assert.equal(app.els["import-summary"].innerHTML, "", "舊摘要必須清除");
  assert.equal(app.els["import-preview-list"].innerHTML, "", "舊列表必須清除");

  app.els["import-commit-btn"].fire("click");
  await tick(2);
  assert.equal(app.spy.commitCustomerImport.length, 0, "舊 canonicalHash 不得沿用");
});

test("CSV 匯入：非 .csv 檔案被拒絕", async function () {
  var app = await bootOwnerApp();
  app.els["import-file"].files = [{ name: "客戶.xlsx" }];
  app.els["import-file"].fire("change");
  await tick(1);

  assert.equal(app.els.status.textContent, "請選擇 .csv 檔案");
  assert.equal(app.els["import-preview-btn"].disabled, true);
});

// ──────────────────────── 靜態檔案測試 ────────────────────────

test("owner-admin 與 docs/owner 四個檔案完全一致", function () {
  ["index.html", "js/api.js", "js/app.js", "css/style.css"].forEach(function (file) {
    var ownerAdmin = readFileSync(join(repoRoot, "owner-admin", file), "utf8");
    var docsOwner = readFileSync(join(repoRoot, "docs/owner", file), "utf8");
    assert.equal(docsOwner, ownerAdmin, "docs/owner/" + file + " 必須與 owner-admin 一致");
  });
});

test("index.html：cache-busting 已更新、電話標示選填、空名單文案不再要求預約", function () {
  var html = readFileSync(join(repoRoot, "owner-admin/index.html"), "utf8");
  assert.ok(!html.includes("v=20260719001"), "舊版本號必須全部更新");
  assert.ok(!html.includes("v=20260719002"), "舊版本號必須全部更新");
  assert.ok(!html.includes("v=20260719003"), "舊版本號必須全部更新");
  assert.ok(!html.includes("v=20260719004"), "舊版本號必須全部更新");
  assert.ok(!html.includes("v=20260719005"), "舊版本號必須全部更新");
  assert.ok(html.includes("css/style.css?v=20260719006"));
  assert.ok(html.includes("js/app.js?v=20260719006"));
  assert.ok(html.includes("電話（選填）"), "電話欄位必須標示選填");
  assert.ok(html.includes("accept=\".csv\""), "檔案選擇必須限制 .csv");

  var appJs = readFileSync(join(repoRoot, "owner-admin/js/app.js"), "utf8");
  assert.ok(!appJs.includes("需有預約紀錄"), "空名單文案不得再要求預約紀錄");
  assert.ok(!appJs.includes("data-user-id"), "app.js 不得再使用 data-user-id");
});
test("設定頁：載入 notice days、前端驗證、防重複儲存", async function () {
  var saveCalls = [];
  var resolveUpdate;
  var updateSettings = async function (userId, payload) {
    saveCalls.push({ userId: userId, payload: payload });
    await new Promise(function (res) { resolveUpdate = res; });
    return { ok: true, settings: {} };
  };
  var app = await bootOwnerApp({
    getSettings: async function () {
      return {
        brandName: "工作室",
        bookingMinNoticeDays: 2,
        cancellationMinNoticeDays: 3
      };
    },
    updateSettings: updateSettings
  });

  assert.equal(app.els["booking-min-notice-days"].value, "2");
  assert.equal(app.els["cancellation-min-notice-days"].value, "3");

  app.els["booking-min-notice-days"].value = "abc";
  app.els["save-settings"].fire("click");
  await tick(3);
  assert.equal(saveCalls.length, 0, "非法輸入不得送出");
  assert.ok(app.els.status.textContent.indexOf("0～30") !== -1);

  app.els["booking-min-notice-days"].value = "5";
  app.els["cancellation-min-notice-days"].value = "7";
  app.els["save-settings"].fire("click");
  await tick(1);
  app.els["save-settings"].fire("click");
  await tick(1);
  assert.equal(saveCalls.length, 1, "防重複點擊：進行中不得重複呼叫");
  resolveUpdate();
  await tick(5);
  assert.equal(saveCalls[0].payload.bookingMinNoticeDays, 5);
  assert.equal(saveCalls[0].payload.cancellationMinNoticeDays, 7);
});
