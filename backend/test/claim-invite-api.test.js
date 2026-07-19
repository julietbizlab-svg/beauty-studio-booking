/**
 * 一次性 LINE 認領邀請 API 整合測試（node:test ＋ assert，零依賴）
 *
 * 直接呼叫 index.js 的 fetch handler，搭配 Fake D1 與假 LINE verify
 * endpoint（攔截 globalThis.fetch，不連任何遠端服務）。
 *
 * 驗證重點：
 * - owner POST／GET／DELETE claim-invite 的 auth（401／403／Notion 501）
 * - deleted／已綁 LINE 客戶不可建立邀請；tenant scoped SQL
 * - POST 只保存 SHA-256 hash；原始 token 只出現在建立回應
 * - GET／audit／錯誤訊息不含原始 token；重新產生撤銷舊邀請
 * - customer claim：驗證後 LINE userId 為準、偽造 payload 被忽略
 * - 無效／過期／撤銷／已使用 token fail closed；conflict 零寫入
 * - 成功時 line_accounts＋invite＋audit 同一 batch；競態只有一次成功
 * - response 不含 token／hash／其他 LINE userId／業主 notes
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { hashClaimToken } from "../src/d1-claim-invites.js";

var TENANT = "tenant-claim-001";
var STAFF = "staff-claim-001";
var API = "https://example.com";

var OWNER_TOKEN = "token-owner";
var STRANGER_TOKEN = "token-stranger";
var CUSTOMER_TOKEN = "token-customer";

var TOKEN_SUBS = {};
TOKEN_SUBS[OWNER_TOKEN] = "U-owner-1";
TOKEN_SUBS[STRANGER_TOKEN] = "U-stranger";
TOKEN_SUBS[CUSTOMER_TOKEN] = "U-claimer-1";

// 攔截 LINE verify endpoint；其他外部連線一律拒絕
globalThis.fetch = async function (url, options) {
  if (String(url) === "https://api.line.me/oauth2/v2.1/verify") {
    var body = String((options && options.body) || "");
    var match = body.match(/id_token=([^&]*)/);
    var token = decodeURIComponent((match && match[1]) || "");
    var sub = TOKEN_SUBS[token];
    if (!sub) {
      return new Response(
        JSON.stringify({ error_description: "invalid token" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response(
      JSON.stringify({ sub: sub, name: "測試", picture: "" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
  throw new Error("測試不允許未預期的外部連線：" + url);
};

/** 最小 Fake D1（與 owner-customers-by-id.test.js 相同介面，加 batch 控制） */
function makeFakeDb(handler, batchHandler) {
  var db = {
    calls: [],
    batches: [],
    prepare: function (sql) {
      return {
        bind: function () {
          var binds = Array.prototype.slice.call(arguments);
          return {
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
        }
      };
    },
    batch: async function (statements) {
      db.batches.push(statements);
      statements.forEach(function (s) {
        db.calls.push({ sql: s.sql, binds: s.binds, method: "batch" });
      });
      if (batchHandler) {
        return batchHandler(statements);
      }
      return statements.map(function () { return { meta: { changes: 1 } }; });
    }
  };
  return db;
}

function makeD1Env(db) {
  return {
    DATA_BACKEND: "d1",
    DB: db,
    TENANT_ID: TENANT,
    LOCATION_ID: "location-claim-001",
    STAFF_ID: STAFF,
    LIFF_CHANNEL_ID: "liff-channel-test",
    OWNER_LINE_USER_IDS: "U-owner-1"
  };
}

function makeNotionEnv() {
  return {
    DATA_BACKEND: "notion",
    NOTION_TOKEN: "notion-secret",
    NOTION_DATABASE_SERVICES: "db-services",
    NOTION_DATABASE_SLOTS: "db-slots",
    NOTION_DATABASE_BOOKINGS: "db-bookings",
    NOTION_DATABASE_SETTINGS: "db-settings",
    LIFF_CHANNEL_ID: "liff-channel-test",
    OWNER_LINE_USER_IDS: "U-owner-1"
  };
}

function jsonRequest(method, path, body, token) {
  var headers = { "Content-Type": "application/json" };
  if (token) {
    headers.Authorization = "Bearer " + token;
  }
  return new Request(API + path, {
    method: method,
    headers: headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
}

var OWNER_INVITE_PATH = "/api/owner/customers/by-id/cust-1/claim-invite";
var VALID_CLAIM_TOKEN = "u".repeat(43); // 合法 base64url 格式

function unlinkedCustomerRow(overrides) {
  return Object.assign({
    customer_id: "cust-1",
    display_name: "匯入客",
    mobile: "0912345678",
    birthday: "1990-01-01",
    line_account_id: null
  }, overrides || {});
}

/**
 * 通用 handler 工廠：
 * data = { staff, customer, inviteByToken, inviteByCustomer, activeInvite,
 *          lineAccountByUser, latestInvite }
 */
function makeHandler(data) {
  return function (sql, binds, method) {
    if (method !== "first") {
      return null;
    }
    if (/FROM staff/.test(sql)) {
      return data.staff !== undefined ? data.staff : { id: STAFF };
    }
    if (/FROM customers c/.test(sql)) {
      return data.customer !== undefined ? data.customer : null;
    }
    if (/FROM customer_claim_invites/.test(sql) && /token_hash = \?2/.test(sql)) {
      return data.inviteByToken !== undefined ? data.inviteByToken : null;
    }
    if (/FROM customer_claim_invites/.test(sql) && /ORDER BY created_at DESC/.test(sql)) {
      return data.inviteByCustomer !== undefined ? data.inviteByCustomer : null;
    }
    if (/FROM customer_claim_invites/.test(sql) && /status = 'active'/.test(sql)) {
      return data.activeInvite !== undefined ? data.activeInvite : null;
    }
    if (/SELECT status, expires_at FROM customer_claim_invites/.test(sql)) {
      return data.latestInvite !== undefined ? data.latestInvite : null;
    }
    if (/FROM line_accounts/.test(sql) && /line_user_id = \?2/.test(sql)) {
      return data.lineAccountByUser !== undefined ? data.lineAccountByUser : null;
    }
    return null;
  };
}

function futureIso() {
  return new Date(Date.now() + 3600 * 1000).toISOString();
}

function pastIso() {
  return new Date(Date.now() - 3600 * 1000).toISOString();
}

// ─────────────────── Owner API：auth 與 fail closed ───────────────────

test("owner claim-invite：缺 token 401、非 owner 403（POST／GET／DELETE）", async function () {
  var db = makeFakeDb(makeHandler({ customer: unlinkedCustomerRow() }));
  var env = makeD1Env(db);

  for (var i = 0; i < 3; i++) {
    var method = ["POST", "GET", "DELETE"][i];
    var noToken = await worker.fetch(jsonRequest(method, OWNER_INVITE_PATH), env);
    assert.equal(noToken.status, 401, method + " 缺 token 必須 401");

    var stranger = await worker.fetch(
      jsonRequest(method, OWNER_INVITE_PATH, undefined, STRANGER_TOKEN), env
    );
    assert.equal(stranger.status, 403, method + " 非 owner 必須 403");
  }
  assert.equal(db.batches.length, 0, "未授權請求不得寫入");
});

test("owner claim-invite：Notion 模式 fail closed 501", async function () {
  var env = makeNotionEnv();
  for (var i = 0; i < 3; i++) {
    var method = ["POST", "GET", "DELETE"][i];
    var response = await worker.fetch(
      jsonRequest(method, OWNER_INVITE_PATH, undefined, OWNER_TOKEN), env
    );
    assert.equal(response.status, 501, method + " Notion 模式必須 501");
  }
});

test("customer claim：Notion 模式 fail closed 501", async function () {
  var response = await worker.fetch(
    jsonRequest("POST", "/api/customer/claim-invite",
      { claimToken: VALID_CLAIM_TOKEN }, CUSTOMER_TOKEN),
    makeNotionEnv()
  );
  assert.equal(response.status, 501);
});

// ─────────────────── Owner API：建立邀請 ───────────────────

test("POST：不存在／deleted 客戶 404，且查詢 tenant scoped", async function () {
  var db = makeFakeDb(makeHandler({ customer: null }));
  var response = await worker.fetch(
    jsonRequest("POST", OWNER_INVITE_PATH, undefined, OWNER_TOKEN),
    makeD1Env(db)
  );
  assert.equal(response.status, 404);
  assert.equal(db.batches.length, 0, "404 不得寫入");

  var customerQuery = db.calls.find(function (c) {
    return /FROM customers c/.test(c.sql);
  });
  assert.ok(customerQuery, "必須查詢客戶");
  assert.equal(customerQuery.binds[0], TENANT, "客戶查詢必須 tenant scoped");
  assert.ok(/deleted_at IS NULL/.test(customerQuery.sql), "必須排除 deleted 客戶");
});

test("POST：已綁 LINE 客戶不可建立邀請（409、零寫入）", async function () {
  var db = makeFakeDb(makeHandler({
    customer: unlinkedCustomerRow({ line_account_id: "la-linked" })
  }));
  var response = await worker.fetch(
    jsonRequest("POST", OWNER_INVITE_PATH, undefined, OWNER_TOKEN),
    makeD1Env(db)
  );
  assert.equal(response.status, 409);
  assert.equal(db.batches.length, 0);
});

test("POST：STAFF_ID 不屬於 tenant 時 fail closed，不寫入", async function () {
  var db = makeFakeDb(makeHandler({ staff: null, customer: unlinkedCustomerRow() }));
  var response = await worker.fetch(
    jsonRequest("POST", OWNER_INVITE_PATH, undefined, OWNER_TOKEN),
    makeD1Env(db)
  );
  assert.equal(response.status, 500);
  assert.equal(db.batches.length, 0);
});

test("POST 成功：DB 只存 SHA-256 hash、回應含一次性 raw token、撤銷舊邀請與 audit 同一 batch", async function () {
  var db = makeFakeDb(makeHandler({ customer: unlinkedCustomerRow() }));
  var response = await worker.fetch(
    jsonRequest("POST", OWNER_INVITE_PATH, undefined, OWNER_TOKEN),
    makeD1Env(db)
  );
  assert.equal(response.status, 200);
  var body = await response.json();

  assert.ok(body.claimToken, "建立回應必須含一次性原始 token");
  assert.match(body.claimToken, /^[A-Za-z0-9_-]{43}$/, "token 應為 256-bit base64url");
  assert.equal(body.invite.status, "active");
  assert.ok(body.invite.expiresAt > new Date().toISOString(), "必須有未來的到期時間");

  assert.equal(db.batches.length, 1, "撤銷舊邀請＋INSERT＋audit 必須同一 batch");
  var statements = db.batches[0];
  assert.equal(statements.length, 3);

  var revokeOld = statements[0];
  assert.ok(/UPDATE customer_claim_invites/.test(revokeOld.sql));
  assert.ok(/status = 'revoked'/.test(revokeOld.sql));
  assert.ok(/status = 'active'/.test(revokeOld.sql), "只撤銷 active 舊邀請");
  assert.ok(revokeOld.binds.indexOf(TENANT) !== -1, "撤銷必須 tenant scoped");

  var insertInvite = statements[1];
  assert.ok(/INSERT INTO customer_claim_invites/.test(insertInvite.sql));
  var expectedHash = await hashClaimToken(body.claimToken);
  assert.ok(
    insertInvite.binds.indexOf(expectedHash) !== -1,
    "DB 必須保存 token 的 SHA-256 hash"
  );
  assert.ok(
    insertInvite.binds.indexOf(body.claimToken) === -1,
    "DB 不得保存原始 token"
  );

  var audit = statements[2];
  assert.ok(/INSERT INTO audit_logs/.test(audit.sql));
  var auditJson = JSON.stringify(audit.binds);
  assert.ok(auditJson.indexOf(body.claimToken) === -1, "audit 不得含原始 token");
  assert.ok(auditJson.indexOf(expectedHash) === -1, "audit 不得含 token hash");
  assert.ok(auditJson.indexOf("U-owner-1") === -1, "audit 不得含 LINE userId");
});

test("GET：只回狀態等安全資訊，不含 raw token 或 hash；active 過期顯示 expired", async function () {
  var db = makeFakeDb(makeHandler({
    customer: unlinkedCustomerRow(),
    inviteByCustomer: {
      status: "active",
      expires_at: pastIso(),
      created_at: "2026-07-18T00:00:00.000Z",
      claimed_at: null,
      revoked_at: null
    }
  }));
  var response = await worker.fetch(
    jsonRequest("GET", OWNER_INVITE_PATH, undefined, OWNER_TOKEN),
    makeD1Env(db)
  );
  assert.equal(response.status, 200);
  var body = await response.json();
  assert.equal(body.invite.status, "expired", "active 但過期必須顯示 expired");
  var raw = JSON.stringify(body);
  assert.ok(raw.indexOf("token") === -1, "GET 回應不得含任何 token 欄位");
  assert.ok(raw.indexOf("hash") === -1, "GET 回應不得含 hash");
  assert.equal(db.batches.length, 0, "GET 零寫入");
});

test("DELETE：撤銷 active 邀請 tenant scoped；無 active 邀請時冪等", async function () {
  var db = makeFakeDb(makeHandler({
    customer: unlinkedCustomerRow(),
    activeInvite: { id: "invite-old" }
  }));
  var response = await worker.fetch(
    jsonRequest("DELETE", OWNER_INVITE_PATH, undefined, OWNER_TOKEN),
    makeD1Env(db)
  );
  var body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.revoked, true);
  assert.equal(db.batches.length, 1);
  var update = db.batches[0][0];
  assert.ok(/status = 'revoked'/.test(update.sql));
  assert.ok(update.binds.indexOf(TENANT) !== -1, "撤銷必須 tenant scoped");
  assert.ok(/status = 'active'/.test(update.sql), "只能撤銷 active 邀請");

  // 無 active 邀請：冪等，零寫入
  var dbNone = makeFakeDb(makeHandler({
    customer: unlinkedCustomerRow(),
    activeInvite: null
  }));
  var idempotent = await worker.fetch(
    jsonRequest("DELETE", OWNER_INVITE_PATH, undefined, OWNER_TOKEN),
    makeD1Env(dbNone)
  );
  var idempotentBody = await idempotent.json();
  assert.equal(idempotent.status, 200);
  assert.equal(idempotentBody.revoked, false);
  assert.equal(dbNone.batches.length, 0);
});

// ─────────────────── Customer claim API ───────────────────

function activeInviteRow(overrides) {
  return Object.assign({
    id: "invite-1",
    customer_id: "cust-1",
    status: "active",
    expires_at: futureIso()
  }, overrides || {});
}

test("claim：缺 LINE ID token 401", async function () {
  var db = makeFakeDb(makeHandler({}));
  var response = await worker.fetch(
    jsonRequest("POST", "/api/customer/claim-invite", { claimToken: VALID_CLAIM_TOKEN }),
    makeD1Env(db)
  );
  assert.equal(response.status, 401);
  assert.equal(db.calls.length, 0, "未驗證身分前不得碰 DB");
});

test("claim：偽造 payload userId 被忽略，一律以驗證後 sub 為準", async function () {
  var db = makeFakeDb(
    makeHandler({
      inviteByToken: activeInviteRow(),
      customer: unlinkedCustomerRow(),
      lineAccountByUser: null
    })
  );
  var response = await worker.fetch(
    jsonRequest("POST", "/api/customer/claim-invite", {
      claimToken: VALID_CLAIM_TOKEN,
      userId: "U-forged",
      lineUserId: "U-forged-2"
    }, CUSTOMER_TOKEN),
    makeD1Env(db)
  );
  assert.equal(response.status, 200);

  var allBinds = JSON.stringify(db.calls.map(function (c) { return c.binds; }));
  assert.ok(allBinds.indexOf("U-forged") === -1, "偽造 userId 不得進入任何 SQL");
  assert.ok(allBinds.indexOf("U-claimer-1") !== -1, "必須使用驗證後的 LINE userId");
});

test("claim：無效 token 404、格式不符 404，皆零寫入且不洩漏個資", async function () {
  var db = makeFakeDb(makeHandler({ inviteByToken: null }));
  var env = makeD1Env(db);

  var invalid = await worker.fetch(
    jsonRequest("POST", "/api/customer/claim-invite",
      { claimToken: VALID_CLAIM_TOKEN }, CUSTOMER_TOKEN), env
  );
  assert.equal(invalid.status, 404);
  var invalidBody = await invalid.json();
  assert.ok(invalidBody.message.indexOf("匯入客") === -1, "錯誤訊息不得含客戶姓名");

  var badFormat = await worker.fetch(
    jsonRequest("POST", "/api/customer/claim-invite",
      { claimToken: "short" }, CUSTOMER_TOKEN), env
  );
  assert.equal(badFormat.status, 404);

  assert.equal(db.batches.length, 0, "失敗一律零寫入");
});

test("claim：過期／撤銷／已使用 token fail closed（410）零寫入", async function () {
  var cases = [
    { invite: activeInviteRow({ expires_at: pastIso() }), keyword: "過期" },
    { invite: activeInviteRow({ status: "revoked" }), keyword: "撤銷" },
    { invite: activeInviteRow({ status: "claimed" }), keyword: "使用" }
  ];
  for (var i = 0; i < cases.length; i++) {
    var db = makeFakeDb(makeHandler({
      inviteByToken: cases[i].invite,
      customer: unlinkedCustomerRow(),
      lineAccountByUser: null
    }));
    var response = await worker.fetch(
      jsonRequest("POST", "/api/customer/claim-invite",
        { claimToken: VALID_CLAIM_TOKEN }, CUSTOMER_TOKEN),
      makeD1Env(db)
    );
    assert.equal(response.status, 410, cases[i].keyword + " 必須 410");
    var body = await response.json();
    assert.ok(body.message.indexOf(cases[i].keyword) !== -1);
    assert.equal(db.batches.length, 0, cases[i].keyword + " 必須零寫入");
  }
});

test("claim 成功：line_accounts＋invite claimed＋audit 同一 batch、tenant scoped、不動 customers", async function () {
  var db = makeFakeDb(makeHandler({
    inviteByToken: activeInviteRow(),
    customer: unlinkedCustomerRow(),
    lineAccountByUser: null
  }));
  var response = await worker.fetch(
    jsonRequest("POST", "/api/customer/claim-invite",
      { claimToken: VALID_CLAIM_TOKEN }, CUSTOMER_TOKEN),
    makeD1Env(db)
  );
  assert.equal(response.status, 200);
  var body = await response.json();
  assert.equal(body.claimed, true);
  assert.equal(body.alreadyLinked, false);
  assert.equal(body.customer.customerName, "匯入客");

  assert.equal(db.batches.length, 1, "全部寫入必須在同一 batch");
  var statements = db.batches[0];
  assert.equal(statements.length, 3);

  var insertLink = statements[0];
  assert.ok(/INSERT INTO line_accounts/.test(insertLink.sql));
  assert.ok(insertLink.binds.indexOf(TENANT) !== -1, "line_accounts 必須 tenant scoped");
  assert.ok(insertLink.binds.indexOf("U-claimer-1") !== -1);
  assert.ok(
    /status = 'active' AND expires_at >/.test(insertLink.sql),
    "INSERT 必須以邀請仍 active 且未過期為條件"
  );

  var updateInvite = statements[1];
  assert.ok(/UPDATE customer_claim_invites/.test(updateInvite.sql));
  assert.ok(/status = 'claimed'/.test(updateInvite.sql));
  assert.ok(/status = 'active'/.test(updateInvite.sql), "只有 active 邀請可轉 claimed");

  var audit = statements[2];
  assert.ok(/INSERT INTO audit_logs/.test(audit.sql));
  var auditJson = JSON.stringify(audit.binds);
  assert.ok(auditJson.indexOf("U-claimer-1") === -1, "audit 不得含 LINE userId");
  assert.ok(auditJson.indexOf(VALID_CLAIM_TOKEN) === -1, "audit 不得含原始 token");

  statements.forEach(function (s) {
    assert.ok(!/UPDATE customers/.test(s.sql), "不得修改 customer 個資");
    assert.ok(!/INSERT INTO customers/.test(s.sql), "不得建立第二個 customer");
  });

  var raw = JSON.stringify(body);
  assert.ok(raw.indexOf(VALID_CLAIM_TOKEN) === -1, "回應不得回傳原始 token");
  assert.ok(raw.indexOf(await hashClaimToken(VALID_CLAIM_TOKEN)) === -1, "回應不得含 hash");
  assert.ok(raw.indexOf("notes") === -1 && raw.indexOf("note") === -1, "回應不得含業主備註");
  assert.ok(raw.indexOf("U-claimer-1") === -1, "回應不得含 LINE userId");
});

test("claim：同一 LINE userId 已綁定其他 customer → 409 零寫入", async function () {
  var db = makeFakeDb(makeHandler({
    inviteByToken: activeInviteRow(),
    customer: unlinkedCustomerRow(),
    lineAccountByUser: { id: "la-other", customer_id: "cust-other" }
  }));
  var response = await worker.fetch(
    jsonRequest("POST", "/api/customer/claim-invite",
      { claimToken: VALID_CLAIM_TOKEN }, CUSTOMER_TOKEN),
    makeD1Env(db)
  );
  assert.equal(response.status, 409);
  assert.equal(db.batches.length, 0, "conflict 必須零寫入");
  var body = await response.json();
  assert.ok(body.message.indexOf("cust-other") === -1, "不得洩漏其他 customer");
});

test("claim：customer 已被其他 LINE 帳號認領 → 409 零寫入", async function () {
  var db = makeFakeDb(makeHandler({
    inviteByToken: activeInviteRow(),
    customer: unlinkedCustomerRow({ line_account_id: "la-taken" }),
    lineAccountByUser: null
  }));
  var response = await worker.fetch(
    jsonRequest("POST", "/api/customer/claim-invite",
      { claimToken: VALID_CLAIM_TOKEN }, CUSTOMER_TOKEN),
    makeD1Env(db)
  );
  assert.equal(response.status, 409);
  assert.equal(db.batches.length, 0);
});

test("claim：同一 LINE 帳號重複提交（已綁同一 customer）安全冪等", async function () {
  var db = makeFakeDb(makeHandler({
    inviteByToken: activeInviteRow({ status: "claimed" }),
    customer: unlinkedCustomerRow({ line_account_id: "la-mine" }),
    lineAccountByUser: { id: "la-mine", customer_id: "cust-1" }
  }));
  var response = await worker.fetch(
    jsonRequest("POST", "/api/customer/claim-invite",
      { claimToken: VALID_CLAIM_TOKEN }, CUSTOMER_TOKEN),
    makeD1Env(db)
  );
  assert.equal(response.status, 200);
  var body = await response.json();
  assert.equal(body.claimed, true);
  assert.equal(body.alreadyLinked, true);
  assert.equal(db.batches.length, 0, "已完成的邀請不得再寫入");
});

test("claim 競態：batch UNIQUE 失敗後重新分類（同 customer 冪等、不同 customer 409）", async function () {
  // 第一次 batch 丟 UNIQUE：模擬另一個認領先寫入
  var phase = { afterRace: false };
  var db = makeFakeDb(
    function (sql, binds, method) {
      if (method !== "first") return null;
      if (/FROM customer_claim_invites/.test(sql) && /token_hash/.test(sql)) {
        return activeInviteRow();
      }
      if (/FROM customers c/.test(sql)) {
        return unlinkedCustomerRow();
      }
      if (/FROM line_accounts/.test(sql)) {
        // 競態前查不到；batch 失敗後查到同 customer 的綁定
        return phase.afterRace ? { id: "la-race", customer_id: "cust-1" } : null;
      }
      return null;
    },
    function () {
      phase.afterRace = true;
      throw new Error("UNIQUE constraint failed: line_accounts.tenant_id, line_accounts.customer_id");
    }
  );
  var response = await worker.fetch(
    jsonRequest("POST", "/api/customer/claim-invite",
      { claimToken: VALID_CLAIM_TOKEN }, CUSTOMER_TOKEN),
    makeD1Env(db)
  );
  assert.equal(response.status, 200, "同一 LINE 帳號競態必須冪等成功");
  var body = await response.json();
  assert.equal(body.alreadyLinked, true);

  // 不同 LINE 帳號競態：batch 失敗後查到的是別的 customer → 409
  var phase2 = { afterRace: false };
  var db2 = makeFakeDb(
    function (sql, binds, method) {
      if (method !== "first") return null;
      if (/FROM customer_claim_invites/.test(sql) && /token_hash/.test(sql)) {
        return activeInviteRow();
      }
      if (/FROM customers c/.test(sql)) {
        return unlinkedCustomerRow();
      }
      if (/FROM line_accounts/.test(sql)) {
        return phase2.afterRace ? null : null;
      }
      return null;
    },
    function () {
      phase2.afterRace = true;
      throw new Error("UNIQUE constraint failed");
    }
  );
  var response2 = await worker.fetch(
    jsonRequest("POST", "/api/customer/claim-invite",
      { claimToken: VALID_CLAIM_TOKEN }, CUSTOMER_TOKEN),
    makeD1Env(db2)
  );
  assert.equal(response2.status, 409, "資源被別人搶走必須 409，不得成功");
});

test("claim：條件式 INSERT 未寫入（邀請讀取後被撤銷）fail closed 410", async function () {
  var db = makeFakeDb(
    makeHandler({
      inviteByToken: activeInviteRow(),
      customer: unlinkedCustomerRow(),
      lineAccountByUser: null,
      latestInvite: { status: "revoked", expires_at: futureIso() }
    }),
    function (statements) {
      // 條件不成立：整批 0 changes
      return statements.map(function () { return { meta: { changes: 0 } }; });
    }
  );
  var response = await worker.fetch(
    jsonRequest("POST", "/api/customer/claim-invite",
      { claimToken: VALID_CLAIM_TOKEN }, CUSTOMER_TOKEN),
    makeD1Env(db)
  );
  assert.equal(response.status, 410);
  var body = await response.json();
  assert.ok(body.message.indexOf("撤銷") !== -1);
});
