import { test } from "node:test";
import assert from "node:assert/strict";
import {
  legacyOwnerContext,
  listOwnerMemberships,
  resolveOwnerContext,
  scopedOwnerEnv,
  assertOwnerSubscriptionWritable
} from "../src/owner-hub.js";

function fakeDb(rows) {
  var calls = [];
  return {
    calls: calls,
    prepare: function (sql) {
      var call = { sql: sql, binds: [] };
      calls.push(call);
      return {
        bind: function () {
          call.binds = Array.from(arguments);
          return this;
        },
        all: async function () { return { results: rows || [] }; }
      };
    }
  };
}

test("owner hub membership 只依 provider＋LINE user id 查詢，回傳安全方案能力", async function () {
  var db = fakeDb([{
    tenant_id: "tenant-a",
    tenant_name: "A 店",
    tenant_status: "active",
    staff_id: "staff-a",
    location_id: "location-a",
    staff_name: "店主",
    role: "owner",
    plan_code: "flagship",
    customer_import_enabled: 1,
    customer_export_enabled: 0,
    customer_ai_enabled: 1,
    owner_ai_enabled: 1
  }]);
  var memberships = await listOwnerMemberships({
    DB: db, LINE_PROVIDER_ID: "provider-1"
  }, "U-owner");

  assert.equal(memberships.length, 1);
  assert.deepEqual(memberships[0].features, {
    plan: "flagship",
    customerImport: true,
    customerExport: false,
    customerAi: true,
    ownerAi: true
  });
  assert.deepEqual(db.calls[0].binds, ["provider-1", "U-owner"]);
  assert.match(db.calls[0].sql, /sla\.provider_id = \?1/);
  assert.match(db.calls[0].sql, /sla\.line_user_id = \?2/);
  assert.match(db.calls[0].sql, /platform_acceptance_mode/);
  assert.equal(memberships[0].locationId, "location-a");
  assert.equal(memberships[0].isPlatformStudio, false);
  assert.equal(memberships[0].isShowcaseStudio, false);
  assert.equal(memberships[0].isPlatformAcceptance, false);
  assert.doesNotMatch(db.calls[0].sql, /U-owner|provider-1/);
});

test("一般業主入口排除平台驗收工作室，平台直接連結仍可進入", async function () {
  var rows = [
    {
      tenant_id: "studio-live", tenant_name: "美業工作室", staff_id: "owner-live",
      location_id: "location-live", staff_name: "業主", role: "owner",
      plan_code: "flagship", platform_acceptance_mode: 0
    },
    {
      tenant_id: "acceptance-beige", tenant_name: "米色版驗收工作室",
      staff_id: "owner-beige", location_id: "location-beige", staff_name: "平台驗收",
      role: "owner", plan_code: "standard", platform_acceptance_mode: 1
    },
    {
      tenant_id: "acceptance-mauve", tenant_name: "藕粉版驗收工作室",
      staff_id: "owner-mauve", location_id: "location-mauve", staff_name: "平台驗收",
      role: "owner", plan_code: "flagship", platform_acceptance_mode: 1
    }
  ];
  var env = { DB: fakeDb(rows), LINE_PROVIDER_ID: "provider" };

  var regularEntry = await resolveOwnerContext(env, "U-platform", "");
  assert.equal(regularEntry.requiresSelection, false);
  assert.equal(regularEntry.selected.tenantId, "studio-live");
  assert.deepEqual(regularEntry.memberships.map(function (item) { return item.tenantId; }),
    ["studio-live"]);

  var acceptanceEntry = await resolveOwnerContext(env, "U-platform", "acceptance-mauve");
  assert.equal(acceptanceEntry.requiresSelection, false);
  assert.equal(acceptanceEntry.selected.tenantId, "acceptance-mauve");
});

test("一般業主入口排除平台管理主帳號，平台 API 指定時仍可進入", async function () {
  var rows = [
    {
      tenant_id: "platform-main", tenant_name: "平台管理主帳號",
      staff_id: "platform-owner", location_id: "platform-location",
      staff_name: "平台負責人", role: "owner", plan_code: "standard"
    },
    {
      tenant_id: "studio-live", tenant_name: "業主工作室",
      staff_id: "studio-owner", location_id: "studio-location",
      staff_name: "業主", role: "owner", plan_code: "flagship"
    }
  ];
  var env = {
    DB: fakeDb(rows), LINE_PROVIDER_ID: "provider", TENANT_ID: "platform-main"
  };

  var regularEntry = await resolveOwnerContext(env, "U-platform", "");
  assert.equal(regularEntry.requiresSelection, false);
  assert.equal(regularEntry.selected.tenantId, "studio-live");
  assert.deepEqual(regularEntry.memberships.map(function (item) { return item.tenantId; }),
    ["studio-live"]);

  var platformEntry = await resolveOwnerContext(env, "U-platform", "platform-main");
  assert.equal(platformEntry.selected.tenantId, "platform-main");
});

