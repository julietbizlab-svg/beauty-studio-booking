/**
 * d1-repository.js 單元測試（node:test ＋ assert，零依賴）
 *
 * 使用最小 Fake D1：記錄每次 prepare 的 SQL 與 bind 值，由各測試自訂
 * 回傳資料。不連 Cloudflare、不執行 migration、不讀任何 SQL 草稿。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ensureD1Env,
  listServices,
  getServiceById,
  getServiceDurationMap,
  createService,
  updateService,
  getSettings,
  updateSettings
} from "../src/d1-repository.js";

var TENANT = "tenant-test-001";

/**
 * handler(sql, binds, method) 依測試情境回傳：
 * - method 'all'   → rows 陣列
 * - method 'first' → 單列或 null
 * - method 'run'   → { meta: { changes } }（未回傳時預設 changes: 1）
 */
function makeFakeDb(handler) {
  var db = {
    calls: [],
    batchedStatements: null,
    prepare: function (sql) {
      return {
        bind: function () {
          var binds = Array.prototype.slice.call(arguments);
          var statement = {
            sql: sql,
            binds: binds,
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
              return (handler ? handler(sql, binds, "run") : null) || { meta: { changes: 1 } };
            }
          };
          return statement;
        }
      };
    },
    batch: async function (statements) {
      db.batchedStatements = statements;
      statements.forEach(function (s) {
        db.calls.push({ sql: s.sql, binds: s.binds, method: "batch" });
      });
      return [];
    }
  };
  return db;
}

function makeEnv(db) {
  return { DB: db, TENANT_ID: TENANT };
}

function serviceRow(overrides) {
  return Object.assign({
    id: "svc-1",
    name: "基礎護理",
    duration_minutes: 60,
    price_amount: 1200,
    description: "說明文字",
    status: "active",
    sort_order: 1
  }, overrides || {});
}

// ── 環境設定錯誤 ──────────────────────────────────────────────

test("缺少 env.DB 時丟 500 設定錯誤且不洩漏值", async function () {
  await assert.rejects(
    listServices({ TENANT_ID: TENANT }, true),
    function (error) {
      assert.equal(error.status, 500);
      assert.ok(!error.message.includes(TENANT), "錯誤訊息不得包含 TENANT_ID 值");
      return true;
    }
  );
});

test("缺少 env.TENANT_ID 時丟 500 設定錯誤", function () {
  assert.throws(
    function () { ensureD1Env({ DB: makeFakeDb() }); },
    function (error) {
      assert.equal(error.status, 500);
      assert.match(error.message, /TENANT_ID/);
      return true;
    }
  );
});

// ── listServices ─────────────────────────────────────────────

