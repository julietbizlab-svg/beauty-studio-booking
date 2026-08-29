import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  enqueueTomorrowBookingRemindersForAllTenants,
  dispatchQueuedLineNotifications
} from "../src/d1-notifications.js";

function setup() {
  var db = new DatabaseSync(":memory:");
  var root = join(import.meta.dirname, "..");
  [
    "0001_init_core.sql", "0002_bookings.sql", "0003_settings_schedules.sql",
    "0004_ops_tables.sql", "0005_customer_import.sql", "0006_customer_claim_invites.sql",
    "0007_customer_comparison_photos.sql", "0008_booking_notice_policy.sql",
    "0009_booking_status_machine.sql", "0010_cleanup_duplicate_renamed_indexes.sql",
    "0011_ai_customer_inquiries.sql", "0012_booking_review_deposit_deadline.sql"
  ].forEach(function (name) {
    db.exec(readFileSync(join(root, "migrations", name), "utf8"));
  });
  ["default", "standard", "flagship", "unknown"].forEach(function (tenant) {
    db.prepare("INSERT INTO tenants (id,code,name,created_at,updated_at) VALUES (?,?,?,?,?)")
      .run(tenant, tenant, tenant, "2026-08-20T00:00:00.000Z", "2026-08-20T00:00:00.000Z");
    db.prepare("INSERT INTO locations (id,tenant_id,code,name,created_at,updated_at) VALUES (?,?,?,?,?,?)")
      .run("l-" + tenant, tenant, "l", "店", "2026-08-20T00:00:00.000Z", "2026-08-20T00:00:00.000Z");
    db.prepare("INSERT INTO staff (id,tenant_id,code,display_name,created_at,updated_at) VALUES (?,?,?,?,?,?)")
      .run("s-" + tenant, tenant, "s", "老師", "2026-08-20T00:00:00.000Z", "2026-08-20T00:00:00.000Z");
    db.prepare("INSERT INTO customers (id,tenant_id,display_name,created_at,updated_at) VALUES (?,?,?,?,?)")
      .run("c-" + tenant, tenant, "客人", "2026-08-20T00:00:00.000Z", "2026-08-20T00:00:00.000Z");
    db.prepare("INSERT INTO line_accounts (id,tenant_id,customer_id,line_user_id,linked_at) VALUES (?,?,?,?,?)")
      .run("la-" + tenant, tenant, "c-" + tenant, "U-" + tenant, "2026-08-20T00:00:00.000Z");
  });
  function booking(id, tenant, status, startAt, linked) {
    var customerId = linked === false ? "unlinked-" + tenant : "c-" + tenant;
    if (linked === false) {
      db.prepare("INSERT INTO customers (id,tenant_id,display_name,created_at,updated_at) VALUES (?,?,?,?,?)")
        .run(customerId, tenant, "未綁定", "2026-08-20T00:00:00.000Z", "2026-08-20T00:00:00.000Z");
    }
    db.prepare("INSERT INTO bookings (id,tenant_id,location_id,customer_id,staff_id,booking_no,start_at,end_at,status,cancelled_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(id, tenant, "l-" + tenant, customerId, "s-" + tenant, id, startAt,
        new Date(new Date(startAt).getTime() + 3600000).toISOString(), status,
        status === "cancelled_by_customer" ? "2026-08-20T00:00:00.000Z" : null,
        "2026-08-20T00:00:00.000Z", "2026-08-20T00:00:00.000Z");
  }
  booking("b-default", "default", "confirmed", "2026-08-21T02:00:00.000Z");
  booking("b-standard", "standard", "confirmed", "2026-08-21T03:00:00.000Z");
  booking("b-flagship", "flagship", "confirmed", "2026-08-21T04:00:00.000Z");
  booking("b-unknown", "unknown", "confirmed", "2026-08-21T05:00:00.000Z");
  booking("b-pending-review", "default", "pending_review", "2026-08-21T06:00:00.000Z");
  booking("b-pending-deposit", "default", "pending_customer_confirmation", "2026-08-21T07:00:00.000Z");
  booking("b-cancelled", "default", "cancelled_by_customer", "2026-08-21T08:00:00.000Z");
  booking("b-expired", "default", "expired", "2026-08-21T09:00:00.000Z");
  booking("b-unlinked", "default", "confirmed", "2026-08-21T10:00:00.000Z", false);
  booking("b-today", "default", "confirmed", "2026-08-20T02:00:00.000Z");

  return {
    db: db,
    env: {
      TENANT_ID: "default",
      DEFAULT_LINE_TENANT_ID: "default",
      STANDARD_SHOWCASE_TENANT_ID: "standard",
      FLAGSHIP_SHOWCASE_TENANT_ID: "flagship",
      LINE_CHANNEL_ACCESS_TOKEN: "token-default",
      STANDARD_LINE_CHANNEL_ACCESS_TOKEN: "token-standard",
      FLAGSHIP_LINE_CHANNEL_ACCESS_TOKEN: "token-flagship",
      DB: {
        prepare: function (sql) {
          return {
            run: async function () { return { meta: { changes: db.prepare(sql).run().changes } }; },
            bind: function () {
            var binds = Array.from(arguments);
            return {
              all: async function () { return { results: db.prepare(sql).all(...binds) }; },
              run: async function () { return { meta: { changes: db.prepare(sql).run(...binds).changes } }; },
              first: async function () { return db.prepare(sql).get(...binds) || null; }
            };
            }
          };
        }
      }
    }
  };
}

