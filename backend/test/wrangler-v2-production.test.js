/**
 * wrangler.toml v2-production 環境綁定測試（node:test ＋ assert，零依賴）
 *
 * 僅靜態解析設定檔，不執行 wrangler／deploy／任何遠端操作。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

var repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
var wranglerToml = readFileSync(join(repoRoot, "backend/wrangler.toml"), "utf8");
var packageJson = JSON.parse(
  readFileSync(join(repoRoot, "backend/package.json"), "utf8")
);

function sectionAfter(marker) {
  var idx = wranglerToml.indexOf(marker);
  assert.ok(idx >= 0, "缺少區段標記：" + marker);
  return wranglerToml.slice(idx);
}

test("wrangler.toml 含 [env.v2-production] 與正式 Worker 名稱", function () {
  assert.ok(/\[env\.v2-production\]/.test(wranglerToml));
  var prod = sectionAfter("[env.v2-production]");
  // 只取到下一個頂層 [env.] 或檔尾前的本段開頭名稱列
  var nameMatch = prod.match(/^name\s*=\s*"([^"]+)"/m);
  assert.equal(nameMatch && nameMatch[1], "beauty-studio-api-v2-production");
});

test("v2-production 綁定既有 D1／R2 與非秘密 vars（同 v2-test）", function () {
  var prodStart = wranglerToml.indexOf("[env.v2-production]");
  var prod = wranglerToml.slice(prodStart);

  assert.ok(/STUDIO_NAME\s*=\s*"美業工作室 v2"/.test(prod));
  assert.ok(/TENANT_ID\s*=\s*"tenant_beauty_studio_default"/.test(prod));
  assert.ok(/LOCATION_ID\s*=\s*"location_main"/.test(prod));
  assert.ok(/STAFF_ID\s*=\s*"staff_owner"/.test(prod));
  assert.ok(/DATA_BACKEND\s*=\s*"d1"/.test(prod));

  assert.ok(/\[\[env\.v2-production\.d1_databases\]\]/.test(wranglerToml));
  assert.ok(/database_name\s*=\s*"beauty-studio-booking-v2"/.test(prod));
  assert.ok(
    /database_id\s*=\s*"58e5f639-221d-4b7e-bc74-27dc83664d43"/.test(prod)
  );
  assert.ok(/binding\s*=\s*"DB"/.test(prod));

  assert.ok(/\[\[env\.v2-production\.r2_buckets\]\]/.test(wranglerToml));
  assert.ok(/bucket_name\s*=\s*"beauty-studio-photos-v2"/.test(prod));
  assert.ok(/binding\s*=\s*"PHOTO_BUCKET"/.test(prod));
});

test("v2-production 設定不含 secrets；package.json 無 production deploy script", function () {
  assert.ok(!/secret|token|password|CHANNEL_|ACCESS_/i.test(wranglerToml));
  assert.ok(!/\.dev\.vars/.test(wranglerToml));
  assert.equal(packageJson.scripts.deploy, "wrangler deploy --env v2-test");
  assert.ok(
    !Object.keys(packageJson.scripts).some(function (k) {
      return /production/i.test(k) || /v2-production/i.test(packageJson.scripts[k]);
    }),
    "不得新增 production deploy npm script"
  );
  assert.equal(packageJson.devDependencies.wrangler, "3.114.17");
});
