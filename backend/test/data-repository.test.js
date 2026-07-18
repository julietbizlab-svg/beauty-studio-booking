/**
 * data-repository.js（資料後端 selector）與 /api/health 單元測試
 * （node:test ＋ assert，零依賴）
 *
 * 使用最小 Fake D1 驗證 dispatch；不連 Notion、Cloudflare 或任何遠端服務，
 * 不執行 migration、不讀任何 SQL 草稿。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as dataRepository from "../src/data-repository.js";
import {
  getDataBackendName,
  ensureDataEnv,
  listServices
} from "../src/data-repository.js";
import worker from "../src/index.js";

var TENANT = "tenant-selector-001";
var SECRET_TOKEN = "secret-token-abc-123";
var SECRET_TENANT = "tenant-secret-001";

/** 最小 Fake D1：記錄每次 prepare 的 SQL 與 bind，回傳測試指定資料 */
function makeFakeDb(handler) {
  var db = {
    calls: [],
    prepare: function (sql) {
      return {
        bind: function () {
          var binds = Array.prototype.slice.call(arguments);
          return {
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
              return { meta: { changes: 1 } };
            }
          };
        }
      };
    },
    batch: async function (statements) {
      return statements.map(function () { return { meta: { changes: 1 } }; });
    }
  };
  return db;
}

function fullNotionEnv(overrides) {
  return Object.assign({
    NOTION_TOKEN: SECRET_TOKEN,
    NOTION_DATABASE_SERVICES: "db-services-id",
    NOTION_DATABASE_SLOTS: "db-slots-id",
    NOTION_DATABASE_BOOKINGS: "db-bookings-id",
    NOTION_DATABASE_SETTINGS: "db-settings-id"
  }, overrides || {});
}

// ── getDataBackendName ───────────────────────────────────────

test("getDataBackendName：{}、未提供、null、空字串都回 notion", function () {
  var defaultEnvs = [
    {},
    { DATA_BACKEND: undefined },
    { DATA_BACKEND: null },
    { DATA_BACKEND: "" }
  ];
  defaultEnvs.forEach(function (env, i) {
    assert.equal(getDataBackendName(env), "notion", "案例 " + i + " 應回 notion");
  });
});

test("getDataBackendName：DATA_BACKEND='notion' 回 notion", function () {
  assert.equal(getDataBackendName({ DATA_BACKEND: "notion" }), "notion");
});

test("getDataBackendName：DATA_BACKEND='d1' 回 d1", function () {
  assert.equal(getDataBackendName({ DATA_BACKEND: "d1" }), "d1");
});

test("getDataBackendName：非法值回 500 且訊息不含實際非法值", function () {
  var badValues = ["mysql", "postgres-evil", "D1", "Notion", "sqlite"];
  badValues.forEach(function (value) {
    assert.throws(
      function () { getDataBackendName({ DATA_BACKEND: value }); },
      function (error) {
        assert.equal(error.status, 500, "非法值「" + value + "」應回 500");
        assert.ok(
          !error.message.includes(value),
          "錯誤訊息不得包含實際非法值「" + value + "」"
        );
        return true;
      }
    );
  });
});

// ── ensureDataEnv ────────────────────────────────────────────

test("ensureDataEnv 預設與 notion 模式走 Notion 環境檢查", function () {
  // 缺 NOTION_TOKEN → Notion 檢查的 500
  [{}, { DATA_BACKEND: "notion" }].forEach(function (env) {
    assert.throws(
      function () { ensureDataEnv(env); },
      function (error) {
        assert.equal(error.status, 500);
        assert.match(error.message, /NOTION_TOKEN/);
        return true;
      }
    );
  });

  // 有 token 但缺資料庫 ID → 仍為 Notion 檢查
  assert.throws(
    function () { ensureDataEnv({ DATA_BACKEND: "notion", NOTION_TOKEN: SECRET_TOKEN }); },
    function (error) {
      assert.equal(error.status, 500);
      assert.match(error.message, /Notion 資料庫 ID/);
      return true;
    }
  );

  // 完整 Notion 環境：預設與 notion 模式都應通過
  assert.doesNotThrow(function () { ensureDataEnv(fullNotionEnv()); });
  assert.doesNotThrow(function () {
    ensureDataEnv(fullNotionEnv({ DATA_BACKEND: "notion" }));
  });
});

