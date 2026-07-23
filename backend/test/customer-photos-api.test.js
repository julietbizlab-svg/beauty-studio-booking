/**
 * 客戶前後對比照片 API 整合測試（node:test ＋ assert，零依賴）
 *
 * 直接呼叫 index.js 的 fetch handler，搭配 Fake D1 與最小 Fake R2
 * （put／get／delete，不連任何真實 R2 或外部服務）。
 *
 * 驗證重點：
 * - owner auth（401／403）、Notion fail closed 501、tenant scoped
 * - magic bytes：JPEG／PNG／WebP 成功；SVG／GIF／HTML／PDF／HEIC／
 *   未知 binary 拒絕；MIME 與 magic bytes 不符拒絕；超過 5 MB 拒絕
 * - D1／audit 不含 binary、base64、原始檔名；audit／DTO 不含 object key
 * - R2 key 為不可猜測 UUID、不含個資
 * - 一致性：R2 put 失敗 D1 零寫入；D1 失敗補償刪新物件；
 *   取代成功後才刪舊物件；刪除冪等；R2 delete 失敗可重試
 * - content GET：owner auth、正確 private key、Content-Type、
 *   nosniff＋private,no-store、找不到物件 fail closed 不洩漏 key
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

var TENANT = "tenant-photo-001";
var STAFF = "staff-photo-001";
var API = "https://example.com";

var OWNER_TOKEN = "token-owner";
var STRANGER_TOKEN = "token-stranger";

var TOKEN_SUBS = {};
TOKEN_SUBS[OWNER_TOKEN] = "U-owner-1";
TOKEN_SUBS[STRANGER_TOKEN] = "U-stranger";

// 攔截 LINE verify endpoint；其他外部連線一律拒絕
globalThis.fetch = async function (url, options) {
  if (String(url) === "https://api.line.me/oauth2/v2.1/verify") {
    var body = String((options && options.body) || "");
    var match = body.match(/id_token=([^&]*)/);
    var token = decodeURIComponent((match && match[1]) || "");
    var sub = TOKEN_SUBS[token];
    if (!sub) {
      return new Response(
        JSON.stringify({ error_description: "invalid token" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response(
      JSON.stringify({ sub: sub, name: "測試", picture: "" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
  throw new Error("測試不允許未預期的外部連線：" + url);
};

/** 最小 Fake D1（可注入查詢 handler 與 batch 失敗） */
function makeFakeDb(handler, batchHandler) {
  var db = {
    calls: [],
    batches: [],
    prepare: function (sql) {
      return {
        bind: function () {
          var binds = Array.prototype.slice.call(arguments);
          return {
            sql: sql,
            binds: binds,
            all: async function () {
              db.calls.push({ sql: sql, binds: binds, method: "all" });
              return { results: (handler ? handler(sql, binds, "all") : []) || [] };
            },
            first: async function () {
              db.calls.push({ sql: sql, binds: binds, method: "first" });
              return handler ? handler(sql, binds, "first") : null;
            },
            run: async function () {
              db.calls.push({ sql: sql, binds: binds, method: "run" });
              return (handler ? handler(sql, binds, "run") : null) || { meta: { changes: 1 } };
            }
          };
        }
      };
    },
    batch: async function (statements) {
      db.batches.push(statements);
      statements.forEach(function (s) {
        db.calls.push({ sql: s.sql, binds: s.binds, method: "batch" });
      });
      if (batchHandler) {
        return batchHandler(statements);
      }
      return statements.map(function () { return { meta: { changes: 1 } }; });
    }
  };
  return db;
}

/** 最小 Fake R2：put／get／delete，可注入失敗，不連任何外部服務 */
function makeFakeR2() {
  var r2 = {
    store: {},
    puts: [],
    gets: [],
    deletes: [],
    failPut: false,
    failDeleteKeys: [],
    put: async function (key, bytes, options) {
      r2.puts.push({ key: key, size: bytes.length });
      if (r2.failPut) {
        throw new Error("fake r2 put failure");
      }
      r2.store[key] = {
        bytes: bytes,
        contentType: options && options.httpMetadata && options.httpMetadata.contentType
      };
    },
    get: async function (key) {
      r2.gets.push(key);
      if (!(key in r2.store)) return null;
      return { body: r2.store[key].bytes };
    },
    delete: async function (key) {
      r2.deletes.push(key);
      if (r2.failDeleteKeys.indexOf(key) !== -1) {
        throw new Error("fake r2 delete failure");
      }
      delete r2.store[key];
    }
  };
  return r2;
}

function makeD1Env(db, r2) {
  return {
    DATA_BACKEND: "d1",
    DB: db,
    PHOTO_BUCKET: r2 || makeFakeR2(),
    TENANT_ID: TENANT,
    LOCATION_ID: "location-photo-001",
    STAFF_ID: STAFF,
    LIFF_CHANNEL_ID: "liff-channel-test",
    OWNER_LINE_USER_IDS: "U-owner-1"
  };
}

