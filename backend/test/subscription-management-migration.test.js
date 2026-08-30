import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

var root = join(import.meta.dirname, "..");

test("0018 建立租期與不可杜撰費用的方案異動紀錄", function () {
  var db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec(readFileSync(join(root, "migrations/0001_init_core.sql"), "utf8"));
  db.exec(readFileSync(join(root, "migrations/0017_owner_hub.sql"), "utf8"));
  db.exec(readFileSync(join(root, "migrations/0018_subscription_management.sql"), "utf8"));
  ["tenant_subscriptions", "tenant_subscription_events"].forEach(function (name) {
    assert.equal(db.prepare(
      "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name=?"
    ).get(name).n, 1);
  });
  var columns = db.prepare("PRAGMA table_info(tenant_subscription_events)").all()
    .map(function (row) { return row.name; });
  assert.equal(columns.some(function (name) { return /price|fee|amount/.test(name); }), false);
  assert.equal(db.prepare(
    "SELECT COUNT(*) AS n FROM schema_versions WHERE version='0018_subscription_management'"
  ).get().n, 1);
});

test("0018 拒絕不完整排程與未確認付款欄位", function () {
  var db = new DatabaseSync(":memory:");
  db.exec(readFileSync(join(root, "migrations/0001_init_core.sql"), "utf8"));
  db.exec(readFileSync(join(root, "migrations/0017_owner_hub.sql"), "utf8"));
  db.exec(readFileSync(join(root, "migrations/0018_subscription_management.sql"), "utf8"));
  db.prepare("INSERT INTO tenants (id,code,name,status,created_at,updated_at) VALUES (?,?,?,?,?,?)")
    .run("t1", "t1", "T1", "active", "2026-08-06", "2026-08-06");
  assert.throws(function () {
    db.prepare("INSERT INTO tenant_subscriptions " +
      "(tenant_id,status,pending_plan_code,updated_at) VALUES (?,?,?,?)")
      .run("t1", "active", "standard", "2026-08-06");
  }, /CHECK/);
  assert.throws(function () {
    db.prepare("INSERT INTO tenant_subscription_events " +
      "(id,tenant_id,actor_staff_id,action,from_plan_code,to_plan_code,effective_on," +
      "payment_confirmed,created_at) VALUES (?,?,?,?,?,?,?,?,?)")
      .run("e1", "t1", "s1", "renewal", "standard", "standard", "2026-08-06", 2,
        "2026-08-06");
  }, /CHECK/);
});

test("0019 建立一次性 14 天旗艦試用與事件紀錄", function () {
  var db = new DatabaseSync(":memory:");
  db.exec(readFileSync(join(root, "migrations/0001_init_core.sql"), "utf8"));
  db.exec(readFileSync(join(root, "migrations/0017_owner_hub.sql"), "utf8"));
  db.exec(readFileSync(join(root, "migrations/0018_subscription_management.sql"), "utf8"));
  db.exec(readFileSync(join(root, "migrations/0019_flagship_trial.sql"), "utf8"));
  assert.equal(db.prepare(
    "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='tenant_trial_events'"
  ).get().n, 1);
  assert.ok(db.prepare("PRAGMA table_info(tenant_subscriptions)").all()
    .some(function (row) { return row.name === "trial_used"; }));
  assert.equal(db.prepare(
    "SELECT COUNT(*) AS n FROM schema_versions WHERE version='0019_flagship_trial'"
  ).get().n, 1);
});
