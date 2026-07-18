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

var V2_TEST = {
  LIFF_ID: "2010530394-orSKMGcU",
  API_BASE_URL: "https://beauty-studio-api-v2-test.gosu-chill-book.workers.dev"
};

var DEMO_V1 = {
  LIFF_ID: "2010678480-dKQ3afnw",
  API_BASE_URL: "https://beauty-studio-api.gosu-chill-book.workers.dev"
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
        V2_TEST,
        file + " @ " + hostname + " 應取得 v2-test 設定"
      );
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