test("平台負責人的一般入口只顯示正式標準與旗艦展示工作室", async function () {
  var rows = [
    {
      tenant_id: "platform-main", tenant_name: "平台管理主帳號",
      staff_id: "platform-owner", location_id: "platform-location",
      staff_name: "平台負責人", role: "owner", plan_code: "standard"
    },
    {
      tenant_id: "showcase-standard", tenant_name: "美甲美睫標準展示",
      staff_id: "standard-owner", location_id: "standard-location",
      staff_name: "平台負責人", role: "owner", plan_code: "standard"
    },
    {
      tenant_id: "showcase-flagship", tenant_name: "紋繡旗艦展示",
      staff_id: "flagship-owner", location_id: "flagship-location",
      staff_name: "平台負責人", role: "owner", plan_code: "flagship"
    },
    {
      tenant_id: "old-duplicate", tenant_name: "舊測試工作室",
      staff_id: "old-owner", location_id: "old-location",
      staff_name: "平台負責人", role: "owner", plan_code: "standard"
    }
  ];
  var env = {
    DB: fakeDb(rows), LINE_PROVIDER_ID: "provider", TENANT_ID: "platform-main",
    STANDARD_SHOWCASE_TENANT_ID: "showcase-standard",
    FLAGSHIP_SHOWCASE_TENANT_ID: "showcase-flagship"
  };

  var result = await resolveOwnerContext(env, "U-platform", "");
  assert.equal(result.requiresSelection, true);
  assert.deepEqual(result.memberships.map(function (item) { return item.tenantId; }),
    ["showcase-standard", "showcase-flagship"]);
});

test("多店業主未指定 tenant 時要求選擇；不可偽造其他 tenant", async function () {
  var rows = [
    {
      tenant_id: "tenant-a", tenant_name: "A", staff_id: "sa",
      location_id: "la", staff_name: "Owner", role: "owner", plan_code: "standard"
    },
    {
      tenant_id: "tenant-b", tenant_name: "B", staff_id: "sb",
      location_id: "lb", staff_name: "Owner", role: "owner", plan_code: "flagship"
    }
  ];
  var env = { DB: fakeDb(rows), LINE_PROVIDER_ID: "provider" };
  var noSelection = await resolveOwnerContext(env, "U", "");
  assert.equal(noSelection.requiresSelection, true);
  assert.equal(noSelection.selected, null);

  var selected = await resolveOwnerContext(env, "U", "tenant-b");
  assert.equal(selected.selected.staffId, "sb");
  await assert.rejects(
    resolveOwnerContext(env, "U", "tenant-other"),
    function (error) { return error.status === 403; }
  );
});

test("舊單店 allowlist 保留相容，但未知使用者 fail closed", async function () {
  var env = {
    TENANT_ID: "legacy-tenant",
    STAFF_ID: "legacy-staff",
    LOCATION_ID: "legacy-location",
    OWNER_LINE_USER_IDS: "U-owner",
    OWNER_AI_ENABLED: "false",
    CUSTOMER_IMPORT_ENABLED: "false"
  };
  assert.equal(legacyOwnerContext(env, "U-owner").tenantId, "legacy-tenant");
  assert.equal(legacyOwnerContext(env, "U-owner").locationId, "legacy-location");
  await assert.rejects(
    resolveOwnerContext(env, "U-stranger", ""),
    function (error) { return error.status === 403; }
  );
});

test("scoped env 不修改原 env，方案能力由選定 membership 決定", function () {
  var original = {
    TENANT_ID: "legacy",
    STAFF_ID: "legacy-staff",
    LOCATION_ID: "legacy-location",
    DB: {}
  };
  var scoped = scopedOwnerEnv(original, {
    tenantId: "tenant-b",
    staffId: "staff-b",
    locationId: "location-b",
    features: {
      customerImport: true, customerExport: false,
      customerAi: true, ownerAi: true
    }
  });
  assert.equal(original.TENANT_ID, "legacy");
  assert.equal(scoped.TENANT_ID, "tenant-b");
  assert.equal(scoped.STAFF_ID, "staff-b");
  assert.equal(scoped.LOCATION_ID, "location-b");
  assert.equal(scoped.CUSTOMER_IMPORT_ENABLED, "true");
  assert.equal(scoped.PAID_CUSTOMER_EXPORT_ENABLED, "false");
});

test("membership 缺 location 時 fail closed，不沿用平台預設店面", function () {
  assert.throws(function () {
    scopedOwnerEnv({
      LOCATION_ID: "platform-location"
    }, {
      tenantId: "tenant-b",
      staffId: "staff-b",
      locationId: "",
      features: {}
    });
  }, function (error) {
    return error.status === 409;
  });
});

test("14 天試用到期後 GET 保持唯讀，所有寫入由後端拒絕", function () {
  var env = { OWNER_SUBSCRIPTION_READ_ONLY: "true" };
  assert.doesNotThrow(function () { assertOwnerSubscriptionWritable(env, "GET"); });
  assert.doesNotThrow(function () { assertOwnerSubscriptionWritable(env, "HEAD"); });
  ["POST", "PATCH", "PUT", "DELETE"].forEach(function (method) {
    assert.throws(function () { assertOwnerSubscriptionWritable(env, method); }, function (error) {
      return error.status === 403 && /僅能查看資料/.test(error.message);
    });
  });
});
