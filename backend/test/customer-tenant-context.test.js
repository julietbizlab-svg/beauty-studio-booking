import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCustomerEntryKey,
  scopeCustomerTenantEnv
} from "../src/customer-tenant-context.js";

var KEY = "a".repeat(64);

function requestWithEntry(value) {
  return new Request("https://api.example.test/api/services", {
    headers: value ? { "X-Beauty-Studio-Entry": value } : {}
  });
}

test("客戶入口只接受 64 位十六進位代碼，不接受 tenant ID", function () {
  assert.equal(normalizeCustomerEntryKey(KEY.toUpperCase()), KEY);
  assert.equal(normalizeCustomerEntryKey("tenant-workshop-a"), "");
  assert.equal(normalizeCustomerEntryKey("a".repeat(63)), "");
});

test("沒有專屬入口 header 時維持原環境", async function () {
  var env = { TENANT_ID: "default" };
  assert.equal(await scopeCustomerTenantEnv(requestWithEntry(""), env), env);
});

test("有效入口由後端查表後安全套用 tenant、location、staff", async function () {
  var bound = "";
  var env = {
    TENANT_ID: "default",
    DB: {
      prepare: function (sql) {
        assert.match(sql, /setting_key='customer_entry_key'/);
        assert.match(sql, /t\.status IN \('active','trial'\)/);
        return {
          bind: function (key) {
            bound = key;
            return {
              first: async function () {
                return { tenant_id: "tenant-a", location_id: "location-a", staff_id: "staff-a" };
              }
            };
          }
        };
      }
    }
  };
  var scoped = await scopeCustomerTenantEnv(requestWithEntry(KEY), env);
  assert.equal(bound, KEY);
  assert.equal(scoped.TENANT_ID, "tenant-a");
  assert.equal(scoped.LOCATION_ID, "location-a");
  assert.equal(scoped.STAFF_ID, "staff-a");
  assert.equal(env.TENANT_ID, "default");
});

test("格式錯誤與未知入口 fail closed", async function () {
  await assert.rejects(
    scopeCustomerTenantEnv(requestWithEntry("tenant-a"), { DB: {} }),
    function (error) { return error.status === 404; }
  );
  await assert.rejects(
    scopeCustomerTenantEnv(requestWithEntry("b".repeat(64)), {
      DB: {
        prepare: function () {
          return { bind: function () { return { first: async function () { return null; } }; } };
        }
      }
    }),
    function (error) { return error.status === 404; }
  );
});
