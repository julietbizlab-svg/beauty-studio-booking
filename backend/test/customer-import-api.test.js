/**
 * 客戶 CSV 匯入 preview／commit API 整合測試（node:test ＋ assert，零依賴）
 *
 * 直接呼叫 index.js 的 fetch handler，搭配 Fake D1 與假 LINE verify
 * endpoint。驗證重點：
 * - 兩支 API 的 owner auth（401／403）與 Notion fail closed 501
 * - preview 完全零寫入、DB 查重判定（willCreate／skipped／conflict）
 * - commit 的 hash 冪等、拆批上限、格式錯誤零寫入、單一 batch 交易、
 *   audit 不含個資、不碰 line_accounts
 * - 回應不含 canonicalString、完整電話或 LINE userId
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { buildImportPreview } from "../src/customer-import.js";

var TENANT = "tenant-import-001";
var LOCATION = "location-import-001";
var STAFF = "staff-import-001";
var API = "https://example.com";

var OWNER_TOKEN = "token-owner";
var STRANGER_TOKEN = "token-stranger";

var TOKEN_SUBS = {};
TOKEN_SUBS[OWNER_TOKEN] = "U-owner-1";
TOKEN_SUBS[STRANGER_TOKEN] = "U-stranger";

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

/** 最小 Fake D1（同 customer-auth.test.js 介面，支援 batch） */
function makeFakeDb(handler) {
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
      return statements.map(function () { return { meta: { changes: 1 } }; });
    }
  };
  return db;
}

/**
 * 匯入情境 handler：
 * options.staffRow（預設存在）、options.existingBatch、
 * options.phoneRows、options.customerNoRows
 */
