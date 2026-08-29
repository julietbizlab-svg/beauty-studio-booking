import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  getCustomerBookingReview,
  updateCustomerBookingReview,
  getOwnerBookingReview,
  requestOwnerBookingReviewPhoto,
  uploadCustomerBookingReviewPhoto,
  getOwnerBookingReviewPhotoContent
} from "../src/d1-booking-review.js";
import { generateOwnerReviewSummary } from "../src/owner-ai.js";
import { dispatchLineNotificationById, dispatchQueuedLineNotifications } from "../src/d1-notifications.js";

var migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
var files = [
  "0001_init_core.sql", "0002_bookings.sql", "0003_settings_schedules.sql",
  "0004_ops_tables.sql", "0005_customer_import.sql", "0006_customer_claim_invites.sql",
  "0007_customer_comparison_photos.sql", "0008_booking_notice_policy.sql",
  "0009_booking_status_machine.sql", "0010_cleanup_duplicate_renamed_indexes.sql",
  "0011_ai_customer_inquiries.sql", "0012_booking_review_deposit_deadline.sql",
  "0013_booking_review_intake.sql", "0015_review_question_requests.sql"
];
var NOW = "2026-07-20T00:00:00.000Z";

function setup() {
  var db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  files.forEach(function (file) { db.exec(readFileSync(join(migrationsDir, file), "utf8")); });
  db.prepare("INSERT INTO tenants (id, code, name, created_at, updated_at) VALUES ('t','t','店',?,?)")
    .run(NOW, NOW);
  db.prepare(
    "INSERT INTO locations (id, tenant_id, code, name, created_at, updated_at) " +
    "VALUES ('l','t','l','店',?,?)"
  ).run(NOW, NOW);
  db.prepare(
    "INSERT INTO staff (id, tenant_id, code, display_name, created_at, updated_at) " +
    "VALUES ('s','t','s','老師',?,?)"
  ).run(NOW, NOW);
  db.prepare(
    "INSERT INTO customers (id, tenant_id, display_name, created_at, updated_at) " +
    "VALUES ('c','t','客人',?,?)"
  ).run(NOW, NOW);
  db.prepare(
    "INSERT INTO line_accounts (id, tenant_id, customer_id, line_user_id, linked_at) " +
    "VALUES ('la','t','c','U-customer',?)"
  ).run(NOW);
  db.prepare(
    "INSERT INTO bookings (id, tenant_id, location_id, customer_id, staff_id, booking_no, " +
    "start_at, end_at, status, created_at, updated_at) VALUES " +
    "('b','t','l','c','s','B','2099-01-01T02:00:00.000Z'," +
    "'2099-01-01T03:00:00.000Z','pending_review',?,?)"
  ).run(NOW, NOW);
  var bucket = {
    data: {},
    put: async function (key, bytes) { this.data[key] = bytes; },
    get: async function (key) {
      return this.data[key] ? { body: this.data[key] } : null;
    },
    delete: async function (key) { delete this.data[key]; }
  };
  function prepared(sql) {
    var statement = {
      bind: function () {
        var binds = Array.prototype.slice.call(arguments);
        return {
          sql: sql, binds: binds,
          first: async function () {
            var s = db.prepare(sql);
            return s.get.apply(s, binds) || null;
          },
          all: async function () {
            var s = db.prepare(sql);
            return { results: s.all.apply(s, binds) };
          },
          run: async function () {
            var s = db.prepare(sql);
            return { meta: { changes: s.run.apply(s, binds).changes } };
          }
        };
      }
    };
    return statement;
  }
  return {
    db: db,
    bucket: bucket,
    env: {
      DATA_BACKEND: "d1",
      DB: { prepare: prepared },
      TENANT_ID: "t",
      DEFAULT_LINE_TENANT_ID: "t",
      STAFF_ID: "s",
      PHOTO_BUCKET: bucket
    }
  };
}

function jpeg() {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 3]);
}

test("0013 schema、客戶所有權與問卷讀寫", async function () {
  var x = setup();
  assert.ok(x.db.prepare(
    "SELECT 1 FROM schema_versions WHERE version = '0013_booking_review_intake'"
  ).get());
  await assert.rejects(
    getCustomerBookingReview(x.env, "b", "U-other"),
    function (error) { return error.status === 404; }
  );
  var updated = await updateCustomerBookingReview(x.env, "b", "U-customer", {
    surgeryHistory: "曾接受眼科手術",
    diseaseHistory: "無",
    lastTreatmentAt: "2026-06-01",
    customerNote: "皮膚較敏感"
  });
  assert.equal(updated.intake.surgeryHistory, "曾接受眼科手術");
  assert.equal(updated.intake.lastTreatmentAt, "2026-06-01");
  assert.ok(updated.intake.submittedAt);
  await assert.rejects(
    updateCustomerBookingReview(x.env, "b", "U-customer", {
      surgeryHistory: "x".repeat(2001)
    }),
    /不可超過/
  );
});

