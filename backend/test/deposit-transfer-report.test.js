import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { reportCustomerDepositTransfer } from "../src/d1-deposit-report.js";
import { notifyOwnerDepositTransferReported } from "../src/d1-notifications.js";

var migrations = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

function setup() {
  var db = new DatabaseSync(":memory:");
  for (var i = 1; i <= 14; i++) {
    var prefix = String(i).padStart(4, "0") + "_";
    var file = [
      "0001_init_core.sql", "0002_bookings.sql", "0003_settings_schedules.sql",
      "0004_ops_tables.sql", "0005_customer_import.sql", "0006_customer_claim_invites.sql",
      "0007_customer_comparison_photos.sql", "0008_booking_notice_policy.sql",
      "0009_booking_status_machine.sql", "0010_cleanup_duplicate_renamed_indexes.sql",
      "0011_ai_customer_inquiries.sql", "0012_booking_review_deposit_deadline.sql",
      "0013_booking_review_intake.sql", "0014_deposit_transfer_report.sql"
    ].find(function (name) { return name.indexOf(prefix) === 0; });
    db.exec(readFileSync(join(migrations, file), "utf8"));
  }
  db.exec(readFileSync(join(migrations, "0017_owner_hub.sql"), "utf8"));
  var now = "2026-07-24T00:00:00.000Z";
  db.prepare("INSERT INTO tenants(id,code,name,created_at,updated_at) VALUES('t','t','店',?,?)").run(now, now);
  db.prepare("INSERT INTO locations(id,tenant_id,code,name,created_at,updated_at) VALUES('l','t','l','店',?,?)").run(now, now);
  db.prepare("INSERT INTO staff(id,tenant_id,code,display_name,role,created_at,updated_at) VALUES('s','t','s','師','owner',?,?)").run(now, now);
  db.prepare("INSERT INTO staff_line_accounts(id,tenant_id,staff_id,provider_id,line_user_id,linked_at) VALUES('sla','t','s','p','U-owner',?)").run(now);
  db.prepare("INSERT INTO customers(id,tenant_id,display_name,created_at,updated_at) VALUES('c','t','客',?,?)").run(now, now);
  db.prepare("INSERT INTO line_accounts(id,tenant_id,customer_id,line_user_id,linked_at) VALUES('la','t','c','U1',?)").run(now);
  db.prepare(
    "INSERT INTO bookings(id,tenant_id,location_id,customer_id,staff_id,booking_no,start_at,end_at,status,deposit_due_at,created_at,updated_at) " +
    "VALUES('b','t','l','c','s','B001','2099-01-02T00:00:00Z','2099-01-02T01:00:00Z','pending_customer_confirmation','2099-01-01T00:00:00Z',?,?)"
  ).run(now, now);
  return db;
}

function env(db) {
  return { TENANT_ID: "t", DB: { prepare: function (sql) {
    return { bind: function () {
      var binds = Array.from(arguments);
      return {
        run: async function () {
          var info = db.prepare(sql).run.apply(db.prepare(sql), binds);
          return { meta: { changes: info.changes } };
        },
        first: async function () {
          return db.prepare(sql).get.apply(db.prepare(sql), binds) || null;
        },
        all: async function () {
          return { results: db.prepare(sql).all.apply(db.prepare(sql), binds) };
        }
      };
    } };
  } }, LINE_TENANT_CHANNELS_JSON: JSON.stringify({
    t: { messagingAccessToken: "test-token" }
  }) };
}

test("0014 與客戶末五碼回報：限本人、待訂金、期限內", async function () {
  var db = setup();
  await reportCustomerDepositTransfer(env(db), "b", "U1", { last5: "12345" });
  var row = db.prepare("SELECT deposit_transfer_last5, deposit_reported_at FROM bookings WHERE id='b'").get();
  assert.equal(row.deposit_transfer_last5, "12345");
  assert.ok(row.deposit_reported_at);
  await assert.rejects(reportCustomerDepositTransfer(env(db), "b", "U2", { last5: "54321" }), /無法回報/);
  await assert.rejects(reportCustomerDepositTransfer(env(db), "b", "U1", { last5: "12A45" }), /5碼|五碼/);
});

test("客戶回報末五碼後通知業主，同一預約不重複通知", async function () {
  var db = setup();
  var testEnv = env(db);
  var originalFetch = globalThis.fetch;
  var pushes = [];
  globalThis.fetch = async function (url, options) {
    pushes.push({ url: String(url), body: JSON.parse(options.body) });
    return new Response("{}", { status: 200 });
  };
  try {
    await reportCustomerDepositTransfer(testEnv, "b", "U1", { last5: "12345" });
    var first = await notifyOwnerDepositTransferReported(testEnv, "b");
    var second = await notifyOwnerDepositTransferReported(testEnv, "b");
    assert.equal(first.sentCount, 1);
    assert.equal(second.deduplicated, true);
    assert.equal(pushes.length, 1);
    assert.equal(pushes[0].body.to, "U-owner");
    assert.match(pushes[0].body.messages[0].text, /末五碼：12345/);
    var notice = db.prepare(
      "SELECT status FROM notifications WHERE template_code='deposit_transfer_reported_owner'"
    ).get();
    assert.equal(notice.status, "sent");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