function makeNotionEnv() {
  return {
    DATA_BACKEND: "notion",
    NOTION_TOKEN: "notion-secret",
    NOTION_DATABASE_SERVICES: "db-services",
    NOTION_DATABASE_SLOTS: "db-slots",
    NOTION_DATABASE_BOOKINGS: "db-bookings",
    NOTION_DATABASE_SETTINGS: "db-settings",
    LIFF_CHANNEL_ID: "liff-channel-test",
    OWNER_LINE_USER_IDS: "U-owner-1"
  };
}

function jsonRequest(method, path, body, token) {
  var headers = { "Content-Type": "application/json" };
  if (token) {
    headers.Authorization = "Bearer " + token;
  }
  return new Request(API + path, {
    method: method,
    headers: headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
}

function binaryRequest(path, bytes, contentType, token) {
  var headers = {};
  if (contentType) headers["Content-Type"] = contentType;
  if (token) headers.Authorization = "Bearer " + token;
  return new Request(API + path, {
    method: "PUT",
    headers: headers,
    body: bytes
  });
}

var SETS_PATH = "/api/owner/customers/by-id/cust-1/photo-sets";
var UPLOAD_PATH = SETS_PATH + "/set-1/photos/before";
var CONTENT_PATH = "/api/owner/customers/by-id/cust-1/photos/photo-1/content";
var PHOTO_PATH = "/api/owner/customers/by-id/cust-1/photos/photo-1";

// ── 測試用假圖 bytes（純 header，非真實照片） ──

function jpegBytes(size) {
  var b = new Uint8Array(Math.max(size || 64, 4));
  b[0] = 0xff; b[1] = 0xd8; b[2] = 0xff; b[3] = 0xe0;
  return b;
}

function pngBytes() {
  var b = new Uint8Array(32);
  [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].forEach(function (v, i) { b[i] = v; });
  return b;
}

function webpBytes() {
  var b = new Uint8Array(32);
  [0x52, 0x49, 0x46, 0x46].forEach(function (v, i) { b[i] = v; });
  [0x57, 0x45, 0x42, 0x50].forEach(function (v, i) { b[8 + i] = v; });
  return b;
}

function gifBytes() {
  return new TextEncoder().encode("GIF89a\u0000\u0000\u0000\u0000");
}

function heicBytes() {
  var b = new Uint8Array(24);
  var tag = new TextEncoder().encode("ftypheic");
  tag.forEach(function (v, i) { b[4 + i] = v; });
  return b;
}

function textBytes(text) {
  return new TextEncoder().encode(text);
}

function activeSetRow() {
  return {
    id: "set-1",
    booking_id: null,
    title: "臉部護理",
    captured_at: "2026-07-01",
    created_at: "2026-07-01T00:00:00.000Z"
  };
}

/**
 * 通用查詢 handler 工廠：
 * data = { staff, customer, set, setForDelete, booking, oldPhoto,
 *          photoContentRow, photoDeleteRow, sets, photosList, photosInSet }
 */
function makeHandler(data) {
  return function (sql, binds, method) {
    if (method === "all") {
      if (/SELECT object_key FROM customer_photos/.test(sql)) {
        return data.softDeletedPhotos || [];
      }
      if (/SELECT id, object_key FROM customer_photos/.test(sql)) {
        return data.photosInSet || [];
      }
      if (/FROM customer_photo_sets/.test(sql)) {
        return data.sets || [];
      }
      if (/FROM customer_photos/.test(sql)) {
        return data.photosList || [];
      }
      return [];
    }
    if (method !== "first") {
      return null;
    }
    if (/FROM staff/.test(sql)) {
      return data.staff !== undefined ? data.staff : { id: STAFF };
    }
    if (/FROM customers/.test(sql)) {
      return data.customer !== undefined ? data.customer : { id: "cust-1" };
    }
    if (/SELECT id, deleted_at FROM customer_photo_sets/.test(sql)) {
      return data.setForDelete !== undefined ? data.setForDelete : null;
    }
    if (/FROM customer_photo_sets/.test(sql)) {
      return data.set !== undefined ? data.set : null;
    }
    if (/FROM bookings/.test(sql)) {
      return data.booking !== undefined ? data.booking : null;
    }
    if (/SELECT id, object_key, mime_type, byte_size FROM customer_photos/.test(sql)) {
      return data.photoContentRow !== undefined ? data.photoContentRow : null;
    }
    if (/SELECT id, object_key, deleted_at FROM customer_photos/.test(sql)) {
      return data.photoDeleteRow !== undefined ? data.photoDeleteRow : null;
    }
    if (/SELECT id, object_key FROM customer_photos/.test(sql)) {
      return data.oldPhoto !== undefined ? data.oldPhoto : null;
    }
    return null;
  };
}

// ─────────────────── auth 與 fail closed ───────────────────

test("photo API：缺 token 401、非 owner 403，未授權零寫入", async function () {
  var db = makeFakeDb(makeHandler({ set: activeSetRow() }));
  var r2 = makeFakeR2();
  var env = makeD1Env(db, r2);

  var attempts = [
    jsonRequest("GET", SETS_PATH),
    jsonRequest("POST", SETS_PATH, {}),
    jsonRequest("PATCH", SETS_PATH + "/set-1", {}),
    jsonRequest("DELETE", SETS_PATH + "/set-1"),
    binaryRequest(UPLOAD_PATH, jpegBytes(), "image/jpeg"),
    jsonRequest("GET", CONTENT_PATH),
    jsonRequest("DELETE", PHOTO_PATH)
  ];
  for (var i = 0; i < attempts.length; i++) {
    var response = await worker.fetch(attempts[i], env);
    assert.equal(response.status, 401, "第 " + i + " 個請求缺 token 必須 401");
  }

  var strangers = [
    jsonRequest("GET", SETS_PATH, undefined, STRANGER_TOKEN),
    binaryRequest(UPLOAD_PATH, jpegBytes(), "image/jpeg", STRANGER_TOKEN),
    jsonRequest("GET", CONTENT_PATH, undefined, STRANGER_TOKEN),
    jsonRequest("DELETE", PHOTO_PATH, undefined, STRANGER_TOKEN)
  ];
  for (var j = 0; j < strangers.length; j++) {
    var strangerResponse = await worker.fetch(strangers[j], env);
    assert.equal(strangerResponse.status, 403, "第 " + j + " 個請求非 owner 必須 403");
  }

  assert.equal(db.batches.length, 0, "未授權請求不得寫入 D1");
  assert.equal(r2.puts.length, 0, "未授權請求不得寫入 R2");
});

test("photo API：Notion 模式 fail closed 501", async function () {
  var env = makeNotionEnv();
  var attempts = [
    jsonRequest("GET", SETS_PATH, undefined, OWNER_TOKEN),
    jsonRequest("POST", SETS_PATH, {}, OWNER_TOKEN),
    binaryRequest(UPLOAD_PATH, jpegBytes(), "image/jpeg", OWNER_TOKEN),
    jsonRequest("GET", CONTENT_PATH, undefined, OWNER_TOKEN),
    jsonRequest("DELETE", PHOTO_PATH, undefined, OWNER_TOKEN)
  ];
  for (var i = 0; i < attempts.length; i++) {
    var response = await worker.fetch(attempts[i], env);
    assert.equal(response.status, 501, "第 " + i + " 個請求 Notion 模式必須 501");
  }
});

test("photo API：deleted／不存在客戶回 404；SQL 全部 tenant scoped", async function () {
  var db = makeFakeDb(makeHandler({ customer: null, set: activeSetRow() }));
  var r2 = makeFakeR2();
  var env = makeD1Env(db, r2);

  var listResponse = await worker.fetch(
    jsonRequest("GET", SETS_PATH, undefined, OWNER_TOKEN), env
  );
  assert.equal(listResponse.status, 404);

  var uploadResponse = await worker.fetch(
    binaryRequest(UPLOAD_PATH, jpegBytes(), "image/jpeg", OWNER_TOKEN), env
  );
  assert.equal(uploadResponse.status, 404);
  assert.equal(r2.puts.length, 0, "客戶不存在不得寫入 R2");
  assert.equal(db.batches.length, 0);

  db.calls.forEach(function (call) {
    if (/customer_photo|customer_photos|customers|bookings/.test(call.sql)) {
      assert.ok(call.binds.indexOf(TENANT) !== -1,
        "SQL 必須綁定 tenant：" + call.sql.slice(0, 60));
    }
  });
});

test("photo set：setId 不屬於此 customer 時 404", async function () {
  var db = makeFakeDb(makeHandler({ set: null }));
  var env = makeD1Env(db);
  var response = await worker.fetch(
    binaryRequest(UPLOAD_PATH, jpegBytes(), "image/jpeg", OWNER_TOKEN), env
  );
  assert.equal(response.status, 404);
  var body = await response.json();
  assert.ok(String(body.message).indexOf("customer-photos/") === -1);
});

test("photo set：bookingId 不屬同 tenant 同 customer 時拒絕", async function () {
  var db = makeFakeDb(makeHandler({ booking: null }));
  var env = makeD1Env(db);
  var response = await worker.fetch(
    jsonRequest("POST", SETS_PATH, { bookingId: "bk-other" }, OWNER_TOKEN), env
  );
  assert.equal(response.status, 400);
  assert.equal(db.batches.length, 0, "驗證失敗不得寫入");

  var okDb = makeFakeDb(makeHandler({ booking: { id: "bk-1" } }));
  var okResponse = await worker.fetch(
    jsonRequest("POST", SETS_PATH, { bookingId: "bk-1", title: "術後" }, OWNER_TOKEN),
    makeD1Env(okDb)
  );
  assert.equal(okResponse.status, 200);
  assert.equal(okDb.batches.length, 1, "建立照片組（含 audit）應為單一 batch");
});

// ─────────────────── 上傳格式安全 ───────────────────

test("上傳：JPEG／PNG／WebP magic bytes 驗證成功", async function () {
  var cases = [
    { bytes: jpegBytes(), type: "image/jpeg" },
    { bytes: pngBytes(), type: "image/png" },
    { bytes: webpBytes(), type: "image/webp" }
  ];
  for (var i = 0; i < cases.length; i++) {
    var db = makeFakeDb(makeHandler({ set: activeSetRow() }));
    var r2 = makeFakeR2();
    var response = await worker.fetch(
      binaryRequest(UPLOAD_PATH, cases[i].bytes, cases[i].type, OWNER_TOKEN),
      makeD1Env(db, r2)
    );
    assert.equal(response.status, 200, cases[i].type + " 應上傳成功");
    var body = await response.json();
    assert.equal(body.photo.mimeType, cases[i].type);
    assert.equal(r2.puts.length, 1);
    assert.equal(db.batches.length, 1, "metadata＋audit 應為同一 batch");
  }
});

test("上傳：SVG／GIF／HTML／PDF／HEIC／未知 binary 一律拒絕且零寫入", async function () {
  var cases = [
    { bytes: textBytes("<svg xmlns='http://www.w3.org/2000/svg'></svg>"), type: "image/svg+xml" },
    { bytes: gifBytes(), type: "image/gif" },
    { bytes: textBytes("<!DOCTYPE html><script>alert(1)</script>"), type: "text/html" },
    { bytes: textBytes("%PDF-1.7 fake"), type: "application/pdf" },
    { bytes: heicBytes(), type: "image/heic" },
    { bytes: Uint8Array.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]), type: "application/octet-stream" },
    // 惡意宣告安全 MIME 但內容不是圖片
    { bytes: textBytes("<script>alert(1)</script>"), type: "image/jpeg" }
  ];
  for (var i = 0; i < cases.length; i++) {
    var db = makeFakeDb(makeHandler({ set: activeSetRow() }));
    var r2 = makeFakeR2();
    var response = await worker.fetch(
      binaryRequest(UPLOAD_PATH, cases[i].bytes, cases[i].type, OWNER_TOKEN),
      makeD1Env(db, r2)
    );
    assert.equal(response.status, 415, cases[i].type + " 必須被拒絕");
    assert.equal(r2.puts.length, 0, cases[i].type + " 不得寫入 R2");
    assert.equal(db.batches.length, 0, cases[i].type + " 不得寫入 D1");
  }
});

