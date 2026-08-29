import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertPlatformOperator,
  provisionOwnerStudio,
  listPlatformStudios,
  ensurePlatformStudioCustomerEntry,
  getStudioCustomerEntryKey,
  reissuePlatformOwnerInvite,
  updatePlatformStudioIdentity,
  updatePlatformStudioAssessmentTemplate,
  managePlatformStudioSubscription,
  ensurePlatformAcceptanceStudios
} from "../src/platform-provisioning.js";

test("業主設定只回傳目前 tenant 的有效專屬客戶入口", async function () {
  var validKey = "a".repeat(64);
  var db = {
    prepare: function () {
      return {
        bind: function () { return this; },
        first: async function () { return { customer_entry_key: validKey.toUpperCase() }; }
      };
    }
  };
  assert.equal(await getStudioCustomerEntryKey({ DB: db, TENANT_ID: "tenant-a" }), validKey);

  db.prepare = function () {
    return {
      bind: function () { return this; },
      first: async function () { return { customer_entry_key: "invalid" }; }
    };
  };
  assert.equal(await getStudioCustomerEntryKey({ DB: db, TENANT_ID: "tenant-a" }), "");
});

test("平台可為既有一般工作室補建穩定的專屬客戶入口", async function () {
  var storedKey = "";
  var db = fakeDb();
  db.prepare = function (sql) {
    var statement = {
      sql: sql,
      binds: [],
      bind: function () { this.binds = Array.from(arguments); return this; },
      first: async function () {
        if (/SELECT id FROM tenants/.test(sql)) return { id: "tenant-a" };
        if (/SELECT setting_value/.test(sql)) {
          return storedKey ? { setting_value: storedKey } : null;
        }
        return null;
      }
    };
    db.prepared.push(statement);
    return statement;
  };
  db.batch = async function (items) {
    db.batches.push(items);
    var insert = items.find(function (item) { return /'customer_entry_key'/.test(item.sql); });
    storedKey = insert.binds[2];
    return items.map(function () { return { success: true }; });
  };

  var result = await ensurePlatformStudioCustomerEntry({
    DB: db, TENANT_ID: "platform-tenant", STAFF_ID: "platform-owner"
  }, { tenantId: "platform-tenant", staffId: "platform-owner", role: "owner" }, "tenant-a");
  assert.equal(result.created, true);
  assert.match(result.customerEntryKey, /^[0-9a-f]{64}$/);
  assert.equal(db.batches.length, 1);
  assert.ok(db.prepared.some(function (item) {
    return /platform_customer_entry_created/.test(item.sql);
  }));

  var again = await ensurePlatformStudioCustomerEntry({
    DB: db, TENANT_ID: "platform-tenant", STAFF_ID: "platform-owner"
  }, { tenantId: "platform-tenant", staffId: "platform-owner", role: "owner" }, "tenant-a");
  assert.equal(again.created, false);
  assert.equal(again.customerEntryKey, result.customerEntryKey);
  assert.equal(db.batches.length, 1);
});

test("平台本人可建立米色與藕粉兩個隔離驗收工作室", async function () {
  var db = fakeDb();
  var result = await ensurePlatformAcceptanceStudios({
    DB: db, TENANT_ID: "platform-tenant", STAFF_ID: "platform-owner",
    LINE_PROVIDER_ID: "provider"
  }, { tenantId: "platform-tenant", staffId: "platform-owner", role: "owner" },
  "platform-line-user");
  assert.deepEqual(result.studios.map(function (item) { return item.plan; }),
    ["standard", "flagship"]);
  assert.equal(db.batches.length, 2);
  assert.equal(db.batches[0].length, 11);
  assert.equal(db.batches[1].length, 11);
  assert.ok(db.prepared.some(function (item) {
    return /platform_acceptance_mode/.test(item.sql);
  }));
  assert.ok(db.prepared.some(function (item) {
    return /staff_line_accounts/.test(item.sql) &&
      item.binds.includes("platform-line-user");
  }));
  var featurePlans = db.prepared.filter(function (item) {
    return /INSERT INTO tenant_features/.test(item.sql);
  }).map(function (item) { return item.binds[1]; });
  assert.deepEqual(featurePlans, ["standard", "flagship"]);
});

