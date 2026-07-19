/**
 * 0006_customer_claim_invites migration schema 測試
 *
 * 以 Node 內建 node:sqlite 在本機記憶體 DB 依序套用 migrations
 * 0001～0006（零依賴、不連任何遠端），驗證 customer_claim_invites
 * 的 UNIQUE／CHECK／FK／partial unique index 與「不存原始 token、
 * 不存 LINE userId」的欄位邊界。
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
  "0006_customer_claim_invites.sql"
];

var NOW = "2026-07-19T00:00:00.000Z";
var FUTURE = "2026-07-20T00:00:00.000Z";

/** 全新記憶體 DB：開 FK → 依序套用 0001～0006 → 塞測試 fixture */
function makeMigratedDb() {
  var db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  MIGRATION_FILES.forEach(function (file) {
    db.exec(readFileSync(join(migrationsDir, file), "utf8"));
  });

  db.prepare(
    "INSERT INTO tenants (id, code, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  ).run("tenant-a", "ta", "租戶Ａ", NOW, NOW);
  db.prepare(
    "INSERT INTO tenants (id, code, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  ).run("tenant-b", "tb", "租戶Ｂ", NOW, NOW);
  db.prepare(
    "INSERT INTO staff (id, tenant_id, code, display_name, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?, ?)"
  ).run("staff-a", "tenant-a", "sa", "Ａ店老師", NOW, NOW);
  db.prepare(
    "INSERT INTO staff (id, tenant_id, code, display_name, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?, ?)"
  ).run("staff-b", "tenant-b", "sb", "Ｂ店老師", NOW, NOW);
  db.prepare(
    "INSERT INTO customers (id, tenant_id, display_name, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?)"
  ).run("cust-a1", "tenant-a", "客戶Ａ1", NOW, NOW);
  db.prepare(
    "INSERT INTO customers (id, tenant_id, display_name, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?)"
  ).run("cust-a2", "tenant-a", "客戶Ａ2", NOW, NOW);
  db.prepare(
    "INSERT INTO customers (id, tenant_id, display_name, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?)"
  ).run("cust-b1", "tenant-b", "客戶Ｂ1", NOW, NOW);

  return db;
}

var INVITE_COLUMNS = [
  "id", "tenant_id", "customer_id", "token_hash", "status",
  "expires_at", "created_by_staff_id", "created_at",
  "claimed_at", "claimed_line_account_id", "revoked_at"
];

var hashSeq = 0;
function uniqueHash() {
  hashSeq += 1;
  return String(hashSeq).padStart(4, "0").repeat(16);
}

function insertInvite(db, overrides) {
  var row = Object.assign({
    id: "invite-" + Math.random().toString(36).slice(2),
    tenant_id: "tenant-a",
    customer_id: "cust-a1",
    token_hash: uniqueHash(),
    status: "active",
    expires_at: FUTURE,
    created_by_staff_id: "staff-a",
    created_at: NOW,
    claimed_at: null,
    claimed_line_account_id: null,
    revoked_at: null
  }, overrides || {});

  db.prepare(
    "INSERT INTO customer_claim_invites (" + INVITE_COLUMNS.join(", ") + ") " +
    "VALUES (" + INVITE_COLUMNS.map(function () { return "?"; }).join(", ") + ")"
  ).run(...INVITE_COLUMNS.map(function (column) { return row[column]; }));

  return row;
}

function insertLineAccount(db, id, tenantId, customerId) {
  db.prepare(
    "INSERT INTO line_accounts (id, tenant_id, customer_id, line_user_id, linked_at) " +
    "VALUES (?, ?, ?, ?, ?)"
  ).run(id, tenantId, customerId, "U-" + id, NOW);
}

// ── migration 套用 ───────────────────────────────────────────

test("migrations 0001～0006 可依序套用至全新記憶體 DB", function () {
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
    "0006_customer_claim_invites"
  ]);
});

// ── token_hash 約束 ──────────────────────────────────────────

test("同 tenant＋token_hash 不可重複", function () {
  var db = makeMigratedDb();
  var hash = "a".repeat(64);
  insertInvite(db, { token_hash: hash, status: "revoked", revoked_at: NOW });
  assert.throws(function () {
    insertInvite(db, { customer_id: "cust-a2", token_hash: hash });
  }, /UNIQUE/i);
});

test("不同 tenant 可有相同 token_hash", function () {
  var db = makeMigratedDb();
  var hash = "b".repeat(64);
  insertInvite(db, { token_hash: hash });
  insertInvite(db, {
    tenant_id: "tenant-b",
    customer_id: "cust-b1",
    created_by_staff_id: "staff-b",
    token_hash: hash
  });
});

test("token_hash 必須是 64 字元小寫 hex（拒絕 63／65／大寫／符號）", function () {
  var db = makeMigratedDb();
  assert.throws(function () {
    insertInvite(db, { token_hash: "a".repeat(63) });
  }, /CHECK/i);
  assert.throws(function () {
    insertInvite(db, { token_hash: "a".repeat(65) });
  }, /CHECK/i);
  assert.throws(function () {
    insertInvite(db, { token_hash: "A".repeat(64) });
  }, /CHECK/i);
  assert.throws(function () {
    insertInvite(db, { token_hash: "-" + "a".repeat(63) });
  }, /CHECK/i);
});

// ── status 與一致性 CHECK ────────────────────────────────────

