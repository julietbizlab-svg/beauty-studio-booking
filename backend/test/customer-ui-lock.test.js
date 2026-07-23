/**
 * customer-ui/js/app.js 客戶資料鎖定行為測試（node:test ＋ assert，零依賴）
 *
 * 以最小假 DOM 執行 app.js 的 boot 流程，驗證：
 * - 已建檔客戶：姓名、電話、生日在客人端鎖定（readOnly／disabled），
 *   並顯示「姓名、電話與生日已建檔」提示
 * - localStorage 值不得覆蓋伺服器既有資料
 * - 未建檔客戶：欄位可填寫、生日可留空
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

var repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
var appJsCode = readFileSync(join(repoRoot, "customer-ui/js/app.js"), "utf8");

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

function makeElement(id) {
  return {
    id: id,
    value: "",
    textContent: "",
    innerHTML: "",
    className: "",
    hidden: false,
    disabled: false,
    readOnly: false,
    src: "",
    style: { display: "", setProperty: function () {} },
    classList: makeClassList(),
    addEventListener: function () {},
    setAttribute: function () {},
    getAttribute: function () { return null; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; }
  };
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

function makeLocalStorage(initial) {
  var store = Object.assign({}, initial || {});
  return {
    getItem: function (key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem: function (key, value) { store[key] = String(value); },
    removeItem: function (key) { delete store[key]; }
  };
}

/**
 * 執行 app.js 並等 boot 完成。
 * @param {object|null} serverCustomer /api/customer/me 的 customer（null＝未建檔）
 */
async function bootCustomerApp(serverCustomer) {
  var dom = makeFakeDom();
  var savedLocalProfile = JSON.stringify({
    customerName: "localStorage姓名",
    phone: "0900000000",
    birthday: "1980-01-01"
  });

  var fakeWindow = {
    beautyUser: { userId: "U-ui-test", displayName: "LINE暱稱", pictureUrl: "" },
    beautyLiffReady: Promise.resolve(),
    localStorage: makeLocalStorage({
      "beauty_customer_profile_U-ui-test": savedLocalProfile
    }),
    beautyApi: {
      isConfigured: function () { return true; },
      getSettings: async function () { return {}; },
      getServices: async function () { return []; },
      getCustomerMe: async function () {
        return serverCustomer
          ? { ok: true, exists: true, customer: serverCustomer }
          : { ok: true, exists: false, customer: null };
      },
      getMyBookings: async function () { return []; }
    }
  };

  new Function("window", "document", appJsCode)(fakeWindow, dom.document);

  // boot 內全為已 resolve 的 promise，等兩輪 macrotask 必定完成
  await new Promise(function (resolve) { setTimeout(resolve, 0); });
  await new Promise(function (resolve) { setTimeout(resolve, 0); });

  return dom.elements;
}

test("已建檔客戶：姓名、電話、生日鎖定且以伺服器資料為準（localStorage 不得覆蓋）", async function () {
  var els = await bootCustomerApp({
    customerName: "伺服器姓名",
    phone: "0911222333",
    birthday: "1990-01-01"
  });

  var name = els["customer-name"];
  var phone = els["customer-phone"];
  var birthday = els["customer-birthday"];
  var hint = els["profile-locked-hint"];

  assert.equal(name.value, "伺服器姓名", "姓名必須為伺服器資料");
  assert.equal(phone.value, "0911222333", "電話必須為伺服器資料");
  assert.equal(birthday.value, "1990-01-01", "生日必須為伺服器資料");
  assert.notEqual(name.value, "localStorage姓名", "localStorage 不得覆蓋伺服器姓名");

  assert.equal(name.readOnly, true, "姓名應鎖定");
  assert.equal(phone.readOnly, true, "電話應鎖定");
  assert.equal(birthday.disabled, true, "生日應鎖定（date input 用 disabled）");
  assert.equal(name.classList.contains("input-locked"), true);
  assert.equal(birthday.classList.contains("input-locked"), true);
  assert.equal(hint.hidden, false, "應顯示已建檔提示");
});

test("未建檔客戶：欄位可填寫、生日可留空、不顯示鎖定提示", async function () {
  var els = await bootCustomerApp(null);

  var name = els["customer-name"];
  var phone = els["customer-phone"];
  var birthday = els["customer-birthday"];
  var hint = els["profile-locked-hint"];

  assert.equal(name.readOnly, false, "姓名應可填寫");
  assert.equal(phone.readOnly, false, "電話應可填寫");
  assert.equal(birthday.disabled, false, "生日應可填寫");
  assert.equal(hint.hidden, true, "不得顯示鎖定提示");

  // 未建檔時允許 localStorage 預填（非覆蓋伺服器資料）
  assert.equal(name.value, "localStorage姓名");
  assert.equal(birthday.value, "1980-01-01");
});

test("customer-ui 提示文字包含姓名、電話與生日已建檔", function () {
  var html = readFileSync(join(repoRoot, "customer-ui/index.html"), "utf8");
  assert.ok(
    html.includes("姓名、電話與生日已建檔，如需修改請聯絡店家"),
    "提示文字必須為指定內容"
  );
});