test("業主要求補照片，客戶上傳私有 R2，DTO 不洩漏 object key", async function () {
  var x = setup();
  var requested = await requestOwnerBookingReviewPhoto(x.env, "b", {
    photoRequested: true,
    photoRequestNote: "請補自然光正面照"
  });
  assert.equal(requested.intake.photoRequested, true);
  assert.equal(
    x.db.prepare("SELECT template_code FROM notifications").get().template_code,
    "review_photo_requested"
  );
  var uploaded = await uploadCustomerBookingReviewPhoto(
    x.env, "b", "U-customer", jpeg(), "image/jpeg"
  );
  assert.ok(uploaded.photo.photoId);
  assert.equal(JSON.stringify(uploaded).includes("booking-review-photos/"), false);
  var owner = await getOwnerBookingReview(x.env, "b");
  assert.equal(owner.intake.photos.length, 1);
  assert.match(owner.intake.photos[0].contentPath, /\/api\/owner\/bookings\/b\//);
  var content = await getOwnerBookingReviewPhotoContent(
    x.env, "b", owner.intake.photos[0].photoId
  );
  assert.equal(content.mimeType, "image/jpeg");
  assert.deepEqual(Array.from(content.body), Array.from(jpeg()));
  await assert.rejects(
    uploadCustomerBookingReviewPhoto(
      x.env, "b", "U-customer", new TextEncoder().encode("<svg></svg>"), "image/svg+xml"
    ),
    /格式不支援/
  );
});

test("同一預約短時間重複要求補照片只建立一筆 LINE 通知", async function () {
  var x = setup();
  var first = await requestOwnerBookingReviewPhoto(x.env, "b", {
    photoRequested: true,
    photoRequestNote: "請補自然光正面照"
  });
  var second = await requestOwnerBookingReviewPhoto(x.env, "b", {
    photoRequested: true,
    photoRequestNote: "請補自然光正面照"
  });
  assert.equal(first.intake.photoRequested, true);
  assert.equal(second.intake.photoRequested, true);
  assert.equal(x.db.prepare(
    "SELECT COUNT(*) AS count FROM notifications WHERE booking_id='b' " +
    "AND template_code='review_photo_requested'"
  ).get().count, 1);
});

test("業主可指定客人補答審核問題並建立 LINE 通知", async function () {
  var x = setup();
  await requestOwnerBookingReviewPhoto(x.env, "b", {
    photoRequested: true,
    photoRequestNote: "請補自然光正面照"
  });
  var result = await requestOwnerBookingReviewPhoto(x.env, "b", {
    surgeryHistoryRequested: true,
    diseaseHistoryRequested: true,
    lastTreatmentRequested: false,
    questionRequestNote: "請補充近期相關狀況"
  });
  assert.equal(result.intake.surgeryHistoryRequested, true);
  assert.equal(result.intake.diseaseHistoryRequested, true);
  assert.equal(result.intake.lastTreatmentRequested, false);
  assert.equal(result.intake.questionRequestNote, "請補充近期相關狀況");
  assert.equal(result.intake.photoRequested, true);
  assert.equal(result.intake.photoRequestNote, "請補自然光正面照");
  assert.equal(
    x.db.prepare(
      "SELECT COUNT(*) AS count FROM notifications " +
      "WHERE booking_id = 'b' AND template_code = 'review_answers_requested'"
    ).get().count,
    1
  );
});

test("旗艦 AI 只收到去識別問卷摘要資料，標準版能力關閉", async function () {
  var x = setup();
  await updateCustomerBookingReview(x.env, "b", "U-customer", {
    surgeryHistory: "曾手術",
    diseaseHistory: "無",
    lastTreatmentAt: "2026-06-01",
    customerNote: "敏感肌"
  });
  var captured = null;
  x.env.OWNER_AI_ENABLED = "true";
  x.env.AI_RATE_LIMIT_STORE = {};
  x.env.AI_PROVIDER = {
    generateDailySummary: async function () { return { text: "unused" }; },
    generateMessageDraft: async function () { return { text: "unused" }; },
    generateReviewSummary: async function (payload) {
      captured = payload;
      return { text: "資料已提交；請確認手術史與敏感肌狀況。" };
    }
  };
  var result = await generateOwnerReviewSummary(x.env, { bookingId: "b" }, "owner");
  assert.match(result.summary, /請確認/);
  assert.equal(captured.surgeryHistory, "曾手術");
  assert.equal(captured.photoCount, 0);
  var serialized = JSON.stringify(captured);
  assert.equal(serialized.includes("U-customer"), false);
  assert.equal(serialized.includes("booking-review-photos/"), false);
  x.env.OWNER_AI_ENABLED = "false";
  await assert.rejects(
    generateOwnerReviewSummary(x.env, { bookingId: "b" }, "owner"),
    function (error) { return error.status === 503; }
  );
});

test("未設定 LINE access token 時通知保持 queued 且不對外連線", async function () {
  var x = setup();
  await requestOwnerBookingReviewPhoto(x.env, "b", {
    photoRequested: true,
    photoRequestNote: "請補照片"
  });
  var result = await dispatchQueuedLineNotifications(x.env, 20);
  assert.equal(result.enabled, false);
  assert.equal(
    x.db.prepare("SELECT status FROM notifications").get().status,
    "queued"
  );
});

test("即時發送與 cron 同時取得同一通知時只允許送出一次", async function () {
  var x = setup();
  await requestOwnerBookingReviewPhoto(x.env, "b", {
    photoRequested: true, photoRequestNote: "請補照片"
  });
  var notificationId = x.db.prepare("SELECT id FROM notifications").get().id;
  x.env.LINE_CHANNEL_ACCESS_TOKEN = "secret";
  var calls = 0;
  var originalFetch = globalThis.fetch;
  globalThis.fetch = async function () {
    calls += 1;
    await Promise.resolve();
    return new Response("{}", { status: 200 });
  };
  try {
    await Promise.all([
      dispatchLineNotificationById(x.env, notificationId),
      dispatchQueuedLineNotifications(x.env, 20)
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(calls, 1);
  assert.equal(x.db.prepare("SELECT status FROM notifications").get().status, "sent");
});

test("LINE HTTP 失敗只保存安全分類、欄位名稱與 request ID", async function () {
  var x = setup();
  await requestOwnerBookingReviewPhoto(x.env, "b", {
    photoRequested: true,
    photoRequestNote: "請補照片"
  });
  x.env.LINE_CHANNEL_ACCESS_TOKEN = "super-secret-token";
  var originalFetch = globalThis.fetch;
  globalThis.fetch = async function () {
    return new Response(JSON.stringify({
      message: "raw provider message must not be stored",
      details: [
        { message: "raw detail must not be stored", property: "messages[0].text" },
        { message: "private recipient", property: "to" },
        { message: "ignored", property: "bad field with spaces" }
      ]
    }), {
      status: 400,
      headers: { "x-line-request-id": "req_safe-123" }
    });
  };
  try {
    var result = await dispatchQueuedLineNotifications(x.env, 20);
    assert.equal(result.failedCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
  var row = x.db.prepare(
    "SELECT status, error_code, error_message FROM notifications"
  ).get();
  assert.equal(row.status, "failed");
  assert.equal(row.error_code, "line_http_400_invalid_request");
  assert.match(row.error_message, /details=2/);
  assert.match(row.error_message, /fields=messages\[0\]\.text,to/);
  assert.match(row.error_message, /request_id=req_safe-123/);
  assert.equal(row.error_message.includes("raw provider"), false);
  assert.equal(row.error_message.includes("raw detail"), false);
  assert.equal(row.error_message.includes("super-secret-token"), false);
  assert.equal(row.error_message.includes("U-customer"), false);
});

test("LINE 401 與網路失敗分開分類且不保存例外內容", async function () {
  var x = setup();
  await requestOwnerBookingReviewPhoto(x.env, "b", {
    photoRequested: true,
    photoRequestNote: "請補照片"
  });
  x.env.LINE_CHANNEL_ACCESS_TOKEN = "secret";
  var originalFetch = globalThis.fetch;
  globalThis.fetch = async function () {
    return new Response(JSON.stringify({ message: "token invalid: secret" }), {
      status: 401
    });
  };
  try {
    await dispatchQueuedLineNotifications(x.env, 20);
  } finally {
    globalThis.fetch = originalFetch;
  }
  var unauthorized = x.db.prepare(
    "SELECT error_code, error_message FROM notifications"
  ).get();
  assert.equal(unauthorized.error_code, "line_http_401_authentication_failed");
  assert.equal(unauthorized.error_message.includes("token invalid"), false);
  assert.equal(unauthorized.error_message.includes("secret"), false);

  x.db.prepare(
    "UPDATE notifications SET status='queued', failed_at=NULL, " +
    "error_code=NULL, error_message=NULL, scheduled_at='2000-01-01T00:00:00.000Z'"
  ).run();
  globalThis.fetch = async function () {
    throw new Error("network error containing secret and U-customer");
  };
  try {
    await dispatchQueuedLineNotifications(x.env, 20);
  } finally {
    globalThis.fetch = originalFetch;
  }
  var network = x.db.prepare(
    "SELECT error_code, error_message FROM notifications"
  ).get();
  assert.equal(network.error_code, "line_network_error");
  assert.equal(network.error_message, "LINE API network request failed");
});

test("每筆預約最多三張，正式成立後不可再要求或補件", async function () {
  var x = setup();
  for (var i = 0; i < 3; i++) {
    await uploadCustomerBookingReviewPhoto(x.env, "b", "U-customer", jpeg(), "image/jpeg");
  }
  await assert.rejects(
    uploadCustomerBookingReviewPhoto(x.env, "b", "U-customer", jpeg(), "image/jpeg"),
    /最多上傳 3 張/
  );
  x.db.prepare("UPDATE bookings SET status = 'confirmed' WHERE id = 'b'").run();
  await assert.rejects(
    requestOwnerBookingReviewPhoto(x.env, "b", {
      photoRequested: true, photoRequestNote: "照片"
    }),
    /不接受補件/
  );
  await assert.rejects(
    updateCustomerBookingReview(x.env, "b", "U-customer", {}),
    /不接受補充/
  );
});
