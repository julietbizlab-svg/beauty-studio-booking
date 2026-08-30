import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  enqueueBookingCreatedNotifications,
  dispatchLineNotificationById
} from "../src/d1-notifications.js";

var migrationsDir = join(import.meta.dirname, "..", "migrations");
var migrationFiles = [
  "0001_init_core.sql", "0002_bookings.sql", "0003_settings_schedules.sql",
  "0004_ops_tables.sql", "0005_customer_import.sql", "0006_customer_claim_invites.sql",
  "0007_customer_comparison_photos.sql", "0008_booking_notice_policy.sql",
  "0009_booking_status_machine.sql", "0010_cleanup_duplicate_renamed_indexes.sql",
  "0011_ai_customer_inquiries.sql", "0012_booking_review_deposit_deadline.sql",
  "0013_booking_review_intake.sql", "0014_deposit_transfer_report.sql",
  "0015_review_question_requests.sql", "0016_ai_inquiry_owner_replies.sql",
  "0017_owner_hub.sql"
];
var NOW = "2026-08-30T14:09:10.258Z";

function setup() {
  var db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  migrationFiles.forEach(function (file) {
    db.exec(readFileSync(join(migrationsDir, file), "utf8"));
  });
  db.prepare("INSERT INTO tenants (id,code,name,created_at,updated_at) VALUES ('t','t','店',?,?)")
    .run(NOW, NOW);
  db.prepare("INSERT INTO locations (id,tenant_id,code,name,created_at,updated_at) " +
    "VALUES ('l','t','l','店',?,?)").run(NOW, NOW);
  db.prepare("INSERT INTO staff (id,tenant_id,code,display_name,role,status,created_at,updated_at) " +
    "VALUES ('s','t','s','老師','owner','active',?,?)").run(NOW, NOW);
  db.prepare("INSERT INTO staff_line_accounts " +
    "(id,tenant_id,staff_id,provider_id,line_user_id,status,linked_at) " +
    "VALUES ('sla','t','s','provider','U-owner','active',?)").run(NOW);
  db.prepare("INSERT INTO customers (id,tenant_id,display_name,created_at,updated_at) " +
    "VALUES ('c','t','客人',?,?)").run(NOW, NOW);
  db.prepare("INSERT INTO line_accounts (id,tenant_id,customer_id,line_user_id,linked_at) " +
    "VALUES ('la','t','c','U-customer',?)").run(NOW);
  db.prepare("INSERT INTO services (id,tenant_id,code,name,duration_minutes,price_amount,status," +
    "created_at,updated_at) VALUES ('svc','t','svc','霧眉',120,6000,'active',?,?)")
    .run(NOW, NOW);
  db.prepare("INSERT INTO bookings (id,tenant_id,location_id,customer_id,staff_id,booking_no," +
    "start_at,end_at,status,created_at,updated_at) VALUES " +
    "('b','t','l','c','s','B','2099-01-01T02:00:00.000Z'," +
    "'2099-01-01T04:00:00.000Z','pending_review',?,?)").run(NOW, NOW);
  db.prepare("INSERT INTO booking_items (id,tenant_id,booking_id,service_id," +
    "service_name_snapshot,duration_minutes,quantity,unit_price_amount,discount_amount," +
    "final_amount,sort_order,created_at) VALUES " +
    "('bi','t','b','svc','霧眉',120,1,6000,0,6000,0,?)").run(NOW);

  function prepared(sql) {
    return { bind: function () {
      var binds = Array.from(arguments);
      return {
        first: async function () { return db.prepare(sql).get.apply(db.prepare(sql), binds) || null; },
        all: async function () { return { results: db.prepare(sql).all.apply(db.prepare(sql), binds) }; },
        run: async function () {
          return { meta: { changes: db.prepare(sql).run.apply(db.prepare(sql), binds).changes } };
        }
      };
    } };
  }
  return {
    db: db,
    env: {
      DB: { prepare: prepared }, TENANT_ID: "t", DEFAULT_LINE_TENANT_ID: "t",
      LINE_CHANNEL_ACCESS_TOKEN: "test-token"
    }
  };
}

test("新預約同時建立客戶收件通知與業主新預約通知，重跑不重複", async function () {
  var x = setup();
  var first = await enqueueBookingCreatedNotifications(x.env, "b");
  var second = await enqueueBookingCreatedNotifications(x.env, "b");
  assert.equal(first.queuedCount, 2);
  assert.equal(second.queuedCount, 0);
  var rows = x.db.prepare(
    "SELECT template_code,recipient,content_snapshot FROM notifications ORDER BY template_code"
  ).all();
  assert.deepEqual(rows.map(function (row) { return row.template_code; }),
    ["booking_request_received", "owner_booking_created"]);
  assert.deepEqual(rows.map(function (row) { return row.recipient; }).sort(),
    ["U-customer", "U-owner"]);
  assert.match(rows[0].content_snapshot, /送出申請不代表預約已正式成立/);
  assert.match(rows[1].content_snapshot, /有新的預約申請/);
});

test("新預約通知會立即分別送給客戶與業主", async function () {
  var x = setup();
  var recipients = [];
  var originalFetch = globalThis.fetch;
  globalThis.fetch = async function (url, options) {
    recipients.push(JSON.parse(options.body).to);
    return { ok: true };
  };
  try {
    var queued = await enqueueBookingCreatedNotifications(x.env, "b");
    for (var i = 0; i < queued.notificationIds.length; i += 1) {
      await dispatchLineNotificationById(x.env, queued.notificationIds[i]);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.deepEqual(recipients.sort(), ["U-customer", "U-owner"]);
  assert.equal(x.db.prepare("SELECT COUNT(*) AS count FROM notifications WHERE status='sent'")
    .get().count, 2);
});

test("預約指派給其他服務人員時仍通知同工作室業主", async function () {
  var x = setup();
  x.db.prepare("INSERT INTO staff (id,tenant_id,code,display_name,role,status,created_at,updated_at) " +
    "VALUES ('worker','t','worker','服務人員','staff','active',?,?)").run(NOW, NOW);
  x.db.prepare("UPDATE bookings SET staff_id='worker' WHERE id='b'").run();
  var queued = await enqueueBookingCreatedNotifications(x.env, "b");
  assert.equal(queued.ownerLineBound, true);
  assert.equal(x.db.prepare("SELECT COUNT(*) AS count FROM notifications " +
    "WHERE template_code='owner_booking_created' AND recipient='U-owner'").get().count, 1);
});

test("API 在預約成功後排程新預約 LINE 通知，通知失敗不回滾預約", function () {
  var source = readFileSync(join(import.meta.dirname, "../src/index.js"), "utf8");
  assert.match(source, /enqueueBookingCreatedNotifications\([\s\S]*bookResult\.booking\.id/);
  assert.match(source, /dispatchLineNotificationById\([\s\S]*createdNotifications\.notificationIds/);
  assert.match(source, /try \{[\s\S]*enqueueBookingCreatedNotifications[\s\S]*catch \(ignore\) \{\}/);
});
