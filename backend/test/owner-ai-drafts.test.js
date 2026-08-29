/**
 * Owner AI 隱私強化／能力旗標／限流／嚴格 schema 測試
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import worker from "../src/index.js";
import {
  inferOwnerAiServiceCategory,
  assertOwnerAiMessageDraftMatchesService,
  buildOwnerRescheduleCoordinationDraft,
  buildOwnerPostServiceCareDraft
} from "../src/owner-ai.js";
import {
  FIXED_GREETING,
  AI_OUTPUT_MAX_CODE_POINTS,
  AI_RATE_SUMMARY_LIMIT,
  assertDailySummaryPayloadSchema,
  assertMessageDraftPayloadSchema,
  sanitizeAndValidateAiOutput,
  createWorkersAiProvider,
  resolveAiProvider,
  isOwnerAiCapabilityEnabled,
  getOwnerAiCapability,
  resetAiRateLimitStoreForTests,
  assertOwnerAiRateLimit
} from "../src/ai-provider.js";
import { BOOKING_STATUSES as S } from "../src/booking-state-machine.js";

var migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
var repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
var MIGRATION_FILES = [
  "0001_init_core.sql",
  "0002_bookings.sql",
  "0003_settings_schedules.sql",
  "0004_ops_tables.sql",
  "0005_customer_import.sql",
  "0006_customer_claim_invites.sql",
  "0007_customer_comparison_photos.sql",
  "0008_booking_notice_policy.sql",
  "0009_booking_status_machine.sql",
  "0010_cleanup_duplicate_renamed_indexes.sql"
];

var TENANT = "tenant-ai-001";
var LOCATION = "location-ai-001";
var STAFF = "staff-ai-001";
var API = "https://example.com";
var NOW = "2026-07-20T12:00:00.000Z";
var TARGET_DATE = "2099-08-03";
var START_AT = "2099-08-03T02:00:00.000Z";
var END_AT = "2099-08-03T03:00:00.000Z";

var OWNER_TOKEN = "token-owner";
var STRANGER_TOKEN = "token-stranger";
var TOKEN_SUBS = {};
TOKEN_SUBS[OWNER_TOKEN] = "U-owner-1";
TOKEN_SUBS[STRANGER_TOKEN] = "U-stranger";

var lastSummaryPayload = null;
var lastDraftPayload = null;
var providerShouldFail = false;
var providerOverlong = false;
var providerControlChars = false;
var workersAiRunCalls = 0;

beforeEach(function () {
  resetAiRateLimitStoreForTests();
  lastSummaryPayload = null;
  lastDraftPayload = null;
  providerShouldFail = false;
  providerOverlong = false;
  providerControlChars = false;
  workersAiRunCalls = 0;
});

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

function applyMigrations(db) {
  db.exec("PRAGMA foreign_keys = ON;");
  MIGRATION_FILES.forEach(function (file) {
    db.exec(readFileSync(join(migrationsDir, file), "utf8"));
  });
}

function seedBase(db) {
  db.prepare(
    "INSERT INTO tenants (id, code, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  ).run(TENANT, "tn", "租戶", NOW, NOW);
  db.prepare(
    "INSERT INTO locations (id, tenant_id, code, name, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?, ?)"
  ).run(LOCATION, TENANT, "loc", "店面", NOW, NOW);
  db.prepare(
    "INSERT INTO staff (id, tenant_id, code, display_name, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?, ?)"
  ).run(STAFF, TENANT, "staff", "老師", NOW, NOW);
  db.prepare(
    "INSERT INTO customers (id, tenant_id, display_name, mobile, birthday, notes, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run("cust-a", TENANT, "王小明", "0912345678", "1990-01-01", "敏感備註請勿外洩", NOW, NOW);
  db.prepare(
    "INSERT INTO services (id, tenant_id, code, name, duration_minutes, price_amount, status, " +
    "sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run("svc-a", TENANT, "brow", "霧眉", 60, 3000, "active", 0, NOW, NOW);
}

function insertBooking(db, opts) {
  var o = opts || {};
  db.prepare(
    "INSERT INTO bookings (id, tenant_id, location_id, customer_id, staff_id, booking_no, " +
    "start_at, end_at, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    o.id || "bk-ai-1",
    TENANT,
    LOCATION,
    o.customerId || "cust-a",
    STAFF,
    o.bookingNo || (o.id || "bk-ai-1"),
    o.startAt || START_AT,
    o.endAt || END_AT,
    o.status || S.CONFIRMED,
    NOW,
    NOW
  );
  db.prepare(
    "INSERT INTO booking_items (id, tenant_id, booking_id, service_id, service_name_snapshot, " +
    "duration_minutes, quantity, unit_price_amount, discount_amount, final_amount, " +
    "sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    "item-" + (o.id || "bk-ai-1"),
    TENANT,
    o.id || "bk-ai-1",
    "svc-a",
    o.serviceName || "霧眉",
    60,
    1,
    3000,
    0,
    3000,
    0,
    NOW
  );
}

function makeFakeProvider() {
  return {
    generateDailySummary: async function (payload) {
      lastSummaryPayload = JSON.parse(JSON.stringify(payload));
      if (providerShouldFail) throw new Error("upstream-provider-secret-stacktrace");
      if (providerControlChars) return { text: "草稿\u0000異常" };
      if (providerOverlong) {
        return { text: Array.from({ length: AI_OUTPUT_MAX_CODE_POINTS + 40 }).map(function () { return "摘"; }).join("") };
      }
      assertDailySummaryPayloadSchema(payload);
      return {
        text: "【AI 草稿】" + payload.date + " 共 " + payload.bookings.length + " 筆"
      };
    },
    generateMessageDraft: async function (payload) {
      lastDraftPayload = JSON.parse(JSON.stringify(payload));
      if (providerShouldFail) throw new Error("upstream-provider-secret-stacktrace");
      if (providerControlChars) return { text: "您好\u0007請確認" };
      if (providerOverlong) {
        return { text: Array.from({ length: AI_OUTPUT_MAX_CODE_POINTS + 20 }).map(function () { return "訊"; }).join("") };
      }
      assertMessageDraftPayloadSchema(payload);
      return {
        text: payload.greetingLabel + "，關於「" + payload.serviceName + "」請查收（請業主審核）"
      };
    }
  };
}

function makeEnv(db, overrides) {
  var writeOps = [];
  var selectSql = [];
  return Object.assign({
    DATA_BACKEND: "d1",
    OWNER_AI_ENABLED: true,
    _writeOps: writeOps,
    _selectSql: selectSql,
    AI_PROVIDER: makeFakeProvider(),
    AI_RATE_LIMIT_STORE: Object.create(null),
    DB: {
      prepare: function (sql) {
        return {
          bind: function () {
            var binds = Array.prototype.slice.call(arguments);
            return {
              all: async function () {
                selectSql.push(sql);
                if (/^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql)) writeOps.push(sql);
                var stmt = db.prepare(sql);
                return { results: stmt.all.apply(stmt, binds) };
              },
              first: async function () {
                selectSql.push(sql);
                if (/^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql)) writeOps.push(sql);
                var stmt = db.prepare(sql);
                return stmt.get.apply(stmt, binds) || null;
              },
              run: async function () {
                writeOps.push(sql);
                var stmt = db.prepare(sql);
                var info = stmt.run.apply(stmt, binds);
                return { meta: { changes: info.changes } };
              }
            };
          }
        };
      },
      batch: async function () {
        writeOps.push("BATCH");
        throw new Error("AI 路由不得呼叫 batch");
      }
    },
    TENANT_ID: TENANT,
    LOCATION_ID: LOCATION,
    STAFF_ID: STAFF,
    LIFF_CHANNEL_ID: "liff-channel-test",
    OWNER_LINE_USER_IDS: "U-owner-1"
  }, overrides || {});
}

function makeReadyDb() {
  var db = new DatabaseSync(":memory:");
  applyMigrations(db);
  seedBase(db);
  insertBooking(db, { id: "bk-ai-1" });
  return db;
}

function jsonRequest(method, path, body, token) {
  var headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  return new Request(API + path, {
    method: method,
    headers: headers,
    body: body != null ? JSON.stringify(body) : undefined
  });
}

function assertNoSensitiveLeak(text) {
  var s = String(text || "");
  assert.ok(!/0912345678/.test(s));
  assert.ok(!/1990-01-01/.test(s));
  assert.ok(!/敏感備註/.test(s));
  assert.ok(!/王小明/.test(s));
  assert.ok(!/cust-a/.test(s));
  assert.ok(!/bk-ai-1/.test(s));
  assert.ok(!/U-owner/.test(s));
  assert.ok(!/upstream-provider-secret/.test(s));
}

test("固定問候語與 schema：禁止多餘鍵／錯誤型別", function () {
  assert.equal(FIXED_GREETING, "您好");
  assert.throws(function () {
    assertMessageDraftPayloadSchema({
      arrivalReminderMinutes: 5,
      draftType: "booking_reminder",
      draftTypeLabel: "預約提醒",
      greetingLabel: "王○",
      serviceCategory: "brow",
      serviceName: "霧眉",
      studioName: "測試工作室",
      date: TARGET_DATE,
      time: "10:00"
    });
  });
  assert.throws(function () {
    assertDailySummaryPayloadSchema({
      date: TARGET_DATE,
      bookings: [],
      extra: 1
    });
  });
  assert.throws(function () {
    assertDailySummaryPayloadSchema({
      date: TARGET_DATE,
      bookings: [{
        startTime: "10:00",
        durationMinutes: NaN,
        serviceName: "霧眉",
        status: "已確認"
      }]
    });
  });
});

test("輸出截斷／拒絕控制字元", function () {
  var long = Array.from({ length: AI_OUTPUT_MAX_CODE_POINTS + 10 }).map(function () {
    return "字";
  }).join("");
  var capped = sanitizeAndValidateAiOutput(long);
  assert.equal(Array.from(capped).length, AI_OUTPUT_MAX_CODE_POINTS);
  assert.throws(function () {
    sanitizeAndValidateAiOutput("   ");
  });
  var cleaned = sanitizeAndValidateAiOutput("您好\u0000世界");
  assert.equal(cleaned, "您好世界");
});

test("預設環境關閉；Workers AI adapter 缺 model fail closed 且不呼叫", function () {
  assert.equal(isOwnerAiCapabilityEnabled({}), false);
  assert.equal(getOwnerAiCapability({}).enabled, false);
  assert.equal(resolveAiProvider({}), null);

  var runCalls = 0;
  var adapter = createWorkersAiProvider({
    AI: {
      run: async function () {
        runCalls += 1;
        return { response: "不應被呼叫" };
      }
    }
    // 無 OWNER_AI_MODEL
  });
  assert.equal(adapter, null);
  assert.equal(runCalls, 0);

  var withModel = createWorkersAiProvider({
    OWNER_AI_MODEL: "test-model",
    AI: {
      run: async function () {
        workersAiRunCalls += 1;
        return { response: "摘要草稿內容足夠長嗎？是的。" };
      }
    }
  });
  assert.ok(withModel);
});

test("服務後保養提示嚴禁混入服務前內容，並要求使用業主店名署名", async function () {
  var requestPayload = null;
  var adapter = createWorkersAiProvider({
    OWNER_AI_MODEL: "test-model",
    AI: {
      run: async function (model, input) {
        requestPayload = input;
        return { response: "您好，請依照術後注意事項照護。\n測試工作室" };
      }
    }
  });
  await adapter.generateMessageDraft({
    arrivalReminderMinutes: 5,
    draftType: "post_service_care",
    draftTypeLabel: "服務後保養",
    greetingLabel: "您好",
    serviceCategory: "brow",
    serviceName: "韓系霧眉｜免費補色乙次",
    studioName: "測試工作室",
    date: TARGET_DATE,
    time: "10:00"
  });
  var systemPrompt = requestPayload.messages[0].content;
  assert.match(systemPrompt, /post_service_care 代表服務已完成/);
  assert.match(systemPrompt, /不得出現預約確認、預約前確認、提前抵達/);
  assert.match(systemPrompt, /完整使用 payload\.studioName/);
  assert.match(systemPrompt, /brow 只能寫眉部/);
  assert.match(systemPrompt, /禁止任何簡體中文字形/);
  assert.match(systemPrompt, /禁止輸出 draftType、payload/);
  assert.match(requestPayload.messages[1].content, /"studioName":"測試工作室"/);
});

test("草稿內容安全閘：霧眉禁止唇部技能，所有服務禁止簡體中文", function () {
  assert.equal(inferOwnerAiServiceCategory("韓系霧眉｜免費補色乙次"), "brow");
  assert.equal(inferOwnerAiServiceCategory("霧唇補色"), "lip");
  assert.doesNotThrow(function () {
    assertOwnerAiMessageDraftMatchesService(
      "您好，服務後請保持眉部乾燥並依照業主說明照護。",
      { serviceCategory: "brow" }
    );
  });
  assert.throws(function () {
    assertOwnerAiMessageDraftMatchesService(
      "您好，請定期保養您的唇部。",
      { serviceCategory: "brow" }
    );
  }, /內容與服務項目不符/);
  assert.throws(function () {
    assertOwnerAiMessageDraftMatchesService(
      "请在服务后保持皮肤清洁。",
      { serviceCategory: "brow" }
    );
  }, /簡體中文/);
  assert.throws(function () {
    assertOwnerAiMessageDraftMatchesService(
      '您好，根據系統指示，需要產出草稿類型 "reschedule_coordination" 的訊息。',
      { serviceCategory: "brow" }
    );
  }, /內部系統文字/);
  assert.throws(function () {
    assertOwnerAiMessageDraftMatchesService(
      "以下是草稿：您好，想與您協調改期。",
      { serviceCategory: "brow" }
    );
  }, /格式不符/);
});

test("改期協調使用預約資料產生固定安全草稿，不暴露內部代碼", function () {
  var draft = buildOwnerRescheduleCoordinationDraft({
    date: "2026-08-21",
    time: "13:00",
    serviceName: "韓系霧眉",
    studioName: "霧眉預約工作室"
  });
  assert.equal(
    draft,
    "您好，關於您原訂於 2026/08/21 13:00 的「韓系霧眉」服務，需要與您協調改期。" +
      "請回覆方便的日期與時段，待本工作室確認後再為您安排。\n\n霧眉預約工作室"
  );
  assert.doesNotMatch(draft, /reschedule_coordination|draftType|payload|系統指示/);
  assert.doesNotThrow(function () {
    assertOwnerAiMessageDraftMatchesService(draft, { serviceCategory: "brow" });
  });
});

test("服務後保養依預約服務分類產生固定繁體中文內容", function () {
  var browDraft = buildOwnerPostServiceCareDraft({
    serviceCategory: "brow",
    serviceName: "韓系霧眉｜免費補色乙次",
    studioName: "霧眉預約工作室"
  });
  assert.match(browDraft, /^您好，您的「韓系霧眉｜免費補色乙次」服務已完成/);
  assert.match(browDraft, /眉部清潔與乾燥/);
  assert.doesNotMatch(browDraft, /本次服務包含免費補色乙次/);
  assert.doesNotMatch(browDraft, /續色維持/);
  assert.doesNotMatch(browDraft, /另外計費/);
  assert.doesNotMatch(browDraft, /唇部|嘴唇|美甲|睫毛|post_service_care/);
  assert.match(browDraft, /霧眉預約工作室$/);
  assert.doesNotThrow(function () {
    assertOwnerAiMessageDraftMatchesService(browDraft, {
      serviceCategory: "brow",
      serviceName: "韓系霧眉｜免費補色乙次",
      studioName: "霧眉預約工作室"
    });
  });

  var multiSkillStudioDraft = buildOwnerPostServiceCareDraft({
    serviceCategory: "brow",
    serviceName: "韓系霧眉｜免費補色乙次",
    studioName: "霧眉｜霧唇💋｜預約平台"
  });
  assert.doesNotThrow(function () {
    assertOwnerAiMessageDraftMatchesService(multiSkillStudioDraft, {
      serviceCategory: "brow",
      serviceName: "韓系霧眉｜免費補色乙次",
      studioName: "霧眉｜霧唇💋｜預約平台"
    });
  });

  var lipDraft = buildOwnerPostServiceCareDraft({
    serviceCategory: "lip",
    serviceName: "霧唇補色",
    studioName: "唇部工作室"
  });
  assert.match(lipDraft, /唇部清潔/);
  assert.doesNotMatch(lipDraft, /眉部|霧眉|美甲|睫毛/);
});

test("無 token 401、非 Owner 403", async function () {
  var env = makeEnv(makeReadyDb());
  var noToken = await worker.fetch(
    jsonRequest("POST", "/api/owner/ai/daily-summary", { date: TARGET_DATE }),
    env
  );
  assert.equal(noToken.status, 401);
  var stranger = await worker.fetch(
    jsonRequest("POST", "/api/owner/ai/daily-summary", { date: TARGET_DATE }, STRANGER_TOKEN),
    env
  );
  assert.equal(stranger.status, 403);
});

test("無效 date／draftType 在停用時仍回 400（先於 503）", async function () {
  var env = makeEnv(makeReadyDb(), { OWNER_AI_ENABLED: false, AI_PROVIDER: null });
  var badDate = await worker.fetch(
    jsonRequest("POST", "/api/owner/ai/daily-summary", { date: "bad" }, OWNER_TOKEN),
    env
  );
  assert.equal(badDate.status, 400);

  var badType = await worker.fetch(
    jsonRequest(
      "POST",
      "/api/owner/ai/message-draft",
      { bookingId: "bk-ai-1", draftType: "spam" },
      OWNER_TOKEN
    ),
    env
  );
  assert.equal(badType.status, 400);

  var validButDisabled = await worker.fetch(
    jsonRequest("POST", "/api/owner/ai/daily-summary", { date: TARGET_DATE }, OWNER_TOKEN),
    env
  );
  assert.equal(validButDisabled.status, 503);
});

test("capability 唯讀、需 Owner auth、僅回 enabled", async function () {
  var envOff = makeEnv(makeReadyDb(), { OWNER_AI_ENABLED: false });
  var denied = await worker.fetch(
    jsonRequest("GET", "/api/owner/ai/capability", undefined, STRANGER_TOKEN),
    envOff
  );
  assert.equal(denied.status, 403);

  var off = await worker.fetch(
    jsonRequest("GET", "/api/owner/ai/capability", undefined, OWNER_TOKEN),
    envOff
  );
  assert.equal(off.status, 200);
  var offBody = await off.json();
  assert.deepEqual(Object.keys(offBody).sort(), ["enabled", "ok"]);
  assert.equal(offBody.enabled, false);

  var envOn = makeEnv(makeReadyDb());
  var on = await worker.fetch(
    jsonRequest("GET", "/api/owner/ai/capability", undefined, OWNER_TOKEN),
    envOn
  );
  var onBody = await on.json();
  assert.equal(onBody.enabled, true);
  assert.ok(!/model|provider|U-owner/i.test(JSON.stringify(onBody)));
});

test("Notion 501", async function () {
  var env = makeEnv(makeReadyDb(), {
    DATA_BACKEND: "notion",
    NOTION_TOKEN: "notion-secret",
    NOTION_DATABASE_SERVICES: "db-services",
    NOTION_DATABASE_SLOTS: "db-slots",
    NOTION_DATABASE_BOOKINGS: "db-bookings",
    NOTION_DATABASE_SETTINGS: "db-settings"
  });
  var res = await worker.fetch(
    jsonRequest("POST", "/api/owner/ai/daily-summary", { date: TARGET_DATE }, OWNER_TOKEN),
    env
  );
  assert.equal(res.status, 501);
});

test("當日摘要：嚴格 payload、零寫入、無客戶身分", async function () {
  var env = makeEnv(makeReadyDb());
  var res = await worker.fetch(
    jsonRequest("POST", "/api/owner/ai/daily-summary", { date: TARGET_DATE }, OWNER_TOKEN),
    env
  );
  assert.equal(res.status, 200);
  var body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(env._writeOps.length, 0);
  assert.deepEqual(Object.keys(lastSummaryPayload).sort(), ["bookings", "date"]);
  assert.deepEqual(Object.keys(lastSummaryPayload.bookings[0]).sort(), [
    "durationMinutes",
    "serviceName",
    "startTime",
    "status"
  ]);
  assertNoSensitiveLeak(JSON.stringify(lastSummaryPayload));
  assert.match(body.disclaimer || "", /審核/);
});

test("訊息草稿：固定您好、SQL 不含 display_name、無身分欄位", async function () {
  var env = makeEnv(makeReadyDb());
  var res = await worker.fetch(
    jsonRequest(
      "POST",
      "/api/owner/ai/message-draft",
      { bookingId: "bk-ai-1", draftType: "booking_reminder" },
      OWNER_TOKEN
    ),
    env
  );
  assert.equal(res.status, 200);
  var body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(env._writeOps.length, 0);
  assert.ok(env._selectSql.some(function (sql) {
    return /FROM bookings/.test(sql) && !/display_name/.test(sql) && !/\bcustomers\b/.test(sql);
  }));
  assert.equal(lastDraftPayload.greetingLabel, "您好");
  assert.deepEqual(Object.keys(lastDraftPayload).sort(), [
    "arrivalReminderMinutes",
    "date",
    "draftType",
    "draftTypeLabel",
    "greetingLabel",
    "serviceCategory",
    "serviceName",
    "studioName",
    "time"
  ]);
  assert.equal(lastDraftPayload.studioName, "租戶");
  assert.equal(lastDraftPayload.serviceCategory, "brow");
  assert.equal(lastDraftPayload.arrivalReminderMinutes, 5);
  assertNoSensitiveLeak(JSON.stringify(lastDraftPayload));
  assert.ok(!/王小明|王○/.test(JSON.stringify(lastDraftPayload)));
  assert.ok(body.draft.indexOf("您好") === 0 || body.draft.includes("您好"));
});

test("改期協調 API 回傳固定客戶訊息，不呼叫生成式 provider", async function () {
  var env = makeEnv(makeReadyDb());
  var res = await worker.fetch(
    jsonRequest(
      "POST",
      "/api/owner/ai/message-draft",
      { bookingId: "bk-ai-1", draftType: "reschedule_coordination" },
      OWNER_TOKEN
    ),
    env
  );
  assert.equal(res.status, 200);
  var body = await res.json();
  assert.equal(lastDraftPayload, null, "固定交易訊息不得呼叫生成式 provider");
  assert.match(body.draft, /^您好，關於您原訂於 2099\/08\/03 10:00 的「霧眉」服務/);
  assert.match(body.draft, /租戶$/);
  assert.doesNotMatch(body.draft, /reschedule_coordination|draftType|payload|系統指示/);
});

test("輸出過長截斷；控制字元被清除後仍可用或失敗安全", async function () {
  providerOverlong = true;
  var env = makeEnv(makeReadyDb());
  var res = await worker.fetch(
    jsonRequest("POST", "/api/owner/ai/daily-summary", { date: TARGET_DATE }, OWNER_TOKEN),
    env
  );
  assert.equal(res.status, 200);
  var body = await res.json();
  assert.equal(Array.from(body.draft).length, AI_OUTPUT_MAX_CODE_POINTS);

  providerOverlong = false;
  providerControlChars = true;
  var res2 = await worker.fetch(
    jsonRequest(
      "POST",
      "/api/owner/ai/message-draft",
      { bookingId: "bk-ai-1", draftType: "pre_service_reminder" },
      OWNER_TOKEN
    ),
    env
  );
  assert.equal(res2.status, 200);
  var body2 = await res2.json();
  assert.ok(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(body2.draft));
});

test("provider 失敗 502 不洩漏內部；限流 429 + Retry-After", async function () {
  providerShouldFail = true;
  var env = makeEnv(makeReadyDb());
  var fail = await worker.fetch(
    jsonRequest("POST", "/api/owner/ai/daily-summary", { date: TARGET_DATE }, OWNER_TOKEN),
    env
  );
  assert.equal(fail.status, 502);
  var failBody = await fail.json();
  assertNoSensitiveLeak(failBody.message);
  providerShouldFail = false;

  var rateEnv = makeEnv(makeReadyDb(), {
    AI_RATE_LIMIT_STORE: Object.create(null),
    AI_RATE_LIMIT_NOW_MS: 1_000_000
  });
  for (var i = 0; i < AI_RATE_SUMMARY_LIMIT; i++) {
    var ok = await worker.fetch(
      jsonRequest("POST", "/api/owner/ai/daily-summary", { date: TARGET_DATE }, OWNER_TOKEN),
      rateEnv
    );
    assert.equal(ok.status, 200);
  }
  var limited = await worker.fetch(
    jsonRequest("POST", "/api/owner/ai/daily-summary", { date: TARGET_DATE }, OWNER_TOKEN),
    rateEnv
  );
  assert.equal(limited.status, 429);
  assert.ok(limited.headers.get("Retry-After"));
  var limitedBody = await limited.json();
  assert.match(limitedBody.message || "", /頻繁/);
  assert.ok(!/U-owner/.test(limitedBody.message || ""));
});

test("單元限流可注入且不向外洩漏 ownerId", function () {
  var store = Object.create(null);
  var env = { AI_RATE_LIMIT_STORE: store, AI_RATE_LIMIT_NOW_MS: 50 };
  assertOwnerAiRateLimit(env, "U-owner-1", "draft");
  var keys = Object.keys(store);
  assert.equal(keys.length, 1);
  assert.ok(keys[0].indexOf("U-owner-1") >= 0); // 記憶體鍵可含，但…
  // 對外錯誤不得含 ownerId（由 HTTP 測試覆蓋）；此處確認 throw 訊息乾淨
  env.AI_RATE_LIMIT_NOW_MS = 50;
  for (var i = 0; i < 9; i++) assertOwnerAiRateLimit(env, "U-owner-1", "draft");
  assert.throws(
    function () { assertOwnerAiRateLimit(env, "U-owner-1", "draft"); },
    function (err) {
      assert.equal(err.status, 429);
      assert.ok(!/U-owner/.test(err.message));
      assert.ok(err.headers && err.headers["Retry-After"]);
      return true;
    }
  );
});

test("前端：能力閘道、審核標示、副本一致、草稿不自動傳送", function () {
  var html = readFileSync(join(repoRoot, "owner-admin/index.html"), "utf8");
  var appJs = readFileSync(join(repoRoot, "owner-admin/js/app.js"), "utf8");
  var apiJs = readFileSync(join(repoRoot, "owner-admin/js/api.js"), "utf8");

  assert.ok(html.includes('id="ai-summary-card"') && html.includes("hidden"));
  assert.ok(html.includes("業主須自行審核"));
  assert.ok(html.includes("不會自動傳送"));
  assert.ok(html.includes("v=20260723010"));
  assert.doesNotMatch(html, /標準方案與 AI 秘書方案/);
  assert.doesNotMatch(html, /業主自行處理/);
  assert.doesNotMatch(html, /像多一位店務秘書/);
  assert.match(html, /日常店務/);
  assert.match(html, /AI 店務秘書/);
  assert.match(html, /客戶問題與 AI 內部判讀/);
  assert.match(appJs, /套用 AI 建議回覆/);
  assert.match(appJs, /AI 建議回覆（客人看不到）/);
  assert.match(appJs, /data-ai-inquiry-draft-apply/);
  assert.match(appJs, /input\.value = String\(item\.aiReply/);
  assert.doesNotMatch(html, /AI 幫我挑服務/);
  assert.match(html, /預約、客戶與工作室設定/);
  assert.match(html, /id="owner-ai-plan-block"[^>]*hidden/);
  assert.doesNotMatch(html, /標準版|旗艦版/);
  assert.match(html, /AI 店務秘書/);
  assert.match(html, /data-tab="ai"/);
  assert.match(html, /data-panel="ai"/);
  assert.match(appJs, /els\.aiPlanBlock\.hidden = !aiFeatureEnabled/);
  assert.ok(apiJs.includes("getAiCapability"));
  assert.ok(apiJs.includes("/api/owner/ai/capability"));
  assert.ok(appJs.includes("refreshAiCapability"));
  assert.ok(appJs.includes("aiFeatureEnabled"));
  assert.ok(!html.includes('id="owner-ai-draft-send"'));
  assert.ok(!/pushMessage|儲存草稿/.test(appJs));
  assert.match(appJs, /sendAiInquiryReply/);
  assert.match(appJs, /確認內容後，將直接傳送至客人的 LINE/);
  assert.match(apiJs, /\/replies/);

  ["index.html", "js/api.js", "js/app.js", "css/style.css"].forEach(function (file) {
    assert.equal(
      readFileSync(join(repoRoot, "docs/owner", file), "utf8"),
      readFileSync(join(repoRoot, "owner-admin", file), "utf8")
    );
  });
});

test("客人端與 Owner AI binding 僅存在 v2-test", function () {
  var toml = readFileSync(join(repoRoot, "backend/wrangler.toml"), "utf8");
  var pkg = JSON.parse(readFileSync(join(repoRoot, "backend/package.json"), "utf8"));
  assert.ok(!/OPENAI/i.test(toml));
  var testSection = toml.split("[env.v2-test]")[1].split("[env.v2-production]")[0];
  var productionSection = toml.split("[env.v2-production]")[1];
  assert.match(testSection, /\[env\.v2-test\.ai\][\s\S]*binding\s*=\s*"AI"/);
  assert.match(testSection, /CUSTOMER_AI_ENABLED\s*=\s*"true"/);
  assert.match(testSection, /OWNER_AI_ENABLED\s*=\s*"true"/);
  assert.match(testSection, /OWNER_AI_MODEL\s*=\s*"@cf\/meta\/llama-3\.1-8b-instruct-fast"/);
  assert.ok(
    !/CUSTOMER_AI_ENABLED|CUSTOMER_AI_MODEL|OWNER_AI_ENABLED|OWNER_AI_MODEL|\[env\.v2-production\.ai\]/.test(
      productionSection
    )
  );
  assert.equal(pkg.devDependencies.wrangler, "3.114.17");
  assert.equal(pkg.scripts.deploy, "wrangler deploy --env v2-test");
});