test("非法 status 失敗；四種合法 status 通過", function () {
  var db = makeMigratedDb();
  assert.throws(function () {
    insertInvite(db, { status: "hacked" });
  }, /CHECK/i);

  insertLineAccount(db, "la-1", "tenant-a", "cust-a2");
  insertInvite(db, { status: "active" });
  insertInvite(db, {
    customer_id: "cust-a2",
    status: "claimed",
    claimed_at: NOW,
    claimed_line_account_id: "la-1"
  });
  insertInvite(db, { status: "revoked", revoked_at: NOW });
  insertInvite(db, { status: "expired" });
});

test("claimed 必須帶 claimed_at 與 claimed_line_account_id；其他狀態不得帶", function () {
  var db = makeMigratedDb();
  insertLineAccount(db, "la-2", "tenant-a", "cust-a2");

  assert.throws(function () {
    insertInvite(db, { status: "claimed", claimed_at: null, claimed_line_account_id: "la-2" });
  }, /CHECK/i);
  assert.throws(function () {
    insertInvite(db, { status: "claimed", claimed_at: NOW, claimed_line_account_id: null });
  }, /CHECK/i);
  assert.throws(function () {
    insertInvite(db, { status: "active", claimed_at: NOW });
  }, /CHECK/i);
  assert.throws(function () {
    insertInvite(db, { status: "active", claimed_line_account_id: "la-2" });
  }, /CHECK/i);
});

test("revoked 必須帶 revoked_at；active 不得帶 revoked_at", function () {
  var db = makeMigratedDb();
  assert.throws(function () {
    insertInvite(db, { status: "revoked", revoked_at: null });
  }, /CHECK/i);
  assert.throws(function () {
    insertInvite(db, { status: "active", revoked_at: NOW });
  }, /CHECK/i);
});

test("expires_at 為 NOT NULL", function () {
  var db = makeMigratedDb();
  assert.throws(function () {
    insertInvite(db, { expires_at: null });
  }, /NOT NULL/i);
});

// ── 單一 active 邀請（partial unique index） ─────────────────

test("同一 customer 同時只能有一個 active 邀請", function () {
  var db = makeMigratedDb();
  insertInvite(db, { status: "active" });
  assert.throws(function () {
    insertInvite(db, { status: "active" });
  }, /UNIQUE/i);
});

test("同一 customer 可保留多筆非 active 邀請＋一筆 active", function () {
  var db = makeMigratedDb();
  insertInvite(db, { status: "revoked", revoked_at: NOW });
  insertInvite(db, { status: "expired" });
  insertInvite(db, { status: "active" });
});

test("不同 customer 可各自有 active 邀請", function () {
  var db = makeMigratedDb();
  insertInvite(db, { customer_id: "cust-a1" });
  insertInvite(db, { customer_id: "cust-a2" });
});

// ── FK 約束 ──────────────────────────────────────────────────

test("customer FK tenant scoped：tenant-a 邀請不可引用 tenant-b 客戶", function () {
  var db = makeMigratedDb();
  assert.throws(function () {
    insertInvite(db, { tenant_id: "tenant-a", customer_id: "cust-b1" });
  }, /FOREIGN KEY/i);
});

test("staff FK tenant scoped：tenant-a 邀請不可引用 tenant-b staff", function () {
  var db = makeMigratedDb();
  assert.throws(function () {
    insertInvite(db, { created_by_staff_id: "staff-b" });
  }, /FOREIGN KEY/i);
});

test("不存在的 tenant／customer／staff 一律失敗", function () {
  var db = makeMigratedDb();
  assert.throws(function () {
    insertInvite(db, { tenant_id: "tenant-nope", customer_id: "cust-a1" });
  }, /FOREIGN KEY/i);
  assert.throws(function () {
    insertInvite(db, { customer_id: "cust-nope" });
  }, /FOREIGN KEY/i);
  assert.throws(function () {
    insertInvite(db, { created_by_staff_id: "staff-nope" });
  }, /FOREIGN KEY/i);
});

test("claimed_line_account_id FK：不存在的 line_accounts 失敗", function () {
  var db = makeMigratedDb();
  assert.throws(function () {
    insertInvite(db, {
      status: "claimed",
      claimed_at: NOW,
      claimed_line_account_id: "la-nope"
    });
  }, /FOREIGN KEY/i);
});

// ── 欄位邊界 ─────────────────────────────────────────────────

test("schema 不保存原始 token、LINE userId 或客戶個資欄位", function () {
  var db = makeMigratedDb();
  var columns = db.prepare(
    "SELECT name FROM pragma_table_info('customer_claim_invites') ORDER BY name"
  ).all().map(function (r) { return r.name; });

  assert.deepEqual(columns, INVITE_COLUMNS.slice().sort(), "欄位必須恰為邀請 metadata");

  var forbidden = [
    "token", "raw_token", "claim_token", "secret",
    "line_user_id", "claimed_line_user_id",
    "name", "display_name", "phone", "mobile", "birthday", "note", "notes"
  ];
  forbidden.forEach(function (bad) {
    assert.ok(columns.indexOf(bad) === -1, "不得有欄位「" + bad + "」");
  });
});

test("查詢索引與 customers 複合唯一索引存在", function () {
  var db = makeMigratedDb();
  var indexes = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'index' " +
    "AND tbl_name = 'customer_claim_invites'"
  ).all().map(function (r) { return r.name; });

  assert.ok(indexes.indexOf("uq_claim_invites_one_active") !== -1);
  assert.ok(indexes.indexOf("idx_claim_invites_tenant_customer_created") !== -1);

  var customersIndex = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'index' " +
    "AND tbl_name = 'customers' AND name = 'uq_customers_tenant_id_id'"
  ).get();
  assert.ok(customersIndex, "customers (tenant_id, id) 複合唯一索引必須存在");
});
