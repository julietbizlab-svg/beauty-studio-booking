import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

var source = readFileSync(join(import.meta.dirname, "../src/owner-hub.js"), "utf8");

test("owner provider migration is explicit, invite-scoped and preserves staff", function () {
  var start = source.indexOf("if (existingStaff && /^owner-provider-migrate:/");
  var end = source.indexOf("if (existingStaff) {", start);
  assert.ok(start >= 0 && end > start);
  var migration = source.slice(start, end);
  assert.match(migration, /UPDATE staff_line_accounts SET line_user_id=\?1,provider_id=\?2/);
  assert.match(migration, /provider_id=\?5 AND status='active'/);
  assert.match(migration, /owner\.line_provider_migrated/);
  assert.match(migration, /owner_access_invites/);
  assert.doesNotMatch(migration, /INSERT INTO staff\s/);
  assert.doesNotMatch(migration, /UPDATE tenants SET/);
});