test("ensureDataEnv d1 模式走 D1 檢查：缺 DB 或 TENANT_ID 回 500", function () {
  assert.throws(
    function () { ensureDataEnv({ DATA_BACKEND: "d1" }); },
    function (error) {
      assert.equal(error.status, 500);
      assert.match(error.message, /D1 資料庫綁定|DB/);
      return true;
    }
  );

  assert.throws(
    function () { ensureDataEnv({ DATA_BACKEND: "d1", DB: makeFakeDb() }); },
    function (error) {
      assert.equal(error.status, 500);
      assert.match(error.message, /TENANT_ID/);
      return true;
    }
  );

  // d1 模式只需 DB＋TENANT_ID，不得要求任何 Notion 設定
  assert.doesNotThrow(function () {
    ensureDataEnv({ DATA_BACKEND: "d1", DB: makeFakeDb(), TENANT_ID: TENANT });
  });
});

test("ensureDataEnv 錯誤訊息不洩漏環境設定的實際值", function () {
  // notion 模式：token 存在但缺 DB ID，訊息不得含 token 值
  assert.throws(
    function () { ensureDataEnv({ NOTION_TOKEN: SECRET_TOKEN }); },
    function (error) {
      assert.ok(!error.message.includes(SECRET_TOKEN), "不得洩漏 NOTION_TOKEN 值");
      return true;
    }
  );

  // d1 模式：TENANT_ID 存在但缺 DB，訊息不得含 tenant 值
  assert.throws(
    function () { ensureDataEnv({ DATA_BACKEND: "d1", TENANT_ID: SECRET_TENANT }); },
    function (error) {
      assert.ok(!error.message.includes(SECRET_TENANT), "不得洩漏 TENANT_ID 值");
      return true;
    }
  );
});

// ── wrapper dispatch ─────────────────────────────────────────

test("DATA_BACKEND='d1' 時 listServices 確實走 D1 repository（Fake D1）", async function () {
  var db = makeFakeDb(function (sql, binds, method) {
    if (method === "all") {
      return [{
        id: "svc-1",
        name: "基礎護理",
        duration_minutes: 60,
        price_amount: 1200,
        description: "說明文字",
        status: "active",
        sort_order: 1
      }];
    }
    return null;
  });
  var env = { DATA_BACKEND: "d1", DB: db, TENANT_ID: TENANT };

  var services = await listServices(env, true);

  assert.equal(db.calls.length, 1, "應恰好查詢 Fake D1 一次");
  var call = db.calls[0];
  assert.match(call.sql, /FROM services/);
  assert.match(call.sql, /status = 'active'/);

  // D1 的 camelCase DTO，證明未經 Notion 路徑
  assert.deepEqual(services, [{
    id: "svc-1",
    name: "基礎護理",
    durationMinutes: 60,
    price: 1200,
    description: "說明文字",
    status: "上架",
    sortOrder: 1
  }]);
});

test("wrapper dispatch：tenant ID 只出現在 bind，不拼進 SQL", async function () {
  var db = makeFakeDb(function () { return []; });
  var env = { DATA_BACKEND: "d1", DB: db, TENANT_ID: TENANT };

  await listServices(env, true);

  var call = db.calls[0];
  assert.equal(call.binds[0], TENANT, "tenant ID 應為第一個 bind");
  assert.ok(!call.sql.includes(TENANT), "tenant ID 不得拼接進 SQL");
});

test("selector export index.js 使用的全部 23 個 wrapper 與 ensureDataEnv", function () {
  var expectedWrappers = [
    "listServices",
    "createService",
    "updateService",
    "listWeeklySlots",
    "replaceWeeklySlots",
    "getActiveBookingsByDate",
    "getActiveBookingsForMonth",
    "getUserBookings",
    "createBooking",
    "cancelBooking",
    "cancelBookingByOwner",
    "getTodayBookingsForOwner",
    "getOwnerBookingsForMonth",
    "getOwnerCustomersFromBookings",
    "getOwnerCustomerBookings",
    "getSettings",
    "updateSettings",
    "getServiceById",
    "getServiceDurationMap",
    "getCustomerProfileByUserId",
    "updateCustomerByOwner",
    "previewCustomerImport",
    "commitCustomerImport"
  ];
  assert.equal(expectedWrappers.length, 23);

  expectedWrappers.forEach(function (name) {
    assert.equal(
      typeof dataRepository[name],
      "function",
      "selector 應 export 函式：" + name
    );
  });
  assert.equal(typeof dataRepository.ensureDataEnv, "function");
  assert.equal(typeof dataRepository.getDataBackendName, "function");
});

