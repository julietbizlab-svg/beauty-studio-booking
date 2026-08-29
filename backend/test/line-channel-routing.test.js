import { test } from "node:test";
import assert from "node:assert/strict";
import {
  lineMessagingTokenForTenant,
  lineLiffClientIdsForTenant,
  lineCustomerLiffIdForTenant,
  tenantIdForLiffClientId,
  tenantLineChannel,
  tenantLineWebhookRoute,
  tenantLineChannelReadiness,
  legacyShowcaseLineRoutesEnabled,
  sharedShowcaseLineRouteEnabled
} from "../src/line-channel-routing.js";
import { verifyLineIdToken } from "../src/liff-verify.js";

function envWithRegistry() {
  return {
    TENANT_ID: "tenant-client-a",
    DEFAULT_LINE_TENANT_ID: "tenant-juliet",
    LINE_CHANNEL_ACCESS_TOKEN: "juliet-token",
    LINE_TENANT_CHANNELS_JSON: JSON.stringify({
      "tenant-client-a": {
        providerId: "provider-a",
        messagingAccessToken: "client-a-token",
        liffClientIds: ["client-a-customer", "client-a-owner", "client-a-customer"],
        customerLiffId: "1234567890-client-a",
        webhookSecret: "client-a-webhook-secret",
        webhookRouteKey: "client_a_0123456789abcdef0123456789abcdef"
      }
    })
  };
}

test("tenant registry resolves its own provider, Messaging token and unique LIFF clients", function () {
  var env = envWithRegistry();
  assert.deepEqual(tenantLineChannel(env, "tenant-client-a"), {
    providerId: "provider-a",
    messagingAccessToken: "client-a-token",
    liffClientIds: ["client-a-customer", "client-a-owner"],
    customerLiffId: "1234567890-client-a",
    webhookSecret: "client-a-webhook-secret",
    webhookRouteKey: "client_a_0123456789abcdef0123456789abcdef"
  });
  assert.equal(lineMessagingTokenForTenant(env, "tenant-client-a"), "client-a-token");
  assert.deepEqual(lineLiffClientIdsForTenant(env, "tenant-client-a"), [
    "client-a-customer", "client-a-owner", "1234567890"
  ]);
  assert.equal(
    lineCustomerLiffIdForTenant(env, "tenant-client-a"),
    "1234567890-client-a"
  );
});

test("customer LIFF app automatically contributes its Login Channel ID", function () {
  var env = envWithRegistry();
  var parsed = JSON.parse(env.LINE_TENANT_CHANNELS_JSON);
  parsed["tenant-client-a"].liffClientIds = ["owner-client"];
  parsed["tenant-client-a"].customerLiffId = "2011217307-customerApp";
  env.LINE_TENANT_CHANNELS_JSON = JSON.stringify(parsed);
  assert.deepEqual(
    lineLiffClientIdsForTenant(env, "tenant-client-a"),
    ["owner-client", "2011217307"]
  );
});

test("dedicated LIFF audience resolves to exactly one tenant", function () {
  var env = envWithRegistry();
  assert.equal(
    tenantIdForLiffClientId(env, "client-a-owner"),
    "tenant-client-a"
  );
  assert.equal(tenantIdForLiffClientId(env, "unknown-client"), "");

  var parsed = JSON.parse(env.LINE_TENANT_CHANNELS_JSON);
  parsed["tenant-client-b"] = {
    providerId: "provider-b",
    messagingAccessToken: "client-b-token",
    liffClientIds: ["client-a-owner"],
    customerLiffId: "9876543210-client-b",
    webhookSecret: "client-b-secret",
    webhookRouteKey: "client_b_0123456789abcdef0123456789abcdef"
  };
  env.LINE_TENANT_CHANNELS_JSON = JSON.stringify(parsed);
  assert.equal(tenantIdForLiffClientId(env, "client-a-owner"), "");
});

test("opaque webhook route resolves server-side tenant secret without body tenant input", function () {
  var env = envWithRegistry();
  assert.deepEqual(
    tenantLineWebhookRoute(env, "client_a_0123456789abcdef0123456789abcdef"),
    { tenantId: "tenant-client-a", webhookSecret: "client-a-webhook-secret" }
  );
  assert.equal(tenantLineWebhookRoute(env, "tenant-client-a"), null);
  assert.equal(tenantLineWebhookRoute(env, "unknown_0123456789abcdef0123456789abcdef"), null);
});

