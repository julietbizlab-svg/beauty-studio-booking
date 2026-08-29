import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { handleTenantLineWebhook } from "../src/line-webhook.js";

var ROUTE = "client_a_0123456789abcdef0123456789abcdef";
var SECRET = "tenant-a-secret";

function registry() {
  return {
    LINE_TENANT_CHANNELS_JSON: JSON.stringify({
      "tenant-a": { webhookRouteKey: ROUTE, webhookSecret: SECRET },
      "tenant-b": {
        webhookRouteKey: "client_b_0123456789abcdef0123456789abcdef",
        webhookSecret: "tenant-b-secret"
      }
    })
  };
}

function signedRequest(body, secret) {
  var signature = createHmac("sha256", secret).update(body).digest("base64");
  return new Request("https://worker.example/api/line/webhook/" + ROUTE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Line-Signature": signature
    },
    body: body
  });
}

test("tenant webhook validates with only the route owner's Channel Secret", async function () {
  var body = JSON.stringify({ destination: "ignored", events: [{ type: "follow" }] });
  assert.deepEqual(await handleTenantLineWebhook(signedRequest(body, SECRET), registry(), ROUTE), {
    ok: true, processed: 1, tenantScoped: true
  });
  await assert.rejects(
    handleTenantLineWebhook(signedRequest(body, "tenant-b-secret"), registry(), ROUTE),
    function (error) { return error && error.status === 401; }
  );
});

test("unknown or tenant-shaped route fails closed before reading a tenant from payload", async function () {
  var body = JSON.stringify({ tenantId: "tenant-a", events: [] });
  await assert.rejects(
    handleTenantLineWebhook(signedRequest(body, SECRET), registry(), "tenant-a"),
    function (error) { return error && error.status === 404; }
  );
});
