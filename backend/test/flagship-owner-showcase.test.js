import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

var root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
var sourceHtml = readFileSync(join(root, "owner-showcase/index.html"), "utf8");
var deployedHtml = readFileSync(join(root, "docs/showcase/index.html"), "utf8");
var sourceCss = readFileSync(join(root, "owner-showcase/showcase.css"), "utf8");
var deployedCss = readFileSync(join(root, "docs/showcase/showcase.css"), "utf8");
var sourceJs = readFileSync(join(root, "owner-showcase/showcase.js"), "utf8");
var deployedJs = readFileSync(join(root, "docs/showcase/showcase.js"), "utf8");
var sourceCustomerCss = readFileSync(join(root, "owner-showcase/customer-flow.css"), "utf8");
var deployedCustomerCss = readFileSync(join(root, "docs/showcase/customer-flow.css"), "utf8");

test("旗艦展示主入口以業主工作台為主，客戶端僅為次要體驗", function () {
  assert.match(sourceHtml, /紋繡師御用工作台/);
  assert.doesNotMatch(sourceHtml, /唯讀展示|demo-badge/);
  assert.match(sourceHtml, /待人工審核/);
  assert.match(sourceHtml, /案件審核摘要/);
  assert.match(sourceHtml, /先看客戶使用導覽/);
  assert.match(sourceHtml, /href="\/flagship\/showcase\/customer"/);
  assert.match(sourceHtml, /客戶在 LINE 的使用流程/);
  assert.match(sourceHtml, /業主端：收到完整回答、照片與系統整理/);
});

test("公開業主展示完全唯讀，不載入 LIFF、API 或真實管理後台程式", function () {
  var all = sourceHtml + sourceJs;
  assert.doesNotMatch(all, /liff-init|owner\/js\/api|fetch\s*\(|XMLHttpRequest|\/api\//);
  assert.doesNotMatch(sourceHtml, /<form|<input|contenteditable/);
  assert.match(sourceHtml, /展示模式不會送出任何操作/);
  assert.match(sourceHtml, /不含真實客戶資料/);
});

test("Pages 提供旗艦業主展示固定入口，部署副本與來源一致", function () {
  var worker = readFileSync(join(root, "docs/_worker.js"), "utf8");
  assert.match(worker, /flagshipShowcaseEntry/);
  assert.match(worker, /flagshipCustomerEntry/);
  assert.match(worker, /\/showcase\//);
  assert.equal(deployedHtml, sourceHtml);
  assert.equal(deployedCss, sourceCss);
  assert.equal(deployedJs, sourceJs);
  assert.equal(deployedCustomerCss, sourceCustomerCss);
});
