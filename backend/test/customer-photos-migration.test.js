/**
 * 0007_customer_comparison_photos migration schema 測試
 *
 * 以 Node 內建 node:sqlite 在本機記憶體 DB 依序套用 migrations
 * 0001～0007（零依賴、不連任何遠端），驗證 photo set／photo 的
 * tenant scoped FK、before/after active 唯一限制、object_key 唯一，
 * 以及「不存 binary／base64／公開 URL／個資」的欄位邊界。
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
  "0007_customer_comparison_photos.sql"
];

var NOW = "2026-07-19T00:00:00.000Z";

function makeMigratedDb() {
  var db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  MIGRATION_FILES.forEach(function (file) {
    db.exec(readFileSync(join(migrationsDir, file), "utf8"));
  });

  ["tenant-a", "tenant-b"].forEach(function (tenantId, index) {
    db.prepare(
      "INSERT INTO tenants (id, code, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    ).run(tenantId, "t" + index, "租戶" + index, NOW, NOW);
  });
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
  ).run("cust-b1", "tenant-b", "客戶Ｂ1", NOW, NOW);

  return db;
}

function insertBooking(db, id, tenantId, customerId) {
  var locationId = "loc-" + tenantId;
  var existing = db.prepare("SELECT id FROM locations WHERE id = ?").get(locationId);
  if (!existing) {
    db.prepare(
      "INSERT INTO locations (id, tenant_id, code, name, created_at, updated_at) " +
      "VALUES (?, ?, ?, ?, ?, ?)"
    ).run(locationId, tenantId, "loc", "店面", NOW, NOW);
  }
  db.prepare(
    "INSERT INTO bookings (id, tenant_id, location_id, booking_no, customer_id, " +
    "start_at, end_at, status, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?)"
  ).run(id, tenantId, locationId, "BK-" + id, customerId,
    NOW, "2026-07-19T01:00:00.000Z", NOW, NOW);
}

var SET_COLUMNS = [
  "id", "tenant_id", "customer_id", "booking_id", "title", "captured_at",
  "created_by_staff_id", "created_at", "updated_at", "deleted_at"
];

function insertSet(db, overrides) {
  var row = Object.assign({
    id: "set-" + Math.random().toString(36).slice(2),
    tenant_id: "tenant-a",
    customer_id: "cust-a1",
    booking_id: null,
    title: null,
    captured_at: null,
    created_by_staff_id: "staff-a",
    created_at: NOW,
    updated_at: NOW,
    deleted_at: null
  }, overrides || {});
  db.prepare(
    "INSERT INTO customer_photo_sets (" + SET_COLUMNS.join(", ") + ") " +
    "VALUES (" + SET_COLUMNS.map(function () { return "?"; }).join(", ") + ")"
  ).run(...SET_COLUMNS.map(function (column) { return row[column]; }));
  return row;
}

var PHOTO_COLUMNS = [
  "id", "tenant_id", "photo_set_id", "customer_id", "kind", "object_key",
  "mime_type", "byte_size", "width", "height", "created_by_staff_id",
  "created_at", "deleted_at"
];

var keySeq = 0;
function uniqueKey() {
  keySeq += 1;
  return "customer-photos/tenant-a/key-" + keySeq;
}

function insertPhoto(db, overrides) {
  var row = Object.assign({
    id: "photo-" + Math.random().toString(36).slice(2),
    tenant_id: "tenant-a",
    photo_set_id: "set-1",
    customer_id: "cust-a1",
    kind: "before",
    object_key: uniqueKey(),
    mime_type: "image/jpeg",
    byte_size: 1000,
    width: null,
    height: null,
    created_by_staff_id: "staff-a",
    created_at: NOW,
    deleted_at: null
  }, overrides || {});
  db.prepare(
    "INSERT INTO customer_photos (" + PHOTO_COLUMNS.join(", ") + ") " +
    "VALUES (" + PHOTO_COLUMNS.map(function () { return "?"; }).join(", ") + ")"
  ).run(...PHOTO_COLUMNS.map(function (column) { return row[column]; }));
  return row;
}

function makeDbWithSet() {
  var db = makeMigratedDb();
  insertSet(db, { id: "set-1" });
  return db;
}

// ── migration 套用 ───────────────────────────────────────────

test("migrations 0001～0007 可依序套用至全新記憶體 DB", function () {
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
    "0007_customer_comparison_photos"
  ]);
});

// ── tenant scoped FK ─────────────────────────────────────────

test("photo set：customer／staff／booking FK 必須 tenant scoped", function () {
  var db = makeMigratedDb();
  insertBooking(db, "bk-b1", "tenant-b", "cust-b1");

  assert.throws(function () {
    insertSet(db, { tenant_id: "tenant-a", customer_id: "cust-b1" });
  }, /FOREIGN KEY/i);
  assert.throws(function () {
    insertSet(db, { created_by_staff_id: "staff-b" });
  }, /FOREIGN KEY/i);
  assert.throws(function () {
    insertSet(db, { booking_id: "bk-b1" });
  }, /FOREIGN KEY/i, "tenant-a 照片組不可引用 tenant-b 預約");

  insertBooking(db, "bk-a1", "tenant-a", "cust-a1");
  insertSet(db, { booking_id: "bk-a1" });
});

test("photo：set／customer／staff FK 必須 tenant scoped", function () {
  var db = makeDbWithSet();
  insertSet(db, { id: "set-b1", tenant_id: "tenant-b", customer_id: "cust-b1", created_by_staff_id: "staff-b" });

  assert.throws(function () {
    insertPhoto(db, { tenant_id: "tenant-a", photo_set_id: "set-b1" });
  }, /FOREIGN KEY/i, "tenant-a 照片不可掛 tenant-b 照片組");
  assert.throws(function () {
    insertPhoto(db, { customer_id: "cust-b1" });
  }, /FOREIGN KEY/i);
  assert.throws(function () {
    insertPhoto(db, { created_by_staff_id: "staff-b" });
  }, /FOREIGN KEY/i);
  assert.throws(function () {
    insertPhoto(db, { photo_set_id: "set-nope" });
  }, /FOREIGN KEY/i);
});

// ── before/after active 唯一限制 ─────────────────────────────

test("同 set 同 kind 只能有一張 active 照片", function () {
  var db = makeDbWithSet();
  insertPhoto(db, { kind: "before" });
  assert.throws(function () {
    insertPhoto(db, { kind: "before" });
  }, /UNIQUE/i);
  insertPhoto(db, { kind: "after" });
});

test("軟刪照片不佔 active 唯一限制（可上傳取代）", function () {
  var db = makeDbWithSet();
  insertPhoto(db, { kind: "before", deleted_at: NOW });
  insertPhoto(db, { kind: "before", deleted_at: NOW });
  insertPhoto(db, { kind: "before" });
  assert.throws(function () {
    insertPhoto(db, { kind: "before" });
  }, /UNIQUE/i);
});

test("kind 只接受 before／after", function () {
  var db = makeDbWithSet();
  assert.throws(function () {
    insertPhoto(db, { kind: "side" });
  }, /CHECK/i);
});

// ── object_key 與格式約束 ────────────────────────────────────

test("object_key 全域唯一（含已軟刪列）", function () {
  var db = makeDbWithSet();
  insertSet(db, { id: "set-2" });
  var key = "customer-photos/tenant-a/dup-key";
  insertPhoto(db, { object_key: key, deleted_at: NOW });
  assert.throws(function () {
    insertPhoto(db, { photo_set_id: "set-2", object_key: key });
  }, /UNIQUE/i);
});

test("mime_type 僅允許 JPEG／PNG／WebP", function () {
  var db = makeDbWithSet();
  insertPhoto(db, { mime_type: "image/jpeg" });
  insertPhoto(db, { kind: "after", mime_type: "image/png" });
  ["image/svg+xml", "image/gif", "text/html", "application/pdf", "image/heic"]
    .forEach(function (bad) {
      assert.throws(function () {
        insertPhoto(db, { mime_type: bad, deleted_at: NOW });
      }, /CHECK/i, bad + " 必須被拒絕");
    });
});

test("byte_size 超過 5 MB 或非正數失敗", function () {
  var db = makeDbWithSet();
  assert.throws(function () {
    insertPhoto(db, { byte_size: 0 });
  }, /CHECK/i);
  assert.throws(function () {
    insertPhoto(db, { byte_size: 5 * 1024 * 1024 + 1 });
  }, /CHECK/i);
  insertPhoto(db, { byte_size: 5 * 1024 * 1024 });
});

// ── 欄位邊界 ─────────────────────────────────────────────────

test("schema 不保存 binary／base64／公開 URL／個資欄位", function () {
  var db = makeMigratedDb();

  var setColumns = db.prepare(
    "SELECT name FROM pragma_table_info('customer_photo_sets') ORDER BY name"
  ).all().map(function (r) { return r.name; });
  assert.deepEqual(setColumns, SET_COLUMNS.slice().sort());

  var photoColumns = db.prepare(
    "SELECT name FROM pragma_table_info('customer_photos') ORDER BY name"
  ).all().map(function (r) { return r.name; });
  assert.deepEqual(photoColumns, PHOTO_COLUMNS.slice().sort());

  var forbidden = [
    "binary", "data", "base64", "image_data", "blob",
    "public_url", "url", "filename", "original_filename",
    "name", "display_name", "phone", "mobile", "birthday",
    "note", "notes", "line_user_id", "token", "secret"
  ];
  forbidden.forEach(function (bad) {
    assert.ok(setColumns.indexOf(bad) === -1, "photo_sets 不得有欄位「" + bad + "」");
    assert.ok(photoColumns.indexOf(bad) === -1, "photos 不得有欄位「" + bad + "」");
  });
});

// ── hard delete 安全（一律 RESTRICT，避免 R2 orphan） ────────

test("booking 被 photo set 參照時 hard delete 被拒絕；無參照可刪除", function () {
  var db = makeMigratedDb();
  insertBooking(db, "bk-ref", "tenant-a", "cust-a1");
  insertBooking(db, "bk-free", "tenant-a", "cust-a1");
  insertSet(db, { id: "set-ref", booking_id: "bk-ref" });

  assert.throws(function () {
    db.prepare("DELETE FROM bookings WHERE id = ?").run("bk-ref");
  }, /FOREIGN KEY/i, "有 photo set 參照的 booking 不得 hard delete");

  db.prepare("DELETE FROM bookings WHERE id = ?").run("bk-free");
  var remaining = db.prepare("SELECT id FROM bookings ORDER BY id").all()
    .map(function (r) { return r.id; });
  assert.deepEqual(remaining, ["bk-ref"], "無參照的 booking 可正常刪除");
});

test("customer／photo set hard delete 一律 RESTRICT，不 cascade 刪 metadata", function () {
  var db = makeDbWithSet();
  insertPhoto(db, { kind: "before" });

  assert.throws(function () {
    db.prepare("DELETE FROM customers WHERE id = ?").run("cust-a1");
  }, /FOREIGN KEY/i, "customer 有 photo set 時 hard delete 必須被拒絕");

  assert.throws(function () {
    db.prepare("DELETE FROM customer_photo_sets WHERE id = ?").run("set-1");
  }, /FOREIGN KEY/i, "photo set 有照片 metadata 時 hard delete 必須被拒絕");

  // metadata（object_key 唯一指向 R2 物件）必須原封不動
  var photoCount = db.prepare("SELECT COUNT(*) AS n FROM customer_photos").get().n;
  assert.equal(photoCount, 1, "照片 metadata 不得被 cascade 刪除");
});

test("FK 不含 CASCADE／SET NULL：hard delete 不會產生無法追蹤的 R2 orphan", function () {
  var db = makeMigratedDb();
  ["customer_photo_sets", "customer_photos"].forEach(function (table) {
    var fks = db.prepare("SELECT * FROM pragma_foreign_key_list(?)").all(table);
    assert.ok(fks.length >= 3, table + " 應有 tenant scoped FK");
    fks.forEach(function (fk) {
      assert.equal(fk.on_delete, "RESTRICT",
        table + " 對 " + fk.table + " 的 FK 必須 ON DELETE RESTRICT");
    });
  });
});

test("必要索引存在（active 唯一、查詢索引、bookings 複合唯一）", function () {
  var db = makeMigratedDb();
  var photoIndexes = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'customer_photos'"
  ).all().map(function (r) { return r.name; });
  assert.ok(photoIndexes.indexOf("uq_customer_photos_active_kind") !== -1);
  assert.ok(photoIndexes.indexOf("idx_customer_photos_tenant_set") !== -1);

  var setIndexes = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'customer_photo_sets'"
  ).all().map(function (r) { return r.name; });
  assert.ok(setIndexes.indexOf("uq_photo_sets_tenant_id_id") !== -1);
  assert.ok(setIndexes.indexOf("idx_photo_sets_tenant_customer_created") !== -1);

  var bookingsIndex = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'index' " +
    "AND tbl_name = 'bookings' AND name = 'uq_bookings_tenant_id_id'"
  ).get();
  assert.ok(bookingsIndex, "bookings (tenant_id, id) 複合唯一索引必須存在");
});
