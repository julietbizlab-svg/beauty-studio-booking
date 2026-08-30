import test from "node:test";
import assert from "node:assert/strict";
import { claimOwnerAccessInvite } from "../src/owner-hub.js";

function fakeClaimDb(options) {
  var opts = options || {};
  var calls = [];
  var firstIndex = 0;
  var firstRows = opts.firstRows || [
    {
      id: "invite-1", tenant_id: "tenant-1", staff_id: "staff-1",
      status: opts.inviteStatus || "active",
      expires_at: opts.expiresAt || "2999-01-01T00:00:00.000Z",
      staff_name: "待業主首次設定", tenant_name: "待業主首次設定",
      subscription_status: opts.subscriptionStatus || "trial",
      trial_used: opts.trialUsed != null ? opts.trialUsed : 0,
      plan_code: opts.planCode || "flagship"
    },
    opts.existingLineRow === undefined ? null : opts.existingLineRow,
    opts.existingStaffRow === undefined ? null : opts.existingStaffRow
  ];
  var batchResults = opts.batchResults;
  return {
    calls: calls,
    batches: [],
    prepare: function (sql) {
      var call = { sql: sql, binds: [] };
      calls.push(call);
      return {
        bind: function () {
          call.binds = Array.from(arguments);
          return this;
        },
        first: async function () { return firstRows[firstIndex++]; }
      };
    },
    batch: async function (items) {
      this.batches.push(items);
      if (typeof batchResults === "function") return batchResults(items);
      return items.map(function () { return { success: true, meta: { changes: 1 } }; });
    }
  };
}

test("首次認領必須由業主填寫兩個名稱", async function () {
  var db = fakeClaimDb();
  await assert.rejects(claimOwnerAccessInvite({
    DB: db, LINE_PROVIDER_ID: "provider"
  }, {
    inviteToken: "a".repeat(64), lineUserId: "line-owner",
    studioName: "", ownerName: "業主",
    accountBindingAccepted: true, termsAccepted: true, termsVersion: "2026-08-06"
  }), function (error) { return error.status === 400; });
  assert.equal(db.calls.length, 0);
});

test("首次認領未明確同意綁定與最新版規範時零寫入", async function () {
  for (var consent of [
    { accountBindingAccepted: false, termsAccepted: true, termsVersion: "2026-08-06" },
    { accountBindingAccepted: true, termsAccepted: false, termsVersion: "2026-08-06" },
    { accountBindingAccepted: true, termsAccepted: true, termsVersion: "舊版" }
  ]) {
    var db = fakeClaimDb();
    await assert.rejects(claimOwnerAccessInvite({
      DB: db, LINE_PROVIDER_ID: "provider"
    }, Object.assign({
      inviteToken: "d".repeat(64), lineUserId: "line-owner",
      studioName: "工作室", ownerName: "業主"
    }, consent)), function (error) { return error.status === 400; });
    assert.equal(db.calls.length, 0);
  }
});