test("上傳：MIME 與 magic bytes 不一致時拒絕", async function () {
  var db = makeFakeDb(makeHandler({ set: activeSetRow() }));
  var r2 = makeFakeR2();
  var response = await worker.fetch(
    binaryRequest(UPLOAD_PATH, pngBytes(), "image/jpeg", OWNER_TOKEN),
    makeD1Env(db, r2)
  );
  assert.equal(response.status, 415);
  assert.equal(r2.puts.length, 0);
  assert.equal(db.batches.length, 0);
});

test("上傳：超過 5 MB 硬上限拒絕", async function () {
  var db = makeFakeDb(makeHandler({ set: activeSetRow() }));
  var r2 = makeFakeR2();
  var response = await worker.fetch(
    binaryRequest(UPLOAD_PATH, jpegBytes(5 * 1024 * 1024 + 1), "image/jpeg", OWNER_TOKEN),
    makeD1Env(db, r2)
  );
  assert.equal(response.status, 413);
  assert.equal(r2.puts.length, 0);
  assert.equal(db.batches.length, 0);
});

test("上傳：Content-Length 已超限時不讀取完整 body 即回 413", async function () {
  var db = makeFakeDb(makeHandler({ set: activeSetRow() }));
  var r2 = makeFakeR2();
  var request = binaryRequest(UPLOAD_PATH, jpegBytes(), "image/jpeg", OWNER_TOKEN);
  request.headers.set("Content-Length", String(5 * 1024 * 1024 + 1));

  var response = await worker.fetch(request, makeD1Env(db, r2));

  assert.equal(response.status, 413);
  assert.equal(r2.puts.length, 0);
  assert.equal(db.batches.length, 0);
});