test("今天只建立明日 confirmed 且已綁 LINE 的 tenant-scoped 提醒，重跑不重複", async function () {
  var x = setup();
  var early = await enqueueTomorrowBookingRemindersForAllTenants(
    x.env, Date.parse("2026-08-20T04:15:00.000Z")
  );
  assert.equal(early.skipped, true);
  assert.equal(early.reason, "outside_tenant_reminder_time");
  assert.equal(x.db.prepare("SELECT COUNT(*) AS n FROM notifications").get().n, 0);
  var first = await enqueueTomorrowBookingRemindersForAllTenants(
    x.env, Date.parse("2026-08-20T04:20:00.000Z")
  );
  assert.equal(first.insertedCount, 3);
  assert.deepEqual(
    x.db.prepare("SELECT booking_id FROM notifications ORDER BY booking_id").all().map(function (r) { return r.booking_id; }),
    ["b-default", "b-flagship", "b-standard"]
  );
  var second = await enqueueTomorrowBookingRemindersForAllTenants(
    x.env, Date.parse("2026-08-20T04:20:00.000Z")
  );
  assert.equal(second.insertedCount, 0);
  assert.equal(second.duplicateCount, 3);
  assert.equal(x.db.prepare("SELECT COUNT(*) AS n FROM notifications").get().n, 3);
  var row = x.db.prepare("SELECT * FROM notifications WHERE booking_id='b-standard'").get();
  assert.equal(row.tenant_id, "standard");
  assert.equal(row.customer_id, "c-standard");
  assert.equal(row.recipient, "U-standard");
  assert.equal(row.template_code, "booking_tomorrow_reminder");
  assert.doesNotMatch(row.content_snapshot, /明天有一筆已正式成立的預約/);
  assert.match(row.content_snapshot, /明天見！請在約定時間前 5 分鐘到場/);
  assert.match(row.content_snapshot, /2026\/08\/21/);
});