test("邀請有效時可認領：同一批次綁定 LINE、鎖定名稱並留下稽核", async function () {
  var db = fakeClaimDb();
  var result = await claimOwnerAccessInvite({
    DB: db, LINE_PROVIDER_ID: "provider"
  }, {
    inviteToken: "b".repeat(64), lineUserId: "line-owner",
    studioName: "晴光美研", ownerName: "王小姐",
    accountBindingAccepted: true, termsAccepted: true, termsVersion: "2026-08-06"
  });
  assert.equal(result.tenantName, "晴光美研");
  assert.equal(result.staffName, "王小姐");
  assert.equal(db.batches.length, 1);
  assert.equal(db.batches[0].length, 9);
  assert.ok(db.calls.some(function (call) {
    return /INSERT INTO staff_line_accounts/.test(call.sql) &&
      /WHERE EXISTS \(SELECT 1 FROM owner_access_invites/.test(call.sql);
  }));
  assert.ok(db.calls.some(function (call) {
    return /UPDATE owner_access_invites SET status='claimed'/.test(call.sql);
  }));
  assert.ok(db.calls.some(function (call) { return /UPDATE tenants SET name/.test(call.sql); }));
  assert.ok(db.calls.some(function (call) { return /UPDATE locations SET name/.test(call.sql); }));
  assert.ok(db.calls.some(function (call) { return /UPDATE staff SET display_name/.test(call.sql); }));
  assert.ok(db.calls.some(function (call) {
    return /brand_name/.test(call.sql) && call.binds.includes("晴光美研");
  }));
  var auditCall = db.calls.find(function (call) {
    return /INSERT INTO audit_logs/.test(call.sql) &&
      /owner_identity_set_at_claim/.test(call.sql);
  });
  assert.ok(auditCall, "必須寫入 audit_logs");
  assert.match(auditCall.sql, /'staff'/);
  assert.match(auditCall.sql, /'line'/);
  assert.doesNotMatch(auditCall.sql, /'line_user'/);
  assert.doesNotMatch(auditCall.sql, /'liff'/);
  assert.ok(auditCall.binds.includes("staff-1"));
  assert.equal(auditCall.binds.includes("line-owner"), false);
  assert.ok(db.calls.some(function (call) {
    return /UPDATE tenant_subscriptions SET starts_on/.test(call.sql) &&
      /trial_used=1/.test(call.sql);
  }));
  var trialCall = db.calls.find(function (call) {
    return /INSERT INTO tenant_trial_events/.test(call.sql);
  });
  assert.ok(trialCall);
  assert.match(trialCall.sql, /'line_user'/);
  assert.ok(trialCall.binds.some(function (value) {
    return /"trialDays":14/.test(String(value)) && /"plan":"flagship"/.test(String(value));
  }));
  var token = "b".repeat(64);
  assert.equal(db.calls.some(function (call) {
    return call.binds.includes(token);
  }), false, "原始 token 不得進入 D1 binds");
});

test("邀請過期不可認領且零寫入", async function () {
  var db = fakeClaimDb({ expiresAt: "2020-01-01T00:00:00.000Z" });
  await assert.rejects(claimOwnerAccessInvite({
    DB: db, LINE_PROVIDER_ID: "provider"
  }, {
    inviteToken: "e".repeat(64), lineUserId: "line-owner",
    studioName: "晴光美研", ownerName: "王小姐",
    accountBindingAccepted: true, termsAccepted: true, termsVersion: "2026-08-06"
  }), function (error) {
    return error.status === 404 && /過期|無效/.test(error.message);
  });
  assert.equal(db.batches.length, 0);
});

test("已使用邀請不可再次認領", async function () {
  var db = fakeClaimDb({ inviteStatus: "claimed" });
  await assert.rejects(claimOwnerAccessInvite({
    DB: db, LINE_PROVIDER_ID: "provider"
  }, {
    inviteToken: "c".repeat(64), lineUserId: "other-line",
    studioName: "惡意改名", ownerName: "其他人",
    accountBindingAccepted: true, termsAccepted: true, termsVersion: "2026-08-06"
  }), function (error) { return error.status === 404; });
  assert.equal(db.batches.length, 0);
});

test("已綁定 LINE 的業主人員不可再用邀請改綁", async function () {
  var db = fakeClaimDb({
    existingStaffRow: { line_user_id: "already-bound" }
  });
  await assert.rejects(claimOwnerAccessInvite({
    DB: db, LINE_PROVIDER_ID: "provider"
  }, {
    inviteToken: "f".repeat(64), lineUserId: "new-line",
    studioName: "晴光美研", ownerName: "王小姐",
    accountBindingAccepted: true, termsAccepted: true, termsVersion: "2026-08-06"
  }), function (error) { return error.status === 409; });
  assert.equal(db.batches.length, 0);
});

test("batch 任一步失敗時不視為成功且保留衝突訊息", async function () {
  var db = fakeClaimDb({
    batchResults: function (items) {
      return items.map(function (_item, index) {
        return {
          success: true,
          meta: { changes: index === 1 ? 0 : 1 }
        };
      });
    }
  });
  await assert.rejects(claimOwnerAccessInvite({
    DB: db, LINE_PROVIDER_ID: "provider"
  }, {
    inviteToken: "1".repeat(64), lineUserId: "line-owner",
    studioName: "晴光美研", ownerName: "王小姐",
    accountBindingAccepted: true, termsAccepted: true, termsVersion: "2026-08-06"
  }), function (error) {
    return error.status === 409 && /邀請已被使用/.test(error.message);
  });
  assert.equal(db.batches.length, 1);
});

test("標準版試用認領寫入 trial 事件且 plan 為 standard", async function () {
  var db = fakeClaimDb({ planCode: "standard", subscriptionStatus: "trial" });
  await claimOwnerAccessInvite({
    DB: db, LINE_PROVIDER_ID: "provider"
  }, {
    inviteToken: "2".repeat(64), lineUserId: "line-owner",
    studioName: "美甲工作室", ownerName: "李小姐",
    accountBindingAccepted: true, termsAccepted: true, termsVersion: "2026-08-06"
  });
  var trialCall = db.calls.find(function (call) {
    return /INSERT INTO tenant_trial_events/.test(call.sql);
  });
  assert.ok(trialCall);
  assert.ok(trialCall.binds.some(function (value) {
    return /"plan":"standard"/.test(String(value));
  }));
});
