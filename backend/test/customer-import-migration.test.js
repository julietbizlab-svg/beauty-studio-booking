/**
 * 0005_customer_import migration schema 測試
 *
 * 以 Node 內建 node:sqlite 在本機記憶體 DB 依序套用 migrations
 * 0001～0005（零依賴、不連任何遠端），驗證 customer_import_batches
 * 的 UNIQUE／CHECK／FK／索引與「不存個資」的欄位邊界。
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
  "0005_customer_import.sql"
];

/** 全新記憶體 DB：開 FK 檢查 → 依序套用 0001～0005 → 塞測試 fixture */
function makeMigratedDb() {
  var db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  MIGRATION_FILES.forEach(function (file) {
    db.exec(readFileSync(join(migrationsDir, file), "utf8"));
  });

  var now = "2026-07-19T00:00:00.000Z";
  db.prepare(
    "INSERT INTO tenants (id, code, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  ).run("tenant-a", "ta", "租戶Ａ", now, now);
  db.prepare(
    "INSERT INTO tenants (id, code, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  ).run("tenant-b", "tb", "租戶Ｂ", now, now);
  db.prepare(
    "INSERT INTO staff (id, tenant_id, code, display_name, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?, ?)"
  ).run("staff-1", "tenant-a", "s1", "老師", now, now);

  return db;
}

var BATCH_COLUMNS = [
  "id", "tenant_id", "content_hash", "schema_version", "status",
  "total_rows", "created_count", "skipped_count", "conflict_count",
  "warning_count", "created_by_staff_id", "created_at", "committed_at"
];

function insertBatch(db, overrides) {
  var row = Object.assign({
    id: "batch-" + Math.random().toString(36).slice(2),
    tenant_id: "tenant-a",
    content_hash: "a".repeat(64),
    schema_version: "customer-import-v1",
    status: "processing",
    total_rows: 10,
    created_count: 0,
    skipped_count: 0,
    conflict_count: 0,
    warning_count: 0,
    created_by_staff_id: "staff-1",
    created_at: "2026-07-19T00:00:00.000Z",
    committed_at: null
  }, overrides || {});

  db.prepare(
    "INSERT INTO customer_import_batches (" + BATCH_COLUMNS.join(", ") + ") " +
    "VALUES (" + BATCH_COLUMNS.map(function () { return "?"; }).join(", ") + ")"
  ).run(...BATCH_COLUMNS.map(function (column) { return row[column]; }));

  return row;
}

// ── migration 套用 ───────────────────────────────────────────

test("migrations 0001～0005 可依序套用至全新記憶體 DB", function () {
  var db = makeMigratedDb();
  var versions = db.prepare(
    "SELECT version FROM schema_versions ORDER BY version"
  ).all().map(function (r) { return r.version; });
  assert.deepEqual(versions, [
    "0001_init_core",
    "0002_bookings",
    "0003_settings_schedules",
    "0004_ops_tables",
    "0005_customer_import"
  ]);
});

test("customer_import_batches 表存在", function () {
  var db = makeMigratedDb();
  var table = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'customer_import_batches'"
  ).get();
  assert.ok(table, "表必須存在");
});

// ── UNIQUE 與冪等 ────────────────────────────────────────────

test("同 tenant＋content_hash 不可重複（冪等鍵）", function () {
  var db = makeMigratedDb();
  insertBatch(db, { content_hash: "f".repeat(64) });
  assert.throws(function () {
    insertBatch(db, { content_hash: "f".repeat(64) });
  }, /UNIQUE/i);
});

test("不同 tenant 可使用相同 content_hash", function () {
  var db = makeMigratedDb();
  var now = "2026-07-19T00:00:00.000Z";
  db.prepare(
    "INSERT INTO staff (id, tenant_id, code, display_name, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?, ?)"
  ).run("staff-b", "tenant-b", "sb", "Ｂ店老師", now, now);

  insertBatch(db, { content_hash: "e".repeat(64) });
  insertBatch(db, {
    tenant_id: "tenant-b",
    created_by_staff_id: "staff-b",
    content_hash: "e".repeat(64)
  });

  var count = db.prepare(
    "SELECT COUNT(*) AS n FROM customer_import_batches WHERE content_hash = ?"
  ).get("e".repeat(64)).n;
  assert.equal(count, 2);
});

// ── CHECK 約束 ───────────────────────────────────────────────

test("非法 status 失敗；三種合法 status 通過", function () {
  var db = makeMigratedDb();
  assert.throws(function () {
    insertBatch(db, { status: "hacked" });
  }, /CHECK/i);

  insertBatch(db, { status: "processing", content_hash: "1".repeat(64) });
  insertBatch(db, { status: "failed", content_hash: "2".repeat(64) });
  insertBatch(db, {
    status: "committed",
    content_hash: "3".repeat(64),
    committed_at: "2026-07-19T00:10:00.000Z",
    total_rows: 10,
    created_count: 7,
    skipped_count: 2,
    conflict_count: 1
  });
});

// ── content_hash 格式約束 ────────────────────────────────────

test("content_hash：64 字元小寫 hex 成功", function () {
  var db = makeMigratedDb();
  insertBatch(db, { content_hash: "0123456789abcdef".repeat(4) });
});

test("content_hash：63／65 字元失敗", function () {
  var db = makeMigratedDb();
  assert.throws(function () {
    insertBatch(db, { content_hash: "a".repeat(63) });
  }, /CHECK/i);
  assert.throws(function () {
    insertBatch(db, { content_hash: "a".repeat(65) });
  }, /CHECK/i);
});

test("content_hash：大寫 A-F 失敗", function () {
  var db = makeMigratedDb();
  assert.throws(function () {
    insertBatch(db, { content_hash: "A".repeat(64) });
  }, /CHECK/i);
  assert.throws(function () {
    insertBatch(db, { content_hash: "F" + "a".repeat(63) });
  }, /CHECK/i);
});

test("content_hash：g、空白或符號失敗", function () {
  var db = makeMigratedDb();
  assert.throws(function () {
    insertBatch(db, { content_hash: "g" + "a".repeat(63) });
  }, /CHECK/i);
  assert.throws(function () {
    insertBatch(db, { content_hash: " " + "a".repeat(63) });
  }, /CHECK/i);
  assert.throws(function () {
    insertBatch(db, { content_hash: "-" + "a".repeat(63) });
  }, /CHECK/i);
});

test("count 欄位負數失敗", function () {
  var db = makeMigratedDb();
  ["created_count", "skipped_count", "conflict_count", "warning_count"]
    .forEach(function (column) {
      var overrides = {};
      overrides[column] = -1;
      assert.throws(function () {
        insertBatch(db, overrides);
      }, /CHECK/i, column + " 不可為負");
    });
});

test("total_rows=0 與 >500 失敗；1 與 500 通過", function () {
  var db = makeMigratedDb();
  assert.throws(function () {
    insertBatch(db, { total_rows: 0 });
  }, /CHECK/i);
  assert.throws(function () {
    insertBatch(db, { total_rows: 501 });
  }, /CHECK/i);
  insertBatch(db, { total_rows: 1, content_hash: "4".repeat(64) });
  insertBatch(db, { total_rows: 500, content_hash: "5".repeat(64) });
});

test("status=committed 缺 committed_at 失敗", function () {
  var db = makeMigratedDb();
  assert.throws(function () {
    insertBatch(db, {
      status: "committed",
      committed_at: null,
      total_rows: 10,
      created_count: 10
    });
  }, /CHECK/i);
});

test("processing／failed 可沒有 committed_at", function () {
  var db = makeMigratedDb();
  insertBatch(db, {
    status: "processing",
    committed_at: null,
    content_hash: "6".repeat(64)
  });
  insertBatch(db, {
    status: "failed",
    committed_at: null,
    content_hash: "7".repeat(64)
  });
});

test("processing／failed 帶 committed_at 失敗", function () {
  var db = makeMigratedDb();
  assert.throws(function () {
    insertBatch(db, {
      status: "processing",
      committed_at: "2026-07-19T00:10:00.000Z"
    });
  }, /CHECK/i);
  assert.throws(function () {
    insertBatch(db, {
      status: "failed",
      committed_at: "2026-07-19T00:10:00.000Z"
    });
  }, /CHECK/i);
});

// ── 計數一致性 ───────────────────────────────────────────────

test("計數總和超過 total_rows 失敗", function () {
  var db = makeMigratedDb();
  assert.throws(function () {
    insertBatch(db, {
      total_rows: 10,
      created_count: 6,
      skipped_count: 3,
      conflict_count: 2
    });
  }, /CHECK/i);
});

test("warning_count 超過 total_rows 失敗", function () {
  var db = makeMigratedDb();
  assert.throws(function () {
    insertBatch(db, { total_rows: 10, warning_count: 11 });
  }, /CHECK/i);
});

test("committed 計數總和不足 total_rows 失敗", function () {
  var db = makeMigratedDb();
  assert.throws(function () {
    insertBatch(db, {
      status: "committed",
      committed_at: "2026-07-19T00:10:00.000Z",
      total_rows: 10,
      created_count: 5,
      skipped_count: 2,
      conflict_count: 2
    });
  }, /CHECK/i);
});

test("committed 計數恰等於 total_rows 成功", function () {
  var db = makeMigratedDb();
  insertBatch(db, {
    status: "committed",
    committed_at: "2026-07-19T00:10:00.000Z",
    total_rows: 10,
    created_count: 5,
    skipped_count: 3,
    conflict_count: 2
  });
});

test("processing／failed 計數小於 total_rows 成功", function () {
  var db = makeMigratedDb();
  insertBatch(db, {
    status: "processing",
    total_rows: 10,
    created_count: 3,
    content_hash: "8".repeat(64)
  });
  insertBatch(db, {
    status: "failed",
    total_rows: 10,
    created_count: 2,
    skipped_count: 1,
    content_hash: "9".repeat(64)
  });
});

// ── FK 約束 ──────────────────────────────────────────────────

test("tenant_id FK：不存在的 tenant 失敗", function () {
  var db = makeMigratedDb();
  assert.throws(function () {
    insertBatch(db, { tenant_id: "tenant-nope" });
  }, /FOREIGN KEY/i);
});

test("created_by_staff_id FK：不存在的 staff 失敗", function () {
  var db = makeMigratedDb();
  assert.throws(function () {
    insertBatch(db, { created_by_staff_id: "staff-nope" });
  }, /FOREIGN KEY/i);
});

test("staff FK 必須 tenant scoped：tenant-a 批次不可引用 tenant-b 的 staff", function () {
  var db = makeMigratedDb();
  var now = "2026-07-19T00:00:00.000Z";
  db.prepare(
    "INSERT INTO staff (id, tenant_id, code, display_name, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?, ?)"
  ).run("staff-b", "tenant-b", "sb", "Ｂ店老師", now, now);

  // staff-b 真實存在，但屬於 tenant-b → 複合 FK 必須擋下
  assert.throws(function () {
    insertBatch(db, { tenant_id: "tenant-a", created_by_staff_id: "staff-b" });
  }, /FOREIGN KEY/i);

  // 同 tenant 的 staff 必須成功
  insertBatch(db, {
    tenant_id: "tenant-b",
    created_by_staff_id: "staff-b",
    content_hash: "b".repeat(64)
  });
  insertBatch(db, {
    tenant_id: "tenant-a",
    created_by_staff_id: "staff-1",
    content_hash: "c".repeat(64)
  });
});

// ── 個資邊界與索引 ───────────────────────────────────────────

test("表中不存在 CSV 原文或客戶個資欄位", function () {
  var db = makeMigratedDb();
  var columns = db.prepare(
    "SELECT name FROM pragma_table_info('customer_import_batches') ORDER BY name"
  ).all().map(function (r) { return r.name; });

  assert.deepEqual(columns, BATCH_COLUMNS.slice().sort(), "欄位必須恰為批次 metadata");

  var forbidden = [
    "csv", "csv_text", "canonical_string", "rows_json",
    "name", "display_name", "phone", "mobile", "birthday",
    "note", "notes", "line_user_id", "token", "secret"
  ];
  forbidden.forEach(function (bad) {
    assert.ok(columns.indexOf(bad) === -1, "不得有欄位「" + bad + "」");
  });
});

test("兩個查詢索引與 staff 複合唯一索引存在", function () {
  var db = makeMigratedDb();
  var indexes = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'index' " +
    "AND tbl_name = 'customer_import_batches'"
  ).all().map(function (r) { return r.name; });

  assert.ok(indexes.indexOf("idx_import_batches_tenant_created") !== -1);
  assert.ok(indexes.indexOf("idx_import_batches_tenant_status_created") !== -1);

  var staffIndex = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'index' " +
    "AND tbl_name = 'staff' AND name = 'uq_staff_tenant_id_id'"
  ).get();
  assert.ok(staffIndex, "staff (tenant_id, id) 複合唯一索引必須存在");
});
