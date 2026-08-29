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
  var docListeners = {};
  var fakeDocument = {
    addEventListener: function (type, fn) {
      if (!docListeners[type]) docListeners[type] = [];
      docListeners[type].push(fn);
    },
    getElementById: function (elementId) {
      if (!elements[elementId]) {
        elements[elementId] = makeElement(elementId);
      }
      return elements[elementId];
    },
    querySelectorAll: function () { return []; },
    documentElement: makeElement("__root__"),
    body: makeElement("__body__")
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
async function bootOwnerApp(overrides, options) {
  var dom = makeFakeDom();
  var spy = {
    getCustomers: [],
    getCustomerById: [],
    updateCustomerById: [],
    updateCustomer: [],
    getCustomerBookings: [],
    previewCustomerImport: [],
    commitCustomerImport: [],
    confirmCount: 0,
    closeWindowCount: 0
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
    BEAUTY_CONFIG: (options && options.beautyConfig) || {
      PRODUCT_TIER: "ai", CUSTOMER_IMPORT_ENABLED: true
    },
    beautyUser: { userId: "U-owner" },
    beautyLiffReady: Promise.resolve(),
    scrollTo: function () {},
    ownerApi: api,
    liff: {
      isInClient: function () {
        return !(options && options.isInClient === false);
      },
      closeWindow: function () { spy.closeWindowCount += 1; }
    }
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

async function confirmImport(app) {
  app.els["import-commit-btn"].fire("click");
  await tick(1);
  app.els["import-confirm-submit"].fire("click");
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
  assert.equal(appWithCustomer.els["customer-edit-save"].disabled, true,
    "儲存成功且欄位與後端一致後，按鈕必須熄滅");

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
    customer_no: "",
    previous_service: "",
    previous_service_date: ""
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
  await tick(1);
  assert.equal(
    app.els["import-confirm-modal"].classList.contains("hidden"),
    false,
    "應開啟品牌化的自訂確認視窗"
  );
  assert.equal(app.els["import-confirm-create-count"].textContent, "1");
  assert.equal(app.els["import-confirm-excluded-count"].textContent, "0");
  assert.equal(app.spy.commitCustomerImport.length, 0, "確認前不得送出");
  assert.equal(app.spy.confirmCount, 0, "匯入流程不得使用瀏覽器原生 confirm");
  app.els["import-confirm-submit"].fire("click");
  await tick(4);

  assert.equal(
    app.els["import-confirm-modal"].classList.contains("hidden"),
    true,
    "送出後應關閉自訂確認視窗"
  );
  assert.equal(app.spy.commitCustomerImport.length, 1);
  assert.equal(app.spy.commitCustomerImport[0].csvText, csvText);
  assert.deepEqual(app.spy.commitCustomerImport[0].mapping, {
    name: "姓名",
    phone: "電話",
    birthday: "",
    note: "",
    customer_no: "",
    previous_service: "",
    previous_service_date: ""
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

test("CSV 匯入：成功後才顯示關閉出口，點擊後關閉 LIFF 視窗", async function () {
  var app = await bootOwnerApp();
  assert.equal(app.els["import-close-btn"].classList.contains("hidden"), true);

  await loadCsvFile(app, "姓名\n王小明\n");
  app.els["import-map-name"].value = "姓名";
  app.els["import-preview-btn"].fire("click");
  await tick(3);
  assert.equal(app.els["import-close-btn"].classList.contains("hidden"), true);

  await confirmImport(app);
  await tick(4);
  assert.equal(app.els["import-close-btn"].classList.contains("hidden"), false);

  app.els["import-close-btn"].fire("click");
  assert.equal(app.spy.closeWindowCount, 1);
  assert.equal(
    app.els["customer-import-card"].classList.contains("hidden"),
    true,
    "關閉時匯入區應立即收合"
  );
});

test("CSV 匯入：一般瀏覽器無法關閉頁籤時，收合匯入區並返回客戶名單", async function () {
  var app = await bootOwnerApp(undefined, { isInClient: false });
  await loadCsvFile(app, "姓名\n王小明\n");
  app.els["import-map-name"].value = "姓名";
  app.els["import-preview-btn"].fire("click");
  await tick(3);
  await confirmImport(app);
  await tick(4);

  app.els["import-close-btn"].fire("click");
  assert.equal(app.spy.closeWindowCount, 0);
  assert.equal(app.els["customer-import-card"].classList.contains("hidden"), true);
  assert.equal(app.els["customer-list-view"].classList.contains("hidden"), false);
  assert.equal(app.els.status.textContent, "匯入已完成，已返回客戶名單。");
});

test("CSV 匯入：標準版關閉匯入入口，旗艦版維持開啟", async function () {
  var standard = await bootOwnerApp(undefined, {
    beautyConfig: { PRODUCT_TIER: "standard", CUSTOMER_IMPORT_ENABLED: false }
  });
  assert.equal(
    standard.els["customer-import-card"].classList.contains("hidden"),
    true,
    "標準版不得顯示客戶匯入入口"
  );

  var flagship = await bootOwnerApp(undefined, {
    beautyConfig: { PRODUCT_TIER: "ai", CUSTOMER_IMPORT_ENABLED: true }
  });
  assert.equal(
    flagship.els["customer-import-card"].classList.contains("hidden"),
    false,
    "旗艦版應保留客戶匯入入口"
  );
});

test("CSV 匯入：標準版顯示平台加購提示，已開通方案不顯示", function () {
  var html = readFileSync(join(repoRoot, "owner-admin/index.html"), "utf8");
  var app = readFileSync(join(repoRoot, "owner-admin/js/app.js"), "utf8");
  assert.match(html, /id="customer-import-upgrade"/);
  assert.match(html, /既有客戶名單批次匯入/);
  assert.doesNotMatch(html, /需要匯入既有客戶名單？/);
  assert.match(html, /可洽平台加購「客戶資料匯入」功能/);
  assert.match(app, /customerImportUpgrade\.hidden = customerImportEnabled/);
  assert.match(app, /classList\.toggle\("hidden", customerImportEnabled\)/);
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

  await confirmImport(app);
  await tick(1);
  assert.equal(app.els["import-commit-btn"].disabled, true, "處理中按鈕必須停用");
  assert.equal(app.els["import-commit-btn"].textContent, "匯入處理中…");

  app.els["import-commit-btn"].fire("click");
  await tick(1);
  assert.equal(app.spy.commitCustomerImport.length, 1, "進行中不得重複送出");
  assert.equal(
    app.els["import-confirm-modal"].classList.contains("hidden"),
    true,
    "處理中不得再次開啟確認視窗"
  );

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
  await confirmImport(app);
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

test("CSV 匯入：Google Drive 無副檔名文字檔仍可讀取內容", async function () {
  var app = await bootOwnerApp();
  app.els["import-file"].files = [{ name: "朱麗葉客戶資料" }];
  app.els["import-file"].fire("change");
  var reader = app.fileReaders[app.fileReaders.length - 1];
  reader.result = "姓名,電話\n王小美,0912-345-678\n";
  reader.onload();
  await tick(1);

  assert.equal(app.els.status.textContent, "");
  assert.equal(app.els["import-preview-btn"].disabled, false);
});

// ──────────────────────── 靜態檔案測試 ────────────────────────

test("owner-admin 與 docs/owner 四個檔案完全一致", function () {
  ["index.html", "js/api.js", "js/app.js", "css/style.css", "customer-import-template.csv",
    "customer-import-template-v2.csv"].forEach(function (file) {
    var ownerAdmin = readFileSync(join(repoRoot, "owner-admin", file), "utf8");
    var docsOwner = readFileSync(join(repoRoot, "docs/owner", file), "utf8");
    assert.equal(docsOwner, ownerAdmin, "docs/owner/" + file + " 必須與 owner-admin 一致");
  });
});

test("CSV 匯入區提供格式說明與可下載範本", function () {
  var html = readFileSync(join(repoRoot, "owner-admin/index.html"), "utf8");
  var template = readFileSync(
    join(repoRoot, "owner-admin/customer-import-template-v2.csv"),
    "utf8"
  );

  assert.ok(html.includes("CSV 格式與操作說明"));
  assert.ok(html.includes("href=\"customer-import-template-v2.csv?v=20260822002\""));
  assert.ok(html.includes("download=\"客戶匯入範本.csv\""));
  assert.ok(html.includes('id="customer-import-template-download"'));
  assert.ok(html.includes("生日請填西元格式"));
  assert.equal(template.split(/\r?\n/)[0],
    "姓名,電話,生日,備註,客戶編號,曾做過的服務項目,服務日期");
  assert.ok(html.includes('id="import-map-previous_service"'));
  assert.ok(html.includes('id="import-map-previous_service_date"'));
  var app = readFileSync(join(repoRoot, "owner-admin/js/app.js"), "utf8");
  assert.match(app, /liff\.isInClient\(\)/);
  assert.match(app, /\/owner\/customer-import-template-v2\.csv/);
  assert.match(app, /new Blob\(\[csvText\]/);
  assert.match(app, /liff\.openWindow\(\{ url: templateUrl, external: true \}\)/);
  assert.match(app, /previous_service/);
  assert.match(app, /previousServiceDate/);
});

test("營業時段週幾、開始、結束與刪除欄在手機版保持對齊", function () {
  var css = readFileSync(join(repoRoot, "owner-admin/css/style.css"), "utf8");
  assert.match(css, /grid-template-columns:\s*76px repeat\(2, minmax\(0, 1fr\)\) 44px/);
  assert.match(css, /\.slot-row select,\s*\n\.slot-time-cell[\s\S]*?width:\s*100%[\s\S]*?min-width:\s*0[\s\S]*?height:\s*44px[\s\S]*?overflow:\s*hidden/);
  assert.match(css, /\.slot-time-cell input\[type="time"\][\s\S]*?max-width:\s*100%[\s\S]*?height:\s*42px[\s\S]*?overflow:\s*hidden[\s\S]*?-webkit-appearance:\s*none[\s\S]*?text-align:\s*center/);
  assert.match(css, /\.slot-row \.slot-weekday[\s\S]*?font-size:\s*1rem[\s\S]*?text-align:\s*center[\s\S]*?text-align-last:\s*center/);
  assert.match(css, /::-webkit-date-and-time-value[\s\S]*?align-items:\s*center[\s\S]*?justify-content:\s*center[\s\S]*?height:\s*100%/);
  assert.match(css, /-webkit-text-fill-color:\s*var\(--text\)[\s\S]*?font-size:\s*1rem/);
  assert.match(css, /\.slot-row \.slot-remove[\s\S]*?width:\s*44px[\s\S]*?height:\s*44px/);
  assert.match(appJsCode, /class="slot-time-cell"/);
  assert.match(appJsCode, /visually-hidden">開始時間/);
  assert.match(appJsCode, /visually-hidden">結束時間/);
});

test("index.html：cache-busting 已更新、電話標示選填、空名單文案不再要求預約", function () {
  var html = readFileSync(join(repoRoot, "owner-admin/index.html"), "utf8");
  assert.ok(!html.includes("v=20260719001"), "舊版本號必須全部更新");
  assert.ok(!html.includes("v=20260719002"), "舊版本號必須全部更新");
  assert.ok(!html.includes("v=20260719003"), "舊版本號必須全部更新");
  assert.ok(!html.includes("v=20260719004"), "舊版本號必須全部更新");
  assert.ok(!html.includes("v=20260719005"), "舊版本號必須全部更新");
  assert.ok(!html.includes("v=20260719006"), "舊版本號必須全部更新");
  assert.ok(!html.includes("v=20260720001"), "舊版本號必須全部更新");
  assert.ok(!html.includes("v=20260720002"), "舊版本號必須全部更新");
  assert.ok(!html.includes("v=20260720003"), "舊版本號必須全部更新");
  assert.ok(!html.includes("v=20260720004"), "舊版本號必須全部更新");
  assert.ok(!html.includes("v=20260721001"), "舊版本號必須全部更新");
  assert.ok(!html.includes("v=20260721002"), "舊版本號必須全部更新");
  assert.ok(!html.includes("v=20260721003"), "舊版本號必須全部更新");
  assert.ok(!html.includes("v=20260722002"), "舊版本號必須全部更新");
  assert.ok(html.includes("/owner/css/style.css?v=20260825002"));
  assert.ok(html.includes("/owner-admin/css/style.css?v=20260825002"));
  assert.ok(html.includes("/docs/owner/css/style.css?v=20260825002"));
  assert.ok(html.includes('window.location.protocol === "file:"'));
  assert.ok(html.includes("css/style.css?v=20260825002"));
  assert.ok(html.includes("js/api.js?v=20260822001"));
  assert.ok(html.includes("js/app.js?v=20260825005"));
  assert.match(appJsCode, /state\.settings && state\.settings\.customerEntryKey/);
  assert.match(appJsCode, /config\.CUSTOMER_LIFF_URL/);
  assert.match(appJsCode, /studio_entry=/);
  assert.match(appJsCode, /customerLiffUrl \+ "\/studio\/"/);
  assert.doesNotMatch(appJsCode, /function getClaimBaseUrl\(\)[\s\S]{0,500}CUSTOMER_APP_URL/);
  assert.match(html, /AI 秘書設定/);
  assert.match(html, /套用霧眉新客評估規範/);
  assert.match(appJsCode, /applyBrowAiPreset/);
  assert.match(html, /套用霧唇新客評估規範/);
  assert.match(appJsCode, /applyLipAiPreset/);
  assert.match(html, /套用全方位紋繡新客評估規範/);
  assert.match(appJsCode, /applyAllRoundAiPreset/);
  assert.match(appJsCode, /所有新客最終由全方位紋繡師審核/);
  assert.match(appJsCode, /必須先確認客人詢問的施作部位/);
  assert.match(appJsCode, /所有新客最終由霧唇師審核/);
  assert.match(appJsCode, /不得診斷、判定適合施作、建議停藥、承諾改色結果或保證效果/);
  assert.match(appJsCode, /未經本人審核通過，不得開放時段/);
  assert.match(html, /id="customer-ai-business-type"/);
  assert.doesNotMatch(html, /<input[^>]+id="customer-ai-business-type"/);
  assert.match(html, /<select id="customer-ai-business-type">/);
  assert.match(html, /全方位紋繡師/);
  assert.doesNotMatch(html, /眼線／美瞳線紋繡師/);
  assert.doesNotMatch(html, /光影臥蠶紋繡師/);
  assert.doesNotMatch(html, />綜合紋繡師</);
  assert.match(html, /id="customer-ai-knowledge"/);
  assert.match(appJsCode, /customerAiBusinessType/);
  assert.match(appJsCode, /customerAiKnowledge/);
  assert.match(html, /<body class="auth-pending">/);
  assert.match(html,
    /<style>body\.auth-pending \.app>:not\(\.header\):not\(#status\):not\(#owner-onboarding\):not\(#owner-tenant-selector\)\{visibility:hidden\}<\/style>/);
  assert.match(appJsCode, /document\.body\.classList\.remove\("auth-pending"\)/);
  var bootCode = appJsCode.slice(appJsCode.indexOf("async function boot()"));
  assert.ok(
    bootCode.indexOf('document.body.classList.remove("auth-pending")') <
      bootCode.indexOf("loadMonthBookings(getCurrentMonthIso(), today)"),
    "業主身分確認後應立即顯示管理中心，不等待所有次要資料"
  );
  assert.match(appJsCode, /Promise\.all\(\[\s*loadSettings\(\),\s*refreshAiCapability\(\),\s*loadMonthBookings/);
  assert.match(appJsCode, /function focusPendingAiInquiry\(\)/);
  assert.match(appJsCode, /data-ai-inquiry-follow-up/);
  assert.match(appJsCode, /details\.open = true/);
  assert.match(appJsCode, /scrollIntoView\(\{ behavior: "smooth", block: "center" \}\)/);
  assert.ok(html.includes('id="customer-ai-settings"'));
  assert.ok(html.includes('id="customer-ai-enabled"'));
  assert.ok(html.includes('id="customer-ai-tone"'));
  assert.match(appJsCode, /customerAiEnabled/);
  assert.match(appJsCode, /PRODUCT_TIER === "ai"/);
  assert.match(html, /<title>Juliet Studio OS \| Owner Portal<\/title>/);
  assert.match(html, /<h1 class="brand visually-hidden" id="brand">Juliet Studio OS<\/h1>/);
  assert.match(appJsCode, /document\.title = state\.settings\.brandName \+ "｜業主管理"/);
  assert.ok(html.includes("客戶最晚預約時間"), "須有最晚預約設定欄位");
  assert.ok(html.includes("客戶最晚取消時間"), "須有最晚取消設定欄位");
  assert.ok(html.includes("電話（選填）"), "電話欄位必須標示選填");
  assert.ok(html.includes("application/octet-stream"),
    "Android／Google Drive 檔案選擇必須接受通用文字檔 MIME");

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
        cancellationMinNoticeDays: 3,
        arrivalReminderMinutes: 5
      };
    },
    updateSettings: updateSettings
  });

  assert.equal(app.els["booking-min-notice-days"].value, "2");
  assert.equal(app.els["cancellation-min-notice-days"].value, "3");
  assert.equal(app.els["arrival-reminder-minutes"].value, "5");

  app.els["booking-min-notice-days"].value = "abc";
  app.els["save-settings"].fire("click");
  await tick(3);
  assert.equal(saveCalls.length, 0, "非法輸入不得送出");
  assert.ok(app.els.status.textContent.indexOf("0～30") !== -1);

  app.els["booking-min-notice-days"].value = "5";
  app.els["cancellation-min-notice-days"].value = "7";
  app.els["arrival-reminder-minutes"].value = "5";
  app.els["save-settings"].fire("click");
  await tick(1);
  app.els["save-settings"].fire("click");
  await tick(1);
  assert.equal(saveCalls.length, 1, "防重複點擊：進行中不得重複呼叫");
  resolveUpdate();
  await tick(5);
  assert.equal(saveCalls[0].payload.bookingMinNoticeDays, 5);
  assert.equal(saveCalls[0].payload.cancellationMinNoticeDays, 7);
  assert.equal(saveCalls[0].payload.arrivalReminderMinutes, 5);
});

test("回訪週期、預約網址與主要儲存按鈕在手機版維持整齊對齊", function () {
  var css = readFileSync(join(repoRoot, "owner-admin/css/style.css"), "utf8");
  var html = readFileSync(join(repoRoot, "owner-admin/index.html"), "utf8");
  assert.match(css, /#svc-follow-up-days,[\s\S]*#customer-booking-url[\s\S]*min-width:\s*0;[\s\S]*max-width:\s*100%;[\s\S]*min-height:\s*48px;/);
  assert.match(css, /#svc-submit,[\s\S]*#save-settings[\s\S]*align-items:\s*center;[\s\S]*justify-content:\s*center;[\s\S]*min-height:\s*52px;/);
  assert.match(html, /css\/style\.css\?v=20260825002/);
});

test("營業時段儲存成功後按鈕停用，異動後才重新啟用", function () {
  assert.match(appJsCode, /function setSlotsDirty\(dirty\)/);
  assert.match(appJsCode, /els\.saveSlots\.disabled = slotSaveBusy \|\| !state\.slotsDirty/);
  assert.match(appJsCode, /loadSlots\(\)[\s\S]*renderSlotEditor\(\);[\s\S]*setSlotsDirty\(false\)/);
  assert.match(appJsCode, /field\.addEventListener\("change", function \(\) \{ setSlotsDirty\(true\); \}\)/);
  assert.match(appJsCode, /await window\.ownerApi\.saveSlots[\s\S]*setSlotsDirty\(JSON\.stringify\(collectSlotsFromEditor\(\)\) !== savedSnapshot\)/);
  assert.match(appJsCode, /catch \(error\) \{[\s\S]*setSlotsDirty\(true\);[\s\S]*營業時段/);
});
