import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyLineIdToken } from "../src/liff-verify.js";

test("業主 ID token 可由獨立的 LINE Login Channel 驗證", async function () {
  var originalFetch = globalThis.fetch;
  var attemptedChannelIds = [];
  globalThis.fetch = async function (url, options) {
    assert.equal(String(url), "https://api.line.me/oauth2/v2.1/verify");
    var params = new URLSearchParams(String(options.body || ""));
    var channelId = params.get("client_id");
    attemptedChannelIds.push(channelId);
    if (channelId === "owner-channel") {
      return new Response(JSON.stringify({
        sub: "U-owner",
        name: "業主",
        picture: ""
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    return new Response(JSON.stringify({
      error_description: "client_id does not match"
    }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  };

  try {
    var identity = await verifyLineIdToken("owner-token", {
      LIFF_CHANNEL_ID: "customer-channel",
      OWNER_LIFF_CLIENT_ID: "owner-channel"
    });
    assert.deepEqual(identity, {
      userId: "U-owner",
      name: "業主",
      picture: ""
    });
    assert.deepEqual(attemptedChannelIds, [
      "customer-channel",
      "owner-channel"
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("旗艦展示 ID token 可由獨立的 LINE Login Channel 驗證", async function () {
  var originalFetch = globalThis.fetch;
  var attemptedChannelIds = [];
  globalThis.fetch = async function (url, options) {
    assert.equal(String(url), "https://api.line.me/oauth2/v2.1/verify");
    var params = new URLSearchParams(String(options.body || ""));
    var channelId = params.get("client_id");
    attemptedChannelIds.push(channelId);
    if (channelId === "flagship-channel") {
      return new Response(JSON.stringify({
        sub: "U-flagship",
        name: "旗艦客戶",
        picture: ""
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    return new Response(JSON.stringify({
      error_description: "client_id does not match"
    }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  };

  try {
    var identity = await verifyLineIdToken("flagship-token", {
      LIFF_CHANNEL_ID: "customer-channel",
      FLAGSHIP_LIFF_CLIENT_ID: "flagship-channel",
      OWNER_LIFF_CLIENT_ID: "owner-channel"
    });
    assert.deepEqual(identity, {
      userId: "U-flagship",
      name: "旗艦客戶",
      picture: ""
    });
    assert.deepEqual(attemptedChannelIds, [
      "customer-channel",
      "flagship-channel"
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("標準版展示 ID token 可由獨立的 LINE Login Channel 驗證", async function () {
  var originalFetch = globalThis.fetch;
  var attemptedChannelIds = [];
  globalThis.fetch = async function (url, options) {
    assert.equal(String(url), "https://api.line.me/oauth2/v2.1/verify");
    var params = new URLSearchParams(String(options.body || ""));
    var channelId = params.get("client_id");
    attemptedChannelIds.push(channelId);
    if (channelId === "standard-channel") {
      return new Response(JSON.stringify({
        sub: "U-standard",
        name: "標準客戶",
        picture: ""
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    return new Response(JSON.stringify({
      error_description: "client_id does not match"
    }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  };

  try {
    var identity = await verifyLineIdToken("standard-token", {
      LIFF_CHANNEL_ID: "customer-channel",
      STANDARD_LIFF_CLIENT_ID: "standard-channel",
      FLAGSHIP_LIFF_CLIENT_ID: "flagship-channel",
      OWNER_LIFF_CLIENT_ID: "owner-channel"
    });
    assert.deepEqual(identity, {
      userId: "U-standard",
      name: "標準客戶",
      picture: ""
    });
    assert.deepEqual(attemptedChannelIds, [
      "customer-channel",
      "standard-channel"
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("關閉 legacy showcase 後不再嘗試標準與旗艦 LIFF Client ID", async function () {
  var originalFetch = globalThis.fetch;
  var attemptedChannelIds = [];
  globalThis.fetch = async function (_url, options) {
    var channelId = new URLSearchParams(String(options.body || "")).get("client_id");
    attemptedChannelIds.push(channelId);
    return new Response(JSON.stringify({ error_description: "invalid" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  };
  try {
    await assert.rejects(verifyLineIdToken("old-showcase-token", {
      TENANT_ID: "unknown",
      LIFF_CHANNEL_ID: "juliet-customer",
      STANDARD_LIFF_CLIENT_ID: "standard-old",
      FLAGSHIP_LIFF_CLIENT_ID: "flagship-old",
      OWNER_LIFF_CLIENT_ID: "juliet-owner",
      LINE_LEGACY_SHOWCASE_ROUTES_ENABLED: "false"
    }));
    assert.deepEqual(attemptedChannelIds, ["juliet-customer", "juliet-owner"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
