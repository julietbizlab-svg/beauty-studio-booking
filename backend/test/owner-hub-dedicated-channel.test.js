import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("owner hub scopes verification and membership lookup to dedicated tenant channel", function () {
  var source = readFileSync(join(import.meta.dirname, "../src/owner-hub.js"), "utf8");
  var start = source.indexOf("export async function requireOwnerHubSession");
  var end = source.indexOf("export function scopedOwnerEnv", start);
  var session = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(session, /tenantIdForLiffClientId\(env, idTokenAudience\(idToken\)\)/);
  assert.match(session, /TENANT_ID: verificationTenantId/);
  assert.match(session, /LINE_PROVIDER_ID: tenantChannel\.providerId/);
  assert.match(session, /verifyLineIdToken\(idToken, verificationEnv\)/);
  assert.match(session, /resolveOwnerContext\(\s*verificationEnv/);
});