test("上傳：kind 只能 before／after", async function () {
  var db = makeFakeDb(makeHandler({ set: activeSetRow() }));
  var response = await worker.fetch(
    binaryRequest(SETS_PATH + "/set-1/photos/side", jpegBytes(), "image/jpeg", OWNER_TOKEN),
    makeD1Env(db)
  );
  assert.equal(response.status, 400);
});

// ─────────────────── key／DTO／audit 安全 ───────────────────

test("上傳成功：R2 key 為不可猜測 UUID 且不含個資；DTO／audit 不含 object key", async function () {
  var db = makeFakeDb(makeHandler({ set: activeSetRow() }));
  var r2 = makeFakeR2();
  var response = await worker.fetch(
    binaryRequest(UPLOAD_PATH + "?width=1200&height=900", jpegBytes(), "image/jpeg", OWNER_TOKEN),
    makeD1Env(db, r2)
  );
  assert.equal(response.status, 200);

  var key = r2.puts[0].key;
  assert.match(key, new RegExp(
    "^customer-photos/" + TENANT + "/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
  ), "object key 必須是 tenant + UUID，不含個資或原始檔名");

  var body = await response.json();
  var bodyText = JSON.stringify(body);
  assert.ok(bodyText.indexOf(key) === -1, "DTO 不得含 object key");
  assert.ok(bodyText.indexOf("object_key") === -1 && bodyText.indexOf("objectKey") === -1);
  assert.equal(body.photo.width, 1200);
  assert.equal(body.photo.height, 900);
  assert.ok(body.photo.contentPath.indexOf("/photos/") !== -1,
    "DTO 應提供 authenticated content endpoint");

  // audit metadata 不含 object key／binary／base64
  var auditCalls = db.calls.filter(function (call) {
    return /INSERT INTO audit_logs/.test(call.sql);
  });
  assert.equal(auditCalls.length, 1);
  var metadataJson = auditCalls[0].binds[6];
  assert.ok(metadataJson.indexOf("customer-photos/") === -1, "audit 不得含 object key");
  assert.ok(metadataJson.indexOf("base64") === -1);

  // D1 寫入不含 binary／base64／原始檔名
  db.calls.forEach(function (call) {
    call.binds.forEach(function (bindValue) {
      assert.ok(!(bindValue instanceof Uint8Array), "D1 bind 不得含 binary");
      if (typeof bindValue === "string") {
        assert.ok(bindValue.indexOf("data:image") === -1, "D1 bind 不得含 base64 圖片");
      }
    });
  });
});

