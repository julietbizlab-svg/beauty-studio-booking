/**
 * 0009_booking_status_machine migration 測試
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

var migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
var MIGRATION_0009 = "0009_booking_status_machine.sql";

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

var NOW = "2026-07-20T00:00:00.000Z";
var START1 = "2026-08-01T02:00:00.000Z";
var END1 = "2026-08-01T03:00:00.000Z";
var START2 = "2026-08-02T02:00:00.000Z";
var END2 = "2026-08-02T03:00:00.000Z";

var EXPECTED_INDEXES = {
  bookings: [
    "idx_bookings_tenant_start",
    "idx_bookings_tenant_location_start",
    "idx_bookings_tenant_staff_start",
    "idx_bookings_tenant_customer_start",
    "idx_bookings_tenant_status_start",
    "uq_bookings_tenant_id_id"
  ],
  booking_items: ["idx_booking_items_booking"],
  booking_status_logs: ["idx_booking_status_logs_booking_created"],
  customer_photo_sets: [
    "uq_photo_sets_tenant_id_id",
    "idx_photo_sets_tenant_customer_created"
  ],
  customer_photos: [
    "uq_customer_photos_active_kind",
    "idx_customer_photos_tenant_set"
  ],
  notifications: [
    "idx_notifications_schedule_status",
    "idx_notifications_booking",
    "idx_notifications_customer_created"
  ]
};

var EXPECTED_FK_ON_DELETE = {
  bookings: { parent_booking_id: "SET NULL" },
  booking_items: { booking_id: "CASCADE" },
  booking_status_logs: { booking_id: "CASCADE" },
  notifications: { booking_id: "SET NULL" },
  customer_photo_sets: { booking_id: "RESTRICT" },
  customer_photos: { photo_set_id: "RESTRICT" }
};

function read0009Sql() {
  return readFileSync(join(migrationsDir, MIGRATION_0009), "utf8");
}

function applyFiles(db, files) {
  files.forEach(function (file) {
    db.exec(readFileSync(join(migrationsDir, file), "utf8"));
  });
}

/** 模擬 D1 migration runner：外層隱含交易，0009 本身不含 BEGIN/COMMIT */
function applyMigration0009LikeD1(db) {
  var sql = read0009Sql();
  db.exec("BEGIN");
  try {
    db.exec(sql);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

function makeDbThrough0008() {
  var db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  applyFiles(db, BASE_MIGRATIONS);
  return db;
}

function seedPreUpgradeData(db) {
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
    "start_at, end_at, status, cancellation_notice_days_snapshot, cancellation_deadline_at, " +
    "created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', 2, ?, ?, ?)"
  ).run(
    "bk-parent", "tenant-a", "loc-a", "cust-a", "staff-a", "BK-PARENT",
    START1, END1, "2026-07-30T02:00:00.000Z", NOW, NOW
  );
  db.prepare(
    "INSERT INTO bookings (id, tenant_id, location_id, customer_id, staff_id, booking_no, " +
    "start_at, end_at, status, parent_booking_id, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)"
  ).run(
    "bk-pending", "tenant-a", "loc-a", "cust-a", "staff-a", "BK-PENDING",
    START2, END2, "bk-parent", NOW, NOW
  );
  db.prepare(
    "INSERT INTO bookings (id, tenant_id, location_id, customer_id, staff_id, booking_no, " +
    "start_at, end_at, status, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'checked_in', ?, ?)"
  ).run(
    "bk-checked", "tenant-a", "loc-a", "cust-a", "staff-a", "BK-CHECKED",
    "2026-08-03T02:00:00.000Z", "2026-08-03T03:00:00.000Z", NOW, NOW
  );
  db.prepare(
    "INSERT INTO bookings (id, tenant_id, location_id, customer_id, staff_id, booking_no, " +
    "start_at, end_at, status, cancellation_reason_code, cancellation_note, cancelled_at, " +
    "created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'cancelled_by_customer', ?, ?, ?, ?, ?)"
  ).run(
    "bk-cancel", "tenant-a", "loc-a", "cust-a", "staff-a", "BK-CANCEL",
    "2026-08-04T02:00:00.000Z", "2026-08-04T03:00:00.000Z",
    "customer_cancelled", "客人自行取消", NOW, NOW, NOW
  );

  db.prepare(
    "INSERT INTO booking_items (id, tenant_id, booking_id, service_id, service_name_snapshot, " +
    "duration_minutes, quantity, unit_price_amount, discount_amount, final_amount, sort_order, created_at) " +
    "VALUES (?, ?, ?, ?, ?, ?, 1, ?, 0, ?, 0, ?)"
  ).run(
    "item-1", "tenant-a", "bk-parent", "svc-a", "霧眉快照", 60, 3000, 3000, NOW
  );
  db.prepare(
    "INSERT INTO booking_status_logs (id, tenant_id, booking_id, from_status, to_status, " +
    "reason_code, note, changed_by_type, changed_by_id, created_at) " +
    "VALUES (?, ?, ?, NULL, 'confirmed', NULL, NULL, 'customer', ?, ?)"
  ).run("log-1", "tenant-a", "bk-parent", "cust-a", NOW);

  db.prepare(
    "INSERT INTO customer_photo_sets (id, tenant_id, customer_id, booking_id, title, " +
    "created_by_staff_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run("ps-1", "tenant-a", "cust-a", "bk-parent", "對比照", "staff-a", NOW, NOW);
  db.prepare(
    "INSERT INTO customer_photos (id, tenant_id, photo_set_id, customer_id, kind, object_key, " +
    "mime_type, byte_size, created_by_staff_id, created_at) " +
    "VALUES (?, ?, ?, ?, 'before', ?, 'image/jpeg', 1024, ?, ?)"
  ).run(
    "photo-1", "tenant-a", "ps-1", "cust-a",
    "customer-photos/tenant-a/abc123", "staff-a", NOW
  );

  db.prepare(
    "INSERT INTO notifications (id, tenant_id, customer_id, booking_id, channel, template_code, " +
    "recipient, subject, content_snapshot, status, scheduled_at, sent_at, created_at) " +
    "VALUES (?, ?, ?, ?, 'line', ?, ?, ?, ?, 'sent', ?, ?, ?)"
  ).run(
    "nt-confirmed", "tenant-a", "cust-a", "bk-parent", "booking_confirmed",
    "U-line-user", "預約確認", "{\"type\":\"confirm\"}", "2026-07-19T10:00:00.000Z",
    "2026-07-19T10:01:00.000Z", NOW
  );
  db.prepare(
    "INSERT INTO notifications (id, tenant_id, customer_id, booking_id, channel, template_code, " +
    "recipient, content_snapshot, status, scheduled_at, created_at) " +
    "VALUES (?, ?, ?, ?, 'line', ?, ?, ?, 'queued', ?, ?)"
  ).run(
    "nt-pending", "tenant-a", "cust-a", "bk-pending", "booking_reminder",
    "U-line-user", "{\"type\":\"reminder\"}", "2026-08-01T08:00:00.000Z", NOW
  );
  db.prepare(
    "INSERT INTO notifications (id, tenant_id, customer_id, booking_id, channel, template_code, " +
    "content_snapshot, status, failed_at, error_message, created_at) " +
    "VALUES (?, ?, ?, NULL, 'line', ?, ?, 'failed', ?, ?, ?)"
  ).run(
    "nt-null-booking", "tenant-a", "cust-a", "system_alert",
    "{\"type\":\"alert\"}", NOW, "LINE API timeout", NOW
  );
}

function tableRows(db, table) {
  return db.prepare("SELECT * FROM " + table + " ORDER BY id").all();
}

function tableCount(db, table) {
  return db.prepare("SELECT COUNT(*) AS c FROM " + table).get().c;
}

function indexNames(db, table) {
  return db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND name NOT LIKE 'sqlite_%'"
  ).all(table).map(function (r) { return r.name; }).sort();
}

function fkList(db, table) {
  return db.prepare("PRAGMA foreign_key_list(" + table + ")").all();
}

function snapshotCounts(db) {
  return {
    bookings: tableCount(db, "bookings"),
    booking_items: tableCount(db, "booking_items"),
    booking_status_logs: tableCount(db, "booking_status_logs"),
    customer_photo_sets: tableCount(db, "customer_photo_sets"),
    customer_photos: tableCount(db, "customer_photos"),
    notifications: tableCount(db, "notifications")
  };
}

function assertFkGraphAfterMigration(db) {
  var fkViolations = db.prepare("PRAGMA foreign_key_check").all();
  assert.deepEqual(fkViolations, [], "foreign_key_check 必須為 0 rows");

  Object.keys(EXPECTED_INDEXES).forEach(function (table) {
    var names = indexNames(db, table);
    EXPECTED_INDEXES[table].forEach(function (idx) {
      assert.ok(names.indexOf(idx) !== -1, table + " 缺少 index " + idx);
    });
  });

  Object.keys(EXPECTED_FK_ON_DELETE).forEach(function (table) {
    var fks = fkList(db, table);
    Object.keys(EXPECTED_FK_ON_DELETE[table]).forEach(function (col) {
      var match = fks.find(function (fk) { return fk.from === col; });
      assert.ok(match, table + "." + col + " FK 不存在");
      assert.equal(match.on_delete, EXPECTED_FK_ON_DELETE[table][col]);
      assert.ok(!String(match.table).includes("_new"), table + "." + col + " FK 指向 _new 表");
    });
  });

  ["bookings", "booking_items", "booking_status_logs", "notifications",
    "customer_photo_sets", "customer_photos"].forEach(function (table) {
    fkList(db, table).forEach(function (fk) {
      assert.ok(!String(fk.table).includes("_new"), table + " FK target 不得含 _new");
    });
  });
}

function insertBooking(db, status, bookingNo) {
  db.prepare(
    "INSERT INTO bookings (id, tenant_id, location_id, customer_id, booking_no, " +
    "start_at, end_at, status, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    "bk-" + status,
    "tenant-a",
    "loc-a",
    "cust-a",
    bookingNo || status,
    NOW,
    "2026-07-20T01:00:00.000Z",
    status,
    NOW,
    NOW
  );
}

test("migrations 0001～0009 可依序套用（0009 以 D1 隱含交易語意）", function () {
  var db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  applyFiles(db, BASE_MIGRATIONS);
  db.prepare(
    "INSERT INTO tenants (id, code, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  ).run("tenant-a", "ta", "租戶Ａ", NOW, NOW);
  db.prepare(
    "INSERT INTO locations (id, tenant_id, code, name, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?, ?)"
  ).run("loc-a", "tenant-a", "loc", "店面", NOW, NOW);
  db.prepare(
    "INSERT INTO customers (id, tenant_id, display_name, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?)"
  ).run("cust-a", "tenant-a", "客戶", NOW, NOW);
  applyMigration0009LikeD1(db);
  var versions = db.prepare(
    "SELECT version FROM schema_versions ORDER BY version"
  ).all().map(function (r) { return r.version; });
  assert.ok(versions.indexOf("0009_booking_status_machine") !== -1);
});

test("0009 SQL：defer_foreign_keys ON；不含 BEGIN/COMMIT/ROLLBACK/foreign_keys OFF", function () {
  var sql = read0009Sql();
  assert.ok(/PRAGMA defer_foreign_keys\s*=\s*ON/i.test(sql));
  assert.ok(!/PRAGMA foreign_keys\s*=\s*OFF/i.test(sql));
  assert.ok(!/PRAGMA foreign_keys\s*=\s*ON/i.test(sql));
  assert.ok(!/\bBEGIN\s+IMMEDIATE\b/i.test(sql));
  assert.ok(!/\bBEGIN\s+TRANSACTION\b/i.test(sql));
  assert.ok(!/^\s*BEGIN\s*;/im.test(sql));
  assert.ok(!/^\s*COMMIT\s*;/im.test(sql));
  assert.ok(!/ROLLBACK/i.test(sql));
});

test("0009 允許 Phase 1 新狀態寫入 bookings 與 status log", function () {
  var db = makeDbThrough0008();
  db.prepare(
    "INSERT INTO tenants (id, code, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  ).run("tenant-a", "ta", "租戶Ａ", NOW, NOW);
  db.prepare(
    "INSERT INTO locations (id, tenant_id, code, name, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?, ?)"
  ).run("loc-a", "tenant-a", "loc", "店面", NOW, NOW);
  db.prepare(
    "INSERT INTO customers (id, tenant_id, display_name, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?)"
  ).run("cust-a", "tenant-a", "客戶", NOW, NOW);
  applyMigration0009LikeD1(db);

  var newStatuses = [
    "draft", "held", "pending_review", "pending_customer_confirmation", "expired"
  ];
  newStatuses.forEach(function (status, index) {
    insertBooking(db, status, "BK-N" + index + "-");
    db.prepare(
      "INSERT INTO booking_status_logs " +
      "(id, tenant_id, booking_id, from_status, to_status, created_at) " +
      "VALUES (?, ?, ?, NULL, ?, ?)"
    ).run("log-" + status, "tenant-a", "bk-" + status, status, NOW);
  });
  assert.equal(tableCount(db, "bookings"), newStatuses.length);
});

test("0009 拒絕未知 status", function () {
  var db = makeDbThrough0008();
  db.prepare(
    "INSERT INTO tenants (id, code, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  ).run("tenant-a", "ta", "租戶Ａ", NOW, NOW);
  db.prepare(
    "INSERT INTO locations (id, tenant_id, code, name, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?, ?)"
  ).run("loc-a", "tenant-a", "loc", "店面", NOW, NOW);
  db.prepare(
    "INSERT INTO customers (id, tenant_id, display_name, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?)"
  ).run("cust-a", "tenant-a", "客戶", NOW, NOW);
  applyMigration0009LikeD1(db);
  assert.throws(function () {
    insertBooking(db, "totally_invalid", "BK-BAD-");
  }, /CHECK/i);
});

test("0001～0008 → 0009 upgrade（D1 隱含交易）完整保留資料、notifications 與 FK", function () {
  var db = makeDbThrough0008();
  seedPreUpgradeData(db);

  var beforeCounts = snapshotCounts(db);
  var beforeBookings = tableRows(db, "bookings");
  var beforeItems = tableRows(db, "booking_items");
  var beforeLogs = tableRows(db, "booking_status_logs");
  var beforeSets = tableRows(db, "customer_photo_sets");
  var beforePhotos = tableRows(db, "customer_photos");
  var beforeNotifications = tableRows(db, "notifications");

  applyMigration0009LikeD1(db);

  var afterCounts = snapshotCounts(db);
  assert.deepEqual(afterCounts, beforeCounts);

  var afterBookings = tableRows(db, "bookings");
  assert.deepEqual(
    afterBookings.map(function (r) { return r.id; }),
    beforeBookings.map(function (r) { return r.id; })
  );
  afterBookings.forEach(function (row, i) {
    var prev = beforeBookings[i];
    assert.equal(row.status, prev.status);
    assert.equal(row.cancellation_notice_days_snapshot, prev.cancellation_notice_days_snapshot);
    assert.equal(row.cancellation_deadline_at, prev.cancellation_deadline_at);
    assert.equal(row.parent_booking_id, prev.parent_booking_id);
  });

  var afterItems = tableRows(db, "booking_items");
  assert.equal(afterItems[0].service_name_snapshot, beforeItems[0].service_name_snapshot);
  assert.equal(afterItems[0].duration_minutes, beforeItems[0].duration_minutes);

  var afterLogs = tableRows(db, "booking_status_logs");
  assert.equal(afterLogs[0].from_status, beforeLogs[0].from_status);
  assert.equal(afterLogs[0].to_status, beforeLogs[0].to_status);

  var afterSets = tableRows(db, "customer_photo_sets");
  assert.equal(afterSets[0].booking_id, beforeSets[0].booking_id);

  var afterPhotos = tableRows(db, "customer_photos");
  assert.equal(afterPhotos[0].object_key, beforePhotos[0].object_key);

  var afterNotifications = tableRows(db, "notifications");
  assert.equal(afterNotifications.length, beforeNotifications.length);
  afterNotifications.forEach(function (row, i) {
    var prev = beforeNotifications[i];
    assert.equal(row.id, prev.id);
    assert.equal(row.customer_id, prev.customer_id);
    assert.equal(row.booking_id, prev.booking_id);
    assert.equal(row.channel, prev.channel);
    assert.equal(row.template_code, prev.template_code);
    assert.equal(row.content_snapshot, prev.content_snapshot);
    assert.equal(row.status, prev.status);
    assert.equal(row.scheduled_at, prev.scheduled_at);
    assert.equal(row.sent_at, prev.sent_at);
    assert.equal(row.failed_at, prev.failed_at);
    assert.equal(row.error_message, prev.error_message);
    assert.equal(row.created_at, prev.created_at);
    if (prev.booking_id != null) {
      assert.notEqual(row.booking_id, null, row.id + " booking_id 不得變 NULL");
    }
  });

  var confirmedNt = afterNotifications.find(function (r) { return r.id === "nt-confirmed"; });
  assert.equal(confirmedNt.booking_id, "bk-parent");
  var pendingNt = afterNotifications.find(function (r) { return r.id === "nt-pending"; });
  assert.equal(pendingNt.booking_id, "bk-pending");
  var nullNt = afterNotifications.find(function (r) { return r.id === "nt-null-booking"; });
  assert.equal(nullNt.booking_id, null);

  assertFkGraphAfterMigration(db);

  var parentRow = db.prepare(
    "SELECT parent_booking_id FROM bookings WHERE id = ?"
  ).get("bk-pending");
  assert.equal(parentRow.parent_booking_id, "bk-parent");
});

test("0009 在 D1 隱含交易內失敗時可 ROLLBACK（notifications 綁定 booking 保留）", function () {
  var db = makeDbThrough0008();
  seedPreUpgradeData(db);
  var beforeNotifications = tableRows(db, "notifications");
  var badSql = read0009Sql() + "\nSELECT no_such_column FROM bookings;\n";

  assert.throws(function () {
    db.exec("BEGIN");
    try {
      db.exec(badSql);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  });

  var afterNotifications = tableRows(db, "notifications");
  assert.deepEqual(afterNotifications, beforeNotifications);
  assert.equal(
    db.prepare("SELECT status FROM bookings WHERE id = ?").get("bk-parent").status,
    "confirmed"
  );
});