test("非平台本人不可建立驗收工作室且零寫入", async function () {
  var db = fakeDb();
  await assert.rejects(ensurePlatformAcceptanceStudios({
    DB: db, TENANT_ID: "platform-tenant", STAFF_ID: "platform-owner",
    LINE_PROVIDER_ID: "provider"
  }, { tenantId: "other", staffId: "other", role: "owner" }, "line-user"),
  function (error) { return error.status === 403; });
  assert.equal(db.prepared.length, 0);
  assert.equal(db.batches.length, 0);
});

function fakeDb() {
  var prepared = [];
  var batches = [];
  return {
    prepared: prepared,
    batches: batches,
    prepare: function (sql) {
      var statement = {
        sql: sql,
        binds: [],
        bind: function () {
          this.binds = Array.from(arguments);
          return this;
        }
      };
      prepared.push(statement);
      return statement;
    },
    batch: async function (items) {
      batches.push(items);
      return items.map(function () {
        return { success: true, meta: { changes: 1 } };
      });
    }
  };
}

test("平台清單包含平台自己的工作室並標記不可管理訂閱", async function () {
  var db = fakeDb();
  db.prepare = function (sql) {
    var statement = {
      sql: sql,
      binds: [],
      bind: function () { this.binds = Array.from(arguments); return this; },
      all: async function () { return { results: [{
        tenant_id: "platform-tenant", studio_name: "茱麗葉工作室",
        owner_name: "平台負責人", status: "active", plan_code: "flagship",
        subscription_status: "active", identity_bound: 1
      }] }; }
    };
    db.prepared.push(statement);
    return statement;
  };
  var result = await listPlatformStudios({
    DB: db, TENANT_ID: "platform-tenant", STAFF_ID: "platform-owner"
  }, { tenantId: "platform-tenant", staffId: "platform-owner", role: "owner" });
  assert.equal(result.studios.length, 1);
  assert.equal(result.studios[0].isPlatformStudio, true);
  assert.equal(result.studios[0].studioName, "茱麗葉工作室");
  assert.equal(result.studios[0].inviteExpiresAt, "");
  assert.equal(result.studios[0].lineConfigured, false);
  assert.equal(result.studios[0].lineReady, false);
  assert.deepEqual(result.studios[0].lineMissing, ["registry"]);
  assert.ok(db.prepared.some(function (item) {
    return /invite_expires_at/.test(item.sql) &&
      /invite_claimed_at/.test(item.sql) &&
      /ORDER BY s2\.created_at ASC LIMIT 1/.test(item.sql) &&
      /ORDER BY CASE WHEN t\.id=\?1 THEN 0 ELSE 1 END/.test(item.sql) &&
      !/WHERE t\.id<>\?1/.test(item.sql);
  }));
});

test("平台清單只回傳 LINE readiness，不洩漏 registry 憑證", async function () {
  var db = fakeDb();
  db.prepare = function () {
    return {
      bind: function () { return this; },
      all: async function () { return { results: [{
        tenant_id: "tenant-ready", studio_name: "正式工作室", owner_name: "業主",
        status: "active", plan_code: "standard", subscription_status: "active",
        identity_bound: 1
      }] }; }
    };
  };
  var secret = "never-return-this-secret";
  var result = await listPlatformStudios({
    DB: db, TENANT_ID: "platform-tenant", STAFF_ID: "platform-owner",
    LINE_TENANT_CHANNELS_JSON: JSON.stringify({
      "tenant-ready": {
        providerId: "provider", messagingAccessToken: secret,
        liffClientIds: ["customer", "owner"],
        customerLiffId: "1234567890-tenant-ready", webhookSecret: secret,
        webhookRouteKey: "route_0123456789abcdef0123456789abcdef"
      }
    })
  }, { tenantId: "platform-tenant", staffId: "platform-owner", role: "owner" });
  assert.equal(result.studios[0].lineConfigured, true);
  assert.equal(result.studios[0].lineReady, true);
  assert.deepEqual(result.studios[0].lineMissing, []);
  assert.equal(result.studios[0].customerLiffId, "1234567890-tenant-ready");
  assert.equal(JSON.stringify(result).includes(secret), false);
});