// ─────────────────── D1／R2 一致性 ───────────────────

test("一致性：R2 put 失敗時 D1 零寫入", async function () {
  var db = makeFakeDb(makeHandler({ set: activeSetRow() }));
  var r2 = makeFakeR2();
  r2.failPut = true;
  var response = await worker.fetch(
    binaryRequest(UPLOAD_PATH, jpegBytes(), "image/jpeg", OWNER_TOKEN),
    makeD1Env(db, r2)
  );
  assert.equal(response.status, 500);
  assert.equal(db.batches.length, 0, "R2 put 失敗後 D1 不得寫入");
  var body = await response.json();
  assert.ok(String(body.message).indexOf("customer-photos/") === -1, "錯誤不得洩漏 key");
});

test("一致性：D1 batch 失敗時補償刪除剛寫入的 R2 object", async function () {
  var db = makeFakeDb(makeHandler({ set: activeSetRow() }), function () {
    throw new Error("fake d1 batch failure");
  });
  var r2 = makeFakeR2();
  var response = await worker.fetch(
    binaryRequest(UPLOAD_PATH, jpegBytes(), "image/jpeg", OWNER_TOKEN),
    makeD1Env(db, r2)
  );
  assert.equal(response.status, 500);
  assert.equal(r2.puts.length, 1);
  assert.deepEqual(r2.deletes, [r2.puts[0].key], "必須補償刪除新 R2 object");
  assert.equal(Object.keys(r2.store).length, 0, "不得留下孤兒物件");
});

test("一致性：取代照片時 metadata 成功後才刪舊 R2 object", async function () {
  var oldKey = "customer-photos/" + TENANT + "/old-uuid";
  var db = makeFakeDb(makeHandler({
    set: activeSetRow(),
    oldPhoto: { id: "photo-old", object_key: oldKey }
  }));
  var r2 = makeFakeR2();
  r2.store[oldKey] = { bytes: jpegBytes() };

  var response = await worker.fetch(
    binaryRequest(UPLOAD_PATH, jpegBytes(), "image/jpeg", OWNER_TOKEN),
    makeD1Env(db, r2)
  );
  assert.equal(response.status, 200);
  var body = await response.json();
  assert.equal(body.replaced, true);
  assert.equal(body.cleanupPending, false);

  assert.equal(db.batches.length, 1);
  var batchSql = db.batches[0].map(function (s) { return s.sql; }).join("\n");
  assert.ok(/UPDATE customer_photos SET deleted_at/.test(batchSql), "舊照必須在同 batch 軟刪");
  assert.ok(/INSERT INTO customer_photos/.test(batchSql));
  assert.ok(/INSERT INTO audit_logs/.test(batchSql));
  assert.deepEqual(r2.deletes, [oldKey], "只刪舊物件，且在 D1 成功之後");
});

