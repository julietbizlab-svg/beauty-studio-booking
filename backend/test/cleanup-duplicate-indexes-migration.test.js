/**
 * 0010_cleanup_duplicate_renamed_indexes migration 測試
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

var migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

var BASE_MIGRATIONS = [
  "0001_init_core.sql",
  "0002_bookings.sql",
  "0003_settings_schedules.sql",
  "0004_ops_tables.sql",
  "0005_customer_import.sql",
  "0006_customer_claim_invites.sql",
  "0007_customer_comparison_photos.sql",
  "0008_booking_notice_policy.sql"
];

var MIGRATION_0009 = "0009_booking_status_machine.sql";
var MIGRATION_0010 = "0010_cleanup_duplicate_renamed_indexes.sql";

var DUPLICATE_INDEXES = [
  "uq_bookings_new_tenant_id_id",
  "uq_photo_sets_new_tenant_id_id"
];

var FORMAL_UNIQUE_INDEXES = [
  { table: "bookings", name: "uq_bookings_tenant_id_id" },
  { table: "customer_photo_sets", name: "uq_photo_sets_tenant_id_id" }
];

var SIX_TABLES = [
  "bookings",
  "booking_items",
  "booking_status_logs",
  "customer_photo_sets",
  "customer_photos",
  "notifications"
];

var NOW = "2026-07-20T00:00:00.000Z";

function readSql(file) {
  return readFileSync(join(migrationsDir, file), "utf8");
}

function applyFiles(db, files) {
  files.forEach(function (file) {
    db.exec(readSql(file));
  });
}

function applyMigration0009LikeD1(db) {
  db.exec("BEGIN");
  try {
    db.exec(readSql(MIGRATION_0009));
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

function applyMigration0010(db) {
  db.exec(readSql(MIGRATION_0010));
}

function indexNames(db, table) {
  return db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND name NOT LIKE 'sqlite_%'"
  ).all(table).map(function (r) { return r.name; });
}

function indexExists(db, name) {
  return !!db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = ?"
  ).get(name);
}

function indexColumns(db, indexName) {
  return db.prepare("PRAGMA index_info(" + indexName + ")")
    .all()
    .sort(function (a, b) { return a.seqno - b.seqno; })
    .map(function (r) { return r.name; });
}

function isUniqueIndex(db, table, indexName) {
  var rows = db.prepare("PRAGMA index_list(" + table + ")").all();
  var match = rows.find(function (r) { return r.name === indexName; });
  return match && match.unique === 1;
}

function tableCount(db, table) {
  return db.prepare("SELECT COUNT(*) AS c FROM " + table).get().c;
}

function snapshotCounts(db) {
  var out = {};
  SIX_TABLES.forEach(function (table) {
    out[table] = tableCount(db, table);
  });
  return out;
}

function seedSixTableData(db) {
  db.prepare(
    "INSERT INTO tenants (id, code, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  ).run("tenant-a", "ta", "租戶Ａ", NOW, NOW);
  db.prepare(
    "INSERT INTO locations (id, tenant_id, code, name, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?, ?)"
  ).run("loc-a", "tenant-a", "loc", "店面", NOW, NOW);
  db.prepare(
    "INSERT INTO staff (id, tenant_id, code, display_name, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?, ?)"
  ).run("staff-a", "tenant-a", "staff-a", "老師", NOW, NOW);
  db.prepare(
    "INSERT INTO customers (id, tenant_id, display_name, mobile, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?, ?)"
  ).run("cust-a", "tenant-a", "客戶甲", "0912345678", NOW, NOW);
  db.prepare(
    "INSERT INTO services (id, tenant_id, code, name, duration_minutes, price_amount, " +
    "status, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run("svc-a", "tenant-a", "brow", "霧眉", 60, 3000, "active", 0, NOW, NOW);

  db.prepare(
    "INSERT INTO bookings (id, tenant_id, location_id, customer_id, staff_id, booking_no, " +
    "start_at, end_at, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?)"
  ).run(
    "bk-1", "tenant-a", "loc-a", "cust-a", "staff-a", "BK-001",
    "2026-08-01T02:00:00.000Z", "2026-08-01T03:00:00.000Z", NOW, NOW
  );
  db.prepare(
    "INSERT INTO booking_items (id, tenant_id, booking_id, service_id, service_name_snapshot, " +
    "duration_minutes, quantity, unit_price_amount, discount_amount, final_amount, sort_order, created_at) " +
    "VALUES (?, ?, ?, ?, ?, ?, 1, ?, 0, ?, 0, ?)"
  ).run("item-1", "tenant-a", "bk-1", "svc-a", "霧眉", 60, 3000, 3000, NOW);
  db.prepare(
    "INSERT INTO booking_status_logs (id, tenant_id, booking_id, from_status, to_status, " +
    "changed_by_type, created_at) VALUES (?, ?, ?, NULL, 'confirmed', 'customer', ?)"
  ).run("log-1", "tenant-a", "bk-1", NOW);
  db.prepare(
    "INSERT INTO customer_photo_sets (id, tenant_id, customer_id, booking_id, title, " +
    "created_by_staff_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run("ps-1", "tenant-a", "cust-a", "bk-1", "對比照", "staff-a", NOW, NOW);
  db.prepare(
    "INSERT INTO customer_photos (id, tenant_id, photo_set_id, customer_id, kind, object_key, " +
    "mime_type, byte_size, created_by_staff_id, created_at) " +
    "VALUES (?, ?, ?, ?, 'before', ?, 'image/jpeg', 1024, ?, ?)"
  ).run("photo-1", "tenant-a", "ps-1", "cust-a", "customer-photos/tenant-a/x", "staff-a", NOW);
  db.prepare(
    "INSERT INTO notifications (id, tenant_id, customer_id, booking_id, channel, template_code, " +
    "content_snapshot, status, sent_at, created_at) " +
    "VALUES (?, ?, ?, ?, 'line', ?, ?, 'sent', ?, ?)"
  ).run(
    "nt-1", "tenant-a", "cust-a", "bk-1", "booking_confirmed",
    "{\"type\":\"confirm\"}", NOW, NOW
  );
}

function makeDbThrough0009WithSeed() {
  var db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  applyFiles(db, BASE_MIGRATIONS);
  seedSixTableData(db);
  applyMigration0009LikeD1(db);
  return db;
}

function assertFormalUniqueIndexes(db) {
  FORMAL_UNIQUE_INDEXES.forEach(function (spec) {
    assert.ok(indexExists(db, spec.name), "缺少正式 index " + spec.name);
    assert.ok(
      isUniqueIndex(db, spec.table, spec.name),
      spec.name + " 必須為 UNIQUE index"
    );
    assert.deepEqual(
      indexColumns(db, spec.name),
      ["tenant_id", "id"],
      spec.name + " 欄位必須為 tenant_id, id"
    );
  });
}

test("migrations 0001～0010 可依序套用至全新記憶體 DB", function () {
  var db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  applyFiles(db, BASE_MIGRATIONS);
  seedSixTableData(db);
  applyMigration0009LikeD1(db);
  applyMigration0010(db);

  var versions = db.prepare(
    "SELECT version FROM schema_versions ORDER BY version"
  ).all().map(function (r) { return r.version; });
  assert.ok(versions.indexOf("0010_cleanup_duplicate_renamed_indexes") !== -1);
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
});

test("0009 後 bookings／customer_photo_sets 各保留 _new 與正式 UNIQUE index（共四個）", function () {
  var db = makeDbThrough0009WithSeed();

  DUPLICATE_INDEXES.forEach(function (name) {
    assert.ok(indexExists(db, name), "0009 後應存在 " + name);
  });
  FORMAL_UNIQUE_INDEXES.forEach(function (spec) {
    assert.ok(indexExists(db, spec.name), "0009 後應存在 " + spec.name);
  });

  assert.equal(
    indexNames(db, "bookings").filter(function (n) {
      return n === "uq_bookings_new_tenant_id_id" || n === "uq_bookings_tenant_id_id";
    }).length,
    2
  );
  assert.equal(
    indexNames(db, "customer_photo_sets").filter(function (n) {
      return n === "uq_photo_sets_new_tenant_id_id" || n === "uq_photo_sets_tenant_id_id";
    }).length,
    2
  );
});

test("0010 只移除 _new index，保留正式 UNIQUE(tenant_id,id) 且六表 row count 不變", function () {
  var db = makeDbThrough0009WithSeed();
  var beforeCounts = snapshotCounts(db);

  applyMigration0010(db);

  DUPLICATE_INDEXES.forEach(function (name) {
    assert.ok(!indexExists(db, name), "0010 後不得存在 " + name);
  });
  assertFormalUniqueIndexes(db);
  assert.deepEqual(snapshotCounts(db), beforeCounts);
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
});

test("0010 寫入 schema_versions 且可重複執行", function () {
  var db = makeDbThrough0009WithSeed();

  applyMigration0010(db);
  var first = db.prepare(
    "SELECT version, description FROM schema_versions WHERE version = ?"
  ).get("0010_cleanup_duplicate_renamed_indexes");
  assert.ok(first);
  assert.match(first.description, /_new/);

  applyMigration0010(db);

  assert.equal(
    db.prepare(
      "SELECT COUNT(*) AS c FROM schema_versions WHERE version = ?"
    ).get("0010_cleanup_duplicate_renamed_indexes").c,
    1
  );
  DUPLICATE_INDEXES.forEach(function (name) {
    assert.ok(!indexExists(db, name));
  });
  assertFormalUniqueIndexes(db);
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
});