test("平台清單回傳最新邀請 expiresAt", async function () {
  var db = fakeDb();
  db.prepare = function (sql) {
    var statement = {
      sql: sql,
      binds: [],
      bind: function () { this.binds = Array.from(arguments); return this; },
      all: async function () { return { results: [{
        tenant_id: "tenant-unbound", studio_name: "等待業主首次設定",
        owner_name: "待業主首次設定", status: "trial", plan_code: "standard",
        subscription_status: "trial", identity_bound: 0,
        invite_status: "active",
        invite_expires_at: "2026-08-07T12:00:00.000Z"
      }] }; }
    };
    db.prepared.push(statement);
    return statement;
  };
  var result = await listPlatformStudios({
    DB: db, TENANT_ID: "platform-tenant", STAFF_ID: "platform-owner"
  }, { tenantId: "platform-tenant", staffId: "platform-owner", role: "owner" });
  assert.equal(result.studios[0].inviteStatus, "active");
  assert.equal(result.studios[0].inviteExpiresAt, "2026-08-07T12:00:00.000Z");
  assert.equal(result.studios[0].inviteClaimedAt, "");
  assert.equal(result.studios[0].identityBound, false);
});

test("平台可對未綁定原 tenant 重發邀請且不重建工作室", async function () {
  var db = fakeDb();
  var firstCalls = 0;
  db.prepare = function (sql) {
    var statement = {
      sql: sql,
      binds: [],
      bind: function () { this.binds = Array.from(arguments); return this; },
      first: async function () {
        firstCalls += 1;
        if (/CASE WHEN sla\.id IS NULL/.test(this.sql)) {
          return {
            tenant_id: "tenant-unbound",
            staff_id: "staff-owner-1",
            identity_bound: 0
          };
        }
        return { id: "staff-owner-1" };
      }
    };
    db.prepared.push(statement);
    return statement;
  };
  var result = await reissuePlatformOwnerInvite({
    DB: db,
    TENANT_ID: "platform-tenant",
    STAFF_ID: "platform-owner",
    LINE_PROVIDER_ID: "provider"
  }, { tenantId: "platform-tenant", staffId: "platform-owner", role: "owner" },
  "tenant-unbound");

  assert.equal(result.ok, true);
  assert.equal(result.tenantId, "tenant-unbound");
  assert.match(result.inviteToken, /^[0-9a-f]{64}$/);
  assert.ok(result.expiresAt);
  assert.ok(firstCalls >= 2);
  assert.ok(db.batches.length >= 2);
  assert.ok(db.prepared.some(function (item) {
    return /UPDATE owner_access_invites SET status='revoked'/.test(item.sql);
  }));
  assert.ok(db.prepared.some(function (item) {
    return /INSERT INTO owner_access_invites/.test(item.sql);
  }));
  assert.ok(db.prepared.some(function (item) {
    return /platform_owner_invite_reissued/.test(item.sql);
  }));
  assert.equal(db.prepared.some(function (item) {
    return /INSERT INTO tenants/.test(item.sql) ||
      /INSERT INTO locations/.test(item.sql) ||
      /INSERT INTO staff /.test(item.sql) ||
      /INSERT INTO tenant_features/.test(item.sql) ||
      /INSERT INTO tenant_subscriptions/.test(item.sql);
  }), false);
  var allBoundValues = db.prepared.flatMap(function (item) { return item.binds; });
  assert.equal(allBoundValues.includes(result.inviteToken), false);
  assert.equal(JSON.stringify(allBoundValues).indexOf(result.inviteToken), -1);
});