function importHandler(options) {
  var opts = options || {};
  return function (sql, binds, method) {
    if (method === "first" && /FROM staff WHERE/.test(sql)) {
      return opts.staffRow !== undefined ? opts.staffRow : { id: STAFF };
    }
    if (method === "first" && /FROM customer_import_batches/.test(sql)) {
      return opts.existingBatch || null;
    }
    if (method === "all" && /REPLACE\(COALESCE\(c\.mobile/.test(sql)) {
      return opts.phoneRows || [];
    }
    if (method === "all" && /SELECT customer_no FROM customers/.test(sql)) {
      return opts.customerNoRows || [];
    }
    return null;
  };
}

function makeD1Env(db) {
  return {
    DATA_BACKEND: "d1",
    DB: db,
    TENANT_ID: TENANT,
    LOCATION_ID: LOCATION,
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

var PREVIEW_PATH = "/api/owner/customers/import/preview";
var COMMIT_PATH = "/api/owner/customers/import/commit";

var BASIC_CSV = "姓名,電話,生日,備註,會員編號\n王小美,0912345678,1990-01-01,VIP客,A001\n";

async function hashOf(csvText, mapping) {
  var preview = await buildImportPreview(csvText, mapping);
  return preview.canonicalHash;
}

function findBatchStatements(db, pattern) {
  return db.calls.filter(function (call) {
    return call.method === "batch" && pattern.test(call.sql);
  });
}

// ── 授權與 fail closed ───────────────────────────────────────

test("preview／commit 缺 token 回 401 且零 SQL", async function () {
  var paths = [PREVIEW_PATH, COMMIT_PATH];
  for (var i = 0; i < paths.length; i++) {
    var db = makeFakeDb(importHandler());
    var response = await worker.fetch(
      jsonRequest("POST", paths[i], { csvText: BASIC_CSV }),
      makeD1Env(db)
    );
    assert.equal(response.status, 401, paths[i] + " 缺 token 應回 401");
    assert.equal(db.calls.length, 0, paths[i] + " 不得觸發 SQL");
  }
});

test("preview／commit 非 owner 回 403 且零 SQL", async function () {
  var paths = [PREVIEW_PATH, COMMIT_PATH];
  for (var i = 0; i < paths.length; i++) {
    var db = makeFakeDb(importHandler());
    var response = await worker.fetch(
      jsonRequest("POST", paths[i], { csvText: BASIC_CSV }, STRANGER_TOKEN),
      makeD1Env(db)
    );
    assert.equal(response.status, 403, paths[i] + " 非 owner 應回 403");
    assert.equal(db.calls.length, 0);
  }
});

test("Notion 模式：preview／commit fail closed 回 501", async function () {
  var paths = [PREVIEW_PATH, COMMIT_PATH];
  for (var i = 0; i < paths.length; i++) {
    var response = await worker.fetch(
      jsonRequest("POST", paths[i], {
        csvText: BASIC_CSV,
        canonicalHash: "a".repeat(64)
      }, OWNER_TOKEN),
      makeNotionEnv()
    );
    assert.equal(response.status, 501, paths[i] + " Notion 應回 501");
    var body = await response.json();
    assert.match(body.message, /不支援/);
  }
});

// ── Preview ──────────────────────────────────────────────────

test("preview 完全零寫入：只有 SELECT，無 run／batch", async function () {
  var db = makeFakeDb(importHandler());
  var response = await worker.fetch(
    jsonRequest("POST", PREVIEW_PATH, { csvText: BASIC_CSV }, OWNER_TOKEN),
    makeD1Env(db)
  );

  assert.equal(response.status, 200);
  assert.equal(db.batches.length, 0, "preview 不得使用 batch");
  db.calls.forEach(function (call) {
    assert.equal(call.method, "all", "preview 只允許 SELECT all");
    assert.ok(!/INSERT|UPDATE|DELETE/i.test(call.sql), "preview 不得寫入");
  });
});

test("preview：DB 無相同 phone／customer_no → willCreate", async function () {
  var db = makeFakeDb(importHandler());
  var response = await worker.fetch(
    jsonRequest("POST", PREVIEW_PATH, { csvText: BASIC_CSV }, OWNER_TOKEN),
    makeD1Env(db)
  );

  var body = await response.json();
  assert.equal(body.ok, true);
  assert.deepEqual(body.summary, {
    total: 1, willCreate: 1, skipped: 0, conflicts: 0, errors: 0, warnings: 0
  });
  assert.equal(body.rows[0].outcome, "willCreate");
  assert.match(body.canonicalHash, /^[0-9a-f]{64}$/);
});

test("preview：同 phone 同姓名未綁 LINE → skipped", async function () {
  var db = makeFakeDb(importHandler({
    phoneRows: [{ mobile: "+886 912-345-678", display_name: "王小美", has_line: 0 }]
  }));
  var response = await worker.fetch(
    jsonRequest("POST", PREVIEW_PATH, { csvText: BASIC_CSV }, OWNER_TOKEN),
    makeD1Env(db)
  );

  var body = await response.json();
  assert.equal(body.rows[0].outcome, "skipped");
  assert.equal(body.summary.skipped, 1);
});

test("preview：同 phone 不同姓名 → conflict，且不透露既有客戶姓名", async function () {
  var db = makeFakeDb(importHandler({
    phoneRows: [{ mobile: "0912-345-678", display_name: "另一位客戶", has_line: 0 }]
  }));
  var response = await worker.fetch(
    jsonRequest("POST", PREVIEW_PATH, { csvText: BASIC_CSV }, OWNER_TOKEN),
    makeD1Env(db)
  );

  var text = await response.text();
  var body = JSON.parse(text);
  assert.equal(body.rows[0].outcome, "conflict");
  assert.equal(body.summary.conflicts, 1);
  assert.ok(!text.includes("另一位客戶"), "conflict 訊息不得透露既有客戶姓名");
});

test("preview：同 phone 已綁 LINE → conflict，且不透露 LINE 身分", async function () {
  var db = makeFakeDb(importHandler({
    phoneRows: [{ mobile: "0912345678", display_name: "王小美", has_line: 1 }]
  }));
  var response = await worker.fetch(
    jsonRequest("POST", PREVIEW_PATH, { csvText: BASIC_CSV }, OWNER_TOKEN),
    makeD1Env(db)
  );

  var text = await response.text();
  var body = JSON.parse(text);
  assert.equal(body.rows[0].outcome, "conflict");
  assert.ok(/LINE/.test(body.rows[0].conflicts[0]), "應說明已綁定 LINE");
  assert.ok(!/U-/.test(text), "不得洩漏任何 LINE userId");
});

test("preview：customer_no 已存在 → conflict", async function () {
  var db = makeFakeDb(importHandler({
    customerNoRows: [{ customer_no: "A001" }]
  }));
  var response = await worker.fetch(
    jsonRequest("POST", PREVIEW_PATH, { csvText: BASIC_CSV }, OWNER_TOKEN),
    makeD1Env(db)
  );

  var body = await response.json();
  assert.equal(body.rows[0].outcome, "conflict");
  assert.ok(body.rows[0].conflicts.some(function (c) { return /A001/.test(c); }));
});

test("preview：phone 空白且 customer_no 未提供 → willCreate", async function () {
  var db = makeFakeDb(importHandler());
  var response = await worker.fetch(
    jsonRequest("POST", PREVIEW_PATH, {
      csvText: "姓名,電話\n王小美,\n"
    }, OWNER_TOKEN),
    makeD1Env(db)
  );

  var body = await response.json();
  assert.equal(body.rows[0].outcome, "willCreate");
  assert.equal(body.summary.warnings, 1, "空電話帶 warning");
  // 空電話不得產生 phone 查詢
  db.calls.forEach(function (call) {
    assert.ok(!/REPLACE\(COALESCE\(c\.mobile/.test(call.sql), "無電話不查 phone");
  });
});

test("preview：姓名永不作 DB 查詢鍵，所有查詢 tenant scoped＋bind", async function () {
  var db = makeFakeDb(importHandler());
  await worker.fetch(
    jsonRequest("POST", PREVIEW_PATH, { csvText: BASIC_CSV }, OWNER_TOKEN),
    makeD1Env(db)
  );

  assert.ok(db.calls.length >= 2, "應查 phone 與 customer_no");
  db.calls.forEach(function (call) {
    assert.ok(call.binds.indexOf("王小美") === -1, "姓名不得出現在 bind");
    assert.ok(!call.sql.includes("王小美"), "姓名不得拼接進 SQL");
    assert.equal(call.binds[0], TENANT, "tenant 必須是第一個 bind");
    assert.ok(!call.sql.includes(TENANT), "tenant 不得拼接進 SQL");
    assert.ok(!call.sql.includes("0912345678"), "電話不得拼接進 SQL");
    assert.ok(!/WHERE[^]*display_name/i.test(call.sql), "WHERE 不得使用姓名欄");
  });
});

test("preview response 不含 canonicalString、完整電話、LINE userId 或 normalized", async function () {
  var db = makeFakeDb(importHandler());
  var response = await worker.fetch(
    jsonRequest("POST", PREVIEW_PATH, { csvText: BASIC_CSV }, OWNER_TOKEN),
    makeD1Env(db)
  );

  var text = await response.text();
  assert.ok(!text.includes("canonicalString"), "不得回 canonicalString");
  assert.ok(!text.includes("0912345678"), "不得回完整電話");
  assert.ok(!text.includes('"normalized"'), "rows 不得含 normalized 完整資料");
  assert.ok(!/U-/.test(text), "不得回 LINE userId");
  var body = JSON.parse(text);
  assert.equal(body.rows[0].maskedPreview.phone, "09******78", "電話只以遮罩值回傳");
});

// ── 電話國碼交叉查重 ─────────────────────────────────────────

test("preview：台灣手機各種國碼格式交叉比對，不得判為 willCreate", async function () {
  var cases = [
    { imported: "0912345678", stored: "+886912345678" },
    { imported: "+886912345678", stored: "0912-345-678" },
    { imported: "8860912345678", stored: "0912 345 678" },
    { imported: "0912 345 678", stored: "886 912 345 678" },
    { imported: "+886 912-345-678", stored: "8860912345678" }
  ];

  for (var i = 0; i < cases.length; i++) {
    var db = makeFakeDb(importHandler({
      phoneRows: [{ mobile: cases[i].stored, display_name: "王小美", has_line: 0 }]
    }));
    var csvText = "姓名,電話\n王小美," + cases[i].imported + "\n";
    var response = await worker.fetch(
      jsonRequest("POST", PREVIEW_PATH, { csvText: csvText }, OWNER_TOKEN),
      makeD1Env(db)
    );

    var text = await response.text();
    var body = JSON.parse(text);
    assert.equal(
      body.rows[0].outcome,
      "skipped",
      "匯入 " + cases[i].imported + "／DB " + cases[i].stored + " 應命中既有客戶"
    );
    assert.ok(!text.includes("0912345678"), "回應不得含完整電話");
  }
});

test("preview：命中後姓名不同 → conflict；已綁 LINE → conflict（跨格式）", async function () {
  var nameDb = makeFakeDb(importHandler({
    phoneRows: [{ mobile: "+886912345678", display_name: "別的名字", has_line: 0 }]
  }));
  var nameResponse = await worker.fetch(
    jsonRequest("POST", PREVIEW_PATH, {
      csvText: "姓名,電話\n王小美,0912-345-678\n"
    }, OWNER_TOKEN),
    makeD1Env(nameDb)
  );
  var nameBody = await nameResponse.json();
  assert.equal(nameBody.rows[0].outcome, "conflict");

  var lineDb = makeFakeDb(importHandler({
    phoneRows: [{ mobile: "886 912 345 678", display_name: "王小美", has_line: 1 }]
  }));
  var lineResponse = await worker.fetch(
    jsonRequest("POST", PREVIEW_PATH, {
      csvText: "姓名,電話\n王小美,0912345678\n"
    }, OWNER_TOKEN),
    makeD1Env(lineDb)
  );
  var lineBody = await lineResponse.json();
  assert.equal(lineBody.rows[0].outcome, "conflict");
});

test("commit：DB 存 +886 格式時不會 INSERT 重複 customer", async function () {
  var db = makeFakeDb(importHandler({
    phoneRows: [{ mobile: "+886912345678", display_name: "王小美", has_line: 0 }]
  }));
  var response = await worker.fetch(
    jsonRequest("POST", COMMIT_PATH, {
      csvText: BASIC_CSV,
      canonicalHash: await hashOf(BASIC_CSV)
    }, OWNER_TOKEN),
    makeD1Env(db)
  );

  assert.equal(response.status, 200);
  var body = await response.json();
  assert.equal(body.summary.skipped, 1);
  assert.equal(body.summary.created, 0);
  assert.equal(findBatchStatements(db, /INSERT INTO customers/).length, 0,
    "格式差異不得造成重複 INSERT");
});

test("電話查詢：候選全部走 bind、SQL 無電話、tenant scoped、姓名不進 WHERE", async function () {
  var db = makeFakeDb(importHandler());
  await worker.fetch(
    jsonRequest("POST", PREVIEW_PATH, { csvText: BASIC_CSV }, OWNER_TOKEN),
    makeD1Env(db)
  );

  var phoneCall = db.calls.find(function (call) {
    return /REPLACE\(REPLACE\(COALESCE\(c\.mobile/.test(call.sql);
  });
  assert.ok(phoneCall, "應有電話查詢");
  assert.equal(phoneCall.binds[0], TENANT, "tenant 必須 bind 且為第一個");
  [
    "0912345678",
    "+886912345678",
    "886912345678",
    "+8860912345678",
    "8860912345678"
  ].forEach(function (candidate) {
    assert.ok(
      phoneCall.binds.indexOf(candidate) !== -1,
      "查詢候選「" + candidate + "」必須位於 bind"
    );
  });
  assert.ok(!/\d{8}/.test(phoneCall.sql), "SQL 文字不得含實際電話");
  assert.ok(!phoneCall.sql.includes(TENANT), "tenant 不得拼接進 SQL");
  assert.ok(!/WHERE[^]*display_name/i.test(phoneCall.sql), "姓名不得進 WHERE");
  assert.ok(phoneCall.binds.indexOf("王小美") === -1, "姓名不得出現在 bind");
});

test("一般 8～15 碼電話維持精確比對（單一候選）；非法電話不放寬", async function () {
  var db = makeFakeDb(importHandler());
  await worker.fetch(
    jsonRequest("POST", PREVIEW_PATH, {
      csvText: "姓名,電話\n王小美,+81312345678\n"
    }, OWNER_TOKEN),
    makeD1Env(db)
  );
  var phoneCall = db.calls.find(function (call) {
    return /REPLACE\(REPLACE\(COALESCE\(c\.mobile/.test(call.sql);
  });
  assert.deepEqual(
    phoneCall.binds.slice(1),
    ["+81312345678"],
    "非台灣手機只有自身一個候選，不做模糊配對"
  );

  var badDb = makeFakeDb(importHandler());
  var badResponse = await worker.fetch(
    jsonRequest("POST", PREVIEW_PATH, {
      csvText: "姓名,電話\n王小美,09abc12345\n"
    }, OWNER_TOKEN),
    makeD1Env(badDb)
  );
  var badBody = await badResponse.json();
  assert.equal(badBody.rows[0].outcome, "error", "非法電話仍為 error，不得放寬");
});

// ── Commit ───────────────────────────────────────────────────

test("commit：canonicalHash 不符 → 409 且零寫入", async function () {
  var db = makeFakeDb(importHandler());
  var response = await worker.fetch(
    jsonRequest("POST", COMMIT_PATH, {
      csvText: BASIC_CSV,
      canonicalHash: "0".repeat(64)
    }, OWNER_TOKEN),
    makeD1Env(db)
  );

  assert.equal(response.status, 409);
  assert.equal(db.calls.length, 0, "hash 不符不得觸發任何 SQL");
});

test("commit：缺 canonicalHash → 400", async function () {
  var db = makeFakeDb(importHandler());
  var response = await worker.fetch(
    jsonRequest("POST", COMMIT_PATH, { csvText: BASIC_CSV }, OWNER_TOKEN),
    makeD1Env(db)
  );
  assert.equal(response.status, 400);
  assert.equal(db.calls.length, 0);
});

test("commit：超過 100 列 → 400 提示拆批", async function () {
  var lines = ["姓名"];
  for (var i = 0; i < 101; i++) {
    lines.push("客人" + i);
  }
  var csvText = lines.join("\n");
  var db = makeFakeDb(importHandler());
  var response = await worker.fetch(
    jsonRequest("POST", COMMIT_PATH, {
      csvText: csvText,
      canonicalHash: await hashOf(csvText)
    }, OWNER_TOKEN),
    makeD1Env(db)
  );

  assert.equal(response.status, 400);
  var body = await response.json();
  assert.match(body.message, /100/);
  assert.equal(db.batches.length, 0);
});

test("commit：格式 error → 400 整批零寫入", async function () {
  var csvText = "姓名,電話\n,0912345678\n王小美,0987654321\n"; // 第一列姓名空白
  var db = makeFakeDb(importHandler());
  var response = await worker.fetch(
    jsonRequest("POST", COMMIT_PATH, {
      csvText: csvText,
      canonicalHash: await hashOf(csvText)
    }, OWNER_TOKEN),
    makeD1Env(db)
  );

  assert.equal(response.status, 400);
  var body = await response.json();
  assert.match(body.message, /格式錯誤/);
  assert.equal(db.batches.length, 0, "整批不得寫入");
});

test("commit：conflict 列不建立、其他安全列可建立；counts 正確", async function () {
  var csvText = "姓名,電話\n王小美,0912345678\n李大明,0987654321\n";
  var db = makeFakeDb(importHandler({
    phoneRows: [{ mobile: "886987654321", display_name: "既有客戶", has_line: 0 }]
  }));
  var response = await worker.fetch(
    jsonRequest("POST", COMMIT_PATH, {
      csvText: csvText,
      canonicalHash: await hashOf(csvText)
    }, OWNER_TOKEN),
    makeD1Env(db)
  );

  assert.equal(response.status, 200);
  var body = await response.json();
  assert.deepEqual(body.summary, {
    total: 2, created: 1, skipped: 0, conflicts: 1, warnings: 0
  });

  var customerInserts = findBatchStatements(db, /INSERT INTO customers/);
  assert.equal(customerInserts.length, 1);
  assert.ok(customerInserts[0].binds.indexOf("王小美") !== -1, "安全列必須建立");
  assert.ok(customerInserts[0].binds.indexOf("李大明") === -1, "conflict 列不得建立");
  assert.ok(customerInserts[0].binds.indexOf("0987654321") === -1);

  var batchInsert = findBatchStatements(db, /INSERT INTO customer_import_batches/)[0];
  // binds: id, tenant, hash, schemaVersion, total, created, skipped, conflict, warning, staff, created_at, committed_at
  assert.equal(batchInsert.binds[4], 2, "total_rows");
  assert.equal(batchInsert.binds[5], 1, "created_count");
  assert.equal(batchInsert.binds[6], 0, "skipped_count");
  assert.equal(batchInsert.binds[7], 1, "conflict_count");
  assert.equal(batchInsert.binds[1], TENANT, "tenant scoped");
  assert.equal(batchInsert.binds[9], STAFF, "created_by_staff_id");
});

test("commit：skipped 列不更新既有客戶、不建立新客戶", async function () {
  var db = makeFakeDb(importHandler({
    phoneRows: [{ mobile: "8860912345678", display_name: "王小美", has_line: 0 }]
  }));
  var response = await worker.fetch(
    jsonRequest("POST", COMMIT_PATH, {
      csvText: BASIC_CSV,
      canonicalHash: await hashOf(BASIC_CSV)
    }, OWNER_TOKEN),
    makeD1Env(db)
  );

  var body = await response.json();
  assert.equal(body.summary.skipped, 1);
  assert.equal(body.summary.created, 0);
  assert.equal(findBatchStatements(db, /INSERT INTO customers/).length, 0);
  db.calls.forEach(function (call) {
    assert.ok(!/UPDATE customers/.test(call.sql), "skipped 不得更新既有客戶");
  });
});

test("commit：customer_no 未提供時自動產生 CUS- 開頭；有提供則沿用", async function () {
  var csvText = "姓名,電話,會員編號\n王小美,0912345678,\n李大明,0987654321,A009\n";
  var db = makeFakeDb(importHandler());
  await worker.fetch(
    jsonRequest("POST", COMMIT_PATH, {
      csvText: csvText,
      canonicalHash: await hashOf(csvText)
    }, OWNER_TOKEN),
    makeD1Env(db)
  );

  var insert = findBatchStatements(db, /INSERT INTO customers/)[0];
  // 每列 9 個 bind：id, tenant, customer_no, name, phone, birthday, note, created, updated
  assert.match(String(insert.binds[2]), /^CUS-/, "未提供 customer_no 應自動產生");
  assert.equal(insert.binds[9 + 2], "A009", "提供 customer_no 應沿用");
});

test("commit：mobile／birthday 空白寫 NULL；source='import'、status='active'", async function () {
  var csvText = "姓名,電話\n王小美,\n";
  var db = makeFakeDb(importHandler());
  var response = await worker.fetch(
    jsonRequest("POST", COMMIT_PATH, {
      csvText: csvText,
      canonicalHash: await hashOf(csvText)
    }, OWNER_TOKEN),
    makeD1Env(db)
  );

  assert.equal(response.status, 200);
  var insert = findBatchStatements(db, /INSERT INTO customers/)[0];
  assert.equal(insert.binds[4], null, "空電話寫 NULL");
  assert.equal(insert.binds[5], null, "空生日寫 NULL");
  assert.ok(insert.sql.includes("'import'"), "source 必須為 import");
  assert.ok(insert.sql.includes("'active'"), "status 必須為 active");
});

test("commit：絕不建立、更新或猜測 line_accounts", async function () {
  var db = makeFakeDb(importHandler());
  await worker.fetch(
    jsonRequest("POST", COMMIT_PATH, {
      csvText: BASIC_CSV,
      canonicalHash: await hashOf(BASIC_CSV)
    }, OWNER_TOKEN),
    makeD1Env(db)
  );

  db.calls.forEach(function (call) {
    assert.ok(
      !/INSERT INTO line_accounts|UPDATE line_accounts|DELETE FROM line_accounts/.test(call.sql),
      "不得寫入 line_accounts"
    );
  });
});

test("commit：STAFF_ID 不屬於 tenant → fail closed 500、零寫入", async function () {
  var db = makeFakeDb(importHandler({ staffRow: null }));
  var response = await worker.fetch(
    jsonRequest("POST", COMMIT_PATH, {
      csvText: BASIC_CSV,
      canonicalHash: await hashOf(BASIC_CSV)
    }, OWNER_TOKEN),
    makeD1Env(db)
  );

  assert.equal(response.status, 500);
  assert.equal(db.batches.length, 0);
  var staffCheck = db.calls.find(function (c) { return /FROM staff WHERE/.test(c.sql); });
  assert.deepEqual(staffCheck.binds, [TENANT, STAFF], "staff 檢查必須 tenant scoped");
});

test("commit：audit 兩種事件都寫入且不含個資", async function () {
  var db = makeFakeDb(importHandler());
  var response = await worker.fetch(
    jsonRequest("POST", COMMIT_PATH, {
      csvText: BASIC_CSV,
      canonicalHash: await hashOf(BASIC_CSV)
    }, OWNER_TOKEN),
    makeD1Env(db)
  );

  var body = await response.json();
  var auditStatements = findBatchStatements(db, /INSERT INTO audit_logs/);
  assert.ok(auditStatements.length >= 2, "至少批次摘要＋每客戶各一筆");

  var batchAudit = auditStatements.find(function (s) {
    return s.sql.includes("customer.import.commit");
  });
  assert.ok(batchAudit, "必須有批次摘要 audit");
  assert.ok(batchAudit.sql.includes("'staff'") && batchAudit.sql.includes("'admin'"));
  assert.ok(batchAudit.binds.indexOf(STAFF) !== -1, "actor_id 為 STAFF_ID");
  assert.ok(batchAudit.binds.indexOf(body.batchId) !== -1, "entity_id 為 batch id");
  var batchMetadata = JSON.parse(batchAudit.binds.find(function (b) {
    return typeof b === "string" && b.startsWith("{");
  }));
  assert.deepEqual(
    Object.keys(batchMetadata).sort(),
    ["contentHash", "counts", "schemaVersion"],
    "批次 metadata 只含 counts／schemaVersion／contentHash"
  );

  var createAudit = auditStatements.find(function (s) {
    return s.sql.includes("customer.import.create");
  });
  assert.ok(createAudit, "必須有每客戶 audit");
  var createMetadata = JSON.parse(createAudit.binds.find(function (b) {
    return typeof b === "string" && b.startsWith("{");
  }));
  assert.deepEqual(Object.keys(createMetadata), ["batchId"], "客戶 metadata 只含 batchId");

  auditStatements.forEach(function (statement) {
    var joined = JSON.stringify(statement.binds);
    ["王小美", "0912345678", "1990-01-01", "VIP客"].forEach(function (pii) {
      assert.ok(!joined.includes(pii), "audit 不得含個資「" + pii + "」");
    });
  });
});

test("commit：batch metadata、customers、audit 全在同一次 D1 batch", async function () {
  var db = makeFakeDb(importHandler());
  await worker.fetch(
    jsonRequest("POST", COMMIT_PATH, {
      csvText: BASIC_CSV,
      canonicalHash: await hashOf(BASIC_CSV)
    }, OWNER_TOKEN),
    makeD1Env(db)
  );

  assert.equal(db.batches.length, 1, "所有寫入必須是同一次 batch");
  var sqls = db.batches[0].map(function (s) { return s.sql; }).join("\n");
  assert.match(sqls, /INSERT INTO customer_import_batches/);
  assert.match(sqls, /INSERT INTO customers/);
  assert.match(sqls, /INSERT INTO audit_logs/);
  var standaloneWrites = db.calls.filter(function (call) {
    return call.method === "run";
  });
  assert.equal(standaloneWrites.length, 0, "不得有 batch 以外的獨立寫入");
});

test("commit：batch 寫入失敗 → 500，不回成功", async function () {
  var db = makeFakeDb(importHandler());
  db.batch = async function () {
    throw new Error("D1 internal failure");
  };
  var response = await worker.fetch(
    jsonRequest("POST", COMMIT_PATH, {
      csvText: BASIC_CSV,
      canonicalHash: await hashOf(BASIC_CSV)
    }, OWNER_TOKEN),
    makeD1Env(db)
  );

  assert.equal(response.status, 500);
  var body = await response.json();
  assert.equal(body.ok, false);
  assert.ok(!body.message.includes("0912345678"), "錯誤訊息不得含電話");
});

test("commit：重複 content_hash（pre-check）→ 200 alreadyImported、零寫入", async function () {
  var existingBatch = {
    id: "batch-existing-1",
    content_hash: await hashOf(BASIC_CSV),
    total_rows: 1,
    created_count: 1,
    skipped_count: 0,
    conflict_count: 0,
    warning_count: 0
  };
  var db = makeFakeDb(importHandler({ existingBatch: existingBatch }));
  var response = await worker.fetch(
    jsonRequest("POST", COMMIT_PATH, {
      csvText: BASIC_CSV,
      canonicalHash: existingBatch.content_hash
    }, OWNER_TOKEN),
    makeD1Env(db)
  );

  assert.equal(response.status, 200);
  var body = await response.json();
  assert.equal(body.alreadyImported, true);
  assert.equal(body.batchId, "batch-existing-1");
  assert.deepEqual(body.summary, {
    total: 1, created: 1, skipped: 0, conflicts: 0, warnings: 0
  });
  assert.equal(db.batches.length, 0, "不得重寫 customers");
});

test("commit：競態下 UNIQUE 擋下第二批 → 轉 alreadyImported", async function () {
  var hash = await hashOf(BASIC_CSV);
  var batchLookups = 0;
  var db = makeFakeDb(function (sql, binds, method) {
    if (method === "first" && /FROM staff WHERE/.test(sql)) {
      return { id: STAFF };
    }
    if (method === "first" && /FROM customer_import_batches/.test(sql)) {
      batchLookups += 1;
      // 第一次 pre-check 查無；batch 失敗後重查 → 回對手批次
      return batchLookups === 1 ? null : {
        id: "batch-raced-1",
        content_hash: hash,
        total_rows: 1,
        created_count: 1,
        skipped_count: 0,
        conflict_count: 0,
        warning_count: 0
      };
    }
    return null;
  });
  db.batch = async function () {
    throw new Error("UNIQUE constraint failed: customer_import_batches.tenant_id, customer_import_batches.content_hash");
  };

  var response = await worker.fetch(
    jsonRequest("POST", COMMIT_PATH, {
      csvText: BASIC_CSV,
      canonicalHash: hash
    }, OWNER_TOKEN),
    makeD1Env(db)
  );

  assert.equal(response.status, 200);
  var body = await response.json();
  assert.equal(body.alreadyImported, true);
  assert.equal(body.batchId, "batch-raced-1", "轉為既有批次回應，不產生兩批客戶");
});

test("commit response 不含 canonicalString、完整電話或 LINE userId", async function () {
  var db = makeFakeDb(importHandler());
  var response = await worker.fetch(
    jsonRequest("POST", COMMIT_PATH, {
      csvText: BASIC_CSV,
      canonicalHash: await hashOf(BASIC_CSV)
    }, OWNER_TOKEN),
    makeD1Env(db)
  );

  var text = await response.text();
  assert.ok(!text.includes("canonicalString"));
  assert.ok(!text.includes("0912345678"));
  assert.ok(!text.includes('"normalized"'));
  assert.ok(!/U-owner|U-token|U-stranger/.test(text));
});