test("一致性：舊 R2 object 刪除失敗不回退新照片，回報 cleanupPending", async function () {
  var oldKey = "customer-photos/" + TENANT + "/old-uuid-fail";
  var db = makeFakeDb(makeHandler({
    set: activeSetRow(),
    oldPhoto: { id: "photo-old", object_key: oldKey }
  }));
  var r2 = makeFakeR2();
  r2.failDeleteKeys = [oldKey];

  var response = await worker.fetch(
    binaryRequest(UPLOAD_PATH, jpegBytes(), "image/jpeg", OWNER_TOKEN),
    makeD1Env(db, r2)
  );
  assert.equal(response.status, 200);
  var body = await response.json();
  assert.equal(body.ok, true, "新照片狀態不得回退");
  assert.equal(body.cleanupPending, true, "必須回報可重試清理");
  var bodyText = JSON.stringify(body);
  assert.ok(bodyText.indexOf(oldKey) === -1, "回應不得洩漏 key");
});

// ─────────────────── 刪除照片／照片組 ───────────────────

test("刪除照片：D1 軟刪＋audit 同 batch，成功後刪 R2；冪等重試", async function () {
  var key = "customer-photos/" + TENANT + "/del-uuid";
  var db = makeFakeDb(makeHandler({
    photoDeleteRow: { id: "photo-1", object_key: key, deleted_at: null }
  }));
  var r2 = makeFakeR2();
  r2.store[key] = { bytes: jpegBytes() };

  var response = await worker.fetch(
    jsonRequest("DELETE", PHOTO_PATH, undefined, OWNER_TOKEN), makeD1Env(db, r2)
  );
  assert.equal(response.status, 200);
  var body = await response.json();
  assert.equal(body.deleted, true);
  assert.equal(db.batches.length, 1);
  var batchSql = db.batches[0].map(function (s) { return s.sql; }).join("\n");
  assert.ok(/UPDATE customer_photos SET deleted_at/.test(batchSql));
  assert.ok(/INSERT INTO audit_logs/.test(batchSql));
  assert.deepEqual(r2.deletes, [key]);

  // 已軟刪列的重複刪除：冪等，不再寫 D1，但重試 R2 清理
  var db2 = makeFakeDb(makeHandler({
    photoDeleteRow: { id: "photo-1", object_key: key, deleted_at: "2026-07-19T00:00:00.000Z" }
  }));
  var r2b = makeFakeR2();
  var again = await worker.fetch(
    jsonRequest("DELETE", PHOTO_PATH, undefined, OWNER_TOKEN), makeD1Env(db2, r2b)
  );
  assert.equal(again.status, 200);
  var againBody = await again.json();
  assert.equal(againBody.deleted, false, "重複刪除必須冪等");
  assert.equal(db2.batches.length, 0, "冪等重試不得再寫 D1");
  assert.deepEqual(r2b.deletes, [key], "冪等重試仍會重試 R2 清理");
});

test("刪除照片：R2 delete 失敗時 D1 保持已刪，回報 cleanupPending 可重試", async function () {
  var key = "customer-photos/" + TENANT + "/del-fail-uuid";
  var db = makeFakeDb(makeHandler({
    photoDeleteRow: { id: "photo-1", object_key: key, deleted_at: null }
  }));
  var r2 = makeFakeR2();
  r2.failDeleteKeys = [key];

  var response = await worker.fetch(
    jsonRequest("DELETE", PHOTO_PATH, undefined, OWNER_TOKEN), makeD1Env(db, r2)
  );
  assert.equal(response.status, 200);
  var body = await response.json();
  assert.equal(body.deleted, true);
  assert.equal(body.cleanupPending, true);
  assert.equal(db.batches.length, 1, "D1 軟刪不得回退（object_key 留在軟刪列可追蹤）");
  assert.ok(JSON.stringify(body).indexOf(key) === -1, "回應不得洩漏 key");
});

