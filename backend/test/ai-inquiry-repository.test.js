import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createCustomerAiInquiry,
  countDailyCustomerAiInquiries,
  listCustomerAiInquiries,
  listOwnerAiInquiries,
  updateOwnerAiInquiryStatus,
  sendOwnerAiInquiryReply
} from "../src/d1-ai-inquiries.js";

function fakeEnv(handler) {
  return {
    TENANT_ID: "tenant-a",
    AI_INQUIRY_NOW_ISO: "2026-07-23T12:00:00.000Z",
    DB: {
      prepare: function (sql) {
        return {
          bind: function () {
            var values = Array.from(arguments);
            return handler(sql, values);
          }
        };
      }
    }
  };
}

test("同一客戶每日題數依台灣日期計算，且不受結案狀態影響", async function () {
  var env = fakeEnv(function (sql, values) {
    assert.match(sql, /created_at >= \?3 AND created_at <= \?4/);
    assert.doesNotMatch(sql, /status IN/);
    assert.deepEqual(values, [
      "tenant-a",
      "U-daily",
      "2026-07-22T16:00:00.000Z",
      "2026-07-23T12:00:00.000Z"
    ]);
    return { all: async function () { return { results: [{ total: 12 }] }; } };
  });
  assert.equal(await countDailyCustomerAiInquiries(env, "U-daily"), 12);
});

test("客戶 AI 洽詢寫入 tenant scope，LINE userId 不回傳前端", async function () {
  var captured;
  var env = fakeEnv(function (sql, values) {
    captured = { sql: sql, values: values };
    return {
      run: async function () { return { success: true, meta: { changes: 1 } }; }
    };
  });
  var result = await createCustomerAiInquiry(env, {
    lineUserId: "U-private",
    customerMessage: "最近可約時間？",
    aiReply: "請先選擇服務。",
    ownerSummary: "客人詢問最近可預約時間。",
    needsOwnerFollowUp: true
  });
  assert.equal(result.reportedToOwner, true);
  assert.ok(!JSON.stringify(result).includes("U-private"));
  assert.match(captured.sql, /INSERT INTO ai_customer_inquiries/);
  assert.match(captured.sql, /tenant_id = \?2 AND line_user_id = \?3/);
  assert.equal(captured.values[1], "tenant-a");
  assert.equal(captured.values[2], "U-private");
  assert.match(captured.values[9], /^2026-10-21/);
});

test("業主清單只回安全 DTO、未讀數與跟進狀態", async function () {
  var env = fakeEnv(function (sql, values) {
    assert.match(sql, /WHERE q\.tenant_id = \?1 AND q\.expires_at > \?2/);
    assert.deepEqual(values, ["tenant-a", "2026-07-23T12:00:00.000Z"]);
    return {
      all: async function () {
        return { results: [{
          id: "aiq-1",
          customer_message: "最近可約時間？",
          ai_reply: "請先選服務。",
          owner_summary: "客人詢問最近時段。",
          needs_owner_follow_up: 1,
          status: "new",
          created_at: "2026-07-23T11:00:00.000Z",
          customer_name: "小美",
          recommended_service_name: ""
        }] };
      }
    };
  });
  var result = await listOwnerAiInquiries(env);
  assert.equal(result.unreadCount, 1);
  assert.equal(result.inquiries[0].customerName, "小美");
  assert.equal(result.inquiries[0].needsOwnerFollowUp, true);
  assert.ok(!JSON.stringify(result).includes("line_user_id"));
});

test("客戶諮詢紀錄只依驗證 LINE userId 查詢，不回傳業主內部摘要", async function () {
  var env = fakeEnv(function (sql, values) {
    assert.match(sql, /q\.tenant_id = \?1 AND q\.line_user_id = \?2/);
    assert.match(sql, /r2\.status = 'sent'/);
    assert.deepEqual(values, [
      "tenant-a", "U-verified", "2026-07-23T12:00:00.000Z"
    ]);
    return {
      all: async function () {
        return { results: [{
          id: "aiq-1",
          customer_message: "霧眉適合我嗎？",
          ai_reply: "可以先由本工作室評估。",
          created_at: "2026-07-23T11:00:00.000Z",
          owner_reply_text: "您好，可以先提供素顏眉型照片。",
          owner_reply_sent_at: "2026-07-23T11:30:00.000Z",
          owner_summary: "不應回傳"
        }] };
      }
    };
  });
  var result = await listCustomerAiInquiries(env, "U-verified");
  assert.equal(result.inquiries[0].customerMessage, "霧眉適合我嗎？");
  assert.equal(result.inquiries[0].ownerReply.text, "您好，可以先提供素顏眉型照片。");
  assert.ok(!("aiReply" in result.inquiries[0]));
  assert.ok(!JSON.stringify(result).includes("ownerSummary"));
  assert.ok(!JSON.stringify(result).includes("不應回傳"));
});

