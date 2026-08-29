import { test } from "node:test";
import assert from "node:assert/strict";
import { handleLineWebhook } from "../src/line-webhook.js";

async function sign(body, secret) {
  var key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  var bytes = new Uint8Array(await crypto.subtle.sign(
    "HMAC", key, new TextEncoder().encode(body)
  ));
  return Buffer.from(bytes).toString("base64");
}

async function makeRequest(payload, secret, signatureOverride) {
  var body = JSON.stringify(payload);
  var signature = signatureOverride || await sign(body, secret);
  return new Request("https://example.com/api/line/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Line-Signature": signature
    },
    body: body
  });
}

function makeEnv() {
  return { LINE_CHANNEL_SECRET: "test-channel-secret" };
}

test("LINE Webhook 驗證簽章後只接收事件，不呼叫 AI 或 reply API", async function () {
  var originalFetch = globalThis.fetch;
  var fetchCalled = false;
  globalThis.fetch = async function () {
    fetchCalled = true;
    throw new Error("LINE webhook 不應呼叫外部 API");
  };
  try {
    var request = await makeRequest({
      events: [{
        type: "message",
        replyToken: "reply-token",
        source: { type: "user", userId: "U-private" },
        message: { type: "text", id: "m1", text: "我想詢問霧眉" }
      }]
    }, makeEnv().LINE_CHANNEL_SECRET);
    var result = await handleLineWebhook(request, makeEnv());
    assert.deepEqual(result, { ok: true, processed: 1 });
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("LINE Webhook 對關鍵字與一般文字都不自行回覆", async function () {
  var env = makeEnv();
  var request = await makeRequest({
    events: [
      {
        type: "message",
        replyToken: "reply-keyword",
        source: { type: "user", userId: "U1" },
        message: { type: "text", text: "付款方式" }
      },
      {
        type: "message",
        replyToken: "reply-general",
        source: { type: "user", userId: "U1" },
        message: { type: "text", text: "付款後開始建置系統" }
      }
    ]
  }, env.LINE_CHANNEL_SECRET);
  assert.deepEqual(
    await handleLineWebhook(request, env),
    { ok: true, processed: 2 }
  );
});

test("LINE Webhook 拒絕偽造簽章", async function () {
  var request = await makeRequest(
    { events: [] },
    "test-channel-secret",
    Buffer.alloc(32, 1).toString("base64")
  );
  await assert.rejects(
    handleLineWebhook(request, makeEnv()),
    function (error) { return error.status === 401; }
  );
});

test("LINE Webhook 缺 Channel Secret 時安全拒絕", async function () {
  var request = await makeRequest({ events: [] }, "test-channel-secret");
  await assert.rejects(
    handleLineWebhook(request, {}),
    function (error) { return error.status === 503; }
  );
});
