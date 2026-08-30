import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

var migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
var files = [
  "0001_init_core.sql",
  "0002_bookings.sql",
  "0003_settings_schedules.sql",
  "0004_ops_tables.sql",
  "0005_customer_import.sql",
  "0006_customer_claim_invites.sql",
  "0007_customer_comparison_photos.sql",
  "0008_booking_notice_policy.sql",
  "0009_booking_status_machine.sql",
  "0010_cleanup_duplicate_renamed_indexes.sql",
  "0011_ai_customer_inquiries.sql",
  "0016_ai_inquiry_owner_replies.sql"
];
var NOW = "2026-07-23T12:00:00.000Z";
var EXPIRES = "2026-10-21T12:00:00.000Z";

function makeDb() {
  var db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  files.forEach(function (file) {
    db.exec(readFileSync(join(migrationsDir, file), "utf8"));
  });
  db.prepare(
    "INSERT INTO tenants (id, code, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  ).run("tenant-a", "ta", "Ａ店", NOW, NOW);
  db.prepare(
    "INSERT INTO tenants (id, code, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  ).run("tenant-b", "tb", "Ｂ店", NOW, NOW);
  return db;
}

function insertInquiry(db, overrides) {
  var row = Object.assign({
    id: "aiq-" + Math.random().toString(36).slice(2),
    tenant_id: "tenant-a",
    line_user_id: "U-a",
    customer_message: "最近可以預約的時間？",
    ai_reply: "請先選擇服務，再查看即時時段。",
    owner_summary: "客人詢問最近可預約時間，需要業主跟進。",
    needs_owner_follow_up: 1,
    status: "new",
    created_at: NOW,
    reviewed_at: null,
    resolved_at: null,
    expires_at: EXPIRES
  }, overrides || {});
  var columns = Object.keys(row);
  db.prepare(
    "INSERT INTO ai_customer_inquiries (" + columns.join(",") + ") VALUES (" +
    columns.map(function () { return "?"; }).join(",") + ")"
  ).run(...columns.map(function (key) { return row[key]; }));
  return row;
}

test("AI 洽詢與業主回覆 migrations 可套用，且 schema_versions 含 0016", function () {
  var db = makeDb();
  var version = db.prepare(
    "SELECT version FROM schema_versions WHERE version = ?"
  ).get("0016_ai_inquiry_owner_replies");
  assert.equal(version.version, "0016_ai_inquiry_owner_replies");
});

test("業主回覆限制 tenant、內容、狀態與防重複識別碼", function () {
  var db = makeDb();
  var inquiry = insertInquiry(db);
  db.prepare(
    "INSERT INTO ai_inquiry_owner_replies " +
    "(id, tenant_id, inquiry_id, owner_id, client_request_id, reply_text, " +
    "status, created_at, sent_at) VALUES (?, ?, ?, ?, ?, ?, 'sent', ?, ?)"
  ).run(
    "air-1", "tenant-a", inquiry.id, "owner-a", "request-1",
    "您好，霧眉可以先安排諮詢。", NOW, NOW
  );
  assert.throws(function () {
    db.prepare(
      "INSERT INTO ai_inquiry_owner_replies " +
      "(id, tenant_id, inquiry_id, owner_id, client_request_id, reply_text, " +
      "status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'sending', ?)"
    ).run(
      "air-2", "tenant-a", inquiry.id, "owner-a", "request-1", "重複", NOW
    );
  }, /UNIQUE/i);
  assert.throws(function () {
    db.prepare(
      "INSERT INTO ai_inquiry_owner_replies " +
      "(id, tenant_id, inquiry_id, owner_id, client_request_id, reply_text, " +
      "status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'sending', ?)"
    ).run(
      "air-3", "tenant-a", inquiry.id, "owner-a", "request-3", "", NOW
    );
  }, /CHECK/i);
});

test("AI 洽詢限制 tenant、長度、狀態與 90 天到期欄位", function () {
  var db = makeDb();
  insertInquiry(db);
  assert.throws(function () {
    insertInquiry(db, { customer_message: "" });
  }, /CHECK/i);
  assert.throws(function () {
    insertInquiry(db, { status: "hacked" });
  }, /CHECK/i);
  assert.throws(function () {
    insertInquiry(db, { tenant_id: "missing" });
  }, /FOREIGN KEY/i);
  assert.throws(function () {
    insertInquiry(db, { expires_at: null });
  }, /NOT NULL/i);
});

test("new／reviewed／resolved 時間欄一致性不可偽造", function () {
  var db = makeDb();
  insertInquiry(db);
  insertInquiry(db, {
    status: "reviewed",
    reviewed_at: NOW
  });
  insertInquiry(db, {
    status: "resolved",
    reviewed_at: NOW,
    resolved_at: NOW
  });
  assert.throws(function () {
    insertInquiry(db, { status: "reviewed", reviewed_at: null });
  }, /CHECK/i);
  assert.throws(function () {
    insertInquiry(db, { status: "resolved", reviewed_at: NOW, resolved_at: null });
  }, /CHECK/i);
});

test("必要查詢索引存在", function () {
  var db = makeDb();
  var indexes = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='ai_customer_inquiries'"
  ).all().map(function (row) { return row.name; });
  assert.ok(indexes.includes("idx_ai_inquiries_tenant_status_created"));
  assert.ok(indexes.includes("idx_ai_inquiries_tenant_expires"));
});