test("readiness reports only missing field names and never returns secret values", function () {
  var env = envWithRegistry();
  assert.deepEqual(tenantLineChannelReadiness(env, "tenant-client-a"), {
    configured: true, ready: true, missing: []
  });
  env.LINE_TENANT_CHANNELS_JSON = JSON.stringify({
    "tenant-incomplete": { providerId: "provider-only" }
  });
  var incomplete = tenantLineChannelReadiness(env, "tenant-incomplete");
  assert.deepEqual(incomplete, {
    configured: true,
    ready: false,
    missing: [
      "messagingAccessToken", "liffClientIds", "customerLiffId", "webhookSecret", "webhookRouteKey"
    ]
  });
  assert.equal(JSON.stringify(incomplete).includes("provider-only"), false);
  assert.deepEqual(tenantLineChannelReadiness(env, "unknown"), {
    configured: false, ready: false, missing: ["registry"]
  });
});

test("unknown tenant never falls back to JULIET shared OA", function () {
  var env = envWithRegistry();
  assert.equal(lineMessagingTokenForTenant(env, "tenant-unknown"), "");
  assert.deepEqual(lineLiffClientIdsForTenant(env, "tenant-unknown"), []);
});

test("tenant-scoped LIFF verification only attempts that tenant's client IDs", async function () {
  var env = envWithRegistry();
  env.LIFF_CHANNEL_ID = "juliet-client";
  var attempted = [];
  var originalFetch = globalThis.fetch;
  globalThis.fetch = async function (_url, options) {
    var clientId = new URLSearchParams(options.body).get("client_id");
    attempted.push(clientId);
    return new Response(JSON.stringify(clientId === "client-a-owner"
      ? { sub: "U-client-a" }
      : { error_description: "client mismatch" }), {
      status: clientId === "client-a-owner" ? 200 : 400,
      headers: { "Content-Type": "application/json" }
    });
  };
  try {
    var identity = await verifyLineIdToken("id-token", env);
    assert.equal(identity.userId, "U-client-a");
    assert.deepEqual(attempted, ["client-a-customer", "client-a-owner"]);
    assert.equal(attempted.includes("juliet-client"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("audience diagnostic reveals only mismatch category", async function () {
  var env = envWithRegistry();
  var payload = Buffer.from(JSON.stringify({ aud: "different-client" }))
    .toString("base64url");
  var originalFetch = globalThis.fetch;
  globalThis.fetch = async function () {
    return new Response(JSON.stringify({
      error_description: "Invalid IdToken Audience."
    }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  };
  try {
    await assert.rejects(
      verifyLineIdToken("header." + payload + ".signature", env),
      function (error) {
        assert.equal(
          error.message,
          "LINE_AUDIENCE_DIAGNOSTIC: token_channel_not_registered"
        );
        assert.doesNotMatch(error.message, /different-client|id-token|U-/);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("malformed registry fails closed without exposing or borrowing a token", function () {
  var env = envWithRegistry();
  env.LINE_TENANT_CHANNELS_JSON = "{not-json";
  assert.equal(lineMessagingTokenForTenant(env, "tenant-client-a"), "");
  assert.equal(tenantLineChannel(env, "tenant-client-a"), null);
});

test("legacy showcase cutover disables old tokens while registry tenants remain available", function () {
  var env = envWithRegistry();
  env.STANDARD_SHOWCASE_TENANT_ID = "tenant-standard";
  env.FLAGSHIP_SHOWCASE_TENANT_ID = "tenant-flagship";
  env.STANDARD_LINE_CHANNEL_ACCESS_TOKEN = "standard-old-token";
  env.FLAGSHIP_LINE_CHANNEL_ACCESS_TOKEN = "flagship-old-token";
  assert.equal(legacyShowcaseLineRoutesEnabled(env), true);
  assert.equal(lineMessagingTokenForTenant(env, "tenant-standard"), "standard-old-token");
  env.LINE_LEGACY_SHOWCASE_ROUTES_ENABLED = "false";
  assert.equal(legacyShowcaseLineRoutesEnabled(env), false);
  assert.equal(lineMessagingTokenForTenant(env, "tenant-standard"), "");
  assert.equal(lineMessagingTokenForTenant(env, "tenant-flagship"), "");
  assert.equal(lineMessagingTokenForTenant(env, "tenant-client-a"), "client-a-token");
});

test("shared showcase mode routes only the two explicit showcase tenants to JULIET display OA", function () {
  var env = envWithRegistry();
  env.STANDARD_SHOWCASE_TENANT_ID = "tenant-standard";
  env.FLAGSHIP_SHOWCASE_TENANT_ID = "tenant-flagship";
  env.LINE_LEGACY_SHOWCASE_ROUTES_ENABLED = "false";
  env.LINE_SHOWCASE_SHARED_OA_ENABLED = "true";
  assert.equal(sharedShowcaseLineRouteEnabled(env), true);
  assert.equal(lineMessagingTokenForTenant(env, "tenant-standard"), "juliet-token");
  assert.equal(lineMessagingTokenForTenant(env, "tenant-flagship"), "juliet-token");
  assert.equal(lineMessagingTokenForTenant(env, "tenant-unknown"), "");
  assert.equal(lineMessagingTokenForTenant(env, "tenant-client-a"), "client-a-token");
});