test("各 tenant 可自訂提醒時間與親切內容，未設定者維持平台 12:20", async function () {
  var x = setup();
  x.db.prepare(
    "INSERT INTO tenant_settings (id,tenant_id,setting_key,setting_value,value_type,created_at,updated_at) VALUES (?,?,?,?,?,?,?)"
  ).run("time-standard", "standard", "tomorrow_booking_reminder_time", "13:05", "string",
    "2026-08-20T00:00:00.000Z", "2026-08-20T00:00:00.000Z");
  x.db.prepare(
    "INSERT INTO tenant_settings (id,tenant_id,setting_key,setting_value,value_type,created_at,updated_at) VALUES (?,?,?,?,?,?,?)"
  ).run("message-standard", "standard", "tomorrow_booking_reminder_message",
    "小提醒：明天記得帶著輕鬆的心情來找我們喔！", "string",
    "2026-08-20T00:00:00.000Z", "2026-08-20T00:00:00.000Z");

  var platformRun = await enqueueTomorrowBookingRemindersForAllTenants(
    x.env, Date.parse("2026-08-20T04:20:00.000Z")
  );
  assert.equal(platformRun.insertedCount, 2);
  assert.equal(x.db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE booking_id='b-standard'").get().n, 0);

  var customRun = await enqueueTomorrowBookingRemindersForAllTenants(
    x.env, Date.parse("2026-08-20T05:05:00.000Z")
  );
  assert.equal(customRun.insertedCount, 1);
  var custom = x.db.prepare("SELECT content_snapshot FROM notifications WHERE booking_id='b-standard'").get();
  assert.match(custom.content_snapshot, /輕鬆的心情/);
});

test("業主將提醒欄位清空後恢復平台預設時間與內容", async function () {
  var x = setup();
  x.db.prepare(
    "INSERT INTO tenant_settings (id,tenant_id,setting_key,setting_value,value_type,created_at,updated_at) VALUES (?,?,?,?,?,?,?)"
  ).run("blank-time", "default", "tomorrow_booking_reminder_time", "", "string",
    "2026-08-20T00:00:00.000Z", "2026-08-20T00:00:00.000Z");
  x.db.prepare(
    "INSERT INTO tenant_settings (id,tenant_id,setting_key,setting_value,value_type,created_at,updated_at) VALUES (?,?,?,?,?,?,?)"
  ).run("blank-message", "default", "tomorrow_booking_reminder_message", "", "string",
    "2026-08-20T00:00:00.000Z", "2026-08-20T00:00:00.000Z");
  var result = await enqueueTomorrowBookingRemindersForAllTenants(
    x.env, Date.parse("2026-08-20T04:20:00.000Z")
  );
  assert.equal(result.insertedCount, 3);
  var row = x.db.prepare("SELECT content_snapshot FROM notifications WHERE booking_id='b-default'").get();
  assert.match(row.content_snapshot, /明天見！請在約定時間前 5 分鐘到場/);
});

test("業主設定頁可編輯提醒時間與內容，並小字標示平台預設", function () {
  var ownerHtml = readFileSync(join(import.meta.dirname, "../../docs/owner/index.html"), "utf8");
  var ownerApp = readFileSync(join(import.meta.dirname, "../../docs/owner/js/app.js"), "utf8");
  assert.match(ownerHtml, /tomorrow-reminder-time/);
  assert.match(ownerHtml, /tomorrow-reminder-message/);
  assert.match(ownerHtml, /沿用平台預設/);
  assert.match(ownerHtml, /留白即沿用平台/);
  assert.match(ownerApp, /tomorrowReminderTimeUsesPlatformDefault/);
  assert.match(ownerApp, /tomorrowReminderMessageUsesPlatformDefault/);
});

test("各 tenant 僅使用自己的 OA；未知 tenant 不回退共用 token，失敗可安全重試", async function () {
  var x = setup();
  await enqueueTomorrowBookingRemindersForAllTenants(x.env, Date.parse("2026-08-20T04:20:00.000Z"));
  var authorizations = [];
  var previousFetch = globalThis.fetch;
  globalThis.fetch = async function (_url, options) {
    authorizations.push(options.headers.Authorization);
    if (options.headers.Authorization === "Bearer token-standard") {
      throw new Error("network");
    }
    return { ok: true, status: 200, headers: { get: function () { return null; } } };
  };
  try {
    var sent = await dispatchQueuedLineNotifications(
      x.env, 20, Date.parse("2026-08-20T04:21:00.000Z")
    );
    assert.equal(sent.sentCount, 2);
    assert.equal(sent.failedCount, 1);
    assert.equal(sent.skippedCount, 0);
    assert.deepEqual(authorizations.sort(), [
      "Bearer token-default", "Bearer token-flagship", "Bearer token-standard"
    ].sort());
    assert.equal(x.db.prepare("SELECT status FROM notifications WHERE booking_id='b-standard'").get().status, "failed");
    assert.equal(x.db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE booking_id='b-unknown'").get().n, 0);

    x.db.prepare("UPDATE notifications SET failed_at='2026-08-20T00:00:00.000Z' WHERE booking_id='b-standard'").run();
    globalThis.fetch = async function (_url, options) {
      authorizations.push(options.headers.Authorization);
      return { ok: true, status: 200, headers: { get: function () { return null; } } };
    };
    var retried = await dispatchQueuedLineNotifications(
      x.env, 20, Date.parse("2026-08-20T04:26:00.000Z")
    );
    assert.equal(retried.sentCount, 1);
    assert.equal(x.db.prepare("SELECT status FROM notifications WHERE booking_id='b-standard'").get().status, "sent");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("request scope 改寫 TENANT_ID 時，一般租戶仍不得取得共用 OA token", async function () {
  var x = setup();
  x.env.TENANT_ID = "unknown";
  x.db.prepare(
    "INSERT INTO notifications " +
    "(id,tenant_id,customer_id,channel,template_code,recipient,content_snapshot,status,scheduled_at,created_at) " +
    "VALUES ('scoped-unknown','unknown','c-unknown','line','assessment_approved','U-unknown','test','queued',?1,?1)"
  ).run("2026-08-20T00:00:00.000Z");
  var calls = 0;
  var previousFetch = globalThis.fetch;
  globalThis.fetch = async function () {
    calls += 1;
    return { ok: true, status: 200, headers: { get: function () { return null; } } };
  };
  try {
    var result = await dispatchQueuedLineNotifications(
      x.env, 20, Date.parse("2026-08-20T04:21:00.000Z")
    );
    assert.equal(result.sentCount, 0);
    assert.equal(result.skippedCount, 1);
    assert.equal(calls, 0);
    assert.equal(
      x.db.prepare("SELECT status FROM notifications WHERE id='scoped-unknown'").get().status,
      "queued"
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("建立後取消或重試跨到非明日區間時，提醒改為 cancelled 且不發送", async function () {
  var x = setup();
  await enqueueTomorrowBookingRemindersForAllTenants(x.env, Date.parse("2026-08-20T04:20:00.000Z"));
  x.db.prepare(
    "UPDATE bookings SET status='cancelled_by_customer',cancelled_at='2026-08-20T01:01:00.000Z' " +
    "WHERE id='b-default'"
  ).run();
  var previousFetch = globalThis.fetch;
  var recipients = [];
  globalThis.fetch = async function (_url, options) {
    recipients.push(JSON.parse(options.body).to);
    return { ok: true, status: 200, headers: { get: function () { return null; } } };
  };
  try {
    await dispatchQueuedLineNotifications(x.env, 20, Date.parse("2026-08-20T04:22:00.000Z"));
    assert.equal(
      x.db.prepare("SELECT status FROM notifications WHERE booking_id='b-default'").get().status,
      "cancelled"
    );
    assert.ok(!recipients.includes("U-default"));

    x.db.prepare(
      "UPDATE notifications SET status='failed',failed_at='2026-08-20T00:00:00.000Z'," +
      "error_code='line_network_error',error_message='LINE API network request failed' " +
      "WHERE booking_id='b-standard'"
    ).run();
    await dispatchQueuedLineNotifications(
      x.env, 20, Date.parse("2026-08-21T16:01:00.000Z")
    );
    assert.equal(
      x.db.prepare("SELECT status FROM notifications WHERE booking_id='b-standard'").get().status,
      "cancelled"
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});
