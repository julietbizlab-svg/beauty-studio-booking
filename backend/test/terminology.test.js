import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

var repoRoot = join(fileURLToPath(new URL("../..", import.meta.url)));
var TEXT_EXTENSIONS = new Set([
  ".css", ".html", ".js", ".json", ".md", ".sql", ".toml", ".txt"
]);
var SCAN_DIRS = [
  "backend/migrations",
  "backend/src",
  "backend/test",
  "customer-ui",
  "docs",
  "owner-admin",
  "product-docs"
];
var forbiddenTitle = "\u7f8e\u5bb9\u5e2b";

function listTextFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(function (entry) {
    var path = join(dir, entry.name);
    if (entry.isDirectory()) return listTextFiles(path);
    return TEXT_EXTENSIONS.has(extname(entry.name).toLowerCase()) ? [path] : [];
  });
}

test("系統對外職稱一律使用「本工作室」", function () {
  var violations = SCAN_DIRS.flatMap(function (relativeDir) {
    return listTextFiles(join(repoRoot, relativeDir));
  }).filter(function (file) {
    return readFileSync(file, "utf8").includes(forbiddenTitle);
  });
  assert.deepEqual(violations, []);
});