test("已綁定、平台工作室或非平台身分不可重發邀請", async function () {
  var env = {
    DB: fakeDb(),
    TENANT_ID: "platform-tenant",
    STAFF_ID: "platform-owner",
    LINE_PROVIDER_ID: "provider"
  };
  var selected = {
    tenantId: "platform-tenant", staffId: "platform-owner", role: "owner"
  };

  await assert.rejects(reissuePlatformOwnerInvite(env, {
    tenantId: "other", staffId: "other", role: "owner"
  }, "tenant-1"), function (error) { return error.status === 403; });
  assert.equal(env.DB.batches.length, 0);

  await assert.rejects(reissuePlatformOwnerInvite(env, selected, "platform-tenant"),
    function (error) { return error.status === 409; });
  assert.equal(env.DB.batches.length, 0);

  var boundDb = fakeDb();
  boundDb.prepare = function (sql) {
    var statement = {
      sql: sql, binds: [],
      bind: function () { this.binds = Array.from(arguments); return this; },
      first: async function () {
        return { tenant_id: "tenant-1", staff_id: "staff-1", identity_bound: 1 };
      }
    };
    boundDb.prepared.push(statement);
    return statement;
  };
  await assert.rejects(reissuePlatformOwnerInvite(Object.assign({}, env, { DB: boundDb }),
    selected, "tenant-1"), function (error) { return error.status === 409; });
  assert.equal(boundDb.batches.length, 0);

  var missingDb = fakeDb();
  missingDb.prepare = function (sql) {
    var statement = {
      sql: sql, binds: [],
      bind: function () { this.binds = Array.from(arguments); return this; },
      first: async function () { return null; }
    };
    missingDb.prepared.push(statement);
    return statement;
  };
  await assert.rejects(reissuePlatformOwnerInvite(Object.assign({}, env, { DB: missingDb }),
    selected, "missing"), function (error) { return error.status === 404; });
});

test("平台開通權限只接受預設 tenant＋staff 的 owner", function () {
  var env = { TENANT_ID: "platform-tenant", STAFF_ID: "platform-owner" };
  assert.doesNotThrow(function () {
    assertPlatformOperator(env, {
      tenantId: "platform-tenant",
      staffId: "platform-owner",
      role: "owner"
    });
  });
  [
    { tenantId: "other", staffId: "platform-owner", role: "owner" },
    { tenantId: "platform-tenant", staffId: "other", role: "owner" },
    { tenantId: "platform-tenant", staffId: "platform-owner", role: "manager" }
  ].forEach(function (selected) {
    assert.throws(function () {
      assertPlatformOperator(env, selected);
    }, function (error) {
      return error.status === 403;
    });
  });
});

test("非平台本人無法建立工作室且零 DB 寫入", async function () {
  var db = fakeDb();
  await assert.rejects(
    provisionOwnerStudio({
      DB: db,
      TENANT_ID: "platform-tenant",
      STAFF_ID: "platform-owner"
    }, {
      tenantId: "other-tenant",
      staffId: "other-owner",
      role: "owner"
    }, {
      studioName: "其他工作室",
      ownerName: "其他業主"
    }),
    function (error) { return error.status === 403; }
  );
  assert.equal(db.prepared.length, 0);
  assert.equal(db.batches.length, 0);
});

