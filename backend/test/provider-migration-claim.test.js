import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isProviderMigrationToken } from "../src/d1-claim-invites.js";

var source = readFileSync(
  join(import.meta.dirname, "../src/d1-claim-invites.js"),
  "utf8"
);

test("provider migration token uses an explicit unambiguous prefix", function () {
  assert.equal(isProviderMigrationToken("provider_migrate_" + "a".repeat(32)), true);
  assert.equal(isProviderMigrationToken("c_" + "a".repeat(32)), false);
  assert.equal(isProviderMigrationToken("provider_migrate_short"), false);
});

test("provider migration replaces only the existing line account and preserves customer", function () {
  assert.match(source, /UPDATE line_accounts SET line_user_id=/);
  assert.match(source, /WHERE tenant_id=\?5 AND id=\?6 AND customer_id=\?7/);
  assert.match(source, /customer\.line_provider_migrated/);
  assert.doesNotMatch(
    source.slice(
      source.indexOf("if (customer.line_account_id && isProviderMigrationToken(token))"),
      source.indexOf("if (customer.line_account_id) {", source.indexOf("isProviderMigrationToken(token)"))
    ),
    /INSERT INTO customers/
  );
});
