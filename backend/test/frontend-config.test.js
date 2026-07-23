/**
 * 前端 config.js hostname 環境切換測試（node:test ＋ assert，零依賴）
 *
 * 以假 window 執行 customer-ui／owner-admin／docs 四份 config.js，
 * 驗證：
 * - 精確 juliet-studio.pages.dev → v2-production Worker
 * - preview 子網域 → v2-test Worker
 * - 其他 hostname 維持 Demo v1
 * - 四份檔案行為一致（靜態副本）
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

var repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

var CONFIG_FILES = [
  "customer-ui/js/config.js",
  "owner-admin/js/config.js",
  "docs/js/config.js",
  "docs/owner/js/config.js"
];

var V2_PRODUCTION_API =
  "https://beauty-studio-api-v2-production.gosu-chill-book.workers.dev";
var V2_TEST_API =
  "https://beauty-studio-api-v2-test.gosu-chill-book.workers.dev";
var V2_PRODUCTION_LIFF_ID = "2010530394-orSKMGcU";
var V2_TEST_LIFF_ID = "2010530394-QcklvIHd";

function v2Config(hostname, apiBaseUrl, liffId) {
  return {
    LIFF_ID: liffId,
    API_BASE_URL: apiBaseUrl,
    CLAIM_ENABLED: true,
    CUSTOMER_APP_URL: "https://" + hostname + "/"
  };
}

var DEMO_V1 = {
  LIFF_ID: "2010678480-dKQ3afnw",
  API_BASE_URL: "https://beauty-studio-api.gosu-chill-book.workers.dev",
  CLAIM_ENABLED: false,
  CUSTOMER_APP_URL: null
};

function evalConfig(relativePath, hostname) {
  var code = readFileSync(join(repoRoot, relativePath), "utf8");
  var fakeWindow = { location: { hostname: hostname } };
  new Function("window", code)(fakeWindow);
  return fakeWindow.BEAUTY_CONFIG;
}

test("精確 juliet-studio.pages.dev 取得 v2-production 設定（四份 config 一致）", function () {
  var hostname = "juliet-studio.pages.dev";
  var expected = v2Config(hostname, V2_PRODUCTION_API, V2_PRODUCTION_LIFF_ID);
  CONFIG_FILES.forEach(function (file) {
    assert.deepEqual(
      evalConfig(file, hostname),
      expected,
      file + " @ " + hostname + " 應取得 v2-production 設定"
    );
  });
});

test("preview 子網域取得 v2-test 設定（四份 config 一致）", function () {
  var previewHostnames = [
    "preview-token.juliet-studio.pages.dev",
    "abc123.juliet-studio.pages.dev"
  ];
  CONFIG_FILES.forEach(function (file) {
    previewHostnames.forEach(function (hostname) {
      assert.deepEqual(
        evalConfig(file, hostname),
        v2Config(hostname, V2_TEST_API, V2_TEST_LIFF_ID),
        file + " @ " + hostname + " 應取得 v2-test 設定"
      );
    });
  });
});

test("正式與 preview 的 v2 hostname 皆啟用 LINE 認領（Demo v1 一律停用）", function () {
  CONFIG_FILES.forEach(function (file) {
    assert.equal(
      evalConfig(file, "juliet-studio.pages.dev").CLAIM_ENABLED, true,
      file + " production hostname 應啟用認領"
    );
    assert.equal(
      evalConfig(file, "abc123.juliet-studio.pages.dev").CLAIM_ENABLED, true,
      file + " preview hostname 應啟用認領"
    );
    ["julietbizlab-svg.github.io", "localhost"].forEach(function (hostname) {
      var config = evalConfig(file, hostname);
      assert.equal(config.CLAIM_ENABLED, false, file + " @ " + hostname + " 不得啟用認領");
      assert.equal(config.CUSTOMER_APP_URL, null);
    });
  });
});

test("其他 hostname 維持 Demo v1 設定（四份 config 一致）", function () {
  var v1Hostnames = [
    "julietbizlab-svg.github.io",
    "localhost",
    "evil-juliet-studio.pages.dev",
    "juliet-studio.pages.dev.attacker.example"
  ];
  CONFIG_FILES.forEach(function (file) {
    v1Hostnames.forEach(function (hostname) {
      assert.deepEqual(
        evalConfig(file, hostname),
        DEMO_V1,
        file + " @ " + hostname + " 應維持 Demo v1 設定"
      );
    });
  });
});

test("customer-ui／docs 與 owner-admin／docs/owner 靜態 config 副本一致", function () {
  assert.equal(
    readFileSync(join(repoRoot, "customer-ui/js/config.js"), "utf8"),
    readFileSync(join(repoRoot, "docs/js/config.js"), "utf8")
  );
  assert.equal(
    readFileSync(join(repoRoot, "owner-admin/js/config.js"), "utf8"),
    readFileSync(join(repoRoot, "docs/owner/js/config.js"), "utf8")
  );
});

test("四份 config 不含 secrets／token／.dev.vars 內容", function () {
  CONFIG_FILES.forEach(function (file) {
    var code = readFileSync(join(repoRoot, file), "utf8");
    assert.ok(!/\.dev\.vars/.test(code), file + " 不得引用 .dev.vars");
    assert.ok(!/CHANNEL_SECRET|ACCESS_TOKEN|API_TOKEN|Bearer /i.test(code),
      file + " 不得含 secret／token 字樣");
    assert.ok(!/sk-[a-zA-Z0-9]{10,}/.test(code), file + " 不得含疑似密鑰");
  });
});