test("刪除照片組：組內照片一併軟刪並清 R2；重複刪除冪等", async function () {
  var keyA = "customer-photos/" + TENANT + "/set-del-a";
  var keyB = "customer-photos/" + TENANT + "/set-del-b";
  var db = makeFakeDb(makeHandler({
    setForDelete: { id: "set-1", deleted_at: null },
    photosInSet: [
      { id: "photo-a", object_key: keyA },
      { id: "photo-b", object_key: keyB }
    ]
  }));
  var r2 = makeFakeR2();
  r2.store[keyA] = { bytes: jpegBytes() };
  r2.store[keyB] = { bytes: jpegBytes() };

  var response = await worker.fetch(
    jsonRequest("DELETE", SETS_PATH + "/set-1", undefined, OWNER_TOKEN),
    makeD1Env(db, r2)
  );
  assert.equal(response.status, 200);
  var body = await response.json();
  assert.equal(body.deleted, true);
  assert.deepEqual(r2.deletes.slice().sort(), [keyA, keyB].sort());
  assert.equal(db.batches.length, 1, "組＋照片軟刪＋audit 必須同一 batch");

  var db2 = makeFakeDb(makeHandler({
    setForDelete: { id: "set-1", deleted_at: "2026-07-19T00:00:00.000Z" }
  }));
  var again = await worker.fetch(
    jsonRequest("DELETE", SETS_PATH + "/set-1", undefined, OWNER_TOKEN),
    makeD1Env(db2)
  );
  assert.equal(again.status, 200);
  var againBody = await again.json();
  assert.equal(againBody.deleted, false, "重複刪除照片組必須冪等");
  assert.equal(db2.batches.length, 0);
});

test("刪除照片組：R2 失敗後可重試清理，重試成功回 cleanupPending:false", async function () {
  var keyA = "customer-photos/" + TENANT + "/retry-a";
  var keyB = "customer-photos/" + TENANT + "/retry-b";

  // 第一次刪除：keyB 的 R2 delete 失敗 → cleanupPending:true
  var db1 = makeFakeDb(makeHandler({
    setForDelete: { id: "set-1", deleted_at: null },
    photosInSet: [
      { id: "photo-a", object_key: keyA },
      { id: "photo-b", object_key: keyB }
    ]
  }));
  var r2 = makeFakeR2();
  r2.store[keyA] = { bytes: jpegBytes() };
  r2.store[keyB] = { bytes: jpegBytes() };
  r2.failDeleteKeys = [keyB];

  var first = await worker.fetch(
    jsonRequest("DELETE", SETS_PATH + "/set-1", undefined, OWNER_TOKEN),
    makeD1Env(db1, r2)
  );
  assert.equal(first.status, 200);
  var firstBody = await first.json();
  assert.equal(firstBody.deleted, true);
  assert.equal(firstBody.cleanupPending, true, "第一次 R2 失敗必須回報待清理");
  assert.ok(keyB in r2.store, "失敗的物件仍在 R2");

  // 第二次呼叫（set 已軟刪）：以軟刪列 object_key 重試相同物件
  var softDeletedHandler = makeHandler({
    setForDelete: { id: "set-1", deleted_at: "2026-07-19T00:00:00.000Z" },
    softDeletedPhotos: [{ object_key: keyA }, { object_key: keyB }]
  });

  // 第二次仍失敗 → cleanupPending:true
  var db2 = makeFakeDb(softDeletedHandler);
  var stillFailing = await worker.fetch(
    jsonRequest("DELETE", SETS_PATH + "/set-1", undefined, OWNER_TOKEN),
    makeD1Env(db2, r2)
  );
  assert.equal(stillFailing.status, 200);
  var stillFailingBody = await stillFailing.json();
  assert.equal(stillFailingBody.deleted, false);
  assert.equal(stillFailingBody.cleanupPending, true, "重試仍失敗必須回報待清理");
  assert.equal(db2.batches.length, 0, "重試清理不得再寫 D1／audit");
  assert.ok(r2.deletes.indexOf(keyB) !== -1, "必須重試相同物件");

  // 第三次（R2 恢復）→ 全部成功，cleanupPending:false
  r2.failDeleteKeys = [];
  var db3 = makeFakeDb(softDeletedHandler);
  var retryOk = await worker.fetch(
    jsonRequest("DELETE", SETS_PATH + "/set-1", undefined, OWNER_TOKEN),
    makeD1Env(db3, r2)
  );
  assert.equal(retryOk.status, 200);
  var retryOkBody = await retryOk.json();
  assert.equal(retryOkBody.deleted, false);
  assert.equal(retryOkBody.cleanupPending, false, "重試成功必須回報清理完成");
  assert.ok(!(keyB in r2.store), "重試後物件必須刪除");
  assert.equal(db3.batches.length, 0, "重試不得寫入 audit");

  // 重試查詢必須 tenant＋customer＋set scoped，且回應不洩漏 key
  var retryQuery = db3.calls.filter(function (call) {
    return /SELECT object_key FROM customer_photos/.test(call.sql);
  });
  assert.equal(retryQuery.length, 1);
  assert.deepEqual(retryQuery[0].binds, [TENANT, "cust-1", "set-1"],
    "重試查詢必須綁定 tenant＋customer＋set");
  assert.ok(JSON.stringify(retryOkBody).indexOf("customer-photos/") === -1,
    "重試回應不得洩漏 object key");
});

