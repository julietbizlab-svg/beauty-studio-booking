import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

var root = join(dirname(fileURLToPath(import.meta.url)), "..");

function database() {
  var db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(readFileSync(join(root, "migrations/0001_init_core.sql"), "utf8"));
  db.exec(readFileSync(join(root, "migrations/0017_owner_hub.sql"), "utf8"));
  return db;
}

function seed(db) {
  db.prepare(
    "INSERT INTO tenants (id, code, name, status, created_at, updated_at) " +
    "VALUES (?, ?, ?, 'active', ?, ?)"
  ).run("tenant-a", "a", "A 店", "2026-07-27T00:00:00.000Z", "2026-07-27T00:00:00.000Z");
  db.prepare(
    "INSERT INTO staff (id, tenant_id, code, display_name, role, status, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, 'owner', 'active', ?, ?)"
  ).run("staff-a", "tenant-a", "owner", "店主",
    "2026-07-27T00:00:00.000Z", "2026-07-27T00:00:00.000Z");
}

test("0017 建立業主 LINE 身分、方案能力與一次性邀請表", function () {
  var db = database();
  ["staff_line_accounts", "tenant_features", "owner_access_invites"].forEach(function (name) {
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name=?")
        .get(name).n,
      1
    );
  });
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM schema_versions WHERE version='0017_owner_hub'")
      .get().n,
    1
  );
});

test("LINE 身分與 staff 外鍵必須 tenant scoped", function () {
  var db = database();
  seed(db);
  db.prepare(
    "INSERT INTO staff_line_accounts " +
    "(id, tenant_id, staff_id, provider_id, line_user_id, linked_at) " +
    "VALUES (?, ?, ?, ?, ?, ?)"
  ).run("sla-a", "tenant-a", "staff-a", "provider", "U-owner",
    "2026-07-27T00:00:00.000Z");
  assert.throws(function () {
    db.prepare(
      "INSERT INTO staff_line_accounts " +
      "(id, tenant_id, staff_id, provider_id, line_user_id, linked_at) " +
      "VALUES (?, ?, ?, ?, ?, ?)"
    ).run("sla-b", "tenant-a", "missing", "provider", "U-other",
      "2026-07-27T00:00:00.000Z");
  }, /FOREIGN KEY/);
});

test("邀請只存 64 字元小寫 hash，且同 staff 只能有一筆 active", function () {
  var db = database();
  seed(db);
  var insert = db.prepare(
    "INSERT INTO owner_access_invites " +
    "(id, tenant_id, staff_id, token_hash, status, expires_at, created_at) " +
    "VALUES (?, ?, ?, ?, 'active', ?, ?)"
  );
  insert.run("i1", "tenant-a", "staff-a", "a".repeat(64),
    "2026-07-28T00:00:00.000Z", "2026-07-27T00:00:00.000Z");
  assert.throws(function () {
    insert.run("i2", "tenant-a", "staff-a", "b".repeat(64),
      "2026-07-28T00:00:00.000Z", "2026-07-27T00:00:00.000Z");
  }, /UNIQUE/);
  assert.throws(function () {
    insert.run("i3", "tenant-a", "staff-a", "RAW-TOKEN",
      "2026-07-28T00:00:00.000Z", "2026-07-27T00:00:00.000Z");
  }, /CHECK/);
});

test("標準版能力預設關閉，可升級旗艦且不搬移 tenant", function () {
  var db = database();
  seed(db);
  db.exec(readFileSync(join(root, "migrations/0017_owner_hub.sql"), "utf8"));
  var initial = db.prepare(
    "SELECT * FROM tenant_features WHERE tenant_id='tenant-a'"
  ).get();
  assert.equal(initial.plan_code, "standard");
  assert.equal(initial.customer_import_enabled, 0);
  db.prepare(
    "UPDATE tenant_features SET plan_code='flagship', customer_import_enabled=1, " +
    "customer_ai_enabled=1, owner_ai_enabled=1 WHERE tenant_id=?"
  ).run("tenant-a");
  var upgraded = db.prepare(
    "SELECT plan_code, customer_import_enabled FROM tenant_features WHERE tenant_id=?"
  ).get("tenant-a");
  assert.equal(upgraded.plan_code, "flagship");
  assert.equal(upgraded.customer_import_enabled, 1);
});
