/**
 * 0008_booking_notice_policy migration schema 測試
 *
 * 以 Node 內建 node:sqlite 在本機記憶體 DB 依序套用 migrations
 * 0001～0008（零依賴、不連任何遠端）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

var migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

var MIGRATION_FILES = [
  "0001_init_core.sql",
  "0002_bookings.sql",
  "0003_settings_schedules.sql",
  "0004_ops_tables.sql",
  "0005_customer_import.sql",
  "0006_customer_claim_invites.sql",
  "0007_customer_comparison_photos.sql",
  "0008_booking_notice_policy.sql"
];

var NOW = "2026-07-20T00:00:00.000Z";

function makeMigratedDb() {
  var db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  MIGRATION_FILES.forEach(function (file) {
    db.exec(readFileSync(join(migrationsDir, file), "utf8"));
  });

  db.prepare(
    "INSERT INTO tenants (id, code, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  ).run("tenant-a", "ta", "租戶Ａ", NOW, NOW);

  return db;
}

test("migrations 0001～0008 可依序套用至全新記憶體 DB", function () {
  var db = makeMigratedDb();
  var versions = db.prepare(
    "SELECT version FROM schema_versions ORDER BY version"
  ).all().map(function (r) { return r.version; });
  assert.deepEqual(versions, [
    "0001_init_core",
    "0002_bookings",
    "0003_settings_schedules",
    "0004_ops_tables",
    "0005_customer_import",
    "0006_customer_claim_invites",
    "0007_customer_comparison_photos",
    "0008_booking_notice_policy"
  ]);
});

test("bookings 新增取消政策快照欄位", function () {
  var db = makeMigratedDb();
  var columns = db.prepare(
    "SELECT name FROM pragma_table_info('bookings') ORDER BY name"
  ).all().map(function (r) { return r.name; });
  assert.ok(columns.indexOf("cancellation_notice_days_snapshot") !== -1);
  assert.ok(columns.indexOf("cancellation_deadline_at") !== -1);
});

test("cancellation_notice_days_snapshot CHECK 限制 0～30", function () {
  var db = makeMigratedDb();
  db.prepare(
    "INSERT INTO locations (id, tenant_id, code, name, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?, ?)"
  ).run("loc-a", "tenant-a", "loc", "店面", NOW, NOW);
  db.prepare(
    "INSERT INTO customers (id, tenant_id, display_name, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?)"
  ).run("cust-a", "tenant-a", "客戶", NOW, NOW);

  db.prepare(
    "INSERT INTO bookings (id, tenant_id, location_id, customer_id, booking_no, " +
    "start_at, end_at, status, cancellation_notice_days_snapshot, " +
    "cancellation_deadline_at, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?, ?)"
  ).run(
    "bk-ok", "tenant-a", "loc-a", "cust-a", "BK-1",
    NOW, "2026-07-20T01:00:00.000Z", 0, NOW, NOW, NOW
  );
  db.prepare(
    "INSERT INTO bookings (id, tenant_id, location_id, customer_id, booking_no, " +
    "start_at, end_at, status, cancellation_notice_days_snapshot, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?)"
  ).run(
    "bk-30", "tenant-a", "loc-a", "cust-a", "BK-2",
    NOW, "2026-07-20T02:00:00.000Z", 30, NOW, NOW
  );

  assert.throws(function () {
    db.prepare(
      "INSERT INTO bookings (id, tenant_id, location_id, customer_id, booking_no, " +
      "start_at, end_at, status, cancellation_notice_days_snapshot, created_at, updated_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?)"
    ).run(
      "bk-bad", "tenant-a", "loc-a", "cust-a", "BK-3",
      NOW, "2026-07-20T03:00:00.000Z", 31, NOW, NOW
    );
  }, /CHECK/i);
});

test("tenant_settings notice keys：migration 種子對既有 tenant 寫入預設 1", function () {
  var db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  MIGRATION_FILES.slice(0, -1).forEach(function (file) {
    db.exec(readFileSync(join(migrationsDir, file), "utf8"));
  });
  db.prepare(
    "INSERT INTO tenants (id, code, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  ).run("tenant-seed", "ts", "種子租戶", NOW, NOW);
  db.exec(readFileSync(join(migrationsDir, "0008_booking_notice_policy.sql"), "utf8"));
  var rows = db.prepare(
    "SELECT setting_key, setting_value FROM tenant_settings " +
    "WHERE tenant_id = ? ORDER BY setting_key"
  ).all("tenant-seed");
  var map = {};
  rows.forEach(function (r) { map[r.setting_key] = r.setting_value; });
  assert.equal(map.booking_min_notice_days, "1");
  assert.equal(map.cancellation_min_notice_days, "1");
});
