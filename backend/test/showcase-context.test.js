import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scopeCustomerShowcaseEnv } from "../src/showcase-context.js";

var root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function request(context) {
  return new Request("https://example.test/api/services", {
    headers: context ? { "X-Beauty-Showcase": context } : {}
  });
}

test("一般請求維持原 tenant", function () {
  var env = { TENANT_ID: "default" };
  assert.equal(scopeCustomerShowcaseEnv(request(""), env), env);
});

test("旗艦展示只套用後端白名單 tenant/location/staff", function () {
  var env = {
    TENANT_ID: "default",
    FLAGSHIP_SHOWCASE_TENANT_ID: "acceptance-mauve",
    FLAGSHIP_SHOWCASE_LOCATION_ID: "location-mauve",
    FLAGSHIP_SHOWCASE_STAFF_ID: "owner-mauve"
  };
  var scoped = scopeCustomerShowcaseEnv(request("flagship"), env);
  assert.equal(scoped.TENANT_ID, "acceptance-mauve");
  assert.equal(scoped.LOCATION_ID, "location-mauve");
  assert.equal(scoped.STAFF_ID, "owner-mauve");
  assert.equal(env.TENANT_ID, "default");
});

test("標準展示只套用後端白名單 tenant/location/staff", function () {
  var env = {
    TENANT_ID: "default",
    STANDARD_SHOWCASE_TENANT_ID: "acceptance-beige",
    STANDARD_SHOWCASE_LOCATION_ID: "location-beige",
    STANDARD_SHOWCASE_STAFF_ID: "owner-beige"
  };
  var scoped = scopeCustomerShowcaseEnv(request("standard"), env);
  assert.equal(scoped.TENANT_ID, "acceptance-beige");
  assert.equal(scoped.LOCATION_ID, "location-beige");
  assert.equal(scoped.STAFF_ID, "owner-beige");
  assert.equal(env.TENANT_ID, "default");
});

test("旗艦展示缺少後端白名單設定時拒絕請求", function () {
  assert.throws(
    function () { scopeCustomerShowcaseEnv(request("flagship"), {}); },
    function (error) { return error.status === 503; }
  );
});

test("標準展示缺少後端白名單設定時拒絕請求", function () {
  assert.throws(
    function () { scopeCustomerShowcaseEnv(request("standard"), {}); },
    function (error) { return error.status === 503; }
  );
});

test("客戶端展示 header 與 CORS 白名單同步", function () {
  var sourceApi = readFileSync(join(root, "customer-ui/js/api.js"), "utf8");
  var deployedApi = readFileSync(join(root, "docs/js/api.js"), "utf8");
  var worker = readFileSync(join(root, "backend/src/index.js"), "utf8");
  assert.equal(deployedApi, sourceApi);
  assert.match(sourceApi, /X-Beauty-Showcase/);
  assert.match(worker, /X-Beauty-Showcase/);
});