test("業主更新狀態必須 tenant scoped 且只允許 reviewed／resolved", async function () {
  var captured;
  var env = fakeEnv(function (sql, values) {
    captured = { sql: sql, values: values };
    return {
      run: async function () { return { meta: { changes: 1 } }; }
    };
  });
  var result = await updateOwnerAiInquiryStatus(env, "aiq-1", "resolved");
  assert.equal(result.status, "resolved");
  assert.match(captured.sql, /WHERE tenant_id = \?2 AND id = \?3/);
  assert.equal(captured.values[1], "tenant-a");
  await assert.rejects(
    updateOwnerAiInquiryStatus(env, "aiq-1", "deleted"),
    function (error) { return error.status === 400; }
  );
});

test("業主回覆只在後端取得 LINE userId，成功傳送後記錄並完成洽詢", async function () {
  var prepared = [];
  var batched = [];
  var fetchBody;
  var originalFetch = globalThis.fetch;
  globalThis.fetch = async function (url, options) {
    assert.equal(url, "https://api.line.me/v2/bot/message/push");
    assert.equal(options.headers.Authorization, "Bearer test-token");
    assert.match(options.headers["X-Line-Retry-Key"], /^[0-9a-f-]{36}$/);
    fetchBody = JSON.parse(options.body);
    return { ok: true, status: 200 };
  };
  var env = {
    TENANT_ID: "tenant-a",
    AI_INQUIRY_NOW_ISO: "2026-07-23T12:00:00.000Z",
    LINE_CHANNEL_ACCESS_TOKEN: "test-token",
    DB: {
      prepare: function (sql) {
        return {
          bind: function () {
            var values = Array.from(arguments);
            var statement = { sql: sql, values: values };
            prepared.push(statement);
            if (/FROM ai_inquiry_owner_replies WHERE/.test(sql)) {
              statement.first = async function () { return null; };
            } else if (/SELECT line_user_id, status/.test(sql)) {
              statement.first = async function () {
                return { line_user_id: "U-private", status: "new" };
              };
            } else {
              statement.run = async function () {
                return { meta: { changes: 1 } };
              };
            }
            return statement;
          }
        };
      },
      batch: async function (statements) {
        batched.push(...statements);
        return statements.map(function () { return { meta: { changes: 1 } }; });
      }
    }
  };
  try {
    var result = await sendOwnerAiInquiryReply(
      env,
      "aiq-1",
      "owner-a",
      { message: "您好，可以先安排諮詢。", requestId: "owner_reply_123" }
    );
    assert.equal(result.status, "sent");
    assert.equal(fetchBody.to, "U-private");
    assert.match(fetchBody.messages[0].text, /可以先安排諮詢/);
    assert.equal(batched.length, 2);
    assert.match(batched[0].sql, /status = 'sent'/);
    assert.match(batched[1].sql, /status = 'resolved'/);
    assert.ok(!JSON.stringify(result).includes("U-private"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("相同回覆識別碼直接回傳既有結果，不重複呼叫 LINE", async function () {
  var originalFetch = globalThis.fetch;
  var fetchCalled = false;
  globalThis.fetch = async function () {
    fetchCalled = true;
    return { ok: true };
  };
  var env = {
    TENANT_ID: "tenant-a",
    LINE_CHANNEL_ACCESS_TOKEN: "test-token",
    DB: {
      prepare: function () {
        return {
          bind: function () {
            return {
              first: async function () {
                return {
                  id: "air-1",
                  inquiry_id: "aiq-1",
                  reply_text: "已收到您的問題。",
                  status: "sent",
                  created_at: "2026-07-23T12:00:00.000Z",
                  sent_at: "2026-07-23T12:00:01.000Z"
                };
              }
            };
          }
        };
      }
    }
  };
  try {
    var result = await sendOwnerAiInquiryReply(
      env,
      "aiq-1",
      "owner-a",
      { message: "已收到您的問題。", requestId: "owner_reply_same" }
    );
    assert.equal(result.status, "sent");
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