test("刪除照片組重試：不同 tenant／customer 無法利用重試路徑刪除物件", async function () {
  var key = "customer-photos/" + TENANT + "/other-tenant-key";
  // 客戶不屬於此 tenant（customer 查無）→ 404，R2 完全不動
  var db = makeFakeDb(makeHandler({
    customer: null,
    setForDelete: { id: "set-1", deleted_at: "2026-07-19T00:00:00.000Z" },
    softDeletedPhotos: [{ object_key: key }]
  }));
  var r2 = makeFakeR2();
  r2.store[key] = { bytes: jpegBytes() };

  var response = await worker.fetch(
    jsonRequest("DELETE", SETS_PATH + "/set-1", undefined, OWNER_TOKEN),
    makeD1Env(db, r2)
  );
  assert.equal(response.status, 404);
  assert.equal(r2.deletes.length, 0, "客戶不屬於 tenant 時不得刪除任何 R2 物件");
  assert.ok(key in r2.store);

  // set 不屬於此 customer（set 查無）→ 404，R2 不動
  var db2 = makeFakeDb(makeHandler({
    setForDelete: null,
    softDeletedPhotos: [{ object_key: key }]
  }));
  var r2b = makeFakeR2();
  r2b.store[key] = { bytes: jpegBytes() };
  var response2 = await worker.fetch(
    jsonRequest("DELETE", SETS_PATH + "/set-1", undefined, OWNER_TOKEN),
    makeD1Env(db2, r2b)
  );
  assert.equal(response2.status, 404);
  assert.equal(r2b.deletes.length, 0, "set 不屬於 customer 時不得刪除任何 R2 物件");
});

// ─────────────────── content GET ───────────────────

test("content GET：從正確 private key 串流，含 nosniff 與 private,no-store", async function () {
  var key = "customer-photos/" + TENANT + "/content-uuid";
  var db = makeFakeDb(makeHandler({
    photoContentRow: { id: "photo-1", object_key: key, mime_type: "image/webp", byte_size: 32 }
  }));
  var r2 = makeFakeR2();
  r2.store[key] = { bytes: webpBytes() };

  var response = await worker.fetch(
    jsonRequest("GET", CONTENT_PATH, undefined, OWNER_TOKEN), makeD1Env(db, r2)
  );
  assert.equal(response.status, 200);
  assert.deepEqual(r2.gets, [key], "必須從 D1 記錄的 private key 取物件");
  assert.equal(response.headers.get("Content-Type"), "image/webp");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");

  var buffer = new Uint8Array(await response.arrayBuffer());
  assert.deepEqual(buffer, webpBytes(), "回應內容應為 R2 物件");
});

test("content GET：D1 有記錄但 R2 找不到物件時 fail closed 404，不洩漏 key", async function () {
  var key = "customer-photos/" + TENANT + "/missing-uuid";
  var db = makeFakeDb(makeHandler({
    photoContentRow: { id: "photo-1", object_key: key, mime_type: "image/jpeg", byte_size: 10 }
  }));
  var r2 = makeFakeR2();

  var response = await worker.fetch(
    jsonRequest("GET", CONTENT_PATH, undefined, OWNER_TOKEN), makeD1Env(db, r2)
  );
  assert.equal(response.status, 404);
  var body = await response.json();
  assert.ok(JSON.stringify(body).indexOf(key) === -1, "404 不得洩漏 object key");
});

test("content GET：photoId 不屬於此 customer／tenant 時 404", async function () {
  var db = makeFakeDb(makeHandler({ photoContentRow: null }));
  var response = await worker.fetch(
    jsonRequest("GET", CONTENT_PATH, undefined, OWNER_TOKEN), makeD1Env(db)
  );
  assert.equal(response.status, 404);
});

// ─────────────────── 列表 DTO ───────────────────

test("photo-sets 列表：DTO 只含安全欄位，不含 object key", async function () {
  var db = makeFakeDb(makeHandler({
    sets: [activeSetRow()],
    photosList: [{
      id: "photo-1", photo_set_id: "set-1", kind: "before",
      mime_type: "image/jpeg", byte_size: 1234, width: 800, height: 600,
      created_at: "2026-07-02T00:00:00.000Z"
    }]
  }));
  var response = await worker.fetch(
    jsonRequest("GET", SETS_PATH, undefined, OWNER_TOKEN), makeD1Env(db)
  );
  assert.equal(response.status, 200);
  var body = await response.json();
  assert.equal(body.photoSets.length, 1);
  var photo = body.photoSets[0].before;
  assert.deepEqual(Object.keys(photo).sort(), [
    "byteSize", "contentPath", "createdAt", "height", "kind", "mimeType", "photoId", "width"
  ]);
  assert.equal(body.photoSets[0].after, null);
  var text = JSON.stringify(body);
  assert.ok(text.indexOf("object_key") === -1 && text.indexOf("objectKey") === -1);
  assert.ok(text.indexOf("customer-photos/") === -1);
});
