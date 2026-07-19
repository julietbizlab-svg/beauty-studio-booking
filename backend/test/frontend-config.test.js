/**
 * 前端 config.js hostname 環境切換測試（node:test ＋ assert，零依賴）
 *
 * 以假 window 執行 customer-ui／owner-admin／docs 四份 config.js，
 * 驗證 juliet-studio.pages.dev（含 preview 子網域）取得 v2-test 設定、
 * 其他 hostname 維持 Demo v1，且四份檔案行為完全一致。
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

function v2TestConfig(hostname) {
  return {
    LIFF_ID: "2010530394-orSKMGcU",
    API_BASE_URL: "https://beauty-studio-api-v2-test.gosu-chill-book.workers.dev",
    CLAIM_ENABLED: true,
    // 以目前 hostname 組合，保持 preview 子網域彼此隔離
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

test("juliet-studio.pages.dev 與 preview 子網域取得 v2-test 設定（四份 config 一致）", function () {
  var v2Hostnames = [
    "juliet-studio.pages.dev",
    "preview-token.juliet-studio.pages.dev",
    "abc123.juliet-studio.pages.dev"
  ];
  CONFIG_FILES.forEach(function (file) {
    v2Hostnames.forEach(function (hostname) {
      assert.deepEqual(
        evalConfig(file, hostname),
        v2TestConfig(hostname),
        file + " @ " + hostname + " 應取得 v2-test 設定"
      );
    });
  });
});

test("只有 v2 hostname 啟用 LINE 認領（Demo v1 一律停用）", function () {
  CONFIG_FILES.forEach(function (file) {
    assert.equal(
      evalConfig(file, "juliet-studio.pages.dev").CLAIM_ENABLED, true,
      file + " v2 hostname 應啟用認領"
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
