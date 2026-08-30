import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveOwnerAccessInviteTenant } from "../src/owner-hub.js";

test("owner claim resolves the invite tenant before LINE token verification", function () {
  var source = readFileSync(join(import.meta.dirname, "../src/index.js"), "utf8");
  var start = source.indexOf('url.pathname === "/api/owner-hub/claim"');
  var end = source.indexOf('url.pathname === "/api/platform/capability"', start);
  var route = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.ok(route.indexOf("readJson(request)") < route.indexOf("resolveOwnerAccessInviteTenant"));
  assert.ok(route.indexOf("resolveOwnerAccessInviteTenant") < route.indexOf("requireCustomerFromRequest"));
  assert.match(route, /requireCustomerFromRequest\(request, ownerClaimEnv\)/);
  assert.match(route, /claimOwnerAccessInvite\(ownerClaimEnv/);
  assert.match(route, /tenantLineChannel\(env, ownerInviteTenantId\)/);
  assert.match(route, /LINE_PROVIDER_ID: ownerInviteChannel/);
});

test("invite tenant resolver accepts only an active unexpired hashed invite", async function () {
  var bound = [];
  var env = {
    DB: {
      prepare(sql) {
        assert.match(sql, /token_hash=\?1 AND status='active' AND expires_at>\?2/);
        return {
          bind(...values) {
            bound = values;
            return { first: async () => ({ tenant_id: "tenant-juliet" }) };
          }
        };
      }
    }
  };
  var tenantId = await resolveOwnerAccessInviteTenant(env, "a".repeat(64));
  assert.equal(tenantId, "tenant-juliet");
  assert.match(bound[0], /^[0-9a-f]{64}$/);
  assert.notEqual(bound[0], "a".repeat(64));
  assert.ok(!Number.isNaN(Date.parse(bound[1])));
});

test("invite tenant resolver rejects malformed tokens before querying D1", async function () {
  var env = { DB: { prepare() { throw new Error("must not query"); } } };
  await assert.rejects(
    resolveOwnerAccessInviteTenant(env, "not-a-token"),
    (error) => error.status === 404 && error.message === "邀請無效或已過期"
  );
});