test("平台本人以單一 batch 建立獨立 tenant owner 與一次性邀請", async function () {
  var db = fakeDb();
  var result = await provisionOwnerStudio({
    DB: db,
    TENANT_ID: "platform-tenant",
    STAFF_ID: "platform-owner"
  }, {
    tenantId: "platform-tenant",
    staffId: "platform-owner",
    role: "owner"
  }, {
    plan: "flagship", assessmentTemplateCode: "lip_blush_new_client"
  });

  assert.equal(db.batches.length, 1);
  assert.equal(db.batches[0].length, 17);
  assert.equal(result.ok, true);
  assert.equal(result.plan, "flagship");
  assert.equal(result.assessmentTemplateCode, "lip_blush_new_client");
  assert.equal(Object.hasOwn(result, "studioName"), false);
  assert.equal(Object.hasOwn(result, "ownerName"), false);
  assert.match(result.inviteToken, /^[0-9a-f]{64}$/);
  assert.match(result.customerEntryKey, /^[0-9a-f]{64}$/);
  assert.notEqual(result.customerEntryKey, result.inviteToken);

  var customerEntryInsert = db.prepared.find(function (item) {
    return /'customer_entry_key'/.test(item.sql);
  });
  assert.ok(customerEntryInsert);
  assert.equal(customerEntryInsert.binds[1], result.tenantId);
  assert.equal(customerEntryInsert.binds[2], result.customerEntryKey);

  var staffInsert = db.prepared.find(function (item) {
    return /INSERT INTO staff /.test(item.sql);
  });
  assert.ok(staffInsert);
  assert.match(staffInsert.sql, /'owner'.*'owner'/);
  assert.equal(staffInsert.binds[1], result.tenantId);
  assert.equal(staffInsert.binds[3], "待業主首次設定");

  var inviteInsert = db.prepared.find(function (item) {
    return /INSERT INTO owner_access_invites/.test(item.sql);
  });
  assert.ok(inviteInsert);
  assert.equal(inviteInsert.binds[1], result.tenantId);
  assert.match(inviteInsert.binds[3], /^[0-9a-f]{64}$/);
  assert.notEqual(inviteInsert.binds[3], result.inviteToken);

  var allBoundValues = db.prepared.flatMap(function (item) {
    return item.binds;
  });
  assert.equal(allBoundValues.includes(result.inviteToken), false);
  var assessmentCodes = db.prepared.filter(function (item) {
    return /INSERT INTO assessment_templates/.test(item.sql);
  }).map(function (item) {
    return (item.sql.match(/VALUES \(\?1,\?2,'([^']+)'/) || [])[1];
  });
  assert.deepEqual(assessmentCodes, [
    "brow_new_client", "lip_blush_new_client", "eyeliner_new_client",
    "under_eye_new_client", "brow_lightening_new_client", "lip_lightening_new_client"
  ]);
});

test("旗艦版可選全方位紋繡評估並依服務項目分流", async function () {
  var db = fakeDb();
  var result = await provisionOwnerStudio({
    DB: db, TENANT_ID: "platform-tenant", STAFF_ID: "platform-owner"
  }, {
    tenantId: "platform-tenant", staffId: "platform-owner", role: "owner"
  }, {
    plan: "flagship", assessmentTemplateCode: "all_supported"
  });
  assert.equal(result.assessmentTemplateCode, "all_supported");
  var setting = db.prepared.find(function (item) {
    return /'assessment_template_code'/.test(item.sql) && item.binds.includes("all_supported");
  });
  assert.ok(setting);
});

test("一般業主或偽造平台身分無法異動方案且零寫入", async function () {
  var db = fakeDb();
  await assert.rejects(managePlatformStudioSubscription({
    DB: db, TENANT_ID: "platform-tenant", STAFF_ID: "platform-owner"
  }, { tenantId: "tenant-1", staffId: "owner-1", role: "owner" }, "tenant-1", {
    action: "upgrade", effectiveOn: "2026-08-06", newEndsOn: "2027-08-05",
    paymentConfirmed: true
  }), function (error) { return error.status === 403; });
  assert.equal(db.prepared.length, 0);
  assert.equal(db.batches.length, 0);
});

test("平台升級會同步旗艦權限、租期、付款事件與稽核", async function () {
  var db = fakeDb();
  db.prepare = function (sql) {
    var statement = { sql: sql, binds: [], bind: function () {
      this.binds = Array.from(arguments); return this;
    }, first: async function () {
      return { id: "tenant-1", plan_code: "standard", subscription_status: "active",
        starts_on: "2026-01-01", ends_on: "2026-12-31" };
    } };
    db.prepared.push(statement); return statement;
  };
  var result = await managePlatformStudioSubscription({
    DB: db, TENANT_ID: "platform-tenant", STAFF_ID: "platform-owner"
  }, { tenantId: "platform-tenant", staffId: "platform-owner", role: "owner" },
  "tenant-1", { action: "upgrade", effectiveOn: "2026-08-06",
    newEndsOn: "2027-08-05", paymentConfirmed: true });
  assert.equal(result.plan, "flagship");
  assert.ok(db.prepared.some(function (item) {
    return /UPDATE tenant_features/.test(item.sql) && item.binds.slice(0, 4).join() === "flagship,1,1,1";
  }));
  assert.ok(db.prepared.some(function (item) { return /tenant_subscription_events/.test(item.sql); }));
  assert.ok(db.prepared.some(function (item) { return /platform_subscription_/.test(item.sql); }));
  assert.equal(db.prepared.some(function (item) {
    return /owner_access_invites|staff_line_accounts|DELETE/.test(item.sql);
  }), false);
});

test("降級固定於租期結束生效，不立即停用或刪除資料", async function () {
  var db = fakeDb();
  db.prepare = function (sql) {
    var statement = { sql: sql, binds: [], bind: function () {
      this.binds = Array.from(arguments); return this;
    }, first: async function () {
      return { id: "tenant-1", plan_code: "flagship", subscription_status: "active",
        starts_on: "2026-01-01", ends_on: "2026-12-31" };
    } };
    db.prepared.push(statement); return statement;
  };
  var result = await managePlatformStudioSubscription({
    DB: db, TENANT_ID: "platform-tenant", STAFF_ID: "platform-owner"
  }, { tenantId: "platform-tenant", staffId: "platform-owner", role: "owner" },
  "tenant-1", { action: "downgrade", effectiveOn: "2026-08-06", paymentConfirmed: false });
  assert.equal(result.plan, "flagship");
  assert.equal(result.pendingPlan, "standard");
  assert.equal(result.pendingEffectiveOn, "2026-12-31");
  assert.equal(db.prepared.some(function (item) { return /UPDATE tenant_features/.test(item.sql); }), false);
  assert.equal(db.prepared.some(function (item) { return /DELETE/.test(item.sql); }), false);
});

test("續約必須確認付款並設定不早於生效日的新到期日", async function () {
  var db = fakeDb();
  await assert.rejects(managePlatformStudioSubscription({
    DB: db, TENANT_ID: "platform-tenant", STAFF_ID: "platform-owner"
  }, { tenantId: "platform-tenant", staffId: "platform-owner", role: "owner" },
  "tenant-1", { action: "renewal", newEndsOn: "2027-01-01", paymentConfirmed: false }),
  function (error) { return error.status === 400 && /確認已收款/.test(error.message); });
  assert.equal(db.prepared.length, 0);
});

test("平台不代填名稱，非法方案降為 standard", async function () {
  var env = {
    DB: fakeDb(),
    TENANT_ID: "platform-tenant",
    STAFF_ID: "platform-owner"
  };
  var selected = {
    tenantId: "platform-tenant",
    staffId: "platform-owner",
    role: "owner"
  };
  var result = await provisionOwnerStudio(env, selected, {
    plan: "偽造旗艦", assessmentTemplateCode: "brow_new_client"
  });
  assert.equal(result.plan, "standard");
  assert.equal(result.assessmentTemplateCode, "none");
});

test("免費試用建立旗艦權限但不在邀請建立時提前起算 14 天", async function () {
  var db = fakeDb();
  var result = await provisionOwnerStudio({
    DB: db, TENANT_ID: "platform-tenant", STAFF_ID: "platform-owner"
  }, { tenantId: "platform-tenant", staffId: "platform-owner", role: "owner" }, {
    plan: "trial", assessmentTemplateCode: "brow_new_client"
  });
  assert.equal(result.trial, true);
  assert.equal(result.plan, "flagship");
  var subscription = db.prepared.find(function (item) {
    return /INSERT INTO tenant_subscriptions/.test(item.sql);
  });
  assert.equal(subscription.binds[0], result.tenantId);
  assert.equal(subscription.binds[1], "trial");
  assert.doesNotMatch(subscription.sql, /starts_on|ends_on/);
  var features = db.prepared.find(function (item) { return /INSERT INTO tenant_features/.test(item.sql); });
  assert.equal(features.binds[2], 1);
});

test("標準版免費試用14天只建立標準權限且不啟用新客評估", async function () {
  var db = fakeDb();
  var result = await provisionOwnerStudio({
    DB: db, TENANT_ID: "platform-tenant", STAFF_ID: "platform-owner"
  }, { tenantId: "platform-tenant", staffId: "platform-owner", role: "owner" }, {
    plan: "standard_trial", assessmentTemplateCode: "brow_new_client"
  });
  assert.equal(result.trial, true);
  assert.equal(result.plan, "standard");
  assert.equal(result.assessmentTemplateCode, "none");
  var features = db.prepared.find(function (item) {
    return /INSERT INTO tenant_features/.test(item.sql);
  });
  assert.equal(features.binds[1], "standard");
  assert.equal(features.binds[2], 0);
  var subscription = db.prepared.find(function (item) {
    return /INSERT INTO tenant_subscriptions/.test(item.sql);
  });
  assert.equal(subscription.binds[1], "trial");
});

test("只有平台本人可一鍵指定工作室問卷並留下稽核", async function () {
  var db = fakeDb();
  db.prepare = function (sql) {
    var statement = { sql: sql, binds: [], bind: function () {
      this.binds = Array.from(arguments); return this;
    }, first: async function () { return { id: "tenant-1", plan_code: "flagship" }; } };
    db.prepared.push(statement); return statement;
  };
  var result = await updatePlatformStudioAssessmentTemplate({
    DB: db, TENANT_ID: "platform-tenant", STAFF_ID: "platform-owner"
  }, { tenantId: "platform-tenant", staffId: "platform-owner", role: "owner" },
  "tenant-1", { assessmentTemplateCode: "lip_blush_new_client" });
  assert.equal(result.assessmentTemplateCode, "lip_blush_new_client");
  assert.ok(db.prepared.some(function (item) { return /assessment_template_code/.test(item.sql); }));
  assert.ok(db.prepared.some(function (item) { return /assessment_sessions SET status='paused'/.test(item.sql); }));
  assert.ok(db.prepared.some(function (item) { return /platform_assessment_template_assigned/.test(item.sql); }));
});

test("一般業主與非法問卷都不能指定工作室問卷", async function () {
  var db = fakeDb();
  await assert.rejects(updatePlatformStudioAssessmentTemplate({
    DB: db, TENANT_ID: "platform-tenant", STAFF_ID: "platform-owner"
  }, { tenantId: "tenant-1", staffId: "owner-1", role: "owner" },
  "tenant-1", { assessmentTemplateCode: "lip_blush_new_client" }),
  function (error) { return error.status === 403; });
  db.prepare = function (sql) {
    var statement = { sql: sql, binds: [], bind: function () {
      this.binds = Array.from(arguments); return this;
    }, first: async function () { return { id: "tenant-1", plan_code: "flagship" }; } };
    db.prepared.push(statement); return statement;
  };
  await assert.rejects(updatePlatformStudioAssessmentTemplate({
    DB: db, TENANT_ID: "platform-tenant", STAFF_ID: "platform-owner"
  }, { tenantId: "platform-tenant", staffId: "platform-owner", role: "owner" },
  "tenant-1", { assessmentTemplateCode: "fake" }),
  function (error) { return error.status === 400; });
});

test("標準版固定不啟用新客評估問卷", async function () {
  var db = fakeDb();
  db.prepare = function (sql) {
    var statement = { sql: sql, binds: [], bind: function () {
      this.binds = Array.from(arguments); return this;
    }, first: async function () { return { id: "tenant-1", plan_code: "standard" }; } };
    db.prepared.push(statement); return statement;
  };
  var result = await updatePlatformStudioAssessmentTemplate({
    DB: db, TENANT_ID: "platform-tenant", STAFF_ID: "platform-owner"
  }, { tenantId: "platform-tenant", staffId: "platform-owner", role: "owner" },
  "tenant-1", { assessmentTemplateCode: "lip_blush_new_client" });
  assert.equal(result.assessmentTemplateCode, "none");
});

test("平台可將試用轉正式標準版並確認付款，不重建邀請或 LINE 綁定", async function () {
  var today = new Date().toISOString().slice(0, 10);
  var nextYear = new Date(Date.parse(today + "T00:00:00.000Z") + 365 * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);
  var db = fakeDb();
  db.prepare = function (sql) {
    var statement = { sql: sql, binds: [], bind: function () {
      this.binds = Array.from(arguments); return this;
    }, first: async function () { return {
      id: "tenant-1", plan_code: "flagship", subscription_status: "trial",
      starts_on: today, ends_on: nextYear
    }; } };
    db.prepared.push(statement); return statement;
  };
  var result = await managePlatformStudioSubscription({
    DB: db, TENANT_ID: "platform-tenant", STAFF_ID: "platform-owner"
  }, { tenantId: "platform-tenant", staffId: "platform-owner", role: "owner" },
  "tenant-1", { action: "activate", targetPlan: "standard", effectiveOn: today,
    newEndsOn: nextYear, paymentConfirmed: true });
  assert.equal(result.plan, "standard");
  assert.ok(db.prepared.some(function (item) { return /UPDATE tenants SET status='active'/.test(item.sql); }));
  assert.ok(db.prepared.some(function (item) { return /'converted'/.test(item.sql); }));
  assert.equal(db.prepared.some(function (item) {
    return /owner_access_invites|staff_line_accounts|DELETE/.test(item.sql);
  }), false);
});

test("只有平台可將已開始試用例外延長固定 14 天", async function () {
  var db = fakeDb();
  db.prepare = function (sql) {
    var statement = { sql: sql, binds: [], bind: function () {
      this.binds = Array.from(arguments); return this;
    }, first: async function () { return {
      id: "tenant-1", plan_code: "flagship", subscription_status: "trial",
      starts_on: "2026-08-06", ends_on: "2026-08-19"
    }; } };
    db.prepared.push(statement); return statement;
  };
  var result = await managePlatformStudioSubscription({
    DB: db, TENANT_ID: "platform-tenant", STAFF_ID: "platform-owner"
  }, { tenantId: "platform-tenant", staffId: "platform-owner", role: "owner" },
  "tenant-1", { action: "extend_trial" });
  assert.equal(result.endsOn, "2026-09-02");
  assert.ok(db.prepared.some(function (item) {
    return /platform_trial_extended/.test(item.sql) && /previousEndsOn/.test(String(item.binds[3]));
  }));
});

test("只有平台本人可更正已綁定名稱", async function () {
  var db = fakeDb();
  await assert.rejects(updatePlatformStudioIdentity({
    DB: db, TENANT_ID: "platform-tenant", STAFF_ID: "platform-owner"
  }, {
    tenantId: "other", staffId: "other", role: "owner"
  }, "tenant-1", {
    studioName: "更正工作室", ownerName: "更正業主"
  }), function (error) { return error.status === 403; });
  assert.equal(db.prepared.length, 0);
});

test("平台本人更正名稱會同步 tenant/location/staff/brand 並稽核", async function () {
  var db = fakeDb();
  db.prepare = function (sql) {
    var statement = {
      sql: sql,
      binds: [],
      bind: function () { this.binds = Array.from(arguments); return this; },
      first: async function () { return { id: "tenant-1", staff_id: "staff-1" }; }
    };
    db.prepared.push(statement);
    return statement;
  };
  var result = await updatePlatformStudioIdentity({
    DB: db, TENANT_ID: "platform-tenant", STAFF_ID: "platform-owner"
  }, {
    tenantId: "platform-tenant", staffId: "platform-owner", role: "owner"
  }, "tenant-1", {
    studioName: "更正工作室", ownerName: "更正業主"
  });
  assert.equal(result.ok, true);
  assert.equal(db.batches[0].length, 5);
  assert.ok(db.prepared.some(function (item) { return /UPDATE tenants SET name/.test(item.sql); }));
  assert.ok(db.prepared.some(function (item) { return /UPDATE locations SET name/.test(item.sql); }));
  assert.ok(db.prepared.some(function (item) { return /UPDATE staff SET display_name/.test(item.sql); }));
  assert.ok(db.prepared.some(function (item) { return /platform_studio_identity_updated/.test(item.sql); }));
});

test("平台本人可更正平台自己的工作室名稱", async function () {
  var db = fakeDb();
  db.prepare = function (sql) {
    var statement = {
      sql: sql,
      binds: [],
      bind: function () { this.binds = Array.from(arguments); return this; },
      first: async function () { return { id: "platform-tenant", staff_id: "platform-owner" }; }
    };
    db.prepared.push(statement);
    return statement;
  };
  var result = await updatePlatformStudioIdentity({
    DB: db, TENANT_ID: "platform-tenant", STAFF_ID: "platform-owner"
  }, {
    tenantId: "platform-tenant", staffId: "platform-owner", role: "owner"
  }, "platform-tenant", {
    studioName: "茱麗葉工作室", ownerName: "平台負責人"
  });
  assert.equal(result.ok, true);
  assert.equal(result.tenantId, "platform-tenant");
  assert.equal(db.batches[0].length, 5);
});