test("listServices 綁定 TENANT_ID、activeOnly 只查 active、DTO 為 camelCase", async function () {
  var db = makeFakeDb(function (sql, binds, method) {
    if (method === "all") return [serviceRow()];
    return null;
  });

  var services = await listServices(makeEnv(db), true);

  var call = db.calls[0];
  assert.equal(call.binds[0], TENANT);
  assert.match(call.sql, /status = 'active'/);
  assert.ok(!/IN \('active', 'inactive'\)/.test(call.sql));

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

test("listServices activeOnly=false 查 active 與 inactive，inactive 轉為下架", async function () {
  var db = makeFakeDb(function (sql, binds, method) {
    if (method === "all") return [serviceRow({ status: "inactive" })];
    return null;
  });

  var services = await listServices(makeEnv(db), false);

  assert.match(db.calls[0].sql, /IN \('active', 'inactive'\)/);
  assert.equal(services[0].status, "下架");
});

// ── getServiceById ───────────────────────────────────────────

test("getServiceById 找不到時回 404", async function () {
  var db = makeFakeDb(function () { return null; });
  await assert.rejects(
    getServiceById(makeEnv(db), "no-such-id"),
    function (error) {
      assert.equal(error.status, 404);
      return true;
    }
  );
});

// ── createService ────────────────────────────────────────────

test("createService 拒絕空名稱且不觸發任何 SQL", async function () {
  var db = makeFakeDb();
  await assert.rejects(
    createService(makeEnv(db), { name: "" }),
    /服務名稱/
  );
  assert.equal(db.calls.length, 0);
});

test("createService 拒絕負價格", async function () {
  var db = makeFakeDb();
  await assert.rejects(
    createService(makeEnv(db), { name: "新服務", price: -100 }),
    /價格/
  );
  assert.equal(db.calls.length, 0);
});

test("createService 成功時 INSERT 綁定 tenant_id 並回傳 DTO", async function () {
  var insertedId = null;
  var db = makeFakeDb(function (sql, binds, method) {
    if (method === "run") {
      insertedId = binds[0];
      return { meta: { changes: 1 } };
    }
    if (method === "first") {
      return serviceRow({ id: insertedId, name: "新服務" });
    }
    return null;
  });

  var dto = await createService(makeEnv(db), { name: "新服務", durationMinutes: 60 });

  var insert = db.calls.find(function (c) { return /INSERT INTO services/.test(c.sql); });
  assert.ok(insert, "應執行 INSERT INTO services");
  assert.equal(insert.binds[1], TENANT);
  assert.equal(dto.id, insertedId);
  assert.equal(dto.name, "新服務");
});

// ── updateService ────────────────────────────────────────────

test("updateService 拒絕非法狀態", async function () {
  var db = makeFakeDb();
  await assert.rejects(
    updateService(makeEnv(db), "svc-1", { status: "封存" }),
    /上架.*下架|狀態/
  );
  assert.equal(db.calls.length, 0);
});

test("updateService 的 UPDATE 必含 tenant_id 條件", async function () {
  var db = makeFakeDb(function (sql, binds, method) {
    if (method === "first") return serviceRow();
    return null;
  });

  await updateService(makeEnv(db), "svc-1", { name: "改名" });

  var update = db.calls.find(function (c) { return /^UPDATE services/.test(c.sql); });
  assert.ok(update, "應執行 UPDATE services");
  assert.match(update.sql, /WHERE tenant_id = \?\d+ AND id = \?\d+/);
  assert.ok(update.binds.includes(TENANT));
  assert.ok(update.binds.includes("svc-1"));
});

// ── getServiceDurationMap ────────────────────────────────────

test("getServiceDurationMap 去除重複與空 ID，回傳時長對照", async function () {
  var db = makeFakeDb(function (sql, binds, method) {
    if (method === "all") {
      return [
        { id: "a", duration_minutes: 60 },
        { id: "b", duration_minutes: 90 }
      ];
    }
    return null;
  });

  var map = await getServiceDurationMap(
    makeEnv(db),
    ["a", "a", "b", null, "", "a"]
  );

  assert.deepEqual(db.calls[0].binds, [TENANT, "a", "b"]);
  assert.deepEqual(map, { a: 60, b: 90 });
});

test("getServiceDurationMap 空清單不查 DB", async function () {
  var db = makeFakeDb();
  var map = await getServiceDurationMap(makeEnv(db), []);
  assert.deepEqual(map, {});
  assert.equal(db.calls.length, 0);
});

// ── getSettings ──────────────────────────────────────────────

test("getSettings 無資料時回傳預設值", async function () {
  var db = makeFakeDb(function () { return []; });
  var settings = await getSettings(makeEnv(db));

  assert.deepEqual(settings, {
    id: "default",
    brandName: "美業工作室",
    primaryColor: "#E8B4B8",
    announcement: "",
    cancelPolicy: "預約日前 24 小時可免費取消。",
    depositEnabled: false,
    depositAmount: null,
    bankName: "",
    bankCode: "",
    bankAccount: "",
    bankAccountName: "",
    depositNote: ""
  });
});

test("getSettings 正確解析 boolean／number／string", async function () {
  var db = makeFakeDb(function (sql, binds, method) {
    if (method === "all") {
      return [
        { setting_key: "brand_name", setting_value: "測試工作室" },
        { setting_key: "theme_color", setting_value: "#123456" },
        { setting_key: "deposit_enabled", setting_value: "true" },
        { setting_key: "deposit_amount", setting_value: "500" }
      ];
    }
    return null;
  });

  var settings = await getSettings(makeEnv(db));

  assert.equal(settings.brandName, "測試工作室");
  assert.equal(settings.primaryColor, "#123456");
  assert.equal(settings.depositEnabled, true);
  assert.equal(settings.depositAmount, 500);
  assert.equal(settings.announcement, "");
});

// ── updateSettings ───────────────────────────────────────────

test("updateSettings 只寫白名單 key，未知欄位忽略", async function () {
  var db = makeFakeDb(function () { return []; });

  await updateSettings(makeEnv(db), {
    brandName: "新店名",
    announcement: "公告",
    evilKey: "DROP TABLE tenant_settings",
    settingKey: "任意鍵"
  });

  assert.ok(db.batchedStatements, "應以 batch 寫入");
  assert.equal(db.batchedStatements.length, 2);

  var writtenKeys = db.batchedStatements.map(function (s) { return s.binds[2]; });
  assert.deepEqual(writtenKeys.sort(), ["announcement", "brand_name"]);
  db.batchedStatements.forEach(function (s) {
    assert.ok(!s.binds.includes("evilKey"));
    assert.ok(!s.binds.includes("DROP TABLE tenant_settings"));
  });
});

test("開啟訂金但缺帳號或戶名時拒絕", async function () {
  var db = makeFakeDb();
  await assert.rejects(
    updateSettings(makeEnv(db), {
      depositEnabled: true,
      bankAccount: "",
      bankAccountName: "測試戶名",
      depositAmount: 500
    }),
    /帳號與戶名/
  );
  assert.equal(db.calls.length, 0);
});

test("開啟訂金但金額無效時拒絕", async function () {
  var db = makeFakeDb();
  await assert.rejects(
    updateSettings(makeEnv(db), {
      depositEnabled: true,
      bankAccount: "000123456789",
      bankAccountName: "測試戶名",
      depositAmount: 0
    }),
    /訂金金額須大於 0/
  );
  assert.equal(db.calls.length, 0);
});