test("customer profile wrapper：notion 後端 fail closed 回 501，不碰任何資料", async function () {
  var env = fullNotionEnv();
  var wrapperCalls = [
    function () { return dataRepository.getCustomerProfileByUserId(env, "U-x"); },
    function () { return dataRepository.updateCustomerByOwner(env, "U-x", { customerName: "甲", phone: "0912345678" }); },
    function () { return dataRepository.previewCustomerImport(env, { csvText: "姓名\n王小美\n" }); },
    function () { return dataRepository.commitCustomerImport(env, { csvText: "姓名\n王小美\n", canonicalHash: "a".repeat(64) }); }
  ];
  for (var i = 0; i < wrapperCalls.length; i++) {
    await assert.rejects(
      Promise.resolve().then(wrapperCalls[i]),
      function (error) {
        assert.equal(error.status, 501, "notion 後端應回 501");
        assert.match(error.message, /不支援/);
        return true;
      }
    );
  }
});

test("customer profile wrapper：d1 後端正常 dispatch（Fake D1）", async function () {
  var db = makeFakeDb(function (sql, binds, method) {
    if (method === "first") {
      return { display_name: "王小美", mobile: "0987654321", birthday: "1995-05-05" };
    }
    return null;
  });
  var env = { DATA_BACKEND: "d1", DB: db, TENANT_ID: TENANT };

  var profile = await dataRepository.getCustomerProfileByUserId(env, "U-x");
  assert.deepEqual(profile, {
    exists: true,
    customer: { customerName: "王小美", phone: "0987654321", birthday: "1995-05-05" }
  });
  assert.equal(db.calls[0].binds[0], TENANT);
});

// ── /api/health（直接呼叫 index.js 的 fetch handler） ────────

function healthRequest() {
  return new Request("https://example.com/api/health");
}

test("/api/health 未設定 DATA_BACKEND：200、dataBackend='notion'、保留既有欄位", async function () {
  var response = await worker.fetch(healthRequest(), {
    STUDIO_NAME: "測試工作室",
    NOTION_TOKEN: SECRET_TOKEN
  });

  assert.equal(response.status, 200);
  var body = await response.json();
  assert.deepEqual(body, {
    ok: true,
    studio: "測試工作室",
    notion: true,
    dataBackend: "notion"
  });
});

test("/api/health DATA_BACKEND='notion' 回 notion", async function () {
  var response = await worker.fetch(healthRequest(), { DATA_BACKEND: "notion" });

  assert.equal(response.status, 200);
  var body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.dataBackend, "notion");
});

test("/api/health DATA_BACKEND='d1' 回 d1", async function () {
  var response = await worker.fetch(healthRequest(), { DATA_BACKEND: "d1" });

  assert.equal(response.status, 200);
  var body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.dataBackend, "d1");
});

test("/api/health 非法 DATA_BACKEND 回 500 且不洩漏非法設定值", async function () {
  var response = await worker.fetch(healthRequest(), {
    DATA_BACKEND: "oracle-evil",
    NOTION_TOKEN: SECRET_TOKEN,
    TENANT_ID: SECRET_TENANT
  });

  assert.equal(response.status, 500);
  var text = await response.text();
  var body = JSON.parse(text);
  assert.equal(body.ok, false);
  assert.ok(!text.includes("oracle-evil"), "回應不得包含非法設定實際值");
  assert.ok(!text.includes(SECRET_TOKEN), "回應不得包含 token");
  assert.ok(!text.includes(SECRET_TENANT), "回應不得包含 tenant ID");
});

test("/api/health 回應只含四個欄位，不輸出 DB、TENANT_ID、token 或 secret", async function () {
  var response = await worker.fetch(healthRequest(), {
    DATA_BACKEND: "d1",
    STUDIO_NAME: "測試工作室",
    NOTION_TOKEN: SECRET_TOKEN,
    TENANT_ID: SECRET_TENANT,
    DB: makeFakeDb()
  });

  assert.equal(response.status, 200);
  var text = await response.text();
  var body = JSON.parse(text);

  assert.deepEqual(Object.keys(body).sort(), ["dataBackend", "notion", "ok", "studio"]);
  assert.ok(!text.includes(SECRET_TOKEN), "回應不得包含 NOTION_TOKEN 值");
  assert.ok(!text.includes(SECRET_TENANT), "回應不得包含 TENANT_ID 值");
  assert.ok(!text.includes("DB"), "回應不得輸出 DB 綁定資訊");
});
